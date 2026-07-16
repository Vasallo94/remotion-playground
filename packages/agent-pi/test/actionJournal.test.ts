import assert from "node:assert/strict"
import { existsSync, rmSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { join } from "node:path"
import { afterEach, describe, it } from "node:test"
import Database from "better-sqlite3"
import { createActionKey, createActionName, createInputSnapshotFingerprint } from "../src/actionJournal.js"
import { AgentPiStore } from "../src/store.js"
import type { BeginActionAttemptInput } from "../src/types.js"

let store: AgentPiStore | undefined
const temporaryDatabases: string[] = []

afterEach(() => {
  store?.close()
  store = undefined
  for (const databasePath of temporaryDatabases.splice(0)) {
    for (const path of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]) {
      if (existsSync(path)) rmSync(path)
    }
  }
})

function input(threadId = "thread-1", actionKey = "action-1"): BeginActionAttemptInput {
  return {
    actionKey: createActionKey(actionKey),
    threadId,
    planId: "plan-1",
    mode: "new_video",
    action: createActionName("run_copywriter"),
    inputFingerprint: createInputSnapshotFingerprint({ threadId, planId: "plan-1", action: "run_copywriter" }),
    artifactMetadata: { inputArtifactIds: ["script-1"] },
  }
}

function completion(attempt: BeginActionAttemptInput, outcome: unknown = { artifactId: "script-1" }) {
  return {
    actionKey: attempt.actionKey,
    threadId: attempt.threadId,
    inputFingerprint: attempt.inputFingerprint,
    attemptCount: store?.getActionAttempt(attempt.threadId, attempt.actionKey)?.attemptCount ?? 1,
    outcome,
    effectMetadata: { effects: [] },
  }
}

