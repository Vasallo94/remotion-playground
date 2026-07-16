import { spawn } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { evaluateCandidatePolicy, type CandidateManifest } from "./candidatePolicy.js"
import { cleanupTestDirectory, createTestTemporaryDirectory } from "./testCleanup.js"

export const QUARANTINE_SCHEMA_VERSION = 1 as const

export type VerificationStage = "format" | "typecheck" | "lint" | "bundle" | "still"
export type StageStatus = "passed" | "failed" | "skipped"

export interface QuarantineLimits {
  stageTimeoutMs: number
  maxOutputBytes: number
  maxArtifactBytes: number
  maxCandidateFileBytes: number
}

/** Parent-owned files and options used to verify the authenticated candidate. */
export interface QuarantineVerificationHarness {
  configPath: string
  tsconfigPath: string
  stillScriptPath: string
  expectedSceneCount?: number
}

export interface CandidateManifestReference {
  path: string
  sha256: string
}

export interface QuarantineHarnessReference {
  path: string
  sizeBytes: number
  sha256: string
}

export interface QuarantineWorkspace {
  root: string
  ownerToken: string
  createdAt: string
}

export interface QuarantineCommand {
  stage: VerificationStage
  executable: string
  args: readonly string[]
  inputPaths: readonly string[]
  outputPaths: readonly string[]
  timeoutMs: number
  maxOutputBytes: number
  requireOutputs: boolean
}

export interface QuarantineJob {
  schemaVersion: typeof QUARANTINE_SCHEMA_VERSION
  id: string
  workspace: QuarantineWorkspace
  /** The exact CandidateManifest authenticated by candidatePolicy. */
  candidateManifest: CandidateManifest
  candidateManifestReference: CandidateManifestReference
  verificationHarness: QuarantineVerificationHarness
  verificationHarnessFiles: readonly QuarantineHarnessReference[]
  commandPlan: readonly QuarantineCommand[]
  limits: QuarantineLimits
}

export interface ProcessRunSpec {
  executable: string
  args: readonly string[]
  cwd: string
  timeoutMs: number
  maxOutputBytes: number
  env?: Readonly<Record<string, string | undefined>>
}

export interface ProcessRunResult {
  exitCode: number | null
  signal: string | null
  stdout: string
  stderr: string
  durationMs: number
  timedOut: boolean
  outputCapped: boolean
}

export type ProcessRunner = (spec: ProcessRunSpec) => Promise<ProcessRunResult>

export interface QuarantineArtifact {
  kind: "candidate-manifest" | "bundle" | "still" | "report" | "stage-output"
  path: string
  sizeBytes: number
  sha256: string
}

export interface StillManifestEntry {
  index: number
  path: string
  frameNumber: number
}

export interface StillManifest {
  scenes: readonly StillManifestEntry[]
}

export interface StageReport {
  stage: VerificationStage
  status: StageStatus
  exitCode: number | null
  timedOut: boolean
  outputCapped: boolean
  durationMs: number
  stdout: string
  stderr: string
  artifacts: readonly QuarantineArtifact[]
  errors: readonly string[]
  stillManifest?: StillManifest
}

export interface QuarantineVerdict {
  promotable: boolean
  failures: readonly string[]
}

export interface QuarantineResult {
  schemaVersion: typeof QUARANTINE_SCHEMA_VERSION
  jobId: string
  candidateManifestId: string
  completedAt: string
  reports: Readonly<Record<VerificationStage, StageReport>>
  artifacts: readonly QuarantineArtifact[]
  verdict: QuarantineVerdict
}

const DEFAULT_LIMITS: QuarantineLimits = {
  stageTimeoutMs: 120_000,
  maxOutputBytes: 2 * 1024 * 1024,
  maxArtifactBytes: 50 * 1024 * 1024,
  maxCandidateFileBytes: 10 * 1024 * 1024,
}
const STAGES: readonly VerificationStage[] = ["format", "typecheck", "lint", "bundle", "still"]
const registeredWorkspaces = new Map<string, string>()
const registeredJobs = new WeakSet<QuarantineJob>()

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
  }
  return value
}

function isSubpath(parent: string, candidate: string): boolean {
  const pathRelative = relative(parent, candidate)
  return pathRelative === "" || (!pathRelative.startsWith("..") && !isAbsolute(pathRelative))
}

