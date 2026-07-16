import Database from "better-sqlite3"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import { ensureDirectory, PROJECT_ROOT } from "./paths.js"
import { ACTION_JOURNAL_SCHEMA_VERSION } from "./actionJournal.js"
import { ThreadStateKernel, type ThreadMutationContext, type DurableEventRow } from "./threadStateKernel.js"
export const STORE_SCHEMA_VERSION = 2 as const

const SCHEMA_MIGRATIONS_SQL =
  "CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))"

const V1_TABLE_SQL = {
  threads:
    "CREATE TABLE threads (id TEXT PRIMARY KEY, title TEXT, status TEXT NOT NULL DEFAULT 'idle', pi_session_id TEXT, pi_session_file TEXT, checkpoint_json TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')))",
  artifacts:
    "CREATE TABLE artifacts (id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, kind TEXT NOT NULL, version INTEGER NOT NULL, path TEXT, data_json TEXT NOT NULL, approved INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE)",
  events:
    "CREATE TABLE events (seq INTEGER PRIMARY KEY AUTOINCREMENT, thread_id TEXT NOT NULL, type TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE)",
  pipeline_plans:
    "CREATE TABLE pipeline_plans (thread_id TEXT PRIMARY KEY, plan_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE)",
  pi_sessions:
    "CREATE TABLE pi_sessions (thread_id TEXT PRIMARY KEY, pi_session_id TEXT NOT NULL, pi_session_file TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE)",
} as const

const V2_TABLE_SQL = {
  threads:
    "CREATE TABLE threads (id TEXT PRIMARY KEY, title TEXT, status TEXT NOT NULL DEFAULT 'idle', pi_session_id TEXT, pi_session_file TEXT, checkpoint_json TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), revision INTEGER NOT NULL DEFAULT 0 CHECK(revision BETWEEN 0 AND 9007199254740991), last_event_seq INTEGER NOT NULL DEFAULT 0 CHECK(last_event_seq BETWEEN 0 AND 9007199254740991))",
  events:
    "CREATE TABLE events (event_id INTEGER PRIMARY KEY AUTOINCREMENT, thread_id TEXT NOT NULL, thread_seq INTEGER NOT NULL CHECK(thread_seq > 0), revision INTEGER NOT NULL CHECK(revision > 0), type TEXT NOT NULL CHECK(length(trim(type)) > 0), payload_json TEXT NOT NULL CHECK(json_valid(payload_json)), created_at TEXT NOT NULL, UNIQUE(thread_id, thread_seq), UNIQUE(event_id, thread_id, thread_seq), FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE)",
  event_outbox:
    "CREATE TABLE event_outbox (outbox_id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER NOT NULL UNIQUE, attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count >= 0), last_attempt_at TEXT, last_error TEXT, delivered_at TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), FOREIGN KEY(event_id) REFERENCES events(event_id) ON DELETE CASCADE)",
} as const

const ACTION_ATTEMPTS_SQL =
  "CREATE TABLE action_attempts (schema_version INTEGER NOT NULL DEFAULT 1 CHECK(schema_version = 1), action_key TEXT NOT NULL CHECK(length(trim(action_key)) > 0), thread_id TEXT NOT NULL, plan_id TEXT NOT NULL CHECK(length(trim(plan_id)) > 0), mode TEXT NOT NULL CHECK(mode IN ('new_video', 'revise_existing', 'render_only', 'recover_failed_render', 'audit_only', 'variant', 'asset_regeneration', 'question')), action TEXT NOT NULL CHECK(length(trim(action)) > 0), input_fingerprint TEXT NOT NULL CHECK(length(trim(input_fingerprint)) > 0), status TEXT NOT NULL CHECK(status IN ('started', 'succeeded', 'failed')), outcome_json TEXT, error_json TEXT, attempt_count INTEGER NOT NULL DEFAULT 1 CHECK(attempt_count > 0), started_at TEXT NOT NULL, finished_at TEXT, updated_at TEXT NOT NULL, artifact_metadata_json TEXT, effect_metadata_json TEXT, PRIMARY KEY(thread_id, action_key), FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE)"

const PRESERVED_INDEX_SQL = {
  artifacts: "CREATE INDEX idx_artifacts_thread_kind ON artifacts(thread_id, kind, version)",
  eventsV1: "CREATE INDEX idx_events_thread_seq ON events(thread_id, seq)",
  eventsV2: "CREATE INDEX idx_events_thread_seq ON events(thread_id, thread_seq)",
  actionUpdated: "CREATE INDEX idx_action_attempts_thread_updated ON action_attempts(thread_id, updated_at DESC)",
  actionStatus: "CREATE INDEX idx_action_attempts_thread_status ON action_attempts(thread_id, status, updated_at DESC)",
  outboxPending: "CREATE INDEX idx_event_outbox_pending ON event_outbox(event_id) WHERE delivered_at IS NULL",
} as const

