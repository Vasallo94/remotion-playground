export type ThreadStatus = "idle" | "running" | "waiting" | "done" | "error"

export type PipelineMode =
  | "new_video"
  | "revise_existing"
  | "render_only"
  | "recover_failed_render"
  | "audit_only"
  | "variant"
  | "asset_regeneration"
  | "question"

export type ArtifactKind =
  | "production_brief"
  | "selected_target"
  | "research"
  | "script"
  | "script_markdown"
  | "direction"
  | "audio_chart"
  | "audio_assets"
  | "validation_report"
  | "qa_report"
  | "qa_lineage"
  | "direction_revision_request"
  | "render_review"
  | "scene_composition"
  | "visual_recipe"
  | "visual_recipe_evidence"
  | "active_visual_recipe_set"
  | "candidate_package"
  | "candidate_verification"
  | "candidate_promotion_plan"
  | "candidate_promotion_result"
  | "config_lineage"
  | "config"
  | "render_job"

export type PipelineStepStatus = "pending" | "in_progress" | "completed" | "blocked" | "skipped" | "failed"
export type PipelinePlanStatus = "active" | "blocked" | "completed" | "failed"
export type PipelineDecisionStatus = "approved" | "changes_requested" | "selected" | "skipped"

/** Nominal identifiers keep journal keys and fingerprints from being interchanged accidentally. */
export type ActionKey = string & { readonly __brand: "ActionKey" }
export type ActionName = string & { readonly __brand: "ActionName" }
export type InputSnapshotFingerprint = string & { readonly __brand: "InputSnapshotFingerprint" }

export type ActionAttemptStatus = "started" | "succeeded" | "failed"

export interface ActionAttemptError {
  readonly code: string
  readonly message: string
  readonly details?: unknown
}

export interface ActionAttemptRecord {
  readonly schemaVersion: 1
  readonly actionKey: ActionKey
  readonly threadId: string
  readonly planId: string
  readonly mode: PipelineMode
  readonly action: ActionName
  readonly inputFingerprint: InputSnapshotFingerprint
  readonly status: ActionAttemptStatus
  readonly outcome: unknown | null
  readonly error: ActionAttemptError | null
  readonly attemptCount: number
  readonly startedAt: string
  readonly finishedAt: string | null
  readonly updatedAt: string
  readonly artifactMetadata: unknown | null
  readonly effectMetadata: unknown | null
}

export interface BeginActionAttemptInput {
  readonly actionKey: ActionKey
  readonly threadId: string
  readonly planId: string
  readonly mode: PipelineMode
  readonly action: ActionName
  readonly inputFingerprint: InputSnapshotFingerprint
  readonly artifactMetadata?: unknown
  readonly effectMetadata?: unknown
}

export interface BeginActionAttemptOptions {
  /** Failed actions are not retried unless the parent explicitly opts into the retry policy. */
  readonly retryFailed?: boolean
}

export type BeginActionAttemptResult =
  | { readonly status: "started"; readonly retried: boolean; readonly record: ActionAttemptRecord }
  | { readonly status: "succeeded"; readonly duplicate: true; readonly record: ActionAttemptRecord }
  | { readonly status: "in_progress"; readonly record: ActionAttemptRecord }
  | { readonly status: "failed"; readonly retryable: true; readonly record: ActionAttemptRecord }
  | {
      readonly status: "conflict"
      readonly reason: "input_fingerprint_mismatch" | "action_identity_mismatch"
      readonly record: ActionAttemptRecord
    }

export interface CompleteActionAttemptInput {
  readonly actionKey: ActionKey
  readonly threadId: string
  readonly inputFingerprint: InputSnapshotFingerprint
  /** Attempt generation returned by beginActionAttempt; prevents stale callbacks from completing a retry. */
  readonly attemptCount: number
  readonly outcome?: unknown
  readonly artifactMetadata?: unknown
  readonly effectMetadata?: unknown
}

