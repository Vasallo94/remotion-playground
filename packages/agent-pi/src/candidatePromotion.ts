import Database from "better-sqlite3"
import { createHash, randomUUID } from "node:crypto"
import { lstatSync, mkdirSync, readFileSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { validateCandidateManifest, type CandidateManifest } from "./candidatePolicy.js"
import type { QuarantineResult } from "./quarantineVerifier.js"

export const CANDIDATE_PROMOTION_PLAN_VERSION = 1 as const
export const CANDIDATE_PROMOTION_CHECKPOINT_VERSION = 1 as const
export const CANDIDATE_PROMOTION_JOURNAL_VERSION = 1 as const

export type CandidatePromotionState =
  | "planned"
  | "awaiting_approval"
  | "approved"
  | "staging"
  | "committing"
  | "committed"
  | "rollback_started"
  | "rolled_back"
  | "manual_intervention"

export interface PromotionFile {
  path: string
  content: string
  bytes: number
  sha256: string
}
export interface DestinationPreimage {
  path: string
  exists: boolean
  sha256: string | null
}
export interface CandidatePromotionPlan {
  schemaVersion: 1
  type: "candidate_promotion_plan"
  projectRoot: string
  candidateManifest: CandidateManifest
  verificationEvidenceDigest: string
  sourceFiles: readonly PromotionFile[]
  registryOutputs: readonly PromotionFile[]
  destinationPreimages: readonly DestinationPreimage[]
  planDigest: string
}
export interface CandidatePromotionCheckpointPayload {
  type: "candidate_promotion_checkpoint"
  checkpointId: string
  checkpointVersion: 1
  planDigest: string
  verificationEvidenceDigest: string
  candidateId: string
}
export interface CandidatePromotionCheckpoint {
  schemaVersion: 1
  type: "candidate_promotion_checkpoint"
  id: string
  version: 1
  payload: CandidatePromotionCheckpointPayload
}
export interface CandidatePromotionApproval {
  type: "candidate_promotion_approval"
  approved: true
  checkpointId: string
  checkpointVersion: number
  planDigest: string
  verificationEvidenceDigest: string
}
export interface CandidatePromotionApprovalInput extends Omit<CandidatePromotionApproval, "approved"> {
  approved: boolean
}
export interface PromotionStat {
  isFile(): boolean
  isDirectory(): boolean
  isSymbolicLink(): boolean
}
export interface PromotionFileSystem {
  lstat(path: string): PromotionStat
  readFile(path: string): Uint8Array
  writeFile(path: string, data: Uint8Array): void
  mkdir(path: string): void
  rename(source: string, destination: string): void
  unlink(path: string): void
  removeDirectory(path: string): void
}
export interface RegisterCandidateVerificationOptions {
  threadId: string
  artifactId: string
  artifactVersion: number
  artifactHash: string
  candidateManifest: CandidateManifest
  quarantineResult: QuarantineResult
}
export interface CandidatePromotionPlanOptions {
  journal: CandidatePromotionJournal
  threadId: string
  projectRoot: string
  candidateManifest: CandidateManifest
  quarantineResult: QuarantineResult
  sourceFiles: Readonly<Record<string, string>>
  registryOutputs: Readonly<Record<string, string>>
  filesystem?: PromotionFileSystem
}
export interface CandidatePromotionCheckpointOptions {
  journal: CandidatePromotionJournal
  plan: CandidatePromotionPlan
}
export interface PromoteCandidateOptions {
  journal: CandidatePromotionJournal
  plan: CandidatePromotionPlan
  checkpoint: CandidatePromotionCheckpoint
  approval: CandidatePromotionApprovalInput
  filesystem?: PromotionFileSystem
}
export interface CandidatePromotionRollbackHandle {
  type: "candidate_promotion_rollback_handle"
  handleId: string
  planDigest: string
  promotedFiles: readonly string[]
}
export interface CandidatePromotionResult {
  promoted: true
  planDigest: string
  verificationEvidenceDigest: string
  files: readonly string[]
  rollbackHandle: CandidatePromotionRollbackHandle
}
export interface CandidatePromotionRollbackResult {
  rolledBack: true
  planDigest: string
  files: readonly string[]
}
export interface RollbackCandidatePromotionOptions {
  journal: CandidatePromotionJournal
  handle: CandidatePromotionRollbackHandle
  filesystem?: PromotionFileSystem
}
export interface CandidatePromotionRecoveryResult {
  planDigest: string
  state: CandidatePromotionState
}

interface PromotionRow {
  schema_version: number
  plan_digest: string
  thread_id: string
  candidate_id: string
  project_root: string
  evidence_digest: string
  plan_json: string
  checkpoint_json: string | null
  approval_json: string | null
  state: CandidatePromotionState
  stage_directory: string | null
  rollback_handle_id: string | null
}
interface FileRow {
  file_index: number
  path: string
  before_exists: number
  before_bytes: Buffer | null
  before_hash: string | null
  after_bytes: Buffer
  after_hash: string
  staged_path: string | null
  progress: string
}

function canonical(value: unknown): string {
  if (value === null) return "null"
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value)
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (typeof value === "object") {
    const object = value as Record<string, unknown>
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`)
      .join(",")}}`
  }
  throw new Error("Promotion value is not canonical JSON")
}
export const canonicalizePromotionValue = canonical
export function hashCanonicalPromotionValue(value: unknown): string {
  return createHash("sha256").update(canonical(value), "utf8").digest("hex")
}
const hashBytes = (value: Uint8Array) => createHash("sha256").update(value).digest("hex")
const bytes = (value: string) => Buffer.from(value, "utf8")
const isHash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value)
const isMissing = (error: unknown) => (error as NodeJS.ErrnoException | undefined)?.code === "ENOENT"

