import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent"
import { EventEmitter } from "node:events"
import type { AgentPiStore } from "./store.js"
import type { PiSseEvent, PiSseEventDraft, PiSseEventType } from "./types.js"

export interface NormalizedEvent {
  type: PiSseEventType
  payload: Record<string, unknown>
}

export function normalizePiEvent(event: AgentSessionEvent): NormalizedEvent | null {
  switch (event.type) {
    case "message_update":
      if (event.assistantMessageEvent.type !== "text_delta") return null
      return { type: "message_delta", payload: { delta: event.assistantMessageEvent.delta } }
    case "tool_execution_start":
      return { type: "tool_start", payload: { toolCallId: event.toolCallId, name: event.toolName, input: event.args } }
    case "tool_execution_end":
      return {
        type: "tool_end",
        payload: { toolCallId: event.toolCallId, name: event.toolName, isError: event.isError, result: event.result },
      }
    case "agent_end":
      return { type: "agent_end", payload: { willRetry: event.willRetry, messageCount: event.messages.length } }
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
      return event.success
        ? null
        : { type: "error", payload: { recoverable: false, message: event.finalError ?? "Auto retry failed" } }
    default:
      return null
  }
}

export interface OutboxDrainReport {
  readonly attempted: number
  readonly delivered: number
  readonly failed: number
  readonly pending: number
}

export class ThreadEventBus {
  private readonly emitter = new EventEmitter()
  private draining = false
  private drainRequested = false

  constructor(private readonly store: AgentPiStore) {
    this.emitter.setMaxListeners(200)
    this.drainPending()
  }

  publish<TPayload>(event: PiSseEventDraft<TPayload>): PiSseEvent<TPayload> {
    return this.store.appendEvent(event, () => this.drainPending())
  }

  subscribe(threadId: string, listener: (event: PiSseEvent) => void): () => void {
    this.emitter.on(threadId, listener)
    this.drainPending()
    return () => this.emitter.off(threadId, listener)
  }

  drainPending(): OutboxDrainReport {
    if (this.draining) {
      this.drainRequested = true
      return {
        attempted: 0,
        delivered: 0,
        failed: 0,
        pending: this.store.threadStateKernel.countPendingOutbox(),
      }
    }
    this.draining = true
    let attempted = 0
    let delivered = 0
    let failed = 0
    try {
      while (true) {
        const page = this.store.threadStateKernel.listPendingOutbox()
        if (page.length === 0) break
        let stopped = false
        for (const row of page) {
          attempted += 1
          if (this.emitter.listenerCount(row.threadId) === 0) {
            // A missing listener is an explicit settlement, not an implicit page skip.
            // Durable replay remains available to a later HTTP/SSE consumer.
            this.store.threadStateKernel.markOutboxNoListener(row.outboxId, row.eventId)
            continue
          }
          this.store.threadStateKernel.markOutboxAttempt(row.outboxId, row.eventId)
          const event = this.store.listEvents(row.threadId, row.threadSeq - 1, 1)[0]
          if (!event || event.seq !== row.threadSeq) {
            this.store.threadStateKernel.markOutboxFailed(row.outboxId, row.eventId, "Durable event is unavailable")
            failed += 1
            stopped = true
            break
          }
          try {
            this.emitter.emit(row.threadId, event)
            if (!this.store.threadStateKernel.markOutboxDelivered(row.outboxId, row.eventId)) {
              throw new Error("Outbox delivery mark did not update the pending row")
            }
            delivered += 1
          } catch (error) {
            this.store.threadStateKernel.markOutboxFailed(row.outboxId, row.eventId, error)
            failed += 1
            stopped = true
            break
          }
        }
        if (stopped) break
      }
      return { attempted, delivered, failed, pending: this.store.threadStateKernel.countPendingOutbox() }
    } finally {
      this.draining = false
      if (this.drainRequested) {
        this.drainRequested = false
        this.drainPending()
      }
    }
  }
}

export function encodeSseEvent(event: PiSseEvent): string {
  const lines = [`id: t2:${event.seq}`, `event: ${event.type}`]
  for (const line of JSON.stringify(event).split("\n")) lines.push(`data: ${line}`)
  lines.push("\n")
  return lines.join("\n")
}

export function parseEventCursor(
  value: string | undefined,
): { kind: "none" } | { kind: "v2"; seq: number } | { kind: "legacy"; eventId: number } {
  if (value === undefined || value === "") return { kind: "none" }
  if (/^t2:[1-9]\d*$/.test(value)) {
    const seq = Number(value.slice(3))
    if (Number.isSafeInteger(seq)) return { kind: "v2", seq }
  }
  if (/^[0-9]+$/.test(value)) {
    const eventId = Number(value)
    if (Number.isSafeInteger(eventId)) return { kind: "legacy", eventId }
  }
  throw new Error("Malformed event cursor")
}
