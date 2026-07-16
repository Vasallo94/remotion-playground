import { describe, it } from "node:test"
import assert from "node:assert/strict"
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent"
import { encodeSseEvent, normalizePiEvent, parseEventCursor } from "../src/events.js"
import { AgentPiStore } from "../src/store.js"

describe("normalizePiEvent", () => {
  it("maps text deltas to message_delta", () => {
    const normalized = normalizePiEvent({
      type: "message_update",
      message: { role: "assistant", content: [], timestamp: Date.now() },
      assistantMessageEvent: { type: "text_delta", delta: "hola" },
    } as unknown as AgentSessionEvent)
    assert.equal(normalized?.type, "message_delta")
    assert.deepEqual(normalized?.payload, { delta: "hola" })
  })

  it("maps tool lifecycle events", () => {
    const start = normalizePiEvent({
      type: "tool_execution_start",
      toolCallId: "call-1",
      toolName: "save_script_artifact",
      args: { ok: true },
    } as AgentSessionEvent)
    assert.equal(start?.type, "tool_start")

    const end = normalizePiEvent({
      type: "tool_execution_end",
      toolCallId: "call-1",
      toolName: "save_script_artifact",
      result: { content: [] },
      isError: false,
    } as AgentSessionEvent)
    assert.equal(end?.type, "tool_end")
    assert.equal(end?.payload.name, "save_script_artifact")
  })
})

describe("event cursors", () => {
  it("accepts versioned cursors and rejects unsafe values", () => {
    assert.deepEqual(parseEventCursor("t2:37"), { kind: "v2", seq: 37 })
    assert.deepEqual(parseEventCursor("12"), { kind: "legacy", eventId: 12 })
    assert.deepEqual(parseEventCursor(undefined), { kind: "none" })
    assert.throws(() => parseEventCursor("t2:0"), /malformed/i)
    assert.throws(() => parseEventCursor("-1"), /malformed/i)
  })
})

describe("cursor-compatible paged replay", () => {
  it("translates legacy cursors and walks more than 500 local events", () => {
    const store = new AgentPiStore(":memory:")
    try {
      const thread = store.createThread({ id: "paged-http-thread" })
      for (let index = 0; index < 1_001; index += 1) {
        store.appendEvent({ threadId: thread.id, type: "message_delta", payload: { index } })
      }
      const cursor = parseEventCursor("t2:500")
      assert.equal(cursor.kind, "v2")
      const legacy = parseEventCursor("500")
      assert.equal(legacy.kind, "legacy")
      const firstPage = store.listEvents(thread.id, 500, 500)
      const secondPage = store.listEvents(thread.id, firstPage.at(-1)!.seq, 500)
      assert.equal(firstPage.length, 500)
      assert.equal(secondPage.length, 1)
      assert.equal(secondPage[0]?.seq, 1001)
    } finally {
      store.close()
    }
  })
})

describe("encodeSseEvent", () => {
  it("emits id, event and data lines", () => {
    const encoded = encodeSseEvent({
      seq: 7,
      revision: 3,
      threadId: "thread-1",
      type: "agent_end",
      payload: { ok: true },
      createdAt: "2026-07-02T00:00:00Z",
    })
    assert.match(encoded, /^id: t2:7/m)
    assert.match(encoded, /^event: agent_end/m)
    assert.match(encoded, /^data: /m)
    assert.match(encoded, /\n\n$/)
  })

  it("encodes plan updates too", () => {
    const encoded = encodeSseEvent({
      seq: 8,
      revision: 4,
      threadId: "thread-1",
      type: "plan_updated",
      payload: { plan: { id: "plan-1" } },
      createdAt: "2026-07-02T00:00:00Z",
    })
    assert.match(encoded, /^event: plan_updated/m)
  })
})
