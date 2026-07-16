import type Database from "better-sqlite3"

export const MAX_SAFE_COUNTER = Number.MAX_SAFE_INTEGER
export const OUTBOX_PAGE_SIZE = 500

export interface ThreadMutationContext {
  readonly threadId: string
  readonly initialRevision: number
  readonly revision: number | null
  markChanged(): number
  onCommit(callback: () => void): void
}

export interface ThreadMutationResult<T> {
  readonly value: T
  readonly revision: number | null
}

export interface DurableEventRow {
  readonly eventId: number
  readonly threadId: string
  readonly threadSeq: number
  readonly revision: number
  readonly type: string
  readonly payloadJson: string
  readonly createdAt: string
}

export interface PendingOutboxRow extends DurableEventRow {
  readonly outboxId: number
  readonly attemptCount: number
  readonly lastAttemptAt: string | null
  readonly lastError: string | null
  readonly deliveredAt: string | null
}

export class ThreadRevisionConflictError extends Error {
  constructor(threadId: string, expectedRevision: number, actualRevision: number) {
    super(`Thread ${threadId} revision CAS mismatch: expected ${expectedRevision}, actual ${actualRevision}`)
    this.name = "ThreadRevisionConflictError"
  }
}

/** The only owner of thread counters, durable event sequencing, and outbox persistence. */
export class ThreadStateKernel {
  private activeContext: MutationContextImpl | null = null

  constructor(readonly db: Database.Database) {}

  withThreadMutation<T>(
    threadId: string,
    operation: (context: ThreadMutationContext) => T,
    options: { expectedRevision?: number } = {},
  ): ThreadMutationResult<T> {
    if (this.activeContext) {
      if (this.activeContext.threadId !== threadId) {
        throw new Error(`Nested thread mutation must use ${this.activeContext.threadId}, not ${threadId}`)
      }
      if (options.expectedRevision !== undefined && options.expectedRevision !== this.activeContext.initialRevision) {
        return { value: undefined as T, revision: null }
      }
      const value = operation(this.activeContext)
      if (isThenable(value)) throw new Error("Thread mutation callbacks must be synchronous")
      return { value, revision: this.activeContext.revision }
    }
    if (this.db.inTransaction) throw new Error("Thread mutation cannot run inside an unmanaged SQLite transaction")

    const initial = this.readRevision(threadId)
    if (initial === null) {
      if (options.expectedRevision !== undefined) {
        throw new ThreadRevisionConflictError(threadId, options.expectedRevision, -1)
      }
      return { value: operationWithoutThread(this.db, operation, threadId), revision: null }
    }
    validateCounter(initial, `thread ${threadId} revision`)
    if (options.expectedRevision !== undefined && options.expectedRevision !== initial) {
      return { value: undefined as T, revision: null }
    }

    let committedCallbacks: Array<() => void> = []
    const transaction = this.db.transaction(() => {
      const context = new MutationContextImpl(this, threadId, initial)
      this.activeContext = context
      try {
        const value = operation(context)
        if (isThenable(value)) throw new Error("Thread mutation callbacks must be synchronous")
        committedCallbacks = context.callbacks
        return { value, revision: context.revision }
      } finally {
        this.activeContext = null
      }
    })

    const result = transaction.immediate() as ThreadMutationResult<T>
    for (const callback of committedCallbacks) {
      try {
        callback()
      } catch {
        // Post-commit work must never turn a durable mutation into a reported rollback.
      }
    }
    return result
  }