export interface FailActionAttemptInput {
  readonly actionKey: ActionKey
  readonly threadId: string
  readonly inputFingerprint: InputSnapshotFingerprint
  /** Attempt generation returned by beginActionAttempt; prevents stale callbacks from failing a retry. */
  readonly attemptCount: number
  readonly error: ActionAttemptError
  readonly artifactMetadata?: unknown
  readonly effectMetadata?: unknown
}

export type ActionAttemptMutationResult =
  | { readonly status: "succeeded"; readonly duplicate: boolean; readonly record: ActionAttemptRecord }
  | { readonly status: "failed"; readonly duplicate: boolean; readonly record: ActionAttemptRecord }
  | {
      readonly status: "rejected"
      readonly reason:
        | "not_found"
        | "input_fingerprint_mismatch"
        | "attempt_count_mismatch"
        | "not_started"
        | "already_succeeded"
      readonly record?: ActionAttemptRecord
    }

export interface ArtifactLineageReference {
  artifactId: string
  version: number
  contentHash: string
}

export interface ActiveVisualRecipeSetLineageReference extends ArtifactLineageReference {
  targetId: string
  digest: string
}

export interface QaReportLineage {
  schemaVersion: 1
  qaReport: ArtifactLineageReference
  config: ArtifactLineageReference
  activeVisualRecipeSet?: ActiveVisualRecipeSetLineageReference | null
}

export interface DirectionRevisionRequest {
  schemaVersion: 1
  source: "scene_qa" | "direction_checkpoint"
  feedback: string
  checkpoint: { id: string; type: "qa_report_checkpoint" | "direction_checkpoint" }
  baseDirection: ArtifactLineageReference
  baseConfig: ArtifactLineageReference | null
  qaReport: ArtifactLineageReference | null
}

export interface PipelineStep {
  id: string
  owner: string
  title: string
  status: PipelineStepStatus
  summary: string
  artifactPaths: string[]
  blockers: string[]
  startedAt?: string
  completedAt?: string
  modelRoute?: string
}

export interface PipelineDecision {
  id: string
  checkpointId: string
  stepId: string
  status: PipelineDecisionStatus
  summary: string
  payload?: unknown
  createdAt: string
}

export interface PipelinePlan {
  schemaVersion: number
  id: string
  threadId: string
  mode: PipelineMode
  goal: string
  status: PipelinePlanStatus
  steps: PipelineStep[]
  decisions: PipelineDecision[]
  currentStepId: string | null
  progress: { completed: number; total: number }
  createdAt: string
  updatedAt: string
}

export type CheckpointKind =
  | "intake_clarification"
  | "target_clarification"
  | "script_checkpoint"
  | "direction_checkpoint"
  | "audio_chart_checkpoint"
  | "qa_report_checkpoint"
  | "final_review_checkpoint"
  | "capability_gap_checkpoint"
  | "candidate_promotion_checkpoint"

export type PiSseEventType =
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

export interface PiSseEventDraft<TPayload = unknown> {
  threadId: string
  type: PiSseEventType
  payload: TPayload
}

export interface PiSseEvent<TPayload = unknown> extends PiSseEventDraft<TPayload> {
  seq: number
  revision: number
  createdAt: string
}

