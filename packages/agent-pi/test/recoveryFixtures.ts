import type {
  ArtifactKind,
  ArtifactRecord,
  AudioChart,
  CheckpointKind,
  CheckpointRecord,
  PipelineMode,
  PipelinePlan,
  SceneCompositionResult,
  SceneQaReport,
  ScriptDraft,
  RenderReviewReport,
} from "../src/types.js"
import { contentHash } from "../src/contentHash.js"
import { CANONICAL_MODE_STEPS, type CoordinatorSnapshot } from "../src/coordinator.js"
import { buildProductionBriefArtifact, type ProductionBriefCandidate } from "../src/productionBrief.js"
import { buildSelectedTargetArtifact, REGISTERED_TARGETS } from "../src/targetContracts.js"
import type { AgentPiStore } from "../src/store.js"

const CREATED_AT = "2026-07-12T00:00:00.000Z"

type StatusOverrides = Partial<Record<string, PipelinePlan["steps"][number]["status"]>>

export interface RecoveryCheckpointFixture {
  readonly name: string
  readonly checkpoint: CheckpointRecord
  readonly plan: PipelinePlan
  readonly artifacts: readonly ArtifactRecord[]
  readonly snapshot: CoordinatorSnapshot
  readonly approve: Record<string, unknown>
  readonly reject: Record<string, unknown>
  readonly expectedAfterApproval: string
  readonly expectedAfterRejection: string
}

export interface RecoveryClarificationFixture {
  readonly name: string
  readonly kind: "intake_clarification" | "target_clarification"
  readonly question: string
  readonly snapshot: CoordinatorSnapshot
}

export function buildPipelinePlan(threadId: string, statuses: StatusOverrides = {}): PipelinePlan {
  const steps = CANONICAL_MODE_STEPS.new_video.map((step) => ({
    ...step,
    status: statuses[step.id] ?? ("pending" as const),
    summary: "",
    artifactPaths: [],
    blockers: [],
  }))
  return {
    schemaVersion: 1,
    id: `${threadId}-plan`,
    threadId,
    mode: "new_video",
    goal: "Recover a deterministic video pipeline",
    status: "active",
    steps,
    decisions: [],
    currentStepId: steps.find((step) => step.status === "in_progress")?.id ?? steps[0]?.id ?? null,
    progress: {
      completed: steps.filter((step) => step.status === "completed" || step.status === "skipped").length,
      total: steps.length,
    },
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  }
}

export function buildArtifact<TData>(
  threadId: string,
  kind: ArtifactKind,
  data: TData,
  approved = false,
  version = 1,
): ArtifactRecord<TData> {
  return {
    id: `${threadId}-${kind}-${version}`,
    threadId,
    kind,
    version,
    path: null,
    data,
    approved,
    createdAt: CREATED_AT,
  }
}

const provided = <T>(value: T) => ({ status: "provided" as const, value, source: "user" as const })
const absent = (rationale: string) => ({ status: "explicitly_absent" as const, rationale })

function foundationArtifacts(threadId: string): ArtifactRecord[] {
  const candidate: ProductionBriefCandidate = {
    subject: provided("Recovery fixture subject"),
    objective: provided("Exercise deterministic recovery"),
    audience: provided("Recovery test audience"),
    language: provided("Fixture language"),
    platform: provided("Fixture platform"),
    format: provided("video/mp4"),
    dimensions: provided({ width: 1280, height: 720, unit: "px" }),
    aspectRatio: provided("16:9"),
    duration: provided({ seconds: 30 }),
    brand: absent("Not applicable to this fixture"),
    tone: absent("Not applicable to this fixture"),
    evidence: absent("No external evidence in this fixture"),
    assets: absent("No assets in this fixture"),
    constraints: absent("No extra constraints in this fixture"),
    audioPreferences: absent("No audio preference in this fixture"),
    targetRequirements: provided([{ name: "target.id", requirement: "target.video.001" }]),
    acceptanceCriteria: provided(["Recovery remains deterministic"]),
    researchRequirement: provided("not_required"),
    researchRationale: provided("Fixture facts require no external verification"),
  }
  const brief = buildArtifact(threadId, "production_brief", buildProductionBriefArtifact(candidate), true)
  const target = REGISTERED_TARGETS.targets.find((entry) => entry.id === "target.video.001")!
  const selected = buildArtifact(threadId, "selected_target", buildSelectedTargetArtifact(target, brief), true)
  return [brief, selected]
}

