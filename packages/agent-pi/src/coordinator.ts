import type {
  ArtifactKind,
  ArtifactRecord,
  AudioChart,
  CheckpointKind,
  CheckpointRecord,
  DirectionDraft,
  DirectionRevisionRequest,
  PipelineMode,
  PipelinePlan,
  PipelineStepStatus,
  QaReportLineage,
  RenderJobStatus,
  SceneCompositionResult,
  SceneQaReport,
  ScriptDraft,
} from "./types.js"
import { contentHash } from "./contentHash.js"
import { validateProductionBriefArtifact, type ProductionBriefArtifact } from "./productionBrief.js"
import { isSelectedTargetArtifactForBrief, type SelectedTargetArtifact } from "./targetContracts.js"
import type { ActiveVisualRecipeSet } from "./visualRecipes.js"

export type CoordinatorAction =
  | "create_plan"
  | "run_intake"
  | "resolve_target"
  | "research_or_skip"
  | "run_copywriter"
  | "run_scene_composer"
  | "propose_visual_recipe"
  | "generate_scene_candidate"
  | "promote_scene_candidate"
  | "present_script"
  | "run_direction"
  | "revise_direction"
  | "present_direction"
  | "generate_draft_config"
  | "run_scene_qa"
  | "present_scene_qa"
  | "run_audio_planner"
  | "present_audio_chart"
  | "generate_final_config"
  | "produce_audio_assets"
  | "validate_final"
  | "render"
  | "review_render"
  | "present_final_review"
  | "publish"
  | "wait_for_human"
  | "complete"
  | "unsupported_mode"
  | "invalid_plan"

export type CoordinatorDecisionKind = "action" | "wait_for_human" | "complete" | "unsupported_mode" | "invalid_plan"

export interface CanonicalStepDefinition {
  readonly id: string
  readonly owner: string
  readonly title: string
}

export type ArtifactApprovalRequirement = boolean | "any"

export interface AcceptedArtifactDefinition {
  readonly kind: ArtifactKind
  readonly approval: ArtifactApprovalRequirement
  readonly required?: boolean
}

export type DirectPrerequisite =
  | { readonly type: "checkpoint_clear" }
  | { readonly type: "step_status"; readonly stepId: string; readonly statuses: readonly PipelineStepStatus[] }
  | { readonly type: "artifact"; readonly artifact: AcceptedArtifactDefinition }
  | { readonly type: "action_completed"; readonly action: "run_intake" | "resolve_target" }

export type NextStateEffect =
  | { readonly type: "start_step"; readonly stepId: string }
  | { readonly type: "complete_step"; readonly stepId: string }
  | { readonly type: "skip_step"; readonly stepId: string }
  | { readonly type: "set_checkpoint"; readonly checkpoint: CheckpointKind }
  | { readonly type: "wait_for_human" }
  | { readonly type: "advance_to"; readonly stepId: string }
  | { readonly type: "mark_failed"; readonly stepId: string }

export interface CanonicalTransitionDefinition {
  readonly action: CoordinatorAction
  readonly stepId: string | null
  readonly checkpoint?: CheckpointKind
  readonly prerequisites: readonly DirectPrerequisite[]
  readonly nextStateEffects: readonly NextStateEffect[]
  readonly unsupportedReason?: string
  /** Reserved parent boundaries are declared before their contracts are implemented. */
  readonly reserved?: boolean
}

export function applyCoordinatorEffects(
  plan: PipelinePlan,
  effects: readonly NextStateEffect[],
  now = new Date().toISOString(),
): PipelinePlan {
  const next = structuredClone(plan)
  for (const effect of effects) {
    if (!("stepId" in effect)) continue
    const step = next.steps.find((candidate) => candidate.id === effect.stepId)
    if (!step) throw new Error(`Coordinator effect references unknown step '${effect.stepId}'`)
    if (effect.type === "start_step" || effect.type === "advance_to") {
      step.status = "in_progress"
      step.startedAt ??= now
    } else if (effect.type === "complete_step") {
      step.status = "completed"
      step.completedAt ??= now
    } else if (effect.type === "skip_step") {
      step.status = "skipped"
      step.completedAt ??= now
    } else if (effect.type === "mark_failed") {
      step.status = "failed"
      step.completedAt ??= now
    }
  }
  const completed = next.steps.filter((step) => step.status === "completed" || step.status === "skipped").length
  const current =
    next.steps.find((step) => step.status === "in_progress") ?? next.steps.find((step) => step.status === "pending")
  next.status = next.steps.every((step) => step.status === "completed" || step.status === "skipped")
    ? "completed"
    : next.steps.some((step) => step.status === "failed")
      ? "failed"
      : next.steps.some((step) => step.status === "blocked")
        ? "blocked"
        : "active"
  next.currentStepId = current?.id ?? null
  next.progress = { completed, total: next.steps.length }
  next.updatedAt = now
  return next
}

export function validateParentEffectOverride(
  action: CoordinatorAction,
  effects: readonly NextStateEffect[],
): readonly NextStateEffect[] {
  const allowed =
    (action === "research_or_skip" &&
      effects.length === 1 &&
      (effects[0]?.type === "skip_step" || effects[0]?.type === "complete_step") &&
      effects[0].stepId === "research") ||
    (action === "run_scene_composer" &&
      effects.length === 1 &&
      effects[0]?.type === "complete_step" &&
      effects[0].stepId === "scene_creation") ||
    (action === "run_audio_planner" &&
      effects.length === 1 &&
      effects[0]?.type === "complete_step" &&
      effects[0].stepId === "audio_plan") ||
    (action === "validate_final" &&
      effects.length === 1 &&
      effects[0]?.type === "complete_step" &&
      effects[0].stepId === "final_validation") ||
    (action === "render" &&
      effects.length === 1 &&
      effects[0]?.type === "complete_step" &&
      effects[0].stepId === "render") ||
    ((action === "generate_draft_config" || action === "generate_final_config") &&
      effects.length === 1 &&
      effects[0]?.type === "complete_step" &&
      effects[0].stepId === "config_generation") ||
    (action === "run_scene_qa" &&
      effects.length === 1 &&
      effects[0]?.type === "complete_step" &&
      effects[0].stepId === "scene_qa") ||
    (action === "run_copywriter" &&
      effects.length === 2 &&
      effects[0]?.type === "start_step" &&
      effects[0].stepId === "copywriting" &&
      effects[1]?.type === "skip_step" &&
      effects[1].stepId === "scene_creation") ||
    (action === "produce_audio_assets" &&
      effects.length === 2 &&
      effects[0]?.type === "complete_step" &&
      effects[0].stepId === "voice_generation" &&
      effects[1]?.type === "complete_step" &&
      effects[1].stepId === "sound_assets")
  if (!allowed) throw new Error(`Action '${action}' cannot override canonical plan effects`)
  return freeze(structuredClone(effects))
}

