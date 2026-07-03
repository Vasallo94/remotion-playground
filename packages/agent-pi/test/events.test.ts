import { describe, it } from "node:test"
import assert from "node:assert/strict"
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent"
import { encodeSseEvent, normalizePiEvent } from "../src/events.js"

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

describe("encodeSseEvent", () => {
  it("emits id, event and data lines", () => {
    const encoded = encodeSseEvent({
      seq: 7,
      threadId: "thread-1",
      type: "agent_end",
      payload: { ok: true },
      createdAt: "2026-07-02T00:00:00Z",
    })
    assert.match(encoded, /^id: 7/m)
    assert.match(encoded, /^event: agent_end/m)
    assert.match(encoded, /^data: /m)
    assert.match(encoded, /\n\n$/)
  })

  it("encodes plan updates too", () => {
    const encoded = encodeSseEvent({
      seq: 8,
      threadId: "thread-1",
      type: "plan_updated",
      payload: { plan: { id: "plan-1" } },
      createdAt: "2026-07-02T00:00:00Z",
    })
    assert.match(encoded, /^event: plan_updated/m)
  })
})
