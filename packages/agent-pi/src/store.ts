import Database from "better-sqlite3"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import { ensureDirectory, PROJECT_ROOT } from "./paths.js"
import { ACTION_JOURNAL_SCHEMA_VERSION } from "./actionJournal.js"
import type {
  ActionAttemptError,
  ActionAttemptMutationResult,
  ActionAttemptRecord,
  ActionAttemptStatus,
  ActionKey,
  ActionName,
  ArtifactKind,
  ArtifactRecord,
  BeginActionAttemptInput,
  BeginActionAttemptOptions,
  BeginActionAttemptResult,
  CheckpointRecord,
  CompleteActionAttemptInput,
  FailActionAttemptInput,
  InputSnapshotFingerprint,
  PiSseEvent,
  PipelineMode,
  PipelinePlan,
  ThreadRecord,
  ThreadStatus,
} from "./types.js"

interface ThreadRow {
  id: string
  title: string | null
  status: ThreadStatus
  pi_session_id: string | null
  pi_session_file: string | null
  checkpoint_json: string | null
  created_at: string
  updated_at: string
}

interface ArtifactRow {
  id: string
  thread_id: string
  kind: ArtifactKind
  version: number
  path: string | null
  data_json: string
  approved: 0 | 1
  created_at: string
}

interface EventRow {
  seq: number
  thread_id: string
  type: PiSseEvent["type"]
  payload_json: string
  created_at: string
}

interface PipelinePlanRow {
  thread_id: string
  plan_json: string
  created_at: string
  updated_at: string
}

interface ActionAttemptRow {
  schema_version: 1
  action_key: string
  thread_id: string
  plan_id: string
  mode: PipelineMode
  action: string
  input_fingerprint: string
  status: ActionAttemptStatus
  outcome_json: string | null
  error_json: string | null
  attempt_count: number
  started_at: string
  finished_at: string | null
  updated_at: string
  artifact_metadata_json: string | null
  effect_metadata_json: string | null
}

export interface ListActionAttemptsOptions {
  readonly limit?: number
  readonly status?: ActionAttemptStatus
}

export interface CreateThreadInput {
  id?: string
  title?: string | null
  piSessionId?: string | null
  piSessionFile?: string | null
}

export interface SaveArtifactInput<TData = unknown> {
  id?: string
  threadId: string
  kind: ArtifactKind
  path?: string | null
  data: TData
  approved?: boolean
}

export interface ActionArtifactCommitResult {
  readonly completion: ActionAttemptMutationResult
  readonly artifacts: readonly ArtifactRecord[]
  readonly checkpoint: CheckpointRecord | null
}

export class AgentPiStore {
  readonly db: Database.Database

  constructor(dbPath = join(PROJECT_ROOT, ".generated/claqueta-pi/agent-pi.db")) {
    if (dbPath !== ":memory:") ensureDirectory(join(dbPath, ".."))
    this.db = new Database(dbPath)
    try {
      this.db.pragma("foreign_keys = ON")
      this.db.pragma("journal_mode = WAL")
      this.migrate()
    } catch (error) {
      this.db.close()
      throw error
    }
  }

  close(): void {
    this.db.close()
  }

  createThread(input: CreateThreadInput = {}): ThreadRecord {
    const id = input.id ?? randomUUID()
    this.db
      .prepare(
        `INSERT INTO threads (id, title, status, pi_session_id, pi_session_file)
         VALUES (@id, @title, 'idle', @piSessionId, @piSessionFile)`,
      )
      .run({
        id,
        title: input.title ?? null,
        piSessionId: input.piSessionId ?? null,
        piSessionFile: input.piSessionFile ?? null,
      })
    return this.getThread(id)!
  }

  getThread(threadId: string): ThreadRecord | null {
    const row = this.db.prepare("SELECT * FROM threads WHERE id = ?").get(threadId) as ThreadRow | undefined
    return row ? this.mapThread(row) : null
  }

  listThreads(limit = 50): ThreadRecord[] {
    const rows = this.db.prepare("SELECT * FROM threads ORDER BY updated_at DESC LIMIT ?").all(limit) as ThreadRow[]
    return rows.map((row) => this.mapThread(row))
  }