export interface DirectActionSuccessOutcome {
  readonly status: "success"
  readonly nextStateEffects: readonly NextStateEffect[]
}

export interface DirectActionFailureOutcome {
  readonly status: "failure"
  readonly code:
    | "invalid_idempotency_key"
    | "not_next_action"
    | "missing_prerequisite"
    | "stale_artifact"
    | "unapproved_artifact"
    | "unsupported_mode"
    | "invalid_plan"
  readonly message: string
}

export interface DirectActionHandler {
  readonly action: CoordinatorAction
  readonly stepId: string | null
  readonly prerequisites: readonly DirectPrerequisite[]
  readonly acceptedArtifacts: readonly AcceptedArtifactDefinition[]
  readonly idempotencyKey: (snapshot: CoordinatorSnapshot) => string
  readonly success: DirectActionSuccessOutcome
  readonly failure: DirectActionFailureOutcome
}

export interface CoordinatorSnapshot {
  readonly plan: PipelinePlan | null
  readonly checkpoint: CheckpointRecord | null
  readonly artifacts: readonly ArtifactRecord[]
  /** Persisted by a future executor; optional so current SQLite snapshots remain compatible. */
  readonly executedActionKeys?: readonly string[]
}

export interface DirectActionRequest {
  readonly action: CoordinatorAction
  readonly idempotencyKey: string
  readonly artifactIdsByKind?: Readonly<Partial<Record<ArtifactKind, string>>>
}

export interface DirectActionEvaluation {
  readonly action: CoordinatorAction
  readonly idempotencyKey: string
  readonly status: "ready" | "idempotent" | "rejected"
  readonly handler: DirectActionHandler | null
  readonly success?: DirectActionSuccessOutcome
  readonly failure?: DirectActionFailureOutcome
}

const freeze = <T>(value: T): T => {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value
  for (const child of Object.values(value as Record<string, unknown>)) freeze(child)
  return Object.freeze(value)
}

export const PIPELINE_MODES = freeze([
  "new_video",
  "revise_existing",
  "render_only",
  "recover_failed_render",
  "audit_only",
  "variant",
  "asset_regeneration",
  "question",
] as const)

/** Only this mode has executable transitions in the current pure foundation. */
export const IMPLEMENTED_PIPELINE_MODES = freeze(["new_video"] as const)

export function isImplementedPipelineMode(mode: PipelineMode): boolean {
  return (IMPLEMENTED_PIPELINE_MODES as readonly string[]).includes(mode)
}

export const CANONICAL_MODE_STEPS = freeze({
  new_video: [
    { id: "research", owner: "researcher", title: "Research topic and audience when required" },
    { id: "copywriting", owner: "copywriter", title: "Create the visual script" },
    { id: "scene_creation", owner: "scene_creator", title: "Resolve missing visual capabilities" },
    { id: "direction", owner: "director", title: "Create technical direction" },
    { id: "config_generation", owner: "configurator", title: "Compile approved artifacts into config" },
    { id: "scene_qa", owner: "scene_qa", title: "Review rendered scene stills" },
    { id: "audio_plan", owner: "audio_planner", title: "Plan voiceover and sound" },
    { id: "voice_generation", owner: "voice_generator", title: "Generate approved voiceover" },
    { id: "sound_assets", owner: "sound_engineer", title: "Prepare approved music and SFX" },
    { id: "final_validation", owner: "validator", title: "Validate final config and assets" },
    { id: "render", owner: "renderer", title: "Render video" },
    { id: "review", owner: "reviewer", title: "Review rendered output" },
    { id: "publication", owner: "publisher", title: "Publish approved artifacts" },
  ],
  revise_existing: [
    { id: "target_staging", owner: "orchestrator", title: "Stage target config" },
    { id: "revision_plan", owner: "orchestrator", title: "Approve revision plan" },
    { id: "revision", owner: "director", title: "Apply approved revision" },
    { id: "validation", owner: "validator", title: "Validate revised config" },
    { id: "save", owner: "orchestrator", title: "Persist source config" },
    { id: "render", owner: "orchestrator", title: "Render when requested" },
  ],
  render_only: [
    { id: "target_loading", owner: "orchestrator", title: "Load target config" },
    { id: "validation", owner: "orchestrator", title: "Validate config" },
    { id: "render", owner: "orchestrator", title: "Render video" },
  ],
  recover_failed_render: [
    { id: "target_staging", owner: "orchestrator", title: "Stage failed config" },
    { id: "recovery_plan", owner: "orchestrator", title: "Approve technical recovery" },
    { id: "repair", owner: "validator", title: "Repair blocking issues" },
    { id: "validation", owner: "orchestrator", title: "Validate repaired config" },
    { id: "render", owner: "orchestrator", title: "Render repaired config" },
  ],
  audit_only: [
    { id: "target_loading", owner: "orchestrator", title: "Load target config" },
    { id: "audit", owner: "validator", title: "Audit config" },
    { id: "report", owner: "orchestrator", title: "Report recommendations" },
  ],
  variant: [
    { id: "source_staging", owner: "orchestrator", title: "Stage source config" },
    { id: "variant_plan", owner: "orchestrator", title: "Approve variant plan" },
    { id: "variant_creation", owner: "copywriter", title: "Create derived config" },
    { id: "validation", owner: "validator", title: "Validate variant" },
    { id: "render", owner: "orchestrator", title: "Render when requested" },
  ],
  asset_regeneration: [
    { id: "target_staging", owner: "orchestrator", title: "Stage target config" },
    { id: "asset_plan", owner: "audio_planner", title: "Plan requested asset regeneration" },
    { id: "asset_generation", owner: "voice_generator", title: "Regenerate requested assets" },
    { id: "validation", owner: "validator", title: "Validate regenerated assets" },
  ],
  question: [{ id: "answer", owner: "orchestrator", title: "Answer or guide user" }],
} as const)

