import { createHash, randomUUID } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent"
import { assertValidScriptDraftCatalog, createPipelinePlanRecord, loadSceneCatalog } from "./tools.js"
import { ThreadEventBus } from "./events.js"
import { ModelRouter } from "./modelRouter.js"
import { checkpointResumePrompt } from "./prompt.js"
import { AgentPiStore } from "./store.js"
import { PROJECT_ROOT, contentTutorialDir, ensureDirectory, projectRelativePath } from "./paths.js"
import { ResearchSpecialistRunner } from "./researcher.js"
import { SceneComposerRunner } from "./sceneComposer.js"
import { ExecutableSceneCandidateRunner, type ExecutableSceneCandidateDraft } from "./executableSceneCandidate.js"
import {
  buildCandidateManifest,
  buildCandidateRegistryOutputs,
  formatExecutableSceneCandidateDraft,
  verifyExecutableSceneCandidate,
  type Tier2CandidatePackage,
} from "./tier2Pipeline.js"
import {
  CandidatePromotionJournal,
  createCandidatePromotionApproval,
  createCandidatePromotionCheckpoint,
  createCandidatePromotionPlan,
  hashCanonicalPromotionValue,
  promoteCandidate,
  recoverCandidatePromotions,
  registerCandidateVerification,
  type CandidatePromotionCheckpoint,
  type CandidatePromotionPlan,
  type CandidatePromotionResult,
} from "./candidatePromotion.js"
import { SceneQaRunner, SceneStillClient } from "./sceneQa.js"
import { CopywriterSpecialistRunner, DirectionSpecialistRunner } from "./specialists.js"
import { AudioPlannerRunner, listAudioLibrary, validateAudioChart } from "./audioPlanner.js"
import { AudioAssetProducer } from "./audioProduction.js"
import {
  configIdFromTitle,
  nextDraftFileName,
  scriptToMarkdown,
  writeJsonArtifact,
  writeTextArtifact,
} from "./artifacts.js"
import {
  actionIdempotencyKey,
  deriveCoordinatorAction,
  isImplementedPipelineMode,
  evaluateDirectAction,
} from "./coordinator.js"
import { createActionKey, toJournalBeginInput } from "./actionJournal.js"
import { executableCandidatePolicySummary } from "./candidatePolicy.js"
import { ParentActionExecutor } from "./parentActionExecutor.js"
import { failInterruptedAtomicActions } from "./actionReconciliation.js"
import {
  ConfigSpecialistRunner,
  configContentHash,
  type ConfigLineageMetadata,
  type ConfigSpecialistInput,
  type ConfigSpecialistResult,
} from "./configSpecialist.js"
import {
  ProductionBriefIntakeRunner,
  type ProductionBriefIntakeResult,
  type ProductionBriefIntakeRevision,
} from "./intake.js"
import {
  buildProductionBriefArtifact,
  validateProductionBriefArtifact,
  type ProductionBriefArtifact,
  type ProductionBriefCandidate,
  type ProductionBriefInput,
  type ProductionDuration,
} from "./productionBrief.js"
import {
  REGISTERED_TARGETS,
  buildSelectedTargetArtifact,
  listRegisteredTargetSummaries,
  resolveProductionBriefTarget,
  isSelectedTargetArtifactForBrief,
  summarizeSelectedRegisteredTarget,
  type SelectedTargetArtifact,
} from "./targetContracts.js"
import type {
  ArtifactKind,
  ArtifactRecord,
  AudioChart,
  CreativeBrief,
  DirectionDraft,
  DirectionRevisionRequest,
  PipelineDecisionStatus,
  PipelineMode,
  ResearchBrief,
  RenderJobStatus,
  RenderReviewReport,
  PipelinePlan,
  QaReportLineage,
  SceneCompositionResult,
  SceneQaReport,
  ScriptDraft,
} from "./types.js"

export interface AgentRuntimeOptions {
  cwd?: string
  agentDir?: string
  renderServiceUrl?: string
  store?: AgentPiStore
  eventBus?: ThreadEventBus
  modelRouter?: ModelRouter
  createProductionBriefIntakeRunner?: (threadId: string) => Pick<ProductionBriefIntakeRunner, "run">
  createConfigSpecialistRunner?: (threadId: string) => {
    run(input: ConfigSpecialistInput, signal?: AbortSignal): Promise<ConfigSpecialistResult>
  }
  createCopywriterSpecialistRunner?: (threadId: string) => Pick<CopywriterSpecialistRunner, "run">
  createDirectionSpecialistRunner?: (threadId: string) => Pick<DirectionSpecialistRunner, "run">
  createResearchSpecialistRunner?: (threadId: string) => Pick<ResearchSpecialistRunner, "run">
  createSceneComposerSpecialistRunner?: (threadId: string) => Pick<SceneComposerRunner, "run">
  createExecutableSceneCandidateRunner?: (threadId: string) => Pick<ExecutableSceneCandidateRunner, "run">
  verifyExecutableSceneCandidate?: typeof verifyExecutableSceneCandidate
  createSceneQaSpecialistRunner?: (threadId: string) => Pick<SceneQaRunner, "run">
  createSceneStillClient?: () => Pick<SceneStillClient, "render">
  createAudioPlannerSpecialistRunner?: (threadId: string) => Pick<AudioPlannerRunner, "run">
  createAudioAssetProducer?: () => Pick<AudioAssetProducer, "produce">
  validateFinalConfig?: (
    config: Record<string, unknown>,
    signal?: AbortSignal,
  ) => Promise<{ valid: boolean; errors?: unknown }>
  submitRender?: (
    config: Record<string, unknown>,
    idempotencyKey: string,
    requestHash: string,
    signal?: AbortSignal,
  ) => Promise<{ jobId: string; reused: boolean }>
  getRenderStatus?: (jobId: string, signal?: AbortSignal) => Promise<RenderJobStatus>
  reviewRender?: (jobId: string, signal?: AbortSignal) => Promise<RenderReviewReport>
  publishFiles?: (
    slug: string,
    files: ReadonlyMap<string, string>,
  ) => Promise<Record<string, { path: string; sha256: string }>>
}

interface StoredTier2CandidatePackage extends Tier2CandidatePackage {
  sceneComposition: { artifactId: string; version: number; contentHash: string }
  cp4: { checkpointId: string; checkpointVersion: number; approvalDigest: string }
  promotionPlanDigest: string
  promotionCheckpoint: CandidatePromotionCheckpoint
}

export interface TargetResolutionResult {
  status: "selected" | "needs_input"
  artifact?: ArtifactRecord<SelectedTargetArtifact>
  checkpointId?: string
}

export function validateCheckpointDecision(
  decision: Record<string, unknown>,
  checkpoint: { id: string; artifactId: string | null; payload?: unknown },
): void {
  if (typeof decision.approved !== "boolean") throw new Error("Checkpoint decision requires a boolean 'approved' field")
  if ("checkpointId" in decision && decision.checkpointId !== checkpoint.id) {
    throw new Error(`Checkpoint decision targets stale checkpoint '${String(decision.checkpointId)}'`)
  }
  if ("artifactId" in decision && decision.artifactId !== checkpoint.artifactId) {
    throw new Error(`Checkpoint decision targets stale artifact '${String(decision.artifactId)}'`)
  }
  const payload =
    typeof checkpoint.payload === "object" && checkpoint.payload !== null && !Array.isArray(checkpoint.payload)
      ? (checkpoint.payload as Record<string, unknown>)
      : null
  if (payload && "artifactId" in payload && payload.artifactId !== checkpoint.artifactId) {
    throw new Error("Checkpoint payload targets a different artifact")
  }
  if ("version" in decision && (!payload || decision.version !== payload.version)) {
    throw new Error(`Checkpoint decision targets stale artifact version '${String(decision.version)}'`)
  }
  if ("feedback" in decision && decision.feedback !== undefined && typeof decision.feedback !== "string") {
    throw new Error("Checkpoint decision feedback must be a string")
  }
}

function isScriptDraft(value: unknown): value is ScriptDraft {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const draft = value as Partial<ScriptDraft>
  return typeof draft.title === "string" && typeof draft.objective === "string" && Array.isArray(draft.scenes)
}

function checkpointStepId(type: string): string | undefined {
  if (type === "script_checkpoint") return "copywriting"
  if (type === "direction_checkpoint") return "direction"
  if (type === "audio_chart_checkpoint") return "audio_plan"
  if (type === "qa_report_checkpoint") return "scene_qa"
  if (type === "final_review_checkpoint") return "review"
  if (type === "capability_gap_checkpoint" || type === "candidate_promotion_checkpoint") return "scene_creation"
  return undefined
}

function checkpointArtifactKind(type: string): ArtifactKind | undefined {
  if (type === "script_checkpoint") return "script"
  if (type === "direction_checkpoint") return "direction"
  if (type === "audio_chart_checkpoint") return "audio_chart"
  if (type === "qa_report_checkpoint") return "qa_report"
  if (type === "final_review_checkpoint") return "render_review"
  if (type === "capability_gap_checkpoint") return "scene_composition"
  if (type === "candidate_promotion_checkpoint") return "candidate_promotion_plan"
  return undefined
}

function refreshPlanState(plan: PipelinePlan): PipelinePlan {
  const completed = plan.steps.filter((step) => step.status === "completed" || step.status === "skipped").length
  const currentStep =
    plan.steps.find((step) => step.status === "blocked") ??
    plan.steps.find((step) => step.status === "in_progress") ??
    plan.steps.find((step) => step.status === "pending")
  return {
    ...plan,
    status: plan.steps.every((step) => step.status === "completed" || step.status === "skipped")
      ? "completed"
      : plan.steps.some((step) => step.status === "failed")
        ? "failed"
        : plan.steps.some((step) => step.status === "blocked")
          ? "blocked"
          : "active",
    currentStepId: currentStep?.id ?? null,
    progress: { completed, total: plan.steps.length },
    updatedAt: new Date().toISOString(),
  }
}

function clearSupersededClarificationCheckpoints(store: AgentPiStore): void {
  for (const thread of store.listThreads(10_000)) {
    const checkpoint = thread.checkpoint
    if (!checkpoint || (checkpoint.type !== "intake_clarification" && checkpoint.type !== "target_clarification")) {
      continue
    }
    const latestBrief = store
      .listArtifacts(thread.id)
      .filter((artifact) => artifact.kind === "production_brief")
      .sort((left, right) => left.version - right.version)
      .at(-1)
    if (latestBrief && checkpoint.artifactId !== latestBrief.id) {
      store.clearCheckpoint(thread.id, "idle")
    }
  }
}

function isCurrentSelectedTarget(
  artifact: ArtifactRecord<SelectedTargetArtifact>,
  brief: ArtifactRecord<ProductionBriefArtifact>,
): boolean {
  return isSelectedTargetArtifactForBrief(artifact.data, brief)
}

function assertConfigResultBoundToInput(input: ConfigSpecialistInput, result: ConfigSpecialistResult): void {
  if (result.configHash !== configContentHash(result.config)) {
    throw new Error("Configurator result hash does not match its configuration")
  }
  const lineage = result.lineage
  const expectedRef = <T>(artifact: { artifactId: string; version: number; data: T }) => ({
    artifactId: artifact.artifactId,
    version: artifact.version,
    contentHash: configContentHash(artifact.data),
  })
  const refsMatch = (
    actual: { artifactId: string; version: number; contentHash: string } | null,
    expected: { artifactId: string; version: number; contentHash: string } | null,
  ) =>
    actual?.artifactId === expected?.artifactId &&
    actual?.version === expected?.version &&
    actual?.contentHash === expected?.contentHash

  if (
    lineage.schemaVersion !== 1 ||
    !refsMatch(lineage.productionBrief, expectedRef(input.productionBrief)) ||
    !refsMatch(lineage.script, expectedRef(input.script)) ||
    !refsMatch(lineage.direction, expectedRef(input.direction)) ||
    !refsMatch(lineage.audio, input.audio ? expectedRef(input.audio) : null) ||
    !refsMatch(
      lineage.previousConfig,
      input.previousConfig
        ? {
            artifactId: input.previousConfig.artifactId,
            version: input.previousConfig.version,
            contentHash: input.previousConfig.contentHash,
          }
        : null,
    ) ||
    lineage.target.targetId !== input.target.targetId ||
    lineage.target.contractSchemaVersion !== input.target.schemaVersion ||
    lineage.target.configSchemaId !== input.target.rendering.configSchema.id ||
    lineage.target.configSchemaVersion !== input.target.rendering.configSchema.version
  ) {
    throw new Error("Configurator result lineage does not match the exact parent-approved input")
  }
}

