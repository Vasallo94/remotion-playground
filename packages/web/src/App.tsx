import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { StoredVideoArtifact } from "./types"
import { fetchConfigs, fetchJobStatus, fetchLatestRender } from "./api"
import { useVideoStream } from "./hooks/useVideoStream"
import { usePiVideoStream } from "./hooks/usePiVideoStream"
import { usePipelineTracker } from "./hooks/usePipelineTracker"
import { loadingLabelFromPlan, isRenderingStep } from "./lib/planState"
import { AppLayout } from "./components/AppLayout"
import { Sidebar } from "./components/Sidebar"
import { Header } from "./components/Header"
import { ChatThread } from "./components/ChatThread"
import { InputBar } from "./components/InputBar"
import {
  getThreads,
  saveThread,
  removeThread,
  getCurrentThreadId,
  setCurrentThreadId,
  getActiveVideoTarget,
  getVideoArtifacts,
  saveVideoArtifact,
  setActiveVideoTarget,
  type StoredThread,
} from "./lib/threadStorage"

const AGENT_RUNTIME = import.meta.env.VITE_AGENT_RUNTIME ?? "pi"
const useSelectedVideoStream = AGENT_RUNTIME === "pi" ? usePiVideoStream : useVideoStream

// ---------------------------------------------------------------------------
// Helpers — kept from previous version
// ---------------------------------------------------------------------------

function artifactFromCompletedJob(job: {
  id: string
  config_id: string | null
  title: string | null
  composition: string
}): StoredVideoArtifact {
  return {
    id: job.id,
    configPath: `.generated/renders/${job.id}/config.json`,
    configId: job.config_id ?? undefined,
    jobId: job.id,
    composition: job.composition,
    title: job.title ?? job.config_id ?? job.id,
    createdAt: new Date().toISOString(),
    source: "render",
  }
}

function artifactFromConfig(config: {
  configPath: string
  configId?: string
  jobId?: string
  title?: string
  composition?: string
  sceneCount?: number
  durationSeconds?: number
  source?: "content" | "render"
}): StoredVideoArtifact {
  return {
    id: config.jobId ?? config.configPath,
    configPath: config.configPath,
    configId: config.configId,
    jobId: config.jobId,
    composition: config.composition,
    title: config.title ?? config.configId ?? config.configPath,
    createdAt: new Date().toISOString(),
    sceneCount: config.sceneCount,
    durationSeconds: config.durationSeconds,
    source: config.source,
  }
}