const stepPrerequisite = (
  stepId: string,
  statuses: readonly PipelineStepStatus[] = ["pending"],
): DirectPrerequisite => ({
  type: "step_status",
  stepId,
  statuses,
})
const artifactPrerequisite = (
  kind: ArtifactKind,
  approval: ArtifactApprovalRequirement,
  required = true,
): DirectPrerequisite => ({
  type: "artifact",
  artifact: { kind, approval, required },
})
const checkpointClear: DirectPrerequisite = { type: "checkpoint_clear" }

const INTAKE_TARGET_TRANSITIONS = [
  {
    action: "run_intake",
    stepId: null,
    prerequisites: [checkpointClear],
    nextStateEffects: [],
  },
  {
    action: "resolve_target",
    stepId: null,
    prerequisites: [checkpointClear, artifactPrerequisite("production_brief", "any")],
    nextStateEffects: [],
  },
] as const satisfies readonly CanonicalTransitionDefinition[]

const NEW_VIDEO_TRANSITIONS = [
  {
    action: "research_or_skip",
    stepId: "research",
    prerequisites: [
      checkpointClear,
      artifactPrerequisite("production_brief", "any"),
      artifactPrerequisite("selected_target", "any"),
      stepPrerequisite("research"),
    ],
    nextStateEffects: [{ type: "start_step", stepId: "research" }],
  },
  {
    action: "run_copywriter",
    stepId: "copywriting",
    prerequisites: [checkpointClear, stepPrerequisite("research", ["completed", "skipped"])],
    nextStateEffects: [{ type: "start_step", stepId: "copywriting" }],
  },
  {
    action: "run_scene_composer",
    stepId: "scene_creation",
    prerequisites: [checkpointClear, artifactPrerequisite("script", false)],
    nextStateEffects: [{ type: "start_step", stepId: "scene_creation" }],
  },
  {
    action: "propose_visual_recipe",
    stepId: "scene_creation",
    checkpoint: "visual_recipe_adoption_checkpoint",
    prerequisites: [
      checkpointClear,
      artifactPrerequisite("script", false),
      artifactPrerequisite("scene_composition", true),
    ],
    nextStateEffects: [
      { type: "set_checkpoint", checkpoint: "visual_recipe_adoption_checkpoint" },
      { type: "wait_for_human" },
    ],
  },
  {
    action: "generate_scene_candidate",
    stepId: "scene_creation",
    checkpoint: "candidate_promotion_checkpoint",
    prerequisites: [
      checkpointClear,
      artifactPrerequisite("script", false),
      artifactPrerequisite("scene_composition", true),
    ],
    nextStateEffects: [
      { type: "set_checkpoint", checkpoint: "candidate_promotion_checkpoint" },
      { type: "wait_for_human" },
    ],
  },
  {
    action: "promote_scene_candidate",
    stepId: "scene_creation",
    prerequisites: [
      checkpointClear,
      artifactPrerequisite("script", false),
      artifactPrerequisite("scene_composition", true),
      artifactPrerequisite("candidate_package", "any"),
      artifactPrerequisite("candidate_verification", "any"),
      artifactPrerequisite("candidate_promotion_plan", true),
    ],
    nextStateEffects: [{ type: "complete_step", stepId: "scene_creation" }],
  },
  {
    action: "present_script",
    stepId: "copywriting",
    checkpoint: "script_checkpoint",
    prerequisites: [checkpointClear, artifactPrerequisite("script", false)],
    nextStateEffects: [{ type: "set_checkpoint", checkpoint: "script_checkpoint" }, { type: "wait_for_human" }],
  },
  {
    action: "run_direction",
    stepId: "direction",
    prerequisites: [checkpointClear, artifactPrerequisite("script", true)],
    nextStateEffects: [{ type: "start_step", stepId: "direction" }],
  },
  {
    action: "revise_direction",
    stepId: "direction",
    prerequisites: [
      checkpointClear,
      artifactPrerequisite("script", true),
      artifactPrerequisite("direction", "any"),
      artifactPrerequisite("direction_revision_request", true),
    ],
    nextStateEffects: [{ type: "start_step", stepId: "direction" }],
  },
  {
    action: "present_direction",
    stepId: "direction",
    checkpoint: "direction_checkpoint",
    prerequisites: [checkpointClear, artifactPrerequisite("script", true), artifactPrerequisite("direction", false)],
    nextStateEffects: [{ type: "set_checkpoint", checkpoint: "direction_checkpoint" }, { type: "wait_for_human" }],
  },
  {
    action: "generate_draft_config",
    stepId: "config_generation",
    prerequisites: [checkpointClear, artifactPrerequisite("script", true), artifactPrerequisite("direction", true)],
    nextStateEffects: [{ type: "start_step", stepId: "config_generation" }],
  },
  {
    action: "run_scene_qa",
    stepId: "scene_qa",
    prerequisites: [
      checkpointClear,
      artifactPrerequisite("script", true),
      artifactPrerequisite("direction", true),
      artifactPrerequisite("config", "any"),
    ],
    nextStateEffects: [{ type: "start_step", stepId: "scene_qa" }],
  },
  {
    action: "present_scene_qa",
    stepId: "scene_qa",
    checkpoint: "qa_report_checkpoint",
    prerequisites: [checkpointClear, artifactPrerequisite("qa_report", false)],
    nextStateEffects: [{ type: "set_checkpoint", checkpoint: "qa_report_checkpoint" }, { type: "wait_for_human" }],
  },
  {
    action: "run_audio_planner",
    stepId: "audio_plan",
    prerequisites: [checkpointClear, artifactPrerequisite("script", true), artifactPrerequisite("direction", true)],
    nextStateEffects: [{ type: "start_step", stepId: "audio_plan" }],
  },
  {
    action: "present_audio_chart",
    stepId: "audio_plan",
    checkpoint: "audio_chart_checkpoint",
    prerequisites: [checkpointClear, artifactPrerequisite("audio_chart", false)],
    nextStateEffects: [{ type: "set_checkpoint", checkpoint: "audio_chart_checkpoint" }, { type: "wait_for_human" }],
  },
  {
    action: "generate_final_config",
    stepId: "config_generation",
    prerequisites: [
      checkpointClear,
      artifactPrerequisite("script", true),
      artifactPrerequisite("direction", true),
      artifactPrerequisite("audio_chart", true),
    ],
    nextStateEffects: [{ type: "start_step", stepId: "config_generation" }],
  },
  {
    action: "produce_audio_assets",
    stepId: "voice_generation",
    prerequisites: [
      checkpointClear,
      artifactPrerequisite("script", true),
      artifactPrerequisite("audio_chart", true),
      artifactPrerequisite("config", "any"),
    ],
    nextStateEffects: [
      { type: "start_step", stepId: "voice_generation" },
      { type: "start_step", stepId: "sound_assets" },
    ],
  },
  {
    action: "validate_final",
    stepId: "final_validation",
    prerequisites: [
      checkpointClear,
      artifactPrerequisite("config", "any"),
      artifactPrerequisite("audio_assets", "any"),
    ],
    nextStateEffects: [{ type: "start_step", stepId: "final_validation" }],
  },
  {
    action: "render",
    stepId: "render",
    prerequisites: [
      checkpointClear,
      stepPrerequisite("final_validation", ["completed"]),
      artifactPrerequisite("config", "any"),
    ],
    nextStateEffects: [{ type: "start_step", stepId: "render" }],
  },
  {
    action: "review_render",
    stepId: "review",
    prerequisites: [checkpointClear, artifactPrerequisite("render_job", true)],
    nextStateEffects: [{ type: "start_step", stepId: "review" }],
  },
  {
    action: "present_final_review",
    stepId: "review",
    checkpoint: "final_review_checkpoint",
    prerequisites: [checkpointClear, artifactPrerequisite("render_review", false)],
    nextStateEffects: [{ type: "set_checkpoint", checkpoint: "final_review_checkpoint" }, { type: "wait_for_human" }],
  },
  {
    action: "publish",
    stepId: "publication",
    prerequisites: [
      checkpointClear,
      artifactPrerequisite("script", true),
      artifactPrerequisite("direction", true),
      artifactPrerequisite("config", "any"),
      artifactPrerequisite("render_review", true),
    ],
    nextStateEffects: [
      { type: "start_step", stepId: "publication" },
      { type: "complete_step", stepId: "publication" },
    ],
  },
] as const satisfies readonly CanonicalTransitionDefinition[]