function toPosix(value: string): string {
  return value.split(sep).join("/")
}

function assertWorkspaceRoot(workspace: QuarantineWorkspace): string {
  const root = resolve(workspace.root)
  const ownerToken = registeredWorkspaces.get(root)
  if (!ownerToken || ownerToken !== workspace.ownerToken)
    throw new Error("Quarantine workspace is not owned by this process")
  if (!existsSync(root) || lstatSync(root).isSymbolicLink() || !statSync(root).isDirectory())
    throw new Error("Quarantine workspace must be an existing non-symbolic-link directory")
  return root
}

function assertNoSymlinkComponents(root: string, target: string): void {
  const targetRelative = relative(root, target)
  const components = targetRelative ? targetRelative.split(sep) : []
  let current = root
  for (const component of components) {
    current = join(current, component)
    try {
      if (lstatSync(current).isSymbolicLink())
        throw new Error(`Path contains a symbolic link: ${toPosix(relative(root, current))}`)
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Path contains a symbolic link:")) throw error
      if ((error as NodeJS.ErrnoException).code === "ENOENT" || (error as NodeJS.ErrnoException).code === "ENOTDIR")
        break
      throw error
    }
  }
}

export function confinedQuarantinePath(workspace: QuarantineWorkspace, input: string, label = "path"): string {
  const root = assertWorkspaceRoot(workspace)
  if (!input || input.includes("\0") || isAbsolute(input))
    throw new Error(`${label} must be a relative path beneath the quarantine root`)
  if (input.replace(/\\/g, "/").split("/").includes("..")) throw new Error(`${label} contains traversal: ${input}`)
  const target = resolve(root, input)
  if (!isSubpath(root, target)) throw new Error(`${label} escapes the quarantine root: ${input}`)
  assertNoSymlinkComponents(root, target)
  return target
}

function assertSafeCommandArgument(root: string, argument: string): void {
  if (argument.includes("\0") || isAbsolute(argument))
    throw new Error("Command arguments must not contain absolute paths")
  if (argument.replace(/\\/g, "/").split("/").includes(".."))
    throw new Error("Command arguments must not contain traversal")
  if (argument.replace(/\\/g, "/").startsWith("./"))
    confinedQuarantinePath(
      { root, ownerToken: registeredWorkspaces.get(root)!, createdAt: "" },
      argument,
      "command argument",
    )
}

function assertCommandPlan(
  workspace: QuarantineWorkspace,
  plan: readonly QuarantineCommand[],
  limits: QuarantineLimits,
): void {
  const root = assertWorkspaceRoot(workspace)
  if (plan.length !== STAGES.length || new Set(plan.map((command) => command.stage)).size !== STAGES.length)
    throw new Error("Command plan must contain exactly one command for each verification stage")
  for (const command of plan) {
    if (!command.executable || command.executable.includes("/"))
      throw new Error("Command executable must be a binary name")
    if (!Number.isInteger(command.timeoutMs) || command.timeoutMs <= 0 || command.timeoutMs > limits.stageTimeoutMs)
      throw new Error(`Invalid timeout for ${command.stage}`)
    if (
      !Number.isInteger(command.maxOutputBytes) ||
      command.maxOutputBytes <= 0 ||
      command.maxOutputBytes > limits.maxOutputBytes
    )
      throw new Error(`Invalid output cap for ${command.stage}`)
    for (const argument of command.args) assertSafeCommandArgument(root, argument)
    for (const input of command.inputPaths) confinedQuarantinePath(workspace, input, `${command.stage} input`)
    for (const output of command.outputPaths) confinedQuarantinePath(workspace, output, `${command.stage} output`)
  }
}

function validateLimits(limits: QuarantineLimits): void {
  for (const [name, value] of Object.entries(limits))
    if (!Number.isInteger(value) || value <= 0) throw new Error(`Invalid quarantine limit: ${name}`)
}

function hashFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex")
}

