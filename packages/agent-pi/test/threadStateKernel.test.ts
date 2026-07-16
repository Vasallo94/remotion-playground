import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"
import { AgentPiStore } from "../src/store.js"

let store: AgentPiStore | undefined

afterEach(() => {
  store?.close()
  store = undefined
})

describe("ThreadStateKernel", () => {
  it("allocates one monotonic revision for nested same-thread mutations", () => {
    store = new AgentPiStore(":memory:")
    const thread = store.createThread({ id: "kernel-thread" })
    const result = store.threadStateKernel.withThreadMutation(thread.id, (root) => {
      root.markChanged()
      const nested = store!.threadStateKernel.withThreadMutation(thread.id, (context) => context.markChanged())
      assert.equal(nested.revision, 1)
      return root.revision
    })
    assert.equal(result.revision, 1)
    assert.equal(store.getThread(thread.id)?.revision, 1)
  })

  it("gives two events one revision and contiguous local sequences", () => {
    store = new AgentPiStore(":memory:")
    const thread = store.createThread({ id: "event-thread" })
    const result = store.threadStateKernel.withThreadMutation(thread.id, (context) => [
      store!.threadStateKernel.appendEvent(context, {
        threadId: thread.id,
        type: "message_delta",
        payloadJson: '{"n":1}',
      }),
      store!.threadStateKernel.appendEvent(context, { threadId: thread.id, type: "agent_end", payloadJson: '{"n":2}' }),
    ])
    assert.equal(result.revision, 1)
    assert.deepEqual(
      store.listEvents(thread.id).map((event) => [event.seq, event.revision]),
      [
        [1, 1],
        [2, 1],
      ],
    )
    assert.equal(store.getThread(thread.id)?.lastEventSeq, 2)
  })

  it("rolls back state, revision, event, sequence, and outbox together", () => {
    store = new AgentPiStore(":memory:")
    const thread = store.createThread({ id: "rollback-thread" })
    assert.throws(
      () =>
        store!.threadStateKernel.withThreadMutation(thread.id, (context) => {
          context.markChanged()
          store!.threadStateKernel.appendEvent(context, { threadId: thread.id, type: "error", payloadJson: "{}" })
          throw new Error("rollback")
        }),
      /rollback/,
    )
    assert.deepEqual(store.getThread(thread.id), thread)
    assert.equal(store.listEvents(thread.id).length, 0)
    assert.equal((store.db.prepare("SELECT COUNT(*) AS count FROM event_outbox").get() as { count: number }).count, 0)
  })

  it("rejects cross-thread nesting, asynchronous callbacks, and unmanaged transactions", async () => {
    store = new AgentPiStore(":memory:")
    const first = store.createThread({ id: "first" })
    const second = store.createThread({ id: "second" })
    assert.throws(
      () =>
        store!.threadStateKernel.withThreadMutation(first.id, () => {
          store!.threadStateKernel.withThreadMutation(second.id, (context) => context.markChanged())
        }),
      /cross-thread|must use first/i,
    )
    assert.equal(store.getThread(first.id)?.revision, 0)
    assert.throws(
      () => store!.threadStateKernel.withThreadMutation(first.id, (() => Promise.resolve()) as never),
      /synchronous/,
    )
    const callableThenable = Object.assign(() => undefined, { then: () => undefined })
    assert.throws(() => store!.threadStateKernel.withThreadMutation(first.id, () => callableThenable), /synchronous/)
    assert.equal(store.getThread(first.id)?.revision, 0)
    assert.throws(
      () => store!.db.transaction(() => store!.updateThreadStatus(first.id, "running"))(),
      /unmanaged SQLite transaction/,
    )
    await Promise.resolve()
  })

  it("rejects revision and local sequence overflow with rollback", () => {
    store = new AgentPiStore(":memory:")
    const thread = store.createThread({ id: "overflow-thread" })
    store.db.exec("DROP TRIGGER trg_threads_revision_unit; DROP TRIGGER trg_threads_event_seq_unit")
    store.db.pragma("ignore_check_constraints = ON")
    store.db.prepare("UPDATE threads SET revision = ? WHERE id = ?").run(Number.MAX_SAFE_INTEGER, thread.id)
    store.db.exec(`
      CREATE TRIGGER trg_threads_revision_unit BEFORE UPDATE OF revision ON threads WHEN NEW.revision != OLD.revision + 1 BEGIN SELECT RAISE(ABORT, 'thread revision must increment by one'); END;
      CREATE TRIGGER trg_threads_event_seq_unit BEFORE UPDATE OF last_event_seq ON threads WHEN NEW.last_event_seq != OLD.last_event_seq + 1 BEGIN SELECT RAISE(ABORT, 'thread event sequence must increment by one'); END;
    `)
    assert.throws(
      () => store!.threadStateKernel.withThreadMutation(thread.id, (context) => context.markChanged()),
      /overflow/,
    )
    store.db.exec("DROP TRIGGER trg_threads_revision_unit; DROP TRIGGER trg_threads_event_seq_unit")
    store.db
      .prepare("UPDATE threads SET revision = 0, last_event_seq = ? WHERE id = ?")
      .run(Number.MAX_SAFE_INTEGER, thread.id)
    assert.throws(() => store!.appendEvent({ threadId: thread.id, type: "agent_end", payload: {} }), /overflow/)
    assert.equal(store.getThread(thread.id)?.revision, 0)
    assert.equal(store.getThread(thread.id)?.lastEventSeq, Number.MAX_SAFE_INTEGER)
    assert.equal(store.listEvents(thread.id).length, 0)
  })

  it("makes an incorrect CAS a zero-mutation no-op", () => {
    store = new AgentPiStore(":memory:")
    const thread = store.createThread({ id: "cas-thread" })
    let called = false
    const before = JSON.stringify(store.getThread(thread.id))
    const result = store.threadStateKernel.withThreadMutation(
      thread.id,
      () => {
        called = true
        throw new Error("must not run")
      },
      { expectedRevision: 7 },
    )
    assert.equal(called, false)
    assert.equal(result.revision, null)
    assert.equal(JSON.stringify(store.getThread(thread.id)), before)
  })
})
