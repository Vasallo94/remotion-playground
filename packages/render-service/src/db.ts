import Database from "better-sqlite3"
import path from "path"

import { mkdirSync } from "fs"

const ROOT_DIR = process.env.ROOT_DIR || path.resolve(__dirname, "../../..")
const JOBS_DIR = path.resolve(ROOT_DIR, ".generated/renders")
mkdirSync(JOBS_DIR, { recursive: true })

const db = new Database(path.join(JOBS_DIR, "jobs.db"))
db.pragma("journal_mode = WAL")

db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    config_id TEXT,
    title TEXT,
    composition TEXT DEFAULT 'ProductShort',
    status TEXT DEFAULT 'validating',
    progress INTEGER DEFAULT 0,
    output_path TEXT,
    file_size INTEGER,
    thread_id TEXT,
    idempotency_key TEXT,
    request_hash TEXT,
    error TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT
  )
`)
const jobColumns = new Set(
  (db.prepare("PRAGMA table_info(jobs)").all() as Array<{ name: string }>).map((row) => row.name),
)
if (!jobColumns.has("idempotency_key")) db.exec("ALTER TABLE jobs ADD COLUMN idempotency_key TEXT")
if (!jobColumns.has("request_hash")) db.exec("ALTER TABLE jobs ADD COLUMN request_hash TEXT")
db.exec(
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_idempotency_key ON jobs(idempotency_key) WHERE idempotency_key IS NOT NULL",
)

export interface Job {
  id: string
  config_id: string | null
  title: string | null
  composition: string
  status: string
  progress: number
  output_path: string | null
  file_size: number | null
  thread_id: string | null
  idempotency_key: string | null
  request_hash: string | null
  error: string | null
  created_at: string
  completed_at: string | null
}

const insertStmt = db.prepare(`
  INSERT INTO jobs (id, config_id, title, composition, status, thread_id, idempotency_key, request_hash)
  VALUES (@id, @config_id, @title, @composition, @status, @thread_id, @idempotency_key, @request_hash)
`)

const updateStmt = db.prepare(`
  UPDATE jobs SET status = @status, progress = @progress,
    output_path = @output_path, file_size = @file_size,
    error = @error, completed_at = @completed_at
  WHERE id = @id
`)

const getStmt = db.prepare("SELECT * FROM jobs WHERE id = ?")
const listStmt = db.prepare("SELECT * FROM jobs ORDER BY created_at DESC LIMIT ? OFFSET ?")
const countStmt = db.prepare("SELECT COUNT(*) as total FROM jobs")
const getByConfigIdStmt = db.prepare("SELECT * FROM jobs WHERE config_id = ? ORDER BY created_at DESC LIMIT 1")
const getByIdempotencyKeyStmt = db.prepare("SELECT * FROM jobs WHERE idempotency_key = ?")

export function insertJob(job: {
  id: string
  config_id?: string
  title?: string
  composition?: string
  status?: string
  thread_id?: string
  idempotency_key?: string
  request_hash?: string
}): void {
  insertStmt.run({
    id: job.id,
    config_id: job.config_id ?? null,
    title: job.title ?? null,
    composition: job.composition ?? "ProductShort",
    status: job.status ?? "validating",
    thread_id: job.thread_id ?? null,
    idempotency_key: job.idempotency_key ?? null,
    request_hash: job.request_hash ?? null,
  })
}

export function updateJob(
  id: string,
  updates: Partial<Pick<Job, "status" | "progress" | "output_path" | "file_size" | "error" | "completed_at">>,
): void {
  const current = getStmt.get(id) as Job | undefined
  if (!current) return
  updateStmt.run({
    id,
    status: updates.status ?? current.status,
    progress: updates.progress ?? current.progress,
    output_path: updates.output_path ?? current.output_path,
    file_size: updates.file_size ?? current.file_size,
    error: updates.error ?? current.error,
    completed_at: updates.completed_at ?? current.completed_at,
  })
}

export function getJob(id: string): Job | undefined {
  return getStmt.get(id) as Job | undefined
}

export function getJobByConfigId(configId: string): Job | undefined {
  return getByConfigIdStmt.get(configId) as Job | undefined
}

export function getJobByIdempotencyKey(key: string): Job | undefined {
  return getByIdempotencyKeyStmt.get(key) as Job | undefined
}

export function listJobs(limit = 20, offset = 0): { jobs: Job[]; total: number } {
  const jobs = listStmt.all(limit, offset) as Job[]
  const { total } = countStmt.get() as { total: number }
  return { jobs, total }
}

export function recoverOrphanedJobs(): number {
  const stmt = db.prepare(`
    UPDATE jobs SET status = 'error',
      error = 'Process interrupted (server restart)',
      completed_at = datetime('now')
    WHERE status IN ('validating', 'rendering')
      AND created_at < datetime('now', '-5 minutes')
  `)
  return stmt.run().changes
}
