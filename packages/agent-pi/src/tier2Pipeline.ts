import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { basename, dirname, join, relative } from "node:path"
import prettier from "prettier"
import type { CandidateManifest } from "./candidatePolicy.js"
import { evaluateCandidatePolicy } from "./candidatePolicy.js"
import type { ExecutableSceneCandidateDraft } from "./executableSceneCandidate.js"
import { PROJECT_ROOT } from "./paths.js"
import {
  cleanupQuarantineWorkspace,
  createNoShellProcessRunner,
  createQuarantineJob,
  createQuarantineWorkspace,
  runQuarantineVerification,
  type QuarantineCommand,
  type QuarantineResult,
} from "./quarantineVerifier.js"

const REGISTRY_PATH = "src/compositions/ClaudeCodeTutorial/customSceneRegistry.ts"
const TIMING_PATH = "src/shared/sceneTimingRegistry.ts"
const CATALOG_PATH = "src/shared/scene-catalog.json"

export interface Tier2CandidatePackage {
  schemaVersion: 1
  candidateManifest: CandidateManifest
  draft: ExecutableSceneCandidateDraft
  sourceFiles: Record<string, string>
  registryOutputs: Record<string, string>
  quarantineResult: QuarantineResult
  previewStills: Array<{ index: number; path: string; frameNumber: number; sha256: string }>
}

const hash = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex")

export async function formatExecutableSceneCandidateDraft(
  draft: ExecutableSceneCandidateDraft,
  root = PROJECT_ROOT,
): Promise<ExecutableSceneCandidateDraft> {
  const filepath = join(root, "src/compositions/ClaudeCodeTutorial/scenes/custom", `${draft.exportName}.tsx`)
  const config = (await prettier.resolveConfig(filepath)) ?? {}
  const source = await prettier.format(draft.source, { ...config, filepath })
  return { ...draft, source }
}

function declaredDependencies(source: string): string[] {
  const dependencies = new Set<string>()
  for (const match of source.matchAll(/(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g)) {
    const dependency = match[1]
    if (dependency && !dependency.startsWith(".")) dependencies.add(dependency)
  }
  return [...dependencies].sort()
}

function insertBefore(source: string, marker: string, addition: string, label: string): string {
  const index = source.indexOf(marker)
  if (index < 0) throw new Error(`Cannot update ${label}: insertion marker is missing`)
  return `${source.slice(0, index)}${addition}${source.slice(index)}`
}

export function buildCandidateManifest(input: {
  draft: ExecutableSceneCandidateDraft
  proposalId: string
  checkpointId: string
  checkpointVersion: number
  approvalDigest: string
}): CandidateManifest {
  const sourcePath = `src/compositions/ClaudeCodeTutorial/scenes/custom/${input.draft.exportName}.tsx`
  return {
    schemaVersion: 1,
    candidateId: `candidate.${input.draft.componentId}.${hash(input.draft.source).slice(0, 12)}`,
    capability: {
      proposalId: input.proposalId,
      checkpointId: input.checkpointId,
      checkpointVersion: input.checkpointVersion,
      approvalDigest: input.approvalDigest,
    },
    component: { id: input.draft.componentId, exportName: input.draft.exportName },
    sourceFiles: [
      { path: sourcePath, sha256: hash(input.draft.source), bytes: Buffer.byteLength(input.draft.source, "utf8") },
    ],
    registryChanges: [
      { target: "custom-scene-registry", path: REGISTRY_PATH, operation: "add", key: input.draft.componentId },
      { target: "scene-timing-registry", path: TIMING_PATH, operation: "add", key: input.draft.componentId },
      { target: "scene-catalog", path: CATALOG_PATH, operation: "add", key: input.draft.componentId },
    ],
    dependencies: declaredDependencies(input.draft.source),
    limits: { maxFiles: 1, maxFileBytes: 32_000, maxTotalBytes: 32_000, maxAstNodes: 4_000 },
    acceptanceTests: [
      { id: "unit-contract", kind: "unit", description: "Validates representative generic props" },
      { id: "candidate-typecheck", kind: "typecheck", description: "Type-checks the isolated candidate" },
      { id: "candidate-lint", kind: "lint", description: "Lints the isolated candidate" },
      { id: "candidate-bundle", kind: "bundle", description: "Bundles the candidate through the target registry" },
      { id: "representative-still", kind: "still", description: "Renders a representative candidate still" },
    ],
  }
}

export function buildCandidateRegistryOutputs(
  draft: ExecutableSceneCandidateDraft,
  root = PROJECT_ROOT,
): Record<string, string> {
  const registry = readFileSync(join(root, REGISTRY_PATH), "utf8")
  const timing = readFileSync(join(root, TIMING_PATH), "utf8")
  const catalog = JSON.parse(readFileSync(join(root, CATALOG_PATH), "utf8")) as {
    generatedAt: string
    scenes: { tutorial: { custom: Array<Record<string, unknown>> } }
  }
  if (registry.includes(`"${draft.componentId}"`) || timing.includes(`"${draft.componentId}"`)) {
    throw new Error(`Candidate component '${draft.componentId}' is already registered`)
  }
  if (catalog.scenes.tutorial.custom.some((entry) => entry.componentId === draft.componentId)) {
    throw new Error(`Candidate component '${draft.componentId}' already exists in the scene catalog`)
  }

  const importLine = `import { ${draft.exportName} } from "./scenes/custom/${draft.exportName}"\n`
  const nextRegistry = insertBefore(
    registry,
    "\nexport const customSceneRegistry",
    `\n${importLine}`,
    "custom scene registry",
  ).replace(/\n}\s*$/, `\n  "${draft.componentId}": ${draft.exportName},\n}\n`)
  const nextTiming = timing.replace(
    /\n}\n\nexport const DEFAULT_VISUAL_READY_MS/,
    `\n  "${draft.componentId}": { visualReadyMs: ${draft.visualReadyMs} },\n}\n\nexport const DEFAULT_VISUAL_READY_MS`,
  )
  if (nextTiming === timing) throw new Error("Cannot update scene timing registry")

  catalog.scenes.tutorial.custom.push({
    componentId: draft.componentId,
    composition: "ClaudeCodeTutorial",
    ...draft.catalog,
    propContract: draft.propContract,
  })
  catalog.scenes.tutorial.custom.sort((left, right) =>
    String(left.componentId).localeCompare(String(right.componentId)),
  )
  const nextCatalog = JSON.stringify(catalog, null, 2) + "\n"
  return { [REGISTRY_PATH]: nextRegistry, [TIMING_PATH]: nextTiming, [CATALOG_PATH]: nextCatalog }
}