const UNSUPPORTED_REASON =
  "This mode has canonical steps but no direct executor yet; ProductionBrief and TargetContract are required before wiring side effects."

export const CANONICAL_TRANSITIONS = freeze({
  new_video: [...INTAKE_TARGET_TRANSITIONS, ...NEW_VIDEO_TRANSITIONS],
  revise_existing: [
    {
      action: "unsupported_mode",
      stepId: null,
      prerequisites: [],
      nextStateEffects: [],
      unsupportedReason: UNSUPPORTED_REASON,
    },
  ],
  render_only: [
    {
      action: "unsupported_mode",
      stepId: null,
      prerequisites: [],
      nextStateEffects: [],
      unsupportedReason: UNSUPPORTED_REASON,
    },
  ],
  recover_failed_render: [
    {
      action: "unsupported_mode",
      stepId: null,
      prerequisites: [],
      nextStateEffects: [],
      unsupportedReason: UNSUPPORTED_REASON,
    },
  ],
  audit_only: [
    {
      action: "unsupported_mode",
      stepId: null,
      prerequisites: [],
      nextStateEffects: [],
      unsupportedReason: UNSUPPORTED_REASON,
    },
  ],
  variant: [
    {
      action: "unsupported_mode",
      stepId: null,
      prerequisites: [],
      nextStateEffects: [],
      unsupportedReason: UNSUPPORTED_REASON,
    },
  ],
  asset_regeneration: [
    {
      action: "unsupported_mode",
      stepId: null,
      prerequisites: [],
      nextStateEffects: [],
      unsupportedReason: UNSUPPORTED_REASON,
    },
  ],
  question: [
    {
      action: "unsupported_mode",
      stepId: null,
      prerequisites: [],
      nextStateEffects: [],
      unsupportedReason: UNSUPPORTED_REASON,
    },
  ],
} as const satisfies Readonly<Record<PipelineMode, readonly CanonicalTransitionDefinition[]>>)

const transitionByAction = new Map<CoordinatorAction, CanonicalTransitionDefinition>(
  [...INTAKE_TARGET_TRANSITIONS, ...NEW_VIDEO_TRANSITIONS].map((transition) => [transition.action, transition]),
)

function requirementFor(action: CoordinatorAction): readonly AcceptedArtifactDefinition[] {
  return (
    transitionByAction
      .get(action)
      ?.prerequisites.filter(
        (prerequisite): prerequisite is { readonly type: "artifact"; readonly artifact: AcceptedArtifactDefinition } =>
          prerequisite.type === "artifact",
      )
      .map((prerequisite) => prerequisite.artifact) ?? []
  )
}