  appendEvent(
    context: ThreadMutationContext,
    event: { readonly threadId: string; readonly type: string; readonly payloadJson: string },
    onCommit?: () => void,
  ): DurableEventRow {
    if (context.threadId !== event.threadId) throw new Error("Event thread does not match the mutation context")
    const revision = context.markChanged()
    const current = this.db.prepare("SELECT last_event_seq FROM threads WHERE id = ?").get(event.threadId) as
      | { last_event_seq: number }
      | undefined
    if (!current) throw new Error(`Thread not found: ${event.threadId}`)
    validateCounter(current.last_event_seq, `thread ${event.threadId} event sequence`)
    if (current.last_event_seq >= MAX_SAFE_COUNTER) throw new Error("Thread event sequence overflow")

    const sequenceUpdate = this.db
      .prepare("UPDATE threads SET last_event_seq = last_event_seq + 1 WHERE id = ?")
      .run(event.threadId)
    if (sequenceUpdate.changes !== 1) throw new Error(`Thread disappeared while appending event: ${event.threadId}`)
    const threadSeq = current.last_event_seq + 1
    const inserted = this.db
      .prepare(
        `INSERT INTO events (thread_id, thread_seq, revision, type, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
      )
      .run(event.threadId, threadSeq, revision, event.type, event.payloadJson)
    const row = this.db
      .prepare(
        "SELECT event_id, thread_id, thread_seq, revision, type, payload_json, created_at FROM events WHERE event_id = ?",
      )
      .get(inserted.lastInsertRowid) as DurableEventRow | undefined
    if (!row) throw new Error("Durable event disappeared after insertion")
    if (onCommit) context.onCommit(onCommit)
    return row
  }

  listPendingOutbox(limit = OUTBOX_PAGE_SIZE): PendingOutboxRow[] {
    validatePageSize(limit)
    return this.db
      .prepare(
        `SELECT o.outbox_id AS outboxId, o.attempt_count AS attemptCount, o.last_attempt_at AS lastAttemptAt,
                o.last_error AS lastError, o.delivered_at AS deliveredAt, e.event_id AS eventId,
                e.thread_id AS threadId, e.thread_seq AS threadSeq, e.revision, e.type,
                e.payload_json AS payloadJson, e.created_at AS createdAt
         FROM event_outbox o
         JOIN events e ON e.event_id = o.event_id
         WHERE o.delivered_at IS NULL
         ORDER BY o.event_id ASC
         LIMIT ?`,
      )
      .all(limit) as PendingOutboxRow[]
  }

  countPendingOutbox(): number {
    return (
      this.db.prepare("SELECT COUNT(*) AS count FROM event_outbox WHERE delivered_at IS NULL").get() as {
        count: number
      }
    ).count
  }

  markOutboxAttempt(outboxId: number, eventId: number): void {
    const result = this.db
      .prepare(
        `UPDATE event_outbox
         SET attempt_count = attempt_count + 1,
             last_attempt_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE outbox_id = ? AND event_id = ? AND delivered_at IS NULL`,
      )
      .run(outboxId, eventId)
    if (result.changes !== 1) throw new Error("Outbox attempt mark did not update the pending row")
  }

  markOutboxDelivered(outboxId: number, eventId: number): boolean {
    const result = this.db
      .prepare(
        `UPDATE event_outbox SET delivered_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), last_error = NULL
         WHERE outbox_id = ? AND event_id = ? AND delivered_at IS NULL`,
      )
      .run(outboxId, eventId)
    return result.changes === 1
  }

  markOutboxFailed(outboxId: number, eventId: number, error: unknown): void {
    const message = (error instanceof Error ? error.message : String(error)).replace(/\s+/g, " ").slice(0, 500)
    const result = this.db
      .prepare(
        `UPDATE event_outbox SET last_error = ?
         WHERE outbox_id = ? AND event_id = ? AND delivered_at IS NULL`,
      )
      .run(message || "Publisher failed", outboxId, eventId)
    if (result.changes !== 1) throw new Error("Outbox failure mark did not update the pending row")
  }

  /** Settles an undeliverable row without claiming live delivery; replay remains the recovery path. */
  markOutboxNoListener(outboxId: number, eventId: number): void {
    const result = this.db
      .prepare(
        `UPDATE event_outbox
         SET delivered_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
             last_error = 'No active listener; durable replay remains available'
         WHERE outbox_id = ? AND event_id = ? AND delivered_at IS NULL`,
      )
      .run(outboxId, eventId)
    if (result.changes !== 1) throw new Error("Outbox no-listener settlement did not update the pending row")
  }

  private readRevision(threadId: string): number | null {
    const row = this.db.prepare("SELECT revision FROM threads WHERE id = ?").get(threadId) as
      | { revision: number }
      | undefined
    return row?.revision ?? null
  }

  allocateRevision(threadId: string, initialRevision: number): number {
    if (initialRevision >= MAX_SAFE_COUNTER) throw new Error("Thread revision overflow")
    const result = this.db
      .prepare("UPDATE threads SET revision = revision + 1 WHERE id = ? AND revision = ?")
      .run(threadId, initialRevision)
    if (result.changes !== 1) throw new Error(`Thread revision changed during mutation: ${threadId}`)
    const row = this.db.prepare("SELECT revision FROM threads WHERE id = ?").get(threadId) as
      | { revision: number }
      | undefined
    if (!row) throw new Error(`Thread disappeared during revision allocation: ${threadId}`)
    validateCounter(row.revision, `thread ${threadId} revision`)
    return row.revision
  }
}

class MutationContextImpl implements ThreadMutationContext {
  readonly callbacks: Array<() => void> = []
  private assignedRevision: number | null = null

  constructor(
    private readonly kernel: ThreadStateKernel,
    readonly threadId: string,
    readonly initialRevision: number,
  ) {}

  get revision(): number | null {
    return this.assignedRevision
  }

  markChanged(): number {
    if (this.assignedRevision !== null) return this.assignedRevision
    this.assignedRevision = this.kernel.allocateRevision(this.threadId, this.initialRevision)
    return this.assignedRevision
  }

  onCommit(callback: () => void): void {
    this.callbacks.push(callback)
  }
}

function operationWithoutThread<T>(
  db: Database.Database,
  operation: (context: ThreadMutationContext) => T,
  threadId: string,
): T {
  const context = {
    threadId,
    initialRevision: 0,
    revision: null,
    markChanged: () => {
      throw new Error(`Cannot mutate missing thread: ${threadId}`)
    },
    onCommit: () => undefined,
  }
  const value = operation(context)
  if (isThenable(value)) throw new Error("Thread mutation callbacks must be synchronous")
  void db
  return value
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  const valueType = typeof value
  return (
    (valueType === "object" || valueType === "function") &&
    value !== null &&
    typeof (value as { then?: unknown }).then === "function"
  )
}

function validateCounter(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_SAFE_COUNTER) throw new Error(`Corrupt ${label}`)
}

function validatePageSize(value: number): void {
  if (!Number.isInteger(value) || value < 1) throw new Error("Outbox page size must be a positive integer")
}