function commandPlan(manifest: CandidateManifest): QuarantineCommand[] {
  const timeoutMs = 180_000
  const maxOutputBytes = 2 * 1024 * 1024
  const command = (
    stage: QuarantineCommand["stage"],
    executable: string,
    args: string[],
    inputPaths: string[],
    outputPaths: string[] = [],
    requireOutputs = false,
  ): QuarantineCommand => ({
    stage,
    executable,
    args,
    inputPaths,
    outputPaths,
    timeoutMs,
    maxOutputBytes,
    requireOutputs,
  })
  const sources = manifest.sourceFiles.map((file) => `./${file.path}`)
  return [
    command(
      "format",
      "prettier",
      ["--check", "--", ...sources],
      manifest.sourceFiles.map((file) => file.path),
    ),
    command("typecheck", "tsc", ["--noEmit", "--project", "tsconfig.json"], ["tsconfig.json"]),
    command(
      "lint",
      "eslint",
      ["--", ...sources],
      manifest.sourceFiles.map((file) => file.path),
    ),
    command(
      "bundle",
      "tsx",
      ["scripts/bundle-remotion.ts", "artifacts/bundle"],
      ["src/index.ts", "scripts/bundle-remotion.ts", "scripts/remotion-webpack-override.ts"],
      ["artifacts/bundle"],
      true,
    ),
    command(
      "still",
      "tsx",
      ["scripts/render-scene-stills.ts", "candidate-config.json", "artifacts/stills"],
      ["scripts/render-scene-stills.ts", "candidate-config.json"],
      ["artifacts/stills"],
      true,
    ),
  ]
}

