import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Message } from "@langchain/langgraph-sdk"
import type { SubagentStreamInterface } from "@langchain/langgraph-sdk/react"
import { fetchPiThread, getPiEventsUrl, resumePiCheckpoint, sendPiChat } from "../api"
import type { CheckpointType, Enrichment, PipelineEvent } from "../types"
import type { ActiveVideoTarget } from "../types"
import { extractPlanStateFromPipelinePlan, type PipelinePlan, type PlanState } from "../lib/planState"

interface PiEvent {
  seq?: number
  threadId: string
  type:
    | "message_delta"
    | "tool_start"
    | "tool_end"
    | "checkpoint"
    | "artifact_updated"
    | "plan_updated"
    | "render_status"
    | "error"
    | "agent_end"
  payload: Record<string, unknown>
  createdAt?: string
}

const CHECKPOINT_TYPE_MAP: Record<string, CheckpointType> = {
  script_checkpoint: "script",
  direction_checkpoint: "direction",
}

export interface UsePiVideoStreamOptions {
  threadId?: string | null
  onThreadId?: (threadId: string) => void
  onError?: (error: unknown) => void
  activeTarget?: ActiveVideoTarget | null
}

export interface PiVideoStreamReturn {
  messages: Message[]
  isLoading: boolean
  error: unknown
  subagents: Map<string, SubagentStreamInterface>
  activeSubagents: SubagentStreamInterface[]
  getSubagentsByMessage: (messageId: string) => SubagentStreamInterface[]
  checkpointType: CheckpointType | null
  checkpointData: Record<string, unknown> | null
  isInterrupted: boolean
  enrichments: Enrichment[]
  pipelineEvents?: PipelineEvent[]
  planState: PlanState | null
  submit: (message: string) => void
  resume: (decision: Record<string, unknown>) => void
  switchThread: (newThreadId: string | null) => void
  addEnrichment: (enrichment: Enrichment) => void
  clearEnrichments: () => void
}

function createMessage(type: "human" | "ai", content: string): Message {
  return {
    id: crypto.randomUUID(),
    type,
    content,
  } as Message
}

function getMessageText(message: Message): string {
  return typeof message.content === "string" ? message.content : ""
}

function parsePiEvent(raw: string | undefined): PiEvent | null {
  if (!raw || raw === "undefined") return null
  try {
    return JSON.parse(raw) as PiEvent
  } catch {
    return null
  }
}