const handlerFor = (action: CoordinatorAction): DirectActionHandler => {
  const transition = transitionByAction.get(action)
  if (!transition) {
    return {
      action,
      stepId: null,
      prerequisites: [],
      acceptedArtifacts: [],
      idempotencyKey: () => `unsupported:${action}`,
      success: { status: "success", nextStateEffects: [] },
      failure: { status: "failure", code: "unsupported_mode", message: `No direct handler exists for '${action}'.` },
    }
  }
  return {
    action,
    stepId: transition.stepId,
    prerequisites: transition.prerequisites,
    acceptedArtifacts: requirementFor(action),
    idempotencyKey: (snapshot) => actionIdempotencyKey(snapshot, action),
    success: { status: "success", nextStateEffects: transition.nextStateEffects },
    failure: {
      status: "failure",
      code: "not_next_action",
      message: `Action '${action}' is not the canonical next action.`,
    },
  }
}

const CREATE_PLAN_HANDLER: DirectActionHandler = {
  action: "create_plan",
  stepId: null,
  prerequisites: [],
  acceptedArtifacts: [],
  idempotencyKey: (snapshot) => actionIdempotencyKey(snapshot, "create_plan"),
  success: { status: "success", nextStateEffects: [{ type: "advance_to", stepId: "research" }] },
  failure: { status: "failure", code: "invalid_plan", message: "A pipeline plan already exists." },
}

const DIRECT_ACTION_HANDLER_ENTRIES: Array<[CoordinatorAction, DirectActionHandler]> = [
  ...[...INTAKE_TARGET_TRANSITIONS, ...NEW_VIDEO_TRANSITIONS].map(
    (transition) => [transition.action, handlerFor(transition.action)] as [CoordinatorAction, DirectActionHandler],
  ),
  ["create_plan", CREATE_PLAN_HANDLER],
]

export const DIRECT_ACTION_HANDLERS = freeze(
  Object.fromEntries(DIRECT_ACTION_HANDLER_ENTRIES) as Partial<Record<CoordinatorAction, DirectActionHandler>>,
)

export function isPipelineMode(mode: unknown): mode is PipelineMode {
  return typeof mode === "string" && (PIPELINE_MODES as readonly string[]).includes(mode)
}

function latest<T>(artifacts: readonly ArtifactRecord[], kind: ArtifactKind): ArtifactRecord<T> | undefined {
  return artifacts
    .filter((artifact) => artifact.kind === kind)
    .sort((left, right) => left.version - right.version)
    .at(-1) as ArtifactRecord<T> | undefined
}

interface ConfigLineageArtifactData {
  configArtifactId: string
  configVersion: number
  configHash: string
  lineage: {
    script: { artifactId: string; version: number; contentHash: string }
    direction: { artifactId: string; version: number; contentHash: string }
  }
  activeVisualRecipeSet?: {
    artifactId: string
    version: number
    contentHash: string
    targetId: string
    digest: string
  } | null
}

function currentConfig(artifacts: readonly ArtifactRecord[]): ArtifactRecord<Record<string, unknown>> | undefined {
  const config = latest<Record<string, unknown>>(artifacts, "config")
  const lineage = latest<ConfigLineageArtifactData>(artifacts, "config_lineage")
  const script = latest<ScriptDraft>(artifacts, "script")
  const direction = latest<DirectionDraft>(artifacts, "direction")
  const activeSet = latest<ActiveVisualRecipeSet>(artifacts, "active_visual_recipe_set")
  const activeLineage = lineage?.data.activeVisualRecipeSet ?? null
  if (
    !config ||
    !lineage ||
    !script?.approved ||
    !direction?.approved ||
    lineage.data.configArtifactId !== config.id ||
    lineage.data.configVersion !== config.version ||
    lineage.data.configHash !== contentHash(config.data) ||
    lineage.data.lineage.script.artifactId !== script.id ||
    lineage.data.lineage.script.version !== script.version ||
    lineage.data.lineage.script.contentHash !== contentHash(script.data) ||
    lineage.data.lineage.direction.artifactId !== direction.id ||
    lineage.data.lineage.direction.version !== direction.version ||
    lineage.data.lineage.direction.contentHash !== contentHash(direction.data) ||
    (activeSet
      ? !activeSet.approved ||
        activeLineage?.artifactId !== activeSet.id ||
        activeLineage.version !== activeSet.version ||
        activeLineage.contentHash !== contentHash(activeSet.data) ||
        activeLineage.targetId !== activeSet.data.targetId ||
        activeLineage.digest !== activeSet.data.digest ||
        config.data.activeVisualRecipeSetDigest !== activeSet.data.digest
      : activeLineage !== null || config.data.activeVisualRecipeSetDigest != null)
  ) {
    return undefined
  }
  return config
}

function currentQaReport(artifacts: readonly ArtifactRecord[]): ArtifactRecord<SceneQaReport> | undefined {
  const config = currentConfig(artifacts)
  const qa = latest<SceneQaReport>(artifacts, "qa_report")
  const lineage = latest<QaReportLineage>(artifacts, "qa_lineage")
  if (
    !config ||
    !qa ||
    !lineage ||
    lineage.data.qaReport.artifactId !== qa.id ||
    lineage.data.qaReport.version !== qa.version ||
    lineage.data.qaReport.contentHash !== contentHash(qa.data) ||
    lineage.data.config.artifactId !== config.id ||
    lineage.data.config.version !== config.version ||
    lineage.data.config.contentHash !== contentHash(config.data) ||
    contentHash(lineage.data.activeVisualRecipeSet ?? null) !==
      contentHash(latest<ConfigLineageArtifactData>(artifacts, "config_lineage")?.data.activeVisualRecipeSet ?? null)
  ) {
    return undefined
  }
  return qa
}

