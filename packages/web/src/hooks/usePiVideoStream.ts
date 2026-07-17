import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Message } from "@langchain/langgraph-sdk"
import type { SubagentStreamInterface } from "@langchain/langgraph-sdk/react"
import { fetchPiThread, getPiEventsUrl, resumePiCheckpoint, retryPiAction, sendPiChat } from "../api"
import type { CheckpointType, Enrichment, PipelineEvent, PipelineStageId } from "../types"
import type { ActiveVideoTarget } from "../types"
import { extractPlanStateFromPipelinePlan, type PipelinePlan, type PlanState } from "../lib/planState"

interface PiEvent {
  seq?: number
  revision?: number
  threadId: string
  type:
    | "message_delta"
    | "tool_start"
    | "tool_end"
    | "checkpoint"
    | "artifact_updated"
    | "plan_updated"
    | "render_status"
    | "subagent_start"
    | "subagent_update"
    | "subagent_end"
    | "subagent_error"
    | "error"
    | "agent_end"
  payload: Record<string, unknown>
  createdAt?: string
}

type PiSubagentStatus = "pending" | "running" | "complete" | "error"

interface PiSubagentRecord {
  id: string
  type: string
  description: string
  status: PiSubagentStatus
  modelRoute?: string
  parentMessageId: string
  messages: Message[]
  result: string | null
  error: string | null
  startedAt: Date | null
  completedAt: Date | null
}

function pipelineStageForSubagent(type: string): PipelineStageId {
  if (
    type === "copywriter" ||
    type === "director" ||
    type === "researcher" ||
    type === "scene_creator" ||
    type === "audio_planner"
  )
    return type
  if (type === "sound_engineer") return "sound_engineer"
  return "orchestrator"
}

function toSubagentStream(record: PiSubagentRecord): SubagentStreamInterface {
  return {
    id: record.id,
    toolCall: {
      id: record.id,
      name: `run_${record.type}_specialist`,
      args: { subagent_type: record.type, description: record.description },
    },
    status: record.status,
    values: { modelRoute: record.modelRoute },
    error: record.error,
    isLoading: record.status === "running" || record.status === "pending",
    messages: record.messages,
    toolCalls: [],
    getToolCalls: () => [],
    interrupt: undefined,
    interrupts: [],
    subagents: new Map(),
    activeSubagents: [],
    getSubagent: () => undefined,
    getSubagentsByType: () => [],
    getSubagentsByMessage: () => [],
    switchThread: () => {},
    result: record.result,
    namespace: [`pi:${record.id}`],
    parentId: null,
    depth: 0,
    startedAt: record.startedAt,
    completedAt: record.completedAt,
  } as SubagentStreamInterface
}

const CHECKPOINT_TYPE_MAP: Record<string, CheckpointType> = {
  script_checkpoint: "script",
  direction_checkpoint: "direction",
  audio_chart_checkpoint: "audio_chart",
  qa_report_checkpoint: "generic",
  final_review_checkpoint: "generic",
  capability_gap_checkpoint: "generic",
  visual_recipe_adoption_checkpoint: "generic",
  candidate_promotion_checkpoint: "candidate_promotion",
}

const AUTHORITY_EVENT_TYPES = new Set<PiEvent["type"]>([
  "checkpoint",
  "artifact_updated",
  "plan_updated",
  "render_status",
  "error",
  "agent_end",
])

export function isCurrentPiRequest(
  generation: number,
  currentGeneration: number,
  actionGeneration: number,
  currentActionGeneration: number,
): boolean {
  return generation === currentGeneration && actionGeneration === currentActionGeneration
}

export function shouldApplyPiSnapshot(
  activeThreadId: string | null,
  generation: number,
  currentGeneration: number,
  actionGeneration: number,
  currentActionGeneration: number,
  currentRevision: number,
  snapshotThread: { id: string; revision: number },
): boolean {
  return (
    activeThreadId === snapshotThread.id &&
    isCurrentPiRequest(generation, currentGeneration, actionGeneration, currentActionGeneration) &&
    snapshotThread.revision >= currentRevision
  )
}