function artifactForPath(
  workspace: QuarantineWorkspace,
  path: string,
  kind: QuarantineArtifact["kind"],
  maxBytes: number,
): QuarantineArtifact {
  const root = assertWorkspaceRoot(workspace)
  const target = confinedQuarantinePath(workspace, path, "artifact")
  const stat = lstatSync(target)
  if (!stat.isFile()) throw new Error(`Artifact is not a regular file: ${toPosix(relative(root, target))}`)
  if (stat.size > maxBytes) throw new Error(`Artifact exceeds size cap: ${toPosix(relative(root, target))}`)
  return { kind, path: toPosix(relative(root, target)), sizeBytes: stat.size, sha256: hashFile(target) }
}

function collectArtifacts(
  workspace: QuarantineWorkspace,
  outputPaths: readonly string[],
  kind: QuarantineArtifact["kind"],
  maxBytes: number,
): QuarantineArtifact[] {
  const artifacts: QuarantineArtifact[] = []
  const visited = new Set<string>()
  let totalBytes = 0
  const visit = (path: string): void => {
    const root = assertWorkspaceRoot(workspace)
    const target = confinedQuarantinePath(workspace, path, "stage output")
    const stat = lstatSync(target)
    if (stat.isSymbolicLink()) throw new Error(`Stage output is a symbolic link: ${path}`)
    if (stat.isFile()) {
      const artifact = artifactForPath(workspace, path, kind, maxBytes)
      if (visited.has(artifact.path)) return
      visited.add(artifact.path)
      totalBytes += artifact.sizeBytes
      if (totalBytes > maxBytes) throw new Error(`Stage artifacts exceed aggregate size cap: ${maxBytes}`)
      artifacts.push(artifact)
      return
    }
    if (!stat.isDirectory()) throw new Error(`Stage output is not a file or directory: ${path}`)
    for (const entry of readdirSync(target, { withFileTypes: true }))
      visit(toPosix(relative(root, join(target, entry.name))))
  }
  for (const output of outputPaths) {
    confinedQuarantinePath(workspace, output, "stage output")
    if (existsSync(join(assertWorkspaceRoot(workspace), output))) visit(output)
  }
  return artifacts
}

function manifestReference(workspace: QuarantineWorkspace, path: string): CandidateManifestReference {
  return { path, sha256: hashFile(confinedQuarantinePath(workspace, path, "candidate manifest")) }
}

function cloneManifest(manifest: CandidateManifest): CandidateManifest {
  return JSON.parse(JSON.stringify(manifest)) as CandidateManifest
}

function sourceFilesFromWorkspace(
  workspace: QuarantineWorkspace,
  manifest: CandidateManifest,
  maxBytes: number,
): Record<string, string> {
  const sources: Record<string, string> = Object.create(null) as Record<string, string>
  for (const file of manifest.sourceFiles) {
    const target = confinedQuarantinePath(workspace, file.path, "candidate source")
    if (!existsSync(target)) throw new Error(`Candidate source does not exist: ${file.path}`)
    const stat = lstatSync(target)
    if (!stat.isFile()) throw new Error(`Candidate source is not a regular file: ${file.path}`)
    if (stat.size > maxBytes) throw new Error(`Candidate source exceeds size cap: ${file.path}`)
    sources[file.path] = readFileSync(target, "utf8")
  }
  return sources
}

function policyErrors(report: ReturnType<typeof evaluateCandidatePolicy>): string[] {
  return report.findings
    .filter((finding) => finding.severity === "error")
    .map((finding) => `${finding.code}: ${finding.message}${finding.path ? ` (${finding.path})` : ""}`)
}

function sameManifest(left: CandidateManifest, right: CandidateManifest): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function validateHarness(workspace: QuarantineWorkspace, harness: QuarantineVerificationHarness): void {
  for (const [name, path] of Object.entries(harness)) {
    if (name === "expectedSceneCount") continue
    if (typeof path !== "string" || !path) throw new Error(`Verification harness ${name} is required`)
    const absolute = confinedQuarantinePath(workspace, path, `verification harness ${name}`)
    if (!existsSync(absolute) || !lstatSync(absolute).isFile())
      throw new Error(`Verification harness ${name} is not a regular file: ${path}`)
  }
  if (
    harness.expectedSceneCount !== undefined &&
    (!Number.isInteger(harness.expectedSceneCount) || harness.expectedSceneCount < 0)
  )
    throw new Error("Verification harness expectedSceneCount must be a non-negative integer")
}

