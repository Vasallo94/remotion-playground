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
    error TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT
  )
`)

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
  error: string | null
  created_at: string
  completed_at: string | null
}

const insertStmt = db.prepare(`
  INSERT INTO jobs (id, config_id, title, composition, status, thread_id)
  VALUES (@id, @config_id, @title, @composition, @status, @thread_id)
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

export function insertJob(job: {
  id: string
  config_id?: string
  title?: string
  composition?: string
  status?: string
  thread_id?: string
}): void {
  insertStmt.run({
    id: job.id,
    config_id: job.config_id ?? null,
    title: job.title ?? null,
    composition: job.composition ?? "ProductShort",
    status: job.status ?? "validating",
    thread_id: job.thread_id ?? null,
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

export function listJobs(limit = 20, offset = 0): { jobs: Job[]; total: number } {
  const jobs = listStmt.all(limit, offset) as Job[]
  const { total } = countStmt.get() as { total: number }
  return { jobs, total }
}

export function purgeOldJobs(configId: string, exceptId: string): string[] {
  const rows = db
    .prepare("SELECT id FROM jobs WHERE config_id = ? AND id != ? AND status IN ('done', 'error')")
    .all(configId, exceptId) as { id: string }[]
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.id)
  const placeholders = ids.map(() => "?").join(",")
  db.prepare(`DELETE FROM jobs WHERE id IN (${placeholders})`).run(...ids)
  return ids
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