const STORE_TRIGGER_SQL = {
  revision:
    "CREATE TRIGGER trg_threads_revision_unit BEFORE UPDATE OF revision ON threads WHEN NEW.revision != OLD.revision + 1 BEGIN SELECT RAISE(ABORT, 'thread revision must increment by one'); END",
  eventSeq:
    "CREATE TRIGGER trg_threads_event_seq_unit BEFORE UPDATE OF last_event_seq ON threads WHEN NEW.last_event_seq != OLD.last_event_seq + 1 BEGIN SELECT RAISE(ABORT, 'thread event sequence must increment by one'); END",
  eventRevision:
    "CREATE TRIGGER trg_events_revision_current BEFORE INSERT ON events WHEN NEW.revision != (SELECT revision FROM threads WHERE id = NEW.thread_id) BEGIN SELECT RAISE(ABORT, 'event revision must equal current thread revision'); END",
  eventSeqCurrent:
    "CREATE TRIGGER trg_events_thread_seq_current BEFORE INSERT ON events WHEN NEW.thread_seq != (SELECT last_event_seq FROM threads WHERE id = NEW.thread_id) BEGIN SELECT RAISE(ABORT, 'event sequence must equal current thread sequence'); END",
  outbox:
    "CREATE TRIGGER trg_events_outbox AFTER INSERT ON events BEGIN INSERT INTO event_outbox(event_id) VALUES (NEW.event_id); END",
} as const

const PROTECTED_TRIGGER_TABLES = new Set([
  "schema_migrations",
  "threads",
  "artifacts",
  "events",
  "event_outbox",
  "pipeline_plans",
  "pi_sessions",
  "action_attempts",
])