function sealHarnessFiles(
  workspace: QuarantineWorkspace,
  harness: QuarantineVerificationHarness,
): QuarantineHarnessReference[] {
  const paths = [harness.configPath, harness.tsconfigPath, harness.stillScriptPath]
  return paths.map((path) => {
    const absolute = confinedQuarantinePath(workspace, path, "verification harness")
    const stat = lstatSync(absolute)
    return { path, sizeBytes: stat.size, sha256: hashFile(absolute) }
  })
}

function validateHarnessIdentity(
  workspace: QuarantineWorkspace,
  references: readonly QuarantineHarnessReference[],
): string[] {
  const errors: string[] = []
  for (const reference of references) {
    try {
      const absolute = confinedQuarantinePath(workspace, reference.path, "verification harness")
      if (!existsSync(absolute)) {
        errors.push(`Verification harness file does not exist: ${reference.path}`)
        continue
      }
      const stat = lstatSync(absolute)
      if (!stat.isFile()) {
        errors.push(`Verification harness file is not a regular file: ${reference.path}`)
        continue
      }
      if (stat.size !== reference.sizeBytes || hashFile(absolute) !== reference.sha256)
        errors.push(`Verification harness file changed: ${reference.path}`)
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
  }
  return errors
}

/** Re-authenticates the candidate manifest and reads its source bytes from the sealed workspace. */
function evaluateSealedCandidate(
  workspace: QuarantineWorkspace,
  manifest: CandidateManifest,
  reference: CandidateManifestReference,
  limits: QuarantineLimits,
): { report?: ReturnType<typeof evaluateCandidatePolicy>; errors: string[] } {
  const errors: string[] = []
  let manifestPath: string
  try {
    manifestPath = confinedQuarantinePath(workspace, reference.path, "candidate manifest")
  } catch (error) {
    return { errors: [error instanceof Error ? error.message : String(error)] }
  }
  if (!existsSync(manifestPath)) return { errors: [`Candidate manifest does not exist: ${reference.path}`] }
  if (hashFile(manifestPath) !== reference.sha256)
    errors.push("Candidate manifest hash does not match its sealed reference")
  let diskManifest: unknown
  try {
    diskManifest = JSON.parse(readFileSync(manifestPath, "utf8"))
  } catch {
    return { errors: [...errors, "Candidate manifest is not valid JSON"] }
  }
  if (
    !diskManifest ||
    typeof diskManifest !== "object" ||
    Array.isArray(diskManifest) ||
    !sameManifest(diskManifest as CandidateManifest, manifest)
  )
    errors.push("Candidate manifest contents do not match the authenticated manifest")
  let sources: Record<string, string>
  try {
    sources = sourceFilesFromWorkspace(workspace, manifest, limits.maxCandidateFileBytes)
  } catch (error) {
    return { errors: [...errors, error instanceof Error ? error.message : String(error)] }
  }
  const report = evaluateCandidatePolicy(manifest, sources)
  errors.push(...policyErrors(report))
  return errors.length === 0 && report.valid ? { report, errors } : { report, errors }
}

export function parseStillManifest(
  workspace: QuarantineWorkspace,
  output: string,
  expectedSceneCount?: number,
  maxArtifactBytes = DEFAULT_LIMITS.maxArtifactBytes,
): StillManifest {
  let raw: unknown
  try {
    raw = JSON.parse(output.trim())
  } catch {
    throw new Error("Still renderer did not return valid JSON")
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || !Array.isArray((raw as Record<string, unknown>).scenes))
    throw new Error("Still manifest must contain a scenes array")
  const rawScenes = (raw as Record<string, unknown>).scenes as unknown[]
  if (rawScenes.length === 0) throw new Error("Still manifest scenes must not be empty")
  const scenes: StillManifestEntry[] = []
  const seen = new Set<number>()
  const seenPaths = new Set<string>()
  for (const [position, value] of rawScenes.entries()) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error(`Still manifest scenes[${position}] must be an object`)
    const scene = value as Record<string, unknown>
    if (!Number.isInteger(scene.index) || (scene.index as number) < 0)
      throw new Error(`Still manifest scenes[${position}].index is invalid`)
    if (seen.has(scene.index as number)) throw new Error(`Still manifest contains duplicate index ${scene.index}`)
    if (typeof scene.path !== "string" || !scene.path.toLowerCase().endsWith(".png"))
      throw new Error(`Still manifest scenes[${position}].path must be a PNG path`)
    if (!Number.isInteger(scene.frameNumber) || (scene.frameNumber as number) < 0)
      throw new Error(`Still manifest scenes[${position}].frameNumber is invalid`)
    if (seenPaths.has(scene.path)) throw new Error(`Still manifest contains duplicate path ${scene.path}`)
    seenPaths.add(scene.path)
    const absolute = confinedQuarantinePath(workspace, scene.path, `still manifest scenes[${position}].path`)
    if (!existsSync(absolute) || !lstatSync(absolute).isFile())
      throw new Error(`Still image does not exist: ${scene.path}`)
    artifactForPath(workspace, scene.path, "still", maxArtifactBytes)
    seen.add(scene.index as number)
    scenes.push({ index: scene.index as number, path: scene.path, frameNumber: scene.frameNumber as number })
  }
  if (expectedSceneCount !== undefined && scenes.length !== expectedSceneCount)
    throw new Error(`Still manifest contains ${scenes.length} scenes; expected ${expectedSceneCount}`)
  scenes.sort((left, right) => left.index - right.index)
  for (const [position, scene] of scenes.entries())
    if (scene.index !== position) throw new Error("Still manifest scene indexes must be complete and start at zero")
  return { scenes }
}