export function usePiVideoStream(options: UsePiVideoStreamOptions = {}): PiVideoStreamReturn {
  const { threadId, onThreadId, onError } = options
  const [activeThreadId, setActiveThreadId] = useState<string | null>(threadId ?? null)
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [checkpointType, setCheckpointType] = useState<CheckpointType | null>(null)
  const [checkpointData, setCheckpointData] = useState<Record<string, unknown> | null>(null)
  const [enrichments, setEnrichments] = useState<Enrichment[]>([])
  const [pipelineEvents, setPipelineEvents] = useState<PipelineEvent[]>([])
  const [planState, setPlanState] = useState<PlanState | null>(null)
  const lastSeqRef = useRef(0)
  const videoResultJobIdsRef = useRef(new Set<string>())
  const activeAssistantIdRef = useRef<string | null>(null)
  const messagesRef = useRef(messages)
  messagesRef.current = messages

  useEffect(() => {
    setActiveThreadId(threadId ?? null)
  }, [threadId])

  const appendAssistantDelta = useCallback((delta: string) => {
    setMessages((current) => {
      const activeId = activeAssistantIdRef.current
      if (activeId) {
        return current.map((message) =>
          message.id === activeId ? ({ ...message, content: getMessageText(message) + delta } as Message) : message,
        )
      }
      const message = createMessage("ai", delta)
      activeAssistantIdRef.current = message.id ?? null
      return [...current, message]
    })
  }, [])

  const addEnrichment = useCallback((enrichment: Enrichment) => {
    const lastId = messagesRef.current[messagesRef.current.length - 1]?.id
    setEnrichments((prev) => [...prev, { ...enrichment, afterMessageId: enrichment.afterMessageId ?? lastId }])
  }, [])

  const clearEnrichments = useCallback(() => setEnrichments([]), [])

  const appendPipelineEvent = useCallback((event: Omit<PipelineEvent, "id" | "timestamp">) => {
    setPipelineEvents((prev) => [...prev, { id: crypto.randomUUID(), timestamp: new Date(), ...event }])
  }, [])

  const addVideoResult = useCallback(
    (jobId: string, title: unknown, fileSize: unknown) => {
      if (videoResultJobIdsRef.current.has(jobId)) return
      videoResultJobIdsRef.current.add(jobId)
      addEnrichment({
        id: crypto.randomUUID(),
        type: "video_result",
        content: "Video listo:",
        data: {
          jobId,
          title: typeof title === "string" ? title : null,
          fileSize: typeof fileSize === "number" ? fileSize : null,
        },
      })
    },
    [addEnrichment],
  )

  const handleEvent = useCallback(
    (event: PiEvent) => {
      if (event.seq && event.seq <= lastSeqRef.current) return
      if (event.seq) lastSeqRef.current = event.seq

      switch (event.type) {
        case "message_delta": {
          const delta = typeof event.payload.delta === "string" ? event.payload.delta : ""
          if (!delta) return
          if (event.payload.role === "user") {
            activeAssistantIdRef.current = null
            setMessages((current) => [...current, createMessage("human", delta)])
            return
          }
          appendAssistantDelta(delta)
          return
        }
        case "tool_start": {
          const toolName = typeof event.payload.name === "string" ? event.payload.name : "tool"
          appendPipelineEvent({ stage: "orchestrator", message: `tool ${toolName} started`, type: "info" })
          return
        }
        case "tool_end": {
          const toolName = typeof event.payload.name === "string" ? event.payload.name : "tool"
          const isError = event.payload.isError === true
          appendPipelineEvent({
            stage: isError ? "error" : "orchestrator",
            message: `tool ${toolName} ${isError ? "failed" : "done"}`,
            type: isError ? "error" : "success",
          })
          return
        }
        case "checkpoint": {
          const checkpoint = event.payload as { type?: string; payload?: Record<string, unknown> }
          const rawType = typeof checkpoint.type === "string" ? checkpoint.type : undefined
          appendPipelineEvent({
            stage: rawType === "direction_checkpoint" ? "director" : "copywriter",
            message: `checkpoint ${rawType ?? "generic"}`,
            type: "checkpoint",
          })
          setCheckpointType(rawType ? (CHECKPOINT_TYPE_MAP[rawType] ?? "generic") : "generic")
          setCheckpointData(checkpoint.payload ?? event.payload)
          setIsLoading(false)
          activeAssistantIdRef.current = null
          return
        }
        case "artifact_updated": {
          const kind = typeof event.payload.kind === "string" ? event.payload.kind : "artifact"
          appendPipelineEvent({ stage: "orchestrator", message: `artifact updated: ${kind}`, type: "info" })
          if (event.payload.kind === "checkpoint_decision") {
            const checkpoint = event.payload.checkpoint as
              | { type?: string; payload?: Record<string, unknown> }
              | undefined
            const cpType = checkpoint?.type ? (CHECKPOINT_TYPE_MAP[checkpoint.type] ?? "generic") : checkpointType
            const cpData = checkpoint?.payload ?? checkpointData
            if (cpType && cpData) {
              addEnrichment({
                id: crypto.randomUUID(),
                type: "resolved_checkpoint",
                content: "",
                data: {
                  checkpointType: cpType,
                  checkpointData: cpData,
                  userDecision: event.payload.decision,
                },
              })
            }
            setCheckpointType(null)
            setCheckpointData(null)
          }
          return
        }
        case "plan_updated": {
          const plan = event.payload.plan as PipelinePlan | undefined
          setPlanState(extractPlanStateFromPipelinePlan(plan))
          return
        }
        case "render_status": {
          const jobId =
            typeof event.payload.jobId === "string"
              ? event.payload.jobId
              : typeof event.payload.id === "string"
                ? event.payload.id
                : undefined
          const status = typeof event.payload.status === "string" ? event.payload.status : undefined
          const progress = typeof event.payload.progress === "number" ? event.payload.progress : undefined
          appendPipelineEvent({
            stage: "rendering",
            message: jobId
              ? `render ${status ?? "unknown"}${progress != null ? ` (${progress}%)` : ""}`
              : `render ${status ?? "unknown"}`,
            type: status === "done" ? "success" : status === "error" ? "error" : "info",
          })
          if (jobId && status === "done") {
            addVideoResult(jobId, event.payload.title, event.payload.file_size)
          }
          return
        }
        case "error": {
          const nextError = event.payload.message ?? "Error en Agent Pi"
          appendPipelineEvent({ stage: "error", message: String(nextError), type: "error" })
          setError(nextError)
          setIsLoading(false)
          onError?.(nextError)
          return
        }
        case "agent_end": {
          const willRetry = event.payload.willRetry === true
          appendPipelineEvent({
            stage: willRetry ? "orchestrator" : "done",
            message: willRetry ? "agent finished, retry scheduled" : "agent finished",
            type: willRetry ? "info" : "success",
          })
          setIsLoading(false)
          activeAssistantIdRef.current = null
          return
        }
        default:
          return
      }
    },
    [addEnrichment, addVideoResult, appendAssistantDelta, appendPipelineEvent, checkpointData, checkpointType, onError],
  )

  useEffect(() => {
    if (!activeThreadId) return
    let cancelled = false
    fetchPiThread(activeThreadId)
      .then((snapshot) => {
        if (cancelled) return
        const checkpoint = snapshot.thread.checkpoint
        if (checkpoint) {
          setCheckpointType(CHECKPOINT_TYPE_MAP[checkpoint.type] ?? "generic")
          setCheckpointData(checkpoint.payload)
        }
        setPlanState(extractPlanStateFromPipelinePlan(snapshot.plan as PipelinePlan | null))
        const latestCompletedRender = [...snapshot.events].reverse().find((event) => {
          const payload = event.payload as Record<string, unknown> | undefined
          return event.type === "render_status" && payload?.status === "done" && typeof payload.id === "string"
        })
        const renderPayload = latestCompletedRender?.payload as Record<string, unknown> | undefined
        const jobId = typeof renderPayload?.id === "string" ? renderPayload.id : undefined
        if (jobId) addVideoResult(jobId, renderPayload?.title, renderPayload?.file_size)
      })
      .catch(() => {
        // SSE replay below is the primary recovery path; snapshot fetch is best-effort.
      })
    return () => {
      cancelled = true
    }
  }, [activeThreadId, addVideoResult])

  useEffect(() => {
    if (!activeThreadId) return
    const source = new EventSource(getPiEventsUrl(activeThreadId, lastSeqRef.current))
    source.onmessage = (message) => {
      const event = parsePiEvent(message.data)
      if (event) handleEvent(event)
    }
    const eventTypes: PiEvent["type"][] = [
      "message_delta",
      "tool_start",
      "tool_end",
      "checkpoint",
      "artifact_updated",
      "plan_updated",
      "render_status",
      "error",
      "agent_end",
    ]
    for (const type of eventTypes) {
      source.addEventListener(type, (message) => {
        const event = parsePiEvent((message as MessageEvent).data)
        if (event) handleEvent(event)
      })
    }
    source.onerror = () => {
      // EventSource retries automatically. Keep the UI state; the backend replays from last seq.
    }
    return () => source.close()
  }, [activeThreadId, handleEvent])

  const submit = useCallback(
    (message: string) => {
      setError(null)
      setIsLoading(true)
      setCheckpointType(null)
      setCheckpointData(null)
      sendPiChat(message, activeThreadId)
        .then(({ threadId: nextThreadId }) => {
          if (nextThreadId !== activeThreadId) {
            setActiveThreadId(nextThreadId)
            onThreadId?.(nextThreadId)
          }
        })
        .catch((err) => {
          setError(err)
          setIsLoading(false)
          onError?.(err)
        })
    },
    [activeThreadId, onError, onThreadId],
  )

  const resume = useCallback(
    (decision: Record<string, unknown>) => {
      if (!activeThreadId) return
      setError(null)
      setIsLoading(true)
      setCheckpointType(null)
      setCheckpointData(null)
      resumePiCheckpoint(activeThreadId, decision).catch((err) => {
        setError(err)
        setIsLoading(false)
        onError?.(err)
      })
    },
    [activeThreadId, onError],
  )

  const switchThread = useCallback((newThreadId: string | null) => {
    lastSeqRef.current = 0
    videoResultJobIdsRef.current.clear()
    activeAssistantIdRef.current = null
    setActiveThreadId(newThreadId)
    setMessages([])
    setCheckpointType(null)
    setCheckpointData(null)
    setEnrichments([])
    setPipelineEvents([])
    setPlanState(null)
    setError(null)
    setIsLoading(false)
  }, [])

  return {
    messages,
    isLoading,
    error,
    subagents: useMemo(() => new Map<string, SubagentStreamInterface>(), []),
    activeSubagents: useMemo(() => [], []),
    getSubagentsByMessage: useCallback(() => [], []),
    checkpointType,
    checkpointData,
    isInterrupted: checkpointType != null,
    enrichments,
    pipelineEvents,
    planState,
    submit,
    resume,
    switchThread,
    addEnrichment,
    clearEnrichments,
  }
}
