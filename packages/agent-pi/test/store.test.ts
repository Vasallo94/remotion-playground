import { describe, it, afterEach } from "node:test"
import assert from "node:assert/strict"
import { AgentPiStore } from "../src/store.js"

let store: AgentPiStore | undefined

afterEach(() => {
  store?.close()
  store = undefined
})

describe("AgentPiStore", () => {
  it("creates and retrieves a thread", () => {
    store = new AgentPiStore(":memory:")
    const thread = store.createThread({ title: "Tutorial /compact" })
    const found = store.getThread(thread.id)
    assert.equal(found?.title, "Tutorial /compact")
    assert.equal(found?.status, "idle")
  })

  it("versions artifacts per kind", () => {
    store = new AgentPiStore(":memory:")
    const thread = store.createThread()
    const first = store.saveArtifact({ threadId: thread.id, kind: "script", data: { title: "v1" } })
    const second = store.saveArtifact({ threadId: thread.id, kind: "script", data: { title: "v2" }, approved: true })
    const config = store.saveArtifact({ threadId: thread.id, kind: "config", data: { id: "cfg" } })

    assert.equal(first.version, 1)
    assert.equal(second.version, 2)
    assert.equal(config.version, 1)
    assert.equal(second.approved, true)
    assert.equal(store.listArtifacts(thread.id).length, 3)
  })

  it("stores checkpoints on the thread", () => {
    store = new AgentPiStore(":memory:")
    const thread = store.createThread()
    store.setCheckpoint(thread.id, {
      id: "cp-1",
      type: "script_checkpoint",
      artifactId: "artifact-1",
      payload: { title: "Draft" },
    })
    const waiting = store.getThread(thread.id)
    assert.equal(waiting?.status, "waiting")
    assert.equal(waiting?.checkpoint?.type, "script_checkpoint")

    store.clearCheckpoint(thread.id, "idle")
    const cleared = store.getThread(thread.id)
    assert.equal(cleared?.status, "idle")
    assert.equal(cleared?.checkpoint, null)
  })

  it("stores pipeline plans per thread", () => {
    store = new AgentPiStore(":memory:")
    const thread = store.createThread()
    const plan = store.savePipelinePlan({
      schemaVersion: 1,
      id: "plan-1",
      threadId: thread.id,
      mode: "new_video",
      goal: "Create a tutorial",
      status: "active",
      steps: [
        {
          id: "research",
          owner: "researcher",
          title: "Research",
          status: "in_progress",
          summary: "",
          artifactPaths: [],
          blockers: [],
        },
      ],
      decisions: [],
      currentStepId: "research",
      progress: { completed: 0, total: 1 },
      createdAt: "2026-07-02T00:00:00.000Z",
      updatedAt: "2026-07-02T00:00:00.000Z",
    })

    const found = store.getPipelinePlan(thread.id)
    assert.equal(found?.id, plan.id)
    assert.equal(found?.steps[0].status, "in_progress")
    assert.equal(found?.progress.total, 1)
  })

  it("appends replayable SSE events", () => {
    store = new AgentPiStore(":memory:")
    const thread = store.createThread()
    const first = store.appendEvent({ threadId: thread.id, type: "message_delta", payload: { delta: "hola" } })
    const second = store.appendEvent({ threadId: thread.id, type: "agent_end", payload: {} })

    assert.equal(first.seq, 1)
    assert.equal(second.seq, 2)
    assert.deepEqual(
      store.listEvents(thread.id, 1).map((event) => event.type),
      ["agent_end"],
    )
  })
})