export const validateStillManifest = parseStillManifest

function commandToSpec(workspace: QuarantineWorkspace, command: QuarantineCommand): ProcessRunSpec {
  const root = assertWorkspaceRoot(workspace)
  return {
    executable: command.executable,
    args: command.args,
    cwd: root,
    timeoutMs: command.timeoutMs,
    maxOutputBytes: command.maxOutputBytes,
    env: { PATH: `${join(root, "node_modules/.bin")}${delimiter}${process.env.PATH ?? ""}` },
  }
}

export interface QuarantineVerificationAdapters {
  formatCheck(command: QuarantineCommand, workspace: QuarantineWorkspace): Promise<ProcessRunResult>
  typecheck(command: QuarantineCommand, workspace: QuarantineWorkspace): Promise<ProcessRunResult>
  lint(command: QuarantineCommand, workspace: QuarantineWorkspace): Promise<ProcessRunResult>
  bundle(command: QuarantineCommand, workspace: QuarantineWorkspace): Promise<ProcessRunResult>
  still(command: QuarantineCommand, workspace: QuarantineWorkspace): Promise<ProcessRunResult>
}

export function createQuarantineVerificationAdapters(runner: ProcessRunner): QuarantineVerificationAdapters {
  const run = (command: QuarantineCommand, workspace: QuarantineWorkspace) => runner(commandToSpec(workspace, command))
  return { formatCheck: run, typecheck: run, lint: run, bundle: run, still: run }
}

export function createNoShellProcessRunner(): ProcessRunner {
  return (spec) =>
    new Promise((resolveResult) => {
      const startedAt = Date.now()
      let stdout = ""
      let stderr = ""
      let outputBytes = 0
      let timedOut = false
      let outputCapped = false
      let settled = false
      const detached = process.platform !== "win32"
      const baseEnv: NodeJS.ProcessEnv = {
        CI: "1",
        HOME: spec.cwd,
        NO_COLOR: "1",
        PATH: process.env.PATH,
        TEMP: spec.cwd,
        TMP: spec.cwd,
        TMPDIR: spec.cwd,
        ...(process.platform === "win32" ? { SystemRoot: process.env.SystemRoot } : {}),
      }
      const child = spawn(spec.executable, [...spec.args], {
        cwd: spec.cwd,
        env: { ...baseEnv, ...spec.env },
        detached,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      })
      const killProcessTree = (): void => {
        if (detached && child.pid) {
          try {
            process.kill(-child.pid, "SIGKILL")
            return
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ESRCH") child.kill("SIGKILL")
          }
        }
        child.kill("SIGKILL")
      }
      const finish = (result: Omit<ProcessRunResult, "durationMs">): void => {
        if (settled) return
        settled = true
        resolveResult({ ...result, durationMs: Date.now() - startedAt })
      }
      const append = (target: "stdout" | "stderr", chunk: Buffer): void => {
        outputBytes += chunk.byteLength
        const remaining = Math.max(0, spec.maxOutputBytes - (outputBytes - chunk.byteLength))
        const text = chunk.subarray(0, remaining).toString("utf8")
        if (target === "stdout") stdout += text
        else stderr += text
        if (outputBytes > spec.maxOutputBytes && !outputCapped) {
          outputCapped = true
          killProcessTree()
        }
      }
      child.stdout.on("data", (chunk: Buffer) => append("stdout", chunk))
      child.stderr.on("data", (chunk: Buffer) => append("stderr", chunk))
      const timer = setTimeout(() => {
        timedOut = true
        killProcessTree()
      }, spec.timeoutMs)
      child.once("error", (error) => {
        clearTimeout(timer)
        finish({ exitCode: null, signal: null, stdout, stderr: `${stderr}${error.message}`, timedOut, outputCapped })
      })
      child.once("close", (exitCode, signal) => {
        clearTimeout(timer)
        if (detached && child.pid) {
          try {
            process.kill(-child.pid, "SIGKILL")
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
              stderr += `${stderr ? "\n" : ""}Failed to clean process group: ${String(error)}`
              exitCode = exitCode === 0 ? null : exitCode
            }
          }
        }
        finish({ exitCode, signal, stdout, stderr, timedOut, outputCapped })
      })
    })
}