export function checkpointDataWithArtifact(
  checkpoint: {
    id?: string
    artifactId?: string | null
    payload?: Record<string, unknown>
  },
  artifacts: readonly { id: string; data: unknown }[],
): Record<string, unknown> {
  const artifact = checkpoint.artifactId
    ? artifacts.find((candidate) => candidate.id === checkpoint.artifactId)
    : undefined
  const artifactData =
    typeof artifact?.data === "object" && artifact.data !== null && !Array.isArray(artifact.data)
      ? (artifact.data as Record<string, unknown>)
      : {}
  return {
    ...artifactData,
    ...(checkpoint.payload ?? {}),
    ...(checkpoint.id ? { checkpointId: checkpoint.id } : {}),
    ...(checkpoint.artifactId ? { artifactId: checkpoint.artifactId } : {}),
  }
}

export function isPiAuthorityEventCoveredBySnapshot(snapshotRevision: number, event: PiEvent): boolean {
  return (
    AUTHORITY_EVENT_TYPES.has(event.type) && typeof event.revision === "number" && event.revision <= snapshotRevision
  )
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
  retry: () => void
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
  const [subagentRecords, setSubagentRecords] = useState<Map<string, PiSubagentRecord>>(new Map())
  const lastSeqRef = useRef(0)
  const authorityRevisionRef = useRef(0)
  const snapshotRevisionRef = useRef(0)
  const threadGenerationRef = useRef(0)
  const actionGenerationRef = useRef(0)
  const videoResultJobIdsRef = useRef(new Set<string>())
  const activeAssistantIdRef = useRef<string | null>(null)
  const artifactDataByIdRef = useRef(new Map<string, unknown>())
  const messagesRef = useRef(messages)
  messagesRef.current = messages

  useEffect(() => {
    setActiveThreadId(threadId ?? null)
  }, [threadId])

  useEffect(() => {
    threadGenerationRef.current += 1
    actionGenerationRef.current = 0
    lastSeqRef.current = 0
    authorityRevisionRef.current = 0
    snapshotRevisionRef.current = 0
    videoResultJobIdsRef.current.clear()
    activeAssistantIdRef.current = null
    artifactDataByIdRef.current.clear()
    setMessages([])
    setCheckpointType(null)
    setCheckpointData(null)
    setEnrichments([])
    setPipelineEvents([])
    setPlanState(null)
    setSubagentRecords(new Map())
    setError(null)
    setIsLoading(false)
  }, [activeThreadId])

  const ensureAssistantMessage = useCallback((): string => {
    if (activeAssistantIdRef.current) return activeAssistantIdRef.current
    const message = createMessage("ai", "")
    const messageId = message.id ?? crypto.randomUUID()
    activeAssistantIdRef.current = messageId
    setMessages((current) => [...current, { ...message, id: messageId } as Message])
    return messageId
  }, [])

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
      const coveredBySnapshot = isPiAuthorityEventCoveredBySnapshot(snapshotRevisionRef.current, event)
      if (!coveredBySnapshot && typeof event.revision === "number") {
        authorityRevisionRef.current = Math.max(authorityRevisionRef.current, event.revision)
      }

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
          activeAssistantIdRef.current = null
          if (coveredBySnapshot) return
          const checkpoint = event.payload as {
            id?: string
            type?: string
            artifactId?: string | null
            payload?: Record<string, unknown>
          }
          const rawType = typeof checkpoint.type === "string" ? checkpoint.type : undefined
          appendPipelineEvent({
            stage:
              rawType === "direction_checkpoint"
                ? "director"
                : rawType === "audio_chart_checkpoint"
                  ? "audio_planner"
                  : rawType === "qa_report_checkpoint"
                    ? "scene_qa"
                    : rawType === "final_review_checkpoint"
                      ? "reviewer"
                      : rawType === "capability_gap_checkpoint"
                        ? "scene_creator"
                        : "copywriter",
            message: `checkpoint ${rawType ?? "generic"}`,
            type: "checkpoint",
          })
          setCheckpointType(rawType ? (CHECKPOINT_TYPE_MAP[rawType] ?? "generic") : "generic")
          setCheckpointData(
            checkpointDataWithArtifact(
              { ...checkpoint, payload: checkpoint.payload ?? event.payload },
              [...artifactDataByIdRef.current].map(([id, data]) => ({ id, data })),
            ),
          )
          setIsLoading(false)
          activeAssistantIdRef.current = null
          return
        }
        case "artifact_updated": {
          const kind = typeof event.payload.kind === "string" ? event.payload.kind : "artifact"
          const artifact = event.payload.artifact as { id?: unknown; data?: unknown } | undefined
          if (typeof artifact?.id === "string") artifactDataByIdRef.current.set(artifact.id, artifact.data)
          appendPipelineEvent({ stage: "orchestrator", message: `artifact updated: ${kind}`, type: "info" })
          if (event.payload.kind === "checkpoint_decision") {
            const checkpoint = event.payload.checkpoint as
              | { id?: string; type?: string; artifactId?: string | null; payload?: Record<string, unknown> }
              | undefined
            const cpType = checkpoint?.type ? (CHECKPOINT_TYPE_MAP[checkpoint.type] ?? "generic") : checkpointType
            const cpData = checkpoint
              ? checkpointDataWithArtifact(
                  {
                    id: checkpoint.id,
                    artifactId: checkpoint.artifactId,
                    payload: checkpoint.payload,
                  },
                  [...artifactDataByIdRef.current].map(([id, data]) => ({ id, data })),
                )
              : checkpointData
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
            activeAssistantIdRef.current = null
            if (!coveredBySnapshot) {
              setCheckpointType(null)
              setCheckpointData(null)
            }
            const decision = event.payload.decision as { approved?: unknown } | undefined
            if (
              decision?.approved === false &&
              checkpoint?.type === "candidate_promotion_checkpoint" &&
              (!coveredBySnapshot || event.revision === snapshotRevisionRef.current)
            )
              setIsLoading(false)
          }
          return
        }
        case "plan_updated": {
          if (!coveredBySnapshot) {
            const plan = event.payload.plan as PipelinePlan | undefined
            setPlanState(extractPlanStateFromPipelinePlan(plan))
          }
          return
        }
        case "subagent_start": {
          const runId = typeof event.payload.runId === "string" ? event.payload.runId : crypto.randomUUID()
          const subagentType =
            typeof event.payload.subagentType === "string" ? event.payload.subagentType : "specialist"
          const description =
            typeof event.payload.description === "string" ? event.payload.description : `Run ${subagentType} specialist`
          const parentMessageId = ensureAssistantMessage()
          setSubagentRecords((current) => {
            const next = new Map(current)
            next.set(runId, {
              id: runId,
              type: subagentType,
              description,
              status: "running",
              modelRoute: typeof event.payload.modelRoute === "string" ? event.payload.modelRoute : undefined,
              parentMessageId,
              messages: [],
              result: null,
              error: null,
              startedAt: event.payload.startedAt ? new Date(String(event.payload.startedAt)) : new Date(),
              completedAt: null,
            })
            return next
          })
          appendPipelineEvent({
            stage: pipelineStageForSubagent(subagentType),
            message: `${subagentType} specialist started`,
            type: "info",
          })
          return
        }
        case "subagent_update": {
          const runId = typeof event.payload.runId === "string" ? event.payload.runId : undefined
          if (!runId) return
          const toolName = typeof event.payload.toolName === "string" ? event.payload.toolName : "tool"
          const kind = event.payload.kind === "tool_end" ? "done" : "started"
          const subagentType =
            typeof event.payload.subagentType === "string" ? event.payload.subagentType : "specialist"
          appendPipelineEvent({
            stage: pipelineStageForSubagent(subagentType),
            message: `${toolName} ${kind}`,
            type: "info",
          })
          return
        }
        case "subagent_end": {
          const runId = typeof event.payload.runId === "string" ? event.payload.runId : undefined
          if (!runId) return
          const result = typeof event.payload.result === "string" ? event.payload.result : "Specialist completed"
          setSubagentRecords((current) => {
            const existing = current.get(runId)
            if (!existing) return current
            const next = new Map(current)
            next.set(runId, {
              ...existing,
              status: "complete",
              result,
              messages: [...existing.messages, createMessage("ai", result)],
              completedAt: event.payload.completedAt ? new Date(String(event.payload.completedAt)) : new Date(),
            })
            return next
          })
          const subagentType =
            typeof event.payload.subagentType === "string" ? event.payload.subagentType : "specialist"
          appendPipelineEvent({ stage: pipelineStageForSubagent(subagentType), message: result, type: "success" })
          return
        }
        case "subagent_error": {
          const runId = typeof event.payload.runId === "string" ? event.payload.runId : undefined
          const message = typeof event.payload.message === "string" ? event.payload.message : "Specialist failed"
          if (runId) {
            setSubagentRecords((current) => {
              const existing = current.get(runId)
              if (!existing) return current
              const next = new Map(current)
              next.set(runId, {
                ...existing,
                status: "error",
                error: message,
                messages: [...existing.messages, createMessage("ai", message)],
                completedAt: event.payload.completedAt ? new Date(String(event.payload.completedAt)) : new Date(),
              })
              return next
            })
          }
          appendPipelineEvent({ stage: "error", message, type: "error" })
          return
        }
        case "render_status": {
          if (coveredBySnapshot) return
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
          activeAssistantIdRef.current = null
          if (coveredBySnapshot) return
          const nextError = event.payload.message ?? "Error en Agent Pi"
          appendPipelineEvent({ stage: "error", message: String(nextError), type: "error" })
          setError(nextError)
          setIsLoading(false)
          onError?.(nextError)
          return
        }
        case "agent_end": {
          activeAssistantIdRef.current = null
          if (coveredBySnapshot) return
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
    [
      addEnrichment,
      addVideoResult,
      appendAssistantDelta,
      appendPipelineEvent,
      checkpointData,
      checkpointType,
      ensureAssistantMessage,
      onError,
    ],
  )

  useEffect(() => {
    if (!activeThreadId) return
    let cancelled = false
    const generation = threadGenerationRef.current
    const actionGeneration = actionGenerationRef.current
    fetchPiThread(activeThreadId)
      .then((snapshot) => {
        if (
          cancelled ||
          !shouldApplyPiSnapshot(
            activeThreadId,
            generation,
            threadGenerationRef.current,
            actionGeneration,
            actionGenerationRef.current,
            authorityRevisionRef.current,
            snapshot.thread,
          )
        )
          return
        authorityRevisionRef.current = snapshot.thread.revision
        snapshotRevisionRef.current = snapshot.thread.revision
        artifactDataByIdRef.current = new Map(snapshot.artifacts.map((artifact) => [artifact.id, artifact.data]))
        const checkpoint = snapshot.thread.checkpoint
        setCheckpointType(checkpoint ? (CHECKPOINT_TYPE_MAP[checkpoint.type] ?? "generic") : null)
        setCheckpointData(checkpoint ? checkpointDataWithArtifact(checkpoint, snapshot.artifacts) : null)
        setIsLoading(snapshot.thread.status === "running")
        setError(snapshot.thread.status === "error" ? "Agent Pi failed; retry the current action." : null)
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
    const generation = threadGenerationRef.current
    const source = new EventSource(getPiEventsUrl(activeThreadId, lastSeqRef.current))
    const applyEvent = (event: PiEvent | null) => {
      if (event && generation === threadGenerationRef.current) handleEvent(event)
    }
    source.onmessage = (message) => {
      applyEvent(parsePiEvent(message.data))
    }
    const eventTypes: PiEvent["type"][] = [
      "message_delta",
      "tool_start",
      "tool_end",
      "checkpoint",
      "artifact_updated",
      "plan_updated",
      "render_status",
      "subagent_start",
      "subagent_update",
      "subagent_end",
      "subagent_error",
      "error",
      "agent_end",
    ]
    for (const type of eventTypes) {
      source.addEventListener(type, (message) => {
        applyEvent(parsePiEvent((message as MessageEvent).data))
      })
    }
    source.onerror = () => {
      // EventSource retries automatically. Keep the UI state; the backend replays from last seq.
    }
    return () => source.close()
  }, [activeThreadId, handleEvent])

  const submit = useCallback(
    (message: string) => {
      const generation = threadGenerationRef.current
      const actionGeneration = ++actionGenerationRef.current
      setError(null)
      setIsLoading(true)
      sendPiChat(message, activeThreadId)
        .then(({ threadId: nextThreadId }) => {
          if (
            !isCurrentPiRequest(generation, threadGenerationRef.current, actionGeneration, actionGenerationRef.current)
          )
            return
          if (nextThreadId !== activeThreadId) {
            setActiveThreadId(nextThreadId)
            onThreadId?.(nextThreadId)
          }
        })
        .catch((err) => {
          if (
            !isCurrentPiRequest(generation, threadGenerationRef.current, actionGeneration, actionGenerationRef.current)
          )
            return
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
      const generation = threadGenerationRef.current
      const actionGeneration = ++actionGenerationRef.current
      const boundDecision = {
        ...decision,
        ...(typeof checkpointData?.checkpointId === "string" ? { checkpointId: checkpointData.checkpointId } : {}),
        ...(typeof checkpointData?.artifactId === "string" ? { artifactId: checkpointData.artifactId } : {}),
        ...(typeof checkpointData?.version === "number" ? { version: checkpointData.version } : {}),
      }
      setError(null)
      setIsLoading(true)
      resumePiCheckpoint(activeThreadId, boundDecision).catch((err) => {
        if (!isCurrentPiRequest(generation, threadGenerationRef.current, actionGeneration, actionGenerationRef.current))
          return
        setError(err)
        setIsLoading(false)
        onError?.(err)
      })
    },
    [activeThreadId, checkpointData, onError],
  )

  const retry = useCallback(() => {
    if (!activeThreadId) return
    const generation = threadGenerationRef.current
    const actionGeneration = ++actionGenerationRef.current
    setError(null)
    setIsLoading(true)
    retryPiAction(activeThreadId).catch((err) => {
      if (!isCurrentPiRequest(generation, threadGenerationRef.current, actionGeneration, actionGenerationRef.current))
        return
      setError(err)
      setIsLoading(false)
      onError?.(err)
    })
  }, [activeThreadId, onError])

  const switchThread = useCallback(
    (newThreadId: string | null) => {
      if (newThreadId === activeThreadId) return
      threadGenerationRef.current += 1
      actionGenerationRef.current += 1
      setActiveThreadId(newThreadId)
    },
    [activeThreadId],
  )

  const subagents = useMemo(() => {
    const result = new Map<string, SubagentStreamInterface>()
    for (const [id, record] of subagentRecords) result.set(id, toSubagentStream(record))
    return result
  }, [subagentRecords])
  const activeSubagents = useMemo(
    () => [...subagents.values()].filter((subagent) => subagent.status === "running" || subagent.status === "pending"),
    [subagents],
  )
  const getSubagentsByMessage = useCallback(
    (messageId: string) =>
      [...subagentRecords.values()]
        .filter((record) => record.parentMessageId === messageId)
        .map((record) => toSubagentStream(record)),
    [subagentRecords],
  )

  return {
    messages,
    isLoading,
    error,
    subagents,
    activeSubagents,
    getSubagentsByMessage,
    checkpointType,
    checkpointData,
    isInterrupted: checkpointType != null,
    enrichments,
    pipelineEvents,
    planState,
    submit,
    resume,
    retry,
    switchThread,
    addEnrichment,
    clearEnrichments,
  }
}