function persistDirectionRevisionRequest(
  store: AgentPiStore,
  eventBus: ThreadEventBus,
  threadId: string,
  checkpoint: {
    id: string
    type: "qa_report_checkpoint" | "direction_checkpoint"
    artifactId: string | null
  },
  feedback: string,
): ArtifactRecord<DirectionRevisionRequest> {
  const artifacts = store.listArtifacts(threadId)
  const existing = artifacts
    .filter((artifact) => artifact.kind === "direction_revision_request")
    .find((artifact) => (artifact.data as DirectionRevisionRequest | undefined)?.checkpoint?.id === checkpoint.id) as
    | ArtifactRecord<DirectionRevisionRequest>
    | undefined
  if (existing) return existing

  const latest = <T>(kind: ArtifactKind) =>
    artifacts.filter((artifact) => artifact.kind === kind).sort((left, right) => right.version - left.version)[0] as
      | ArtifactRecord<T>
      | undefined
  const direction = latest<DirectionDraft>("direction")
  if (!direction) throw new Error("Direction revision requires the exact previous direction")
  const config = latest<Record<string, unknown>>("config")
  const qaReport = latest<SceneQaReport>("qa_report")
  if (checkpoint.type === "qa_report_checkpoint" && (!qaReport || qaReport.id !== checkpoint.artifactId)) {
    throw new Error("Scene QA revision request must reference the checkpoint QA report")
  }
  const ref = <T>(artifact: ArtifactRecord<T>) => ({
    artifactId: artifact.id,
    version: artifact.version,
    contentHash: configContentHash(artifact.data),
  })
  const request = store.saveArtifact<DirectionRevisionRequest>({
    threadId,
    kind: "direction_revision_request",
    approved: true,
    data: {
      schemaVersion: 1,
      source: checkpoint.type === "qa_report_checkpoint" ? "scene_qa" : "direction_checkpoint",
      feedback,
      checkpoint: { id: checkpoint.id, type: checkpoint.type },
      baseDirection: ref(direction),
      baseConfig: config ? ref(config) : null,
      qaReport: qaReport ? ref(qaReport) : null,
    },
  })
  eventBus.publish({
    threadId,
    type: "artifact_updated",
    payload: { kind: "direction_revision_request", artifact: request },
  })
  return request
}

export class AgentRuntimeManager {
  readonly cwd: string
  readonly agentDir: string | undefined
  readonly renderServiceUrl: string
  readonly store: AgentPiStore
  readonly eventBus: ThreadEventBus
  readonly modelRouter: ModelRouter
  readonly authStorage: AuthStorage
  readonly modelRegistry: ModelRegistry
  private readonly createProductionBriefIntakeRunner: (threadId: string) => Pick<ProductionBriefIntakeRunner, "run">
  private readonly createConfigSpecialistRunner: NonNullable<AgentRuntimeOptions["createConfigSpecialistRunner"]>
  private readonly createCopywriterSpecialistRunner: NonNullable<
    AgentRuntimeOptions["createCopywriterSpecialistRunner"]
  >
  private readonly createDirectionSpecialistRunner: NonNullable<AgentRuntimeOptions["createDirectionSpecialistRunner"]>
  private readonly createResearchSpecialistRunner: NonNullable<AgentRuntimeOptions["createResearchSpecialistRunner"]>
  private readonly createSceneComposerSpecialistRunner: NonNullable<
    AgentRuntimeOptions["createSceneComposerSpecialistRunner"]
  >
  private readonly createExecutableSceneCandidateRunner: NonNullable<
    AgentRuntimeOptions["createExecutableSceneCandidateRunner"]
  >
  private readonly verifyExecutableSceneCandidate: NonNullable<AgentRuntimeOptions["verifyExecutableSceneCandidate"]>
  private readonly candidatePromotionJournal: CandidatePromotionJournal
  private readonly createSceneQaSpecialistRunner: NonNullable<AgentRuntimeOptions["createSceneQaSpecialistRunner"]>
  private readonly createSceneStillClient: NonNullable<AgentRuntimeOptions["createSceneStillClient"]>
  private readonly createAudioPlannerSpecialistRunner: NonNullable<
    AgentRuntimeOptions["createAudioPlannerSpecialistRunner"]
  >
  private readonly createAudioAssetProducer: NonNullable<AgentRuntimeOptions["createAudioAssetProducer"]>
  private readonly validateFinalConfig: NonNullable<AgentRuntimeOptions["validateFinalConfig"]>
  private readonly submitRender: NonNullable<AgentRuntimeOptions["submitRender"]>
  private readonly getRenderStatus: NonNullable<AgentRuntimeOptions["getRenderStatus"]>
  private readonly reviewRender: NonNullable<AgentRuntimeOptions["reviewRender"]>
  private readonly publishFiles: NonNullable<AgentRuntimeOptions["publishFiles"]>
  private readonly retryActionKeys = new Set<string>()
  private readonly retryingThreads = new Set<string>()

