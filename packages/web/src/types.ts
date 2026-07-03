export type MessageRole = "user" | "assistant"
export type CheckpointType =
  | "interaction"
  | "escaleta"
  | "script"
  | "direction"
  | "sound_chart"
  | "audio_chart"
  | "validation"
  | "target_selection"
  | "revision_plan"
  | "variant_plan"
  | "generic"
  | "video_result"

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  checkpoint?:
    | CheckpointData
    | SoundChartData
    | AudioChartData
    | ScriptCheckpointData
    | DirectionData
    | ValidationReportData
    | InteractionRequestData
    | TargetSelectionData
    | RevisionPlanData
    | VariantPlanData
    | Record<string, unknown>
  checkpointType?: CheckpointType
}

export interface ToolEntry {
  id: string
  toolCallId?: string
  name: string
  input?: string
  output?: string
  namespace?: string[]
  status: "running" | "done" | "error"
  startedAt: number
}

export interface Enrichment {
  id: string
  type: "video_result" | "system" | "resolved_checkpoint"
  content: string
  data?: Record<string, unknown>
  afterMessageId?: string
}

export interface CheckpointData {
  type: string
  brief: Record<string, string>
  scenes: ScenePreview[]
}

export interface ScenePreview {
  type: string
  title?: string
  text?: string
  durationInSeconds: number
  [key: string]: unknown
}

export interface ScriptCheckpointData {
  type: "script_checkpoint"
  artifactId?: string
  version?: number
  path?: string
  title: string
  objective: string
  audience?: string
  tone?: string
  estimatedDurationSeconds?: number
  notes?: string
  scenes: Array<{
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
  }>
}

export interface DirectionData {
  type: "direction_checkpoint"
  scenes: Array<Record<string, unknown>>
  warnings: string[]
}

export interface InteractionOption {
  id: string
  label: string
  value: string
  description?: string
}

export type InteractionInput =
  | {
      kind: "text"
      required?: boolean
      placeholder?: string
    }
  | {
      kind: "single_choice"
      required?: boolean
      options: InteractionOption[]
    }
  | {
      kind: "multi_choice"
      required?: boolean
      options: InteractionOption[]
      min?: number
      max?: number
    }
  | {
      kind: "approval"
      required?: boolean
      approveLabel?: string
      rejectLabel?: string
    }

export interface InteractionRequestData {
  type: "interaction_request"
  sourceAgent?: string
  intent?: "clarification" | "creative_choice" | "approval" | "onboarding" | "explanation" | string
  title: string
  body?: string
  input: InteractionInput
}

export interface TargetSelectionData {
  type: "target_selection_checkpoint"
  mode: string
  candidates: Array<ActiveVideoTarget & { sceneCount?: number; durationSeconds?: number; error?: string }>
}

export interface RevisionPlanData {
  type: "revision_plan_checkpoint"
  target: Record<string, unknown>
  requestedChanges: string[]
  proposedEdits: string[]
  willRender?: boolean
}

export interface VariantPlanData {
  type: "variant_plan_checkpoint"
  source: Record<string, unknown>
  variant: Record<string, unknown>
  proposedChanges: string[]
  willRender?: boolean
}

export interface SoundChartData {
  type: "sound_chart_checkpoint"
  music_bed: {
    libraryId?: string
    volume: number
    duckingVolume: number
  }
  sfx_entries: Array<{
    id: string
    prompt: string
    trigger: string
    sceneTypes?: string[]
    volume: number
    loop?: boolean
  }>
}

export interface AudioChartData {
  type: "audio_chart_checkpoint"
  voiceover?: Record<string, unknown>
  sound_design?: Record<string, unknown>
}

export interface ValidationReportData {
  type: "validation_report"
  errors: string[]
  warnings: string[]
  recommendations: string[]
}

export type PipelineStageId =
  | "idle"
  | "orchestrator"
  | "researcher"
  | "copywriter"
  | "escaleta_review"
  | "director"
  | "sound_engineer"
  | "sound_review"
  | "scene_creator"
  | "validator"
  | "rendering"
  | "done"
  | "error"

export interface PipelineEvent {
  id: string
  timestamp: Date
  stage: PipelineStageId
  message: string
  type: "info" | "checkpoint" | "success" | "error"
}

export interface RenderJob {
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

export interface JobListResponse {
  jobs: RenderJob[]
  total: number
  limit: number
  offset: number
}

export interface ActiveVideoTarget {
  configPath: string
  configId?: string
  jobId?: string
  composition?: string
  title?: string
  source?: "content" | "render"
}

export interface StoredVideoArtifact extends ActiveVideoTarget {
  id: string
  createdAt: string
  sceneCount?: number
  durationSeconds?: number
}

export interface ConfigListResponse {
  configs: Array<ActiveVideoTarget & { sceneCount?: number; durationSeconds?: number; error?: string }>
}
