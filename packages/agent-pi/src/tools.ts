import { defineTool } from "@earendil-works/pi-coding-agent"
import { validateComposedScene } from "@claqueta/scene-contracts"
import { Type } from "typebox"
import { randomUUID } from "node:crypto"
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { listAudioLibrary, validateAudioChart } from "./audioPlanner.js"
import { AgentPiStore } from "./store.js"
import { ThreadEventBus } from "./events.js"
import type { ConfigLineageMetadata, ConfigSpecialistInput, ConfigSpecialistResult } from "./configSpecialist.js"
import { configContentHash } from "./configSpecialist.js"
import {
  isSelectedTargetArtifactForBrief,
  summarizeSelectedRegisteredTarget,
  type SelectedTargetArtifact,
} from "./targetContracts.js"
import type { ProductionBriefArtifact } from "./productionBrief.js"
import {
  CANONICAL_MODE_STEPS,
  IMPLEMENTED_PIPELINE_MODES,
  PIPELINE_MODES,
  isImplementedPipelineMode,
} from "./coordinator.js"
import {
  configIdFromTitle,
  createCheckpointPayload,
  nextDraftFileName,
  scriptToMarkdown,
  writeJsonArtifact,
  writeTextArtifact,
} from "./artifacts.js"
import { PROJECT_ROOT, assertProjectPath, contentTutorialDir, ensureDirectory, projectRelativePath } from "./paths.js"
import type {
  ArtifactKind,
  ArtifactRecord,
  AudioAssetsManifest,
  AudioChart,
  CreativeBrief,
  DirectionDraft,
  PipelineDecision,
  PipelineMode,
  PipelinePlan,
  PipelineStep,
  RenderJobStatus,
  RenderReviewReport,
  ResearchBrief,
  SceneCompositionResult,
  SceneQaReport,
  ScriptDraft,
} from "./types.js"

const SceneScriptTypeSchema = Type.Union([
  Type.Literal("intro"),
  Type.Literal("terminal"),
  Type.Literal("callout"),
  Type.Literal("outro"),
  Type.Literal("hero"),
  Type.Literal("benefits"),
  Type.Literal("pricing"),
  Type.Literal("cta"),
  Type.Literal("custom"),
])

const SceneVisualTypeSchema = Type.Union([Type.Literal("builtin"), Type.Literal("custom")])

const SceneScriptSchema = Type.Object({
  id: Type.String(),
  type: SceneScriptTypeSchema,
  title: Type.Optional(Type.String()),
  voiceover: Type.Optional(Type.String()),
  visualNotes: Type.Optional(Type.String()),
  narrativeRole: Type.Optional(Type.String()),
  visualType: Type.Optional(SceneVisualTypeSchema),
  componentId: Type.Optional(Type.String()),
  visualRole: Type.Optional(Type.String()),
  propsPlan: Type.Optional(Type.Record(Type.String(), Type.Any())),
  visualRationale: Type.Optional(Type.String()),
  requiredAssets: Type.Optional(Type.Array(Type.String())),
  missingCapabilities: Type.Optional(Type.Array(Type.String())),
  riskNotes: Type.Optional(Type.Array(Type.String())),
  durationInSeconds: Type.Number(),
})

const CreativeBriefSchema = Type.Object({
  subject: Type.String(),
  goal: Type.String(),
  audience: Type.Optional(Type.String()),
  platform: Type.Optional(Type.String()),
  format: Type.Optional(Type.String()),
  tone: Type.Optional(Type.String()),
  language: Type.Optional(Type.String()),
  targetDurationSeconds: Type.Optional(Type.Number({ exclusiveMinimum: 0 })),
  brand: Type.Optional(Type.String()),
  evidence: Type.Optional(Type.Array(Type.String())),
  constraints: Type.Optional(Type.Array(Type.String())),
})

const ScriptDraftSchema = Type.Object({
  title: Type.String(),
  objective: Type.String(),
  audience: Type.Optional(Type.String()),
  tone: Type.Optional(Type.String()),
  scenes: Type.Array(SceneScriptSchema),
  estimatedDurationSeconds: Type.Optional(Type.Number()),
  notes: Type.Optional(Type.String()),
})

const DirectionDraftSchema = Type.Object({
  title: Type.Optional(Type.String()),
  scenes: Type.Array(Type.Record(Type.String(), Type.Any())),
  warnings: Type.Optional(Type.Array(Type.String())),
  audio: Type.Optional(Type.Record(Type.String(), Type.Any())),
  risks: Type.Optional(Type.Array(Type.String())),
})

type SceneCatalogEntry = Record<string, unknown> & {
  type?: string
  componentId?: string
  description?: string
  narrativeRoles?: unknown
  durationRange?: unknown
  bestFor?: unknown
  avoidWhen?: unknown
  exampleUse?: unknown
  props?: unknown
}

type SceneCatalogData = {
  scenes?: {
    tutorial?: {
      builtin?: SceneCatalogEntry[]
      custom?: SceneCatalogEntry[]
    }
  }
}

export function loadSceneCatalog(): SceneCatalogData {
  return readJsonFile(join(PROJECT_ROOT, "src/shared/scene-catalog.json")) as SceneCatalogData
}

function summarizeSceneCatalog(catalog: SceneCatalogData) {
  const summarizeEntry = (scene: SceneCatalogEntry) => ({
    type: scene.type,
    componentId: scene.componentId,
    description: asString(scene.description),
    narrativeRoles: Array.isArray(scene.narrativeRoles)
      ? scene.narrativeRoles.filter((value): value is string => typeof value === "string")
      : undefined,
    durationRange: Array.isArray(scene.durationRange) ? scene.durationRange : undefined,
    bestFor: Array.isArray(scene.bestFor)
      ? scene.bestFor.filter((value): value is string => typeof value === "string")
      : undefined,
    avoidWhen: Array.isArray(scene.avoidWhen)
      ? scene.avoidWhen.filter((value): value is string => typeof value === "string")
      : undefined,
    propsExpected: scene.props ?? undefined,
    exampleUse: asString(scene.exampleUse),
  })

  const tutorial = catalog.scenes?.tutorial
  return {
    builtin: (tutorial?.builtin ?? []).map(summarizeEntry),
    custom: (tutorial?.custom ?? []).map(summarizeEntry),
  }
}

const BUILTIN_SCENE_TYPES = new Set(["intro", "terminal", "callout", "outro", "hero", "benefits", "pricing", "cta"])
const VISUAL_TYPE_VALUES = new Set(["builtin", "custom"])

function isRegisteredCustomComponent(componentId: string): boolean {
  return (loadSceneCatalog().scenes?.tutorial?.custom ?? []).some((scene) => scene.componentId === componentId)
}

function validateScriptDraftCatalog(script: ScriptDraft): string[] {
  const errors: string[] = []
  script.scenes.forEach((scene, index) => {
    const label = scene.title || scene.id || `scene ${index + 1}`
    const unresolvedCapability = (scene.missingCapabilities?.length ?? 0) > 0
    if (unresolvedCapability) return
    if (scene.type === "custom") {
      if (!scene.componentId) {
        errors.push(`Script scene '${label}' uses type=custom but does not define componentId.`)
      } else if (!isRegisteredCustomComponent(scene.componentId)) {
        errors.push(
          `Script scene '${label}' uses unknown componentId '${scene.componentId}'. Use list_scene_catalog first.`,
        )
      }
      if (!scene.propsPlan || Object.keys(scene.propsPlan).length === 0) {
        errors.push(`Script scene '${label}' uses type=custom but does not include propsPlan for the chosen component.`)
      } else if (scene.componentId === "composed-scene") {
        const validation = validateComposedScene(scene.propsPlan)
        errors.push(
          ...validation.errors.map((error) => `Script scene '${label}' has invalid composed-scene props: ${error}`),
        )
      }
    } else if (!BUILTIN_SCENE_TYPES.has(scene.type)) {
      errors.push(
        `Script scene '${label}' uses unknown type '${scene.type}'. Use a supported builtin type or type=custom with a registered componentId from list_scene_catalog.`,
      )
    }

    if (scene.visualType && !VISUAL_TYPE_VALUES.has(scene.visualType)) {
      errors.push(
        `Script scene '${label}' uses visualType '${scene.visualType}'. visualType must be 'builtin' or 'custom'; put concrete custom scene ids in componentId.`,
      )
    }

    if (scene.componentId && !isRegisteredCustomComponent(scene.componentId) && scene.componentId !== scene.type) {
      errors.push(`Script scene '${label}' references unknown componentId '${scene.componentId}'.`)
    }
  })
  return errors
}

export function assertValidScriptDraftCatalog(script: ScriptDraft): void {
  const errors = validateScriptDraftCatalog(script)
  if (errors.length > 0) throw new Error(errors.join("\n"))
}

function rejectedScriptDraftResult(threadId: string, eventBus: ThreadEventBus, errors: string[]) {
  eventBus.publish({
    threadId,
    type: "error",
    payload: {
      recoverable: true,
      message: `Script draft rejected by scene catalog validation: ${errors.join(" | ")}`,
    },
  })
  return textResult(
    "Script draft rejected by scene catalog validation. Fix the scene type/visualType/componentId values using list_scene_catalog, then call create_script_draft again. Do not present a manual escaleta in chat.",
    { valid: false, errors },
  )
}

const PipelinePlanSchema = Type.Object({
  mode: Type.Union(PIPELINE_MODES.map((mode) => Type.Literal(mode))),
  goal: Type.String(),
  target: Type.Optional(Type.Record(Type.String(), Type.Any())),
})

const PIPELINE_STEP_STATUSES = ["pending", "in_progress", "completed", "blocked", "skipped", "failed"] as const

function nowIso(): string {
  return new Date().toISOString()
}

function defaultPipelineSteps(mode: PipelineMode): PipelineStep[] {
  return CANONICAL_MODE_STEPS[mode].map((step) => ({
    ...step,
    status: "pending" as const,
    summary: "",
    artifactPaths: [],
    blockers: [],
  }))
}

function normalizePipelineStep(step: Partial<PipelineStep> & { id: string }, index: number): PipelineStep {
  return {
    id: step.id || `step_${index + 1}`,
    owner: step.owner ?? "orchestrator",
    title: step.title ?? step.id ?? `Step ${index + 1}`,
    status: PIPELINE_STEP_STATUSES.includes(step.status as (typeof PIPELINE_STEP_STATUSES)[number])
      ? (step.status as PipelineStep["status"])
      : "pending",
    summary: step.summary ?? "",
    artifactPaths: Array.isArray(step.artifactPaths)
      ? step.artifactPaths.filter((item): item is string => typeof item === "string")
      : [],
    blockers: Array.isArray(step.blockers)
      ? step.blockers.filter((item): item is string => typeof item === "string")
      : [],
    startedAt: typeof step.startedAt === "string" ? step.startedAt : undefined,
    completedAt: typeof step.completedAt === "string" ? step.completedAt : undefined,
    modelRoute: typeof step.modelRoute === "string" ? step.modelRoute : undefined,
  }
}

function deriveCurrentStepId(steps: PipelineStep[]): string | null {
  let firstPending: string | null = null
  for (const step of steps) {
    if (step.status === "in_progress") return step.id
    if (step.status === "pending" && !firstPending) firstPending = step.id
  }
  return firstPending
}