export function buildInitialSnapshot(threadId = "recovery-thread"): CoordinatorSnapshot {
  const plan = buildPipelinePlan(threadId, { research: "skipped" })
  return { plan, checkpoint: null, artifacts: foundationArtifacts(threadId) }
}

const script = (threadId: string, approved: boolean, missingCapabilities: string[] = []) =>
  buildArtifact<ScriptDraft>(
    threadId,
    "script",
    {
      title: "Recovery script",
      objective: "Exercise checkpoint recovery",
      scenes: [{ id: "scene-1", type: "callout", durationInSeconds: 4, missingCapabilities }],
    },
    approved,
  )

const direction = (threadId: string, approved: boolean) =>
  buildArtifact(threadId, "direction", { title: "Recovery direction", scenes: [], warnings: [] }, approved)

function lineageArtifacts(
  threadId: string,
  scriptArtifact: ArtifactRecord<ScriptDraft>,
  directionArtifact: ArtifactRecord,
  configArtifact: ArtifactRecord,
  qaArtifact?: ArtifactRecord<SceneQaReport>,
): ArtifactRecord[] {
  const configLineage = buildArtifact(
    threadId,
    "config_lineage",
    {
      configArtifactId: configArtifact.id,
      configVersion: configArtifact.version,
      configHash: contentHash(configArtifact.data),
      lineage: {
        script: {
          artifactId: scriptArtifact.id,
          version: scriptArtifact.version,
          contentHash: contentHash(scriptArtifact.data),
        },
        direction: {
          artifactId: directionArtifact.id,
          version: directionArtifact.version,
          contentHash: contentHash(directionArtifact.data),
        },
      },
    },
    true,
  )
  if (!qaArtifact) return [configLineage]
  return [
    configLineage,
    buildArtifact(
      threadId,
      "qa_lineage",
      {
        schemaVersion: 1,
        qaReport: {
          artifactId: qaArtifact.id,
          version: qaArtifact.version,
          contentHash: contentHash(qaArtifact.data),
        },
        config: {
          artifactId: configArtifact.id,
          version: configArtifact.version,
          contentHash: contentHash(configArtifact.data),
        },
      },
      true,
    ),
  ]
}

const chart = (threadId: string, approved: boolean) =>
  buildArtifact<AudioChart>(
    threadId,
    "audio_chart",
    { voiceover: null, soundDesign: { enabled: false, musicBed: null, sfx: [] }, warnings: [] },
    approved,
  )

function checkpointFixture(
  name: string,
  threadId: string,
  type: CheckpointKind,
  plan: PipelinePlan,
  artifacts: readonly ArtifactRecord[],
  artifactId: string,
  expectedAfterApproval: string,
  expectedAfterRejection: string,
): RecoveryCheckpointFixture {
  const completeArtifacts = [...foundationArtifacts(threadId), ...artifacts]
  const artifactVersion = completeArtifacts.find((artifact) => artifact.id === artifactId)?.version ?? 1
  const checkpoint: CheckpointRecord = {
    id: `${threadId}-${type}`,
    type,
    artifactId,
    payload: { fixture: name, artifactId, version: artifactVersion },
  }
  return {
    name,
    checkpoint,
    plan,
    artifacts: completeArtifacts,
    snapshot: { plan, checkpoint, artifacts: completeArtifacts },
    approve: { approved: true, checkpointId: checkpoint.id, artifactId, version: artifactVersion },
    reject: {
      approved: false,
      checkpointId: checkpoint.id,
      artifactId,
      version: artifactVersion,
      feedback: "Please revise the highlighted issue.",
    },
    expectedAfterApproval,
    expectedAfterRejection,
  }
}

export function buildCp1Fixture(threadId = "recovery-cp1"): RecoveryCheckpointFixture {
  const draft = script(threadId, false)
  const plan = buildPipelinePlan(threadId, { research: "skipped", copywriting: "in_progress" })
  return checkpointFixture(
    "CP1 script",
    threadId,
    "script_checkpoint",
    plan,
    [draft],
    draft.id,
    "run_direction",
    "present_script",
  )
}