function prepareWorkspace(
  workspaceRoot: string,
  manifest: CandidateManifest,
  draft: ExecutableSceneCandidateDraft,
  registryOutputs: Record<string, string>,
  root: string,
): void {
  for (const directory of ["src", "packages/scene-contracts"]) {
    cpSync(join(root, directory), join(workspaceRoot, directory), { recursive: true, dereference: false })
  }
  mkdirSync(join(workspaceRoot, "scripts"), { recursive: true })
  for (const script of ["bundle-remotion.ts", "render-scene-stills.ts", "remotion-webpack-override.ts"]) {
    copyFileSync(join(root, "scripts", script), join(workspaceRoot, "scripts", script))
  }
  for (const file of [
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "tsconfig.json",
    "eslint.config.mjs",
    "remotion.config.ts",
  ]) {
    copyFileSync(join(root, file), join(workspaceRoot, file))
  }
  const sourceModules = join(root, "node_modules")
  const targetModules = join(workspaceRoot, "node_modules")
  if (process.platform === "darwin") execFileSync("/bin/cp", ["-cR", sourceModules, targetModules])
  else cpSync(sourceModules, targetModules, { recursive: true, dereference: false })
  for (const source of manifest.sourceFiles) {
    const target = join(workspaceRoot, source.path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, draft.source, "utf8")
  }
  for (const [path, content] of Object.entries(registryOutputs)) {
    const target = join(workspaceRoot, path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content, "utf8")
  }
  writeFileSync(
    join(workspaceRoot, "candidate-config.json"),
    JSON.stringify(
      {
        id: `candidate-${draft.componentId}`,
        title: "Candidate scene verification",
        description: "Disposable candidate verification",
        fps: 30,
        width: 1280,
        height: 720,
        composition: "ClaudeCodeTutorial",
        theme: "betelgeuse",
        watermark: false,
        transition: null,
        voiceover: null,
        soundDesign: { enabled: false, musicBed: null, sfx: [] },
        scenes: [
          {
            type: "custom",
            componentId: draft.componentId,
            durationInSeconds: Math.max(3, Math.min(12, draft.catalog.durationRange[0])),
            props: draft.exampleProps,
          },
        ],
      },
      null,
      2,
    ) + "\n",
    "utf8",
  )
}

export async function verifyExecutableSceneCandidate(input: {
  manifest: CandidateManifest
  draft: ExecutableSceneCandidateDraft
  registryOutputs: Record<string, string>
  root?: string
}): Promise<{ result: QuarantineResult; previewStills: Tier2CandidatePackage["previewStills"] }> {
  const root = input.root ?? PROJECT_ROOT
  const sourceFiles = Object.fromEntries(input.manifest.sourceFiles.map((file) => [file.path, input.draft.source]))
  const sourceLines = input.draft.source.split(/\r?\n/).length
  if (sourceLines > 350) {
    throw new Error(
      `Candidate source has ${sourceLines} lines; maximum is 350. Rewrite from scratch as a passive renderer of precomputed timeline events and remove internal graph simulation logic.`,
    )
  }
  const policy = evaluateCandidatePolicy(input.manifest, sourceFiles)
  if (!policy.valid) {
    const findings = policy.findings
      .map(
        (item) =>
          `${item.code}: ${item.message}${item.span ? ` at ${item.span.start.line}:${item.span.start.column}` : ""}`,
      )
      .join("; ")
    const computedGuidance = policy.findings.some((item) => item.code === "source.computed-access")
      ? ". Replace every variable bracket access with find/findIndex/filter/map or an explicit switch; literal tuple indexes are allowed."
      : ""
    const sizeGuidance = policy.findings.some((item) => item.code === "source.ast-size")
      ? ". Rewrite from scratch as a passive renderer of precomputed timeline events, remove graph traversal/simulation logic, and stay below 350 source lines."
      : ""
    throw new Error(`Candidate static policy rejected source: ${findings}${computedGuidance}${sizeGuidance}`)
  }
  const workspace = createQuarantineWorkspace()
  try {
    prepareWorkspace(workspace.root, input.manifest, input.draft, input.registryOutputs, root)
    const job = createQuarantineJob({
      workspace,
      candidateManifest: input.manifest,
      verificationHarness: {
        configPath: "candidate-config.json",
        tsconfigPath: "tsconfig.json",
        stillScriptPath: "scripts/render-scene-stills.ts",
        expectedSceneCount: 1,
      },
      commandPlan: commandPlan(input.manifest),
      limits: { stageTimeoutMs: 180_000 },
    })
    const result = await runQuarantineVerification(job, createNoShellProcessRunner())
    if (!result.verdict.promotable) {
      const details = Object.values(result.reports)
        .filter((report) => report.status === "failed")
        .map(
          (report) =>
            `${report.stage}: ${[...report.errors, report.stdout, report.stderr].filter(Boolean).join(" | ").slice(0, 4000)}`,
        )
      throw new Error(`Candidate quarantine failed: ${[...result.verdict.failures, ...details].join("; ")}`)
    }
    const destination = join(root, ".generated/claqueta-pi/candidates", input.manifest.candidateId)
    mkdirSync(destination, { recursive: true })
    const stillManifest = result.reports.still.stillManifest
    const previewStills = (stillManifest?.scenes ?? []).map((still) => {
      const source = join(workspace.root, still.path)
      const target = join(destination, basename(still.path))
      copyFileSync(source, target)
      return {
        index: still.index,
        path: relative(root, target).split("\\").join("/"),
        frameNumber: still.frameNumber,
        sha256: hash(readFileSync(target)),
      }
    })
    return { result, previewStills }
  } finally {
    if (existsSync(workspace.root)) cleanupQuarantineWorkspace(workspace)
  }
}