const EXPECTED_STORE_TRIGGERS = [
  ["trg_threads_revision_unit", "threads", STORE_TRIGGER_SQL.revision],
  ["trg_threads_event_seq_unit", "threads", STORE_TRIGGER_SQL.eventSeq],
  ["trg_events_revision_current", "events", STORE_TRIGGER_SQL.eventRevision],
  ["trg_events_thread_seq_current", "events", STORE_TRIGGER_SQL.eventSeqCurrent],
  ["trg_events_outbox", "events", STORE_TRIGGER_SQL.outbox],
] as const

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
  PiSseEventDraft,
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
  revision: number
  last_event_seq: number
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
  event_id: number
  thread_id: string
  thread_seq: number
  revision: number
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
  readonly threadStateKernel: ThreadStateKernel

  constructor(dbPath = join(PROJECT_ROOT, ".generated/claqueta-pi/agent-pi.db")) {
    if (dbPath !== ":memory:") ensureDirectory(join(dbPath, ".."))
    this.db = new Database(dbPath)
    this.threadStateKernel = new ThreadStateKernel(this.db)
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
    this.threadStateKernel.withThreadMutation(threadId, (context) => {
      const result = this.db
        .prepare("UPDATE threads SET status = ?, updated_at = datetime('now') WHERE id = ?")
        .run(status, threadId)
      if (result.changes === 1) context.markChanged()
    })
  }

  updatePiSession(threadId: string, piSessionId: string, piSessionFile?: string | null): void {
    this.threadStateKernel.withThreadMutation(threadId, (context) => {
      const result = this.db
        .prepare(
          `UPDATE threads
           SET pi_session_id = ?, pi_session_file = ?, updated_at = datetime('now')
           WHERE id = ?`,
        )
        .run(piSessionId, piSessionFile ?? null, threadId)
      if (result.changes === 1) context.markChanged()
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
    })
  }

  setCheckpoint(threadId: string, checkpoint: CheckpointRecord): void {
    this.threadStateKernel.withThreadMutation(threadId, (context) => {
      const result = this.db
        .prepare(
          `UPDATE threads
           SET status = 'waiting', checkpoint_json = ?, updated_at = datetime('now')
           WHERE id = ?`,
        )
        .run(JSON.stringify(checkpoint), threadId)
      if (result.changes === 1) context.markChanged()
    })
  }

  clearCheckpoint(threadId: string, status: ThreadStatus = "idle"): void {
    this.threadStateKernel.withThreadMutation(threadId, (context) => {
      const result = this.db
        .prepare(
          `UPDATE threads
           SET status = ?, checkpoint_json = NULL, updated_at = datetime('now')
           WHERE id = ?`,
        )
        .run(status, threadId)
      if (result.changes === 1) context.markChanged()
    })
  }

  getPipelinePlan(threadId: string): PipelinePlan | null {
    const row = this.db.prepare("SELECT * FROM pipeline_plans WHERE thread_id = ?").get(threadId) as
      | PipelinePlanRow
      | undefined
    return row ? this.mapPipelinePlan(row) : null
  }

  savePipelinePlan(plan: PipelinePlan): PipelinePlan {
    this.threadStateKernel.withThreadMutation(plan.threadId, (context) => {
      this.db
        .prepare(
          `INSERT INTO pipeline_plans (thread_id, plan_json)
           VALUES (?, ?)
           ON CONFLICT(thread_id) DO UPDATE SET
             plan_json = excluded.plan_json,
             updated_at = datetime('now')`,
        )
        .run(plan.threadId, JSON.stringify(plan))
      context.markChanged()
    })
    return this.getPipelinePlan(plan.threadId) ?? plan
  }

  /** Atomically claim an action key before a future parent-owned side effect runs. */
  beginActionAttempt(
    input: BeginActionAttemptInput,
    options: BeginActionAttemptOptions = {},
  ): BeginActionAttemptResult {
    this.validateActionAttemptIdentity(input)
    return this.threadStateKernel.withThreadMutation(input.threadId, (context) => {
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
        context.markChanged()
        return {
          status: "started" as const,
          retried: false,
          record: this.requireActionAttempt(input.threadId, input.actionKey),
        }
      }
      const record = this.mapActionAttempt(existing)
      if (record.inputFingerprint !== input.inputFingerprint)
        return { status: "conflict" as const, reason: "input_fingerprint_mismatch" as const, record }
      if (record.planId !== input.planId || record.mode !== input.mode || record.action !== input.action)
        return { status: "conflict" as const, reason: "action_identity_mismatch" as const, record }
      if (record.status === "succeeded") return { status: "succeeded" as const, duplicate: true as const, record }
      if (record.status === "started") return { status: "in_progress" as const, record }
      if (!options.retryFailed) return { status: "failed" as const, retryable: true as const, record }
      this.db
        .prepare(
          `UPDATE action_attempts SET status = 'started', outcome_json = NULL, error_json = NULL, finished_at = NULL,
         attempt_count = attempt_count + 1, started_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE thread_id = ? AND action_key = ? AND status = 'failed'`,
        )
        .run(input.threadId, input.actionKey)
      context.markChanged()
      return {
        status: "started" as const,
        retried: true,
        record: this.requireActionAttempt(input.threadId, input.actionKey),
      }
    }).value
  }

  /** Atomically records the outcome of a claimed action. It never invokes the outcome or its effects. */
  succeedActionAttempt(input: CompleteActionAttemptInput): ActionAttemptMutationResult {
    this.validateCompletionInput(input)
    return this.threadStateKernel.withThreadMutation(input.threadId, (context) => {
      const result = this.completeActionAttemptMutation(input, context)
      return result
    }).value
  }

  /** Atomically persists internal artifacts and the matching action success, eliminating orphan-artifact windows. */
  succeedActionAttemptWithArtifacts(
    input: CompleteActionAttemptInput,
    artifacts: readonly SaveArtifactInput[],
    checkpoint: CheckpointRecord | null = null,
    plan: PipelinePlan | null = null,
  ): ActionArtifactCommitResult {
    this.validateCompletionInput(input)
    if (artifacts.some((artifact) => artifact.threadId !== input.threadId))
      throw new Error("Action artifacts must belong to the claimed thread")
    return this.threadStateKernel.withThreadMutation(input.threadId, () => {
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
    }).value
  }

  /** Atomically records a typed failure. A later begin must opt into the explicit failed-retry policy. */
  failActionAttempt(input: FailActionAttemptInput): ActionAttemptMutationResult {
    this.validateFailureInput(input)
    return this.threadStateKernel.withThreadMutation(input.threadId, (context) => {
      const existing = this.readActionAttemptRow(input.threadId, input.actionKey)
      if (!existing) return { status: "rejected" as const, reason: "not_found" as const }
      const record = this.mapActionAttempt(existing)
      if (record.inputFingerprint !== input.inputFingerprint)
        return { status: "rejected" as const, reason: "input_fingerprint_mismatch" as const, record }
      if (record.attemptCount !== input.attemptCount)
        return { status: "rejected" as const, reason: "attempt_count_mismatch" as const, record }
      if (record.status === "failed") return { status: "failed" as const, duplicate: true, record }
      if (record.status === "succeeded")
        return { status: "rejected" as const, reason: "already_succeeded" as const, record }
      const errorJson = this.serializeOptionalJson(input.error)
      const artifactMetadataJson = this.serializeOptionalJson(input.artifactMetadata)
      const effectMetadataJson = this.serializeOptionalJson(input.effectMetadata)
      this.db
        .prepare(
          `UPDATE action_attempts SET status = 'failed', outcome_json = NULL, error_json = ?,
         finished_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
         artifact_metadata_json = COALESCE(?, artifact_metadata_json), effect_metadata_json = COALESCE(?, effect_metadata_json)
         WHERE thread_id = ? AND action_key = ? AND status = 'started'`,
        )
        .run(errorJson, artifactMetadataJson, effectMetadataJson, input.threadId, input.actionKey)
      context.markChanged()
      return {
        status: "failed" as const,
        duplicate: false,
        record: this.requireActionAttempt(input.threadId, input.actionKey),
      }
    }).value
  }

  private completeActionAttemptMutation(
    input: CompleteActionAttemptInput,
    context: ThreadMutationContext,
  ): ActionAttemptMutationResult {
    const existing = this.readActionAttemptRow(input.threadId, input.actionKey)
    if (!existing) return { status: "rejected" as const, reason: "not_found" as const }
    const record = this.mapActionAttempt(existing)
    if (record.inputFingerprint !== input.inputFingerprint)
      return { status: "rejected" as const, reason: "input_fingerprint_mismatch" as const, record }
    if (record.attemptCount !== input.attemptCount)
      return { status: "rejected" as const, reason: "attempt_count_mismatch" as const, record }
    if (record.status === "succeeded") return { status: "succeeded" as const, duplicate: true, record }
    if (record.status !== "started") return { status: "rejected" as const, reason: "not_started" as const, record }
    const outcomeJson = this.serializeOptionalJson(input.outcome)
    const artifactMetadataJson = this.serializeOptionalJson(input.artifactMetadata)
    const effectMetadataJson = this.serializeOptionalJson(input.effectMetadata)
    this.db
      .prepare(
        `UPDATE action_attempts SET status = 'succeeded', outcome_json = ?, error_json = NULL,
       finished_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
       artifact_metadata_json = COALESCE(?, artifact_metadata_json), effect_metadata_json = COALESCE(?, effect_metadata_json)
       WHERE thread_id = ? AND action_key = ? AND status = 'started'`,
      )
      .run(outcomeJson, artifactMetadataJson, effectMetadataJson, input.threadId, input.actionKey)
    context.markChanged()
    return {
      status: "succeeded" as const,
      duplicate: false,
      record: this.requireActionAttempt(input.threadId, input.actionKey),
    }
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
    return this.threadStateKernel.withThreadMutation(input.threadId, (context) => {
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
      context.markChanged()
      return this.getArtifact<TData>(id)!
    }).value
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
    const row = this.db.prepare("SELECT thread_id FROM artifacts WHERE id = ?").get(artifactId) as
      | { thread_id: string }
      | undefined
    if (!row) return
    this.threadStateKernel.withThreadMutation(row.thread_id, (context) => {
      const result = this.db.prepare("UPDATE artifacts SET approved = 1 WHERE id = ? AND approved = 0").run(artifactId)
      if (result.changes === 1) context.markChanged()
    })
  }

  appendEvent<TPayload>(event: PiSseEventDraft<TPayload>, onCommit?: () => void): PiSseEvent<TPayload> {
    return this.threadStateKernel.withThreadMutation(event.threadId, (context) => {
      const row = this.threadStateKernel.appendEvent(
        context,
        {
          threadId: event.threadId,
          type: event.type,
          payloadJson: JSON.stringify(event.payload),
        },
        onCommit,
      )
      return this.mapEvent<TPayload>(row)
    }).value
  }

  listEvents(threadId: string, afterSeq = 0, limit = 500): PiSseEvent[] {
    if (!Number.isInteger(afterSeq) || afterSeq < 0) throw new Error("Event cursor must be a non-negative integer")
    if (!Number.isInteger(limit) || limit < 1) throw new Error("Event list limit must be a positive integer")
    const rows = this.db
      .prepare(
        "SELECT event_id, thread_id, thread_seq, revision, type, payload_json, created_at FROM events WHERE thread_id = ? AND thread_seq > ? ORDER BY thread_seq ASC LIMIT ?",
      )
      .all(threadId, afterSeq, limit) as EventRow[]
    return rows.map((row) => this.mapEvent(row))
  }

  legacyEventIdToThreadSeq(threadId: string, eventId: number): number {
    if (!Number.isSafeInteger(eventId) || eventId < 0) throw new Error("Malformed legacy event cursor")
    const latest = this.db.prepare("SELECT MAX(event_id) AS event_id FROM events").get() as { event_id: number | null }
    if (latest.event_id !== null && eventId > latest.event_id) throw new Error("Event cursor is in the future")
    if (latest.event_id === null && eventId > 0) throw new Error("Event cursor is in the future")
    const row = this.db
      .prepare("SELECT COALESCE(MAX(thread_seq), 0) AS thread_seq FROM events WHERE thread_id = ? AND event_id <= ?")
      .get(threadId, eventId) as { thread_seq: number }
    return row.thread_seq
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
      revision: row.revision,
      lastEventSeq: row.last_event_seq,
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

  private mapEvent<TPayload>(row: EventRow | DurableEventRow): PiSseEvent<TPayload> {
    if ("thread_seq" in row) {
      return {
        seq: row.thread_seq,
        revision: row.revision,
        threadId: row.thread_id,
        type: row.type as PiSseEvent["type"],
        payload: JSON.parse(row.payload_json) as TPayload,
        createdAt: row.created_at,
      }
    }
    return {
      seq: row.threadSeq,
      revision: row.revision,
      threadId: row.threadId,
      type: row.type as PiSseEvent["type"],
      payload: JSON.parse(row.payloadJson) as TPayload,
      createdAt: row.createdAt,
    }
  }

  private mapPipelinePlan(row: PipelinePlanRow): PipelinePlan {
    return JSON.parse(row.plan_json) as PipelinePlan
  }

  private migrate(): void {
    const migrate = this.db.transaction(() => {
      this.db.exec(
        `CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))`,
      )
      const markers = (
        this.db.prepare("SELECT version FROM schema_migrations ORDER BY version").all() as Array<{ version: number }>
      ).map((row) => row.version)
      if (markers.some((version) => !Number.isInteger(version) || version < 1 || version > STORE_SCHEMA_VERSION))
        throw new Error("Database schema contains unsupported migration markers")
      if (markers.length === 0) {
        if (this.tableExists("event_outbox"))
          throw new Error("Pre-existing event_outbox requires a recognized migration")
        this.createSchemaV1()
        this.createActionJournalTable()
        this.db.prepare("INSERT INTO schema_migrations (version) VALUES (1)").run()
        markers.push(1)
      }
      if (markers.join(",") !== "1" && markers.join(",") !== `1,${STORE_SCHEMA_VERSION}`) {
        if (markers[0] !== undefined && markers[0] > 1)
          throw new Error(`Database schema version ${markers[0]} is newer than supported or incomplete`)
        throw new Error(`Unsupported schema migration sequence: {${markers.join(",")}}`)
      }
      this.validateActionJournalSchema()
      if (markers.join(",") === "1") {
        this.validateSchemaV1()
        this.migrateSchemaV1ToV2()
        this.db
          .prepare(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
          )
          .run(STORE_SCHEMA_VERSION)
      }
      this.validateStoreSchemaV2()
    })
    migrate.immediate()
  }

  private createSchemaV1(): void {
    this.db.exec(`
      CREATE TABLE threads (id TEXT PRIMARY KEY, title TEXT, status TEXT NOT NULL DEFAULT 'idle', pi_session_id TEXT, pi_session_file TEXT, checkpoint_json TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE artifacts (id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, kind TEXT NOT NULL, version INTEGER NOT NULL, path TEXT, data_json TEXT NOT NULL, approved INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE);
      CREATE INDEX idx_artifacts_thread_kind ON artifacts(thread_id, kind, version);
      CREATE TABLE events (seq INTEGER PRIMARY KEY AUTOINCREMENT, thread_id TEXT NOT NULL, type TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE);
      CREATE INDEX idx_events_thread_seq ON events(thread_id, seq);
      CREATE TABLE pipeline_plans (thread_id TEXT PRIMARY KEY, plan_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE);
      CREATE TABLE pi_sessions (thread_id TEXT PRIMARY KEY, pi_session_id TEXT NOT NULL, pi_session_file TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE);
    `)
  }

  private createActionJournalTable(): void {
    this.db.exec(`
      CREATE TABLE action_attempts (schema_version INTEGER NOT NULL DEFAULT 1 CHECK(schema_version = 1), action_key TEXT NOT NULL CHECK(length(trim(action_key)) > 0), thread_id TEXT NOT NULL, plan_id TEXT NOT NULL CHECK(length(trim(plan_id)) > 0), mode TEXT NOT NULL CHECK(mode IN ('new_video', 'revise_existing', 'render_only', 'recover_failed_render', 'audit_only', 'variant', 'asset_regeneration', 'question')), action TEXT NOT NULL CHECK(length(trim(action)) > 0), input_fingerprint TEXT NOT NULL CHECK(length(trim(input_fingerprint)) > 0), status TEXT NOT NULL CHECK(status IN ('started', 'succeeded', 'failed')), outcome_json TEXT, error_json TEXT, attempt_count INTEGER NOT NULL DEFAULT 1 CHECK(attempt_count > 0), started_at TEXT NOT NULL, finished_at TEXT, updated_at TEXT NOT NULL, artifact_metadata_json TEXT, effect_metadata_json TEXT, PRIMARY KEY(thread_id, action_key), FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE);
      CREATE INDEX idx_action_attempts_thread_updated ON action_attempts(thread_id, updated_at DESC);
      CREATE INDEX idx_action_attempts_thread_status ON action_attempts(thread_id, status, updated_at DESC);
    `)
  }

  private migrateSchemaV1ToV2(): void {
    this.db.exec(`
      ALTER TABLE threads ADD COLUMN revision INTEGER NOT NULL DEFAULT 0 CHECK(revision BETWEEN 0 AND 9007199254740991);
      ALTER TABLE threads ADD COLUMN last_event_seq INTEGER NOT NULL DEFAULT 0 CHECK(last_event_seq BETWEEN 0 AND 9007199254740991);
      ALTER TABLE events RENAME TO events_v1;
      DROP INDEX idx_events_thread_seq;
      CREATE TABLE events (event_id INTEGER PRIMARY KEY AUTOINCREMENT, thread_id TEXT NOT NULL, thread_seq INTEGER NOT NULL CHECK(thread_seq > 0), revision INTEGER NOT NULL CHECK(revision > 0), type TEXT NOT NULL CHECK(length(trim(type)) > 0), payload_json TEXT NOT NULL CHECK(json_valid(payload_json)), created_at TEXT NOT NULL, UNIQUE(thread_id, thread_seq), UNIQUE(event_id, thread_id, thread_seq), FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE);
      INSERT INTO events (event_id, thread_id, thread_seq, revision, type, payload_json, created_at) SELECT seq, thread_id, ROW_NUMBER() OVER (PARTITION BY thread_id ORDER BY seq), ROW_NUMBER() OVER (PARTITION BY thread_id ORDER BY seq), type, payload_json, created_at FROM events_v1;
      UPDATE threads SET last_event_seq = (SELECT COUNT(*) FROM events WHERE events.thread_id = threads.id), revision = (SELECT COUNT(*) FROM events WHERE events.thread_id = threads.id);
      CREATE TABLE event_outbox (outbox_id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER NOT NULL UNIQUE, attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count >= 0), last_attempt_at TEXT, last_error TEXT, delivered_at TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), FOREIGN KEY(event_id) REFERENCES events(event_id) ON DELETE CASCADE);
      CREATE INDEX idx_event_outbox_pending ON event_outbox(event_id) WHERE delivered_at IS NULL;
      CREATE INDEX idx_events_thread_seq ON events(thread_id, thread_seq);
      CREATE TRIGGER trg_threads_revision_unit BEFORE UPDATE OF revision ON threads WHEN NEW.revision != OLD.revision + 1 BEGIN SELECT RAISE(ABORT, 'thread revision must increment by one'); END;
      CREATE TRIGGER trg_threads_event_seq_unit BEFORE UPDATE OF last_event_seq ON threads WHEN NEW.last_event_seq != OLD.last_event_seq + 1 BEGIN SELECT RAISE(ABORT, 'thread event sequence must increment by one'); END;
      CREATE TRIGGER trg_events_revision_current BEFORE INSERT ON events WHEN NEW.revision != (SELECT revision FROM threads WHERE id = NEW.thread_id) BEGIN SELECT RAISE(ABORT, 'event revision must equal current thread revision'); END;
      CREATE TRIGGER trg_events_thread_seq_current BEFORE INSERT ON events WHEN NEW.thread_seq != (SELECT last_event_seq FROM threads WHERE id = NEW.thread_id) BEGIN SELECT RAISE(ABORT, 'event sequence must equal current thread sequence'); END;
      CREATE TRIGGER trg_events_outbox AFTER INSERT ON events BEGIN INSERT INTO event_outbox(event_id) VALUES (NEW.event_id); END;
      INSERT INTO event_outbox(event_id, delivered_at) SELECT event_id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM events;
      DROP TABLE events_v1;
    `)
  }

  private validateSchemaV1(): void {
    this.validateExactTable("schema_migrations", SCHEMA_MIGRATIONS_SQL)
    for (const [table, sql] of Object.entries(V1_TABLE_SQL)) this.validateExactTable(table, sql)
    this.validateExactTable("action_attempts", ACTION_ATTEMPTS_SQL)
    this.validateColumns("threads", [
      ["id", "TEXT", 0, null, 1],
      ["title", "TEXT", 0, null, 0],
      ["status", "TEXT", 1, "'idle'", 0],
      ["pi_session_id", "TEXT", 0, null, 0],
      ["pi_session_file", "TEXT", 0, null, 0],
      ["checkpoint_json", "TEXT", 0, null, 0],
      ["created_at", "TEXT", 1, "datetime('now')", 0],
      ["updated_at", "TEXT", 1, "datetime('now')", 0],
    ])
    this.validateColumns("events", [
      ["seq", "INTEGER", 0, null, 1],
      ["thread_id", "TEXT", 1, null, 0],
      ["type", "TEXT", 1, null, 0],
      ["payload_json", "TEXT", 1, null, 0],
      ["created_at", "TEXT", 1, "datetime('now')", 0],
    ])
    this.validatePreservedColumns(false)
    this.validatePreservedForeignKeys(false)
    this.validatePreservedIndexes(false)
    this.validateTriggers([])
    if (this.tableExists("event_outbox"))
      throw new Error("Version 1 schema contains an unrecognized event_outbox table")
    if (
      this.db
        .prepare("SELECT seq FROM events WHERE json_valid(payload_json) = 0 OR length(trim(type)) = 0 LIMIT 1")
        .get()
    )
      throw new Error("Version 1 event data is corrupt")
    this.validateForeignKeysAndQuickCheck()
  }

  private validateStoreSchemaV2(): void {
    this.validateExactTable("schema_migrations", SCHEMA_MIGRATIONS_SQL)
    this.validateExactTable("threads", V2_TABLE_SQL.threads)
    for (const table of ["artifacts", "pipeline_plans", "pi_sessions"] as const)
      this.validateExactTable(table, V1_TABLE_SQL[table])
    this.validateExactTable("action_attempts", ACTION_ATTEMPTS_SQL)
    this.validateExactTable("events", V2_TABLE_SQL.events)
    this.validateExactTable("event_outbox", V2_TABLE_SQL.event_outbox)
    this.validateColumns("threads", [
      ["id", "TEXT", 0, null, 1],
      ["title", "TEXT", 0, null, 0],
      ["status", "TEXT", 1, "'idle'", 0],
      ["pi_session_id", "TEXT", 0, null, 0],
      ["pi_session_file", "TEXT", 0, null, 0],
      ["checkpoint_json", "TEXT", 0, null, 0],
      ["created_at", "TEXT", 1, "datetime('now')", 0],
      ["updated_at", "TEXT", 1, "datetime('now')", 0],
      ["revision", "INTEGER", 1, "0", 0],
      ["last_event_seq", "INTEGER", 1, "0", 0],
    ])
    this.validateColumns("events", [
      ["event_id", "INTEGER", 0, null, 1],
      ["thread_id", "TEXT", 1, null, 0],
      ["thread_seq", "INTEGER", 1, null, 0],
      ["revision", "INTEGER", 1, null, 0],
      ["type", "TEXT", 1, null, 0],
      ["payload_json", "TEXT", 1, null, 0],
      ["created_at", "TEXT", 1, null, 0],
    ])
    this.validateColumns("event_outbox", [
      ["outbox_id", "INTEGER", 0, null, 1],
      ["event_id", "INTEGER", 1, null, 0],
      ["attempt_count", "INTEGER", 1, "0", 0],
      ["last_attempt_at", "TEXT", 0, null, 0],
      ["last_error", "TEXT", 0, null, 0],
      ["delivered_at", "TEXT", 0, null, 0],
      ["created_at", "TEXT", 1, "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')", 0],
    ])
    this.validatePreservedColumns(true)
    this.validatePreservedForeignKeys(true)
    this.validatePreservedIndexes(true)
    this.validateTriggers(EXPECTED_STORE_TRIGGERS)
    if (
      this.db
        .prepare(
          "SELECT id FROM threads WHERE revision NOT BETWEEN 0 AND 9007199254740991 OR last_event_seq NOT BETWEEN 0 AND 9007199254740991 LIMIT 1",
        )
        .get()
    )
      throw new Error("Corrupt thread counter")
    if (this.db.prepare("SELECT event_id FROM events WHERE json_valid(payload_json) = 0 LIMIT 1").get())
      throw new Error("Corrupt event payload JSON")
    if (
      this.db
        .prepare(
          `SELECT 1 FROM threads WHERE checkpoint_json IS NOT NULL AND json_valid(checkpoint_json) = 0
           UNION ALL SELECT 1 FROM artifacts WHERE json_valid(data_json) = 0
           UNION ALL SELECT 1 FROM pipeline_plans WHERE json_valid(plan_json) = 0
           UNION ALL SELECT 1 FROM action_attempts WHERE
             (outcome_json IS NOT NULL AND json_valid(outcome_json) = 0)
             OR (error_json IS NOT NULL AND json_valid(error_json) = 0)
             OR (artifact_metadata_json IS NOT NULL AND json_valid(artifact_metadata_json) = 0)
             OR (effect_metadata_json IS NOT NULL AND json_valid(effect_metadata_json) = 0)
           LIMIT 1`,
        )
        .get()
    )
      throw new Error("Corrupt persisted JSON")
    for (const row of this.db.prepare("SELECT * FROM action_attempts").all() as ActionAttemptRow[])
      this.mapActionAttempt(row)
    if (
      this.db
        .prepare(
          `SELECT 1 FROM (SELECT thread_id, thread_seq, ROW_NUMBER() OVER (PARTITION BY thread_id ORDER BY thread_seq) AS expected FROM events) WHERE thread_seq != expected LIMIT 1`,
        )
        .get()
    )
      throw new Error("Event sequence is not contiguous per thread")
    if (
      this.db
        .prepare(
          `SELECT t.id FROM threads t LEFT JOIN events e ON e.thread_id = t.id GROUP BY t.id HAVING t.last_event_seq != COUNT(e.event_id) OR t.last_event_seq != COALESCE(MAX(e.thread_seq), 0) OR t.revision < COALESCE(MAX(e.revision), 0) LIMIT 1`,
        )
        .get()
    )
      throw new Error("Thread event counters are inconsistent")
    if (
      this.db
        .prepare(
          "SELECT 1 FROM events e LEFT JOIN event_outbox o ON o.event_id = e.event_id WHERE o.event_id IS NULL UNION ALL SELECT 1 FROM event_outbox o LEFT JOIN events e ON e.event_id = o.event_id WHERE e.event_id IS NULL LIMIT 1",
        )
        .get()
    )
      throw new Error("Event and outbox rows are not one-to-one")
    this.validateForeignKeysAndQuickCheck()
  }

  private validateExactTable(table: string, sql: string): void {
    this.validateExactObject("table", table, sql)
  }

  private validateTriggers(expected: ReadonlyArray<readonly [string, string, string]>): void {
    const actual = this.db
      .prepare("SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'trigger'")
      .all() as Array<{ name: string; tbl_name: string; sql: string | null }>
    const protectedTriggers = actual.filter((trigger) => PROTECTED_TRIGGER_TABLES.has(trigger.tbl_name))
    if (protectedTriggers.length !== expected.length)
      throw new Error("Unexpected trigger attached to a protected store table")
    const expectedByName = new Map(expected.map(([name, table, sql]) => [name, { table, sql }]))
    for (const trigger of protectedTriggers) {
      const definition = expectedByName.get(trigger.name)
      if (
        !definition ||
        trigger.tbl_name !== definition.table ||
        canonicalizeSql(trigger.sql ?? "") !== canonicalizeSql(definition.sql)
      )
        throw new Error(`Incompatible trigger definition: ${trigger.name}`)
    }
  }

  private validateExactObject(type: "table" | "index" | "trigger", name: string, sql: string): void {
    const object = this.db.prepare("SELECT sql FROM sqlite_master WHERE type = ? AND name = ?").get(type, name) as
      | { sql: string | null }
      | undefined
    if (!object || canonicalizeSql(object.sql ?? "") !== canonicalizeSql(sql)) {
      throw new Error(`Incompatible ${type} definition: ${name}`)
    }
  }

  private validateColumns(
    table: string,
    expected: ReadonlyArray<readonly [string, string, 0 | 1, string | null, number]>,
  ): void {
    const actual = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
      name: string
      type: string
      notnull: number
      dflt_value: string | null
      pk: number
    }>
    if (
      actual.length !== expected.length ||
      actual.some(
        (column, index) =>
          JSON.stringify([column.name, column.type, column.notnull, column.dflt_value, column.pk]) !==
          JSON.stringify(expected[index]),
      )
    ) {
      throw new Error(`Incompatible columns for ${table}`)
    }
  }

  private validatePreservedColumns(v2: boolean): void {
    this.validateColumns("artifacts", [
      ["id", "TEXT", 0, null, 1],
      ["thread_id", "TEXT", 1, null, 0],
      ["kind", "TEXT", 1, null, 0],
      ["version", "INTEGER", 1, null, 0],
      ["path", "TEXT", 0, null, 0],
      ["data_json", "TEXT", 1, null, 0],
      ["approved", "INTEGER", 1, "0", 0],
      ["created_at", "TEXT", 1, "datetime('now')", 0],
    ])
    this.validateColumns("pipeline_plans", [
      ["thread_id", "TEXT", 0, null, 1],
      ["plan_json", "TEXT", 1, null, 0],
      ["created_at", "TEXT", 1, "datetime('now')", 0],
      ["updated_at", "TEXT", 1, "datetime('now')", 0],
    ])
    this.validateColumns("pi_sessions", [
      ["thread_id", "TEXT", 0, null, 1],
      ["pi_session_id", "TEXT", 1, null, 0],
      ["pi_session_file", "TEXT", 0, null, 0],
      ["created_at", "TEXT", 1, "datetime('now')", 0],
      ["updated_at", "TEXT", 1, "datetime('now')", 0],
    ])
    this.validateColumns("action_attempts", [
      ["schema_version", "INTEGER", 1, "1", 0],
      ["action_key", "TEXT", 1, null, 2],
      ["thread_id", "TEXT", 1, null, 1],
      ["plan_id", "TEXT", 1, null, 0],
      ["mode", "TEXT", 1, null, 0],
      ["action", "TEXT", 1, null, 0],
      ["input_fingerprint", "TEXT", 1, null, 0],
      ["status", "TEXT", 1, null, 0],
      ["outcome_json", "TEXT", 0, null, 0],
      ["error_json", "TEXT", 0, null, 0],
      ["attempt_count", "INTEGER", 1, "1", 0],
      ["started_at", "TEXT", 1, null, 0],
      ["finished_at", "TEXT", 0, null, 0],
      ["updated_at", "TEXT", 1, null, 0],
      ["artifact_metadata_json", "TEXT", 0, null, 0],
      ["effect_metadata_json", "TEXT", 0, null, 0],
    ])
    void v2
  }

  private validatePreservedForeignKeys(v2: boolean): void {
    const expected: Record<string, string[]> = {
      artifacts: ["threads|thread_id|id|NO ACTION|CASCADE|NONE"],
      events: [v2 ? "threads|thread_id|id|NO ACTION|CASCADE|NONE" : "threads|thread_id|id|NO ACTION|CASCADE|NONE"],
      pipeline_plans: ["threads|thread_id|id|NO ACTION|CASCADE|NONE"],
      pi_sessions: ["threads|thread_id|id|NO ACTION|CASCADE|NONE"],
      action_attempts: ["threads|thread_id|id|NO ACTION|CASCADE|NONE"],
    }
    if (v2) expected.event_outbox = ["events|event_id|event_id|NO ACTION|CASCADE|NONE"]
    for (const [table, expectedKeys] of Object.entries(expected)) {
      const actual = (
        this.db.prepare(`PRAGMA foreign_key_list(${table})`).all() as Array<{
          table: string
          from: string
          to: string
          on_update: string
          on_delete: string
          match: string
        }>
      )
        .map((row) => `${row.table}|${row.from}|${row.to}|${row.on_update}|${row.on_delete}|${row.match}`)
        .sort()
      if (JSON.stringify(actual) !== JSON.stringify([...expectedKeys].sort()))
        throw new Error(`Incompatible foreign keys for ${table}`)
    }
  }

  private validatePreservedIndexes(v2: boolean): void {
    const indexes: Array<[string, string, string[]]> = [
      ["idx_artifacts_thread_kind", PRESERVED_INDEX_SQL.artifacts, ["thread_id", "kind", "version"]],
      [
        "idx_events_thread_seq",
        v2 ? PRESERVED_INDEX_SQL.eventsV2 : PRESERVED_INDEX_SQL.eventsV1,
        ["thread_id", v2 ? "thread_seq" : "seq"],
      ],
      ["idx_action_attempts_thread_updated", PRESERVED_INDEX_SQL.actionUpdated, ["thread_id", "updated_at"]],
      ["idx_action_attempts_thread_status", PRESERVED_INDEX_SQL.actionStatus, ["thread_id", "status", "updated_at"]],
    ]
    if (v2) indexes.push(["idx_event_outbox_pending", PRESERVED_INDEX_SQL.outboxPending, ["event_id"]])
    for (const [name, sql, columns] of indexes) {
      this.validateExactObject("index", name, sql)
      const actual = (this.db.prepare(`PRAGMA index_info(${name})`).all() as Array<{ seqno: number; name: string }>)
        .sort((left, right) => left.seqno - right.seqno)
        .map((column) => column.name)
      if (JSON.stringify(actual) !== JSON.stringify(columns)) throw new Error(`Incompatible index columns: ${name}`)
    }
  }

  private tableExists(name: string): boolean {
    return Boolean(this.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name))
  }
  private validateForeignKeysAndQuickCheck(): void {
    if (this.db.prepare("PRAGMA foreign_key_check").all().length > 0) throw new Error("SQLite foreign_key_check failed")
    const result = this.db.prepare("PRAGMA quick_check").get() as { quick_check: string } | undefined
    if (result?.quick_check !== "ok") throw new Error(`SQLite quick_check failed: ${result?.quick_check ?? "unknown"}`)
  }

  private validateActionJournalSchema(): void {
    try {
      this.validateExactTable("action_attempts", ACTION_ATTEMPTS_SQL)
    } catch (error) {
      throw new Error("Migration marked applied but action_attempts has an incompatible schema", { cause: error })
    }
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

export function canonicalizeSql(sql: string): string {
  let canonical = ""
  let pendingWhitespace = false
  let previousKind: "word" | "quoted" | "other" | null = null

  const appendToken = (token: string, kind: "word" | "quoted" | "other") => {
    const needsSeparator =
      pendingWhitespace &&
      ((previousKind === "word" && (kind === "word" || kind === "quoted")) ||
        (previousKind === "quoted" && kind === "word"))
    if (needsSeparator) canonical += " "
    canonical += token
    pendingWhitespace = false
    previousKind = kind
  }

  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index]!
    if (/\s/.test(character)) {
      pendingWhitespace = canonical.length > 0
      continue
    }
    if (character === "'" || character === '"' || character === "`" || character === "[") {
      const closing = character === "[" ? "]" : character
      let token = character
      for (index += 1; index < sql.length; index += 1) {
        const quotedCharacter = sql[index]!
        token += quotedCharacter
        if (quotedCharacter === closing) {
          if (sql[index + 1] === closing) {
            token += sql[index + 1]!
            index += 1
          } else {
            break
          }
        }
      }
      appendToken(token, "quoted")
      continue
    }
    if (/[A-Za-z0-9_$]/.test(character)) {
      let token = character.toLowerCase()
      while (index + 1 < sql.length && /[A-Za-z0-9_$]/.test(sql[index + 1]!)) {
        index += 1
        token += sql[index]!.toLowerCase()
      }
      appendToken(token, "word")
      continue
    }
    appendToken(character.toLowerCase(), "other")
  }

  return canonical.replace(/;$/, "")
}