export interface ThreadRecord {
  id: string
  title: string | null
  status: ThreadStatus
  piSessionId: string | null
  piSessionFile: string | null
  checkpoint: CheckpointRecord | null
  revision: number
  lastEventSeq: number
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

export interface ResearchClaim {
  claim: string
  sourceUrls: string[]
  confidence: "high" | "medium" | "low"
}

export interface ResearchBrief {
  topic: string
  objective: string
  summary: string
  keyConcepts: string[]
  claims: ResearchClaim[]
  examples: string[]
  unknowns: string[]
  sourceUrls: string[]
}

export interface AudioSpeaker {
  name: string
  voiceId: string
}

export interface AudioVoiceoverPlan {
  enabled: true
  provider: "gemini"
  language: string
  voiceId?: string
  speakers?: AudioSpeaker[]
  scenes: Record<string, string>
}

export interface AudioMusicBedPlan {
  libraryId: string
  volume: number
  duckingVolume: number
  fadeInMs: number
  fadeOutMs: number
  duckingFadeMs: number
}

export interface AudioSoundDesignPlan {
  enabled: boolean
  musicBed: AudioMusicBedPlan | null
  sfx: Array<Record<string, unknown>>
}

export interface AudioChart {
  voiceover: AudioVoiceoverPlan | null
  soundDesign: AudioSoundDesignPlan
  warnings: string[]
}

export interface ProducedAudioAsset {
  kind: "voiceover" | "music"
  sceneIndex?: string
  path: string
  sizeBytes: number
}

export interface AudioAssetsManifest {
  configId: string
  voiceStatus: "completed" | "skipped"
  soundStatus: "completed" | "skipped"
  assets: ProducedAudioAsset[]
  generatedAt: string
}

export type SceneQaVerdict = "PASS" | "MINOR_FIX" | "MAJOR_ISSUE"

export interface SceneQaIssue {
  category:
    | "legibility"
    | "clipping"
    | "hierarchy"
    | "coherence"
    | "continuity"
    | "accessibility"
    | "accuracy"
    | "other"
  severity: "minor" | "major"
  observation: string
  evidence: string
  suggestedChange?: string
}

export interface SceneQaResult {
  index: number
  verdict: SceneQaVerdict
  score: number
  observations: string[]
  issues: SceneQaIssue[]
}

export interface SceneQaReport {
  summary: string
  scenes: SceneQaResult[]
}

export interface RenderReviewReport {
  jobId: string
  configId: string
  reviewedAt: string
  passed: boolean
  fileSizeBytes: number
  duration: {
    actualSeconds: number
    expectedSeconds: number
    deltaSeconds: number
    toleranceSeconds: number
    matches: boolean
  }
  video: {
    present: boolean
    codec: string | null
    width: number | null
    height: number | null
    fps: number | null
    dimensionsMatch: boolean
    fpsMatches: boolean
  }
  audio: { expected: boolean; present: boolean; codec: string | null; matchesExpectation: boolean }
  failures: string[]
  warnings: string[]
}

export interface SceneCapabilityGap {
  capability: string
  whyDslInsufficient: string
  reuseAnalysis: string
  proposedGenericContract: Record<string, unknown>
  securitySurface: string[]
  affectedFiles: string[]
  acceptanceTests: string[]
}

export type SceneCompositionResolution =
  | { sceneId: string; outcome: "composed"; rationale: string; spec: Record<string, unknown> }
  | { sceneId: string; outcome: "reuse"; rationale: string; componentId: string; propsPlan: Record<string, unknown> }
  | { sceneId: string; outcome: "capability_gap"; rationale: string; gap: SceneCapabilityGap }

export interface SceneCompositionResult {
  summary: string
  resolutions: SceneCompositionResolution[]
}

export interface CreativeBrief {
  subject: string
  goal: string
  audience?: string
  platform?: string
  format?: string
  tone?: string
  language?: string
  targetDurationSeconds?: number
  brand?: string
  evidence?: string[]
  constraints?: string[]
  /** Exactly one parent-resolved target summary; never the complete registry. */
  selectedTarget?: Record<string, unknown>
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
  visualRole?: string
  propsPlan?: Record<string, unknown>
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

export type ModelTask =
  | "main"
  | "intake"
  | "research"
  | "narrative"
  | "direction"
  | "audio_plan"
  | "scene_qa"
  | "scene_creation"
  | "config"
  | "validation"
  | "tts"
  | "sfx"

export interface ModelRoutingConfig {
  routes: Partial<Record<ModelTask, ModelRoute>>
}

export type {
  AudioPreferences,
  EvidenceRequirements,
  ExplicitlyAbsentBriefInput,
  OptionalProductionBriefInput,
  ProductionBrief,
  ProductionBriefArtifact,
  ProductionBriefCandidate,
  ProductionBriefFieldName,
  ProductionBriefInput,
  ProductionBriefInputSource,
  ProductionBriefInputStatus,
  ProductionBriefQuestion,
  ProductionBriefValidation,
  ProductionDimensions,
  ProvidedBriefInput,
  ResearchDecision,
  RequiredProductionBriefInput,
  TargetRequirement,
  UnresolvedBriefInput,
} from "./productionBrief.js"