  updateThreadStatus(threadId: string, status: ThreadStatus): void {
    this.db.prepare("UPDATE threads SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, threadId)
  }

  updatePiSession(threadId: string, piSessionId: string, piSessionFile?: string | null): void {
    this.db
      .prepare(
        `UPDATE threads
         SET pi_session_id = ?, pi_session_file = ?, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(piSessionId, piSessionFile ?? null, threadId)
    this.db
      .prepare(
        `INSERT INTO pi_sessions (thread_id, pi_session_id, pi_session_file)
         VALUES (?, ?, ?)
         ON CONFLICT(thread_id) DO UPDATE SET
           pi_session_id = excluded.pi_session_id,
           pi_session_file = excluded.pi_session_file,
           updated_at = datetime('now')`,
      )
      .run(threadId, piSessionId, piSessionFile ?? null)
  }

  setCheckpoint(threadId: string, checkpoint: CheckpointRecord): void {
    this.db
      .prepare(
        `UPDATE threads
         SET status = 'waiting', checkpoint_json = ?, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(JSON.stringify(checkpoint), threadId)
  }

  clearCheckpoint(threadId: string, status: ThreadStatus = "idle"): void {
    this.db
      .prepare(
        `UPDATE threads
         SET status = ?, checkpoint_json = NULL, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(status, threadId)
  }

  getPipelinePlan(threadId: string): PipelinePlan | null {
    const row = this.db.prepare("SELECT * FROM pipeline_plans WHERE thread_id = ?").get(threadId) as
      | PipelinePlanRow
      | undefined
    return row ? this.mapPipelinePlan(row) : null
  }

  savePipelinePlan(plan: PipelinePlan): PipelinePlan {
    this.db
      .prepare(
        `INSERT INTO pipeline_plans (thread_id, plan_json)
         VALUES (?, ?)
         ON CONFLICT(thread_id) DO UPDATE SET
           plan_json = excluded.plan_json,
           updated_at = datetime('now')`,
      )
      .run(plan.threadId, JSON.stringify(plan))
    return this.getPipelinePlan(plan.threadId) ?? plan
  }

  /** Atomically claim an action key before a future parent-owned side effect runs. */
  beginActionAttempt(
    input: BeginActionAttemptInput,
    options: BeginActionAttemptOptions = {},
  ): BeginActionAttemptResult {
    this.validateActionAttemptIdentity(input)
    const transaction = this.db.transaction(() => {
      const existing = this.readActionAttemptRow(input.threadId, input.actionKey)
      if (!existing) {
        this.db
          .prepare(
            `INSERT INTO action_attempts (
               schema_version, action_key, thread_id, plan_id, mode, action, input_fingerprint, status,
               outcome_json, error_json, attempt_count, started_at, finished_at, updated_at,
               artifact_metadata_json, effect_metadata_json
             ) VALUES (?, ?, ?, ?, ?, ?, ?, 'started', NULL, NULL, 1,
               strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL,
               strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ?, ?)`,
          )
          .run(
            ACTION_JOURNAL_SCHEMA_VERSION,
            input.actionKey,
            input.threadId,
            input.planId,
            input.mode,
            input.action,
            input.inputFingerprint,
            this.serializeOptionalJson(input.artifactMetadata),
            this.serializeOptionalJson(input.effectMetadata),
          )
        return {
          status: "started" as const,
          retried: false,
          record: this.requireActionAttempt(input.threadId, input.actionKey),
        }
      }

      const record = this.mapActionAttempt(existing)
      if (record.inputFingerprint !== input.inputFingerprint) {
        return { status: "conflict" as const, reason: "input_fingerprint_mismatch" as const, record }
      }
      if (record.planId !== input.planId || record.mode !== input.mode || record.action !== input.action) {
        return { status: "conflict" as const, reason: "action_identity_mismatch" as const, record }
      }
      if (record.status === "succeeded") return { status: "succeeded" as const, duplicate: true as const, record }
      if (record.status === "started") return { status: "in_progress" as const, record }
      if (!options.retryFailed) return { status: "failed" as const, retryable: true as const, record }

      this.db
        .prepare(
          `UPDATE action_attempts
           SET status = 'started', outcome_json = NULL, error_json = NULL, finished_at = NULL,
               attempt_count = attempt_count + 1,
               started_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
               updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE thread_id = ? AND action_key = ? AND status = 'failed'`,
        )
        .run(input.threadId, input.actionKey)
      return {
        status: "started" as const,
        retried: true,
        record: this.requireActionAttempt(input.threadId, input.actionKey),
      }
    })
    return transaction.immediate()
  }

  /** Atomically records the outcome of a claimed action. It never invokes the outcome or its effects. */
  succeedActionAttempt(input: CompleteActionAttemptInput): ActionAttemptMutationResult {
    this.validateCompletionInput(input)
    const transaction = this.db.transaction(() => {
      const existing = this.readActionAttemptRow(input.threadId, input.actionKey)
      if (!existing) return { status: "rejected" as const, reason: "not_found" as const }
      const record = this.mapActionAttempt(existing)
      if (record.inputFingerprint !== input.inputFingerprint) {
        return { status: "rejected" as const, reason: "input_fingerprint_mismatch" as const, record }
      }
      if (record.attemptCount !== input.attemptCount) {
        return { status: "rejected" as const, reason: "attempt_count_mismatch" as const, record }
      }
      if (record.status === "succeeded") return { status: "succeeded" as const, duplicate: true, record }
      if (record.status !== "started") return { status: "rejected" as const, reason: "not_started" as const, record }

      const outcomeJson = this.serializeOptionalJson(input.outcome)
      const artifactMetadataJson = this.serializeOptionalJson(input.artifactMetadata)
      const effectMetadataJson = this.serializeOptionalJson(input.effectMetadata)
      this.db
        .prepare(
          `UPDATE action_attempts
           SET status = 'succeeded', outcome_json = ?, error_json = NULL, finished_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
               updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
               artifact_metadata_json = COALESCE(?, artifact_metadata_json),
               effect_metadata_json = COALESCE(?, effect_metadata_json)
           WHERE thread_id = ? AND action_key = ? AND status = 'started'`,
        )
        .run(outcomeJson, artifactMetadataJson, effectMetadataJson, input.threadId, input.actionKey)
      return {
        status: "succeeded" as const,
        duplicate: false,
        record: this.requireActionAttempt(input.threadId, input.actionKey),
      }
    })
    return transaction.immediate()
  }

  /** Atomically persists internal artifacts and the matching action success, eliminating orphan-artifact windows. */
  succeedActionAttemptWithArtifacts(
    input: CompleteActionAttemptInput,
    artifacts: readonly SaveArtifactInput[],
    checkpoint: CheckpointRecord | null = null,
    plan: PipelinePlan | null = null,
  ): ActionArtifactCommitResult {
    this.validateCompletionInput(input)
    if (artifacts.some((artifact) => artifact.threadId !== input.threadId)) {
      throw new Error("Action artifacts must belong to the claimed thread")
    }
    const transaction = this.db.transaction(() => {
      const saved = artifacts.map((artifact) => this.saveArtifact(artifact))
      if (checkpoint) this.setCheckpoint(input.threadId, checkpoint)
      if (plan) {
        if (plan.threadId !== input.threadId) throw new Error("Action plan must belong to the claimed thread")
        this.savePipelinePlan(plan)
      }
      const completion = this.succeedActionAttempt({
        ...input,
        artifactMetadata: {
          artifactIds: saved.map((artifact) => artifact.id),
          artifacts: saved.map((artifact) => ({
            id: artifact.id,
            kind: artifact.kind,
            version: artifact.version,
            approved: artifact.approved,
          })),
        },
      })
      if (completion.status !== "succeeded") {
        const reason = completion.status === "rejected" ? completion.reason : "unexpected_failure_status"
        throw new Error(`Atomic action artifact commit was rejected: ${reason}`)
      }
      return { completion, artifacts: saved, checkpoint }
    })
    return transaction.immediate()
  }

  /** Atomically records a typed failure. A later begin must opt into the explicit failed-retry policy. */
  failActionAttempt(input: FailActionAttemptInput): ActionAttemptMutationResult {
    this.validateFailureInput(input)
    const transaction = this.db.transaction(() => {
      const existing = this.readActionAttemptRow(input.threadId, input.actionKey)
      if (!existing) return { status: "rejected" as const, reason: "not_found" as const }
      const record = this.mapActionAttempt(existing)
      if (record.inputFingerprint !== input.inputFingerprint) {
        return { status: "rejected" as const, reason: "input_fingerprint_mismatch" as const, record }
      }
      if (record.attemptCount !== input.attemptCount) {
        return { status: "rejected" as const, reason: "attempt_count_mismatch" as const, record }
      }
      if (record.status === "failed") return { status: "failed" as const, duplicate: true, record }
      if (record.status === "succeeded")
        return { status: "rejected" as const, reason: "already_succeeded" as const, record }

      const errorJson = this.serializeOptionalJson(input.error)
      const artifactMetadataJson = this.serializeOptionalJson(input.artifactMetadata)
      const effectMetadataJson = this.serializeOptionalJson(input.effectMetadata)
      this.db
        .prepare(
          `UPDATE action_attempts
           SET status = 'failed', outcome_json = NULL, error_json = ?, finished_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
               updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
               artifact_metadata_json = COALESCE(?, artifact_metadata_json),
               effect_metadata_json = COALESCE(?, effect_metadata_json)
           WHERE thread_id = ? AND action_key = ? AND status = 'started'`,
        )
        .run(errorJson, artifactMetadataJson, effectMetadataJson, input.threadId, input.actionKey)
      return {
        status: "failed" as const,
        duplicate: false,
        record: this.requireActionAttempt(input.threadId, input.actionKey),
      }
    })
    return transaction.immediate()
  }

  readActionAttempt(threadId: string, actionKey: ActionKey): ActionAttemptRecord | null {
    const row = this.readActionAttemptRow(threadId, actionKey)
    return row ? this.mapActionAttempt(row) : null
  }

  getActionAttempt(threadId: string, actionKey: ActionKey): ActionAttemptRecord | null {
    return this.readActionAttempt(threadId, actionKey)
  }

  listActionAttempts(threadId: string, options: ListActionAttemptsOptions = {}): ActionAttemptRecord[] {
    const limit = options.limit ?? 100
    if (!Number.isInteger(limit) || limit < 1) throw new Error("Action attempt list limit must be a positive integer")
    const rows = options.status
      ? (this.db
          .prepare(
            `SELECT * FROM action_attempts
             WHERE thread_id = ? AND status = ?
             ORDER BY updated_at DESC, action_key ASC LIMIT ?`,
          )
          .all(threadId, options.status, limit) as ActionAttemptRow[])
      : (this.db
          .prepare(
            `SELECT * FROM action_attempts
             WHERE thread_id = ?
             ORDER BY updated_at DESC, action_key ASC LIMIT ?`,
          )
          .all(threadId, limit) as ActionAttemptRow[])
    return rows.map((row) => this.mapActionAttempt(row))
  }

  saveArtifact<TData = unknown>(input: SaveArtifactInput<TData>): ArtifactRecord<TData> {
    const id = input.id ?? randomUUID()
    const nextVersion = this.nextArtifactVersion(input.threadId, input.kind)
    this.db
      .prepare(
        `INSERT INTO artifacts (id, thread_id, kind, version, path, data_json, approved)
         VALUES (@id, @threadId, @kind, @version, @path, @dataJson, @approved)`,
      )
      .run({
        id,
        threadId: input.threadId,
        kind: input.kind,
        version: nextVersion,
        path: input.path ?? null,
        dataJson: JSON.stringify(input.data),
        approved: input.approved ? 1 : 0,
      })
    return this.getArtifact<TData>(id)!
  }

  getArtifact<TData = unknown>(artifactId: string): ArtifactRecord<TData> | null {
    const row = this.db.prepare("SELECT * FROM artifacts WHERE id = ?").get(artifactId) as ArtifactRow | undefined
    return row ? this.mapArtifact<TData>(row) : null
  }

  listArtifacts(threadId: string): ArtifactRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM artifacts WHERE thread_id = ? ORDER BY created_at ASC, version ASC")
      .all(threadId) as ArtifactRow[]
    return rows.map((row) => this.mapArtifact(row))
  }

  markArtifactApproved(artifactId: string): void {
    this.db.prepare("UPDATE artifacts SET approved = 1 WHERE id = ?").run(artifactId)
  }

  appendEvent<TPayload>(event: Omit<PiSseEvent<TPayload>, "seq" | "createdAt">): PiSseEvent<TPayload> {
    const info = this.db
      .prepare(
        `INSERT INTO events (thread_id, type, payload_json)
         VALUES (@threadId, @type, @payloadJson)`,
      )
      .run({ threadId: event.threadId, type: event.type, payloadJson: JSON.stringify(event.payload) })
    const row = this.db.prepare("SELECT * FROM events WHERE seq = ?").get(info.lastInsertRowid) as EventRow
    return this.mapEvent<TPayload>(row)
  }

  listEvents(threadId: string, afterSeq = 0, limit = 500): PiSseEvent[] {
    const rows = this.db
      .prepare("SELECT * FROM events WHERE thread_id = ? AND seq > ? ORDER BY seq ASC LIMIT ?")
      .all(threadId, afterSeq, limit) as EventRow[]
    return rows.map((row) => this.mapEvent(row))
  }

  private readActionAttemptRow(threadId: string, actionKey: ActionKey): ActionAttemptRow | undefined {
    return this.db
      .prepare("SELECT * FROM action_attempts WHERE thread_id = ? AND action_key = ?")
      .get(threadId, actionKey) as ActionAttemptRow | undefined
  }

  private requireActionAttempt(threadId: string, actionKey: ActionKey): ActionAttemptRecord {
    const row = this.readActionAttemptRow(threadId, actionKey)
    if (!row) throw new Error(`Action attempt disappeared: ${threadId}/${actionKey}`)
    return this.mapActionAttempt(row)
  }

  private validateActionAttemptIdentity(input: BeginActionAttemptInput): void {
    for (const [name, value] of [
      ["action key", input.actionKey],
      ["thread id", input.threadId],
      ["plan id", input.planId],
      ["action", input.action],
      ["input snapshot fingerprint", input.inputFingerprint],
    ] as const) {
      if (typeof value !== "string" || value.trim().length === 0) throw new Error(`Action ${name} must not be empty`)
    }
    if (!/^[a-f0-9]{64}$/.test(input.inputFingerprint))
      throw new Error("Input snapshot fingerprint must be a lowercase SHA-256 digest")
  }

  private validateCompletionInput(input: CompleteActionAttemptInput): void {
    if (typeof input.threadId !== "string" || input.threadId.trim().length === 0)
      throw new Error("Action thread id must not be empty")
    if (typeof input.actionKey !== "string" || input.actionKey.trim().length === 0)
      throw new Error("Action key must not be empty")
    if (typeof input.inputFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(input.inputFingerprint))
      throw new Error("Input snapshot fingerprint must be a lowercase SHA-256 digest")
    if (!Number.isInteger(input.attemptCount) || input.attemptCount < 1)
      throw new Error("Action attempt count must be a positive integer")
  }

  private validateFailureInput(input: FailActionAttemptInput): void {
    this.validateCompletionInput(input)
    if (
      !input.error ||
      typeof input.error.code !== "string" ||
      input.error.code.trim().length === 0 ||
      typeof input.error.message !== "string" ||
      input.error.message.trim().length === 0
    ) {
      throw new Error("Action failure error requires a code and message")
    }
  }

  private serializeOptionalJson(value: unknown): string | null {
    if (value === undefined) return null
    return JSON.stringify(value, (_key, item: unknown) => {
      if (typeof item === "number" && !Number.isFinite(item))
        throw new Error("Action journal JSON must not contain non-finite numbers")
      if (["undefined", "function", "symbol", "bigint"].includes(typeof item))
        throw new Error("Action journal values must be JSON-serializable without data loss")
      return item
    })
  }

  private parseActionJson(value: string, column: string, row: ActionAttemptRow): unknown {
    try {
      return JSON.parse(value) as unknown
    } catch (error) {
      throw new Error(`Corrupt action journal JSON in ${column} for ${row.thread_id}/${row.action_key}`, {
        cause: error,
      })
    }
  }

  private mapActionAttempt(row: ActionAttemptRow): ActionAttemptRecord {
    if (row.schema_version !== ACTION_JOURNAL_SCHEMA_VERSION)
      throw new Error(`Unsupported action journal row schema version: ${String(row.schema_version)}`)
    if (!Number.isInteger(row.attempt_count) || row.attempt_count < 1)
      throw new Error(`Corrupt action journal attempt count for ${row.thread_id}/${row.action_key}`)
    if (!["started", "succeeded", "failed"].includes(row.status))
      throw new Error(`Corrupt action journal status for ${row.thread_id}/${row.action_key}`)
    if (
      (row.status === "started" &&
        (row.outcome_json !== null || row.error_json !== null || row.finished_at !== null)) ||
      (row.status === "succeeded" && (row.error_json !== null || row.finished_at === null)) ||
      (row.status === "failed" && (row.outcome_json !== null || row.error_json === null || row.finished_at === null))
    ) {
      throw new Error(`Inconsistent action journal lifecycle for ${row.thread_id}/${row.action_key}`)
    }
    const parsedError = row.error_json === null ? null : this.parseActionJson(row.error_json, "error_json", row)
    if (
      parsedError !== null &&
      (typeof parsedError !== "object" ||
        Array.isArray(parsedError) ||
        typeof (parsedError as Record<string, unknown>).code !== "string" ||
        typeof (parsedError as Record<string, unknown>).message !== "string")
    ) {
      throw new Error(`Corrupt action journal error for ${row.thread_id}/${row.action_key}`)
    }
    return {
      schemaVersion: row.schema_version,
      actionKey: row.action_key as ActionKey,
      threadId: row.thread_id,
      planId: row.plan_id,
      mode: row.mode,
      action: row.action as ActionName,
      inputFingerprint: row.input_fingerprint as InputSnapshotFingerprint,
      status: row.status,
      outcome: row.outcome_json === null ? null : this.parseActionJson(row.outcome_json, "outcome_json", row),
      error: parsedError as ActionAttemptError | null,
      attemptCount: row.attempt_count,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      updatedAt: row.updated_at,
      artifactMetadata:
        row.artifact_metadata_json === null
          ? null
          : this.parseActionJson(row.artifact_metadata_json, "artifact_metadata_json", row),
      effectMetadata:
        row.effect_metadata_json === null
          ? null
          : this.parseActionJson(row.effect_metadata_json, "effect_metadata_json", row),
    }
  }

  private nextArtifactVersion(threadId: string, kind: ArtifactKind): number {
    const row = this.db
      .prepare("SELECT COALESCE(MAX(version), 0) + 1 as version FROM artifacts WHERE thread_id = ? AND kind = ?")
      .get(threadId, kind) as { version: number }
    return row.version
  }

  private mapThread(row: ThreadRow): ThreadRecord {
    return {
      id: row.id,
      title: row.title,
      status: row.status,
      piSessionId: row.pi_session_id,
      piSessionFile: row.pi_session_file,
      checkpoint: row.checkpoint_json ? (JSON.parse(row.checkpoint_json) as CheckpointRecord) : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  private mapArtifact<TData>(row: ArtifactRow): ArtifactRecord<TData> {
    return {
      id: row.id,
      threadId: row.thread_id,
      kind: row.kind,
      version: row.version,
      path: row.path,
      data: JSON.parse(row.data_json) as TData,
      approved: row.approved === 1,
      createdAt: row.created_at,
    }
  }

  private mapEvent<TPayload>(row: EventRow): PiSseEvent<TPayload> {
    return {
      seq: row.seq,
      threadId: row.thread_id,
      type: row.type,
      payload: JSON.parse(row.payload_json) as TPayload,
      createdAt: row.created_at,
    }
  }

  private mapPipelinePlan(row: PipelinePlanRow): PipelinePlan {
    return JSON.parse(row.plan_json) as PipelinePlan
  }

  private migrate(): void {
    const migrate = this.db.transaction(() => {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS threads (
          id TEXT PRIMARY KEY,
          title TEXT,
          status TEXT NOT NULL DEFAULT 'idle',
          pi_session_id TEXT,
          pi_session_file TEXT,
          checkpoint_json TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS artifacts (
          id TEXT PRIMARY KEY,
          thread_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          version INTEGER NOT NULL,
          path TEXT,
          data_json TEXT NOT NULL,
          approved INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_artifacts_thread_kind ON artifacts(thread_id, kind, version);

        CREATE TABLE IF NOT EXISTS events (
          seq INTEGER PRIMARY KEY AUTOINCREMENT,
          thread_id TEXT NOT NULL,
          type TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_events_thread_seq ON events(thread_id, seq);

        CREATE TABLE IF NOT EXISTS pipeline_plans (
          thread_id TEXT PRIMARY KEY,
          plan_json TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS pi_sessions (
          thread_id TEXT PRIMARY KEY,
          pi_session_id TEXT NOT NULL,
          pi_session_file TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
      `)

      const currentVersion = this.db
        .prepare("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations")
        .get() as { version: number }
      if (currentVersion.version > ACTION_JOURNAL_SCHEMA_VERSION) {
        throw new Error(
          `Database schema version ${currentVersion.version} is newer than supported version ${ACTION_JOURNAL_SCHEMA_VERSION}`,
        )
      }
      if (currentVersion.version < ACTION_JOURNAL_SCHEMA_VERSION) {
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS action_attempts (
            schema_version INTEGER NOT NULL DEFAULT ${ACTION_JOURNAL_SCHEMA_VERSION} CHECK(schema_version = ${ACTION_JOURNAL_SCHEMA_VERSION}),
            action_key TEXT NOT NULL CHECK(length(trim(action_key)) > 0),
            thread_id TEXT NOT NULL,
            plan_id TEXT NOT NULL CHECK(length(trim(plan_id)) > 0),
            mode TEXT NOT NULL CHECK(mode IN (
              'new_video', 'revise_existing', 'render_only', 'recover_failed_render',
              'audit_only', 'variant', 'asset_regeneration', 'question'
            )),
            action TEXT NOT NULL CHECK(length(trim(action)) > 0),
            input_fingerprint TEXT NOT NULL CHECK(length(trim(input_fingerprint)) > 0),
            status TEXT NOT NULL CHECK(status IN ('started', 'succeeded', 'failed')),
            outcome_json TEXT,
            error_json TEXT,
            attempt_count INTEGER NOT NULL DEFAULT 1 CHECK(attempt_count > 0),
            started_at TEXT NOT NULL,
            finished_at TEXT,
            updated_at TEXT NOT NULL,
            artifact_metadata_json TEXT,
            effect_metadata_json TEXT,
            PRIMARY KEY(thread_id, action_key),
            FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE
          );

          CREATE INDEX IF NOT EXISTS idx_action_attempts_thread_updated
            ON action_attempts(thread_id, updated_at DESC);
          CREATE INDEX IF NOT EXISTS idx_action_attempts_thread_status
            ON action_attempts(thread_id, status, updated_at DESC);
        `)
        this.validateActionJournalSchema()
        this.db.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(ACTION_JOURNAL_SCHEMA_VERSION)
      } else {
        this.validateActionJournalSchema()
      }
    })
    migrate.immediate()
  }

  private validateActionJournalSchema(): void {
    const columns = this.db.prepare("PRAGMA table_info(action_attempts)").all() as Array<{
      name: string
      notnull: 0 | 1
      pk: number
    }>
    const requiredColumns = [
      "schema_version",
      "action_key",
      "thread_id",
      "plan_id",
      "mode",
      "action",
      "input_fingerprint",
      "status",
      "outcome_json",
      "error_json",
      "attempt_count",
      "started_at",
      "finished_at",
      "updated_at",
      "artifact_metadata_json",
      "effect_metadata_json",
    ]
    if (columns.length === 0 || requiredColumns.some((name) => !columns.some((column) => column.name === name))) {
      throw new Error("Action journal migration is marked applied but action_attempts has an incompatible schema")
    }
    const primaryKey = columns
      .filter((column) => column.pk > 0)
      .sort((left, right) => left.pk - right.pk)
      .map((column) => column.name)
    if (primaryKey.join(",") !== "thread_id,action_key") {
      throw new Error("Action journal requires a (thread_id, action_key) primary key")
    }
    const invalidVersion = this.db
      .prepare("SELECT 1 FROM action_attempts WHERE schema_version <> ? LIMIT 1")
      .get(ACTION_JOURNAL_SCHEMA_VERSION)
    if (invalidVersion) throw new Error("Action journal contains rows with an unsupported schema version")
  }
}