function defaultCommandPlan(
  manifest: CandidateManifest,
  harness: QuarantineVerificationHarness,
  limits: QuarantineLimits,
): QuarantineCommand[] {
  const sourceFiles = manifest.sourceFiles.map((file) => `./${file.path}`)
  const output = (
    stage: VerificationStage,
    args: string[],
    inputPaths: string[],
    outputPaths: string[] = [],
    requireOutputs = false,
  ): QuarantineCommand => ({
    stage,
    executable: "pnpm",
    args,
    inputPaths,
    outputPaths,
    timeoutMs: limits.stageTimeoutMs,
    maxOutputBytes: limits.maxOutputBytes,
    requireOutputs,
  })
  return [
    output(
      "format",
      ["exec", "prettier", "--check", "--", ...sourceFiles],
      manifest.sourceFiles.map((file) => file.path),
    ),
    output("typecheck", ["exec", "tsc", "--noEmit", "--project", harness.tsconfigPath], [harness.tsconfigPath]),
    output(
      "lint",
      ["exec", "eslint", "--", ...sourceFiles],
      manifest.sourceFiles.map((file) => file.path),
    ),
    output(
      "bundle",
      ["exec", "remotion", "bundle", manifest.sourceFiles[0].path, "--out-dir", "artifacts/bundle"],
      [manifest.sourceFiles[0].path],
      ["artifacts/bundle"],
      true,
    ),
    output(
      "still",
      ["exec", "tsx", harness.stillScriptPath, harness.configPath, "artifacts/stills"],
      [harness.stillScriptPath, harness.configPath],
      ["artifacts/stills"],
      true,
    ),
  ]
}

export function createQuarantineWorkspace(): QuarantineWorkspace {
  const root = createTestTemporaryDirectory("claqueta-quarantine-")
  const workspace = { root, ownerToken: randomUUID(), createdAt: new Date().toISOString() }
  registeredWorkspaces.set(root, workspace.ownerToken)
  return workspace
}

export function cleanupQuarantineWorkspace(workspace: QuarantineWorkspace): void {
  const root = assertWorkspaceRoot(workspace)
  cleanupTestDirectory(root)
  registeredWorkspaces.delete(root)
}

export interface CreateQuarantineJobOptions {
  candidateManifest: CandidateManifest
  verificationHarness: QuarantineVerificationHarness
  workspace?: QuarantineWorkspace
  limits?: Partial<QuarantineLimits>
  commandPlan?: readonly QuarantineCommand[]
}