function pendingDirectionRevision(artifacts: readonly ArtifactRecord[]): DirectionRevisionRequest | undefined {
  const request = latest<DirectionRevisionRequest>(artifacts, "direction_revision_request")
  const direction = latest<DirectionDraft>(artifacts, "direction")
  const data = request?.data
  if (
    !request?.approved ||
    !direction ||
    !data ||
    data.schemaVersion !== 1 ||
    typeof data.feedback !== "string" ||
    !data.feedback.trim() ||
    !data.baseDirection ||
    data.baseDirection.artifactId !== direction.id ||
    data.baseDirection.version !== direction.version ||
    data.baseDirection.contentHash !== contentHash(direction.data)
  ) {
    return undefined
  }
  return data
}

function stepCompleted(plan: PipelinePlan, stepId: string): boolean {
  const status = plan.steps.find((step) => step.id === stepId)?.status
  return status === "completed" || status === "skipped"
}

function normalizedSoundDesign(value: unknown): unknown {
  if (value === null || value === undefined) return null
  if (typeof value !== "object" || Array.isArray(value)) return value
  const sound = value as Record<string, unknown>
  return sound.enabled === false && sound.musicBed === null && Array.isArray(sound.sfx) && sound.sfx.length === 0
    ? null
    : value
}

function configContainsApprovedAudio(config: Record<string, unknown>, chart: AudioChart): boolean {
  return (
    contentHash(config.voiceover ?? null) === contentHash(chart.voiceover) &&
    contentHash(normalizedSoundDesign(config.soundDesign)) === contentHash(normalizedSoundDesign(chart.soundDesign))
  )
}

function hasUnresolvedCapabilities(script: ScriptDraft): boolean {
  return script.scenes.some((scene) => (scene.missingCapabilities?.length ?? 0) > 0)
}

function validPlan(plan: PipelinePlan): boolean {
  if (!isPipelineMode(plan.mode)) return false
  const expected = CANONICAL_MODE_STEPS[plan.mode]
  return (
    plan.steps.length === expected.length &&
    expected.every((step, index) => {
      const actual = plan.steps[index]
      return actual?.id === step.id && actual.owner === step.owner && actual.title === step.title
    })
  )
}

export function transitionForAction(
  action: CoordinatorAction,
  mode: PipelineMode = "new_video",
): CanonicalTransitionDefinition | undefined {
  return CANONICAL_TRANSITIONS[mode].find((transition) => transition.action === action)
}

export interface CoordinatorDecision {
  readonly kind: CoordinatorDecisionKind
  readonly mode: string | null
  readonly action?: CoordinatorAction
  readonly stepId?: string | null
  readonly transition?: CanonicalTransitionDefinition
  readonly reason?: string
}

export function deriveCoordinatorDecision(snapshot: CoordinatorSnapshot): CoordinatorDecision {
  if (!snapshot.plan)
    return { kind: "action", mode: null, action: "create_plan", stepId: null, reason: "No persisted plan exists." }
  if (!isPipelineMode(snapshot.plan.mode)) {
    return {
      kind: "unsupported_mode",
      mode: snapshot.plan.mode,
      action: "unsupported_mode",
      reason: UNSUPPORTED_REASON,
    }
  }
  if (!validPlan(snapshot.plan)) {
    return {
      kind: "invalid_plan",
      mode: snapshot.plan.mode,
      action: "invalid_plan",
      reason: "Persisted steps do not exactly match the immutable canonical mode definition.",
    }
  }
  if (snapshot.checkpoint)
    return {
      kind: "wait_for_human",
      mode: snapshot.plan.mode,
      action: "wait_for_human",
      reason: "A parent-owned checkpoint is pending.",
    }
  if (snapshot.plan.mode !== "new_video") {
    const transition = CANONICAL_TRANSITIONS[snapshot.plan.mode][0]
    return {
      kind: "unsupported_mode",
      mode: snapshot.plan.mode,
      action: "unsupported_mode",
      stepId: transition.stepId,
      transition,
      reason: transition.unsupportedReason,
    }
  }

  const plan = snapshot.plan
  const artifacts = snapshot.artifacts
  let action: CoordinatorAction
  const brief = latest<ProductionBriefArtifact>(artifacts, "production_brief")
  const briefValidation = brief ? validateProductionBriefArtifact(brief.data) : undefined
  const selectedTarget = latest<SelectedTargetArtifact>(artifacts, "selected_target")
  const hasCurrentTarget = Boolean(
    brief && selectedTarget && isSelectedTargetArtifactForBrief(selectedTarget.data, brief),
  )
  if (!brief || !briefValidation?.valid || !briefValidation.ready) action = "run_intake"
  else if (!hasCurrentTarget) action = "resolve_target"
  else if (!stepCompleted(plan, "research")) action = "research_or_skip"
  else {
    const script = latest<ScriptDraft>(artifacts, "script")
    if (!script) action = "run_copywriter"
    else if (!script.approved) {
      if (!hasUnresolvedCapabilities(script.data)) action = "present_script"
      else {
        const composition = latest<SceneCompositionResult>(artifacts, "scene_composition")
        if (!composition?.approved) action = "run_scene_composer"
        else action = "propose_visual_recipe"
      }
    } else {
      const direction = latest(artifacts, "direction")
      if (!direction) action = "run_direction"
      else if (pendingDirectionRevision(artifacts)) action = "revise_direction"
      else if (!direction.approved) action = "present_direction"
      else {
        const config = currentConfig(artifacts)
        if (!config) action = "generate_draft_config"
        else {
          const qa = currentQaReport(artifacts)
          if (!qa) action = "run_scene_qa"
          else if (qa.data.scenes.some((scene) => scene.verdict !== "PASS") && !qa.approved) action = "present_scene_qa"
          else {
            const audio = latest<AudioChart>(artifacts, "audio_chart")
            if (!audio) action = "run_audio_planner"
            else if (!audio.approved) action = "present_audio_chart"
            else if (!configContainsApprovedAudio(config.data, audio.data)) action = "generate_final_config"
            else if (!latest(artifacts, "audio_assets")) action = "produce_audio_assets"
            else if (!stepCompleted(plan, "final_validation")) action = "validate_final"
            else {
              const completedRender = artifacts
                .filter((artifact) => artifact.kind === "render_job" && artifact.approved)
                .map((artifact) => artifact as ArtifactRecord<RenderJobStatus>)
                .reverse()
                .find((artifact) => artifact.data.status === "done")
              if (!completedRender) action = "render"
              else {
                const review = latest(artifacts, "render_review")
                if (!review) action = "review_render"
                else if (!review.approved) action = "present_final_review"
                else if (!stepCompleted(plan, "publication")) action = "publish"
                else
                  return {
                    kind: "complete",
                    mode: plan.mode,
                    action: "complete",
                    stepId: "publication",
                    reason: "All canonical steps are complete.",
                  }
              }
            }
          }
        }
      }
    }
  }

  const transition = transitionForAction(action)
  return { kind: "action", mode: plan.mode, action, stepId: transition?.stepId, transition }
}