function deriveProgress(steps: PipelineStep[]): { completed: number; total: number } {
  let completed = 0
  for (const step of steps) {
    if (step.status === "completed" || step.status === "skipped") completed += 1
  }
  return { completed, total: steps.length }
}

function derivePlanStatus(steps: PipelineStep[]): PipelinePlan["status"] {
  if (steps.every((step) => step.status === "completed" || step.status === "skipped")) return "completed"
  if (steps.some((step) => step.status === "failed")) return "failed"
  if (steps.some((step) => step.status === "blocked")) return "blocked"
  return "active"
}

function normalizePlan(plan: PipelinePlan): PipelinePlan {
  const steps = plan.steps.map((step, index) => normalizePipelineStep(step, index))
  return {
    ...plan,
    steps,
    currentStepId: deriveCurrentStepId(steps),
    progress: deriveProgress(steps),
    status: derivePlanStatus(steps),
    updatedAt: nowIso(),
  }
}

export function createPipelinePlanRecord(threadId: string, mode: PipelineMode, goal: string): PipelinePlan {
  const normalizedSteps = defaultPipelineSteps(mode).map((step, index) => normalizePipelineStep(step, index))
  const now = nowIso()
  const plan: PipelinePlan = {
    schemaVersion: 1,
    id: randomUUID(),
    threadId,
    mode,
    goal,
    status: derivePlanStatus(normalizedSteps),
    steps: normalizedSteps,
    decisions: [],
    currentStepId: deriveCurrentStepId(normalizedSteps),
    progress: deriveProgress(normalizedSteps),
    createdAt: now,
    updatedAt: now,
  }
  return plan
}

function nextPipelineStep(plan: PipelinePlan): PipelineStep | null {
  const blocked = plan.steps.find((step) => step.status === "blocked")
  if (blocked) return blocked
  const inProgress = plan.steps.find((step) => step.status === "in_progress")
  if (inProgress) return inProgress
  return plan.steps.find((step) => step.status === "pending") ?? null
}

function publishPipelinePlanUpdate(
  store: AgentPiStore,
  eventBus: ThreadEventBus,
  threadId: string,
  plan: PipelinePlan,
  change: Record<string, unknown>,
): PipelinePlan {
  const saved = store.savePipelinePlan(normalizePlan(plan))
  eventBus.publish({ threadId, type: "plan_updated", payload: { plan: saved, ...change } })
  return saved
}

export interface ClaquetaToolContext {
  threadId: string
  store: AgentPiStore
  eventBus: ThreadEventBus
  renderServiceUrl: string
  produceAudioAssets?: (input: {
    config: Record<string, unknown>
    configPath: string
    chart: AudioChart
    sceneCount: number
  }) => Promise<AudioAssetsManifest>
  runSceneComposerSpecialist?: (
    input: {
      script: ScriptDraft
      targetSceneIds: string[]
      catalog: Record<string, unknown>
      registeredComponentIds: string[]
    },
    signal?: AbortSignal,
  ) => Promise<{ runId: string; modelRoute: string; result: SceneCompositionResult }>
  runSceneQaSpecialist?: (
    input: { config: Record<string, unknown>; script: ScriptDraft; direction: DirectionDraft; audioChart?: AudioChart },
    signal?: AbortSignal,
  ) => Promise<{ runId: string; modelRoute: string; report: SceneQaReport }>
  runAudioPlannerSpecialist?: (
    script: ScriptDraft,
    direction: DirectionDraft,
    preferences: {
      language?: string
      voiceover?: "required" | "optional" | "none"
      soundDesign?: "required" | "optional" | "none"
      notes?: string[]
    },
    revision: { feedback?: string; previousChart?: AudioChart },
    signal?: AbortSignal,
  ) => Promise<{ runId: string; modelRoute: string; chart: AudioChart }>
  runResearchSpecialist?: (
    input: {
      request: string
      subject: string
      objective: string
      language?: string
      sourceUrls?: string[]
      constraints?: string[]
    },
    signal?: AbortSignal,
  ) => Promise<{ runId: string; modelRoute: string; research: ResearchBrief }>
  runCopywriterSpecialist?: (
    request: string,
    brief: CreativeBrief,
    revision: { feedback?: string; previousScript?: ScriptDraft },
    signal?: AbortSignal,
  ) => Promise<{ runId: string; modelRoute: string; script: ScriptDraft }>
  runDirectionSpecialist?: (
    script: ScriptDraft,
    revision: { feedback?: string; previousDirection?: DirectionDraft },
    signal?: AbortSignal,
  ) => Promise<{ runId: string; modelRoute: string; direction: DirectionDraft }>
  runConfigSpecialist?: (input: ConfigSpecialistInput, signal?: AbortSignal) => Promise<ConfigSpecialistResult>
}

function textResult(text: string, details: Record<string, unknown> = {}, terminate = false) {
  return {
    content: [{ type: "text" as const, text }],
    details,
    terminate,
  }
}

function readJsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf-8"))
}

function summarizeConfig(configPath: string): Record<string, unknown> {
  const config = readJsonFile(configPath) as Record<string, unknown>
  const scenes = Array.isArray(config.scenes) ? config.scenes : []
  return {
    configPath: projectRelativePath(configPath),
    configId: typeof config.id === "string" ? config.id : configPath.split("/").at(-2),
    composition: typeof config.composition === "string" ? config.composition : "ClaudeCodeTutorial",
    title:
      typeof config.title === "string"
        ? config.title
        : typeof config.headline === "string"
          ? config.headline
          : typeof config.product === "string"
            ? config.product
            : configPath.split("/").at(-2),
    sceneCount: scenes.length,
    durationSeconds: scenes.reduce((sum, scene) => {
      if (typeof scene !== "object" || scene === null) return sum
      const duration = Number((scene as Record<string, unknown>).durationInSeconds ?? 0)
      return Number.isFinite(duration) ? sum + duration : sum
    }, 0),
  }
}

function listConfigPaths(): string[] {
  const roots = ["content/tutorials", "content/shorts", "content/presentations"]
  const paths: string[] = []
  for (const root of roots) {
    const rootPath = assertProjectPath(root)
    if (!existsSync(rootPath)) continue
    for (const entry of readdirSync(rootPath, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const configPath = join(rootPath, entry.name, "config.json")
      try {
        statSync(configPath)
        paths.push(configPath)
      } catch {
        // Optional config.
      }
    }
  }
  const generated = assertProjectPath(".generated/renders")
  if (existsSync(generated)) {
    for (const entry of readdirSync(generated, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith("validate-")) continue
      const configPath = join(generated, entry.name, "config.json")
      if (existsSync(configPath)) paths.push(configPath)
    }
  }
  return paths.sort()
}

function resolveConfigPath(pathOrSlug: string): string {
  const direct = assertProjectPath(pathOrSlug)
  try {
    const stat = statSync(direct)
    if (stat.isFile()) return direct
    if (stat.isDirectory() && existsSync(join(direct, "config.json"))) return join(direct, "config.json")
  } catch {
    // Resolve by slug/id below.
  }

  const slug = pathOrSlug.split("/").filter(Boolean).at(-1) ?? pathOrSlug
  const matches = listConfigPaths().filter((candidate) => {
    try {
      const config = readJsonFile(candidate) as Record<string, unknown>
      return candidate.split("/").at(-2) === slug || config.id === slug || config.title === slug
    } catch {
      return false
    }
  })
  if (matches.length === 1) return matches[0]
  if (matches.length > 1) {
    throw new Error(`Multiple configs match '${pathOrSlug}': ${matches.map(projectRelativePath).join(", ")}`)
  }
  throw new Error(`No config found for '${pathOrSlug}'`)
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, ms)
    if (!signal) return
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout)
        reject(new Error("Aborted"))
      },
      { once: true },
    )
  })
}

async function fetchJson(url: string, options?: RequestInit): Promise<{ status: number; body: unknown }> {
  const response = await fetch(url, options)
  const text = await response.text()
  let body: unknown = text
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = { raw: text }
    }
  }
  return { status: response.status, body }
}

function configFromInput(
  store: AgentPiStore,
  threadId: string,
  config: unknown,
  artifactId?: string,
): Record<string, unknown> {
  if (artifactId) {
    const artifact = store.getArtifact<Record<string, unknown>>(artifactId)
    if (!artifact) throw new Error(`Artifact not found: ${artifactId}`)
    if (artifact.kind !== "config") throw new Error(`Artifact is not a config: ${artifactId}`)
    return withTutorialDefaults(artifact.data)
  }
  if (typeof config === "object" && config !== null && !Array.isArray(config)) {
    return withTutorialDefaults(config as Record<string, unknown>)
  }
  const artifact = latestArtifact<Record<string, unknown>>(store, threadId, "config")
  if (artifact) return withTutorialDefaults(artifact.data)
  throw new Error("A config object or config artifactId is required")
}

function latestArtifact<TData>(
  store: AgentPiStore,
  threadId: string,
  kind: ArtifactKind,
  approvedOnly = false,
): ArtifactRecord<TData> | undefined {
  return store
    .listArtifacts(threadId)
    .filter((artifact) => artifact.kind === kind && (!approvedOnly || artifact.approved))
    .at(-1) as ArtifactRecord<TData> | undefined
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const items = value
    .map((item) => {
      if (typeof item === "string") return item
      if (typeof item === "object" && item !== null && typeof (item as { text?: unknown }).text === "string") {
        return (item as { text: string }).text
      }
      return undefined
    })
    .filter((item): item is string => item !== undefined && item.trim().length > 0)
  return items.length > 0 ? items : undefined
}

function normalizeTerminalLines(scene: Record<string, unknown>): Array<Record<string, unknown>> {
  const rawLines = Array.isArray(scene.lines) ? scene.lines : []
  if (rawLines.length === 0) {
    const sceneLabel = asString(scene.title) ?? asString(scene.id) ?? "terminal scene"
    throw new Error(
      `Terminal scene '${sceneLabel}' must define non-empty lines. Provide real terminal content instead of relying on the removed /compact fallback.`,
    )
  }

  return rawLines.map((line) => {
    if (typeof line !== "object" || line === null) return { kind: "output", text: String(line) }
    const record = line as Record<string, unknown>
    const rawKind = asString(record.kind)?.toLowerCase()
    const kind =
      rawKind === "command" || rawKind === "output" || rawKind === "claude" || rawKind === "blank" ? rawKind : "output"
    return { ...record, kind, text: asString(record.text) ?? "" }
  })
}