  constructor(options: AgentRuntimeOptions = {}) {
    this.cwd = options.cwd ?? PROJECT_ROOT
    this.agentDir = options.agentDir
    this.renderServiceUrl = options.renderServiceUrl ?? process.env.RENDER_URL ?? "http://127.0.0.1:3100"
    this.store = options.store ?? new AgentPiStore()
    clearSupersededClarificationCheckpoints(this.store)
    failInterruptedAtomicActions(this.store)
    this.eventBus = options.eventBus ?? new ThreadEventBus(this.store)
    this.modelRouter = options.modelRouter ?? new ModelRouter()
    this.authStorage = this.modelRouter.authStorage
    this.modelRegistry = this.modelRouter.modelRegistry
    this.createProductionBriefIntakeRunner =
      options.createProductionBriefIntakeRunner ??
      ((threadId) =>
        new ProductionBriefIntakeRunner({
          threadId,
          eventBus: this.eventBus,
          modelRouter: this.modelRouter,
          authStorage: this.authStorage,
          modelRegistry: this.modelRegistry,
        }))
    this.createConfigSpecialistRunner =
      options.createConfigSpecialistRunner ??
      ((threadId) =>
        new ConfigSpecialistRunner({
          threadId,
          eventBus: this.eventBus,
          modelRouter: this.modelRouter,
          authStorage: this.authStorage,
          modelRegistry: this.modelRegistry,
          validateConfig: async (config, signal) => {
            const response = await fetch(`${this.renderServiceUrl}/api/validate`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(config),
              signal,
            })
            const body = (await response.json()) as { valid?: boolean; errors?: unknown }
            return {
              valid: response.ok && body.valid === true,
              errors: body.errors === undefined ? undefined : [JSON.stringify(body.errors)],
            }
          },
        }))
    this.createCopywriterSpecialistRunner =
      options.createCopywriterSpecialistRunner ??
      ((threadId) =>
        new CopywriterSpecialistRunner({
          threadId,
          eventBus: this.eventBus,
          modelRouter: this.modelRouter,
          authStorage: this.authStorage,
          modelRegistry: this.modelRegistry,
        }))
    this.createDirectionSpecialistRunner =
      options.createDirectionSpecialistRunner ??
      ((threadId) =>
        new DirectionSpecialistRunner({
          threadId,
          eventBus: this.eventBus,
          modelRouter: this.modelRouter,
          authStorage: this.authStorage,
          modelRegistry: this.modelRegistry,
        }))
    this.createResearchSpecialistRunner =
      options.createResearchSpecialistRunner ??
      ((threadId) =>
        new ResearchSpecialistRunner({
          threadId,
          eventBus: this.eventBus,
          modelRouter: this.modelRouter,
          authStorage: this.authStorage,
          modelRegistry: this.modelRegistry,
        }))
    this.createSceneComposerSpecialistRunner =
      options.createSceneComposerSpecialistRunner ??
      ((threadId) =>
        new SceneComposerRunner({
          threadId,
          eventBus: this.eventBus,
          modelRouter: this.modelRouter,
          authStorage: this.authStorage,
          modelRegistry: this.modelRegistry,
        }))
    this.createExecutableSceneCandidateRunner =
      options.createExecutableSceneCandidateRunner ??
      ((threadId) =>
        new ExecutableSceneCandidateRunner({
          threadId,
          eventBus: this.eventBus,
          modelRouter: this.modelRouter,
          authStorage: this.authStorage,
          modelRegistry: this.modelRegistry,
        }))
    this.verifyExecutableSceneCandidate = options.verifyExecutableSceneCandidate ?? verifyExecutableSceneCandidate
    this.candidatePromotionJournal = new CandidatePromotionJournal(this.store.db)
    recoverCandidatePromotions(this.candidatePromotionJournal)
    this.createSceneQaSpecialistRunner =
      options.createSceneQaSpecialistRunner ??
      ((threadId) =>
        new SceneQaRunner({
          threadId,
          eventBus: this.eventBus,
          modelRouter: this.modelRouter,
          authStorage: this.authStorage,
          modelRegistry: this.modelRegistry,
        }))
    this.createSceneStillClient = options.createSceneStillClient ?? (() => new SceneStillClient(this.renderServiceUrl))
    this.createAudioPlannerSpecialistRunner =
      options.createAudioPlannerSpecialistRunner ??
      ((threadId) =>
        new AudioPlannerRunner({
          threadId,
          eventBus: this.eventBus,
          modelRouter: this.modelRouter,
          authStorage: this.authStorage,
          modelRegistry: this.modelRegistry,
        }))
    this.createAudioAssetProducer = options.createAudioAssetProducer ?? (() => new AudioAssetProducer())
    this.validateFinalConfig =
      options.validateFinalConfig ??
      (async (config, signal) => {
        const response = await fetch(`${this.renderServiceUrl}/api/validate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config),
          signal,
        })
        const body = (await response.json()) as { valid?: boolean; errors?: unknown }
        return { valid: response.ok && body.valid === true, errors: body.errors }
      })
    this.submitRender =
      options.submitRender ??
      (async (config, idempotencyKey, requestHash, signal) => {
        const response = await fetch(`${this.renderServiceUrl}/api/render`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
            "X-Claqueta-Request-Hash": requestHash,
          },
          body: JSON.stringify(config),
          signal,
        })
        const body = (await response.json()) as { jobId?: unknown; reused?: unknown; error?: unknown }
        if (!response.ok || typeof body.jobId !== "string") {
          throw new Error(`Render submission failed (${response.status}): ${JSON.stringify(body.error ?? body)}`)
        }
        return { jobId: body.jobId, reused: body.reused === true }
      })
    this.getRenderStatus =
      options.getRenderStatus ??
      (async (jobId, signal) => {
        const response = await fetch(`${this.renderServiceUrl}/api/render/${encodeURIComponent(jobId)}/status`, {
          signal,
        })
        const body = (await response.json()) as RenderJobStatus
        if (!response.ok) throw new Error(`Render status failed (${response.status})`)
        return body
      })
    this.reviewRender =
      options.reviewRender ??
      (async (jobId, signal) => {
        const response = await fetch(`${this.renderServiceUrl}/api/render/${encodeURIComponent(jobId)}/review`, {
          signal,
        })
        const body = (await response.json()) as RenderReviewReport
        if (!response.ok) throw new Error(`Render review failed (${response.status})`)
        return body
      })
    this.publishFiles =
      options.publishFiles ??
      (async (slug, files) => {
        const targetDir = contentTutorialDir(slug)
        ensureDirectory(targetDir)
        const written: Record<string, { path: string; sha256: string }> = {}
        for (const [fileName, content] of files) {
          const path = `${targetDir}/${fileName}`
          writeFileSync(path, content, "utf8")
          const actual = readFileSync(path)
          const sha256 = createHash("sha256").update(actual).digest("hex")
          const expected = createHash("sha256").update(content, "utf8").digest("hex")
          if (sha256 !== expected) throw new Error(`Published file hash mismatch: ${fileName}`)
          written[fileName] = { path: projectRelativePath(path), sha256 }
        }
        return written
      })
  }

  async getOrCreateThread(threadId?: string | null, title?: string): Promise<string> {
    if (threadId) {
      const existing = this.store.getThread(threadId)
      if (!existing) throw new Error(`Unknown thread: ${threadId}`)
      return existing.id
    }
    return this.store.createThread({ title: title?.slice(0, 80) ?? null }).id
  }

  async sendMessage(
    threadId: string,
    message: string,
    options: { displayUserMessage?: boolean; mode?: PipelineMode } = {},
  ): Promise<void> {
    this.store.updateThreadStatus(threadId, "running")
    if (options.displayUserMessage !== false) {
      this.eventBus.publish({ threadId, type: "message_delta", payload: { role: "user", delta: message } })
    }
    try {
      let plan = this.store.getPipelinePlan(threadId)
      if (!plan) {
        if (!options.mode) throw new Error("A new thread requires an explicit pipeline mode")
        if (!isImplementedPipelineMode(options.mode))
          throw new Error(`Pipeline mode '${options.mode}' is not implemented`)
        plan = createPipelinePlanRecord(threadId, options.mode, message)
        this.store.savePipelinePlan(plan)
        this.eventBus.publish({ threadId, type: "plan_updated", payload: { plan, action: "parent_create" } })
      } else if (options.mode && options.mode !== plan.mode) {
        throw new Error(`Thread mode is immutable: expected '${plan.mode}', received '${options.mode}'`)
      }
      if (plan.mode !== "new_video")
        throw new Error(`Pipeline mode '${plan.mode}' is not implemented by the parent runtime`)
      await this.advanceCanonicalNewVideo(threadId, message)
      const thread = this.store.getThread(threadId)
      if (thread?.status === "running") this.store.updateThreadStatus(threadId, "idle")
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.store.updateThreadStatus(threadId, "error")
      this.eventBus.publish({ threadId, type: "error", payload: { recoverable: false, message: errorMessage } })
      throw error
    }
  }

  retryCurrentAction(threadId: string): Promise<void> {
    if (this.retryingThreads.has(threadId)) throw new Error(`A retry is already running for thread '${threadId}'`)
    const thread = this.store.getThread(threadId)
    const plan = this.store.getPipelinePlan(threadId)
    if (!thread || !plan) throw new Error(`Retry requires an existing canonical thread and plan: ${threadId}`)
    if (thread.checkpoint) throw new Error(`Retry cannot bypass pending checkpoint '${thread.checkpoint.id}'`)
    const snapshot = this.coordinatorSnapshot(threadId)
    const action = deriveCoordinatorAction(snapshot)
    const idempotencyKey = actionIdempotencyKey(snapshot, action)
    const attempt = this.store.readActionAttempt(threadId, createActionKey(idempotencyKey))
    if (!attempt || attempt.status !== "failed") {
      throw new Error(`Current action '${action}' has no exact failed attempt eligible for retry`)
    }
    if (String(attempt.action) !== action || String(attempt.actionKey) !== idempotencyKey) {
      throw new Error("Failed attempt identity does not match the current canonical action")
    }

    this.retryActionKeys.add(idempotencyKey)
    this.retryingThreads.add(threadId)
    return this.sendMessage(threadId, plan.goal, { displayUserMessage: false }).finally(() => {
      this.retryActionKeys.delete(idempotencyKey)
      this.retryingThreads.delete(threadId)
    })
  }

  async runProductionBriefIntake(
    threadId: string,
    request: string,
    revision: ProductionBriefIntakeRevision = {},
    signal?: AbortSignal,
  ): Promise<ProductionBriefIntakeResult> {
    const thread = this.store.getThread(threadId)
    if (!thread) throw new Error(`Unknown thread: ${threadId}`)
    if (thread.checkpoint) throw new Error(`Cannot replace pending checkpoint: ${thread.checkpoint.id}`)

    const result = await this.createProductionBriefIntakeRunner(threadId).run(request, revision, signal)
    const validation = validateProductionBriefArtifact(result.artifact)
    if (!validation.valid) {
      throw new Error(`Parent rejected the intake artifact: ${validation.errors.join("; ")}`)
    }
    const status = validation.ready ? "ready" : "needs_input"
    const artifact = this.store.saveArtifact({
      threadId,
      kind: "production_brief",
      data: result.artifact,
      approved: validation.ready,
    })
    this.eventBus.publish({
      threadId,
      type: "artifact_updated",
      payload: { kind: "production_brief", artifact, status },
    })
    if (!validation.ready) {
      const checkpoint = {
        id: randomUUID(),
        type: "intake_clarification" as const,
        artifactId: artifact.id,
        payload: {
          request,
          artifactVersion: artifact.version,
          questions: validation.questions.filter((question) => question.required),
        },
      }
      this.store.setCheckpoint(threadId, checkpoint)
      this.eventBus.publish({ threadId, type: "checkpoint", payload: checkpoint })
    }
    return { ...result, validation, status }
  }

  async resolveProductionTarget(threadId: string, request?: string): Promise<TargetResolutionResult> {
    const thread = this.store.getThread(threadId)
    if (!thread) throw new Error(`Unknown thread: ${threadId}`)
    const brief = this.latestArtifact<ProductionBriefArtifact>(threadId, "production_brief")
    if (!brief) throw new Error("Target resolution requires a persisted production brief")
    const validation = validateProductionBriefArtifact(brief.data)
    if (!validation.valid || !validation.ready) {
      throw new Error("Target resolution requires the latest production brief to be valid and ready")
    }

    if (thread.checkpoint) {
      const checkpointPayload = this.clarificationPayload(thread.checkpoint)
      if (
        thread.checkpoint.type === "target_clarification" &&
        thread.checkpoint.artifactId === brief.id &&
        checkpointPayload.productionBriefArtifactId === brief.id &&
        this.checkpointArtifactVersion(thread.checkpoint) === brief.version
      ) {
        return { status: "needs_input", checkpointId: thread.checkpoint.id }
      }
      throw new Error(`Cannot replace pending checkpoint: ${thread.checkpoint.id}`)
    }

    const resolution = resolveProductionBriefTarget(brief.data)
    if (!resolution.ok) {
      const questions =
        resolution.kind === "unresolved"
          ? [
              {
                field: "target",
                question:
                  resolution.code === "ambiguous_target"
                    ? "Which compatible target id should be selected?"
                    : "Which registered target id should be used?",
                candidates: resolution.candidates,
              },
            ]
          : resolution.issues.map((issue) => ({
              field: issue.field,
              question: `What supported value should replace the explicit unsupported ${issue.field} value?`,
              requested: issue.requested,
              supported: issue.supported,
            }))
      const checkpoint = {
        id: randomUUID(),
        type: "target_clarification" as const,
        artifactId: brief.id,
        payload: {
          productionBriefArtifactId: brief.id,
          productionBriefVersion: brief.version,
          artifactVersion: brief.version,
          ...(request ? { request } : {}),
          resolution: { kind: resolution.kind, code: resolution.code },
          questions,
          registry: listRegisteredTargetSummaries(),
        },
      }
      this.store.setCheckpoint(threadId, checkpoint)
      this.eventBus.publish({ threadId, type: "checkpoint", payload: checkpoint })
      return { status: "needs_input", checkpointId: checkpoint.id }
    }

    const existing = this.latestArtifact<SelectedTargetArtifact>(threadId, "selected_target")
    if (existing?.approved && isCurrentSelectedTarget(existing, brief))
      return { status: "selected", artifact: existing }

    const selected = buildSelectedTargetArtifact(resolution.target, brief)
    const artifact = this.store.saveArtifact({ threadId, kind: "selected_target", data: selected, approved: true })
    this.eventBus.publish({
      threadId,
      type: "artifact_updated",
      payload: {
        kind: "selected_target",
        artifact,
        targetId: selected.target.id,
        targetSchemaVersion: selected.target.schemaVersion,
      },
    })
    return { status: "selected", artifact }
  }

  async resumeClarification(
    threadId: string,
    checkpointId: string,
    feedback: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const thread = this.store.getThread(threadId)
    const checkpoint = thread?.checkpoint
    if (!checkpoint || (checkpoint.type !== "intake_clarification" && checkpoint.type !== "target_clarification")) {
      throw new Error(`Thread has no pending intake or target clarification: ${threadId}`)
    }
    if (checkpoint.id !== checkpointId) throw new Error(`Stale clarification checkpoint: ${checkpointId}`)
    const trimmedFeedback = feedback.trim()
    if (!trimmedFeedback) throw new Error("Clarification feedback must be non-empty")
    const previousArtifact = checkpoint.artifactId
      ? this.store.getArtifact<ProductionBriefArtifact>(checkpoint.artifactId)
      : null
    if (!previousArtifact || previousArtifact.kind !== "production_brief" || previousArtifact.threadId !== threadId) {
      throw new Error("Clarification checkpoint does not reference a production brief")
    }
    const artifactVersion = this.checkpointArtifactVersion(checkpoint)
    if (artifactVersion !== previousArtifact.version) {
      throw new Error(`Stale clarification artifact version: ${previousArtifact.version}`)
    }
    const latestBrief = this.latestArtifact<ProductionBriefArtifact>(threadId, "production_brief")
    if (!latestBrief || latestBrief.id !== previousArtifact.id || latestBrief.version !== previousArtifact.version) {
      throw new Error(`Stale clarification artifact: ${previousArtifact.id}`)
    }
    const payload = this.clarificationPayload(checkpoint)
    if (checkpoint.type === "target_clarification" && payload.productionBriefArtifactId !== previousArtifact.id) {
      throw new Error("Target clarification is not bound to its production brief")
    }
    const request = typeof payload.request === "string" ? payload.request : "Revise the persisted production brief."

    if (checkpoint.type === "target_clarification") {
      const targetId = this.exactTargetChoice(trimmedFeedback, payload)
      if (targetId) {
        const revised = this.reviseBriefTarget(previousArtifact.data, targetId)
        this.store.clearCheckpoint(threadId, "running")
        try {
          this.persistProductionBriefRevision(threadId, revised)
          await this.executeTargetParentAction(threadId, request)
          if (this.store.getPipelinePlan(threadId) && !this.store.getThread(threadId)?.checkpoint) {
            await this.advanceCanonicalNewVideo(threadId, request)
          }
        } catch (error) {
          if (!this.store.getThread(threadId)?.checkpoint) this.store.setCheckpoint(threadId, checkpoint)
          throw error
        }
        return
      }
      const resolutionCode = payload.resolutionCode
      if (resolutionCode === "ambiguous_target" || resolutionCode === "target_selection_required") {
        throw new Error("Target clarification must be an exact registered target id")
      }
    }

    this.store.clearCheckpoint(threadId, "running")
    try {
      const result = await this.runProductionBriefIntake(
        threadId,
        request,
        { feedback: trimmedFeedback, previousArtifact: previousArtifact.data },
        signal,
      )
      if (result.status === "ready") {
        await this.executeTargetParentAction(threadId, request)
        if (this.store.getPipelinePlan(threadId) && !this.store.getThread(threadId)?.checkpoint) {
          await this.advanceCanonicalNewVideo(threadId, request)
        }
      }
    } catch (error) {
      const latestAfterFailure = this.latestArtifact<ProductionBriefArtifact>(threadId, "production_brief")
      if (
        !this.store.getThread(threadId)?.checkpoint &&
        latestAfterFailure?.id === previousArtifact.id &&
        latestAfterFailure.version === previousArtifact.version
      ) {
        this.store.setCheckpoint(threadId, checkpoint)
      }
      throw error
    }
  }

  async resumeCheckpoint(threadId: string, decision: Record<string, unknown>): Promise<void> {
    const thread = this.store.getThread(threadId)
    if (!thread?.checkpoint) throw new Error(`Thread has no pending checkpoint: ${threadId}`)
    if (thread.checkpoint.type === "intake_clarification" || thread.checkpoint.type === "target_clarification") {
      const checkpointId = typeof decision.checkpointId === "string" ? decision.checkpointId : ""
      const feedback =
        typeof decision.targetId === "string"
          ? decision.targetId
          : typeof decision.feedback === "string"
            ? decision.feedback
            : typeof decision.answer === "string"
              ? decision.answer
              : ""
      await this.resumeClarification(threadId, checkpointId, feedback)
      return
    }
    validateCheckpointDecision(decision, thread.checkpoint)
    const expectedArtifactKind = checkpointArtifactKind(thread.checkpoint.type)
    if (expectedArtifactKind && !thread.checkpoint.artifactId) {
      throw new Error(`${thread.checkpoint.type} requires a checkpoint artifact`)
    }
    if (thread.checkpoint.artifactId) {
      const artifact = this.store.getArtifact(thread.checkpoint.artifactId)
      if (!artifact) throw new Error(`Checkpoint references missing artifact '${thread.checkpoint.artifactId}'`)
      if (artifact.threadId !== threadId) throw new Error("Checkpoint artifact belongs to a different thread")
      if (expectedArtifactKind && artifact.kind !== expectedArtifactKind) {
        throw new Error(`${thread.checkpoint.type} cannot approve artifact kind '${artifact.kind}'`)
      }
      const payload =
        typeof thread.checkpoint.payload === "object" && thread.checkpoint.payload !== null
          ? (thread.checkpoint.payload as Record<string, unknown>)
          : null
      if (payload && "version" in payload && payload.version !== artifact.version) {
        throw new Error(
          `Checkpoint artifact version ${String(payload.version)} does not match stored version ${artifact.version}`,
        )
      }
      const latest = this.store
        .listArtifacts(threadId)
        .filter((candidate) => candidate.kind === artifact.kind)
        .sort((left, right) => right.version - left.version)[0]
      if (latest?.id !== artifact.id) throw new Error(`Checkpoint references stale artifact '${artifact.id}'`)
    }
    if (decision.approved === false && thread.checkpoint.type === "candidate_promotion_checkpoint") {
      const feedback = typeof decision.feedback === "string" ? decision.feedback.trim() : ""
      if (!feedback) throw new Error("candidate_promotion_checkpoint rejection requires non-empty feedback")
    }
    if (
      decision.approved === false &&
      (thread.checkpoint.type === "qa_report_checkpoint" || thread.checkpoint.type === "direction_checkpoint")
    ) {
      const feedback = typeof decision.feedback === "string" ? decision.feedback.trim() : ""
      if (!feedback) throw new Error(`${thread.checkpoint.type} rejection requires non-empty revision feedback`)
      persistDirectionRevisionRequest(
        this.store,
        this.eventBus,
        threadId,
        {
          id: thread.checkpoint.id,
          type: thread.checkpoint.type,
          artifactId: thread.checkpoint.artifactId,
        },
        feedback,
      )
    }
    if (decision.approved === true && thread.checkpoint.artifactId) {
      this.store.markArtifactApproved(thread.checkpoint.artifactId)
    }
    if (decision.approved === true && thread.checkpoint.type === "script_checkpoint") {
      const script = decision.script
      if (isScriptDraft(script)) {
        const artifact = writeJsonArtifact(
          this.store,
          threadId,
          "script",
          nextDraftFileName(this.store, threadId, "script"),
          script,
          true,
        )
        const markdown = writeTextArtifact(
          this.store,
          threadId,
          "script_markdown",
          nextDraftFileName(this.store, threadId, "script_markdown", "md"),
          scriptToMarkdown(script),
          true,
        )
        this.eventBus.publish({
          threadId,
          type: "artifact_updated",
          payload: { kind: "script", artifact, markdownPath: markdown.path, approved: true },
        })
      }
    }
    const plan = this.store.getPipelinePlan(threadId)
    const stepId = checkpointStepId(thread.checkpoint.type)
    if (plan && stepId) {
      const approved = decision.approved === true
      const step = plan.steps.find((candidate) => candidate.id === stepId)
      if (step) {
        const capabilityProposal = thread.checkpoint.type === "capability_gap_checkpoint"
        const promotionDecision = thread.checkpoint.type === "candidate_promotion_checkpoint"
        step.status = capabilityProposal
          ? approved
            ? "blocked"
            : "in_progress"
          : promotionDecision
            ? "in_progress"
            : approved
              ? "completed"
              : "in_progress"
        step.summary = capabilityProposal
          ? approved
            ? "Capability proposal approved; bounded Visual Program recipe workflow is required and executable source generation is disabled"
            : "Capability proposal changes requested"
          : promotionDecision
            ? approved
              ? "Candidate promotion approved; parent transaction is required next"
              : "Candidate promotion rejected; production source remains unchanged"
            : approved
              ? `${thread.checkpoint.type} approved`
              : `${thread.checkpoint.type} changes requested`
        if (approved && !capabilityProposal) step.completedAt = new Date().toISOString()
      }
      const status: PipelineDecisionStatus = approved ? "approved" : "changes_requested"
      plan.decisions.push({
        id: randomUUID(),
        checkpointId: thread.checkpoint.id,
        stepId,
        status,
        summary: approved ? "Human approved checkpoint" : "Human requested checkpoint changes",
        payload: {
          ...decision,
          checkpointType: thread.checkpoint.type,
          artifactId: thread.checkpoint.artifactId,
          artifactVersion: Number(
            (thread.checkpoint.payload as Record<string, unknown> | undefined)?.artifactVersion ??
              (thread.checkpoint.payload as Record<string, unknown> | undefined)?.version ??
              0,
          ),
        },
        createdAt: new Date().toISOString(),
      })
      const savedPlan = this.store.savePipelinePlan(refreshPlanState(plan))
      this.eventBus.publish({
        threadId,
        type: "plan_updated",
        payload: { plan: savedPlan, action: "checkpoint_decision", stepId, status },
      })
    }

    this.store.clearCheckpoint(threadId, "running")
    this.eventBus.publish({
      threadId,
      type: "artifact_updated",
      payload: { kind: "checkpoint_decision", checkpoint: thread.checkpoint, decision },
    })
    if (thread.checkpoint.type === "candidate_promotion_checkpoint" && decision.approved === false) {
      this.store.updateThreadStatus(threadId, "idle")
      return
    }
    await this.sendMessage(threadId, checkpointResumePrompt(decision), { displayUserMessage: false })
  }

  private providedBriefValue<T>(input: ProductionBriefInput<T>): T | undefined {
    return input.status === "provided" ? input.value : undefined
  }

  private creativeBriefFromProductionBrief(artifact: ProductionBriefArtifact): CreativeBrief {
    const brief = artifact.brief
    const duration = this.providedBriefValue<ProductionDuration>(brief.duration)
    const evidence = this.providedBriefValue(brief.evidence)
    return {
      subject: this.providedBriefValue(brief.subject)!,
      goal: this.providedBriefValue(brief.objective)!,
      audience: this.providedBriefValue(brief.audience),
      platform: this.providedBriefValue(brief.platform),
      format: this.providedBriefValue(brief.format),
      tone: this.providedBriefValue(brief.tone),
      language: this.providedBriefValue(brief.language),
      targetDurationSeconds: duration && "seconds" in duration ? duration.seconds : undefined,
      brand: this.providedBriefValue(brief.brand),
      evidence: evidence ? [...evidence.claims, ...evidence.sourceReferences] : [],
      constraints: this.providedBriefValue(brief.constraints),
    }
  }

  private parentActionExecutor(): ParentActionExecutor {
    return new ParentActionExecutor({
      evaluate: evaluateDirectAction,
      get: (threadId, actionKey) => this.store.readActionAttempt(threadId, createActionKey(actionKey)),
      begin: (input, options) => {
        const actionKey = String(input.actionKey)
        const retryFailed = this.retryActionKeys.delete(actionKey) || options?.retryFailed === true
        return this.store.beginActionAttempt(toJournalBeginInput(input), { ...options, retryFailed })
      },
      succeed: this.store.succeedActionAttempt.bind(this.store),
      succeedWithArtifacts: this.store.succeedActionAttemptWithArtifacts.bind(this.store),
      fail: this.store.failActionAttempt.bind(this.store),
    })
  }

  private async executeResearchParentAction(
    threadId: string,
    requestText: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const brief = this.latestArtifact<ProductionBriefArtifact>(threadId, "production_brief")
    const selectedTarget = this.latestArtifact<SelectedTargetArtifact>(threadId, "selected_target")
    if (!brief?.approved || !selectedTarget?.approved || !isCurrentSelectedTarget(selectedTarget, brief)) {
      throw new Error("Research action requires approved brief and current selected target")
    }
    const snapshot = this.coordinatorSnapshot(threadId)
    const action = "research_or_skip" as const
    const execution = await this.parentActionExecutor().execute({
      snapshot,
      request: { action, idempotencyKey: actionIdempotencyKey(snapshot, action) },
      effect: async () => {
        if (brief.data.research.status === "not_required") {
          return {
            outcome: { skipped: true, rationale: brief.data.research.rationale },
            planEffects: [{ type: "skip_step" as const, stepId: "research" }],
          }
        }
        if (brief.data.research.status !== "required") throw new Error("Research requirement remains unresolved")
        const evidence = this.providedBriefValue(brief.data.brief.evidence)
        const result = await this.createResearchSpecialistRunner(threadId).run(
          {
            request: requestText,
            subject: this.providedBriefValue(brief.data.brief.subject)!,
            objective: this.providedBriefValue(brief.data.brief.objective)!,
            language: this.providedBriefValue(brief.data.brief.language),
            sourceUrls: evidence?.sourceReferences,
            constraints: this.providedBriefValue(brief.data.brief.constraints),
          },
          signal,
        )
        return {
          outcome: { runId: result.runId, modelRoute: result.modelRoute },
          artifacts: [{ id: randomUUID(), threadId, kind: "research" as const, data: result.research, approved: true }],
          effectMetadata: { runId: result.runId, modelRoute: result.modelRoute },
        }
      },
    })
    if (execution.status === "failed") throw new Error(execution.error.message)
    if (execution.status === "idempotent") return
    if (execution.status !== "succeeded")
      throw new Error(`Research parent action requires recovery: ${execution.status}`)
    for (const artifact of execution.committedArtifacts) {
      this.eventBus.publish({ threadId, type: "artifact_updated", payload: { kind: artifact.kind, artifact } })
    }
  }

  private async executeSceneComposerParentAction(threadId: string, signal?: AbortSignal): Promise<void> {
    const source = this.latestArtifact<ScriptDraft>(threadId, "script")
    const brief = this.latestArtifact<ProductionBriefArtifact>(threadId, "production_brief")
    const selectedTarget = this.latestArtifact<SelectedTargetArtifact>(threadId, "selected_target")
    if (!source || source.approved) throw new Error("Scene composer requires the current unapproved script")
    if (!brief?.approved || !selectedTarget?.approved || !isCurrentSelectedTarget(selectedTarget, brief)) {
      throw new Error("Scene composer requires the current selected target")
    }
    const target = summarizeSelectedRegisteredTarget({ target: { id: selectedTarget.data.target.id } })
    if (!target.ok) throw new Error("Scene composer selected target no longer resolves")
    const targetSceneIds = source.data.scenes
      .filter((scene) => (scene.missingCapabilities?.length ?? 0) > 0)
      .map((scene) => scene.id)
    if (targetSceneIds.length === 0) throw new Error("Scene composer requires at least one unresolved scene")
    const catalog = loadSceneCatalog().scenes?.tutorial ?? { builtin: [], custom: [] }
    const registeredComponentIds = (catalog.custom ?? [])
      .map((entry) => entry.componentId)
      .filter((id): id is string => typeof id === "string")
    const snapshot = this.coordinatorSnapshot(threadId)
    const action = "run_scene_composer" as const
    const execution = await this.parentActionExecutor().execute({
      snapshot,
      request: { action, idempotencyKey: actionIdempotencyKey(snapshot, action) },
      effect: async () => {
        const result = await this.createSceneComposerSpecialistRunner(threadId).run(
          {
            script: source.data,
            targetSceneIds,
            catalog: catalog as unknown as Record<string, unknown>,
            registeredComponentIds,
            selectedTarget: target.target,
          },
          signal,
        )
        const revised = structuredClone(source.data)
        for (const resolution of result.result.resolutions) {
          const scene = revised.scenes.find((candidate) => candidate.id === resolution.sceneId)!
          if (resolution.outcome === "composed") {
            Object.assign(scene, {
              type: "custom",
              visualType: "custom",
              componentId: "composed-scene",
              propsPlan: resolution.spec,
              visualRationale: resolution.rationale,
              missingCapabilities: [],
            })
          } else if (resolution.outcome === "reuse") {
            Object.assign(scene, {
              type: "custom",
              visualType: "custom",
              componentId: resolution.componentId,
              propsPlan: resolution.propsPlan,
              visualRationale: resolution.rationale,
              missingCapabilities: [],
            })
          }
        }
        assertValidScriptDraftCatalog(revised)
        const compositionId = randomUUID()
        const scriptId = randomUUID()
        const compositionVersion = (this.latestArtifact(threadId, "scene_composition")?.version ?? 0) + 1
        const scriptVersion = source.version + 1
        const gaps = result.result.resolutions.filter((resolution) => resolution.outcome === "capability_gap")
        const checkpointArtifactId = gaps.length > 0 ? compositionId : scriptId
        const checkpointVersion = gaps.length > 0 ? compositionVersion : scriptVersion
        const checkpointType = gaps.length > 0 ? ("capability_gap_checkpoint" as const) : ("script_checkpoint" as const)
        return {
          outcome: { runId: result.runId, modelRoute: result.modelRoute, gaps: gaps.length },
          artifacts: [
            { id: compositionId, threadId, kind: "scene_composition" as const, data: result.result },
            { id: scriptId, threadId, kind: "script" as const, data: revised },
            { id: randomUUID(), threadId, kind: "script_markdown" as const, data: scriptToMarkdown(revised) },
          ],
          checkpoint: {
            id: gaps.length > 0 ? `cp4-${randomUUID()}` : randomUUID(),
            type: checkpointType,
            artifactId: checkpointArtifactId,
            payload: {
              artifactId: checkpointArtifactId,
              artifactVersion: checkpointVersion,
              version: checkpointVersion,
              ...(gaps.length > 0
                ? { type: "capability_gap_checkpoint", summary: result.result.summary, resolutions: gaps }
                : {}),
            },
          },
          ...(gaps.length === 0 ? { planEffects: [{ type: "complete_step" as const, stepId: "scene_creation" }] } : {}),
          effectMetadata: { runId: result.runId, modelRoute: result.modelRoute },
        }
      },
    })
    if (execution.status === "failed") throw new Error(execution.error.message)
    if (execution.status === "idempotent") return
    if (execution.status !== "succeeded")
      throw new Error(`Scene composer action requires recovery: ${execution.status}`)
    for (const artifact of execution.committedArtifacts) {
      this.eventBus.publish({ threadId, type: "artifact_updated", payload: { kind: artifact.kind, artifact } })
    }
    if (execution.committedCheckpoint) {
      this.eventBus.publish({ threadId, type: "checkpoint", payload: execution.committedCheckpoint })
    }
  }

  private async executeSceneCandidateParentAction(threadId: string, signal?: AbortSignal): Promise<void> {
    const script = this.latestArtifact<ScriptDraft>(threadId, "script")
    const composition = this.latestArtifact<SceneCompositionResult>(threadId, "scene_composition")
    const brief = this.latestArtifact<ProductionBriefArtifact>(threadId, "production_brief")
    const selectedTarget = this.latestArtifact<SelectedTargetArtifact>(threadId, "selected_target")
    if (!script || script.approved || !composition?.approved) {
      throw new Error("Executable scene generation requires an unapproved script and approved CP4 composition")
    }
    if (!brief?.approved || !selectedTarget?.approved || !isCurrentSelectedTarget(selectedTarget, brief)) {
      throw new Error("Executable scene generation requires the current selected target")
    }
    const gaps = composition.data.resolutions.filter((resolution) => resolution.outcome === "capability_gap")
    if (gaps.length === 0) throw new Error("Executable scene generation requires an approved capability gap")
    const plan = this.store.getPipelinePlan(threadId)
    const cp4Decision = plan?.decisions
      .filter((decision) => decision.stepId === "scene_creation" && decision.status === "approved")
      .reverse()
      .find((decision) => {
        const payload = decision.payload as Record<string, unknown> | undefined
        return payload?.checkpointType === "capability_gap_checkpoint" && payload.artifactId === composition.id
      })
    if (!cp4Decision) throw new Error("Executable scene generation requires exact durable CP4 approval")
    const cp4Payload = cp4Decision.payload as Record<string, unknown>
    const target = summarizeSelectedRegisteredTarget({ target: { id: selectedTarget.data.target.id } })
    if (!target.ok) throw new Error("Executable scene generation target no longer resolves")
    const affectedIds = new Set(gaps.map((resolution) => resolution.sceneId))
    const affectedScenes = script.data.scenes.filter((scene) => affectedIds.has(scene.id))
    const proposalId = composition.id
    const checkpointVersion = Number(cp4Payload.artifactVersion)
    const approvalDigest = configContentHash({
      checkpointId: cp4Decision.checkpointId,
      checkpointVersion,
      artifactId: composition.id,
      artifactVersion: composition.version,
      approved: true,
    })
    const snapshot = this.coordinatorSnapshot(threadId)
    const action = "generate_scene_candidate" as const
    const execution = await this.parentActionExecutor().execute({
      snapshot,
      request: { action, idempotencyKey: actionIdempotencyKey(snapshot, action) },
      effect: async () => {
        let accepted:
          | {
              draft: ExecutableSceneCandidateDraft
              manifest: ReturnType<typeof buildCandidateManifest>
              registryOutputs: Record<string, string>
              verification: Awaited<ReturnType<typeof verifyExecutableSceneCandidate>>
            }
          | undefined
        const result = await this.createExecutableSceneCandidateRunner(threadId).run(
          {
            proposalId,
            gap: gaps[0].gap,
            affectedScenes,
            selectedTarget: target.target,
            destinationPath:
              "src/compositions/ClaudeCodeTutorial/scenes/custom/<PascalCaseExportNameEndingInScene>.tsx",
            policy: {
              ...executableCandidatePolicySummary(),
              implementationStrategy: {
                architecture: "passive precomputed timeline renderer",
                maxSourceLines: 350,
                graphBehavior:
                  "Receive bounded nodes, edges, panels, and state/pulse/isolation events in props; do not calculate traversal or propagation internally",
                lookupRules:
                  "Use find/findIndex/filter/map and explicit switch functions; never use a variable inside bracket property access",
              },
              forbiddenCapabilities: [
                "filesystem",
                "network",
                "process",
                "dynamic imports",
                "eval",
                "timers",
                "randomness",
                "CSS animation or transitions",
              ],
            },
          },
          async (draft) => {
            try {
              const formattedDraft = await formatExecutableSceneCandidateDraft(draft, this.cwd)
              const manifest = buildCandidateManifest({
                draft: formattedDraft,
                proposalId,
                checkpointId: cp4Decision.checkpointId,
                checkpointVersion,
                approvalDigest,
              })
              const registryOutputs = buildCandidateRegistryOutputs(formattedDraft, this.cwd)
              const verification = await this.verifyExecutableSceneCandidate({
                manifest,
                draft: formattedDraft,
                registryOutputs,
                root: this.cwd,
              })
              accepted = { draft: formattedDraft, manifest, registryOutputs, verification }
              return []
            } catch (error) {
              return [error instanceof Error ? error.message : String(error)]
            }
          },
          signal,
        )
        if (!accepted) throw new Error("Executable scene candidate lacks passing quarantine evidence")
        const sealed = accepted as NonNullable<typeof accepted>
        const verificationArtifactId = randomUUID()
        const verificationVersion = (this.latestArtifact(threadId, "candidate_verification")?.version ?? 0) + 1
        const evidenceDigest = registerCandidateVerification({
          journal: this.candidatePromotionJournal,
          threadId,
          artifactId: verificationArtifactId,
          artifactVersion: verificationVersion,
          artifactHash: hashCanonicalPromotionValue(sealed.verification.result),
          candidateManifest: sealed.manifest,
          quarantineResult: sealed.verification.result,
        })
        const promotionPlan = createCandidatePromotionPlan({
          journal: this.candidatePromotionJournal,
          threadId,
          projectRoot: this.cwd,
          candidateManifest: sealed.manifest,
          quarantineResult: sealed.verification.result,
          sourceFiles: Object.fromEntries(sealed.manifest.sourceFiles.map((file) => [file.path, sealed.draft.source])),
          registryOutputs: sealed.registryOutputs,
        })
        if (promotionPlan.verificationEvidenceDigest !== evidenceDigest) {
          throw new Error("Promotion plan evidence does not match registered quarantine evidence")
        }
        const promotionCheckpoint = createCandidatePromotionCheckpoint({
          journal: this.candidatePromotionJournal,
          plan: promotionPlan,
        })
        const packageData: StoredTier2CandidatePackage = {
          schemaVersion: 1,
          candidateManifest: sealed.manifest,
          draft: sealed.draft,
          sourceFiles: Object.fromEntries(sealed.manifest.sourceFiles.map((file) => [file.path, sealed.draft.source])),
          registryOutputs: sealed.registryOutputs,
          quarantineResult: sealed.verification.result,
          previewStills: sealed.verification.previewStills,
          sceneComposition: {
            artifactId: composition.id,
            version: composition.version,
            contentHash: configContentHash(composition.data),
          },
          cp4: {
            checkpointId: cp4Decision.checkpointId,
            checkpointVersion,
            approvalDigest,
          },
          promotionPlanDigest: promotionPlan.planDigest,
          promotionCheckpoint,
        }
        return {
          outcome: {
            runId: result.runId,
            modelRoute: result.modelRoute,
            candidateId: sealed.manifest.candidateId,
            planDigest: promotionPlan.planDigest,
          },
          artifacts: [
            {
              id: verificationArtifactId,
              threadId,
              kind: "candidate_verification" as const,
              data: sealed.verification.result,
              approved: true,
            },
            { id: randomUUID(), threadId, kind: "candidate_package" as const, data: packageData, approved: true },
            { id: randomUUID(), threadId, kind: "candidate_promotion_plan" as const, data: promotionPlan },
          ],
          checkpoint: {
            id: promotionCheckpoint.id,
            type: "candidate_promotion_checkpoint" as const,
            artifactId: null,
            payload: {
              ...promotionCheckpoint.payload,
              version: promotionCheckpoint.version,
              componentId: sealed.draft.componentId,
              exportName: sealed.draft.exportName,
              sourceFiles: promotionPlan.sourceFiles,
              registryOutputs: promotionPlan.registryOutputs,
              reports: sealed.verification.result.reports,
              previewStills: sealed.verification.previewStills,
            },
          },
          effectMetadata: {
            runId: result.runId,
            modelRoute: result.modelRoute,
            candidateId: sealed.manifest.candidateId,
            evidenceDigest,
            planDigest: promotionPlan.planDigest,
          },
        }
      },
    })
    if (execution.status === "failed") throw new Error(execution.error.message)
    if (execution.status === "idempotent") return
    if (execution.status !== "succeeded")
      throw new Error(`Scene candidate action requires recovery: ${execution.status}`)
    for (const artifact of execution.committedArtifacts) {
      this.eventBus.publish({ threadId, type: "artifact_updated", payload: { kind: artifact.kind, artifact } })
    }
    if (execution.committedCheckpoint) {
      const planArtifact = execution.committedArtifacts.find((artifact) => artifact.kind === "candidate_promotion_plan")
      if (!planArtifact) throw new Error("Candidate promotion checkpoint lacks its plan artifact")
      const checkpoint = { ...execution.committedCheckpoint, artifactId: planArtifact.id }
      this.store.setCheckpoint(threadId, checkpoint)
      this.store.updateThreadStatus(threadId, "waiting")
      this.eventBus.publish({ threadId, type: "checkpoint", payload: checkpoint })
    }
  }

  private async executeSceneCandidatePromotionParentAction(threadId: string): Promise<void> {
    const script = this.latestArtifact<ScriptDraft>(threadId, "script")
    const composition = this.latestArtifact<SceneCompositionResult>(threadId, "scene_composition")
    const candidate = this.latestArtifact<StoredTier2CandidatePackage>(threadId, "candidate_package")
    const planArtifact = this.latestArtifact<CandidatePromotionPlan>(threadId, "candidate_promotion_plan")
    if (!script || script.approved || !composition?.approved || !candidate?.approved || !planArtifact?.approved) {
      throw new Error("Candidate promotion requires approved CP4, package, and separate promotion decision")
    }
    if (
      candidate.data.sceneComposition.artifactId !== composition.id ||
      candidate.data.sceneComposition.version !== composition.version ||
      candidate.data.sceneComposition.contentHash !== configContentHash(composition.data) ||
      candidate.data.promotionPlanDigest !== planArtifact.data.planDigest
    ) {
      throw new Error("Candidate promotion artifacts are stale")
    }
    const snapshot = this.coordinatorSnapshot(threadId)
    const action = "promote_scene_candidate" as const
    const execution = await this.parentActionExecutor().execute({
      snapshot,
      request: { action, idempotencyKey: actionIdempotencyKey(snapshot, action) },
      resumeInProgress: true,
      effect: async () => {
        const promotionPlan = this.candidatePromotionJournal.getPlan(planArtifact.data.planDigest)
        const promotionCheckpoint = this.candidatePromotionJournal.getCheckpoint(promotionPlan.planDigest)
        if (!promotionCheckpoint) throw new Error("Durable candidate promotion checkpoint is missing")
        let approval = this.candidatePromotionJournal.getApproval(promotionPlan.planDigest)
        if (!approval) {
          approval = createCandidatePromotionApproval(this.candidatePromotionJournal, promotionCheckpoint, {
            type: "candidate_promotion_approval",
            approved: true,
          })
        }
        let promotion: CandidatePromotionResult
        const state = this.candidatePromotionJournal.state(promotionPlan.planDigest)
        if (["staging", "committing"].includes(state)) {
          recoverCandidatePromotions(this.candidatePromotionJournal)
        }
        if (this.candidatePromotionJournal.state(promotionPlan.planDigest) === "committed") {
          const rollbackHandle = this.candidatePromotionJournal.getRollbackHandle(promotionPlan.planDigest)
          if (!rollbackHandle) throw new Error("Committed candidate promotion lacks rollback evidence")
          promotion = {
            promoted: true,
            planDigest: promotionPlan.planDigest,
            verificationEvidenceDigest: promotionPlan.verificationEvidenceDigest,
            files: rollbackHandle.promotedFiles,
            rollbackHandle,
          }
        } else {
          promotion = promoteCandidate({
            journal: this.candidatePromotionJournal,
            plan: promotionPlan,
            checkpoint: promotionCheckpoint,
            approval,
          })
        }
        const revised = structuredClone(script.data)
        for (const resolution of composition.data.resolutions) {
          if (resolution.outcome !== "capability_gap") continue
          const scene = revised.scenes.find((item) => item.id === resolution.sceneId)
          if (!scene) throw new Error(`Promoted candidate cannot resolve missing scene '${resolution.sceneId}'`)
          const props = candidate.data.draft.sceneProps[resolution.sceneId]
          if (!props) throw new Error(`Promoted candidate lacks props for scene '${resolution.sceneId}'`)
          Object.assign(scene, {
            type: "custom",
            visualType: "custom",
            componentId: candidate.data.draft.componentId,
            propsPlan: props,
            visualRationale: resolution.rationale,
            missingCapabilities: [],
          })
        }
        assertValidScriptDraftCatalog(revised)
        return {
          outcome: {
            candidateId: candidate.data.candidateManifest.candidateId,
            componentId: candidate.data.draft.componentId,
            planDigest: promotion.planDigest,
          },
          artifacts: [
            {
              id: randomUUID(),
              threadId,
              kind: "candidate_promotion_result" as const,
              data: promotion,
              approved: true,
            },
            { id: randomUUID(), threadId, kind: "script" as const, data: revised },
            { id: randomUUID(), threadId, kind: "script_markdown" as const, data: scriptToMarkdown(revised) },
          ],
          effectMetadata: {
            candidateId: candidate.data.candidateManifest.candidateId,
            planDigest: promotion.planDigest,
            rollbackHandleId: promotion.rollbackHandle.handleId,
          },
        }
      },
    })
    if (execution.status === "failed") throw new Error(execution.error.message)
    if (execution.status === "idempotent") return
    if (execution.status !== "succeeded") throw new Error(`Candidate promotion requires recovery: ${execution.status}`)
    for (const artifact of execution.committedArtifacts) {
      this.eventBus.publish({ threadId, type: "artifact_updated", payload: { kind: artifact.kind, artifact } })
    }
  }

  private async executeCopywriterParentAction(
    threadId: string,
    requestText: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const brief = this.latestArtifact<ProductionBriefArtifact>(threadId, "production_brief")
    if (!brief?.approved) throw new Error("Copywriter action requires an approved production brief")
    const research = this.latestArtifact<ResearchBrief>(threadId, "research")
    const selectedTarget = this.latestArtifact<SelectedTargetArtifact>(threadId, "selected_target")
    if (!selectedTarget?.approved || !isCurrentSelectedTarget(selectedTarget, brief)) {
      throw new Error("Copywriter action requires the current approved selected target")
    }
    const target = summarizeSelectedRegisteredTarget({ target: { id: selectedTarget.data.target.id } })
    if (!target.ok) throw new Error("Copywriter selected target no longer resolves")
    const creativeBrief = { ...this.creativeBriefFromProductionBrief(brief.data), selectedTarget: target.target }
    if (research) {
      creativeBrief.evidence = [
        ...(creativeBrief.evidence ?? []),
        ...research.data.claims.map(
          (claim) => `${claim.claim} [sources: ${claim.sourceUrls.join(", ")}; confidence: ${claim.confidence}]`,
        ),
      ]
    }
    const snapshot = this.coordinatorSnapshot(threadId)
    const action = "run_copywriter" as const
    const execution = await this.parentActionExecutor().execute({
      snapshot,
      request: { action, idempotencyKey: actionIdempotencyKey(snapshot, action) },
      effect: async () => {
        const result = await this.createCopywriterSpecialistRunner(threadId).run(requestText, creativeBrief, {}, signal)
        assertValidScriptDraftCatalog(result.script)
        return {
          outcome: { runId: result.runId, modelRoute: result.modelRoute },
          artifacts: [
            { id: randomUUID(), threadId, kind: "script" as const, data: result.script },
            { id: randomUUID(), threadId, kind: "script_markdown" as const, data: scriptToMarkdown(result.script) },
          ],
          ...(result.script.scenes.every((scene) => (scene.missingCapabilities?.length ?? 0) === 0)
            ? {
                planEffects: [
                  { type: "start_step" as const, stepId: "copywriting" },
                  { type: "skip_step" as const, stepId: "scene_creation" },
                ],
              }
            : {}),
          effectMetadata: { runId: result.runId, modelRoute: result.modelRoute },
        }
      },
    })
    if (execution.status === "failed") throw new Error(execution.error.message)
    if (execution.status === "idempotent") return
    if (execution.status !== "succeeded")
      throw new Error(`Copywriter parent action requires recovery: ${execution.status}`)
    for (const artifact of execution.committedArtifacts) {
      this.eventBus.publish({ threadId, type: "artifact_updated", payload: { kind: artifact.kind, artifact } })
    }
  }

  private executeDirectionParentAction(threadId: string, signal?: AbortSignal): Promise<void> {
    return this.executeDirectionAction(threadId, "run_direction", signal)
  }

  private executeDirectionRevisionParentAction(threadId: string, signal?: AbortSignal): Promise<void> {
    return this.executeDirectionAction(threadId, "revise_direction", signal)
  }

  private async executeDirectionAction(
    threadId: string,
    action: "run_direction" | "revise_direction",
    signal?: AbortSignal,
  ): Promise<void> {
    const script = this.latestArtifact<ScriptDraft>(threadId, "script")
    const brief = this.latestArtifact<ProductionBriefArtifact>(threadId, "production_brief")
    const selectedTarget = this.latestArtifact<SelectedTargetArtifact>(threadId, "selected_target")
    if (!script?.approved) throw new Error("Direction action requires the approved script")
    if (!brief?.approved || !selectedTarget?.approved || !isCurrentSelectedTarget(selectedTarget, brief)) {
      throw new Error("Direction action requires the current approved selected target")
    }
    const target = summarizeSelectedRegisteredTarget({ target: { id: selectedTarget.data.target.id } })
    if (!target.ok) throw new Error("Direction selected target no longer resolves")
    const revisionRequest = this.latestArtifact<DirectionRevisionRequest>(threadId, "direction_revision_request")
    const previousDirection = this.latestArtifact<DirectionDraft>(threadId, "direction")
    let revisionFeedback: string | undefined
    if (action === "revise_direction") {
      if (!revisionRequest?.approved || !previousDirection) {
        throw new Error("Direction revision requires an approved request and exact previous direction")
      }
      if (
        revisionRequest.data.baseDirection.artifactId !== previousDirection.id ||
        revisionRequest.data.baseDirection.version !== previousDirection.version ||
        revisionRequest.data.baseDirection.contentHash !== configContentHash(previousDirection.data)
      ) {
        throw new Error("Direction revision request is stale for the latest direction")
      }
      let qaContext = ""
      if (revisionRequest.data.qaReport) {
        const qa = this.store.getArtifact<SceneQaReport>(revisionRequest.data.qaReport.artifactId)
        if (
          !qa ||
          qa.threadId !== threadId ||
          qa.kind !== "qa_report" ||
          qa.version !== revisionRequest.data.qaReport.version ||
          configContentHash(qa.data) !== revisionRequest.data.qaReport.contentHash
        ) {
          throw new Error("Direction revision request has stale QA evidence")
        }
        qaContext = `\n\n## Exact parent-verified Scene QA findings\n${JSON.stringify(qa.data, null, 2)}`
      }
      revisionFeedback = `${revisionRequest.data.feedback}${qaContext}`
    }
    const snapshot = this.coordinatorSnapshot(threadId)
    const execution = await this.parentActionExecutor().execute({
      snapshot,
      request: { action, idempotencyKey: actionIdempotencyKey(snapshot, action) },
      effect: async () => {
        const result = await this.createDirectionSpecialistRunner(threadId).run(
          script.data,
          {
            selectedTarget: target.target,
            ...(revisionFeedback && previousDirection
              ? { feedback: revisionFeedback, previousDirection: previousDirection.data }
              : {}),
          },
          signal,
        )
        return {
          outcome: { runId: result.runId, modelRoute: result.modelRoute },
          artifacts: [{ id: randomUUID(), threadId, kind: "direction" as const, data: result.direction }],
          effectMetadata: { runId: result.runId, modelRoute: result.modelRoute },
        }
      },
    })
    if (execution.status === "failed") throw new Error(execution.error.message)
    if (execution.status === "idempotent") return
    if (execution.status !== "succeeded")
      throw new Error(`Direction parent action requires recovery: ${execution.status}`)
    for (const artifact of execution.committedArtifacts) {
      this.eventBus.publish({ threadId, type: "artifact_updated", payload: { kind: artifact.kind, artifact } })
    }
  }