export function createQuarantineJob(options: CreateQuarantineJobOptions): QuarantineJob {
  const workspace = options.workspace ?? createQuarantineWorkspace()
  const limits = { ...DEFAULT_LIMITS, ...options.limits }
  validateLimits(limits)
  validateHarness(workspace, options.verificationHarness)
  const candidateManifest = cloneManifest(options.candidateManifest)
  const manifestPath = "candidate-manifest.json"
  const absoluteManifestPath = confinedQuarantinePath(workspace, manifestPath, "candidate manifest")
  writeFileSync(absoluteManifestPath, JSON.stringify(candidateManifest, null, 2) + "\n", {
    encoding: "utf8",
    flag: "wx",
  })
  const reference = manifestReference(workspace, manifestPath)
  const harnessFiles = sealHarnessFiles(workspace, options.verificationHarness)
  const policy = evaluateSealedCandidate(workspace, candidateManifest, reference, limits)
  if (!policy.report || policy.errors.length > 0)
    throw new Error(
      `Invalid authenticated candidate manifest: ${policy.errors.join("; ") || "policy rejected candidate"}`,
    )
  const commandPlan = options.commandPlan ?? defaultCommandPlan(candidateManifest, options.verificationHarness, limits)
  const job: QuarantineJob = {
    schemaVersion: QUARANTINE_SCHEMA_VERSION,
    id: randomUUID(),
    workspace,
    candidateManifest,
    candidateManifestReference: reference,
    verificationHarness: { ...options.verificationHarness },
    verificationHarnessFiles: harnessFiles,
    commandPlan,
    limits,
  }
  assertCommandPlan(workspace, commandPlan, limits)
  const frozenJob = deepFreeze(job)
  registeredJobs.add(frozenJob)
  return frozenJob
}

function emptyProcessResult(): ProcessRunResult {
  return { exitCode: null, signal: null, stdout: "", stderr: "", durationMs: 0, timedOut: false, outputCapped: false }
}

function skippedReport(stage: VerificationStage, reason: string): StageReport {
  return {
    stage,
    status: "skipped",
    exitCode: null,
    timedOut: false,
    outputCapped: false,
    durationMs: 0,
    stdout: "",
    stderr: "",
    artifacts: [],
    errors: [reason],
  }
}

function stageFailure(
  stage: VerificationStage,
  run: ProcessRunResult,
  errors: string[],
  artifacts: QuarantineArtifact[] = [],
): StageReport {
  const failures = [...errors]
  if (run.timedOut) failures.push(`Stage timed out after ${run.durationMs}ms`)
  if (run.outputCapped) failures.push("Stage output exceeded its cap")
  if (run.exitCode !== 0) failures.push(`Stage exited with code ${run.exitCode ?? "unknown"}`)
  return {
    stage,
    status: "failed",
    exitCode: run.exitCode,
    timedOut: run.timedOut,
    outputCapped: run.outputCapped,
    durationMs: run.durationMs,
    stdout: run.stdout,
    stderr: run.stderr,
    artifacts,
    errors: failures,
  }
}