function parseJson<T>(text: string, label: string): T {
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`Corrupt ${label} JSON in candidate promotion journal`)
  }
}
function plain(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw new Error(`${label} must be a plain object`)
}
function validateManifest(input: CandidateManifest): CandidateManifest {
  const result = validateCandidateManifest(input)
  if (!result.manifest || result.findings.some((item) => item.severity === "error"))
    throw new Error("Invalid candidate manifest")
  return JSON.parse(JSON.stringify(result.manifest)) as CandidateManifest
}
function assertEvidence(result: QuarantineResult, manifest: CandidateManifest): void {
  if (
    result.schemaVersion !== 1 ||
    result.candidateManifestId !== manifest.candidateId ||
    !result.verdict.promotable ||
    result.verdict.failures.length
  )
    throw new Error("Verifier result is not a successful result for this candidate")
  const artifacts = result.artifacts.filter((item) => item.kind === "candidate-manifest")
  const digest = hashBytes(bytes(JSON.stringify(manifest, null, 2) + "\n"))
  if (artifacts.length !== 1 || artifacts[0]?.sha256 !== digest)
    throw new Error("Verifier manifest evidence does not match")
  for (const stage of ["format", "typecheck", "lint", "bundle", "still"] as const)
    if (result.reports[stage]?.status !== "passed") throw new Error(`Quarantine stage '${stage}' did not pass`)
}
function freeze<T>(value: T): T {
  return Object.freeze(value)
}

export class CandidatePromotionJournal {
  constructor(readonly db: Database.Database) {
    this.migrate()
  }

  private migrate(): void {
    this.db.exec("BEGIN IMMEDIATE")
    try {
      this.db.exec(
        "CREATE TABLE IF NOT EXISTS candidate_promotion_schema (singleton INTEGER PRIMARY KEY CHECK(singleton=1), version INTEGER NOT NULL, applied_at TEXT NOT NULL)",
      )
      const marker = this.db.prepare("SELECT version FROM candidate_promotion_schema WHERE singleton=1").get() as
        | { version: number }
        | undefined
      if (marker && marker.version > CANDIDATE_PROMOTION_JOURNAL_VERSION)
        throw new Error("Candidate promotion journal is newer than supported")
      if (marker && marker.version !== CANDIDATE_PROMOTION_JOURNAL_VERSION)
        throw new Error("Incompatible candidate promotion journal version")
      if (!marker) {
        this.db.exec(`
          CREATE TABLE candidate_verification_evidence (
            schema_version INTEGER NOT NULL CHECK(schema_version=1), evidence_digest TEXT PRIMARY KEY,
            thread_id TEXT NOT NULL, candidate_id TEXT NOT NULL, artifact_id TEXT NOT NULL,
            artifact_version INTEGER NOT NULL, artifact_hash TEXT NOT NULL, manifest_json TEXT NOT NULL,
            evidence_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(artifact_id, artifact_version)
          );
          CREATE TABLE candidate_promotions (
            schema_version INTEGER NOT NULL CHECK(schema_version=1), plan_digest TEXT PRIMARY KEY,
            thread_id TEXT NOT NULL, candidate_id TEXT NOT NULL, project_root TEXT NOT NULL,
            evidence_digest TEXT NOT NULL REFERENCES candidate_verification_evidence(evidence_digest),
            plan_json TEXT NOT NULL, checkpoint_json TEXT, approval_json TEXT,
            state TEXT NOT NULL CHECK(state IN ('planned','awaiting_approval','approved','staging','committing','committed','rollback_started','rolled_back','manual_intervention')),
            stage_directory TEXT, rollback_handle_id TEXT UNIQUE, created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
          );
          CREATE TABLE candidate_promotion_files (
            plan_digest TEXT NOT NULL REFERENCES candidate_promotions(plan_digest), file_index INTEGER NOT NULL,
            path TEXT NOT NULL, before_exists INTEGER NOT NULL CHECK(before_exists IN (0,1)), before_bytes BLOB,
            before_hash TEXT, after_bytes BLOB NOT NULL, after_hash TEXT NOT NULL, staged_path TEXT,
            progress TEXT NOT NULL CHECK(progress IN ('pending','staged','replacing','replaced','restoring','restored')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY(plan_digest,file_index), UNIQUE(plan_digest,path),
            CHECK((before_exists=0 AND before_bytes IS NULL AND before_hash IS NULL) OR (before_exists=1 AND before_bytes IS NOT NULL AND before_hash IS NOT NULL))
          );
          INSERT INTO candidate_promotion_schema(singleton,version,applied_at) VALUES(1,1,datetime('now'));
        `)
      } else {
        const schemas: Record<string, readonly string[]> = {
          candidate_verification_evidence: [
            "schema_version",
            "evidence_digest",
            "thread_id",
            "candidate_id",
            "artifact_id",
            "artifact_version",
            "artifact_hash",
            "manifest_json",
            "evidence_json",
            "created_at",
          ],
          candidate_promotions: [
            "schema_version",
            "plan_digest",
            "thread_id",
            "candidate_id",
            "project_root",
            "evidence_digest",
            "plan_json",
            "checkpoint_json",
            "approval_json",
            "state",
            "stage_directory",
            "rollback_handle_id",
            "created_at",
            "updated_at",
          ],
          candidate_promotion_files: [
            "plan_digest",
            "file_index",
            "path",
            "before_exists",
            "before_bytes",
            "before_hash",
            "after_bytes",
            "after_hash",
            "staged_path",
            "progress",
            "updated_at",
          ],
        }
        for (const [table, required] of Object.entries(schemas)) {
          const columns = (this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
            (column) => column.name,
          )
          if (canonical(columns) !== canonical(required))
            throw new Error(`Candidate promotion migration is marked applied but has incompatible schema: ${table}`)
        }
      }
      this.db.exec("COMMIT")
    } catch (error) {
      this.db.exec("ROLLBACK")
      throw error
    }
  }