  private async executePresentationParentAction(
    threadId: string,
    action:
      | "present_script"
      | "present_direction"
      | "present_scene_qa"
      | "present_audio_chart"
      | "present_final_review",
  ): Promise<void> {
    const kind =
      action === "present_script"
        ? ("script" as const)
        : action === "present_direction"
          ? ("direction" as const)
          : action === "present_scene_qa"
            ? ("qa_report" as const)
            : action === "present_audio_chart"
              ? ("audio_chart" as const)
              : ("render_review" as const)
    const artifact = this.latestArtifact(threadId, kind)
    if (!artifact || artifact.approved) throw new Error(`${action} requires the latest unapproved ${kind} artifact`)
    const snapshot = this.coordinatorSnapshot(threadId)
    const checkpoint = {
      id: randomUUID(),
      type:
        action === "present_script"
          ? ("script_checkpoint" as const)
          : action === "present_direction"
            ? ("direction_checkpoint" as const)
            : action === "present_scene_qa"
              ? ("qa_report_checkpoint" as const)
              : action === "present_audio_chart"
                ? ("audio_chart_checkpoint" as const)
                : ("final_review_checkpoint" as const),
      artifactId: artifact.id,
      payload: { artifactId: artifact.id, artifactVersion: artifact.version, version: artifact.version },
    }
    const execution = await this.parentActionExecutor().execute({
      snapshot,
      request: { action, idempotencyKey: actionIdempotencyKey(snapshot, action) },
      effect: async () => ({ outcome: { checkpointId: checkpoint.id }, checkpoint }),
    })
    if (execution.status === "failed") throw new Error(execution.error.message)
    if (execution.status === "idempotent") return
    if (execution.status !== "succeeded") throw new Error(`${action} requires recovery: ${execution.status}`)
    if (!execution.committedCheckpoint) throw new Error(`${action} completed without its checkpoint`)
    this.eventBus.publish({ threadId, type: "checkpoint", payload: execution.committedCheckpoint })
  }