function normalizeScene(rawScene: unknown): Record<string, unknown> {
  const scene = typeof rawScene === "object" && rawScene !== null ? (rawScene as Record<string, unknown>) : {}
  const type = asString(scene.type) ?? "callout"
  const durationInSeconds = Number(scene.durationInSeconds ?? 4)
  const safeDuration = Number.isFinite(durationInSeconds) ? durationInSeconds : 4
  const title = asString(scene.title) ?? asString(scene.heading) ?? asString(scene.id) ?? "Escena"
  const voiceover = asString(scene.voiceover) ?? asString(scene.narration) ?? asString(scene.summary)
  const items = asStringArray(scene.items) ?? asStringArray(scene.bullets)

  if (type === "intro") {
    return {
      ...scene,
      type: "intro",
      title,
      subtitle: asString(scene.subtitle) ?? voiceover,
      durationInSeconds: safeDuration,
    }
  }

  if (type === "terminal") {
    return {
      ...scene,
      type: "terminal",
      title,
      lines: normalizeTerminalLines(scene),
      durationInSeconds: safeDuration,
    }
  }

  if (type === "custom") {
    const componentId = asString(scene.componentId)
    if (!componentId) {
      throw new Error(`Custom scene '${title}' must define a componentId.`)
    }
    if (!isRegisteredCustomComponent(componentId)) {
      throw new Error(
        `Custom scene '${title}' references unknown componentId '${componentId}'. Use list_scene_catalog first.`,
      )
    }
    if (componentId === "composed-scene") {
      const composedProps =
        scene.props && typeof scene.props === "object" && !Array.isArray(scene.props)
          ? scene.props
          : scene.propsPlan && typeof scene.propsPlan === "object" && !Array.isArray(scene.propsPlan)
            ? scene.propsPlan
            : {}
      const validation = validateComposedScene(composedProps)
      if (!validation.valid) {
        throw new Error(`Custom scene '${title}' has invalid composed-scene props: ${validation.errors.join("; ")}`)
      }
    }
    return {
      ...scene,
      type: "custom",
      componentId,
      durationInSeconds: safeDuration,
    }
  }

  if (type === "callout") {
    return {
      ...scene,
      type: "callout",
      text: asString(scene.text) ?? voiceover ?? items?.join(" · ") ?? title,
      position: asString(scene.position) ?? "bottom",
      background: asString(scene.background) ?? "overlay",
      durationInSeconds: safeDuration,
    }
  }

  if (type === "outro") {
    return {
      ...scene,
      type: "outro",
      title,
      bullets: asStringArray(scene.bullets) ?? items ?? (voiceover ? [voiceover] : undefined),
      durationInSeconds: safeDuration,
    }
  }

  if (type === "benefits") {
    return {
      ...scene,
      type: "benefits",
      title,
      items: (items ?? [voiceover ?? title]).map((text) => ({ text })),
      durationInSeconds: safeDuration,
    }
  }

  throw new Error(
    `Unknown scene type '${type}' in scene '${title}'. Use a supported builtin scene type or a registered custom component from list_scene_catalog.`,
  )
}

function normalizeTransition(transition: unknown): unknown {
  if (transition === undefined || transition === null) return transition
  if (typeof transition === "string") return { type: transition === "cut" ? "none" : transition }
  if (typeof transition !== "object") return transition
  const record = transition as Record<string, unknown>
  if (record.type === "cut") return { ...record, type: "none" }
  return transition
}

function withTutorialDefaults(config: Record<string, unknown>): Record<string, unknown> {
  const title = typeof config.title === "string" ? config.title : "claqueta-video"
  return {
    id: typeof config.id === "string" ? config.id : configIdFromTitle(title),
    title,
    description: typeof config.description === "string" ? config.description : title,
    fps: 30,
    width: 1280,
    height: 720,
    composition: "ClaudeCodeTutorial",
    theme: "betelgeuse",
    ...config,
    scenes: Array.isArray(config.scenes) ? config.scenes.map(normalizeScene) : [],
    transition: normalizeTransition(config.transition),
  }
}

