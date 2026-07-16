import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, it } from "node:test"
import { AgentPiStore } from "../src/store.js"
import { ThreadEventBus } from "../src/events.js"

let store: AgentPiStore | undefined

afterEach(() => {
  store?.close()
  store = undefined
})

describe("transactional event outbox", () => {
  it("publishes only after commit and retains publisher failures", () => {
    store = new AgentPiStore(":memory:")
    const thread = store.createThread({ id: "outbox-thread" })
    const bus = new ThreadEventBus(store)
    const received: number[] = []
    let fail = true
    const unsubscribe = bus.subscribe(thread.id, (event) => {
      received.push(event.seq)
      if (fail) throw new Error("publisher failure")
    })
    const event = bus.publish({ threadId: thread.id, type: "agent_end", payload: {} })
    assert.deepEqual(received, [event.seq])
    assert.equal(
      (
        store.db.prepare("SELECT delivered_at FROM event_outbox WHERE event_id = 1").get() as
          | { delivered_at: string | null }
          | undefined
      )?.delivered_at,
      null,
    )
    assert.equal(bus.drainPending().failed, 1)
    fail = false
    unsubscribe()
    bus.subscribe(thread.id, (next) => received.push(next.seq))
    assert.deepEqual(received, [1, 1, 1])
  })

  it("does not expose an event before commit or after rollback", () => {
    store = new AgentPiStore(":memory:")
    const thread = store.createThread({ id: "commit-thread" })
    const bus = new ThreadEventBus(store)
    const received: number[] = []
    bus.subscribe(thread.id, (event) => received.push(event.seq))
    assert.throws(
      () =>
        store!.threadStateKernel.withThreadMutation(thread.id, () => {
          store!.appendEvent({ threadId: thread.id, type: "agent_end", payload: {} }, () => bus.drainPending())
          assert.deepEqual(received, [])
          throw new Error("rollback")
        }),
      /rollback/,
    )
    assert.deepEqual(received, [])
  })

  it("rolls back an event when the outbox trigger rejects it", () => {
    store = new AgentPiStore(":memory:")
    const thread = store.createThread({ id: "trigger-thread" })
    store.db.exec(
      "CREATE TRIGGER test_outbox_failure BEFORE INSERT ON event_outbox BEGIN SELECT RAISE(ABORT, 'injected outbox failure'); END",
    )
    assert.throws(
      () => store!.appendEvent({ threadId: thread.id, type: "error", payload: {} }),
      /injected outbox failure/,
    )
    assert.equal(store.getThread(thread.id)?.lastEventSeq, 0)
    assert.equal(store.listEvents(thread.id).length, 0)
  })

  it("treats mark-after-delivery failure as a recoverable duplicate", () => {
    store = new AgentPiStore(":memory:")
    const thread = store.createThread({ id: "mark-thread" })
    const bus = new ThreadEventBus(store)
    const received: number[] = []
    const kernel = store.threadStateKernel
    const original = kernel.markOutboxDelivered.bind(kernel)
    kernel.markOutboxDelivered = () => false
    bus.subscribe(thread.id, (event) => received.push(event.seq))
    bus.publish({ threadId: thread.id, type: "agent_end", payload: {} })
    assert.deepEqual(received, [1])
    assert.equal(
      (
        store.db.prepare("SELECT delivered_at FROM event_outbox WHERE event_id = 1").get() as
          | { delivered_at: string | null }
          | undefined
      )?.delivered_at,
      null,
    )
    kernel.markOutboxDelivered = original
    bus.drainPending()
    assert.deepEqual(received, [1, 1])
  })

  it("supports reentrant publishing without changing delivery order", () => {
    store = new AgentPiStore(":memory:")
    const thread = store.createThread({ id: "reentrant-thread" })
    const bus = new ThreadEventBus(store)
    const received: number[] = []
    let published = false
    bus.subscribe(thread.id, (event) => {
      received.push(event.seq)
      if (!published) {
        published = true
        bus.publish({ threadId: thread.id, type: "agent_end", payload: { nested: true } })
      }
    })
    bus.publish({ threadId: thread.id, type: "message_delta", payload: { delta: "one" } })
    assert.deepEqual(received, [1, 2])
    assert.equal(
      (
        store.db.prepare("SELECT COUNT(*) AS count FROM event_outbox WHERE delivered_at IS NULL").get() as {
          count: number
        }
      ).count,
      0,
    )
  })

  it("drains 1,203 pending events across 500-row pages and keeps interleaved threads local", () => {
    store = new AgentPiStore(":memory:")
    const first = store.createThread({ id: "first" })
    const second = store.createThread({ id: "second" })
    const bus = new ThreadEventBus(store)
    const received = new Map<string, number[]>()
    bus.subscribe(second.id, (event) => received.set(second.id, [...(received.get(second.id) ?? []), event.seq]))
    for (let index = 0; index < 1_203; index += 1) {
      store.appendEvent({ threadId: index % 2 === 0 ? first.id : second.id, type: "message_delta", payload: { index } })
    }
    bus.drainPending()
    assert.equal(received.get(first.id), undefined)
    assert.equal(received.get(second.id)?.length, 601)
    assert.deepEqual(received.get(second.id)?.slice(-3), [599, 600, 601])
    assert.equal(
      (
        store.db.prepare("SELECT COUNT(*) AS count FROM event_outbox WHERE delivered_at IS NULL").get() as {
          count: number
        }
      ).count,
      0,
    )
  })

  it("settles more than 500 unrelated rows before delivering an active thread", () => {
    store = new AgentPiStore(":memory:")
    const oldThread = store.createThread({ id: "old-thread" })
    const activeThread = store.createThread({ id: "active-thread" })
    const bus = new ThreadEventBus(store)
    const received: number[] = []
    bus.subscribe(activeThread.id, (event) => received.push(event.seq))
    for (let index = 0; index < 501; index += 1) {
      store.appendEvent({ threadId: oldThread.id, type: "message_delta", payload: { index } })
    }
    store.appendEvent({ threadId: activeThread.id, type: "agent_end", payload: {} })
    assert.deepEqual(received, [])
    const report = bus.drainPending()
    assert.equal(report.failed, 0)
    assert.deepEqual(received, [1])
    assert.equal(store.threadStateKernel.countPendingOutbox(), 0)
    assert.equal(
      (
        store.db
          .prepare("SELECT COUNT(*) AS count FROM event_outbox WHERE last_error LIKE 'No active listener%'")
          .get() as { count: number }
      ).count,
      501,
    )
  })

  it("settles a failed row after its listener disappears before later rows", () => {
    store = new AgentPiStore(":memory:")
    const first = store.createThread({ id: "failed-first" })
    const later = store.createThread({ id: "later-thread" })
    const bus = new ThreadEventBus(store)
    let fail = true
    const received: string[] = []
    const unsubscribe = bus.subscribe(first.id, () => {
      received.push("first")
      if (fail) throw new Error("first failed")
    })
    bus.subscribe(later.id, () => received.push("later"))
    store.appendEvent({ threadId: first.id, type: "agent_end", payload: {} })
    store.appendEvent({ threadId: later.id, type: "agent_end", payload: {} })
    assert.deepEqual(bus.drainPending(), { attempted: 1, delivered: 0, failed: 1, pending: 2 })
    unsubscribe()
    fail = false
    const report = bus.drainPending()
    assert.equal(report.failed, 0)
    assert.deepEqual(received, ["first", "later"])
    assert.equal(store.threadStateKernel.countPendingOutbox(), 0)
  })

  it("keeps attempt and failure marking faults pending", () => {
    store = new AgentPiStore(":memory:")
    const thread = store.createThread({ id: "mark-fault-thread" })
    const bus = new ThreadEventBus(store)
    let attemptFault = true
    const originalAttempt = store.threadStateKernel.markOutboxAttempt.bind(store.threadStateKernel)
    store.threadStateKernel.markOutboxAttempt = () => {
      if (attemptFault) throw new Error("attempt mark fault")
      originalAttempt(1, 1)
    }
    bus.subscribe(thread.id, () => undefined)
    store.appendEvent({ threadId: thread.id, type: "agent_end", payload: {} })
    assert.throws(() => bus.drainPending(), /attempt mark fault/)
    assert.equal(store.threadStateKernel.countPendingOutbox(), 1)
    attemptFault = false
    const originalFailure = store.threadStateKernel.markOutboxFailed.bind(store.threadStateKernel)
    store.threadStateKernel.markOutboxFailed = () => {
      throw new Error("failure mark fault")
    }
    const failing = store.threadStateKernel.markOutboxDelivered.bind(store.threadStateKernel)
    store.threadStateKernel.markOutboxDelivered = () => {
      throw new Error("publisher fault")
    }
    assert.throws(() => bus.drainPending(), /failure mark fault/)
    assert.equal(store.threadStateKernel.countPendingOutbox(), 1)
    store.threadStateKernel.markOutboxFailed = originalFailure
    store.threadStateKernel.markOutboxDelivered = failing
  })

  it("recovers pending events after a store restart", () => {
    const directory = mkdtempSync(join(tmpdir(), "claqueta-outbox-"))
    const path = join(directory, "restart.db")
    try {
      store = new AgentPiStore(path)
      const thread = store.createThread({ id: "restart-thread" })
      store.appendEvent({ threadId: thread.id, type: "agent_end", payload: {} })
      store.close()
      store = new AgentPiStore(path)
      const bus = new ThreadEventBus(store)
      const received: number[] = []
      bus.subscribe(thread.id, (event) => received.push(event.seq))
      assert.deepEqual(received, [])
      assert.deepEqual(
        store.listEvents(thread.id).map((event) => event.seq),
        [1],
      )
    } finally {
      store?.close()
      store = undefined
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