  immediate<T>(operation: () => T): T {
    this.db.exec("BEGIN IMMEDIATE")
    try {
      const result = operation()
      this.db.exec("COMMIT")
      return result
    } catch (error) {
      this.db.exec("ROLLBACK")
      throw error
    }
  }

  registerVerification(options: RegisterCandidateVerificationOptions): string {
    const manifest = validateManifest(options.candidateManifest)
    assertEvidence(options.quarantineResult, manifest)
    if (
      !options.threadId ||
      !options.artifactId ||
      !Number.isSafeInteger(options.artifactVersion) ||
      options.artifactVersion < 1 ||
      !isHash(options.artifactHash)
    )
      throw new Error("Verifier parent artifact metadata is invalid")
    const evidenceDigest = hashCanonicalPromotionValue(options.quarantineResult)
    if (options.artifactHash !== evidenceDigest)
      throw new Error("Verifier parent artifact hash is not the canonical evidence hash")
    this.immediate(() => {
      const existing = this.db
        .prepare(
          "SELECT evidence_digest,artifact_hash,candidate_id FROM candidate_verification_evidence WHERE artifact_id=? AND artifact_version=?",
        )
        .get(options.artifactId, options.artifactVersion) as
        | { evidence_digest: string; artifact_hash: string; candidate_id: string }
        | undefined
      if (
        existing &&
        (existing.evidence_digest !== evidenceDigest ||
          existing.artifact_hash !== options.artifactHash ||
          existing.candidate_id !== manifest.candidateId)
      )
        throw new Error("Conflicting verifier artifact registration")
      if (!existing)
        this.db
          .prepare(
            `INSERT INTO candidate_verification_evidence
        (schema_version,evidence_digest,thread_id,candidate_id,artifact_id,artifact_version,artifact_hash,manifest_json,evidence_json)
        VALUES(1,?,?,?,?,?,?,?,?)`,
          )
          .run(
            evidenceDigest,
            options.threadId,
            manifest.candidateId,
            options.artifactId,
            options.artifactVersion,
            options.artifactHash,
            canonical(manifest),
            canonical(options.quarantineResult),
          )
    })
    return evidenceDigest
  }

  assertEvidenceStored(threadId: string, manifest: CandidateManifest, result: QuarantineResult): string {
    const digest = hashCanonicalPromotionValue(result)
    const row = this.db.prepare("SELECT * FROM candidate_verification_evidence WHERE evidence_digest=?").get(digest) as
      | Record<string, unknown>
      | undefined
    if (!row || row.schema_version !== 1 || row.thread_id !== threadId || row.candidate_id !== manifest.candidateId)
      throw new Error("Verifier evidence is not registered by this parent")
    const storedManifest = parseJson<unknown>(String(row.manifest_json), `manifest for ${digest}`)
    const storedEvidence = parseJson<unknown>(String(row.evidence_json), `evidence for ${digest}`)
    if (
      hashCanonicalPromotionValue(storedManifest) !== hashCanonicalPromotionValue(manifest) ||
      hashCanonicalPromotionValue(storedEvidence) !== digest
    )
      throw new Error("Corrupt verifier evidence row")
    return digest
  }

  readPromotion(planDigest: string): PromotionRow {
    const row = this.db.prepare("SELECT * FROM candidate_promotions WHERE plan_digest=?").get(planDigest) as
      | PromotionRow
      | undefined
    if (!row) throw new Error("Unknown candidate promotion plan")
    if (row.schema_version !== 1) throw new Error("Unsupported candidate promotion row version")
    const plan = parseJson<CandidatePromotionPlan>(row.plan_json, `plan ${planDigest}`)
    if (plan.schemaVersion !== 1 || plan.type !== "candidate_promotion_plan" || plan.planDigest !== planDigest)
      throw new Error("Incompatible candidate promotion plan row")
    const unsigned = { ...plan } as Record<string, unknown>
    delete unsigned.planDigest
    delete unsigned.digest
    if (hashCanonicalPromotionValue(unsigned) !== planDigest || plan.verificationEvidenceDigest !== row.evidence_digest)
      throw new Error("Corrupt candidate promotion plan digest")
    if (row.stage_directory !== null) {
      const stageName = relative(row.project_root, row.stage_directory)
      if (!/^\.candidate-promotion-[0-9a-f-]{36}$/.test(stageName) || dirname(row.stage_directory) !== row.project_root)
        throw new Error("Corrupt candidate promotion staging path")
    }
    return row
  }

  getPlan(planDigest: string): CandidatePromotionPlan {
    const row = this.readPromotion(planDigest)
    const plan = parseJson<CandidatePromotionPlan>(row.plan_json, `plan ${planDigest}`)
    Object.defineProperty(plan, "digest", { value: plan.planDigest, enumerable: false })
    return freeze(plan)
  }