  private async executeAudioPlannerParentAction(threadId: string, signal?: AbortSignal): Promise<void> {
    const script = this.latestArtifact<ScriptDraft>(threadId, "script")
    const direction = this.latestArtifact<DirectionDraft>(threadId, "direction")
    const brief = this.latestArtifact<ProductionBriefArtifact>(threadId, "production_brief")
    const selectedTarget = this.latestArtifact<SelectedTargetArtifact>(threadId, "selected_target")
    if (!script?.approved || !direction?.approved)
      throw new Error("Audio planning requires approved script and direction")
    if (!brief?.approved || !selectedTarget?.approved || !isCurrentSelectedTarget(selectedTarget, brief)) {
      throw new Error("Audio planning requires the current selected target")
    }
    const target = summarizeSelectedRegisteredTarget({ target: { id: selectedTarget.data.target.id } })
    if (!target.ok) throw new Error("Audio planner selected target no longer resolves")
    const preferences = this.providedBriefValue(brief.data.brief.audioPreferences)
    const soundValues = preferences ? [preferences.music, preferences.soundEffects] : []
    const soundDesign = soundValues.includes("required")
      ? ("required" as const)
      : soundValues.length > 0 && soundValues.every((value) => value === "none")
        ? ("none" as const)
        : ("optional" as const)
    const snapshot = this.coordinatorSnapshot(threadId)
    const action = "run_audio_planner" as const
    const execution = await this.parentActionExecutor().execute({
      snapshot,
      request: { action, idempotencyKey: actionIdempotencyKey(snapshot, action) },
      effect: async () => {
        const result = await this.createAudioPlannerSpecialistRunner(threadId).run(
          script.data,
          direction.data,
          {
            language: this.providedBriefValue(brief.data.brief.language),
            voiceover: preferences?.voiceover,
            soundDesign,
            notes: preferences ? [...preferences.accessibilityNotes, ...preferences.notes] : [],
            selectedTarget: target.target,
          },
          {},
          signal,
        )
        validateAudioChart(result.chart, script.data.scenes.length, listAudioLibrary())
        return {
          outcome: { runId: result.runId, modelRoute: result.modelRoute },
          artifacts: [{ id: randomUUID(), threadId, kind: "audio_chart" as const, data: result.chart }],
          effectMetadata: { runId: result.runId, modelRoute: result.modelRoute },
        }
      },
    })
    if (execution.status === "failed") throw new Error(execution.error.message)
    if (execution.status === "idempotent") return
    if (execution.status !== "succeeded")
      throw new Error(`Audio planner parent action requires recovery: ${execution.status}`)
    for (const artifact of execution.committedArtifacts) {
      this.eventBus.publish({ threadId, type: "artifact_updated", payload: { kind: artifact.kind, artifact } })
    }
  }