describe("durable parent-owned action journal", () => {
  it("persists a started and succeeded attempt across store restart", () => {
    const databasePath = join(process.cwd(), ".generated", `action-journal-${randomUUID()}.db`)
    temporaryDatabases.push(databasePath)
    store = new AgentPiStore(databasePath)
    const thread = store.createThread({ id: "thread-1" })
    const attempt = input(thread.id)

    assert.equal(store.beginActionAttempt(attempt).status, "started")
    const success = store.succeedActionAttempt(completion(attempt, { artifactId: "script-2" }))
    assert.equal(success.status, "succeeded")
    store.close()
    store = new AgentPiStore(databasePath)

    const restored = store.getActionAttempt(thread.id, attempt.actionKey)
    assert.equal(restored?.status, "succeeded")
    assert.deepEqual(restored?.outcome, { artifactId: "script-2" })
    assert.equal(restored?.artifactMetadata && "inputArtifactIds" in (restored.artifactMetadata as object), true)
    assert.equal(store.db.prepare("SELECT version FROM schema_migrations WHERE version = 1").get() !== undefined, true)
  })

  it("distinguishes duplicates and in-progress keys without executing anything", () => {
    store = new AgentPiStore(":memory:")
    store.createThread({ id: "thread-1" })
    const attempt = input()
    assert.equal(store.getThread("thread-1")?.revision, 0)

    assert.deepEqual(store.beginActionAttempt(attempt), {
      status: "started",
      retried: false,
      record: store.getActionAttempt("thread-1", attempt.actionKey),
    })
    assert.equal(store.beginActionAttempt(attempt).status, "in_progress")
    store.succeedActionAttempt(completion(attempt, { value: 42 }))
    const revisionAfterSuccess = store.getThread("thread-1")?.revision
    const duplicate = store.beginActionAttempt(attempt)
    assert.equal(duplicate.status, "succeeded")
    if (duplicate.status === "succeeded") assert.deepEqual(duplicate.record.outcome, { value: 42 })
    assert.equal(store.getThread("thread-1")?.revision, revisionAfterSuccess)
  })

  it("rejects a conflicting fingerprint for one thread and action key", () => {
    store = new AgentPiStore(":memory:")
    store.createThread({ id: "thread-1" })
    const attempt = input()
    store.beginActionAttempt(attempt)
    const conflicting = {
      ...attempt,
      inputFingerprint: createInputSnapshotFingerprint({ changed: true }),
    }

    const result = store.beginActionAttempt(conflicting)
    assert.equal(result.status, "conflict")
    assert.equal(store.getActionAttempt("thread-1", attempt.actionKey)?.inputFingerprint, attempt.inputFingerprint)
  })

  it("requires explicit retry opt-in after failure and increments the attempt count", () => {
    store = new AgentPiStore(":memory:")
    store.createThread({ id: "thread-1" })
    const attempt = input()
    store.beginActionAttempt(attempt)
    assert.equal(
      store.failActionAttempt({
        actionKey: attempt.actionKey,
        threadId: attempt.threadId,
        inputFingerprint: attempt.inputFingerprint,
        attemptCount: 1,
        error: { code: "TEMPORARY", message: "The effect did not finish" },
      }).status,
      "failed",
    )

    const blockedRetry = store.beginActionAttempt(attempt)
    assert.equal(blockedRetry.status, "failed")
    const retry = store.beginActionAttempt(attempt, { retryFailed: true })
    assert.equal(retry.status, "started")
    if (retry.status === "started") assert.equal(retry.record.attemptCount, 2)
    assert.equal(store.succeedActionAttempt(completion(attempt, { retried: true })).status, "succeeded")
  })

  it("rolls back a completion when outcome serialization fails", () => {
    store = new AgentPiStore(":memory:")
    store.createThread({ id: "thread-1" })
    const attempt = input()
    store.beginActionAttempt(attempt)
    const circular: Record<string, unknown> = {}
    circular.self = circular

    assert.throws(() => store!.succeedActionAttempt(completion(attempt, circular)), /circular|serializable/i)
    assert.equal(store!.getActionAttempt("thread-1", attempt.actionKey)?.status, "started")
  })

  it("rejects a reused key whose immutable action identity changed even with the same fingerprint", () => {
    store = new AgentPiStore(":memory:")
    store.createThread({ id: "thread-1" })
    const attempt = input()
    store.beginActionAttempt(attempt)

    const result = store.beginActionAttempt({ ...attempt, planId: "plan-2" })
    assert.equal(result.status, "conflict")
    if (result.status === "conflict") assert.equal(result.reason, "action_identity_mismatch")
  })

  it("rejects stale success and failure callbacks after a failed attempt is retried", () => {
    store = new AgentPiStore(":memory:")
    store.createThread({ id: "thread-1" })
    const attempt = input()
    store.beginActionAttempt(attempt)
    const failure = {
      actionKey: attempt.actionKey,
      threadId: attempt.threadId,
      inputFingerprint: attempt.inputFingerprint,
      attemptCount: 1,
      error: { code: "TEMPORARY", message: "retry" },
    }
    store.failActionAttempt(failure)
    const retry = store.beginActionAttempt(attempt, { retryFailed: true })
    assert.equal(retry.status, "started")

    assert.deepEqual(store.succeedActionAttempt({ ...completion(attempt), attemptCount: 1 }), {
      status: "rejected",
      reason: "attempt_count_mismatch",
      record: store.getActionAttempt("thread-1", attempt.actionKey),
    })
    assert.equal(store.failActionAttempt(failure).status, "rejected")
    assert.equal(store.getActionAttempt("thread-1", attempt.actionKey)?.status, "started")
    assert.equal(store.succeedActionAttempt({ ...completion(attempt), attemptCount: 2 }).status, "succeeded")
  })

  it("leaves a crash-window claim in progress after restart rather than executing it again", () => {
    const databasePath = join(process.cwd(), ".generated", `action-journal-${randomUUID()}.db`)
    temporaryDatabases.push(databasePath)
    store = new AgentPiStore(databasePath)
    store.createThread({ id: "thread-1" })
    const attempt = input()
    store.beginActionAttempt(attempt)
    store.close()
    store = new AgentPiStore(databasePath)

    assert.equal(store.beginActionAttempt(attempt).status, "in_progress")
  })

  it("reports corrupt persisted JSON with row and column context", () => {
    store = new AgentPiStore(":memory:")
    store.createThread({ id: "thread-1" })
    const attempt = input()
    store.beginActionAttempt(attempt)
    store.db
      .prepare(
        "UPDATE action_attempts SET status = 'succeeded', outcome_json = '{', finished_at = updated_at WHERE thread_id = ? AND action_key = ?",
      )
      .run(attempt.threadId, attempt.actionKey)

    assert.throws(
      () => store!.getActionAttempt(attempt.threadId, attempt.actionKey),
      /outcome_json.*thread-1\/action-1/,
    )
  })

  it("rejects a database migration version newer than this binary supports", () => {
    const databasePath = join(process.cwd(), ".generated", `action-journal-${randomUUID()}.db`)
    temporaryDatabases.push(databasePath)
    const database = new Database(databasePath)
    database.exec(
      "CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT); INSERT INTO schema_migrations VALUES (2, 'now')",
    )
    database.close()

    assert.throws(() => new AgentPiStore(databasePath), /newer than supported/)
  })

  it("rejects a migration marker whose journal table is missing", () => {
    const databasePath = join(process.cwd(), ".generated", `action-journal-${randomUUID()}.db`)
    temporaryDatabases.push(databasePath)
    const database = new Database(databasePath)
    database.exec(
      "CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT); INSERT INTO schema_migrations VALUES (1, 'now')",
    )
    database.close()

    assert.throws(() => new AgentPiStore(databasePath), /marked applied.*incompatible schema/)
  })

  it("rejects ambiguous fingerprint inputs instead of allowing JSON collisions", () => {
    assert.throws(() => createInputSnapshotFingerprint({ value: undefined }), /JSON-compatible/)
    assert.throws(() => createInputSnapshotFingerprint({ value: Number.NaN }), /finite JSON numbers/)
    assert.throws(() => createInputSnapshotFingerprint(new Date()), /plain JSON objects/)
  })

  it("namespaces keys by thread and lists only the requested thread", () => {
    store = new AgentPiStore(":memory:")
    store.createThread({ id: "thread-1" })
    store.createThread({ id: "thread-2" })
    const first = input("thread-1", "same-key")
    const second = input("thread-2", "same-key")

    assert.equal(store.beginActionAttempt(first).status, "started")
    assert.equal(store.beginActionAttempt(second).status, "started")
    assert.equal(store.listActionAttempts("thread-1").length, 1)
    assert.equal(store.listActionAttempts("thread-1")[0]?.threadId, "thread-1")
    assert.equal(store.listActionAttempts("thread-2")[0]?.threadId, "thread-2")
  })
})