export async function runQuarantineVerification(job: QuarantineJob, runner: ProcessRunner): Promise<QuarantineResult> {
  if (!registeredJobs.has(job)) throw new Error("Quarantine job was not created by this process")
  assertWorkspaceRoot(job.workspace)
  validateLimits(job.limits)
  validateHarness(job.workspace, job.verificationHarness)
  assertCommandPlan(job.workspace, job.commandPlan, job.limits)
  const reports = {} as Record<VerificationStage, StageReport>
  const artifacts: QuarantineArtifact[] = []
  const failures: string[] = []
  const initial = evaluateSealedCandidate(
    job.workspace,
    job.candidateManifest,
    job.candidateManifestReference,
    job.limits,
  )
  const initialHarnessErrors = validateHarnessIdentity(job.workspace, job.verificationHarnessFiles)
  if (initial.errors.length > 0) failures.push(...initial.errors)
  if (initialHarnessErrors.length > 0) failures.push(...initialHarnessErrors)
  if (initial.report && initial.errors.length === 0)
    artifacts.push(
      artifactForPath(
        job.workspace,
        job.candidateManifestReference.path,
        "candidate-manifest",
        job.limits.maxArtifactBytes,
      ),
    )
  let blocked = initial.errors.length > 0 || initialHarnessErrors.length > 0
  const adapters = createQuarantineVerificationAdapters(runner)
  const commands = new Map(job.commandPlan.map((command) => [command.stage, command]))
  for (const stage of STAGES) {
    const command = commands.get(stage)!
    if (blocked) {
      reports[stage] = skippedReport(stage, "Skipped after an earlier verification failure")
      continue
    }
    const pre = evaluateSealedCandidate(
      job.workspace,
      job.candidateManifest,
      job.candidateManifestReference,
      job.limits,
    )
    const preHarnessErrors = validateHarnessIdentity(job.workspace, job.verificationHarnessFiles)
    if (pre.errors.length > 0 || preHarnessErrors.length > 0) {
      reports[stage] = skippedReport(stage, "Candidate policy or sealed source changed before the stage ran")
      blocked = true
      failures.push(...pre.errors, ...preHarnessErrors)
      continue
    }
    const preexistingOutput = command.outputPaths.find((path) =>
      existsSync(confinedQuarantinePath(job.workspace, path, `${stage} output`)),
    )
    if (preexistingOutput) {
      const error = `${stage} output existed before the stage ran: ${preexistingOutput}`
      reports[stage] = skippedReport(stage, error)
      blocked = true
      failures.push(error)
      continue
    }
    let run: ProcessRunResult
    try {
      run = await adapters[stage === "format" ? "formatCheck" : stage](command, job.workspace)
    } catch (error) {
      run = {
        ...emptyProcessResult(),
        stderr: `Stage runner failed: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
    const post = evaluateSealedCandidate(
      job.workspace,
      job.candidateManifest,
      job.candidateManifestReference,
      job.limits,
    )
    const postHarnessErrors = validateHarnessIdentity(job.workspace, job.verificationHarnessFiles)
    if (post.errors.length > 0 || postHarnessErrors.length > 0) {
      const report = stageFailure(stage, run, [
        "Candidate policy, sealed source, or verification harness changed during the stage",
        ...post.errors,
        ...postHarnessErrors,
      ])
      reports[stage] = report
      blocked = true
      failures.push(...report.errors)
      continue
    }
    if (run.exitCode !== 0 || run.timedOut || run.outputCapped) {
      const report = stageFailure(stage, run, [])
      reports[stage] = report
      blocked = true
      failures.push(...report.errors)
      continue
    }
    let stageArtifacts: QuarantineArtifact[] = []
    try {
      stageArtifacts = collectArtifacts(
        job.workspace,
        command.outputPaths,
        stage === "still" ? "still" : stage === "bundle" ? "bundle" : "stage-output",
        job.limits.maxArtifactBytes,
      )
      if (command.requireOutputs && stageArtifacts.length === 0)
        throw new Error(`${stage} did not produce a staged artifact`)
      const stillManifest =
        stage === "still"
          ? parseStillManifest(
              job.workspace,
              run.stdout,
              job.verificationHarness.expectedSceneCount,
              job.limits.maxArtifactBytes,
            )
          : undefined
      if (
        stillManifest &&
        stillManifest.scenes.some((scene) => !stageArtifacts.some((artifact) => artifact.path === scene.path))
      )
        throw new Error("Still manifest references a file outside the declared stage outputs")
      artifacts.push(...stageArtifacts)
      reports[stage] = {
        stage,
        status: "passed",
        exitCode: run.exitCode,
        timedOut: false,
        outputCapped: false,
        durationMs: run.durationMs,
        stdout: run.stdout,
        stderr: run.stderr,
        artifacts: stageArtifacts,
        errors: [],
        ...(stillManifest ? { stillManifest } : {}),
      }
    } catch (error) {
      const errors = [error instanceof Error ? error.message : String(error)]
      reports[stage] = stageFailure(stage, run, errors, stageArtifacts)
      blocked = true
      failures.push(...errors)
    }
  }
  const resultWithoutReport: QuarantineResult = {
    schemaVersion: QUARANTINE_SCHEMA_VERSION,
    jobId: job.id,
    candidateManifestId: job.candidateManifest.candidateId,
    completedAt: new Date().toISOString(),
    reports,
    artifacts,
    verdict: { promotable: !blocked && failures.length === 0, failures },
  }
  const reportPath = `artifacts/quarantine-result-${job.id}.json`
  mkdirSync(dirname(confinedQuarantinePath(job.workspace, reportPath, "result")), { recursive: true })
  writeFileSync(
    confinedQuarantinePath(job.workspace, reportPath, "result"),
    JSON.stringify(resultWithoutReport, null, 2) + "\n",
    { encoding: "utf8", flag: "wx" },
  )
  const reportArtifact = artifactForPath(job.workspace, reportPath, "report", job.limits.maxArtifactBytes)
  return deepFreeze({ ...resultWithoutReport, artifacts: [...artifacts, reportArtifact] })
}