export function deriveCoordinatorAction(snapshot: CoordinatorSnapshot): CoordinatorAction {
  return deriveCoordinatorDecision(snapshot).action ?? "invalid_plan"
}

function latestMatchingArtifact(
  snapshot: CoordinatorSnapshot,
  requirement: AcceptedArtifactDefinition,
): ArtifactRecord | undefined {
  const artifact = latest(snapshot.artifacts, requirement.kind)
  if (!artifact) return undefined
  if (requirement.approval !== "any" && artifact.approved !== requirement.approval) return artifact
  return artifact
}

function actionAlreadyApplied(snapshot: CoordinatorSnapshot, action: CoordinatorAction): boolean {
  const handler = DIRECT_ACTION_HANDLERS[action]
  if (!handler || !snapshot.plan) return action === "create_plan" && snapshot.plan !== null
  if (snapshot.executedActionKeys?.includes(handler.idempotencyKey(snapshot))) return true
  if (action === "create_plan") return true
  const artifacts = snapshot.artifacts
  return (
    (action === "run_intake" &&
      (() => {
        const brief = latest<ProductionBriefArtifact>(artifacts, "production_brief")
        return Boolean(brief && validateProductionBriefArtifact(brief.data).ready)
      })()) ||
    (action === "resolve_target" && Boolean(latest(artifacts, "selected_target"))) ||
    (action === "run_copywriter" && Boolean(latest(artifacts, "script"))) ||
    (action === "run_scene_composer" && Boolean(latest(artifacts, "scene_composition"))) ||
    (action === "run_direction" && Boolean(latest(artifacts, "direction"))) ||
    (action === "generate_draft_config" && Boolean(currentConfig(artifacts))) ||
    (action === "run_scene_qa" && Boolean(currentQaReport(artifacts))) ||
    (action === "run_audio_planner" && Boolean(latest(artifacts, "audio_chart"))) ||
    (action === "generate_final_config" &&
      (() => {
        const config = currentConfig(artifacts)
        const chart = latest<AudioChart>(artifacts, "audio_chart")
        return Boolean(config && chart?.approved && configContainsApprovedAudio(config.data, chart.data))
      })()) ||
    (action === "produce_audio_assets" && Boolean(latest(artifacts, "audio_assets"))) ||
    (action === "validate_final" && stepCompleted(snapshot.plan, "final_validation")) ||
    (action === "render" && artifacts.some((artifact) => artifact.kind === "render_job")) ||
    (action === "review_render" && Boolean(latest(artifacts, "render_review"))) ||
    (action === "publish" && stepCompleted(snapshot.plan, "publication"))
  )
}

export function actionIdempotencyKey(snapshot: CoordinatorSnapshot, action: CoordinatorAction): string {
  const transition = transitionForAction(action)
  const versions = (transition?.prerequisites ?? [])
    .filter(
      (prerequisite): prerequisite is { readonly type: "artifact"; readonly artifact: AcceptedArtifactDefinition } =>
        prerequisite.type === "artifact",
    )
    .map(
      (prerequisite) =>
        `${prerequisite.artifact.kind}:${latest(snapshot.artifacts, prerequisite.artifact.kind)?.version ?? 0}`,
    )
    .join(",")
  const checkpointDecisionEpoch =
    action.startsWith("present_") || action === "propose_visual_recipe"
      ? `:decisions:${snapshot.plan?.decisions.length ?? 0}`
      : ""
  return `${snapshot.plan?.id ?? "no-plan"}:${snapshot.plan?.mode ?? "none"}:${action}:${versions}${checkpointDecisionEpoch}`
}

