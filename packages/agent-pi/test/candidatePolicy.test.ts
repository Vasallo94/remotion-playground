import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { describe, it } from "node:test"
import {
  evaluateCandidatePolicy,
  inspectCandidateSource,
  validateCandidateManifest,
  type CandidateManifest,
} from "../src/candidatePolicy.js"

const sourcePath = "src/compositions/ClaudeCodeTutorial/scenes/custom/SafeMetricScene.tsx"
const validSource = `import { AbsoluteFill, useCurrentFrame } from "remotion"
export const SafeMetricScene = () => {
  const frame = useCurrentFrame()
  return <AbsoluteFill><div style={{ opacity: frame >= 0 ? 1 : 0 }}>Metric</div></AbsoluteFill>
}
`

function manifest(source = validSource): CandidateManifest {
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

function codes(source: string): Set<string> {
  return new Set(inspectCandidateSource(sourcePath, source).findings.map((finding) => finding.code))
}

describe("Tier 2 candidate manifest", () => {
  it("accepts one bounded candidate tied to an approved CP4 checkpoint", () => {
    const result = evaluateCandidatePolicy(manifest(), { [sourcePath]: validSource })
    assert.equal(result.valid, true, JSON.stringify(result.findings, null, 2))
    assert.equal(result.metrics.files, 1)
    assert.ok(result.metrics.astNodes > 0)
  })

  it("strictly rejects unknown manifest fields", () => {
    const candidate = { ...manifest(), command: "npm run build" }
    const result = validateCandidateManifest(candidate)
    assert.ok(result.findings.some((finding) => finding.code === "manifest.unknown-field"))
  })

  it("rejects traversal and every destination except the exact derived production file", () => {
    const candidate = manifest()
    candidate.sourceFiles[0] = {
      ...candidate.sourceFiles[0],
      path: "src/compositions/ClaudeCodeTutorial/scenes/custom/../Root.tsx",
    }
    const result = validateCandidateManifest(candidate)
    assert.ok(result.findings.some((finding) => finding.code === "manifest.destination"))
  })

  it("rejects oversized declarations and actual source bytes", () => {
    const declared = manifest()
    declared.sourceFiles[0] = { ...declared.sourceFiles[0], bytes: 32_001 }
    assert.ok(validateCandidateManifest(declared).findings.some((finding) => finding.code === "manifest.file-size"))

    const oversized = `${validSource}\n/*${"x".repeat(32_000)}*/`
    const bounded = manifest(oversized)
    bounded.sourceFiles[0].bytes = Buffer.byteLength(oversized)
    const result = evaluateCandidatePolicy(bounded, { [sourcePath]: oversized })
    assert.equal(result.valid, false)
    assert.ok(
      result.findings.some((finding) => finding.code === "manifest.file-size" || finding.code === "source.size"),
    )
  })

  it("rejects unknown dependencies and incomplete acceptance evidence", () => {
    const candidate = manifest()
    candidate.dependencies.push("node:fs")
    candidate.acceptanceTests = candidate.acceptanceTests.filter((test) => test.kind !== "still")
    const result = validateCandidateManifest(candidate)
    assert.ok(result.findings.some((finding) => finding.code === "manifest.dependency-denied"))
    assert.ok(result.findings.some((finding) => finding.code === "manifest.acceptance-missing"))
  })
})

describe("TypeScript AST candidate policy", () => {
  it("rejects forbidden imports, dynamic imports, require, eval, and Function constructors", () => {
    const findings = codes(`
      import fs from "node:fs"
      const a = import("./payload")
      const b = require("child_process")
      ;(0, eval)("code")
      new Function("return 1")
      export default function Candidate() { return null }
    `)
    assert.ok(findings.has("source.import-denied"))
    assert.ok(findings.has("source.dynamic-import"))
    assert.ok(findings.has("source.module-runtime"))
    assert.ok(findings.has("source.dynamic-execution"))
    assert.ok(findings.has("source.default-export"))
  })

  it("catches aliases, destructuring, computed access, and nested forbidden calls", () => {
    const findings = codes(`
      const math = Math
      const random = math["random"]
      const { now: clock } = Date
      const proc = globalThis["process"]
      const nested = () => random()
      nested(clock(), proc["env"])
    `)
    assert.ok(findings.has("source.nondeterminism"))
    assert.ok(findings.has("source.forbidden-global"))
  })

  it("resolves aliases through declarations that appear later and optional chains", () => {
    const findings = codes(`
      const random = math?.["random"]
      const math = Math
      const clock = Date?.["now"]
      clock()
      random()
    `)
    assert.ok(findings.has("source.nondeterminism"))
  })

  it("rejects namespace imports, indirect eval, global aliases, and nondeterministic constructors", () => {
    const findings = codes(`
      import * as R from "remotion"
      const run = eval
      const browser = globalThis
      const Ctor = Date
      const IndirectCtor = Array["constructor"]
      run("code")
      browser["window"]
      IndirectCtor("return 1")
      new Ctor()
    `)
    assert.ok(findings.has("source.import-binding"))
    assert.ok(findings.has("source.dynamic-execution"))
    assert.ok(findings.has("source.forbidden-global"))
    assert.ok(findings.has("source.nondeterminism"))
  })

  it("rejects re-exports and mutation through destructured top-level bindings", () => {
    const findings = codes(`
      export { readFile } from "node:fs"
      const { state } = props
      state.value = 1
      state.push(2)
    `)
    assert.ok(findings.has("source.export-denied"))
    assert.ok(findings.has("source.mutable-global"))
  })

  it("rejects network, process/environment, browser storage, and mutable globals", () => {
    const findings = codes(`
      let shared = 1
      fetch("https://example.test")
      process["env"].TOKEN
      localStorage.getItem("x")
      globalThis["state"] = shared
      new WebSocket("wss://example.test")
    `)
    assert.ok(findings.has("source.mutable-global"))
    assert.ok(findings.has("source.network"))
    assert.ok(findings.has("source.forbidden-global"))
    assert.ok(findings.has("source.url"))
  })

  it("rejects arbitrary HTML, style, URL, CSS motion, and unrestricted assets", () => {
    const findings = codes(`
      import { staticFile } from "remotion"
      const path = "images/picture.png"
      const classes = "animate-spin"
      export const BadScene = () => <iframe src="https://example.test" className={classes} style={{ transition: "all 1s", backgroundImage: "url(x)" }} />
      staticFile(path)
      staticFile("../secret.png")
    `)
    assert.ok(findings.has("source.html-tag"))
    assert.ok(findings.has("source.html-attribute"))
    assert.ok(findings.has("source.css-animation"))
    assert.ok(findings.has("source.style-property"))
    assert.ok(findings.has("source.asset-access"))
  })

  it("allows a frame-based scene to use a bounded static asset", () => {
    const findings = inspectCandidateSource(
      sourcePath,
      `import { Img, staticFile } from "remotion"
const asset = staticFile("images/diagram.png")
export const SafeMetricScene = () => <Img src={asset} />
`,
    )
    assert.equal(
      findings.findings.find((finding) => finding.code === "source.html-attribute"),
      undefined,
    )
    assert.equal(
      findings.findings.find((finding) => finding.code === "source.asset-access"),
      undefined,
    )
  })

  it("requires frame state whenever Remotion animation primitives are used", () => {
    const missing = codes(`
      import { interpolate } from "remotion"
      export const BadScene = () => <div style={{ opacity: interpolate(1, [0, 1], [0, 1]) }} />
    `)
    assert.ok(missing.has("source.frame-hook-required"))
    const valid = inspectCandidateSource(sourcePath, validSource)
    assert.equal(valid.findings.length, 0, JSON.stringify(valid.findings, null, 2))
  })

  it("rejects inherited source values instead of accepting a manifest/path mismatch", () => {
    const inherited = Object.create({ [sourcePath]: validSource }) as Record<string, string>
    const result = evaluateCandidatePolicy(manifest(), inherited)
    assert.equal(result.valid, false)
    assert.ok(result.findings.some((finding) => finding.code === "source.missing"))
  })

  it("returns stable codes, severities, and one-based source spans", () => {
    const result = inspectCandidateSource(sourcePath, "\nfetch('https://example.test')\n")
    const finding = result.findings.find((item) => item.code === "source.network")
    assert.ok(finding)
    assert.equal(finding.severity, "error")
    assert.equal(finding.path, sourcePath)
    assert.equal(finding.span?.start.line, 2)
    assert.ok((finding.span?.start.column ?? 0) >= 1)
  })
})