export function buildCp2Fixture(threadId = "recovery-cp2"): RecoveryCheckpointFixture {
  const approvedScript = script(threadId, true)
  const draft = direction(threadId, false)
  const plan = buildPipelinePlan(threadId, {
    research: "skipped",
    copywriting: "completed",
    direction: "in_progress",
  })
  return checkpointFixture(
    "CP2 direction",
    threadId,
    "direction_checkpoint",
    plan,
    [approvedScript, draft],
    draft.id,
    "generate_draft_config",
    "revise_direction",
  )
}

export function buildSceneQaFixture(threadId = "recovery-qa"): RecoveryCheckpointFixture {
  const approvedScript = script(threadId, true)
  const approvedDirection = direction(threadId, true)
  const config = buildArtifact(threadId, "config", { id: "recovery-config", scenes: [] })
  const report = buildArtifact<SceneQaReport>(threadId, "qa_report", {
    summary: "One scene needs a focused correction.",
    scenes: [{ index: 0, verdict: "MINOR_FIX", score: 7, observations: [], issues: [] }],
  })
  const plan = buildPipelinePlan(threadId, {
    research: "skipped",
    copywriting: "completed",
    direction: "completed",
    config_generation: "completed",
    scene_qa: "blocked",
  })
  return checkpointFixture(
    "Scene QA",
    threadId,
    "qa_report_checkpoint",
    plan,
    [
      approvedScript,
      approvedDirection,
      config,
      ...lineageArtifacts(threadId, approvedScript, approvedDirection, config, report),
      report,
    ],
    report.id,
    "run_audio_planner",
    "revise_direction",
  )
}

export function buildCp3Fixture(threadId = "recovery-cp3"): RecoveryCheckpointFixture {
  const approvedScript = script(threadId, true)
  const approvedDirection = direction(threadId, true)
  const approvedChart = chart(threadId, false)
  const qaReport = buildArtifact<SceneQaReport>(
    threadId,
    "qa_report",
    {
      summary: "All scenes pass.",
      scenes: [{ index: 0, verdict: "PASS", score: 10, observations: [], issues: [] }],
    },
    true,
  )
  const config = buildArtifact(threadId, "config", {
    id: "recovery-config",
    scenes: [],
    voiceover: undefined,
    soundDesign: { enabled: false, musicBed: null, sfx: [] },
  })
  const plan = buildPipelinePlan(threadId, {
    research: "skipped",
    copywriting: "completed",
    direction: "completed",
    config_generation: "completed",
    scene_qa: "completed",
    audio_plan: "in_progress",
  })
  return checkpointFixture(
    "CP3 audio chart",
    threadId,
    "audio_chart_checkpoint",
    plan,
    [
      approvedScript,
      approvedDirection,
      config,
      ...lineageArtifacts(threadId, approvedScript, approvedDirection, config, qaReport),
      qaReport,
      approvedChart,
    ],
    approvedChart.id,
    "produce_audio_assets",
    "present_audio_chart",
  )
}

export function buildCp4Fixture(threadId = "recovery-cp4"): RecoveryCheckpointFixture {
  const draft = script(threadId, false, ["A missing visual capability"])
  const composition = buildArtifact<SceneCompositionResult>(threadId, "scene_composition", {
    summary: "A capability proposal requires explicit approval.",
    resolutions: [],
  })
  const plan = buildPipelinePlan(threadId, {
    research: "skipped",
    copywriting: "in_progress",
    scene_creation: "in_progress",
  })
  return checkpointFixture(
    "CP4 capability expansion",
    threadId,
    "capability_gap_checkpoint",
    plan,
    [draft, composition],
    composition.id,
    "wait_for_human",
    "run_scene_composer",
  )
}

