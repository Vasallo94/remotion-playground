import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, it } from "node:test"
import {
  cleanupQuarantineWorkspace,
  confinedQuarantinePath,
  createNoShellProcessRunner,
  createQuarantineJob,
  createQuarantineWorkspace,
  parseStillManifest,
  runQuarantineVerification,
  type ProcessRunResult,
  type QuarantineWorkspace,
} from "../src/quarantineVerifier.js"
import type { CandidateManifest } from "../src/candidatePolicy.js"

const workspaces: QuarantineWorkspace[] = []
const sourcePath = "src/compositions/ClaudeCodeTutorial/scenes/custom/SafeMetricScene.tsx"
const source = `import { AbsoluteFill, useCurrentFrame } from "remotion"
export const SafeMetricScene = () => {
  const frame = useCurrentFrame()
  return <AbsoluteFill><div style={{ opacity: frame >= 0 ? 1 : 0 }}>Metric</div></AbsoluteFill>
}
`

const harness = {
  configPath: "candidate-config.json",
  tsconfigPath: "tsconfig.json",
  stillScriptPath: "scripts/render-scene-stills.ts",
  expectedSceneCount: 1,
}

afterEach(() => {
  while (workspaces.length > 0) {
    const workspace = workspaces.pop()!
    try {
      cleanupQuarantineWorkspace(workspace)
    } catch {
      // The test already exercised ownership or cleanup behavior.
    }
  }
})

function workspace(): QuarantineWorkspace {
  const value = createQuarantineWorkspace()
  workspaces.push(value)
  return value
}

function candidateManifest(): CandidateManifest {
  return {
    schemaVersion: 1,
    candidateId: "candidate.safe-metric.1",
    capability: {
      proposalId: "proposal-safe-metric",
      checkpointId: "cp4-safe-metric",
      checkpointVersion: 1,
      approvalDigest: "a".repeat(64),
    },
    component: { id: "safe-metric", exportName: "SafeMetricScene" },
    sourceFiles: [
      {
        path: sourcePath,
        sha256: createHash("sha256").update(source).digest("hex"),
        bytes: Buffer.byteLength(source),
      },
    ],
    registryChanges: [
      {
        target: "custom-scene-registry",
        path: "src/compositions/ClaudeCodeTutorial/customSceneRegistry.ts",
        operation: "add",
        key: "safe-metric",
      },
      {
        target: "scene-timing-registry",
        path: "src/shared/sceneTimingRegistry.ts",
        operation: "add",
        key: "safe-metric",
      },
      { target: "scene-catalog", path: "src/shared/scene-catalog.json", operation: "add", key: "safe-metric" },
    ],
    dependencies: ["remotion"],
    limits: { maxFiles: 1, maxFileBytes: 32_000, maxTotalBytes: 32_000, maxAstNodes: 4_000 },
    acceptanceTests: [
      { id: "unit-contract", kind: "unit", description: "Validates the generic prop contract" },
      { id: "candidate-typecheck", kind: "typecheck", description: "Type-checks the isolated candidate" },
      { id: "candidate-lint", kind: "lint", description: "Lints the isolated candidate" },
      { id: "candidate-bundle", kind: "bundle", description: "Bundles the isolated candidate" },
      { id: "representative-still", kind: "still", description: "Renders a representative still" },
    ],
  }
}

function prepareWorkspace(root: string): void {
  mkdirSync(join(root, "src/compositions/ClaudeCodeTutorial/scenes/custom"), { recursive: true })
  mkdirSync(join(root, "scripts"), { recursive: true })
  writeFileSync(join(root, sourcePath), source, "utf8")
  for (const path of [harness.configPath, harness.tsconfigPath, harness.stillScriptPath]) {
    mkdirSync(join(root, path, ".."), { recursive: true })
    writeFileSync(join(root, path), "fixture\n", "utf8")
  }
}

function preparedJob() {
  const root = workspace()
  prepareWorkspace(root.root)
  return {
    root,
    job: createQuarantineJob({ candidateManifest: candidateManifest(), verificationHarness: harness, workspace: root }),
  }
}

function passed(): ProcessRunResult {
  return { exitCode: 0, signal: null, stdout: "", stderr: "", durationMs: 1, timedOut: false, outputCapped: false }
}

