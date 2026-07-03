import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent"
import { EventEmitter } from "node:events"
import type { AgentPiStore } from "./store.js"
import type { PiSseEvent, PiSseEventType } from "./types.js"

export interface NormalizedEvent {
  type: PiSseEventType
  payload: Record<string, unknown>
}

export function normalizePiEvent(event: AgentSessionEvent): NormalizedEvent | null {
  switch (event.type) {
    case "message_update": {
      if (event.assistantMessageEvent.type !== "text_delta") return null
      return {
        type: "message_delta",
        payload: { delta: event.assistantMessageEvent.delta },
      }
    }
    case "tool_execution_start":
      return {
        type: "tool_start",
        payload: {
          toolCallId: event.toolCallId,
          name: event.toolName,
          input: event.args,
        },
      }
    case "tool_execution_end":
      return {
        type: "tool_end",
        payload: {
          toolCallId: event.toolCallId,
          name: event.toolName,
          isError: event.isError,
          result: event.result,
        },
      }
    case "agent_end":
      return {
        type: "agent_end",
        payload: {
          willRetry: event.willRetry,
          messageCount: event.messages.length,
        },
      }
    case "auto_retry_start":
      return {
        type: "error",
        payload: {
          recoverable: true,
          message: event.errorMessage,
          attempt: event.attempt,
          maxAttempts: event.maxAttempts,
        },
      }
    case "auto_retry_end":
      if (event.success) return null
      return {
        type: "error",
        payload: { recoverable: false, message: event.finalError ?? "Auto retry failed" },
      }
    default:
      return null
  }
}

export class ThreadEventBus {
  private emitter = new EventEmitter()

  constructor(private store: AgentPiStore) {
    this.emitter.setMaxListeners(200)
  }

  publish<TPayload>(event: Omit<PiSseEvent<TPayload>, "seq" | "createdAt">): PiSseEvent<TPayload> {
    const stored = this.store.appendEvent(event)
    this.emitter.emit(event.threadId, stored)
    return stored
  }

  subscribe(threadId: string, listener: (event: PiSseEvent) => void): () => void {
    this.emitter.on(threadId, listener)
    return () => this.emitter.off(threadId, listener)
  }
}

export function encodeSseEvent(event: PiSseEvent): string {
  const lines = [`id: ${event.seq ?? 0}`, `event: ${event.type}`]
  const payload = JSON.stringify(event)
  for (const line of payload.split("\n")) {
    lines.push(`data: ${line}`)
  }
  lines.push("\n")
  return lines.join("\n")
}