export function buildFinalReviewFixture(threadId = "recovery-final-review"): RecoveryCheckpointFixture {
  const approvedScript = script(threadId, true)
  const approvedDirection = direction(threadId, true)
  const config = buildArtifact(threadId, "config", {
    id: "recovery-config",
    scenes: [],
    voiceover: undefined,
    soundDesign: { enabled: false, musicBed: null, sfx: [] },
  })
  const audio = chart(threadId, true)
  const qaReport = buildArtifact<SceneQaReport>(
    threadId,
    "qa_report",
    {
      summary: "All scenes pass.",
      scenes: [{ index: 0, verdict: "PASS", score: 10, observations: [], issues: [] }],
    },
    true,
  )
  const audioAssets = buildArtifact(threadId, "audio_assets", { assets: [] })
  const renderJob = buildArtifact(threadId, "render_job", { id: "render-1", status: "done" }, true)
  const review = buildArtifact<RenderReviewReport>(threadId, "render_review", {
    jobId: "render-1",
    configId: "recovery-config",
    reviewedAt: CREATED_AT,
    passed: true,
    fileSizeBytes: 100,
    duration: { actualSeconds: 4, expectedSeconds: 4, deltaSeconds: 0, toleranceSeconds: 0.5, matches: true },
    video: { present: true, codec: "h264", width: 1280, height: 720, fps: 30, dimensionsMatch: true, fpsMatches: true },
    audio: { expected: false, present: false, codec: null, matchesExpectation: true },
    failures: [],
    warnings: [],
  })
  const plan = buildPipelinePlan(threadId, {
    research: "skipped",
    copywriting: "completed",
    direction: "completed",
    config_generation: "completed",
    scene_qa: "completed",
    audio_plan: "completed",
    voice_generation: "skipped",
    sound_assets: "skipped",
    final_validation: "completed",
    render: "completed",
    review: "in_progress",
  })
  return checkpointFixture(
    "Final review",
    threadId,
    "final_review_checkpoint",
    plan,
    [
      approvedScript,
      approvedDirection,
      config,
      ...lineageArtifacts(threadId, approvedScript, approvedDirection, config, qaReport),
      qaReport,
      audio,
      audioAssets,
      renderJob,
      review,
    ],
    review.id,
    "publish",
    "present_final_review",
  )
}

export function buildIntakeClarificationFixture(threadId = "recovery-intake"): RecoveryClarificationFixture {
  void threadId
  return {
    name: "Intake clarification",
    kind: "intake_clarification",
    question: "What is the exact subject and objective?",
    snapshot: { plan: null, checkpoint: null, artifacts: [] },
  }
}

export function buildTargetClarificationFixture(threadId = "recovery-target"): RecoveryClarificationFixture {
  void threadId
  return {
    name: "Target clarification",
    kind: "target_clarification",
    question: "Which registered target contract should be used?",
    snapshot: { plan: null, checkpoint: null, artifacts: [] },
  }
}

export function seedCheckpointFixture(store: AgentPiStore, threadId: string, fixture: RecoveryCheckpointFixture): void {
  store.savePipelinePlan(fixture.plan)
  for (const artifact of fixture.artifacts) {
    store.saveArtifact({
      id: artifact.id,
      threadId,
      kind: artifact.kind,
      data: artifact.data,
      approved: artifact.approved,
    })
  }
  store.setCheckpoint(threadId, fixture.checkpoint)
}

export function snapshotFromStore(store: AgentPiStore, threadId: string): CoordinatorSnapshot {
  return {
    plan: store.getPipelinePlan(threadId),
    checkpoint: store.getThread(threadId)?.checkpoint ?? null,
    artifacts: store.listArtifacts(threadId),
  }
}

export function buildAllCheckpointFixtures(threadIdPrefix = "recovery"): RecoveryCheckpointFixture[] {
  return [
    buildCp1Fixture(`${threadIdPrefix}-cp1`),
    buildCp2Fixture(`${threadIdPrefix}-cp2`),
    buildSceneQaFixture(`${threadIdPrefix}-qa`),
    buildCp3Fixture(`${threadIdPrefix}-cp3`),
    buildCp4Fixture(`${threadIdPrefix}-cp4`),
    buildFinalReviewFixture(`${threadIdPrefix}-final`),
  ]
}

export function buildClarificationFixtures(): RecoveryClarificationFixture[] {
  return [buildIntakeClarificationFixture(), buildTargetClarificationFixture()]
}

export type RecoveryFixture = RecoveryCheckpointFixture | RecoveryClarificationFixture
export type SupportedRecoveryCheckpoint = Extract<RecoveryFixture, { checkpoint: CheckpointRecord }>
export type RecoveryMode = PipelineMode
