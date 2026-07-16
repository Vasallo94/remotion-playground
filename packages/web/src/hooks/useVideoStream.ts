import { useCallback, useMemo, useRef, useState } from "react"
import { useStream } from "@langchain/langgraph-sdk/react"
import type { Message } from "@langchain/langgraph-sdk"
import type { UseStreamOptions, SubagentStreamInterface, UseStream } from "@langchain/langgraph-sdk/react"
import { ASSISTANT_ID } from "../api"
import { appendTargetMetadata } from "../lib/targetMetadata"
import { extractPlanState, type PlanState } from "../lib/planState"
import type { ActiveVideoTarget, CheckpointType, Enrichment, PipelineEvent } from "../types"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_URL = import.meta.env.VITE_LANGGRAPH_URL ?? "http://127.0.0.1:2024"

/**
 * Maps agent interrupt `value.type` strings to our internal CheckpointType.
 */
const CHECKPOINT_TYPE_MAP: Record<string, CheckpointType> = {
  sound_chart_checkpoint: "sound_chart",
  audio_chart_checkpoint: "audio_chart",
  direction_checkpoint: "direction",
  escaleta_checkpoint: "escaleta",
  interaction_request: "interaction",
  validation_report: "validation",
  target_selection_checkpoint: "target_selection",
  revision_plan_checkpoint: "revision_plan",
  variant_plan_checkpoint: "variant_plan",
  candidate_promotion_checkpoint: "candidate_promotion",
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AgentState = Record<string, unknown>

/**
 * Extended options type that includes DeepAgent-specific fields.
 * The backend is a DeepAgent, but we don't have its type definition on the
 * frontend. We use UseStreamOptions plus the deep-agent extras.
 */
type DeepAgentStreamOptions = UseStreamOptions<AgentState> & {
  filterSubagentMessages?: boolean
  subagentToolNames?: string[]
}

/** Full UseStream interface with subagent support. */
type FullStream = UseStream<AgentState>

export interface UseVideoStreamOptions {
  /** Persisted thread ID to restore a conversation. */
  threadId?: string | null
  /** Called when the SDK creates or switches to a new thread. */
  onThreadId?: (threadId: string) => void
  /** Called on unrecoverable stream errors. */
  onError?: (error: unknown) => void
  /** The currently active video target — injected as metadata into messages. */
  activeTarget?: ActiveVideoTarget | null
}

export interface VideoStreamReturn {
  // --- SDK passthrough ---
  messages: Message[]
  isLoading: boolean
  error: unknown
  subagents: Map<string, SubagentStreamInterface>
  activeSubagents: SubagentStreamInterface[]
  getSubagentsByMessage: (messageId: string) => SubagentStreamInterface[]

  // --- Derived state ---
  /** Current checkpoint type derived from `stream.interrupt`, or null. */
  checkpointType: CheckpointType | null
  /** The raw interrupt value (checkpoint payload), or null. */
  checkpointData: Record<string, unknown> | null
  /** Whether an interrupt is currently active and resumable. */
  isInterrupted: boolean
  /** Local enrichments (video results, system messages). */
  enrichments: Enrichment[]
  /** Basic pipeline events for the sidebar log. Pi runtime fills this directly. */
  pipelineEvents?: PipelineEvent[]
  /** Pipeline plan state extracted from agent state, or null if no plan exists. */
  planState: PlanState | null

  // --- Actions ---
  /** Send a new user message. Injects target metadata automatically. */
  submit: (message: string) => void
  /** Resume from an interrupt with a decision payload. */
  resume: (decision: Record<string, unknown>) => void
  /** Explicitly retry the current failed parent-owned action when supported. */
  retry: () => void
  /** Switch to a different thread (or null to start fresh). */
  switchThread: (newThreadId: string | null) => void
  /** Add an enrichment (video result, system notice). */
  addEnrichment: (enrichment: Enrichment) => void
  /** Clear all enrichments. */
  clearEnrichments: () => void
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useVideoStream(options: UseVideoStreamOptions = {}): VideoStreamReturn {
  const { threadId, onThreadId, onError, activeTarget } = options

  // Stable refs for callbacks to avoid re-creating the stream config
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError
  const activeTargetRef = useRef(activeTarget)
  activeTargetRef.current = activeTarget

  // Local enrichments state
  const [enrichments, setEnrichments] = useState<Enrichment[]>([])

  // ----- SDK useStream -----
  // The backend is a DeepAgent but we lack its TS type on the frontend.
  // We cast the options to include filterSubagentMessages / subagentToolNames
  // (accepted at runtime by the SDK even for the plain overload), and cast
  // the return to UseStream which surfaces the subagent APIs.
  const stream = useStream<AgentState>({
    apiUrl: API_URL,
    assistantId: ASSISTANT_ID,
    threadId: threadId ?? null,
    onThreadId,
    onError: (error: unknown) => {
      onErrorRef.current?.(error)
    },
    onFinish: () => {},
    filterSubagentMessages: true,
    subagentToolNames: ["task"],
  } as DeepAgentStreamOptions) as unknown as FullStream

  // ----- Plan state from agent values -----
  const planState = useMemo(
    () => extractPlanState(stream.values as Record<string, unknown> | undefined),
    [stream.values],
  )

  // ----- Checkpoint extraction from interrupt -----
  const interrupt = stream.interrupt
  const interruptValue =
    interrupt?.value && typeof interrupt.value === "object" ? (interrupt.value as Record<string, unknown>) : null

  const checkpointType: CheckpointType | null = (() => {
    if (!interruptValue) return null
    const rawType = typeof interruptValue.type === "string" ? interruptValue.type : null
    if (!rawType) return "generic"
    return CHECKPOINT_TYPE_MAP[rawType] ?? "generic"
  })()

  const isInterrupted = interrupt != null

  // ----- Enrichments -----
  const messagesRef = useRef(stream.messages)
  messagesRef.current = stream.messages

  const addEnrichment = useCallback((enrichment: Enrichment) => {
    const lastId = messagesRef.current[messagesRef.current.length - 1]?.id
    setEnrichments((prev) => [...prev, { ...enrichment, afterMessageId: enrichment.afterMessageId ?? lastId }])
  }, [])

  const clearEnrichments = useCallback(() => {
    setEnrichments([])
  }, [])

  // ----- Submit (new message) -----
  const submit = useCallback(
    (message: string) => {
      const content = appendTargetMetadata(message, activeTargetRef.current)
      stream.submit({ messages: [{ type: "human" as const, content }] }, { streamSubgraphs: true })
    },
    [stream],
  )

  // ----- Resume (from interrupt) -----
  const resume = useCallback(
    (decision: Record<string, unknown>) => {
      if (checkpointType && interruptValue) {
        addEnrichment({
          id: crypto.randomUUID(),
          type: "resolved_checkpoint",
          content: "",
          data: {
            checkpointType,
            checkpointData: { ...interruptValue },
            userDecision: decision,
          },
        })
      }
      stream.submit(null, {
        command: { resume: decision },
        streamSubgraphs: true,
      })
    },
    [stream, checkpointType, interruptValue, addEnrichment],
  )

  const retry = useCallback(() => {}, [])

  // ----- Thread switching -----
  const switchThread = useCallback(
    (newThreadId: string | null) => {
      setEnrichments([])
      stream.switchThread(newThreadId)
    },
    [stream],
  )

  return {
    // SDK passthrough
    messages: stream.messages,
    isLoading: stream.isLoading,
    error: stream.error,
    subagents: stream.subagents,
    activeSubagents: stream.activeSubagents,
    getSubagentsByMessage: stream.getSubagentsByMessage,

    // Derived
    checkpointType,
    checkpointData: interruptValue,
    isInterrupted,
    enrichments,
    planState,

    // Actions
    submit,
    resume,
    retry,
    switchThread,
    addEnrichment,
    clearEnrichments,
  }
}