it("rejects traversal and symlink paths before a command can run", () => {
  const root = workspace()
  assert.throws(() => confinedQuarantinePath(root, "../outside.txt"), /traversal|escapes the quarantine root/)
  assert.throws(() => confinedQuarantinePath(root, join(root.root, "inside.txt")), /relative path/)
  mkdirSync(join(root.root, "linked"), { recursive: true })
  writeFileSync(join(root.root, "linked", "file.txt"), "fixture", "utf8")
  symlinkSync(join(root.root, "linked"), join(root.root, "escape-link"))
  assert.throws(() => confinedQuarantinePath(root, "escape-link/file.txt"), /symbolic link/)
})

it("fails closed when candidate policy rejects the sealed source", () => {
  const root = workspace()
  prepareWorkspace(root.root)
  writeFileSync(
    join(root.root, sourcePath),
    "import fs from 'node:fs'\nexport const SafeMetricScene = () => null\n",
    "utf8",
  )
  assert.throws(
    () =>
      createQuarantineJob({ candidateManifest: candidateManifest(), verificationHarness: harness, workspace: root }),
    /source\.import-denied|source\.digest|source\.frame-hook-required/,
  )
})

it("rejects source tampering before the first child process", async () => {
  const { root, job } = preparedJob()
  writeFileSync(join(root.root, sourcePath), `${source}\n// tampered`, "utf8")
  let called = false
  const result = await runQuarantineVerification(job, async () => {
    called = true
    return passed()
  })
  assert.equal(called, false)
  assert.equal(result.verdict.promotable, false)
  assert.match(result.verdict.failures.join("\n"), /source\.size|source\.digest/)
})

it("rejects manifest tampering and does not trust a parallel manifest contract", async () => {
  const { root, job } = preparedJob()
  writeFileSync(join(root.root, job.candidateManifestReference.path), "{}\n", "utf8")
  let called = false
  const result = await runQuarantineVerification(job, async () => {
    called = true
    return passed()
  })
  assert.equal(called, false)
  assert.equal(result.verdict.promotable, false)
  assert.match(result.verdict.failures.join("\n"), /manifest hash|contents/)
})

it("revalidates the same policy identity before and after every stage", async () => {
  const { root, job } = preparedJob()
  const calls: string[] = []
  const result = await runQuarantineVerification(job, async (spec) => {
    calls.push(spec.args.join(" "))
    if (calls.length === 1) writeFileSync(join(root.root, sourcePath), "tampered during format", "utf8")
    return passed()
  })
  assert.equal(calls.length, 1)
  assert.equal(result.reports.format.status, "failed")
  assert.equal(result.reports.typecheck.status, "skipped")
  assert.match(result.reports.format.errors.join("\n"), /sealed source|source\.size|source\.digest/)
})

it("reports timeout and short-circuits later stages", async () => {
  const { job } = preparedJob()
  const calls: string[] = []
  const result = await runQuarantineVerification(job, async (spec) => {
    calls.push(spec.args.join(" "))
    return { ...passed(), exitCode: null, timedOut: true, durationMs: spec.timeoutMs }
  })
  assert.equal(result.verdict.promotable, false)
  assert.equal(result.reports.format.status, "failed")
  assert.equal(result.reports.format.timedOut, true)
  assert.equal(result.reports.typecheck.status, "skipped")
  assert.equal(calls.length, 1)
})

it("fails a stage when the injected runner reports an output cap", async () => {
  const { job } = preparedJob()
  const result = await runQuarantineVerification(job, async () => ({ ...passed(), outputCapped: true }))
  assert.equal(result.reports.format.status, "failed")
  assert.match(result.reports.format.errors.join("\n"), /output exceeded its cap/)
  assert.equal(result.reports.typecheck.status, "skipped")
})

it("rejects malformed still manifests without running a real renderer", () => {
  const root = workspace()
  assert.throws(
    () => parseStillManifest(root, '{"scenes":[{"index":0,"path":"missing.png","frameNumber":1}]}'),
    /does not exist/,
  )
  assert.throws(() => parseStillManifest(root, "not-json"), /valid JSON/)
  writeFileSync(join(root.root, "same.png"), "png fixture", "utf8")
  assert.throws(
    () =>
      parseStillManifest(
        root,
        '{"scenes":[{"index":0,"path":"same.png","frameNumber":1},{"index":1,"path":"same.png","frameNumber":2}]}',
      ),
    /duplicate path/,
  )
})

