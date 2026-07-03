export interface PipelineStep {
  id: string
  owner: string
  title: string
  status: "pending" | "in_progress" | "completed" | "blocked" | "skipped" | "failed"
  summary: string
  artifactPaths: string[]
  blockers: string[]
  startedAt?: string
  completedAt?: string
  modelRoute?: string
}

export type PlanStep = PipelineStep

export interface PipelineDecision {
  id: string
  checkpointId: string
  stepId: string
  status: "approved" | "changes_requested" | "selected" | "skipped"
  summary: string
  payload?: unknown
  createdAt: string
}

export interface PipelinePlan {
  schemaVersion: number
  id: string
  threadId: string
  mode: string
  goal: string
  status: "active" | "blocked" | "completed" | "failed"
  steps: PipelineStep[]
  decisions: PipelineDecision[]
  currentStepId: string | null
  progress: { completed: number; total: number }
  createdAt: string
  updatedAt: string
}

export interface PlanState {
  mode: string
  goal: string
  status: string
  steps: PlanStep[]
  currentStepId: string | null
  progress: { completed: number; total: number }
}

const STEP_LABELS: Record<string, string> = {
  research: "Investigacion",
  copywriting: "Guion",
  draft_validation: "Validacion borrador",
  direction: "Direccion",
  scene_qa: "QA visual",
  audio_plan: "Plan de audio",
  voice_generation: "Voces",
  sound_assets: "Sonido",
  scene_creation: "Escenas custom",
  final_validation: "Validacion final",
  render: "Render",
  review: "Revision",
  target_staging: "Cargando config",
  target_loading: "Cargando config",
  source_staging: "Cargando config",
  revision_plan: "Plan de revision",
  revision: "Editando",
  validation: "Validacion",
  save: "Guardando",
  recovery_plan: "Plan de reparacion",
  repair: "Reparando",
  audit: "Auditoria",
  report: "Informe",
  variant_plan: "Plan de variante",
  variant_creation: "Generando variante",
  asset_plan: "Plan de assets",
  asset_generation: "Regenerando assets",
  answer: "Procesando",
}

const MODE_LABELS: Record<string, string> = {
  new_video: "Nuevo video",
  revise_existing: "Revision",
  render_only: "Render",
  recover_failed_render: "Reparacion",
  audit_only: "Auditoria",
  variant: "Variante",
  asset_regeneration: "Regenerar assets",
  question: "Consulta",
}

function normalizePipelineStep(step: Record<string, unknown>): PipelineStep {
  return {
    id: String(step.id ?? ""),
    owner: String(step.owner ?? ""),
    title: String(step.title ?? step.id ?? ""),
    status:
      step.status === "completed" ||
      step.status === "in_progress" ||
      step.status === "blocked" ||
      step.status === "skipped" ||
      step.status === "failed"
        ? step.status
        : "pending",
    summary: String(step.summary ?? ""),
    artifactPaths: Array.isArray(step.artifactPaths) ? step.artifactPaths.map((item) => String(item)) : [],
    blockers: Array.isArray(step.blockers) ? step.blockers.map((item) => String(item)) : [],
    startedAt: typeof step.startedAt === "string" ? step.startedAt : undefined,
    completedAt: typeof step.completedAt === "string" ? step.completedAt : undefined,
    modelRoute: typeof step.modelRoute === "string" ? step.modelRoute : undefined,
  }
}

function derivePlanState(plan: Pick<PipelinePlan, "mode" | "goal" | "status" | "steps">): PlanState {
  const steps = plan.steps.map((step) => normalizePipelineStep(step as unknown as Record<string, unknown>))

  let completed = 0
  let inProgress: PlanStep | undefined
  let nextPending: PlanStep | undefined
  for (const step of steps) {
    if (step.status === "completed" || step.status === "skipped") completed += 1
    else if (step.status === "in_progress" && !inProgress) inProgress = step
    else if (step.status === "pending" && !nextPending) nextPending = step
  }

  return {
    mode: plan.mode,
    goal: plan.goal,
    status: plan.status,
    steps,
    currentStepId: inProgress?.id ?? nextPending?.id ?? null,
    progress: { completed, total: steps.length },
  }
}

export function stepLabel(step: PlanStep): string {
  return STEP_LABELS[step.id] ?? step.title
}

export function modeLabel(mode: string): string {
  return MODE_LABELS[mode] ?? mode
}

export function extractPlanStateFromPipelinePlan(plan: PipelinePlan | null | undefined): PlanState | null {
  if (!plan) return null
  return derivePlanState(plan)
}

export function extractPlanState(values: Record<string, unknown> | undefined): PlanState | null {
  if (!values) return null

  const embeddedPlan = values.plan as PipelinePlan | undefined
  if (embeddedPlan && typeof embeddedPlan === "object") {
    return extractPlanStateFromPipelinePlan(embeddedPlan)
  }

  const files = values.files as Record<string, { content: string }> | undefined
  if (!files) return null

  const planFile = files["/pipeline/plan.json"]
  if (!planFile?.content) return null

  try {
    const raw = JSON.parse(typeof planFile.content === "string" ? planFile.content : "") as Partial<PipelinePlan> & {
      steps?: Record<string, unknown>[]
    }
    if (!Array.isArray(raw.steps)) return null
    return derivePlanState({
      mode: String(raw.mode ?? ""),
      goal: String(raw.goal ?? ""),
      status:
        raw.status === "blocked" || raw.status === "completed" || raw.status === "failed" || raw.status === "active"
          ? raw.status
          : "active",
      steps: raw.steps,
    })
  } catch {
    return null
  }
}

export function loadingLabelFromPlan(plan: PlanState | null): string {
  if (!plan) return "Procesando..."
  const current = plan.steps.find((s) => s.status === "in_progress")
  if (current) return `${stepLabel(current)}...`
  return "Procesando..."
}

export function isRenderingStep(plan: PlanState | null): boolean {
  if (!plan) return false
  return plan.steps.some((s) => s.id === "render" && s.status === "in_progress")
}