function mergeArtifacts(primary: StoredVideoArtifact[], secondary: StoredVideoArtifact[]): StoredVideoArtifact[] {
  const seen = new Set<string>()
  const merged: StoredVideoArtifact[] = []
  for (const artifact of [...primary, ...secondary]) {
    const key = artifact.jobId ? `job:${artifact.jobId}` : `config:${artifact.configPath}`
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(artifact)
  }
  return merged
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
  const [input, setInput] = useState("")
  const [threadId, setThreadId] = useState<string | null>(() => getCurrentThreadId())
  const [storedThreads, setStoredThreads] = useState<StoredThread[]>(() => getThreads())
  const [videoArtifacts, setVideoArtifacts] = useState<StoredVideoArtifact[]>(() => getVideoArtifacts())
  const [activeTarget, setActiveTargetState] = useState(() => getActiveVideoTarget())
  const activeTargetRef = useRef(activeTarget)
  activeTargetRef.current = activeTarget
  const pipeline = usePipelineTracker()

  // ----- Core stream hook -----
  const videoStream = useSelectedVideoStream({
    threadId,
    onThreadId: (id) => {
      setThreadId(id)
      setCurrentThreadId(id)
      saveThread({
        threadId: id,
        title: input.trim().slice(0, 60) || "Nueva conversacion",
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      })
      setStoredThreads(getThreads())
    },
    onError: (error) => {
      const msg = error instanceof Error ? error.message : String(error)
      pipeline.addEvent("error", msg, "error")
    },
    activeTarget,
  })

  // ----- Load configs on mount -----
  useEffect(() => {
    fetchConfigs()
      .then((response) => {
        const fromConfigs = response.configs
          .filter((config) => !config.error)
          .map((config) => artifactFromConfig(config))
        const merged = mergeArtifacts(fromConfigs, getVideoArtifacts())
        setVideoArtifacts(merged)
      })
      .catch((err) => console.warn("[init] fetchConfigs failed:", err))
  }, [])

  // ----- Detect video results when stream finishes -----
  useEffect(() => {
    if (videoStream.isLoading) return
    if (!videoStream.messages.length) return
    if (videoStream.isInterrupted) return

    const aiMessages = videoStream.messages.filter((m) => (m as { type: string }).type === "ai")
    const lastFew = aiMessages.slice(-3)

    let jobId: string | null = null
    for (const msg of lastFew) {
      const content = typeof msg.content === "string" ? msg.content : ""
      const match =
        content.match(/jobId[:\s]*["']?([a-f0-9-]{36})["']?/i) ||
        content.match(/(?:render|job|video)[^]*?\b([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\b/i)
      if (match) {
        jobId = match[1]
        break
      }
    }

    if (jobId) {
      fetchJobStatus(jobId)
        .then((job) => {
          if (job.status === "done") {
            const artifact = artifactFromCompletedJob(job)
            saveVideoArtifact(artifact)
            setVideoArtifacts(getVideoArtifacts())
            setActiveVideoTarget(artifact)
            setActiveTargetState(artifact)
            videoStream.addEnrichment({
              id: crypto.randomUUID(),
              type: "video_result",
              content: "Video listo:",
              data: { jobId: job.id, title: job.title, fileSize: job.file_size },
            })
          }
        })
        .catch((err) => console.warn("[auto-lookup] fetchJobStatus failed:", err))
    } else if (activeTargetRef.current?.configId) {
      fetchLatestRender(activeTargetRef.current.configId)
        .then((job) => {
          if (job) {
            videoStream.addEnrichment({
              id: crypto.randomUUID(),
              type: "video_result",
              content: "Video listo:",
              data: { jobId: job.id, title: job.title, fileSize: job.file_size },
            })
          }
        })
        .catch(() => {})
    }
  }, [videoStream.isLoading]) // eslint-disable-line react-hooks/exhaustive-deps

  // ----- Thread management -----

  const handleNewThread = useCallback(() => {
    setThreadId(null)
    setCurrentThreadId(null)
    videoStream.switchThread(null)
    videoStream.clearEnrichments()
    setActiveVideoTarget(null)
    setActiveTargetState(null)
    pipeline.reset()
  }, [videoStream, pipeline])

  const handleSelectThread = useCallback(
    (tid: string) => {
      setThreadId(tid)
      setCurrentThreadId(tid)
      videoStream.switchThread(tid)
      pipeline.reset()
    },
    [videoStream, pipeline],
  )

  const handleDeleteThread = useCallback(
    (tid: string) => {
      removeThread(tid)
      setStoredThreads(getThreads())
      if (tid === threadId) handleNewThread()
    },
    [threadId, handleNewThread],
  )

  // ----- Target management -----

  const handleSelectTarget = useCallback(
    (target: StoredVideoArtifact | null) => {
      setActiveVideoTarget(target)
      setActiveTargetState(target)
      if (target?.jobId) {
        videoStream.addEnrichment({
          id: crypto.randomUUID(),
          type: "video_result",
          content: "Video listo:",
          data: { jobId: target.jobId, title: target.title ?? target.configId ?? target.jobId, fileSize: null },
        })
        return
      }
      if (target?.configId) {
        fetchLatestRender(target.configId)
          .then((job) => {
            if (job) {
              videoStream.addEnrichment({
                id: crypto.randomUUID(),
                type: "video_result",
                content: "Video listo:",
                data: { jobId: job.id, title: job.title, fileSize: job.file_size },
              })
            }
          })
          .catch(() => {})
      }
    },
    [videoStream],
  )

  // ----- Send message -----

  const handleSend = useCallback(() => {
    const text = input.trim()
    if (!text || videoStream.isLoading) return
    setInput("")
    pipeline.reset()
    videoStream.submit(text)
  }, [input, videoStream, pipeline])

  // ----- Checkpoint handlers -----

  const createCheckpointHandlers = useCallback(
    () => ({
      onApprove: (payload?: Record<string, unknown>) => {
        if (videoStream.isLoading) return
        videoStream.resume({ approved: true, ...payload })
      },
      onRequestChanges: (feedback: string) => {
        if (videoStream.isLoading) return
        videoStream.resume({ approved: false, feedback })
      },
    }),
    [videoStream],
  )

  const checkpointHandlers = useMemo(
    () => ({
      escaleta: createCheckpointHandlers(),
      script: createCheckpointHandlers(),
      direction: createCheckpointHandlers(),
      sound_chart: createCheckpointHandlers(),
      audio_chart: createCheckpointHandlers(),
      interaction: createCheckpointHandlers(),
      validation: createCheckpointHandlers(),
      target_selection: createCheckpointHandlers(),
      revision_plan: createCheckpointHandlers(),
      variant_plan: createCheckpointHandlers(),
      generic: createCheckpointHandlers(),
      candidate_promotion: createCheckpointHandlers(),
    }),
    [createCheckpointHandlers],
  )

  // ----- Derived loading label -----
  const loadingLabel = loadingLabelFromPlan(videoStream.planState)
  const rendering = isRenderingStep(videoStream.planState)

  // ----- Render -----

  return (
    <AppLayout
      sidebar={
        <Sidebar
          plan={videoStream.planState}
          isLoading={videoStream.isLoading}
          hasError={videoStream.error != null}
          events={videoStream.pipelineEvents ?? pipeline.state.events}
          threads={storedThreads}
          currentThreadId={threadId ?? undefined}
          onSelectThread={handleSelectThread}
          onDeleteThread={handleDeleteThread}
          onNewThread={handleNewThread}
        />
      }
      main={
        <>
          <Header artifacts={videoArtifacts} activeTarget={activeTarget} onSelectTarget={handleSelectTarget} />
          <ChatThread
            messages={videoStream.messages}
            getSubagentsByMessage={videoStream.getSubagentsByMessage}
            activeSubagents={videoStream.activeSubagents}
            checkpointType={videoStream.checkpointType}
            checkpointData={videoStream.checkpointData}
            checkpointHandlers={checkpointHandlers}
            enrichments={videoStream.enrichments}
            isLoading={videoStream.isLoading}
            loadingLabel={loadingLabel}
            error={videoStream.error}
            onRetry={videoStream.retry}
            isRendering={rendering}
          />
          <InputBar
            value={input}
            onChange={setInput}
            onSend={handleSend}
            disabled={videoStream.isLoading}
            activeTarget={activeTarget}
          />
        </>
      }
    />
  )
}