  private async executeRenderReviewParentAction(threadId: string, signal?: AbortSignal): Promise<void> {
    const render = this.latestArtifact<RenderJobStatus>(threadId, "render_job")
    if (!render?.approved || render.data.status !== "done")
      throw new Error("Render review requires a completed render job")
    const snapshot = this.coordinatorSnapshot(threadId)
    const action = "review_render" as const
    const execution = await this.parentActionExecutor().execute({
      snapshot,
      request: { action, idempotencyKey: actionIdempotencyKey(snapshot, action) },
      effect: async () => {
        const report = await this.reviewRender(render.data.id, signal)
        return {
          outcome: { passed: report.passed, failures: report.failures },
          artifacts: [{ id: randomUUID(), threadId, kind: "render_review" as const, data: report }],
          effectMetadata: { renderJobId: render.data.id },
        }
      },
    })
    if (execution.status === "failed") throw new Error(execution.error.message)
    if (execution.status === "idempotent") return
    if (execution.status !== "succeeded") throw new Error(`Render review requires recovery: ${execution.status}`)
    for (const artifact of execution.committedArtifacts) {
      this.eventBus.publish({ threadId, type: "artifact_updated", payload: { kind: artifact.kind, artifact } })
    }
  }

  private async executePublicationParentAction(threadId: string): Promise<void> {
    const config = this.latestArtifact<Record<string, unknown>>(threadId, "config")
    const review = this.latestArtifact<RenderReviewReport>(threadId, "render_review")
    if (!config || !review?.approved || !review.data.passed) {
      throw new Error("Publication requires final human-approved passing render review")
    }
    const snapshot = this.coordinatorSnapshot(threadId)
    const action = "publish" as const
    const execution = await this.parentActionExecutor().execute({
      snapshot,
      request: { action, idempotencyKey: actionIdempotencyKey(snapshot, action) },
      resumeInProgress: true,
      effect: async () => {
        const title = typeof config.data.title === "string" ? config.data.title : String(config.data.id ?? threadId)
        const slug = typeof config.data.id === "string" ? config.data.id : configIdFromTitle(title)
        const files = new Map<string, string>()
        files.set("config.json", JSON.stringify(config.data, null, 2) + "\n")
        const script = this.latestArtifact<ScriptDraft>(threadId, "script")
        if (script?.approved) {
          files.set("script.json", JSON.stringify(script.data, null, 2) + "\n")
          const markdown = scriptToMarkdown(script.data)
          files.set("script.md", markdown.endsWith("\n") ? markdown : `${markdown}\n`)
        }
        const direction = this.latestArtifact<DirectionDraft>(threadId, "direction")
        if (direction?.approved) files.set("direction.json", JSON.stringify(direction.data, null, 2) + "\n")
        const qa = this.latestArtifact<SceneQaReport>(threadId, "qa_report")
        if (qa) files.set("qa-report.json", JSON.stringify(qa.data, null, 2) + "\n")
        const audio = this.latestArtifact<AudioChart>(threadId, "audio_chart")
        if (audio?.approved) files.set("audio-chart.json", JSON.stringify(audio.data, null, 2) + "\n")
        files.set("render-review.json", JSON.stringify(review.data, null, 2) + "\n")
        const written = await this.publishFiles(slug, files)
        return { outcome: { slug, written }, effectMetadata: { slug, written } }
      },
    })
    if (execution.status === "failed") throw new Error(execution.error.message)
    if (execution.status === "idempotent") return
    if (execution.status !== "succeeded") throw new Error(`Publication requires recovery: ${execution.status}`)
    this.eventBus.publish({
      threadId,
      type: "artifact_updated",
      payload: { kind: "published_artifacts", outcome: execution.result.outcome },
    })
  }

