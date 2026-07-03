export type ThreadStatus = "idle" | "running" | "waiting" | "done" | "error"

export type ArtifactKind = "script" | "script_markdown" | "direction" | "config" | "render_job"

export type CheckpointKind = "script_checkpoint" | "direction_checkpoint"

export type PiSseEventType =
  | "message_delta"
  | "tool_start"
  | "tool_end"
  | "checkpoint"
  | "artifact_updated"
  | "render_status"
  | "error"
  | "agent_end"

export interface PiSseEvent<TPayload = unknown> {
  seq?: number
  threadId: string
  type: PiSseEventType
  payload: TPayload
  createdAt?: string
}

export interface ThreadRecord {
  id: string
  title: string | null
  status: ThreadStatus
  piSessionId: string | null
  piSessionFile: string | null
  checkpoint: CheckpointRecord | null
  createdAt: string
  updatedAt: string
}

export interface CheckpointRecord<TPayload = unknown> {
  id: string
  type: CheckpointKind
  artifactId: string | null
  payload: TPayload
}

export interface ArtifactRecord<TData = unknown> {
  id: string
  threadId: string
  kind: ArtifactKind
  version: number
  path: string | null
  data: TData
  approved: boolean
  createdAt: string
}

export interface SceneScriptDraft {
  id: string
  type: string
  title?: string
  voiceover?: string
  visualNotes?: string
  narrativeRole?: string
  visualType?: string
  componentId?: string
  visualRationale?: string
  requiredAssets?: string[]
  missingCapabilities?: string[]
  riskNotes?: string[]
  durationInSeconds: number
}

export interface ScriptDraft {
  title: string
  objective: string
  audience?: string
  tone?: string
  scenes: SceneScriptDraft[]
  estimatedDurationSeconds?: number
  notes?: string
}

export interface DirectionDraft {
  title?: string
  scenes: Array<Record<string, unknown>>
  warnings?: string[]
  audio?: Record<string, unknown>
  risks?: string[]
}

export interface RenderJobStatus {
  id: string
  config_id: string | null
  title: string | null
  composition: string
  status: string
  progress: number
  output_path: string | null
  file_size: number | null
  thread_id: string | null
  error: string | null
  created_at: string
  completed_at: string | null
}

export interface ModelRoute {
  provider: string
  model: string
  thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh"
}

export type ModelTask = "main" | "narrative" | "direction" | "config" | "validation" | "tts" | "sfx"

export interface ModelRoutingConfig {
  routes: Partial<Record<ModelTask, ModelRoute>>
}