export function evaluateDirectAction(
  snapshot: CoordinatorSnapshot,
  request: DirectActionRequest,
): DirectActionEvaluation {
  const decision = deriveCoordinatorDecision(snapshot)
  const handler = DIRECT_ACTION_HANDLERS[request.action]
  const key = handler?.idempotencyKey(snapshot) ?? `unknown:${request.action}`
  if (decision.kind === "unsupported_mode")
    return {
      action: request.action,
      idempotencyKey: key,
      status: "rejected",
      handler: handler ?? null,
      failure: { status: "failure", code: "unsupported_mode", message: decision.reason ?? UNSUPPORTED_REASON },
    }
  if (decision.kind === "invalid_plan")
    return {
      action: request.action,
      idempotencyKey: key,
      status: "rejected",
      handler: handler ?? null,
      failure: { status: "failure", code: "invalid_plan", message: decision.reason ?? "Invalid canonical plan." },
    }
  if (!handler) {
    const transition = transitionForAction(request.action)
    return {
      action: request.action,
      idempotencyKey: key,
      status: "rejected",
      handler: null,
      failure: {
        status: "failure",
        code: transition?.reserved ? "unsupported_mode" : "invalid_plan",
        message: transition?.unsupportedReason ?? `Unknown direct action '${request.action}'.`,
      },
    }
  }
  if (request.idempotencyKey !== key) {
    return {
      action: request.action,
      idempotencyKey: key,
      status: "rejected",
      handler,
      failure: {
        status: "failure",
        code: "invalid_idempotency_key",
        message: "The action idempotency key does not match the current snapshot.",
      },
    }
  }
  if (actionAlreadyApplied(snapshot, request.action))
    return { action: request.action, idempotencyKey: key, status: "idempotent", handler, success: handler.success }
  if (decision.action !== request.action) {
    const requirements = handler.acceptedArtifacts
    for (const requirement of requirements) {
      if (!requirement.required) continue
      const artifact = latestMatchingArtifact(snapshot, requirement)
      if (!artifact) continue
      if (requirement.approval !== "any" && artifact.approved !== requirement.approval) {
        return {
          action: request.action,
          idempotencyKey: key,
          status: "rejected",
          handler,
          failure: {
            status: "failure",
            code: artifact.approved ? "stale_artifact" : "unapproved_artifact",
            message: `Latest '${requirement.kind}' artifact has approval=${artifact.approved}; expected approval=${requirement.approval}.`,
          },
        }
      }
    }
    return { action: request.action, idempotencyKey: key, status: "rejected", handler, failure: handler.failure }
  }

  for (const [kind, artifactId] of Object.entries(request.artifactIdsByKind ?? {})) {
    const artifact = latest(snapshot.artifacts, kind as ArtifactKind)
    if (!artifact || artifact.id !== artifactId) {
      return {
        action: request.action,
        idempotencyKey: key,
        status: "rejected",
        handler,
        failure: {
          status: "failure",
          code: "stale_artifact",
          message: `Artifact '${kind}' is stale or is not the latest snapshot artifact.`,
        },
      }
    }
  }
  if (decision.action === request.action) {
    for (const prerequisite of handler.prerequisites) {
      if (prerequisite.type === "checkpoint_clear" && snapshot.checkpoint) {
        return {
          action: request.action,
          idempotencyKey: key,
          status: "rejected",
          handler,
          failure: {
            status: "failure",
            code: "missing_prerequisite",
            message: "The action requires the current parent-owned checkpoint to be clear.",
          },
        }
      }
      if (prerequisite.type === "step_status") {
        const status = snapshot.plan?.steps.find((step) => step.id === prerequisite.stepId)?.status
        if (!status || !prerequisite.statuses.includes(status)) {
          return {
            action: request.action,
            idempotencyKey: key,
            status: "rejected",
            handler,
            failure: {
              status: "failure",
              code: "missing_prerequisite",
              message: `Step '${prerequisite.stepId}' does not have an accepted prerequisite status.`,
            },
          }
        }
      }
      if (prerequisite.type === "action_completed") {
        const completedKey = actionIdempotencyKey(snapshot, prerequisite.action)
        if (!snapshot.executedActionKeys?.includes(completedKey)) {
          return {
            action: request.action,
            idempotencyKey: key,
            status: "rejected",
            handler,
            failure: {
              status: "failure",
              code: "missing_prerequisite",
              message: `Reserved prerequisite action '${prerequisite.action}' has not been completed.`,
            },
          }
        }
      }
      if (prerequisite.type === "artifact" && prerequisite.artifact.required !== false) {
        const artifact = latestMatchingArtifact(snapshot, prerequisite.artifact)
        if (
          !artifact ||
          (prerequisite.artifact.approval !== "any" && artifact.approved !== prerequisite.artifact.approval)
        ) {
          return {
            action: request.action,
            idempotencyKey: key,
            status: "rejected",
            handler,
            failure: {
              status: "failure",
              code: "missing_prerequisite",
              message: `Required '${prerequisite.artifact.kind}' artifact is missing or not approved.`,
            },
          }
        }
      }
    }
  }

  return { action: request.action, idempotencyKey: key, status: "ready", handler, success: handler.success }
}

export function coordinatorInstruction(action: CoordinatorAction): string {
  const instructions: Partial<Record<CoordinatorAction, string>> = {
    research_or_skip:
      "Resolve only the canonical research step now: run the grounded researcher when external evidence is required, otherwise mark research skipped with its factual rationale.",
    run_copywriter:
      "Run the isolated copywriter with the explicit brief and approved evidence. Do not create a plan or select a transition.",
    run_scene_composer:
      "Run the isolated declarative scene composer for flagged visual needs. Do not generate executable source.",
    propose_visual_recipe:
      "Run the same isolated scene composer for one bounded Visual Recipe after exact CP4 approval, then present separate adoption authority.",
    present_script: "Present the latest script artifact at the parent-owned checkpoint and stop.",
    run_intake: "Reserve the parent-owned ProductionBrief intake boundary; do not infer missing inputs.",
    resolve_target: "Reserve the parent-owned TargetContract resolution boundary; do not select an implicit target.",
    run_direction: "Run the isolated direction specialist against the latest approved script.",
    revise_direction:
      "Revise the latest direction from the durable human feedback request, exact QA findings, and selected target.",
    present_direction: "Present the latest direction artifact at the parent-owned checkpoint and stop.",
    generate_draft_config: "Run the isolated config specialist against approved artifacts.",
    run_scene_qa: "Run the isolated Scene QA specialist against the latest config.",
    present_scene_qa: "Present the latest QA report at the parent-owned checkpoint and stop.",
    run_audio_planner: "Run the isolated audio planner against approved creative artifacts.",
    present_audio_chart: "Present the latest audio chart at the parent-owned checkpoint and stop.",
    generate_final_config:
      "Run the isolated config specialist to incorporate the approved audio chart without changing approved creative artifacts.",
    produce_audio_assets: "Produce only the approved audio assets through the parent action handler.",
    validate_final: "Validate the latest config and approved assets through the parent action handler.",
    render: "Submit the latest validated config through the parent action handler.",
    review_render: "Run deterministic review for the completed render through the parent action handler.",
    present_final_review: "Present the deterministic render review at the parent-owned checkpoint and stop.",
    publish: "Publish only after the parent has recorded final human approval.",
  }
  return instructions[action] ?? `Canonical coordinator action: ${action}`
}
