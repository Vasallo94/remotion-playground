import Database from "better-sqlite3"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import { ensureDirectory, PROJECT_ROOT } from "./paths.js"
import type { ArtifactKind, ArtifactRecord, CheckpointRecord, PiSseEvent, ThreadRecord, ThreadStatus } from "./types.js"

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

export class AgentPiStore {
  readonly db: Database.Database

  constructor(dbPath = join(PROJECT_ROOT, ".generated/claqueta-pi/agent-pi.db")) {
    if (dbPath !== ":memory:") ensureDirectory(join(dbPath, ".."))
    this.db = new Database(dbPath)
    this.db.pragma("journal_mode = WAL")
    this.migrate()
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

  private migrate(): void {
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

      CREATE TABLE IF NOT EXISTS pi_sessions (
        thread_id TEXT PRIMARY KEY,
        pi_session_id TEXT NOT NULL,
        pi_session_file TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE
      );
    `)
  }
}