export function createClaquetaTools(ctx: ClaquetaToolContext) {
  const {
    threadId,
    store,
    eventBus,
    renderServiceUrl,
    produceAudioAssets,
    runAudioPlannerSpecialist,
    runSceneComposerSpecialist,
    runSceneQaSpecialist,
    runResearchSpecialist,
    runCopywriterSpecialist,
    runDirectionSpecialist,
    runConfigSpecialist,
  } = ctx

  return [
    defineTool({
      name: "list_scene_catalog",
      label: "List Scene Catalog",
      description: "List available Remotion scene types and narrative guidance for ClaudeCodeTutorial.",
      promptSnippet: "List the available scene catalog before choosing Remotion scene types.",
      parameters: Type.Object({}),
      async execute() {
        const catalog = loadSceneCatalog()
        return textResult("Scene catalog loaded.", { catalog, summary: summarizeSceneCatalog(catalog) })
      },
    }),

    defineTool({
      name: "list_existing_configs",
      label: "List Existing Configs",
      description: "List known content and generated video config.json files.",
      parameters: Type.Object({}),
      async execute() {
        const configs = listConfigPaths().map((configPath) => {
          try {
            return summarizeConfig(configPath)
          } catch (error) {
            return {
              configPath: projectRelativePath(configPath),
              error: error instanceof Error ? error.message : String(error),
            }
          }
        })
        return textResult(`Found ${configs.length} config(s).`, { configs })
      },
    }),

    defineTool({
      name: "load_existing_config",
      label: "Load Existing Config",
      description: "Load an existing config by relative path, directory, slug, or config id.",
      parameters: Type.Object({ pathOrSlug: Type.String() }),
      async execute(_id, params) {
        const configPath = resolveConfigPath(params.pathOrSlug)
        const config = readJsonFile(configPath)
        return textResult(`Loaded ${projectRelativePath(configPath)}.`, {
          sourcePath: projectRelativePath(configPath),
          config,
          summary: summarizeConfig(configPath),
        })
      },
    }),

    defineTool({
      name: "create_pipeline_plan",
      label: "Create Pipeline Plan",
      description: "Create or replace the shared pipeline plan for this thread.",
      parameters: PipelinePlanSchema,
      async execute(_id, params) {
        const mode = params.mode as PipelineMode
        if (!isImplementedPipelineMode(mode)) {
          return textResult(`Pipeline mode '${mode}' is not implemented yet.`, {
            status: "unsupported_mode",
            mode,
            supportedModes: IMPLEMENTED_PIPELINE_MODES,
            reason:
              "This pure foundation does not create mutable plans for declared modes until their parent-owned contracts and executor exist.",
            planPath: "/pipeline/plan.json",
          })
        }
        const plan = createPipelinePlanRecord(threadId, mode, params.goal)
        const saved = publishPipelinePlanUpdate(store, eventBus, threadId, plan, { action: "create" })
        return textResult("Pipeline plan created.", { plan: saved, planPath: "/pipeline/plan.json" })
      },
    }),

    defineTool({
      name: "read_pipeline_plan",
      label: "Read Pipeline Plan",
      description: "Read the current shared pipeline plan for this thread.",
      parameters: Type.Object({}),
      async execute() {
        const plan = store.getPipelinePlan(threadId)
        if (!plan) {
          return textResult("No pipeline plan found.", { exists: false, planPath: "/pipeline/plan.json" })
        }
        return textResult("Pipeline plan loaded.", { exists: true, plan, planPath: "/pipeline/plan.json" })
      },
    }),

    defineTool({
      name: "update_pipeline_step",
      label: "Update Pipeline Step",
      description: "Update one step in the shared pipeline plan.",
      parameters: Type.Object({
        stepId: Type.String(),
        status: Type.Union([
          Type.Literal("pending"),
          Type.Literal("in_progress"),
          Type.Literal("completed"),
          Type.Literal("blocked"),
          Type.Literal("skipped"),
          Type.Literal("failed"),
        ]),
        summary: Type.Optional(Type.String()),
        artifactPaths: Type.Optional(Type.Array(Type.String())),
        blockers: Type.Optional(Type.Array(Type.String())),
        startedAt: Type.Optional(Type.String()),
        completedAt: Type.Optional(Type.String()),
        modelRoute: Type.Optional(Type.String()),
      }),
      async execute(_id, params) {
        const plan = store.getPipelinePlan(threadId)
        if (!plan) throw new Error("The orchestrator must call create_pipeline_plan first.")
        const stepIndex = plan.steps.findIndex((step) => step.id === params.stepId)
        if (stepIndex < 0) {
          throw new Error(`Unknown pipeline step '${params.stepId}' for canonical mode '${plan.mode}'`)
        }
        const existingStep = plan.steps[stepIndex]!
        const nextStep: PipelineStep = {
          id: params.stepId,
          owner: existingStep.owner,
          title: existingStep.title,
          status: params.status as PipelineStep["status"],
          summary: params.summary ?? existingStep.summary,
          artifactPaths: params.artifactPaths ?? existingStep.artifactPaths,
          blockers: params.blockers ?? existingStep.blockers,
          startedAt: params.startedAt ?? existingStep.startedAt,
          completedAt: params.completedAt ?? existingStep.completedAt,
          modelRoute: params.modelRoute ?? existingStep.modelRoute,
        }
        const steps = [...plan.steps]
        steps[stepIndex] = nextStep
        const saved = publishPipelinePlanUpdate(
          store,
          eventBus,
          threadId,
          { ...plan, steps },
          { action: "update_step", stepId: params.stepId, status: params.status },
        )
        return textResult("Pipeline step updated.", { plan: saved, step: nextStep, planPath: "/pipeline/plan.json" })
      },
    }),

    defineTool({
      name: "record_pipeline_decision",
      label: "Record Pipeline Decision",
      description: "Record a human decision or checkpoint resolution in the shared plan.",
      parameters: Type.Object({
        decisionId: Type.String(),
        checkpointId: Type.String(),
        stepId: Type.String(),
        status: Type.Union([
          Type.Literal("approved"),
          Type.Literal("changes_requested"),
          Type.Literal("selected"),
          Type.Literal("skipped"),
        ]),
        summary: Type.String(),
        payload: Type.Optional(Type.Any()),
      }),
      async execute(_id, params) {
        const plan = store.getPipelinePlan(threadId)
        if (!plan) throw new Error("The orchestrator must call create_pipeline_plan first.")
        const decision: PipelineDecision = {
          id: params.decisionId,
          checkpointId: params.checkpointId,
          stepId: params.stepId,
          status: params.status as PipelineDecision["status"],
          summary: params.summary,
          payload: params.payload,
          createdAt: nowIso(),
        }
        const step = plan.steps.find((item) => item.id === params.stepId)
        if (!step) throw new Error(`Unknown pipeline decision step '${params.stepId}' for mode '${plan.mode}'`)
        const updatedPlan = {
          ...plan,
          decisions: [...plan.decisions, decision],
          steps: step ? [...plan.steps] : plan.steps,
        }
        const saved = publishPipelinePlanUpdate(store, eventBus, threadId, updatedPlan, {
          action: "record_decision",
          decisionId: params.decisionId,
          stepId: params.stepId,
          status: params.status,
        })
        return textResult("Pipeline decision recorded.", { plan: saved, decision, planPath: "/pipeline/plan.json" })
      },
    }),

    defineTool({
      name: "get_next_pipeline_step",
      label: "Get Next Pipeline Step",
      description: "Return the next actionable step from the shared pipeline plan.",
      parameters: Type.Object({}),
      async execute() {
        const plan = store.getPipelinePlan(threadId)
        if (!plan) {
          return textResult("No pipeline plan found.", {
            status: "no_plan",
            instruction: "Call create_pipeline_plan first.",
            planPath: "/pipeline/plan.json",
          })
        }
        const nextStep = nextPipelineStep(plan)
        if (!nextStep) {
          return textResult("All pipeline steps are complete.", {
            status: "all_completed",
            progress: plan.progress,
            planPath: "/pipeline/plan.json",
          })
        }
        return textResult("Next pipeline step found.", {
          status:
            nextStep.status === "blocked" ? "blocked" : nextStep.status === "in_progress" ? "in_progress" : "next_step",
          step: nextStep,
          progress: plan.progress,
          planPath: "/pipeline/plan.json",
        })
      },
    }),

    defineTool({
      name: "run_research_specialist",
      label: "Run Research Specialist",
      description:
        "Run an isolated topic-neutral Pi researcher with capped public-web tools and persist a cited factual brief.",
      promptSnippet: "Use the isolated researcher when a video requires external factual evidence before copywriting.",
      parameters: Type.Object({
        request: Type.String(),
        subject: Type.String(),
        objective: Type.String(),
        language: Type.Optional(Type.String()),
        sourceUrls: Type.Optional(Type.Array(Type.String())),
        constraints: Type.Optional(Type.Array(Type.String())),
      }),
      async execute(_id, params, signal) {
        if (!runResearchSpecialist) throw new Error("Research specialist is not configured")
        const plan = store.getPipelinePlan(threadId)
        if (plan) {
          const step = plan.steps.find((candidate) => candidate.id === "research")
          if (step) {
            step.status = "in_progress"
            step.owner = "researcher"
            step.summary = "Isolated Pi researcher is gathering cited evidence"
            step.startedAt ??= nowIso()
            publishPipelinePlanUpdate(store, eventBus, threadId, plan, {
              action: "specialist_started",
              stepId: "research",
            })
          }
        }

        try {
          const result = await runResearchSpecialist(
            {
              request: params.request,
              subject: params.subject,
              objective: params.objective,
              language: params.language,
              sourceUrls: params.sourceUrls,
              constraints: params.constraints,
            },
            signal,
          )
          const artifact = writeJsonArtifact(store, threadId, "research", "brief.json", result.research, true)
          eventBus.publish({ threadId, type: "artifact_updated", payload: { kind: "research", artifact } })

          const updatedPlan = store.getPipelinePlan(threadId)
          if (updatedPlan) {
            const step = updatedPlan.steps.find((candidate) => candidate.id === "research")
            if (step) {
              step.status = "completed"
              step.owner = "researcher"
              step.summary = `Research completed with ${result.research.claims.length} cited claims`
              step.modelRoute = result.modelRoute
              step.completedAt = nowIso()
              step.artifactPaths = [...new Set([...step.artifactPaths, artifact.path].filter(Boolean) as string[])]
              publishPipelinePlanUpdate(store, eventBus, threadId, updatedPlan, {
                action: "specialist_completed",
                stepId: "research",
                runId: result.runId,
              })
            }
          }
          return textResult("Research specialist completed. Use the cited brief during copywriting.", {
            runId: result.runId,
            modelRoute: result.modelRoute,
            artifact,
            research: result.research,
          })
        } catch (error) {
          const failedPlan = store.getPipelinePlan(threadId)
          if (failedPlan) {
            const step = failedPlan.steps.find((candidate) => candidate.id === "research")
            if (step) {
              const message = error instanceof Error ? error.message : String(error)
              step.status = signal?.aborted ? "blocked" : "failed"
              step.owner = "researcher"
              step.summary = "Research specialist failed"
              step.blockers = [message]
              step.completedAt = nowIso()
              publishPipelinePlanUpdate(store, eventBus, threadId, failedPlan, {
                action: "specialist_failed",
                stepId: "research",
              })
            }
          }
          throw error
        }
      },
    }),

    defineTool({
      name: "run_copywriter_specialist",
      label: "Run Copywriter Specialist",
      description:
        "Run an isolated topic-neutral Pi copywriter against an explicit creative brief and the exact scene catalog, then persist its structured script draft.",
      promptSnippet: "Delegate new or revised visual-script planning to the isolated Pi copywriter before CP1.",
      parameters: Type.Object({
        request: Type.String(),
        brief: CreativeBriefSchema,
        researchArtifactId: Type.Optional(Type.String()),
        previousScriptArtifactId: Type.Optional(Type.String()),
        feedback: Type.Optional(Type.String()),
      }),
      async execute(_id, params, signal) {
        if (!runCopywriterSpecialist) throw new Error("Copywriter specialist is not configured")
        const plan = store.getPipelinePlan(threadId)
        if (plan) {
          const step = plan.steps.find((candidate) => candidate.id === "copywriting")
          if (step) {
            step.status = "in_progress"
            step.owner = "copywriter"
            step.summary = params.feedback
              ? "Isolated Pi copywriter is revising the visual script"
              : "Isolated Pi copywriter is drafting the visual script"
            step.startedAt ??= nowIso()
            publishPipelinePlanUpdate(store, eventBus, threadId, plan, {
              action: "specialist_started",
              stepId: "copywriting",
            })
          }
        }

        try {
          const previousScriptArtifact = params.previousScriptArtifactId
            ? store.getArtifact<ScriptDraft>(params.previousScriptArtifactId)
            : params.feedback
              ? latestArtifact<ScriptDraft>(store, threadId, "script")
              : undefined
          if (previousScriptArtifact && previousScriptArtifact.kind !== "script") {
            throw new Error("previousScriptArtifactId must reference a script artifact")
          }

          const researchArtifact = params.researchArtifactId
            ? store.getArtifact<ResearchBrief>(params.researchArtifactId)
            : latestArtifact<ResearchBrief>(store, threadId, "research")
          if (researchArtifact && researchArtifact.kind !== "research") {
            throw new Error("researchArtifactId must reference a research artifact")
          }
          const brief = params.brief as CreativeBrief
          const researchEvidence = researchArtifact
            ? researchArtifact.data.claims.map(
                (claim) => `${claim.claim} [sources: ${claim.sourceUrls.join(", ")}; confidence: ${claim.confidence}]`,
              )
            : []
          const enrichedBrief: CreativeBrief = {
            ...brief,
            evidence: [...new Set([...(brief.evidence ?? []), ...researchEvidence])],
          }

          const result = await runCopywriterSpecialist(
            params.request,
            enrichedBrief,
            { feedback: params.feedback, previousScript: previousScriptArtifact?.data },
            signal,
          )
          assertValidScriptDraftCatalog(result.script)
          const artifact = writeJsonArtifact(
            store,
            threadId,
            "script",
            nextDraftFileName(store, threadId, "script"),
            result.script,
          )
          const markdown = writeTextArtifact(
            store,
            threadId,
            "script_markdown",
            nextDraftFileName(store, threadId, "script_markdown", "md"),
            scriptToMarkdown(result.script),
          )
          eventBus.publish({
            threadId,
            type: "artifact_updated",
            payload: { kind: "script", artifact, markdownPath: markdown.path },
          })

          const updatedPlan = store.getPipelinePlan(threadId)
          if (updatedPlan) {
            const step = updatedPlan.steps.find((candidate) => candidate.id === "copywriting")
            if (step) {
              step.status = "in_progress"
              step.owner = "copywriter"
              step.summary = "Script draft ready for CP1 human review"
              step.modelRoute = result.modelRoute
              step.artifactPaths = [...new Set([...step.artifactPaths, artifact.path].filter(Boolean) as string[])]
              publishPipelinePlanUpdate(store, eventBus, threadId, updatedPlan, {
                action: "specialist_completed",
                stepId: "copywriting",
                runId: result.runId,
              })
            }
          }
          return textResult("Copywriter specialist completed. Present its artifact for CP1 review.", {
            runId: result.runId,
            modelRoute: result.modelRoute,
            artifact,
            markdownPath: markdown.path,
            script: result.script,
          })
        } catch (error) {
          const failedPlan = store.getPipelinePlan(threadId)
          if (failedPlan) {
            const step = failedPlan.steps.find((candidate) => candidate.id === "copywriting")
            if (step) {
              const message = error instanceof Error ? error.message : String(error)
              step.status = signal?.aborted ? "blocked" : "failed"
              step.owner = "copywriter"
              step.summary = "Copywriter specialist failed"
              step.blockers = [message]
              step.completedAt = nowIso()
              publishPipelinePlanUpdate(store, eventBus, threadId, failedPlan, {
                action: "specialist_failed",
                stepId: "copywriting",
              })
            }
          }
          throw error
        }
      },
    }),

    defineTool({
      name: "create_script_draft",
      label: "Create Script Draft",
      description:
        "Legacy compatibility path for persisting an externally produced script draft. New-video orchestration must use run_copywriter_specialist.",
      parameters: Type.Object({ script: ScriptDraftSchema }),
      async execute(_id, params) {
        const script = params.script as ScriptDraft
        const catalogErrors = validateScriptDraftCatalog(script)
        if (catalogErrors.length > 0) return rejectedScriptDraftResult(threadId, eventBus, catalogErrors)
        const artifact = writeJsonArtifact(
          store,
          threadId,
          "script",
          nextDraftFileName(store, threadId, "script"),
          script,
        )
        const markdown = writeTextArtifact(
          store,
          threadId,
          "script_markdown",
          nextDraftFileName(store, threadId, "script_markdown", "md"),
          scriptToMarkdown(script),
        )
        eventBus.publish({
          threadId,
          type: "artifact_updated",
          payload: { kind: "script", artifact, markdownPath: markdown.path },
        })
        return textResult("Script draft saved.", { artifact, markdownPath: markdown.path })
      },
    }),

    defineTool({
      name: "run_scene_composer_specialist",
      label: "Run Declarative Scene Composer",
      description:
        "Resolve flagged visual needs through registered reuse, bounded composed-scene JSON, or an explicit reusable capability gap.",
      parameters: Type.Object({ scriptArtifactId: Type.Optional(Type.String()) }),
      async execute(_id, params, signal) {
        if (!runSceneComposerSpecialist) throw new Error("Scene composer specialist is not configured")
        const source = params.scriptArtifactId
          ? store.getArtifact<ScriptDraft>(params.scriptArtifactId)
          : latestArtifact<ScriptDraft>(store, threadId, "script")
        if (!source || source.kind !== "script") throw new Error("Scene composer requires a script artifact")
        const targetSceneIds = source.data.scenes
          .filter((scene) => (scene.missingCapabilities?.length ?? 0) > 0)
          .map((scene) => scene.id)
        const plan = store.getPipelinePlan(threadId)
        const step = plan?.steps.find((candidate) => candidate.id === "scene_creation")
        if (targetSceneIds.length === 0) {
          if (plan && step) {
            step.status = "skipped"
            step.summary = "No unresolved visual capabilities"
            step.completedAt = nowIso()
            publishPipelinePlanUpdate(store, eventBus, threadId, plan, {
              action: "specialist_skipped",
              stepId: "scene_creation",
            })
          }
          return textResult("No scenes require composition.", { skipped: true, artifact: source })
        }
        if (plan && step) {
          step.status = "in_progress"
          step.owner = "scene_creator"
          step.summary = "Resolving visual needs without executable code"
          step.startedAt ??= nowIso()
          publishPipelinePlanUpdate(store, eventBus, threadId, plan, {
            action: "specialist_started",
            stepId: "scene_creation",
          })
        }
        const tutorialCatalog = loadSceneCatalog().scenes?.tutorial ?? { builtin: [], custom: [] }
        const registeredComponentIds = (tutorialCatalog.custom ?? [])
          .map((entry) => entry.componentId)
          .filter((id): id is string => typeof id === "string")
        const result = await runSceneComposerSpecialist(
          {
            script: source.data,
            targetSceneIds,
            catalog: tutorialCatalog as unknown as Record<string, unknown>,
            registeredComponentIds,
          },
          signal,
        )
        const revised = JSON.parse(JSON.stringify(source.data)) as ScriptDraft
        for (const resolution of result.result.resolutions) {
          const scene = revised.scenes.find((candidate) => candidate.id === resolution.sceneId)!
          if (resolution.outcome === "composed") {
            scene.type = "custom"
            scene.visualType = "custom"
            scene.componentId = "composed-scene"
            scene.propsPlan = resolution.spec
            scene.visualRationale = resolution.rationale
            scene.missingCapabilities = []
          } else if (resolution.outcome === "reuse") {
            scene.type = "custom"
            scene.visualType = "custom"
            scene.componentId = resolution.componentId
            scene.propsPlan = resolution.propsPlan
            scene.visualRationale = resolution.rationale
            scene.missingCapabilities = []
          }
        }
        assertValidScriptDraftCatalog(revised)
        const compositionArtifact = writeJsonArtifact(
          store,
          threadId,
          "scene_composition",
          "scene-composition.json",
          result.result,
        )
        const scriptArtifact = writeJsonArtifact(
          store,
          threadId,
          "script",
          nextDraftFileName(store, threadId, "script"),
          revised,
        )
        const markdown = writeTextArtifact(
          store,
          threadId,
          "script_markdown",
          nextDraftFileName(store, threadId, "script_markdown", "md"),
          scriptToMarkdown(revised),
        )
        const gaps = result.result.resolutions.filter((resolution) => resolution.outcome === "capability_gap")
        const updated = store.getPipelinePlan(threadId)
        const updatedStep = updated?.steps.find((candidate) => candidate.id === "scene_creation")
        if (updated && updatedStep) {
          updatedStep.status = gaps.length > 0 ? "blocked" : "completed"
          updatedStep.summary =
            gaps.length > 0
              ? "Reusable capability proposal requires CP4"
              : "Visual needs resolved without new executable code"
          updatedStep.modelRoute = result.modelRoute
          updatedStep.artifactPaths = [compositionArtifact.path!, scriptArtifact.path!]
          updatedStep.blockers = gaps.map((resolution) => resolution.gap.capability)
          updatedStep.completedAt = nowIso()
          publishPipelinePlanUpdate(store, eventBus, threadId, updated, {
            action: "specialist_completed",
            stepId: "scene_creation",
            runId: result.runId,
          })
        }
        eventBus.publish({
          threadId,
          type: "artifact_updated",
          payload: { kind: "scene_composition", compositionArtifact, scriptArtifact, markdownPath: markdown.path },
        })
        const checkpointArtifact = gaps.length > 0 ? compositionArtifact : scriptArtifact
        const checkpointType = gaps.length > 0 ? ("capability_gap_checkpoint" as const) : ("script_checkpoint" as const)
        const checkpoint = {
          id: randomUUID(),
          type: checkpointType,
          artifactId: checkpointArtifact.id,
          payload:
            checkpointType === "capability_gap_checkpoint"
              ? createCheckpointPayload(checkpointType, compositionArtifact)
              : createCheckpointPayload(checkpointType, scriptArtifact),
        }
        store.setCheckpoint(threadId, checkpoint)
        eventBus.publish({ threadId, type: "checkpoint", payload: checkpoint })
        return textResult(
          gaps.length > 0
            ? "Scene composition found reusable capability gaps and presented CP4. Stop."
            : "Scene composition completed and presented the resolved script at CP1. Stop.",
          {
            runId: result.runId,
            modelRoute: result.modelRoute,
            compositionArtifact,
            artifact: scriptArtifact,
            script: revised,
            gaps,
            checkpoint,
          },
          true,
        )
      },
    }),

    defineTool({
      name: "present_capability_gap_checkpoint",
      label: "Present Capability Gap Checkpoint",
      description: "Present a reusable capability proposal before any executable scene code may be generated.",
      parameters: Type.Object({ artifactId: Type.Optional(Type.String()) }),
      async execute(_id, params) {
        const artifact = params.artifactId
          ? store.getArtifact<SceneCompositionResult>(params.artifactId)
          : latestArtifact<SceneCompositionResult>(store, threadId, "scene_composition")
        if (!artifact || artifact.kind !== "scene_composition") throw new Error("Scene composition artifact not found")
        if (!artifact.data.resolutions.some((resolution) => resolution.outcome === "capability_gap")) {
          throw new Error("Scene composition has no capability gap to approve")
        }
        const payload = createCheckpointPayload("capability_gap_checkpoint", artifact)
        const checkpoint = {
          id: randomUUID(),
          type: "capability_gap_checkpoint" as const,
          artifactId: artifact.id,
          payload,
        }
        store.setCheckpoint(threadId, checkpoint)
        eventBus.publish({ threadId, type: "checkpoint", payload: checkpoint })
        return textResult("Capability proposal presented. Stop before generating executable code.", checkpoint, true)
      },
    }),

    defineTool({
      name: "present_script_checkpoint",
      label: "Present Script Checkpoint",
      description: "Present the editable script checkpoint to the human and pause the run.",
      parameters: Type.Object({ artifactId: Type.Optional(Type.String()), script: Type.Optional(ScriptDraftSchema) }),
      async execute(_id, params) {
        let artifact = params.artifactId
          ? store.getArtifact<ScriptDraft>(params.artifactId)
          : latestArtifact<ScriptDraft>(store, threadId, "script")
        if (!artifact && params.script) {
          const catalogErrors = validateScriptDraftCatalog(params.script as ScriptDraft)
          if (catalogErrors.length > 0) return rejectedScriptDraftResult(threadId, eventBus, catalogErrors)
          artifact = writeJsonArtifact(
            store,
            threadId,
            "script",
            nextDraftFileName(store, threadId, "script"),
            params.script as ScriptDraft,
          )
        }
        if (!artifact)
          throw new Error("present_script_checkpoint requires an existing script artifact or inline script")
        const unresolvedSceneIds = artifact.data.scenes
          .filter((scene) => (scene.missingCapabilities?.length ?? 0) > 0)
          .map((scene) => scene.id)
        if (unresolvedSceneIds.length > 0) {
          throw new Error(
            `Script has unresolved visual capabilities in scenes ${unresolvedSceneIds.join(", ")}. Run run_scene_composer_specialist with this artifact before CP1.`,
          )
        }
        const plan = store.getPipelinePlan(threadId)
        const sceneCreation = plan?.steps.find((step) => step.id === "scene_creation")
        if (plan && sceneCreation?.status === "pending") {
          sceneCreation.status = "skipped"
          sceneCreation.summary = "No unresolved visual capabilities"
          sceneCreation.completedAt = nowIso()
          publishPipelinePlanUpdate(store, eventBus, threadId, plan, {
            action: "specialist_skipped",
            stepId: "scene_creation",
          })
        }
        const payload = createCheckpointPayload("script_checkpoint", artifact)
        const checkpoint = { id: randomUUID(), type: "script_checkpoint" as const, artifactId: artifact.id, payload }
        store.setCheckpoint(threadId, checkpoint)
        eventBus.publish({ threadId, type: "checkpoint", payload: checkpoint })
        return textResult(
          "Script checkpoint presented. Stop and wait for the user's approval or requested changes.",
          checkpoint,
          true,
        )
      },
    }),

    defineTool({
      name: "save_script_artifact",
      label: "Save Script Artifact",
      description: "Save the approved script artifact and human-readable Markdown export.",
      parameters: Type.Object({ script: ScriptDraftSchema, approved: Type.Optional(Type.Boolean()) }),
      async execute(_id, params) {
        const script = params.script as ScriptDraft
        assertValidScriptDraftCatalog(script)
        const approved = params.approved ?? true
        const artifact = writeJsonArtifact(
          store,
          threadId,
          "script",
          nextDraftFileName(store, threadId, "script"),
          script,
          approved,
        )
        const markdown = writeTextArtifact(
          store,
          threadId,
          "script_markdown",
          nextDraftFileName(store, threadId, "script_markdown", "md"),
          scriptToMarkdown(script),
          approved,
        )
        eventBus.publish({
          threadId,
          type: "artifact_updated",
          payload: { kind: "script", artifact, markdownPath: markdown.path, approved },
        })
        return textResult("Approved script saved.", { artifact, markdownPath: markdown.path })
      },
    }),

    defineTool({
      name: "run_direction_specialist",
      label: "Run Direction Specialist",
      description:
        "Run an isolated Pi director against the latest approved script and exact scene catalog, then persist its structured direction draft.",
      promptSnippet: "Delegate approved-script technical direction to the isolated Pi director before CP2.",
      parameters: Type.Object({
        scriptArtifactId: Type.Optional(Type.String()),
        previousDirectionArtifactId: Type.Optional(Type.String()),
        feedback: Type.Optional(Type.String()),
      }),
      async execute(_id, params, signal) {
        if (!runDirectionSpecialist) throw new Error("Direction specialist is not configured")
        const scriptArtifact = params.scriptArtifactId
          ? store.getArtifact<ScriptDraft>(params.scriptArtifactId)
          : (latestArtifact<ScriptDraft>(store, threadId, "script", true) ??
            latestArtifact<ScriptDraft>(store, threadId, "script"))
        if (!scriptArtifact || scriptArtifact.kind !== "script") {
          throw new Error("run_direction_specialist requires an approved script artifact")
        }

        const plan = store.getPipelinePlan(threadId)
        if (plan) {
          const step = plan.steps.find((candidate) => candidate.id === "direction")
          if (step) {
            step.status = "in_progress"
            step.owner = "director"
            step.summary = "Isolated Pi director is reviewing the approved script"
            step.startedAt ??= nowIso()
            publishPipelinePlanUpdate(store, eventBus, threadId, plan, {
              action: "specialist_started",
              stepId: "direction",
            })
          }
        }

        try {
          const previousDirectionArtifact = params.previousDirectionArtifactId
            ? store.getArtifact<DirectionDraft>(params.previousDirectionArtifactId)
            : params.feedback
              ? latestArtifact<DirectionDraft>(store, threadId, "direction")
              : undefined
          if (previousDirectionArtifact && previousDirectionArtifact.kind !== "direction") {
            throw new Error("previousDirectionArtifactId must reference a direction artifact")
          }

          const result = await runDirectionSpecialist(
            scriptArtifact.data,
            {
              feedback: params.feedback,
              previousDirection: previousDirectionArtifact?.data,
            },
            signal,
          )
          const artifact = writeJsonArtifact(
            store,
            threadId,
            "direction",
            nextDraftFileName(store, threadId, "direction"),
            result.direction,
          )
          eventBus.publish({ threadId, type: "artifact_updated", payload: { kind: "direction", artifact } })

          const updatedPlan = store.getPipelinePlan(threadId)
          if (updatedPlan) {
            const step = updatedPlan.steps.find((candidate) => candidate.id === "direction")
            if (step) {
              step.status = "in_progress"
              step.owner = "director"
              step.summary = "Direction draft ready for CP2 human review"
              step.modelRoute = result.modelRoute
              step.artifactPaths = [...new Set([...step.artifactPaths, artifact.path].filter(Boolean) as string[])]
              publishPipelinePlanUpdate(store, eventBus, threadId, updatedPlan, {
                action: "specialist_completed",
                stepId: "direction",
                runId: result.runId,
              })
            }
          }
          return textResult("Direction specialist completed. Present its artifact for CP2 review.", {
            runId: result.runId,
            modelRoute: result.modelRoute,
            artifact,
            direction: result.direction,
          })
        } catch (error) {
          const failedPlan = store.getPipelinePlan(threadId)
          if (failedPlan) {
            const step = failedPlan.steps.find((candidate) => candidate.id === "direction")
            if (step) {
              const message = error instanceof Error ? error.message : String(error)
              step.status = signal?.aborted ? "blocked" : "failed"
              step.owner = "director"
              step.summary = "Direction specialist failed"
              step.blockers = [message]
              step.completedAt = nowIso()
              publishPipelinePlanUpdate(store, eventBus, threadId, failedPlan, {
                action: "specialist_failed",
                stepId: "direction",
              })
            }
          }
          throw error
        }
      },
    }),

    defineTool({
      name: "create_direction_draft",
      label: "Create Direction Draft",
      description:
        "Legacy compatibility path for persisting externally produced direction. New-video orchestration must use run_direction_specialist.",
      parameters: Type.Object({ direction: DirectionDraftSchema }),
      async execute(_id, params) {
        const direction = params.direction as DirectionDraft
        const artifact = writeJsonArtifact(
          store,
          threadId,
          "direction",
          nextDraftFileName(store, threadId, "direction"),
          direction,
        )
        eventBus.publish({ threadId, type: "artifact_updated", payload: { kind: "direction", artifact } })
        return textResult("Direction draft saved.", { artifact })
      },
    }),

    defineTool({
      name: "present_direction_checkpoint",
      label: "Present Direction Checkpoint",
      description: "Present technical direction for review and pause the run.",
      parameters: Type.Object({
        artifactId: Type.Optional(Type.String()),
        direction: Type.Optional(DirectionDraftSchema),
      }),
      async execute(_id, params) {
        let artifact = params.artifactId ? store.getArtifact<DirectionDraft>(params.artifactId) : null
        if (!artifact && params.direction) {
          artifact = writeJsonArtifact(
            store,
            threadId,
            "direction",
            nextDraftFileName(store, threadId, "direction"),
            params.direction as DirectionDraft,
          )
        }
        if (!artifact) throw new Error("present_direction_checkpoint requires artifactId or direction")
        const payload = createCheckpointPayload("direction_checkpoint", artifact)
        const checkpoint = { id: randomUUID(), type: "direction_checkpoint" as const, artifactId: artifact.id, payload }
        store.setCheckpoint(threadId, checkpoint)
        eventBus.publish({ threadId, type: "checkpoint", payload: checkpoint })
        return textResult("Direction checkpoint presented. Stop and wait for approval or critique.", checkpoint, true)
      },
    }),

    defineTool({
      name: "save_direction_artifact",
      label: "Save Direction Artifact",
      description: "Save the approved technical direction artifact.",
      parameters: Type.Object({ direction: DirectionDraftSchema, approved: Type.Optional(Type.Boolean()) }),
      async execute(_id, params) {
        const approved = params.approved ?? true
        const artifact = writeJsonArtifact(
          store,
          threadId,
          "direction",
          nextDraftFileName(store, threadId, "direction"),
          params.direction as DirectionDraft,
          approved,
        )
        eventBus.publish({ threadId, type: "artifact_updated", payload: { kind: "direction", artifact, approved } })
        return textResult("Approved direction saved.", { artifact })
      },
    }),

    defineTool({
      name: "run_audio_planner_specialist",
      label: "Run Audio Planner Specialist",
      description:
        "Run an isolated topic-neutral Pi audio planner against approved script/direction artifacts and the actual local audio library.",
      promptSnippet: "Delegate voice/music planning to the isolated Pi audio planner before CP3.",
      parameters: Type.Object({
        scriptArtifactId: Type.Optional(Type.String()),
        directionArtifactId: Type.Optional(Type.String()),
        previousAudioChartArtifactId: Type.Optional(Type.String()),
        feedback: Type.Optional(Type.String()),
        preferences: Type.Optional(
          Type.Object({
            language: Type.Optional(Type.String()),
            voiceover: Type.Optional(
              Type.Union([Type.Literal("required"), Type.Literal("optional"), Type.Literal("none")]),
            ),
            soundDesign: Type.Optional(
              Type.Union([Type.Literal("required"), Type.Literal("optional"), Type.Literal("none")]),
            ),
            notes: Type.Optional(Type.Array(Type.String())),
          }),
        ),
      }),
      async execute(_id, params, signal) {
        if (!runAudioPlannerSpecialist) throw new Error("Audio planner specialist is not configured")
        const scriptArtifact = params.scriptArtifactId
          ? store.getArtifact<ScriptDraft>(params.scriptArtifactId)
          : latestArtifact<ScriptDraft>(store, threadId, "script", true)
        const directionArtifact = params.directionArtifactId
          ? store.getArtifact<DirectionDraft>(params.directionArtifactId)
          : latestArtifact<DirectionDraft>(store, threadId, "direction", true)
        if (!scriptArtifact || scriptArtifact.kind !== "script") {
          throw new Error("run_audio_planner_specialist requires an approved script artifact")
        }
        if (!directionArtifact || directionArtifact.kind !== "direction") {
          throw new Error("run_audio_planner_specialist requires an approved direction artifact")
        }

        const plan = store.getPipelinePlan(threadId)
        if (plan) {
          const step = plan.steps.find((candidate) => candidate.id === "audio_plan")
          if (step) {
            step.status = "in_progress"
            step.owner = "audio_planner"
            step.summary = params.feedback
              ? "Isolated Pi audio planner is revising the audio chart"
              : "Isolated Pi audio planner is planning voice and sound"
            step.startedAt ??= nowIso()
            publishPipelinePlanUpdate(store, eventBus, threadId, plan, {
              action: "specialist_started",
              stepId: "audio_plan",
            })
          }
        }

        try {
          const previousArtifact = params.previousAudioChartArtifactId
            ? store.getArtifact<AudioChart>(params.previousAudioChartArtifactId)
            : params.feedback
              ? latestArtifact<AudioChart>(store, threadId, "audio_chart")
              : undefined
          if (previousArtifact && previousArtifact.kind !== "audio_chart") {
            throw new Error("previousAudioChartArtifactId must reference an audio_chart artifact")
          }
          const result = await runAudioPlannerSpecialist(
            scriptArtifact.data,
            directionArtifact.data,
            params.preferences ?? {},
            { feedback: params.feedback, previousChart: previousArtifact?.data },
            signal,
          )
          validateAudioChart(result.chart, scriptArtifact.data.scenes.length, listAudioLibrary())
          const artifact = writeJsonArtifact(store, threadId, "audio_chart", "audio-chart.json", result.chart)
          eventBus.publish({ threadId, type: "artifact_updated", payload: { kind: "audio_chart", artifact } })

          const updatedPlan = store.getPipelinePlan(threadId)
          if (updatedPlan) {
            const step = updatedPlan.steps.find((candidate) => candidate.id === "audio_plan")
            if (step) {
              step.status = "in_progress"
              step.owner = "audio_planner"
              step.summary = "Audio chart ready for CP3 human review"
              step.modelRoute = result.modelRoute
              step.artifactPaths = [...new Set([...step.artifactPaths, artifact.path].filter(Boolean) as string[])]
              publishPipelinePlanUpdate(store, eventBus, threadId, updatedPlan, {
                action: "specialist_completed",
                stepId: "audio_plan",
                runId: result.runId,
              })
            }
          }
          return textResult("Audio planner completed. Present its artifact for CP3 review.", {
            runId: result.runId,
            modelRoute: result.modelRoute,
            artifact,
            chart: result.chart,
          })
        } catch (error) {
          const failedPlan = store.getPipelinePlan(threadId)
          if (failedPlan) {
            const step = failedPlan.steps.find((candidate) => candidate.id === "audio_plan")
            if (step) {
              const message = error instanceof Error ? error.message : String(error)
              step.status = signal?.aborted ? "blocked" : "failed"
              step.owner = "audio_planner"
              step.summary = "Audio planner specialist failed"
              step.blockers = [message]
              step.completedAt = nowIso()
              publishPipelinePlanUpdate(store, eventBus, threadId, failedPlan, {
                action: "specialist_failed",
                stepId: "audio_plan",
              })
            }
          }
          throw error
        }
      },
    }),

    defineTool({
      name: "present_audio_chart_checkpoint",
      label: "Present Audio Chart Checkpoint",
      description: "Present the validated audio chart for CP3 human review and pause the run.",
      parameters: Type.Object({
        artifactId: Type.Optional(Type.String()),
        chart: Type.Optional(Type.Record(Type.String(), Type.Any())),
      }),
      async execute(_id, params) {
        let artifact = params.artifactId ? store.getArtifact<AudioChart>(params.artifactId) : null
        if (!artifact && params.chart) {
          const chart = params.chart as unknown as AudioChart
          const scriptArtifact = latestArtifact<ScriptDraft>(store, threadId, "script", true)
          if (!scriptArtifact) throw new Error("Audio checkpoint requires an approved script")
          validateAudioChart(chart, scriptArtifact.data.scenes.length, listAudioLibrary())
          artifact = writeJsonArtifact(store, threadId, "audio_chart", "audio-chart.json", chart)
        }
        if (!artifact || artifact.kind !== "audio_chart") {
          throw new Error("present_audio_chart_checkpoint requires an audio chart artifactId or chart")
        }
        const payload = createCheckpointPayload("audio_chart_checkpoint", artifact)
        const checkpoint = {
          id: randomUUID(),
          type: "audio_chart_checkpoint" as const,
          artifactId: artifact.id,
          payload,
        }
        store.setCheckpoint(threadId, checkpoint)
        eventBus.publish({ threadId, type: "checkpoint", payload: checkpoint })
        return textResult("Audio chart checkpoint presented. Stop and wait for approval or critique.", checkpoint, true)
      },
    }),

    defineTool({
      name: "run_config_specialist",
      label: "Run Config Specialist",
      description: "Compile approved creative artifacts into a target-contract-valid config in an isolated session.",
      parameters: Type.Object({}),
      async execute(_id, _params, signal) {
        if (!runConfigSpecialist) throw new Error("Config specialist is not configured")
        const productionBrief = latestArtifact<ProductionBriefArtifact>(store, threadId, "production_brief", true)
        const selectedTarget = latestArtifact<SelectedTargetArtifact>(store, threadId, "selected_target", true)
        const script = latestArtifact<ScriptDraft>(store, threadId, "script", true)
        const direction = latestArtifact<DirectionDraft>(store, threadId, "direction", true)
        const audioChart = latestArtifact<AudioChart>(store, threadId, "audio_chart", true)
        const previousConfig = latestArtifact<Record<string, unknown>>(store, threadId, "config")
        const previousLineage = latestArtifact<{
          configArtifactId: string
          configVersion: number
          configHash: string
          lineage: ConfigLineageMetadata
        }>(store, threadId, "config_lineage")
        if (!productionBrief || !selectedTarget || !script || !direction) {
          throw new Error(
            "Config specialist requires approved production brief, selected target, script, and direction artifacts",
          )
        }
        if (!isSelectedTargetArtifactForBrief(selectedTarget.data, productionBrief)) {
          throw new Error("Selected target is stale or does not belong to the approved production brief")
        }
        const targetResolution = summarizeSelectedRegisteredTarget({ target: { id: selectedTarget.data.target.id } })
        if (!targetResolution.ok) throw new Error("Selected target no longer resolves in the parent registry")
        if (
          previousConfig &&
          (!previousLineage ||
            previousLineage.data.configArtifactId !== previousConfig.id ||
            previousLineage.data.configVersion !== previousConfig.version)
        ) {
          throw new Error("Previous config is missing matching parent-owned lineage")
        }
        const result = await runConfigSpecialist(
          {
            productionBrief: {
              artifactId: productionBrief.id,
              version: productionBrief.version,
              approved: true,
              data: productionBrief.data,
            },
            target: targetResolution.target,
            script: { artifactId: script.id, version: script.version, approved: true, data: script.data },
            direction: { artifactId: direction.id, version: direction.version, approved: true, data: direction.data },
            ...(audioChart
              ? {
                  audio: {
                    artifactId: audioChart.id,
                    version: audioChart.version,
                    approved: true as const,
                    data: audioChart.data,
                  },
                }
              : {}),
            previousConfig:
              previousConfig && previousLineage
                ? {
                    artifactId: previousConfig.id,
                    version: previousConfig.version,
                    latestVersion: previousConfig.version,
                    data: previousConfig.data,
                    contentHash: configContentHash(previousConfig.data),
                    lineage: previousLineage.data.lineage,
                  }
                : null,
          },
          signal,
        )
        const config = result.config
        const artifact = writeJsonArtifact(store, threadId, "config", "config.json", config)
        const lineageArtifact = writeJsonArtifact(store, threadId, "config_lineage", "config-lineage.json", {
          configArtifactId: artifact.id,
          configVersion: artifact.version,
          configHash: result.configHash,
          lineage: result.lineage,
        })
        const plan = store.getPipelinePlan(threadId)
        const step = plan?.steps.find((candidate) => candidate.id === "config_generation")
        if (plan && step) {
          step.status = "completed"
          step.summary = audioChart
            ? "Final config includes approved audio"
            : "Draft config compiled from approved creative artifacts"
          step.artifactPaths = [artifact.path!]
          step.modelRoute = result.modelRoute
          step.completedAt = nowIso()
          publishPipelinePlanUpdate(store, eventBus, threadId, plan, {
            action: "config_generated",
            stepId: "config_generation",
          })
        }
        eventBus.publish({
          threadId,
          type: "artifact_updated",
          payload: { kind: "config", artifact, lineageArtifact, runId: result.runId },
        })
        return textResult("Config specialist completed.", {
          artifact,
          lineageArtifact,
          runId: result.runId,
          modelRoute: result.modelRoute,
        })
      },
    }),

    defineTool({
      name: "generate_remotion_config",
      label: "Generate Remotion Config",
      description: "Persist an exact ClaudeCodeTutorial config.json draft with safe defaults before validation/render.",
      parameters: Type.Object({ config: Type.Record(Type.String(), Type.Any()) }),
      async execute(_id, params) {
        const inputConfig = params.config as Record<string, unknown>
        const approvedAudio = latestArtifact<AudioChart>(store, threadId, "audio_chart", true)
        const config = withTutorialDefaults(
          approvedAudio
            ? {
                ...inputConfig,
                voiceover: approvedAudio.data.voiceover ?? undefined,
                soundDesign: approvedAudio.data.soundDesign,
              }
            : inputConfig,
        )
        const artifact = writeJsonArtifact(store, threadId, "config", "config.json", config)
        const plan = store.getPipelinePlan(threadId)
        const step = plan?.steps.find((candidate) => candidate.id === "config_generation")
        if (plan && step) {
          step.status = "completed"
          step.summary = approvedAudio
            ? "Final config includes approved audio"
            : "Draft config compiled from approved creative artifacts"
          step.artifactPaths = [artifact.path!]
          step.completedAt = nowIso()
          publishPipelinePlanUpdate(store, eventBus, threadId, plan, {
            action: "config_generated",
            stepId: "config_generation",
          })
        }
        eventBus.publish({ threadId, type: "artifact_updated", payload: { kind: "config", artifact } })
        return textResult("Remotion config generated.", { artifact, config })
      },
    }),

    defineTool({
      name: "run_scene_qa_specialist",
      label: "Run Scene QA Specialist",
      description: "Render representative stills and run an isolated topic-neutral multimodal visual review.",
      parameters: Type.Object({}),
      async execute(_id, _params, signal) {
        if (!runSceneQaSpecialist) throw new Error("Scene QA specialist is not configured")
        const config = latestArtifact<Record<string, unknown>>(store, threadId, "config")
        const script = latestArtifact<ScriptDraft>(store, threadId, "script", true)
        const direction = latestArtifact<DirectionDraft>(store, threadId, "direction", true)
        const audioChart = latestArtifact<AudioChart>(store, threadId, "audio_chart", true)
        if (!config || !script || !direction)
          throw new Error("Scene QA requires config plus approved script and direction")
        const plan = store.getPipelinePlan(threadId)
        const step = plan?.steps.find((candidate) => candidate.id === "scene_qa")
        if (plan && step) {
          step.status = "in_progress"
          step.owner = "scene_qa"
          step.summary = "Rendering and reviewing scene stills"
          step.startedAt ??= nowIso()
          publishPipelinePlanUpdate(store, eventBus, threadId, plan, {
            action: "specialist_started",
            stepId: "scene_qa",
          })
        }
        try {
          const result = await runSceneQaSpecialist(
            { config: config.data, script: script.data, direction: direction.data, audioChart: audioChart?.data },
            signal,
          )
          const artifact = writeJsonArtifact(store, threadId, "qa_report", "qa-report.json", result.report)
          const needsReview = result.report.scenes.some((scene) => scene.verdict !== "PASS")
          const updated = store.getPipelinePlan(threadId)
          const updatedStep = updated?.steps.find((candidate) => candidate.id === "scene_qa")
          if (updated && updatedStep) {
            updatedStep.status = needsReview ? "blocked" : "completed"
            updatedStep.summary = needsReview
              ? "Scene QA findings require human review"
              : "All rendered scenes passed visual QA"
            updatedStep.modelRoute = result.modelRoute
            updatedStep.artifactPaths = [artifact.path!]
            updatedStep.completedAt = nowIso()
            publishPipelinePlanUpdate(store, eventBus, threadId, updated, {
              action: "specialist_completed",
              stepId: "scene_qa",
              runId: result.runId,
            })
          }
          eventBus.publish({ threadId, type: "artifact_updated", payload: { kind: "qa_report", artifact } })
          return textResult(needsReview ? "Scene QA requires a human checkpoint." : "All scenes passed visual QA.", {
            artifact,
            report: result.report,
            needsReview,
          })
        } catch (error) {
          const failed = store.getPipelinePlan(threadId)
          const failedStep = failed?.steps.find((candidate) => candidate.id === "scene_qa")
          if (failed && failedStep) {
            failedStep.status = "failed"
            failedStep.summary = error instanceof Error ? error.message : String(error)
            failedStep.completedAt = nowIso()
            publishPipelinePlanUpdate(store, eventBus, threadId, failed, {
              action: "specialist_failed",
              stepId: "scene_qa",
            })
          }
          throw error
        }
      },
    }),

    defineTool({
      name: "present_qa_report_checkpoint",
      label: "Present QA Report Checkpoint",
      description: "Present image-grounded Scene QA findings for human decision without applying changes.",
      parameters: Type.Object({ artifactId: Type.Optional(Type.String()) }),
      async execute(_id, params) {
        const artifact = params.artifactId
          ? store.getArtifact<SceneQaReport>(params.artifactId)
          : latestArtifact<SceneQaReport>(store, threadId, "qa_report")
        if (!artifact || artifact.kind !== "qa_report") throw new Error("QA report artifact not found")
        const payload = createCheckpointPayload("qa_report_checkpoint", artifact)
        const checkpoint = { id: randomUUID(), type: "qa_report_checkpoint" as const, artifactId: artifact.id, payload }
        store.setCheckpoint(threadId, checkpoint)
        eventBus.publish({ threadId, type: "checkpoint", payload: checkpoint })
        return textResult("QA report presented. Stop and wait for a human decision.", checkpoint, true)
      },
    }),

    defineTool({
      name: "produce_approved_audio_assets",
      label: "Produce Approved Audio Assets",
      description: "Materialize the CP3-approved voiceover and local music assets without making creative changes.",
      parameters: Type.Object({}),
      async execute() {
        if (!produceAudioAssets) throw new Error("Audio asset production is not configured")
        const configArtifact = latestArtifact<Record<string, unknown>>(store, threadId, "config")
        const chartArtifact = latestArtifact<AudioChart>(store, threadId, "audio_chart", true)
        const scriptArtifact = latestArtifact<ScriptDraft>(store, threadId, "script", true)
        if (!configArtifact || !chartArtifact || !scriptArtifact) {
          throw new Error("Audio production requires config plus approved script and CP3 audio chart artifacts")
        }
        const updateStep = (
          stepId: "voice_generation" | "sound_assets",
          status: PipelineStep["status"],
          summary: string,
          paths: string[] = [],
        ) => {
          const plan = store.getPipelinePlan(threadId)
          const step = plan?.steps.find((candidate) => candidate.id === stepId)
          if (plan && step) {
            step.status = status
            step.summary = summary
            step.owner = stepId === "voice_generation" ? "voice_generator" : "sound_engineer"
            step.artifactPaths = [...new Set([...step.artifactPaths, ...paths])]
            if (status === "completed" || status === "skipped" || status === "failed") step.completedAt = nowIso()
            else step.startedAt ??= nowIso()
            publishPipelinePlanUpdate(store, eventBus, threadId, plan, { action: "audio_production", stepId })
          }
        }
        updateStep("voice_generation", "in_progress", "Materializing approved voiceover")
        updateStep("sound_assets", "in_progress", "Materializing approved local sound assets")
        try {
          const manifest = await produceAudioAssets({
            config: configArtifact.data,
            configPath: configArtifact.path!,
            chart: chartArtifact.data,
            sceneCount: scriptArtifact.data.scenes.length,
          })
          const artifact = writeJsonArtifact(store, threadId, "audio_assets", "audio-assets.json", manifest)
          const voicePaths = manifest.assets.filter((item) => item.kind === "voiceover").map((item) => item.path)
          const soundPaths = manifest.assets.filter((item) => item.kind === "music").map((item) => item.path)
          updateStep("voice_generation", manifest.voiceStatus, `Voice production ${manifest.voiceStatus}`, [
            artifact.path!,
            ...voicePaths,
          ])
          updateStep("sound_assets", manifest.soundStatus, `Sound production ${manifest.soundStatus}`, [
            artifact.path!,
            ...soundPaths,
          ])
          eventBus.publish({ threadId, type: "artifact_updated", payload: { kind: "audio_assets", artifact } })
          return textResult("Approved audio assets produced and verified.", { artifact, manifest })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          updateStep("voice_generation", "failed", message)
          updateStep("sound_assets", "failed", message)
          throw error
        }
      },
    }),

    defineTool({
      name: "validate_video_config",
      label: "Validate Video Config",
      description: "Validate a config object or saved config artifact against the render-service Zod endpoint.",
      parameters: Type.Object({ config: Type.Optional(Type.Any()), artifactId: Type.Optional(Type.String()) }),
      async execute(_id, params, signal) {
        const config = configFromInput(store, threadId, params.config, params.artifactId)
        const { status, body } = await fetchJson(`${renderServiceUrl}/api/validate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config),
          signal,
        })
        const valid =
          status >= 200 &&
          status < 300 &&
          typeof body === "object" &&
          body !== null &&
          (body as { valid?: unknown }).valid === true
        const plan = store.getPipelinePlan(threadId)
        const step = plan?.steps.find((candidate) => candidate.id === "final_validation")
        if (plan && step) {
          step.status = valid ? "completed" : "failed"
          step.summary = valid ? "Final config and assets validated" : "Final validation failed"
          step.blockers = valid ? [] : [JSON.stringify(body).slice(0, 1000)]
          step.completedAt = nowIso()
          publishPipelinePlanUpdate(store, eventBus, threadId, plan, {
            action: "validation_completed",
            stepId: "final_validation",
            valid,
          })
        }
        return textResult(valid ? "Config is valid." : "Config validation failed.", { valid, status, result: body })
      },
    }),

    defineTool({
      name: "submit_render",
      label: "Submit Render",
      description:
        "Submit a validated config object or config artifact to the render-service. V1 skips audio generation unless CLAQUETA_PI_ALLOW_AUDIO_GENERATION=true.",
      parameters: Type.Object({
        config: Type.Optional(Type.Any()),
        artifactId: Type.Optional(Type.String()),
        skipAudioGeneration: Type.Optional(Type.Boolean()),
        waitForCompletion: Type.Optional(Type.Boolean()),
        timeoutMs: Type.Optional(Type.Number()),
      }),
      async execute(_id, params, signal, onUpdate) {
        const allowAudioGeneration = process.env.CLAQUETA_PI_ALLOW_AUDIO_GENERATION === "true"
        const skipAudioGeneration = allowAudioGeneration ? (params.skipAudioGeneration ?? true) : true
        const config = {
          ...configFromInput(store, threadId, params.config, params.artifactId),
          _threadId: threadId,
          _skipAudioGeneration: skipAudioGeneration,
        }
        const { status, body } = await fetchJson(`${renderServiceUrl}/api/render`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config),
          signal,
        })
        if (status < 200 || status >= 300 || typeof body !== "object" || body === null || !("jobId" in body)) {
          throw new Error(`Render submission failed (${status}): ${JSON.stringify(body)}`)
        }
        const jobId = String((body as { jobId: unknown }).jobId)
        const artifact = store.saveArtifact({ threadId, kind: "render_job", data: { jobId, status: "submitted" } })
        eventBus.publish({
          threadId,
          type: "render_status",
          payload: { jobId, status: "submitted", artifactId: artifact.id },
        })

        const allowAsyncRender = process.env.CLAQUETA_PI_ALLOW_ASYNC_RENDER === "true"
        if (allowAsyncRender && params.waitForCompletion === false) {
          return textResult(`Render submitted: ${jobId}`, { jobId, artifact })
        }

        const timeoutMs = params.timeoutMs ?? 10 * 60 * 1000
        const startedAt = Date.now()
        let lastSignature = "submitted:0"
        while (Date.now() - startedAt < timeoutMs) {
          const statusResult = await fetchJson(`${renderServiceUrl}/api/render/${jobId}/status`, { signal })
          if (statusResult.status < 200 || statusResult.status >= 300) {
            throw new Error(`Render status failed (${statusResult.status}): ${JSON.stringify(statusResult.body)}`)
          }
          const job = statusResult.body as RenderJobStatus
          const signature = `${job.status}:${job.progress}`
          if (signature !== lastSignature) {
            lastSignature = signature
            eventBus.publish({ threadId, type: "render_status", payload: job })
            onUpdate?.({ content: [{ type: "text", text: `Render ${job.status} ${job.progress}%` }], details: { job } })
          }
          if (job.status === "done") {
            store.saveArtifact({ threadId, kind: "render_job", data: job, approved: true })
            const plan = store.getPipelinePlan(threadId)
            const step = plan?.steps.find((candidate) => candidate.id === "render")
            if (plan && step) {
              step.status = "completed"
              step.summary = "Render completed"
              step.completedAt = nowIso()
              publishPipelinePlanUpdate(store, eventBus, threadId, plan, {
                action: "render_completed",
                stepId: "render",
                jobId,
              })
            }
            return textResult(`Render completed: ${jobId}`, { job })
          }
          if (job.status === "error") {
            eventBus.publish({ threadId, type: "render_status", payload: job })
            throw new Error(`Render failed: ${job.error ?? "unknown error"}`)
          }
          await sleep(5000, signal)
        }

        throw new Error(`Render timed out after ${timeoutMs}ms: ${jobId}`)
      },
    }),

    defineTool({
      name: "review_completed_render",
      label: "Review Completed Render",
      description: "Run deterministic ffprobe-based checks against the latest completed render job.",
      parameters: Type.Object({ jobId: Type.Optional(Type.String()) }),
      async execute(_id, params, signal) {
        const renderArtifact = latestArtifact<RenderJobStatus>(store, threadId, "render_job", true)
        const jobId = params.jobId ?? renderArtifact?.data.id
        if (!jobId) throw new Error("A completed render job is required for final review")
        const plan = store.getPipelinePlan(threadId)
        const step = plan?.steps.find((candidate) => candidate.id === "review")
        if (plan && step) {
          step.status = "in_progress"
          step.owner = "reviewer"
          step.summary = "Inspecting final MP4 metadata"
          step.startedAt ??= nowIso()
          publishPipelinePlanUpdate(store, eventBus, threadId, plan, { action: "review_started", stepId: "review" })
        }
        const { status, body } = await fetchJson(`${renderServiceUrl}/api/render/${jobId}/review`, { signal })
        if (status < 200 || status >= 300) throw new Error(`Render review failed (${status}): ${JSON.stringify(body)}`)
        const report = body as RenderReviewReport
        const artifact = writeJsonArtifact(store, threadId, "render_review", "render-review.json", report)
        const updated = store.getPipelinePlan(threadId)
        const updatedStep = updated?.steps.find((candidate) => candidate.id === "review")
        if (updated && updatedStep) {
          updatedStep.status = report.passed ? "in_progress" : "blocked"
          updatedStep.summary = report.passed
            ? "Technical review passed; awaiting final human acceptance"
            : "Technical review found blocking failures"
          updatedStep.artifactPaths = [artifact.path!]
          updatedStep.blockers = report.failures
          publishPipelinePlanUpdate(store, eventBus, threadId, updated, {
            action: "review_completed",
            stepId: "review",
          })
        }
        eventBus.publish({ threadId, type: "artifact_updated", payload: { kind: "render_review", artifact } })
        return textResult("Final render review is ready for human acceptance.", { artifact, report })
      },
    }),

    defineTool({
      name: "present_final_review_checkpoint",
      label: "Present Final Review Checkpoint",
      description: "Present deterministic MP4 review results for final human acceptance.",
      parameters: Type.Object({ artifactId: Type.Optional(Type.String()) }),
      async execute(_id, params) {
        const artifact = params.artifactId
          ? store.getArtifact<RenderReviewReport>(params.artifactId)
          : latestArtifact<RenderReviewReport>(store, threadId, "render_review")
        if (!artifact || artifact.kind !== "render_review") throw new Error("Render review artifact not found")
        const payload = createCheckpointPayload("final_review_checkpoint", artifact)
        const checkpoint = {
          id: randomUUID(),
          type: "final_review_checkpoint" as const,
          artifactId: artifact.id,
          payload,
        }
        store.setCheckpoint(threadId, checkpoint)
        eventBus.publish({ threadId, type: "checkpoint", payload: checkpoint })
        return textResult("Final review presented. Stop and wait for human acceptance.", checkpoint, true)
      },
    }),

    defineTool({
      name: "publish_approved_artifacts",
      label: "Publish Approved Artifacts",
      description:
        "Copy the latest approved script/direction/audio chart and generated config into content/tutorials/<slug>/ after the human-approved flow.",
      parameters: Type.Object({
        slug: Type.Optional(Type.String()),
        configArtifactId: Type.Optional(Type.String()),
      }),
      async execute(_id, params) {
        const configArtifact = params.configArtifactId
          ? store.getArtifact<Record<string, unknown>>(params.configArtifactId)
          : latestArtifact<Record<string, unknown>>(store, threadId, "config")
        if (!configArtifact) throw new Error("No config artifact available to publish")

        const config = configArtifact.data
        const title =
          typeof config.title === "string" ? config.title : typeof config.id === "string" ? config.id : threadId
        const slug = params.slug ?? (typeof config.id === "string" ? config.id : configIdFromTitle(title))
        const targetDir = contentTutorialDir(slug)
        ensureDirectory(targetDir)

        const written: Record<string, string> = {}
        const writeJson = (fileName: string, data: unknown) => {
          const absolutePath = `${targetDir}/${fileName}`
          writeFileSync(absolutePath, JSON.stringify(data, null, 2) + "\n", "utf-8")
          written[fileName] = projectRelativePath(absolutePath)
        }
        const writeText = (fileName: string, text: string) => {
          const absolutePath = `${targetDir}/${fileName}`
          writeFileSync(absolutePath, text.endsWith("\n") ? text : `${text}\n`, "utf-8")
          written[fileName] = projectRelativePath(absolutePath)
        }

        writeJson("config.json", config)

        const script = latestArtifact<ScriptDraft>(store, threadId, "script", true)
        if (script) {
          writeJson("script.json", script.data)
          writeText("script.md", scriptToMarkdown(script.data))
        }

        const direction = latestArtifact<DirectionDraft>(store, threadId, "direction", true)
        if (direction) writeJson("direction.json", direction.data)

        const qaReport = latestArtifact<SceneQaReport>(store, threadId, "qa_report")
        if (qaReport) writeJson("qa-report.json", qaReport.data)

        const audioChart = latestArtifact<AudioChart>(store, threadId, "audio_chart", true)
        if (audioChart) writeJson("audio-chart.json", audioChart.data)

        const renderReview = latestArtifact<RenderReviewReport>(store, threadId, "render_review", true)
        if (renderReview) writeJson("render-review.json", renderReview.data)

        const plan = store.getPipelinePlan(threadId)
        const step = plan?.steps.find((candidate) => candidate.id === "publication")
        if (plan && step) {
          step.status = "completed"
          step.summary = "Approved artifacts published"
          step.artifactPaths = Object.values(written)
          step.completedAt = nowIso()
          publishPipelinePlanUpdate(store, eventBus, threadId, plan, {
            action: "publication_completed",
            stepId: "publication",
          })
        }
        eventBus.publish({ threadId, type: "artifact_updated", payload: { kind: "published_artifacts", written } })
        return textResult("Approved artifacts published to content/tutorials.", { written })
      },
    }),

    defineTool({
      name: "check_render_status",
      label: "Check Render Status",
      description: "Check render job status and publish render progress to SSE.",
      parameters: Type.Object({ jobId: Type.String() }),
      async execute(_id, params, signal) {
        const { status, body } = await fetchJson(`${renderServiceUrl}/api/render/${params.jobId}/status`, { signal })
        if (status < 200 || status >= 300) {
          throw new Error(`Render status failed (${status}): ${JSON.stringify(body)}`)
        }
        const job = body as RenderJobStatus
        eventBus.publish({ threadId, type: "render_status", payload: job })
        return textResult(`Render status: ${job.status} (${job.progress}%).`, { job })
      },
    }),
  ]
}