it("passes metacharacters literally and does not inherit ambient secrets", async () => {
  const root = workspace()
  const runner = createNoShellProcessRunner()
  process.env.CLAQUETA_TEST_AMBIENT_SECRET = "must-not-leak"
  const marker = "$(touch should-not-exist)"
  try {
    const result = await runner({
      executable: process.execPath,
      args: [
        "-e",
        'process.stdout.write(`${process.argv[1]}:${process.env.CLAQUETA_TEST_AMBIENT_SECRET ?? "absent"}`)',
        marker,
      ],
      cwd: root.root,
      timeoutMs: 2_000,
      maxOutputBytes: 1_024,
    })
    assert.equal(result.exitCode, 0)
    assert.equal(result.stdout, `${marker}:absent`)
    assert.equal(existsSync(join(root.root, "should-not-exist")), false)
  } finally {
    delete process.env.CLAQUETA_TEST_AMBIENT_SECRET
  }
})

it("enforces the combined output cap in the no-shell runner", async () => {
  const root = workspace()
  const result = await createNoShellProcessRunner()({
    executable: process.execPath,
    args: ["-e", 'process.stdout.write("x".repeat(4096));process.stderr.write("y".repeat(4096))'],
    cwd: root.root,
    timeoutMs: 2_000,
    maxOutputBytes: 64,
  })
  assert.equal(result.outputCapped, true)
  assert.ok(Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr) <= 64)
})

it("produces structured evidence for every successful staged verification", async () => {
  const { job } = preparedJob()
  const result = await runQuarantineVerification(job, async (spec) => {
    const stage = spec.args.includes("prettier")
      ? "format"
      : spec.args.includes("tsc")
        ? "typecheck"
        : spec.args.includes("eslint")
          ? "lint"
          : spec.args.includes("remotion")
            ? "bundle"
            : "still"
    if (stage === "bundle") {
      mkdirSync(join(spec.cwd, "artifacts/bundle"), { recursive: true })
      writeFileSync(join(spec.cwd, "artifacts/bundle/bundle.js"), "bundle fixture", "utf8")
    }
    if (stage === "still") {
      mkdirSync(join(spec.cwd, "artifacts/stills"), { recursive: true })
      writeFileSync(join(spec.cwd, "artifacts/stills/scene-0.png"), "png fixture", "utf8")
      return {
        ...passed(),
        stdout: JSON.stringify({ scenes: [{ index: 0, path: "artifacts/stills/scene-0.png", frameNumber: 4 }] }),
      }
    }
    return passed()
  })
  assert.equal(result.verdict.promotable, true)
  assert.deepEqual(
    Object.values(result.reports).map((report) => report.status),
    ["passed", "passed", "passed", "passed", "passed"],
  )
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "bundle"))
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "still"))
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "report"))
})

it("rejects stale stage outputs rather than trusting pre-existing evidence", async () => {
  const { root, job } = preparedJob()
  mkdirSync(join(root.root, "artifacts/bundle"), { recursive: true })
  writeFileSync(join(root.root, "artifacts/bundle/stale.js"), "stale", "utf8")
  let calls = 0
  const result = await runQuarantineVerification(job, async () => {
    calls += 1
    return passed()
  })
  assert.equal(calls, 3)
  assert.equal(result.reports.bundle.status, "skipped")
  assert.match(result.reports.bundle.errors.join("\n"), /existed before/)
  assert.equal(result.reports.still.status, "skipped")
})

it("rejects structurally forged jobs even when they reuse an owned workspace", async () => {
  const { job } = preparedJob()
  await assert.rejects(() => runQuarantineVerification({ ...job }, async () => passed()), /not created by this process/)
})

it("makes cleanup ownership explicit and does not accept a second owner", () => {
  const root = workspace()
  cleanupQuarantineWorkspace(root)
  workspaces.splice(workspaces.indexOf(root), 1)
  assert.throws(() => cleanupQuarantineWorkspace(root), /not owned by this process/)
})