  private async executeRenderParentAction(threadId: string, signal?: AbortSignal): Promise<void> {
    const config = this.latestArtifact<Record<string, unknown>>(threadId, "config")
    const validation = this.latestArtifact(threadId, "validation_report")
    if (!config || !validation?.approved) throw new Error("Render requires exact approved validation evidence")
    const snapshot = this.coordinatorSnapshot(threadId)
    const action = "render" as const
    const key = actionIdempotencyKey(snapshot, action)
    const payload = { ...config.data, _threadId: threadId, _skipAudioGeneration: true }
    const requestHash = configContentHash(payload)
    const execution = await this.parentActionExecutor().execute({
      snapshot,
      request: { action, idempotencyKey: key },
      resumeInProgress: true,
      effect: async () => {
        const submission = await this.submitRender(payload, key, requestHash, signal)
        let job: RenderJobStatus | undefined
        for (let poll = 0; poll < 600; poll += 1) {
          job = await this.getRenderStatus(submission.jobId, signal)
          this.eventBus.publish({ threadId, type: "render_status", payload: job })
          if (job.status === "done") break
          if (job.status === "error") throw new Error(`Render failed: ${job.error ?? "unknown error"}`)
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
        if (!job || job.status !== "done") throw new Error(`Render timed out: ${submission.jobId}`)
        return {
          outcome: { jobId: job.id, reused: submission.reused, outputPath: job.output_path },
          artifacts: [{ id: randomUUID(), threadId, kind: "render_job" as const, data: job, approved: true }],
          planEffects: [{ type: "complete_step" as const, stepId: "render" }],
          effectMetadata: { jobId: job.id, requestHash, providerIdempotencyKey: key },
        }
      },
    })
    if (execution.status === "failed") throw new Error(execution.error.message)
    if (execution.status === "idempotent") return
    if (execution.status !== "succeeded") throw new Error(`Render parent action requires recovery: ${execution.status}`)
    for (const artifact of execution.committedArtifacts) {
      this.eventBus.publish({ threadId, type: "artifact_updated", payload: { kind: artifact.kind, artifact } })
    }
  }

  private async executeFinalValidationParentAction(threadId: string, signal?: AbortSignal): Promise<void> {
    const config = this.latestArtifact<Record<string, unknown>>(threadId, "config")
    const audioAssets = this.latestArtifact(threadId, "audio_assets")
    if (!config || !audioAssets) throw new Error("Final validation requires config and produced audio assets")
    const snapshot = this.coordinatorSnapshot(threadId)
    const action = "validate_final" as const
    const execution = await this.parentActionExecutor().execute({
      snapshot,
      request: { action, idempotencyKey: actionIdempotencyKey(snapshot, action) },
      effect: async () => {
        const result = await this.validateFinalConfig(config.data, signal)
        if (!result.valid) throw new Error(`Final config validation failed: ${JSON.stringify(result.errors ?? [])}`)
        return {
          outcome: { valid: true, configHash: configContentHash(config.data) },
          artifacts: [
            {
              id: randomUUID(),
              threadId,
              kind: "validation_report" as const,
              approved: true,
              data: {
                schemaVersion: 1,
                valid: true,
                configArtifactId: config.id,
                configVersion: config.version,
                configHash: configContentHash(config.data),
                errors: [],
              },
            },
          ],
          planEffects: [{ type: "complete_step" as const, stepId: "final_validation" }],
          effectMetadata: { configArtifactId: config.id, audioAssetsArtifactId: audioAssets.id },
        }
      },
    })
    if (execution.status === "failed") throw new Error(execution.error.message)
    if (execution.status === "idempotent") return
    if (execution.status !== "succeeded") throw new Error(`Final validation requires recovery: ${execution.status}`)
    for (const artifact of execution.committedArtifacts) {
      this.eventBus.publish({ threadId, type: "artifact_updated", payload: { kind: artifact.kind, artifact } })
    }
  }

  private async executeAudioProductionParentAction(threadId: string): Promise<void> {
    const config = this.latestArtifact<Record<string, unknown>>(threadId, "config")
    const chart = this.latestArtifact<AudioChart>(threadId, "audio_chart")
    const script = this.latestArtifact<ScriptDraft>(threadId, "script")
    if (!config || !chart?.approved || !script?.approved) {
      throw new Error("Audio production requires config plus approved chart and script")
    }
    const hasApiVoice = Object.values(chart.data.voiceover?.scenes ?? {}).some((text) => text.trim().length > 0)
    if (hasApiVoice) {
      throw new Error(
        "API voice production remains disabled until durable provider-receipt reconciliation is configured",
      )
    }
    const snapshot = this.coordinatorSnapshot(threadId)
    const action = "produce_audio_assets" as const
    const execution = await this.parentActionExecutor().execute({
      snapshot,
      request: { action, idempotencyKey: actionIdempotencyKey(snapshot, action) },
      effect: async () => {
        const manifest = await this.createAudioAssetProducer().produce({
          config: config.data,
          configPath: config.path ?? "",
          chart: chart.data,
          sceneCount: script.data.scenes.length,
        })
        return {
          outcome: { configId: manifest.configId, assets: manifest.assets.length },
          artifacts: [{ id: randomUUID(), threadId, kind: "audio_assets" as const, data: manifest, approved: true }],
          planEffects: [
            { type: "complete_step" as const, stepId: "voice_generation" },
            { type: "complete_step" as const, stepId: "sound_assets" },
          ],
          effectMetadata: { mode: chart.data.soundDesign.musicBed ? "local_deterministic" : "silent" },
        }
      },
    })
    if (execution.status === "failed") throw new Error(execution.error.message)
    if (execution.status === "idempotent") return
    if (execution.status !== "succeeded") {
      const reason = execution.status === "rejected" ? execution.evaluation.failure?.message : undefined
      throw new Error(`Audio production requires recovery: ${execution.status}${reason ? ` (${reason})` : ""}`)
    }
    for (const artifact of execution.committedArtifacts) {
      this.eventBus.publish({ threadId, type: "artifact_updated", payload: { kind: artifact.kind, artifact } })
    }
  }

  private async executeSceneQaParentAction(threadId: string, signal?: AbortSignal): Promise<void> {
    const config = this.latestArtifact<Record<string, unknown>>(threadId, "config")
    const script = this.latestArtifact<ScriptDraft>(threadId, "script")
    const direction = this.latestArtifact<DirectionDraft>(threadId, "direction")
    const brief = this.latestArtifact<ProductionBriefArtifact>(threadId, "production_brief")
    const selectedTarget = this.latestArtifact<SelectedTargetArtifact>(threadId, "selected_target")
    const audio = this.latestArtifact<AudioChart>(threadId, "audio_chart")
    if (!config || !script?.approved || !direction?.approved) {
      throw new Error("Scene QA requires config plus approved script and direction")
    }
    if (!brief?.approved || !selectedTarget?.approved || !isCurrentSelectedTarget(selectedTarget, brief)) {
      throw new Error("Scene QA requires the current selected target")
    }
    const target = summarizeSelectedRegisteredTarget({ target: { id: selectedTarget.data.target.id } })
    if (!target.ok) throw new Error("Scene QA selected target no longer resolves")
    const snapshot = this.coordinatorSnapshot(threadId)
    const action = "run_scene_qa" as const
    const execution = await this.parentActionExecutor().execute({
      snapshot,
      request: { action, idempotencyKey: actionIdempotencyKey(snapshot, action) },
      effect: async () => {
        const stills = await this.createSceneStillClient().render(config.data, script.data.scenes.length, signal)
        const result = await this.createSceneQaSpecialistRunner(threadId).run({
          config: config.data,
          script: script.data,
          direction: direction.data,
          audioChart: audio?.approved ? audio.data : undefined,
          stills,
          selectedTarget: target.target,
        })
        const qaArtifactId = randomUUID()
        const qaArtifactVersion = (this.latestArtifact<SceneQaReport>(threadId, "qa_report")?.version ?? 0) + 1
        const qaLineage: QaReportLineage = {
          schemaVersion: 1,
          qaReport: {
            artifactId: qaArtifactId,
            version: qaArtifactVersion,
            contentHash: configContentHash(result.report),
          },
          config: {
            artifactId: config.id,
            version: config.version,
            contentHash: configContentHash(config.data),
          },
        }
        return {
          outcome: { runId: result.runId, modelRoute: result.modelRoute },
          artifacts: [
            { id: qaArtifactId, threadId, kind: "qa_report" as const, data: result.report },
            { id: randomUUID(), threadId, kind: "qa_lineage" as const, data: qaLineage, approved: true },
          ],
          ...(result.report.scenes.every((scene) => scene.verdict === "PASS")
            ? { planEffects: [{ type: "complete_step" as const, stepId: "scene_qa" }] }
            : {}),
          effectMetadata: { runId: result.runId, modelRoute: result.modelRoute },
        }
      },
    })
    if (execution.status === "failed") throw new Error(execution.error.message)
    if (execution.status === "idempotent") return
    if (execution.status !== "succeeded")
      throw new Error(`Scene QA parent action requires recovery: ${execution.status}`)
    for (const artifact of execution.committedArtifacts) {
      this.eventBus.publish({ threadId, type: "artifact_updated", payload: { kind: artifact.kind, artifact } })
    }
  }

  private async executeConfigParentAction(
    threadId: string,
    action: "generate_draft_config" | "generate_final_config",
    signal?: AbortSignal,
  ): Promise<void> {
    const snapshot = this.coordinatorSnapshot(threadId)
    const request = { action, idempotencyKey: actionIdempotencyKey(snapshot, action) }
    const brief = this.latestArtifact<ProductionBriefArtifact>(threadId, "production_brief")
    const selectedTarget = this.latestArtifact<SelectedTargetArtifact>(threadId, "selected_target")
    const script = this.latestArtifact<ScriptDraft>(threadId, "script")
    const direction = this.latestArtifact<DirectionDraft>(threadId, "direction")
    const audio = this.latestArtifact<AudioChart>(threadId, "audio_chart")
    if (!brief?.approved || !selectedTarget?.approved || !script?.approved || !direction?.approved) {
      throw new Error("Config action requires approved brief, selected target, script, and direction")
    }
    if (!isCurrentSelectedTarget(selectedTarget, brief))
      throw new Error("Selected target is stale for the current brief")
    if (action === "generate_final_config" && !audio?.approved) {
      throw new Error("Final config action requires approved audio")
    }
    const target = summarizeSelectedRegisteredTarget({ target: { id: selectedTarget.data.target.id } })
    if (!target.ok) throw new Error("Selected target no longer resolves in the parent registry")
    const previousConfig = this.latestArtifact<Record<string, unknown>>(threadId, "config")
    const previousLineage = this.latestArtifact<{
      configArtifactId: string
      configVersion: number
      configHash: string
      lineage: ConfigLineageMetadata
    }>(threadId, "config_lineage")
    if (
      previousConfig &&
      (!previousLineage ||
        previousLineage.data.configArtifactId !== previousConfig.id ||
        previousLineage.data.configVersion !== previousConfig.version)
    ) {
      throw new Error("Previous config is missing matching parent-owned lineage")
    }
    const previousConfigMatchesCurrentInputs = Boolean(
      previousConfig &&
      previousLineage &&
      previousLineage.data.lineage.script.artifactId === script.id &&
      previousLineage.data.lineage.script.version === script.version &&
      previousLineage.data.lineage.direction.artifactId === direction.id &&
      previousLineage.data.lineage.direction.version === direction.version,
    )
    const input: ConfigSpecialistInput = {
      productionBrief: { artifactId: brief.id, version: brief.version, approved: true, data: brief.data },
      target: target.target,
      script: { artifactId: script.id, version: script.version, approved: true, data: script.data },
      direction: { artifactId: direction.id, version: direction.version, approved: true, data: direction.data },
      ...(action === "generate_final_config" && audio
        ? { audio: { artifactId: audio.id, version: audio.version, approved: true as const, data: audio.data } }
        : {}),
      previousConfig:
        previousConfig && previousLineage && previousConfigMatchesCurrentInputs
          ? {
              artifactId: previousConfig.id,
              version: previousConfig.version,
              latestVersion: previousConfig.version,
              data: previousConfig.data,
              contentHash: configContentHash(previousConfig.data),
              lineage: previousLineage.data.lineage,
            }
          : null,
    }
    const execution = await this.parentActionExecutor().execute({
      snapshot,
      request,
      effect: async () => {
        const result = await this.createConfigSpecialistRunner(threadId).run(input, signal)
        assertConfigResultBoundToInput(input, result)
        const configId = randomUUID()
        const configVersion = (previousConfig?.version ?? 0) + 1
        return {
          outcome: { runId: result.runId, modelRoute: result.modelRoute, configHash: result.configHash },
          artifacts: [
            { id: configId, threadId, kind: "config" as const, data: result.config },
            {
              id: randomUUID(),
              threadId,
              kind: "config_lineage" as const,
              data: {
                configArtifactId: configId,
                configVersion,
                configHash: result.configHash,
                lineage: result.lineage,
              },
            },
          ],
          planEffects: [{ type: "complete_step" as const, stepId: "config_generation" }],
          effectMetadata: { runId: result.runId, modelRoute: result.modelRoute },
        }
      },
    })
    if (execution.status === "failed") throw new Error(execution.error.message)
    if (execution.status !== "succeeded" && execution.status !== "idempotent") {
      const reason = execution.status === "rejected" ? execution.evaluation.failure?.message : undefined
      throw new Error(`Parent config action requires recovery: ${execution.status}${reason ? ` (${reason})` : ""}`)
    }
    if (execution.status === "idempotent") return
    for (const artifact of execution.committedArtifacts) {
      this.eventBus.publish({ threadId, type: "artifact_updated", payload: { kind: artifact.kind, artifact } })
    }
  }

  private coordinatorSnapshot(threadId: string) {
    return {
      plan: this.store.getPipelinePlan(threadId),
      checkpoint: this.store.getThread(threadId)?.checkpoint ?? null,
      artifacts: this.store.listArtifacts(threadId),
      executedActionKeys: this.store
        .listActionAttempts(threadId, { status: "succeeded", limit: 10_000 })
        .map((attempt) => attempt.actionKey),
    }
  }

  private async executeTargetParentAction(threadId: string, requestText?: string): Promise<void> {
    const brief = this.latestArtifact<ProductionBriefArtifact>(threadId, "production_brief")
    if (!brief) throw new Error("Target resolution requires a persisted production brief")
    const validation = validateProductionBriefArtifact(brief.data)
    if (!validation.valid || !validation.ready || !brief.approved) {
      throw new Error("Target resolution requires the latest production brief to be valid, ready, and approved")
    }
    const snapshot = this.coordinatorSnapshot(threadId)
    const request = {
      action: "resolve_target" as const,
      idempotencyKey: actionIdempotencyKey(snapshot, "resolve_target"),
    }
    const execution = await this.parentActionExecutor().execute({
      snapshot,
      request,
      effect: async () => {
        const resolution = resolveProductionBriefTarget(brief.data)
        if (!resolution.ok) {
          const questions =
            resolution.kind === "unresolved"
              ? [
                  {
                    field: "target",
                    question:
                      resolution.code === "ambiguous_target"
                        ? "Which compatible target id should be selected?"
                        : "Which registered target id should be used?",
                    candidates: resolution.candidates,
                  },
                ]
              : resolution.issues.map((issue) => ({
                  field: issue.field,
                  question: `What supported value should replace the explicit unsupported ${issue.field} value?`,
                  requested: issue.requested,
                  supported: issue.supported,
                }))
          return {
            outcome: { status: "needs_input", resolution: { kind: resolution.kind, code: resolution.code } },
            checkpoint: {
              id: randomUUID(),
              type: "target_clarification" as const,
              artifactId: brief.id,
              payload: {
                productionBriefArtifactId: brief.id,
                productionBriefVersion: brief.version,
                artifactVersion: brief.version,
                ...(requestText ? { request: requestText } : {}),
                resolution: { kind: resolution.kind, code: resolution.code },
                questions,
                registry: listRegisteredTargetSummaries(),
              },
            },
          }
        }
        const selected = buildSelectedTargetArtifact(resolution.target, brief)
        return {
          outcome: { status: "selected", targetId: selected.target.id },
          artifacts: [
            {
              id: randomUUID(),
              threadId,
              kind: "selected_target" as const,
              data: selected,
              approved: true,
            },
          ],
        }
      },
    })
    if (execution.status === "failed") throw new Error(execution.error.message)
    if (execution.status === "rejected" || execution.status === "conflict") {
      throw new Error(`Parent target action was ${execution.status}`)
    }
    if (execution.status === "in_progress" || execution.status === "retry_required") {
      throw new Error(`Parent target action requires recovery: ${execution.status}`)
    }
    if (execution.status === "idempotent") return
    if (execution.status !== "succeeded") throw new Error(`Unexpected parent target status: ${execution.status}`)
    const artifact = execution.committedArtifacts[0]
    if (artifact) {
      const selected = artifact.data as SelectedTargetArtifact
      this.eventBus.publish({
        threadId,
        type: "artifact_updated",
        payload: {
          kind: "selected_target",
          artifact,
          targetId: selected.target.id,
          targetSchemaVersion: selected.target.schemaVersion,
        },
      })
    }
    if (execution.committedCheckpoint) {
      this.eventBus.publish({ threadId, type: "checkpoint", payload: execution.committedCheckpoint })
    }
  }

  private async executeIntakeParentAction(threadId: string, requestText: string): Promise<void> {
    const snapshot = this.coordinatorSnapshot(threadId)
    const request = {
      action: "run_intake" as const,
      idempotencyKey: actionIdempotencyKey(snapshot, "run_intake"),
    }
    const execution = await this.parentActionExecutor().execute({
      snapshot,
      request,
      effect: async () => {
        const result = await this.createProductionBriefIntakeRunner(threadId).run(requestText)
        const validation = validateProductionBriefArtifact(result.artifact)
        if (!validation.valid) throw new Error(`Parent rejected the intake artifact: ${validation.errors.join("; ")}`)
        const ready = validation.ready
        const artifactId = randomUUID()
        const checkpoint = ready
          ? null
          : {
              id: randomUUID(),
              type: "intake_clarification" as const,
              artifactId,
              payload: {
                request: requestText,
                artifactVersion: 1,
                questions: validation.questions.filter((question) => question.required),
              },
            }
        return {
          outcome: { status: ready ? "ready" : "needs_input", runId: result.runId, modelRoute: result.modelRoute },
          artifacts: [
            {
              id: artifactId,
              threadId,
              kind: "production_brief" as const,
              data: result.artifact,
              approved: ready,
            },
          ],
          checkpoint,
          effectMetadata: { runId: result.runId, modelRoute: result.modelRoute },
        }
      },
    })
    if (execution.status === "failed") throw new Error(execution.error.message)
    if (execution.status === "rejected" || execution.status === "conflict") {
      throw new Error(`Parent intake action was ${execution.status}`)
    }
    if (execution.status === "in_progress" || execution.status === "retry_required") {
      throw new Error(`Parent intake action requires recovery: ${execution.status}`)
    }
    if (execution.status === "idempotent") return
    if (execution.status !== "succeeded") throw new Error(`Unexpected parent intake status: ${execution.status}`)
    const artifact = execution.committedArtifacts[0]
    if (!artifact) throw new Error("Atomic intake action completed without its production brief")
    this.eventBus.publish({
      threadId,
      type: "artifact_updated",
      payload: { kind: "production_brief", artifact, status: artifact.approved ? "ready" : "needs_input" },
    })
    if (execution.committedCheckpoint) {
      this.eventBus.publish({ threadId, type: "checkpoint", payload: execution.committedCheckpoint })
    }
  }

  private async advanceCanonicalNewVideo(threadId: string, request: string): Promise<void> {
    for (let transition = 0; transition < 10; transition += 1) {
      const thread = this.store.getThread(threadId)
      const action = deriveCoordinatorAction({
        plan: this.store.getPipelinePlan(threadId),
        checkpoint: thread?.checkpoint ?? null,
        artifacts: this.store.listArtifacts(threadId),
      })
      if (action === "run_intake") {
        await this.executeIntakeParentAction(threadId, request)
        if (this.store.getThread(threadId)?.checkpoint) return
        continue
      }
      if (action === "resolve_target") {
        await this.executeTargetParentAction(threadId, request)
        if (this.store.getThread(threadId)?.checkpoint) return
        continue
      }
      if (action === "research_or_skip") {
        await this.executeResearchParentAction(threadId, request)
        continue
      }
      if (action === "run_copywriter") {
        await this.executeCopywriterParentAction(threadId, request)
        continue
      }
      if (action === "run_scene_composer") {
        await this.executeSceneComposerParentAction(threadId)
        return
      }
      if (action === "generate_scene_candidate") {
        await this.executeSceneCandidateParentAction(threadId)
        return
      }
      if (action === "promote_scene_candidate") {
        await this.executeSceneCandidatePromotionParentAction(threadId)
        continue
      }
      if (
        action === "present_script" ||
        action === "present_direction" ||
        action === "present_scene_qa" ||
        action === "present_audio_chart" ||
        action === "present_final_review"
      ) {
        await this.executePresentationParentAction(threadId, action)
        return
      }
      if (action === "run_direction") {
        await this.executeDirectionParentAction(threadId)
        continue
      }
      if (action === "revise_direction") {
        await this.executeDirectionRevisionParentAction(threadId)
        continue
      }
      if (action === "generate_draft_config" || action === "generate_final_config") {
        await this.executeConfigParentAction(threadId, action)
        continue
      }
      if (action === "run_scene_qa") {
        await this.executeSceneQaParentAction(threadId)
        continue
      }
      if (action === "run_audio_planner") {
        await this.executeAudioPlannerParentAction(threadId)
        continue
      }
      if (action === "produce_audio_assets") {
        await this.executeAudioProductionParentAction(threadId)
        continue
      }
      if (action === "validate_final") {
        await this.executeFinalValidationParentAction(threadId)
        continue
      }
      if (action === "render") {
        await this.executeRenderParentAction(threadId)
        continue
      }
      if (action === "review_render") {
        await this.executeRenderReviewParentAction(threadId)
        continue
      }
      if (action === "publish") {
        await this.executePublicationParentAction(threadId)
        continue
      }
      if (
        action === "wait_for_human" ||
        action === "complete" ||
        action === "unsupported_mode" ||
        action === "invalid_plan" ||
        action === "create_plan"
      ) {
        return
      }
      throw new Error(`Canonical coordinator action '${action}' has no parent-owned adapter`)
    }
    throw new Error("Canonical coordinator exceeded its transition budget before reaching a checkpoint")
  }

  private latestArtifact<TData>(threadId: string, kind: ArtifactRecord["kind"]): ArtifactRecord<TData> | undefined {
    return this.store
      .listArtifacts(threadId)
      .filter((artifact) => artifact.kind === kind)
      .sort((left, right) => right.version - left.version)[0] as ArtifactRecord<TData> | undefined
  }

  private checkpointArtifactVersion(checkpoint: { payload: unknown }): number | undefined {
    const payload = this.clarificationPayload(checkpoint)
    if (typeof payload.artifactVersion === "number") return payload.artifactVersion
    return typeof payload.productionBriefVersion === "number" ? payload.productionBriefVersion : undefined
  }

  private clarificationPayload(checkpoint: { payload: unknown }): {
    request?: unknown
    artifactVersion?: unknown
    productionBriefVersion?: unknown
    productionBriefArtifactId?: unknown
    resolutionCode?: unknown
    questions?: unknown
  } {
    if (typeof checkpoint.payload !== "object" || checkpoint.payload === null || Array.isArray(checkpoint.payload)) {
      return {}
    }
    const payload = checkpoint.payload as Record<string, unknown>
    const resolution =
      typeof payload.resolution === "object" && payload.resolution !== null && !Array.isArray(payload.resolution)
        ? (payload.resolution as Record<string, unknown>)
        : undefined
    return {
      request: payload.request,
      artifactVersion: payload.artifactVersion,
      productionBriefVersion: payload.productionBriefVersion,
      productionBriefArtifactId: payload.productionBriefArtifactId,
      resolutionCode: resolution?.code,
      questions: payload.questions,
    }
  }

  private exactTargetChoice(feedback: string, payload: { questions?: unknown }): string | undefined {
    if (!Array.isArray(payload.questions)) return undefined
    const candidates = payload.questions.flatMap((question) => {
      if (typeof question !== "object" || question === null || Array.isArray(question)) return []
      const values = (question as { candidates?: unknown }).candidates
      return Array.isArray(values) ? values.filter((value): value is string => typeof value === "string") : []
    })
    return candidates.includes(feedback) && REGISTERED_TARGETS.targets.some((target) => target.id === feedback)
      ? feedback
      : undefined
  }

  private reviseBriefTarget(artifact: ProductionBriefArtifact, targetId: string): ProductionBriefCandidate {
    const { schemaVersion, ...fields } = artifact.brief
    void schemaVersion
    return {
      ...fields,
      targetRequirements: {
        status: "provided",
        value: [{ name: "target.id", requirement: targetId }],
        source: "human_review",
      },
    }
  }

  private persistProductionBriefRevision(threadId: string, candidate: ProductionBriefCandidate): void {
    const data = buildProductionBriefArtifact(candidate)
    const validation = validateProductionBriefArtifact(data)
    if (!validation.valid || !validation.ready) {
      throw new Error(`Parent rejected the target clarification: ${validation.errors.join("; ")}`)
    }
    const artifact = this.store.saveArtifact({ threadId, kind: "production_brief", data, approved: true })
    this.eventBus.publish({
      threadId,
      type: "artifact_updated",
      payload: { kind: "production_brief", artifact, status: "ready" },
    })
  }

  dispose(): void {
    // Specialist sessions own and dispose their isolated contexts per action.
  }
}