  getCheckpoint(planDigest: string): CandidatePromotionCheckpoint | null {
    const row = this.readPromotion(planDigest)
    if (!row.checkpoint_json) return null
    const checkpoint = parseJson<CandidatePromotionCheckpoint>(row.checkpoint_json, `checkpoint ${planDigest}`)
    if (
      checkpoint.schemaVersion !== 1 ||
      checkpoint.version !== 1 ||
      checkpoint.type !== "candidate_promotion_checkpoint" ||
      checkpoint.id !== checkpoint.payload?.checkpointId ||
      checkpoint.payload.planDigest !== planDigest ||
      checkpoint.payload.verificationEvidenceDigest !== row.evidence_digest ||
      checkpoint.payload.candidateId !== row.candidate_id
    )
      throw new Error(`Corrupt candidate promotion checkpoint row: ${planDigest}`)
    return freeze(checkpoint)
  }

  getApproval(planDigest: string): CandidatePromotionApproval | null {
    const row = this.readPromotion(planDigest)
    if (!row.approval_json) return null
    const approval = parseJson<CandidatePromotionApproval>(row.approval_json, `approval ${planDigest}`)
    const checkpoint = this.getCheckpoint(planDigest)
    if (
      !checkpoint ||
      approval.type !== "candidate_promotion_approval" ||
      approval.approved !== true ||
      approval.checkpointId !== checkpoint.id ||
      approval.checkpointVersion !== checkpoint.version ||
      approval.planDigest !== planDigest ||
      approval.verificationEvidenceDigest !== row.evidence_digest
    )
      throw new Error(`Corrupt candidate promotion approval row: ${planDigest}`)
    return freeze(approval)
  }

  getRollbackHandle(planDigest: string): CandidatePromotionRollbackHandle | null {
    const row = this.readPromotion(planDigest)
    if (!row.rollback_handle_id) return null
    return freeze({
      type: "candidate_promotion_rollback_handle",
      handleId: row.rollback_handle_id,
      planDigest,
      promotedFiles: this.files(planDigest).map((file) => file.path),
    })
  }

  files(planDigest: string): FileRow[] {
    const promotion = this.readPromotion(planDigest)
    const plan = parseJson<CandidatePromotionPlan>(promotion.plan_json, `plan ${planDigest}`)
    const expectedPaths = [...plan.sourceFiles, ...plan.registryOutputs].map((file) => file.path)
    const rows = this.db
      .prepare("SELECT * FROM candidate_promotion_files WHERE plan_digest=? ORDER BY file_index")
      .all(planDigest) as FileRow[]
    if (
      rows.length !== expectedPaths.length ||
      rows.some((row, index) => row.file_index !== index || row.path !== expectedPaths[index])
    )
      throw new Error(`Corrupt candidate promotion file set: ${planDigest}`)
    for (const row of rows) {
      if (
        !Number.isSafeInteger(row.file_index) ||
        !isHash(row.after_hash) ||
        hashBytes(row.after_bytes) !== row.after_hash ||
        (row.before_exists === 1
          ? !row.before_bytes || hashBytes(row.before_bytes) !== row.before_hash
          : row.before_bytes !== null || row.before_hash !== null) ||
        (row.staged_path !== null &&
          row.staged_path !== (promotion.stage_directory && stagePath(promotion, row.file_index)))
      )
        throw new Error(`Corrupt candidate promotion file row: ${planDigest}/${row.file_index}`)
    }
    return rows
  }

  state(planDigest: string): CandidatePromotionState {
    return this.readPromotion(planDigest).state
  }
}

export function registerCandidateVerification(
  options: RegisterCandidateVerificationOptions & { journal: CandidatePromotionJournal },
): string {
  return options.journal.registerVerification(options)
}

function safeRelative(root: string, input: string, label: string): string {
  if (!input || input.includes("\0") || isAbsolute(input) || input.replace(/\\/g, "/").split("/").includes(".."))
    throw new Error(`${label} is not a safe relative path`)
  const target = resolve(root, input)
  const rel = relative(root, target)
  if (!rel || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error(`${label} escapes project root`)
  return target
}
function noSymlinks(fs: PromotionFileSystem, root: string, target: string): void {
  let current = root
  for (const part of relative(root, target).split(sep).filter(Boolean)) {
    current = join(current, part)
    try {
      if (fs.lstat(current).isSymbolicLink()) throw new Error(`Path contains a symbolic link: ${part}`)
    } catch (error) {
      if (error instanceof Error && error.message.includes("symbolic link")) throw error
      if (isMissing(error)) break
      throw error
    }
  }
}
function confined(fs: PromotionFileSystem, root: string, input: string): string {
  const target = safeRelative(root, input, "destination")
  noSymlinks(fs, root, target)
  return target
}
function rootPath(fs: PromotionFileSystem, input: string): string {
  if (!isAbsolute(input)) throw new Error("projectRoot must be absolute")
  const root = resolve(input)
  const stat = fs.lstat(root)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("projectRoot must be a non-symbolic directory")
  return root
}
function readDestination(fs: PromotionFileSystem, root: string, path: string): Buffer | null {
  const target = confined(fs, root, path)
  try {
    const stat = fs.lstat(target)
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Destination is not a regular file: ${path}`)
    return Buffer.from(fs.readFile(target))
  } catch (error) {
    if (isMissing(error)) return null
    throw error
  }
}
function exactKeys(value: Readonly<Record<string, string>>, expected: readonly string[], label: string): void {
  plain(value, label)
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (canonical(actual) !== canonical(wanted) || actual.some((key) => typeof value[key] !== "string"))
    throw new Error(`${label} must exactly cover declared destinations`)
}
export function createNodePromotionFileSystem(overrides: Partial<PromotionFileSystem> = {}): PromotionFileSystem {
  return {
    lstat: lstatSync,
    readFile: (path) => readFileSync(path),
    writeFile: (path, data) => writeFileSync(path, data),
    mkdir: (path) => mkdirSync(path, { recursive: true }),
    rename: renameSync,
    unlink: unlinkSync,
    removeDirectory: rmdirSync,
    ...overrides,
  }
}
export const nodePromotionFileSystem = createNodePromotionFileSystem()

export function createCandidatePromotionPlan(options: CandidatePromotionPlanOptions): CandidatePromotionPlan {
  if (!options.journal) throw new Error("A durable candidate promotion journal is required")
  const fs = options.filesystem ?? nodePromotionFileSystem
  const root = rootPath(fs, options.projectRoot)
  const manifest = validateManifest(options.candidateManifest)
  const evidenceDigest = options.journal.assertEvidenceStored(options.threadId, manifest, options.quarantineResult)
  if (manifest.sourceFiles.length !== 1) throw new Error("Candidate source count is outside policy")
  const sourcePaths = manifest.sourceFiles.map((item) => item.path)
  const registryPaths = manifest.registryChanges.map((item) => item.path)
  exactKeys(options.sourceFiles, sourcePaths, "sourceFiles")
  exactKeys(options.registryOutputs, registryPaths, "registryOutputs")
  const make = (path: string, content: string): PromotionFile => {
    confined(fs, root, path)
    const data = bytes(content)
    return { path, content, bytes: data.length, sha256: hashBytes(data) }
  }
  const sources = sourcePaths.map((path) => make(path, options.sourceFiles[path]!))
  for (const file of sources) {
    const declared = manifest.sourceFiles.find((item) => item.path === file.path)!
    if (file.bytes !== declared.bytes || file.sha256 !== declared.sha256)
      throw new Error(`Candidate source does not match manifest: ${file.path}`)
  }
  const registries = registryPaths.map((path) => make(path, options.registryOutputs[path]!))
  const all = [...sources, ...registries]
  const captured = all.map((file) => ({ file, before: readDestination(fs, root, file.path) }))
  const unsigned = {
    schemaVersion: 1 as const,
    type: "candidate_promotion_plan" as const,
    projectRoot: root,
    candidateManifest: manifest,
    verificationEvidenceDigest: evidenceDigest,
    sourceFiles: sources,
    registryOutputs: registries,
    destinationPreimages: captured.map(({ file, before }) => ({
      path: file.path,
      exists: before !== null,
      sha256: before && hashBytes(before),
    })),
  }
  const planDigest = hashCanonicalPromotionValue(unsigned)
  const plan: CandidatePromotionPlan = { ...unsigned, planDigest }
  options.journal.immediate(() => {
    const existing = options.journal.db
      .prepare("SELECT plan_json FROM candidate_promotions WHERE plan_digest=?")
      .get(planDigest) as { plan_json: string } | undefined
    if (existing) {
      if (existing.plan_json !== canonical(plan)) throw new Error("Conflicting duplicate promotion plan")
      return
    }
    options.journal.db
      .prepare(
        `INSERT INTO candidate_promotions(schema_version,plan_digest,thread_id,candidate_id,project_root,evidence_digest,plan_json,state) VALUES(1,?,?,?,?,?,?,'planned')`,
      )
      .run(planDigest, options.threadId, manifest.candidateId, root, evidenceDigest, canonical(plan))
    const insert = options.journal.db.prepare(
      `INSERT INTO candidate_promotion_files(plan_digest,file_index,path,before_exists,before_bytes,before_hash,after_bytes,after_hash,progress) VALUES(?,?,?,?,?,?,?,?, 'pending')`,
    )
    captured.forEach(({ file, before }, index) =>
      insert.run(
        planDigest,
        index,
        file.path,
        before ? 1 : 0,
        before,
        before && hashBytes(before),
        bytes(file.content),
        file.sha256,
      ),
    )
  })
  return freeze(plan)
}
export const createPromotionPlan = createCandidatePromotionPlan

function assertPlan(journal: CandidatePromotionJournal, plan: CandidatePromotionPlan): PromotionRow {
  const row = journal.readPromotion(plan.planDigest)
  if (row.plan_json !== canonical(plan)) throw new Error("Promotion plan differs from durable parent plan")
  return row
}
export function createCandidatePromotionCheckpoint(
  options: CandidatePromotionCheckpointOptions,
): CandidatePromotionCheckpoint {
  const row = assertPlan(options.journal, options.plan)
  return options.journal.immediate(() => {
    const fresh = options.journal.readPromotion(options.plan.planDigest)
    if (fresh.checkpoint_json)
      return freeze(parseJson<CandidatePromotionCheckpoint>(fresh.checkpoint_json, `checkpoint ${fresh.plan_digest}`))
    if (fresh.state !== "planned") throw new Error("Promotion checkpoint cannot be created in this state")
    const id = `candidate-promotion-${randomUUID()}`
    const checkpoint: CandidatePromotionCheckpoint = {
      schemaVersion: 1,
      type: "candidate_promotion_checkpoint",
      id,
      version: 1,
      payload: {
        type: "candidate_promotion_checkpoint",
        checkpointId: id,
        checkpointVersion: 1,
        planDigest: row.plan_digest,
        verificationEvidenceDigest: row.evidence_digest,
        candidateId: row.candidate_id,
      },
    }
    options.journal.db
      .prepare(
        "UPDATE candidate_promotions SET checkpoint_json=?,state='awaiting_approval',updated_at=datetime('now') WHERE plan_digest=? AND state='planned'",
      )
      .run(canonical(checkpoint), row.plan_digest)
    return freeze(checkpoint)
  })
}
export const createPromotionCheckpoint = createCandidatePromotionCheckpoint

function assertCheckpoint(
  journal: CandidatePromotionJournal,
  checkpoint: CandidatePromotionCheckpoint,
  plan: CandidatePromotionPlan,
): PromotionRow {
  const row = assertPlan(journal, plan)
  if (
    !row.checkpoint_json ||
    row.checkpoint_json !== canonical(checkpoint) ||
    checkpoint.type !== "candidate_promotion_checkpoint" ||
    checkpoint.id !== checkpoint.payload.checkpointId ||
    checkpoint.version !== 1 ||
    checkpoint.payload.planDigest !== plan.planDigest ||
    checkpoint.payload.verificationEvidenceDigest !== plan.verificationEvidenceDigest
  )
    throw new Error("Promotion checkpoint is stale or not parent-authenticated")
  return row
}
export function validateCandidatePromotionApproval(
  journal: CandidatePromotionJournal,
  checkpoint: CandidatePromotionCheckpoint,
  approval: CandidatePromotionApprovalInput,
): asserts approval is CandidatePromotionApproval {
  const keys = approval && typeof approval === "object" ? Object.keys(approval).sort().join(",") : ""
  if (
    keys !== "approved,checkpointId,checkpointVersion,planDigest,type,verificationEvidenceDigest" ||
    approval.type !== "candidate_promotion_approval" ||
    approval.approved !== true ||
    approval.checkpointId !== checkpoint.id ||
    approval.checkpointVersion !== checkpoint.version ||
    approval.planDigest !== checkpoint.payload.planDigest ||
    approval.verificationEvidenceDigest !== checkpoint.payload.verificationEvidenceDigest
  )
    throw new Error("Promotion approval is stale, malformed, or bound to different evidence")
  const row = journal.readPromotion(approval.planDigest)
  if (row.checkpoint_json !== canonical(checkpoint))
    throw new Error("Promotion checkpoint is not durable parent evidence")
}
export const approveCandidatePromotion = validateCandidatePromotionApproval
export function createCandidatePromotionApproval(
  journal: CandidatePromotionJournal,
  checkpoint: CandidatePromotionCheckpoint,
  input: { type: "candidate_promotion_approval"; approved: boolean } & Partial<CandidatePromotionApprovalInput>,
): CandidatePromotionApproval {
  const approval = {
    type: input.type,
    approved: input.approved,
    checkpointId: input.checkpointId ?? checkpoint.id,
    checkpointVersion: input.checkpointVersion ?? checkpoint.version,
    planDigest: input.planDigest ?? checkpoint.payload.planDigest,
    verificationEvidenceDigest: input.verificationEvidenceDigest ?? checkpoint.payload.verificationEvidenceDigest,
  }
  validateCandidatePromotionApproval(journal, checkpoint, approval)
  journal.immediate(() => {
    const row = journal.readPromotion(approval.planDigest)
    if (row.approval_json && row.approval_json !== canonical(approval))
      throw new Error("Conflicting duplicate promotion decision")
    if (row.state === "awaiting_approval")
      journal.db
        .prepare(
          "UPDATE candidate_promotions SET approval_json=?,state='approved',updated_at=datetime('now') WHERE plan_digest=? AND state='awaiting_approval'",
        )
        .run(canonical(approval), approval.planDigest)
    else if (!row.approval_json) throw new Error("Stale promotion decision")
  })
  return freeze(approval as CandidatePromotionApproval)
}

function stagePath(row: PromotionRow, index: number): string {
  return join(row.stage_directory!, `stage-${index}`)
}
function cleanup(fs: PromotionFileSystem, row: PromotionRow, files: FileRow[]): void {
  for (const file of files) {
    const ownedPath = file.staged_path ?? (row.stage_directory ? stagePath(row, file.file_index) : null)
    if (ownedPath)
      try {
        fs.unlink(ownedPath)
      } catch (error) {
        if (!isMissing(error)) throw error
      }
    if (row.stage_directory)
      try {
        fs.unlink(join(row.stage_directory, `restore-${file.file_index}`))
      } catch (error) {
        if (!isMissing(error)) throw error
      }
  }
  if (row.stage_directory)
    try {
      fs.removeDirectory(row.stage_directory)
    } catch (error) {
      if (!isMissing(error)) throw error
    }
}
function clearStaging(journal: CandidatePromotionJournal, planDigest: string): void {
  journal.db
    .prepare("UPDATE candidate_promotion_files SET staged_path=NULL,updated_at=datetime('now') WHERE plan_digest=?")
    .run(planDigest)
}
function classify(fs: PromotionFileSystem, row: PromotionRow, file: FileRow): "before" | "after" | "unknown" {
  const current = readDestination(fs, row.project_root, file.path)
  if (current === null) return file.before_exists === 0 ? "before" : "unknown"
  const hash = hashBytes(current)
  if (hash === file.after_hash) return "after"
  if (file.before_exists === 1 && hash === file.before_hash) return "before"
  return "unknown"
}
function restore(
  fs: PromotionFileSystem,
  journal: CandidatePromotionJournal,
  row: PromotionRow,
  files: FileRow[],
): CandidatePromotionState {
  if (files.some((file) => classify(fs, row, file) === "unknown")) {
    journal.db
      .prepare(
        "UPDATE candidate_promotions SET state='manual_intervention',updated_at=datetime('now') WHERE plan_digest=?",
      )
      .run(row.plan_digest)
    return "manual_intervention"
  }
  if (!row.stage_directory) throw new Error("Recovery staging directory is not journaled")
  noSymlinks(fs, row.project_root, row.stage_directory)
  fs.mkdir(row.stage_directory)
  for (const file of files)
    if (file.before_exists) {
      const restorePath = join(row.stage_directory, `restore-${file.file_index}`)
      fs.writeFile(restorePath, file.before_bytes!)
      if (hashBytes(fs.readFile(restorePath)) !== file.before_hash)
        throw new Error(`Restore staging hash mismatch: ${file.path}`)
    }
  for (const file of files) {
    if (classify(fs, row, file) === "after") {
      journal.db
        .prepare(
          "UPDATE candidate_promotion_files SET progress='restoring',updated_at=datetime('now') WHERE plan_digest=? AND file_index=?",
        )
        .run(row.plan_digest, file.file_index)
      const target = confined(fs, row.project_root, file.path)
      if (file.before_exists) fs.rename(join(row.stage_directory, `restore-${file.file_index}`), target)
      else fs.unlink(target)
      journal.db
        .prepare(
          "UPDATE candidate_promotion_files SET progress='restored',updated_at=datetime('now') WHERE plan_digest=? AND file_index=?",
        )
        .run(row.plan_digest, file.file_index)
    }
  }
  return "rolled_back"
}

export function promoteCandidate(options: PromoteCandidateOptions): CandidatePromotionResult {
  const fs = options.filesystem ?? nodePromotionFileSystem
  assertCheckpoint(options.journal, options.checkpoint, options.plan)
  validateCandidatePromotionApproval(options.journal, options.checkpoint, options.approval)
  const claimed = options.journal.immediate(() => {
    const row = options.journal.readPromotion(options.plan.planDigest)
    if (row.state === "committed") return row
    if (row.state !== "approved") throw new Error(`Promotion cannot run while state is ${row.state}`)
    const directory = join(row.project_root, `.candidate-promotion-${randomUUID()}`)
    noSymlinks(fs, row.project_root, directory)
    try {
      fs.lstat(directory)
      throw new Error("Refusing to adopt an existing promotion staging directory")
    } catch (error) {
      if (!isMissing(error)) throw error
    }
    options.journal.db
      .prepare(
        "UPDATE candidate_promotions SET state='staging',stage_directory=?,updated_at=datetime('now') WHERE plan_digest=? AND state='approved'",
      )
      .run(directory, row.plan_digest)
    return { ...row, state: "staging" as const, stage_directory: directory }
  })
  if (claimed.state === "committed") return resultFor(options.journal, claimed)
  const row = claimed
  const files = options.journal.files(row.plan_digest)
  try {
    if (rootPath(fs, row.project_root) !== row.project_root) throw new Error("Project root changed")
    for (const file of files)
      if (classify(fs, row, file) !== "before") throw new Error(`Destination preimage is stale: ${file.path}`)
    noSymlinks(fs, row.project_root, row.stage_directory!)
    fs.mkdir(row.stage_directory!)
    for (const file of files) {
      const staged = stagePath(row, file.file_index)
      fs.writeFile(staged, file.after_bytes)
      if (hashBytes(fs.readFile(staged)) !== file.after_hash) throw new Error(`Staged file hash mismatch: ${file.path}`)
      options.journal.db
        .prepare(
          "UPDATE candidate_promotion_files SET staged_path=?,progress='staged',updated_at=datetime('now') WHERE plan_digest=? AND file_index=?",
        )
        .run(staged, row.plan_digest, file.file_index)
      file.staged_path = staged
    }
    for (const file of files) {
      confined(fs, row.project_root, file.path)
      if (classify(fs, row, file) !== "before") throw new Error(`Destination changed before commit: ${file.path}`)
    }
    options.journal.immediate(() =>
      options.journal.db
        .prepare(
          "UPDATE candidate_promotions SET state='committing',updated_at=datetime('now') WHERE plan_digest=? AND state='staging'",
        )
        .run(row.plan_digest),
    )
    for (const file of files) {
      fs.mkdir(dirname(confined(fs, row.project_root, file.path)))
      options.journal.db
        .prepare(
          "UPDATE candidate_promotion_files SET progress='replacing',updated_at=datetime('now') WHERE plan_digest=? AND file_index=?",
        )
        .run(row.plan_digest, file.file_index)
      fs.rename(file.staged_path!, confined(fs, row.project_root, file.path))
      file.staged_path = null
      options.journal.db
        .prepare(
          "UPDATE candidate_promotion_files SET progress='replaced',staged_path=NULL,updated_at=datetime('now') WHERE plan_digest=? AND file_index=?",
        )
        .run(row.plan_digest, file.file_index)
    }
    const handleId = randomUUID()
    options.journal.immediate(() =>
      options.journal.db
        .prepare(
          "UPDATE candidate_promotions SET state='committed',rollback_handle_id=?,stage_directory=NULL,updated_at=datetime('now') WHERE plan_digest=? AND state='committing'",
        )
        .run(handleId, row.plan_digest),
    )
    try {
      cleanup(fs, row, files)
    } catch {
      /* recovery never broad-deletes */
    }
    return resultFor(options.journal, { ...row, state: "committed", rollback_handle_id: handleId })
  } catch (error) {
    const current = options.journal.readPromotion(row.plan_digest)
    if (current.state === "staging") {
      cleanup(fs, current, options.journal.files(row.plan_digest))
      clearStaging(options.journal, row.plan_digest)
      options.journal.db
        .prepare(
          "UPDATE candidate_promotions SET state='approved',stage_directory=NULL,updated_at=datetime('now') WHERE plan_digest=? AND state='staging'",
        )
        .run(row.plan_digest)
    } else if (current.state === "committing") {
      const currentFiles = options.journal.files(row.plan_digest)
      const state = restore(fs, options.journal, current, currentFiles)
      cleanup(fs, current, currentFiles)
      clearStaging(options.journal, row.plan_digest)
      options.journal.db
        .prepare(
          "UPDATE candidate_promotions SET state=?,stage_directory=NULL,updated_at=datetime('now') WHERE plan_digest=?",
        )
        .run(state === "rolled_back" ? "approved" : state, row.plan_digest)
    }
    throw error
  }
}
export const promoteCandidatePromotion = promoteCandidate
function resultFor(journal: CandidatePromotionJournal, row: PromotionRow): CandidatePromotionResult {
  const files = journal.files(row.plan_digest).map((item) => item.path)
  return freeze({
    promoted: true,
    planDigest: row.plan_digest,
    verificationEvidenceDigest: row.evidence_digest,
    files,
    rollbackHandle: freeze({
      type: "candidate_promotion_rollback_handle",
      handleId: row.rollback_handle_id!,
      planDigest: row.plan_digest,
      promotedFiles: files,
    }),
  })
}

export function recoverCandidatePromotions(
  journal: CandidatePromotionJournal,
  filesystem: PromotionFileSystem = nodePromotionFileSystem,
): CandidatePromotionRecoveryResult[] {
  const rows = journal.db
    .prepare(
      "SELECT plan_digest FROM candidate_promotions WHERE state IN ('staging','committing','rollback_started') ORDER BY created_at,plan_digest",
    )
    .all() as Array<{ plan_digest: string }>
  return rows.map(({ plan_digest }) =>
    journal.immediate(() => {
      const row = journal.readPromotion(plan_digest)
      const files = journal.files(plan_digest)
      let state: CandidatePromotionState
      if (row.state === "staging") {
        cleanup(filesystem, row, files)
        clearStaging(journal, plan_digest)
        journal.db
          .prepare(
            "UPDATE candidate_promotions SET state='approved',stage_directory=NULL,updated_at=datetime('now') WHERE plan_digest=?",
          )
          .run(plan_digest)
        state = "approved"
      } else if (row.state === "committing" && files.every((file) => classify(filesystem, row, file) === "after")) {
        const handle = row.rollback_handle_id ?? randomUUID()
        cleanup(filesystem, row, files)
        clearStaging(journal, plan_digest)
        journal.db
          .prepare(
            "UPDATE candidate_promotions SET state='committed',rollback_handle_id=?,stage_directory=NULL,updated_at=datetime('now') WHERE plan_digest=?",
          )
          .run(handle, plan_digest)
        state = "committed"
      } else {
        state = restore(filesystem, journal, row, files)
        cleanup(filesystem, row, files)
        clearStaging(journal, plan_digest)
        journal.db
          .prepare(
            "UPDATE candidate_promotions SET state=?,stage_directory=NULL,updated_at=datetime('now') WHERE plan_digest=?",
          )
          .run(state === "rolled_back" && row.state === "committing" ? "approved" : state, plan_digest)
        if (state === "rolled_back" && row.state === "committing") state = "approved"
      }
      return { planDigest: plan_digest, state }
    }),
  )
}

export function rollbackCandidatePromotion(
  options: RollbackCandidatePromotionOptions,
): CandidatePromotionRollbackResult {
  const fs = options.filesystem ?? nodePromotionFileSystem
  const handle = options.handle
  const row = options.journal.immediate(() => {
    if (!handle || handle.type !== "candidate_promotion_rollback_handle") throw new Error("Invalid rollback handle")
    const current = options.journal.readPromotion(handle.planDigest)
    if (current.rollback_handle_id !== handle.handleId)
      throw new Error("Rollback handle is not durable parent authority")
    if (current.state === "rolled_back") return current
    if (current.state !== "committed") throw new Error(`Rollback cannot run while state is ${current.state}`)
    const directory = join(current.project_root, `.candidate-promotion-${randomUUID()}`)
    noSymlinks(fs, current.project_root, directory)
    try {
      fs.lstat(directory)
      throw new Error("Refusing to adopt an existing rollback staging directory")
    } catch (error) {
      if (!isMissing(error)) throw error
    }
    options.journal.db
      .prepare(
        "UPDATE candidate_promotions SET state='rollback_started',stage_directory=?,updated_at=datetime('now') WHERE plan_digest=? AND state='committed'",
      )
      .run(directory, current.plan_digest)
    return { ...current, state: "rollback_started" as const, stage_directory: directory }
  })
  const files = options.journal.files(row.plan_digest)
  if (row.state === "rolled_back")
    return freeze({ rolledBack: true, planDigest: row.plan_digest, files: files.map((item) => item.path) })
  const state = options.journal.immediate(() => restore(fs, options.journal, row, files))
  cleanup(fs, row, files)
  clearStaging(options.journal, row.plan_digest)
  options.journal.db
    .prepare(
      "UPDATE candidate_promotions SET state=?,stage_directory=NULL,updated_at=datetime('now') WHERE plan_digest=?",
    )
    .run(state, row.plan_digest)
  if (state === "manual_intervention") throw new Error("Rollback destination drift requires manual intervention")
  return freeze({ rolledBack: true, planDigest: row.plan_digest, files: files.map((item) => item.path) })
}
export const rollbackPromotion = rollbackCandidatePromotion
