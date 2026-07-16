import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { afterEach, describe, it } from "node:test"
import { contentHash } from "../src/contentHash.js"
import { CANONICAL_MODE_STEPS, deriveCoordinatorAction } from "../src/coordinator.js"
import type { ProductionBriefIntakeResult } from "../src/intake.js"
import {
  buildProductionBriefArtifact,
  validateProductionBriefArtifact,
  type ProductionBriefCandidate,
} from "../src/productionBrief.js"
import { AgentRuntimeManager } from "../src/session.js"
import { AgentPiStore } from "../src/store.js"
import { buildSelectedTargetArtifact, REGISTERED_TARGETS } from "../src/targetContracts.js"
import type { ConfigSpecialistInput } from "../src/configSpecialist.js"
import type { PipelinePlan } from "../src/types.js"

const provided = <T>(value: T) => ({ status: "provided" as const, value, source: "user" as const })
const absent = (rationale: string) => ({ status: "explicitly_absent" as const, rationale })
const unresolved = (question: string, rationale: string) => ({ status: "unresolved" as const, question, rationale })

function candidate(overrides: Partial<ProductionBriefCandidate> = {}): ProductionBriefCandidate {
  return {
    subject: provided("Explicit subject"),
    objective: provided("Explicit objective"),
    audience: provided("Explicit audience"),
    language: provided("Explicit language"),
    platform: provided("Explicit platform"),
    format: provided("video/mp4"),
    dimensions: provided({ width: 1280, height: 720, unit: "px" }),
    aspectRatio: provided("16:9"),
    duration: provided({ seconds: 30 }),
    brand: absent("No brand"),
    tone: absent("No tone"),
    evidence: absent("No evidence"),
    assets: absent("No assets"),
    constraints: absent("No constraints"),
    audioPreferences: absent("No audio preferences"),
    targetRequirements: provided([{ name: "target.id", requirement: "target.video.001" }]),
    acceptanceCriteria: provided(["Meet the objective"]),
    researchRequirement: provided("not_required"),
    researchRationale: provided("No external verification requested"),
    ...overrides,
  }
}

function intakeResult(value: ProductionBriefCandidate): ProductionBriefIntakeResult {
  const artifact = buildProductionBriefArtifact(value)
  const validation = validateProductionBriefArtifact(artifact)
  return {
    runId: "intake-run",
    modelRoute: "test/intake",
    artifact,
    validation,
    status: validation.ready ? "ready" : "needs_input",
  }
}

function plan(threadId: string): PipelinePlan {
  const steps = CANONICAL_MODE_STEPS.new_video.map((step) => ({
    ...step,
    status: "pending" as const,
    summary: "",
    artifactPaths: [],
    blockers: [],
  }))
  return {
    schemaVersion: 1,
    id: "plan",
    threadId,
    mode: "new_video",
    goal: "Explicit goal",
    status: "active",
    steps,
    decisions: [],
    currentStepId: "research",
    progress: { completed: 0, total: steps.length },
    createdAt: "2026-07-12T00:00:00Z",
    updatedAt: "2026-07-12T00:00:00Z",
  }
}

function saveConfigWithLineage(
  targetStore: AgentPiStore,
  threadId: string,
  data: Record<string, unknown>,
  script: { id: string; version: number; data: unknown },
  direction: { id: string; version: number; data: unknown },
) {
  const config = targetStore.saveArtifact({ threadId, kind: "config", data })
  targetStore.saveArtifact({
    threadId,
    kind: "config_lineage",
    approved: true,
    data: {
      configArtifactId: config.id,
      configVersion: config.version,
      configHash: contentHash(data),
      lineage: {
        schemaVersion: 1,
        productionBrief: { artifactId: "brief", version: 1, contentHash: "a".repeat(64) },
        target: {
          targetId: "target.video.001",
          contractSchemaVersion: 1,
          configSchemaId: "schema",
          configSchemaVersion: 1,
        },
        script: { artifactId: script.id, version: script.version, contentHash: contentHash(script.data) },
        direction: { artifactId: direction.id, version: direction.version, contentHash: contentHash(direction.data) },
        audio: null,
        previousConfig: null,
      },
    },
  })
  return config
}

function saveQaWithLineage(
  targetStore: AgentPiStore,
  threadId: string,
  data: Record<string, unknown>,
  config: { id: string; version: number; data: unknown },
) {
  const qa = targetStore.saveArtifact({ threadId, kind: "qa_report", data })
  targetStore.saveArtifact({
    threadId,
    kind: "qa_lineage",
    approved: true,
    data: {
      schemaVersion: 1,
      qaReport: { artifactId: qa.id, version: qa.version, contentHash: contentHash(qa.data) },
      config: { artifactId: config.id, version: config.version, contentHash: contentHash(config.data) },
    },
  })
  return qa
}

let store: AgentPiStore | undefined
let runtime: AgentRuntimeManager | undefined

afterEach(() => {
  runtime?.dispose()
  runtime = undefined
  store?.close()
  store = undefined
})

interface ParentActionRuntime {
  executeIntakeParentAction(threadId: string, request: string): Promise<void>
  executeTargetParentAction(threadId: string, request?: string): Promise<void>
  executeConfigParentAction(threadId: string, action: "generate_draft_config" | "generate_final_config"): Promise<void>
  executeResearchParentAction(threadId: string, request: string): Promise<void>
  executeCopywriterParentAction(threadId: string, request: string): Promise<void>
  executeSceneComposerParentAction(threadId: string): Promise<void>
  executeSceneQaParentAction(threadId: string): Promise<void>
  executeAudioPlannerParentAction(threadId: string): Promise<void>
  executeAudioProductionParentAction(threadId: string): Promise<void>
  executeFinalValidationParentAction(threadId: string): Promise<void>
  executeRenderParentAction(threadId: string): Promise<void>
  executeRenderReviewParentAction(threadId: string): Promise<void>
  executePublicationParentAction(threadId: string): Promise<void>
  executeDirectionParentAction(threadId: string): Promise<void>
  executePresentationParentAction(
    threadId: string,
    action:
      | "present_script"
      | "present_direction"
      | "present_scene_qa"
      | "present_audio_chart"
      | "present_final_review",
  ): Promise<void>
}

function createRuntime(
  result: ProductionBriefIntakeResult,
  overrides: Omit<Partial<ConstructorParameters<typeof AgentRuntimeManager>[0]>, "store"> = {},
): AgentRuntimeManager {
  store = new AgentPiStore(":memory:")
  runtime = new AgentRuntimeManager({
    ...overrides,
    store,
    createProductionBriefIntakeRunner: () => ({
      async run() {
        return result
      },
    }),
  })
  return runtime
}

describe("parent-owned new_video intake and target integration", () => {
  it("creates an explicit immutable plan and reaches intake checkpoint without a main-model session", async () => {
    const manager = createRuntime(
      intakeResult(candidate({ subject: unresolved("Which subject?", "Subject is required") })),
    )
    const threadId = await manager.getOrCreateThread(null, "Explicit parent plan")

    await manager.sendMessage(threadId, "Create a new video", { mode: "new_video" })

    assert.equal(store!.getPipelinePlan(threadId)?.mode, "new_video")
    assert.equal(store!.getThread(threadId)?.checkpoint?.type, "intake_clarification")
    assert.equal(store!.getThread(threadId)?.piSessionId, null)
    await assert.rejects(
      () => manager.sendMessage(threadId, "Change mode", { mode: "revise_existing" }),
      /mode is immutable|not implemented/,
    )
  })
  it("atomically commits intake artifact, checkpoint, and durable action success", async () => {
    const manager = createRuntime(
      intakeResult(
        candidate({
          audience: unresolved("Who is the audience?", "Audience was omitted"),
        }),
      ),
    )
    const threadId = await manager.getOrCreateThread(null, "Atomic intake")
    store!.savePipelinePlan(plan(threadId))

    await (manager as unknown as ParentActionRuntime).executeIntakeParentAction(threadId, "Create an explicit video")

    const artifacts = store!.listArtifacts(threadId)
    assert.equal(artifacts.length, 1)
    assert.equal(artifacts[0]?.kind, "production_brief")
    assert.equal(artifacts[0]?.approved, false)
    assert.equal(store!.getThread(threadId)?.checkpoint?.artifactId, artifacts[0]?.id)
    const attempts = store!.listActionAttempts(threadId)
    assert.equal(attempts.length, 1)
    assert.equal(attempts[0]?.status, "succeeded")
    assert.deepEqual((attempts[0]?.artifactMetadata as { artifactIds: string[] }).artifactIds, [artifacts[0]?.id])
  })
  it("atomically commits exact selected target and durable action success", async () => {
    const manager = createRuntime(intakeResult(candidate()))
    const threadId = await manager.getOrCreateThread(null, "Atomic target")
    store!.savePipelinePlan(plan(threadId))
    const parent = manager as unknown as ParentActionRuntime

    await parent.executeIntakeParentAction(threadId, "Create an explicit video")
    await parent.executeTargetParentAction(threadId, "Create an explicit video")

    const selected = store!.listArtifacts(threadId).find((artifact) => artifact.kind === "selected_target")
    assert.deepEqual((selected?.data as { target: unknown }).target, { id: "target.video.001", schemaVersion: 1 })
    assert.equal(selected?.approved, true)
    assert.equal(store!.getThread(threadId)?.checkpoint, null)
    assert.deepEqual(
      store!.listActionAttempts(threadId).map((attempt) => [attempt.action, attempt.status]),
      [
        ["resolve_target", "succeeded"],
        ["run_intake", "succeeded"],
      ],
    )
  })

  it("atomically commits target clarification without selecting a default", async () => {
    const manager = createRuntime(
      intakeResult(
        candidate({
          dimensions: provided({ width: 1080, height: 1920, unit: "px" }),
          aspectRatio: provided("9:16"),
          targetRequirements: provided([]),
        }),
      ),
    )
    const threadId = await manager.getOrCreateThread(null, "Atomic target clarification")
    store!.savePipelinePlan(plan(threadId))
    const parent = manager as unknown as ParentActionRuntime

    await parent.executeIntakeParentAction(threadId, "Choose a target")
    await parent.executeTargetParentAction(threadId, "Choose a target")

    assert.equal(store!.getThread(threadId)?.checkpoint?.type, "target_clarification")
    assert.equal(
      store!.listArtifacts(threadId).some((artifact) => artifact.kind === "selected_target"),
      false,
    )
    assert.equal(
      store!.listActionAttempts(threadId).find((attempt) => attempt.action === "resolve_target")?.status,
      "succeeded",
    )
  })

  it("deterministically skips or runs research from the approved brief", async () => {
    const skippedManager = createRuntime(intakeResult(candidate()))
    const skippedThread = store!.createThread().id
    store!.savePipelinePlan(plan(skippedThread))
    const skippedParent = skippedManager as unknown as ParentActionRuntime
    await skippedParent.executeIntakeParentAction(skippedThread, "No research")
    await skippedParent.executeTargetParentAction(skippedThread, "No research")
    await skippedParent.executeResearchParentAction(skippedThread, "No research")
    assert.equal(store!.getPipelinePlan(skippedThread)?.steps.find((step) => step.id === "research")?.status, "skipped")
    assert.equal(
      store!.listArtifacts(skippedThread).some((artifact) => artifact.kind === "research"),
      false,
    )

    runtime?.dispose()
    store?.close()
    store = new AgentPiStore(":memory:")
    let researchInput: { subject: string; sourceUrls?: string[] } | undefined
    runtime = new AgentRuntimeManager({
      store,
      createResearchSpecialistRunner: () => ({
        async run(input) {
          researchInput = input
          return {
            runId: "research-run",
            modelRoute: "test/research",
            research: {
              topic: input.subject,
              objective: input.objective,
              summary: "Cited summary",
              keyConcepts: [],
              claims: [{ claim: "Verified claim", sourceUrls: ["https://example.com/source"], confidence: "high" }],
              examples: [],
              unknowns: [],
              sourceUrls: ["https://example.com/source"],
            },
          }
        },
      }),
    })
    const requiredThread = store.createThread().id
    store.savePipelinePlan(plan(requiredThread))
    const requiredCandidate = candidate({
      evidence: provided({
        claims: ["Verify this claim"],
        sourceReferences: ["https://example.com/source"],
        externalVerification: "required",
      }),
      researchRequirement: provided("required"),
      researchRationale: provided("External verification requested"),
    })
    const brief = store.saveArtifact({
      threadId: requiredThread,
      kind: "production_brief",
      data: buildProductionBriefArtifact(requiredCandidate),
      approved: true,
    })
    store.saveArtifact({
      threadId: requiredThread,
      kind: "selected_target",
      data: buildSelectedTargetArtifact(REGISTERED_TARGETS.targets[0]!, brief),
      approved: true,
    })
    const requiredParent = runtime as unknown as ParentActionRuntime
    await requiredParent.executeResearchParentAction(requiredThread, "Research exact evidence")
    assert.equal(researchInput?.subject, "Explicit subject")
    assert.deepEqual(researchInput?.sourceUrls, ["https://example.com/source"])
    assert.equal(store.listArtifacts(requiredThread).find((artifact) => artifact.kind === "research")?.approved, true)
  })

  it("runs copywriter and direction as proposal-only actions with atomic checkpoints", async () => {
    store = new AgentPiStore(":memory:")
    let copywriterSubject: string | undefined
    runtime = new AgentRuntimeManager({
      store,
      createCopywriterSpecialistRunner: () => ({
        async run(_request, brief) {
          copywriterSubject = brief.subject
          return {
            runId: "copywriter-run",
            modelRoute: "test/copywriter",
            script: {
              title: "Atomic narrative",
              objective: "Prove parent sequencing",
              scenes: [
                {
                  id: "scene-1",
                  type: "callout",
                  title: "Exact visible title",
                  voiceover: "Exact narration",
                  durationInSeconds: 3,
                  missingCapabilities: [],
                },
              ],
            },
          }
        },
      }),
      createDirectionSpecialistRunner: () => ({
        async run(script) {
          return {
            runId: "direction-run",
            modelRoute: "test/direction",
            direction: {
              title: script.title,
              scenes: script.scenes.map((scene) => ({
                sceneId: scene.id,
                sceneType: scene.type,
                title: scene.title ?? scene.id,
                technicalIntent: "Keep approved copy legible",
                visualContract: "Use only the approved scene contract",
                timing: { tailHoldMs: 350, transitionMs: 250 },
                beats: [],
                assets: [],
                risks: [],
              })),
              warnings: [],
              risks: [],
            },
          }
        },
      }),
    })
    const threadId = store.createThread().id
    const narrativePlan = plan(threadId)
    narrativePlan.steps.find((step) => step.id === "research")!.status = "skipped"
    store.savePipelinePlan(narrativePlan)
    const brief = store.saveArtifact({
      threadId,
      kind: "production_brief",
      data: buildProductionBriefArtifact(candidate()),
      approved: true,
    })
    store.saveArtifact({
      threadId,
      kind: "selected_target",
      data: buildSelectedTargetArtifact(REGISTERED_TARGETS.targets[0]!, brief),
      approved: true,
    })
    const parent = runtime as unknown as ParentActionRuntime

    await parent.executeCopywriterParentAction(threadId, "Create the approved narrative")
    assert.equal(copywriterSubject, "Explicit subject")
    assert.equal(store.listArtifacts(threadId).filter((artifact) => artifact.kind === "script").length, 1)
    assert.equal(store.listArtifacts(threadId).filter((artifact) => artifact.kind === "script_markdown").length, 1)
    await parent.executePresentationParentAction(threadId, "present_script")
    const scriptCheckpoint = store.getThread(threadId)?.checkpoint
    assert.equal(scriptCheckpoint?.type, "script_checkpoint")
    store.markArtifactApproved(scriptCheckpoint!.artifactId!)
    store.clearCheckpoint(threadId)
    const afterScript = store.getPipelinePlan(threadId)!
    afterScript.steps.find((step) => step.id === "copywriting")!.status = "completed"
    store.savePipelinePlan(afterScript)

    await parent.executeDirectionParentAction(threadId)
    assert.equal(store.listArtifacts(threadId).filter((artifact) => artifact.kind === "direction").length, 1)
    await parent.executePresentationParentAction(threadId, "present_direction")
    assert.equal(store.getThread(threadId)?.checkpoint?.type, "direction_checkpoint")
    assert.deepEqual(
      store
        .listActionAttempts(threadId)
        .filter((attempt) =>
          ["run_copywriter", "present_script", "run_direction", "present_direction"].includes(attempt.action),
        )
        .map((attempt) => [attempt.action, attempt.status])
        .sort(),
      [
        ["present_direction", "succeeded"],
        ["present_script", "succeeded"],
        ["run_copywriter", "succeeded"],
        ["run_direction", "succeeded"],
      ],
    )
  })

  it("binds scene composition to the selected target and atomically presents CP4", async () => {
    store = new AgentPiStore(":memory:")
    let selectedTargetId: string | undefined
    runtime = new AgentRuntimeManager({
      store,
      createSceneComposerSpecialistRunner: () => ({
        async run(input) {
          selectedTargetId = input.selectedTarget?.targetId as string
          return {
            runId: "composer-run",
            modelRoute: "test/composer",
            result: {
              summary: "Reusable capability requires approval",
              resolutions: [
                {
                  sceneId: "scene-gap",
                  outcome: "capability_gap" as const,
                  rationale: "The bounded declarative contract is insufficient",
                  gap: {
                    capability: "Reusable bounded capability",
                    whyDslInsufficient: "The approved behavior is not representable",
                    reuseAnalysis: "No registered component matches",
                    proposedGenericContract: { value: "string" },
                    securitySurface: ["render-only props"],
                    affectedFiles: ["one component"],
                    acceptanceTests: ["renders deterministic still"],
                  },
                },
              ],
            },
          }
        },
      }),
    })
    const threadId = store.createThread().id
    const composerPlan = plan(threadId)
    composerPlan.steps.find((step) => step.id === "research")!.status = "skipped"
    composerPlan.steps.find((step) => step.id === "copywriting")!.status = "in_progress"
    store.savePipelinePlan(composerPlan)
    const brief = store.saveArtifact({
      threadId,
      kind: "production_brief",
      data: buildProductionBriefArtifact(candidate()),
      approved: true,
    })
    store.saveArtifact({
      threadId,
      kind: "selected_target",
      data: buildSelectedTargetArtifact(REGISTERED_TARGETS.targets[0]!, brief),
      approved: true,
    })
    store.saveArtifact({
      threadId,
      kind: "script",
      data: {
        title: "Capability script",
        objective: "Resolve one visual need",
        scenes: [
          {
            id: "scene-gap",
            type: "callout",
            durationInSeconds: 3,
            missingCapabilities: ["Reusable bounded capability"],
          },
        ],
      },
    })

    await (runtime as unknown as ParentActionRuntime).executeSceneComposerParentAction(threadId)

    assert.equal(selectedTargetId, "target.video.001")
    assert.equal(store.getThread(threadId)?.checkpoint?.type, "capability_gap_checkpoint")
    assert.equal(store.listArtifacts(threadId).filter((artifact) => artifact.kind === "scene_composition").length, 1)
    assert.equal(store.listArtifacts(threadId).filter((artifact) => artifact.kind === "script").length, 2)
    assert.equal(
      store.listActionAttempts(threadId).find((attempt) => attempt.action === "run_scene_composer")?.status,
      "succeeded",
    )
  })

  it("runs target-bound Scene QA over parent-rendered stills and atomically presents review", async () => {
    store = new AgentPiStore(":memory:")
    let qaTargetId: string | undefined
    runtime = new AgentRuntimeManager({
      store,
      createSceneStillClient: () => ({
        async render(_config, sceneCount) {
          assert.equal(sceneCount, 1)
          return [
            {
              index: 0,
              path: "/safe.png",
              frameNumber: 1,
              image: { type: "image" as const, data: "cG5n", mimeType: "image/png" },
            },
          ]
        },
      }),
      createSceneQaSpecialistRunner: () => ({
        async run(input) {
          qaTargetId = input.selectedTarget?.targetId as string
          return {
            runId: "qa-run",
            modelRoute: "test/qa",
            report: {
              summary: "Human review evidence",
              scenes: [
                {
                  index: 0,
                  verdict: "MINOR_FIX" as const,
                  score: 7,
                  observations: ["One bounded visual issue"],
                  issues: [],
                },
              ],
            },
          }
        },
      }),
    })
    const threadId = store.createThread().id
    const qaPlan = plan(threadId)
    for (const step of qaPlan.steps) {
      if (step.id === "research") step.status = "skipped"
      if (["copywriting", "direction", "config_generation"].includes(step.id)) step.status = "completed"
    }
    store.savePipelinePlan(qaPlan)
    const brief = store.saveArtifact({
      threadId,
      kind: "production_brief",
      data: buildProductionBriefArtifact(candidate()),
      approved: true,
    })
    store.saveArtifact({
      threadId,
      kind: "selected_target",
      data: buildSelectedTargetArtifact(REGISTERED_TARGETS.targets[0]!, brief),
      approved: true,
    })
    const script = store.saveArtifact({
      threadId,
      kind: "script",
      data: {
        title: "QA script",
        objective: "Review",
        scenes: [{ id: "scene-1", type: "callout", durationInSeconds: 3, missingCapabilities: [] }],
      },
      approved: true,
    })
    const direction = store.saveArtifact({
      threadId,
      kind: "direction",
      data: { title: "QA direction", scenes: [], warnings: [], risks: [] },
      approved: true,
    })
    saveConfigWithLineage(store, threadId, { id: "qa-config", scenes: [{}] }, script, direction)
    const parent = runtime as unknown as ParentActionRuntime

    await parent.executeSceneQaParentAction(threadId)
    assert.equal(qaTargetId, "target.video.001")
    const report = store.listArtifacts(threadId).find((artifact) => artifact.kind === "qa_report")
    assert.equal(report?.approved, false)
    await parent.executePresentationParentAction(threadId, "present_scene_qa")
    assert.equal(store.getThread(threadId)?.checkpoint?.type, "qa_report_checkpoint")
    assert.equal(store.getThread(threadId)?.checkpoint?.artifactId, report?.id)
    assert.equal(
      store.listActionAttempts(threadId).find((attempt) => attempt.action === "run_scene_qa")?.status,
      "succeeded",
    )
  })

  it("plans target-bound audio from brief preferences and atomically presents CP3", async () => {
    store = new AgentPiStore(":memory:")
    let audioTargetId: string | undefined
    let voicePreference: string | undefined
    runtime = new AgentRuntimeManager({
      store,
      createAudioPlannerSpecialistRunner: () => ({
        async run(_script, _direction, preferences) {
          audioTargetId = preferences?.selectedTarget?.targetId as string
          voicePreference = preferences?.voiceover
          return {
            runId: "audio-run",
            modelRoute: "test/audio",
            chart: { voiceover: null, soundDesign: { enabled: false, musicBed: null, sfx: [] }, warnings: [] },
            library: [],
          }
        },
      }),
    })
    const threadId = store.createThread().id
    const audioPlan = plan(threadId)
    for (const step of audioPlan.steps) {
      if (step.id === "research") step.status = "skipped"
      if (["copywriting", "direction", "config_generation", "scene_qa"].includes(step.id)) step.status = "completed"
    }
    store.savePipelinePlan(audioPlan)
    const audioCandidate = candidate({
      audioPreferences: provided({
        voiceover: "none",
        music: "none",
        soundEffects: "none",
        accessibilityNotes: ["No spoken track"],
        notes: [],
      }),
    })
    const brief = store.saveArtifact({
      threadId,
      kind: "production_brief",
      data: buildProductionBriefArtifact(audioCandidate),
      approved: true,
    })
    store.saveArtifact({
      threadId,
      kind: "selected_target",
      data: buildSelectedTargetArtifact(REGISTERED_TARGETS.targets[0]!, brief),
      approved: true,
    })
    const script = store.saveArtifact({
      threadId,
      kind: "script",
      data: {
        title: "Audio script",
        objective: "Plan silence",
        scenes: [{ id: "scene-1", type: "callout", durationInSeconds: 3, missingCapabilities: [] }],
      },
      approved: true,
    })
    const direction = store.saveArtifact({
      threadId,
      kind: "direction",
      data: { title: "Audio direction", scenes: [], warnings: [], risks: [] },
      approved: true,
    })
    const config = saveConfigWithLineage(store, threadId, { id: "audio-config", scenes: [{}] }, script, direction)
    saveQaWithLineage(
      store,
      threadId,
      { summary: "Pass", scenes: [{ index: 0, verdict: "PASS", score: 10, observations: [], issues: [] }] },
      config,
    )
    const parent = runtime as unknown as ParentActionRuntime

    await parent.executeAudioPlannerParentAction(threadId)
    assert.equal(audioTargetId, "target.video.001")
    assert.equal(voicePreference, "none")
    const chart = store.listArtifacts(threadId).find((artifact) => artifact.kind === "audio_chart")
    assert.equal(chart?.approved, false)
    await parent.executePresentationParentAction(threadId, "present_audio_chart")
    assert.equal(store.getThread(threadId)?.checkpoint?.type, "audio_chart_checkpoint")
    assert.equal(store.getThread(threadId)?.checkpoint?.artifactId, chart?.id)
    assert.equal(
      store.listActionAttempts(threadId).find((attempt) => attempt.action === "run_audio_planner")?.status,
      "succeeded",
    )
  })

  it("produces silent/local audio exactly once and blocks unreconciled API voice", async () => {
    store = new AgentPiStore(":memory:")
    let productions = 0
    let validations = 0
    let renderSubmissions = 0
    let publications = 0
    let publishedFiles: string[] = []
    runtime = new AgentRuntimeManager({
      store,
      publishFiles: async (_slug, files) => {
        publications += 1
        publishedFiles = [...files.keys()].sort()
        return Object.fromEntries(
          [...files].map(([name, content]) => [
            name,
            { path: `safe/${name}`, sha256: createHash("sha256").update(content).digest("hex") },
          ]),
        )
      },
      submitRender: async (_config, key, hash) => {
        renderSubmissions += 1
        assert.match(key, /:render:/)
        assert.match(hash, /^[a-f0-9]{64}$/)
        return { jobId: "render-job-1", reused: renderSubmissions > 1 }
      },
      reviewRender: async () => ({
        jobId: "render-job-1",
        configId: "silent-config",
        reviewedAt: "2026-07-12T00:02:00Z",
        passed: true,
        fileSizeBytes: 100,
        duration: { actualSeconds: 3, expectedSeconds: 3, deltaSeconds: 0, toleranceSeconds: 0.5, matches: true },
        video: {
          present: true,
          codec: "h264",
          width: 1280,
          height: 720,
          fps: 30,
          dimensionsMatch: true,
          fpsMatches: true,
        },
        audio: { expected: false, present: false, codec: null, matchesExpectation: true },
        failures: [],
        warnings: [],
      }),
      getRenderStatus: async () => ({
        id: "render-job-1",
        config_id: "silent-config",
        title: "Silent",
        composition: "ClaudeCodeTutorial",
        status: "done",
        progress: 100,
        output_path: "/safe/output.mp4",
        file_size: 100,
        thread_id: null,
        error: null,
        created_at: "2026-07-12T00:00:00Z",
        completed_at: "2026-07-12T00:01:00Z",
      }),
      validateFinalConfig: async () => {
        validations += 1
        return { valid: true }
      },
      createAudioAssetProducer: () => ({
        async produce(input) {
          productions += 1
          return {
            configId: input.config.id as string,
            voiceStatus: "skipped" as const,
            soundStatus: "skipped" as const,
            assets: [],
            generatedAt: "2026-07-12T00:00:00Z",
          }
        },
      }),
    })
    const threadId = store.createThread().id
    const productionPlan = plan(threadId)
    for (const step of productionPlan.steps) {
      if (step.id === "research") step.status = "skipped"
      if (["copywriting", "direction", "config_generation", "scene_qa", "audio_plan"].includes(step.id)) {
        step.status = "completed"
      }
    }
    store.savePipelinePlan(productionPlan)
    const productionBrief = store.saveArtifact({
      threadId,
      kind: "production_brief",
      data: buildProductionBriefArtifact(candidate()),
      approved: true,
    })
    store.saveArtifact({
      threadId,
      kind: "selected_target",
      data: buildSelectedTargetArtifact(REGISTERED_TARGETS.targets[0]!, productionBrief),
      approved: true,
    })
    const chart = {
      voiceover: null,
      soundDesign: { enabled: false, musicBed: null, sfx: [] },
      warnings: [],
    }
    const script = store.saveArtifact({
      threadId,
      kind: "script",
      data: {
        title: "Silent",
        objective: "No API",
        scenes: [{ id: "scene-1", type: "callout", durationInSeconds: 3, missingCapabilities: [] }],
      },
      approved: true,
    })
    const direction = store.saveArtifact({
      threadId,
      kind: "direction",
      data: { title: "Silent direction", scenes: [], warnings: [], risks: [] },
      approved: true,
    })
    const config = saveConfigWithLineage(
      store,
      threadId,
      { id: "silent-config", scenes: [{}], soundDesign: chart.soundDesign },
      script,
      direction,
    )
    saveQaWithLineage(
      store,
      threadId,
      { summary: "Pass", scenes: [{ index: 0, verdict: "PASS", score: 10, observations: [], issues: [] }] },
      config,
    )
    store.saveArtifact({ threadId, kind: "audio_chart", data: chart, approved: true })
    const parent = runtime as unknown as ParentActionRuntime
    assert.equal(
      deriveCoordinatorAction({
        plan: store.getPipelinePlan(threadId),
        checkpoint: null,
        artifacts: store.listArtifacts(threadId),
      }),
      "produce_audio_assets",
    )

    await parent.executeAudioProductionParentAction(threadId)
    await parent.executeAudioProductionParentAction(threadId)
    assert.equal(productions, 1)
    assert.equal(store.listArtifacts(threadId).filter((artifact) => artifact.kind === "audio_assets").length, 1)
    assert.equal(
      store.listActionAttempts(threadId).find((attempt) => attempt.action === "produce_audio_assets")?.status,
      "succeeded",
    )
    await parent.executeFinalValidationParentAction(threadId)
    await parent.executeFinalValidationParentAction(threadId)
    assert.equal(validations, 1)
    assert.equal(
      store.listArtifacts(threadId).find((artifact) => artifact.kind === "validation_report")?.approved,
      true,
    )
    assert.equal(
      store.getPipelinePlan(threadId)?.steps.find((step) => step.id === "final_validation")?.status,
      "completed",
    )
    await parent.executeRenderParentAction(threadId)
    await parent.executeRenderParentAction(threadId)
    assert.equal(renderSubmissions, 1)
    assert.equal(store.listArtifacts(threadId).find((artifact) => artifact.kind === "render_job")?.approved, true)
    assert.equal(store.getPipelinePlan(threadId)?.steps.find((step) => step.id === "render")?.status, "completed")
    await parent.executeRenderReviewParentAction(threadId)
    const review = store.listArtifacts(threadId).find((artifact) => artifact.kind === "render_review")
    assert.equal(review?.approved, false)
    await parent.executePresentationParentAction(threadId, "present_final_review")
    assert.equal(store.getThread(threadId)?.checkpoint?.type, "final_review_checkpoint")
    assert.equal(store.getThread(threadId)?.checkpoint?.artifactId, review?.id)
    store.markArtifactApproved(review!.id)
    store.clearCheckpoint(threadId)
    const publishPlan = store.getPipelinePlan(threadId)!
    publishPlan.steps.find((step) => step.id === "review")!.status = "completed"
    store.savePipelinePlan(publishPlan)
    await parent.executePublicationParentAction(threadId)
    await parent.executePublicationParentAction(threadId)
    assert.equal(publications, 1)
    assert.deepEqual(publishedFiles, [
      "audio-chart.json",
      "config.json",
      "direction.json",
      "qa-report.json",
      "render-review.json",
      "script.json",
      "script.md",
    ])
    assert.equal(store.getPipelinePlan(threadId)?.steps.find((step) => step.id === "publication")?.status, "completed")

    const apiThread = store.createThread().id
    store.saveArtifact({
      threadId: apiThread,
      kind: "script",
      data: {
        title: "Voice",
        objective: "API",
        scenes: [{ id: "scene-1", type: "callout", durationInSeconds: 3, missingCapabilities: [] }],
      },
      approved: true,
    })
    store.saveArtifact({
      threadId: apiThread,
      kind: "audio_chart",
      data: {
        voiceover: { enabled: true, provider: "gemini", language: "en", voiceId: "Kore", scenes: { "0": "Narration" } },
        soundDesign: { enabled: false, musicBed: null, sfx: [] },
        warnings: [],
      },
      approved: true,
    })
    store.saveArtifact({ threadId: apiThread, kind: "config", data: { id: "voice-config", scenes: [{}] } })
    await assert.rejects(() => parent.executeAudioProductionParentAction(apiThread), /provider-receipt reconciliation/)
    assert.equal(productions, 1)
  })

  it("atomically commits draft config, lineage, plan effect, and action success", async () => {
    store = new AgentPiStore(":memory:")
    let received: ConfigSpecialistInput | undefined
    runtime = new AgentRuntimeManager({
      store,
      createConfigSpecialistRunner: () => ({
        async run(input) {
          received = input
          const config = { id: "atomic-config", compositionId: "ClaudeCodeTutorial", scenes: [] }
          return {
            runId: "config-run",
            modelRoute: "test/config",
            config,
            configHash: contentHash(config),
            lineage: {
              schemaVersion: 1,
              productionBrief: {
                artifactId: input.productionBrief.artifactId,
                version: input.productionBrief.version,
                contentHash: contentHash(input.productionBrief.data),
              },
              target: {
                targetId: input.target.targetId,
                contractSchemaVersion: input.target.schemaVersion,
                configSchemaId: input.target.rendering.configSchema.id,
                configSchemaVersion: input.target.rendering.configSchema.version,
              },
              script: {
                artifactId: input.script.artifactId,
                version: input.script.version,
                contentHash: contentHash(input.script.data),
              },
              direction: {
                artifactId: input.direction.artifactId,
                version: input.direction.version,
                contentHash: contentHash(input.direction.data),
              },
              audio: input.audio
                ? {
                    artifactId: input.audio.artifactId,
                    version: input.audio.version,
                    contentHash: contentHash(input.audio.data),
                  }
                : null,
              previousConfig: input.previousConfig
                ? {
                    artifactId: input.previousConfig.artifactId,
                    version: input.previousConfig.version,
                    contentHash: input.previousConfig.contentHash,
                  }
                : null,
            },
          }
        },
      }),
    })
    const threadId = store.createThread().id
    const configPlan = plan(threadId)
    for (const step of configPlan.steps) {
      if (step.id === "research") step.status = "skipped"
      if (step.id === "copywriting" || step.id === "direction") step.status = "completed"
    }
    store.savePipelinePlan(configPlan)
    const brief = store.saveArtifact({
      threadId,
      kind: "production_brief",
      data: buildProductionBriefArtifact(candidate()),
      approved: true,
    })
    store.saveArtifact({
      threadId,
      kind: "selected_target",
      data: buildSelectedTargetArtifact(REGISTERED_TARGETS.targets[0]!, brief),
      approved: true,
    })
    store.saveArtifact({
      threadId,
      kind: "script",
      data: {
        title: "Atomic script",
        objective: "Atomic config",
        scenes: [{ id: "scene-1", type: "callout", durationInSeconds: 3, missingCapabilities: [] }],
      },
      approved: true,
    })
    store.saveArtifact({
      threadId,
      kind: "direction",
      data: { title: "Atomic direction", scenes: [], warnings: [] },
      approved: true,
    })

    await (runtime as unknown as ParentActionRuntime).executeConfigParentAction(threadId, "generate_draft_config")

    assert.equal(received?.target.targetId, "target.video.001")
    assert.equal(received?.audio, undefined)
    assert.equal(received?.previousConfig, null)
    const config = store.listArtifacts(threadId).find((artifact) => artifact.kind === "config")
    const lineage = store.listArtifacts(threadId).find((artifact) => artifact.kind === "config_lineage")
    assert.equal((lineage?.data as { configArtifactId: string }).configArtifactId, config?.id)
    assert.equal((lineage?.data as { configVersion: number }).configVersion, config?.version)
    assert.equal(
      store.listActionAttempts(threadId).find((attempt) => attempt.action === "generate_draft_config")?.status,
      "succeeded",
    )
    assert.equal(
      store.getPipelinePlan(threadId)?.steps.find((step) => step.id === "config_generation")?.status,
      "completed",
    )

    const finalPlan = store.getPipelinePlan(threadId)!
    for (const step of finalPlan.steps) {
      if (["config_generation", "scene_qa", "audio_plan"].includes(step.id)) step.status = "completed"
    }
    store.savePipelinePlan(finalPlan)
    saveQaWithLineage(
      store,
      threadId,
      { summary: "Pass", scenes: [{ index: 0, verdict: "PASS", score: 10, observations: [], issues: [] }] },
      config!,
    )
    store.saveArtifact({
      threadId,
      kind: "audio_chart",
      data: { voiceover: null, soundDesign: { enabled: false, musicBed: null, sfx: [] }, warnings: [] },
      approved: true,
    })
    await (runtime as unknown as ParentActionRuntime).executeConfigParentAction(threadId, "generate_final_config")
    assert.ok(received?.audio)
    const finalInput = received as ConfigSpecialistInput | undefined
    assert.equal(finalInput?.previousConfig?.artifactId, config?.id)
    assert.equal(store.listArtifacts(threadId).filter((artifact) => artifact.kind === "config").length, 2)
    assert.equal(
      store.listActionAttempts(threadId).find((attempt) => attempt.action === "generate_final_config")?.status,
      "succeeded",
    )
  })

  it("retries exactly one failed canonical specialist action and rejects duplicate retry", async () => {
    let copywriterAttempts = 0
    const manager = createRuntime(intakeResult(candidate()), {
      createCopywriterSpecialistRunner: () => ({
        async run() {
          copywriterAttempts += 1
          if (copywriterAttempts === 1) throw new Error("Synthetic specialist failure")
          return {
            runId: "retry-copywriter",
            modelRoute: "test/copywriter",
            script: {
              title: "Retry script",
              objective: "Prove explicit retry",
              scenes: [
                {
                  id: "scene-1",
                  type: "callout",
                  title: "Recovered",
                  durationInSeconds: 3,
                  missingCapabilities: [],
                },
              ],
            },
          }
        },
      }),
    })
    const threadId = await manager.getOrCreateThread(null, "Explicit retry")

    await assert.rejects(
      () => manager.sendMessage(threadId, "Create a retry test", { mode: "new_video" }),
      /Synthetic specialist failure/,
    )
    const failed = store!.listActionAttempts(threadId).find((attempt) => String(attempt.action) === "run_copywriter")
    assert.equal(failed?.status, "failed")
    assert.equal(failed?.attemptCount, 1)
    await assert.rejects(
      () => manager.sendMessage(threadId, "Ordinary messages cannot authorize retry"),
      /requires recovery: retry_required/,
    )
    assert.equal(copywriterAttempts, 1)
    assert.equal(
      store!.listActionAttempts(threadId).find((attempt) => String(attempt.action) === "run_copywriter")?.attemptCount,
      1,
    )

    manager.dispose()
    runtime = new AgentRuntimeManager({
      store: store!,
      createCopywriterSpecialistRunner: () => ({
        async run() {
          copywriterAttempts += 1
          return {
            runId: "retry-copywriter",
            modelRoute: "test/copywriter",
            script: {
              title: "Retry script",
              objective: "Prove explicit retry",
              scenes: [
                {
                  id: "scene-1",
                  type: "callout",
                  title: "Recovered",
                  durationInSeconds: 3,
                  missingCapabilities: [],
                },
              ],
            },
          }
        },
      }),
    })
    const restarted = runtime
    const retry = restarted.retryCurrentAction(threadId)
    assert.throws(() => restarted.retryCurrentAction(threadId), /retry is already running/)
    await retry

    assert.equal(store!.getThread(threadId)?.checkpoint?.type, "script_checkpoint")
    const succeeded = store!.listActionAttempts(threadId).find((attempt) => String(attempt.action) === "run_copywriter")
    assert.equal(succeeded?.status, "succeeded")
    assert.equal(succeeded?.attemptCount, 2)
    assert.equal(store!.listArtifacts(threadId).filter((artifact) => artifact.kind === "script").length, 1)
    assert.throws(() => restarted.retryCurrentAction(threadId), /cannot bypass pending checkpoint/)
    store!.clearCheckpoint(threadId)
    assert.throws(() => restarted.retryCurrentAction(threadId), /has no exact failed attempt eligible for retry/)
  })

  it("reuses the exact provider render key after a lost response and explicit restart retry", async () => {
    store = new AgentPiStore(":memory:")
    let submissions = 0
    const keys: string[] = []
    const hashes: string[] = []
    const runtimeOptions = {
      store,
      submitRender: async (_config: Record<string, unknown>, key: string, hash: string) => {
        submissions += 1
        keys.push(key)
        hashes.push(hash)
        if (submissions === 1) throw new Error("Provider accepted render but response was lost")
        return { jobId: "provider-job-1", reused: true }
      },
      getRenderStatus: async () => ({
        id: "provider-job-1",
        config_id: "render-retry-config",
        title: "Render retry",
        composition: "ClaudeCodeTutorial",
        status: "done" as const,
        progress: 100,
        output_path: "/safe/provider-job-1/output.mp4",
        file_size: 100,
        thread_id: null,
        error: null,
        created_at: "2026-07-12T00:00:00Z",
        completed_at: "2026-07-12T00:01:00Z",
      }),
      reviewRender: async () => ({
        jobId: "provider-job-1",
        configId: "render-retry-config",
        reviewedAt: "2026-07-12T00:02:00Z",
        passed: true,
        fileSizeBytes: 100,
        duration: { actualSeconds: 3, expectedSeconds: 3, deltaSeconds: 0, toleranceSeconds: 0.5, matches: true },
        video: {
          present: true,
          codec: "h264",
          width: 1280,
          height: 720,
          fps: 30,
          dimensionsMatch: true,
          fpsMatches: true,
        },
        audio: { expected: false, present: false, codec: null, matchesExpectation: true },
        failures: [],
        warnings: [],
      }),
    }
    runtime = new AgentRuntimeManager(runtimeOptions)
    const threadId = store.createThread().id
    const renderPlan = plan(threadId)
    for (const step of renderPlan.steps) {
      if (step.id === "research" || step.id === "scene_creation") step.status = "skipped"
      if (
        [
          "copywriting",
          "direction",
          "config_generation",
          "scene_qa",
          "audio_plan",
          "voice_generation",
          "sound_assets",
          "final_validation",
        ].includes(step.id)
      ) {
        step.status = "completed"
      }
    }
    store.savePipelinePlan(renderPlan)
    const brief = store.saveArtifact({
      threadId,
      kind: "production_brief",
      data: buildProductionBriefArtifact(candidate()),
      approved: true,
    })
    store.saveArtifact({
      threadId,
      kind: "selected_target",
      data: buildSelectedTargetArtifact(REGISTERED_TARGETS.targets[0]!, brief),
      approved: true,
    })
    const script = store.saveArtifact({
      threadId,
      kind: "script",
      data: {
        title: "Render retry",
        objective: "Reuse provider key",
        scenes: [{ id: "scene-1", type: "callout", durationInSeconds: 3, missingCapabilities: [] }],
      },
      approved: true,
    })
    const direction = store.saveArtifact({
      threadId,
      kind: "direction",
      data: { title: "Render retry", scenes: [], warnings: [] },
      approved: true,
    })
    const config = saveConfigWithLineage(
      store,
      threadId,
      {
        id: "render-retry-config",
        title: "Render retry",
        scenes: [{}],
        voiceover: null,
        soundDesign: { enabled: false, musicBed: null, sfx: [] },
      },
      script,
      direction,
    )
    saveQaWithLineage(
      store,
      threadId,
      { summary: "Pass", scenes: [{ index: 0, verdict: "PASS", score: 10, observations: [], issues: [] }] },
      config,
    )
    store.saveArtifact({
      threadId,
      kind: "audio_chart",
      data: { voiceover: null, soundDesign: { enabled: false, musicBed: null, sfx: [] }, warnings: [] },
      approved: true,
    })
    store.saveArtifact({ threadId, kind: "audio_assets", data: { assets: [] }, approved: true })
    store.saveArtifact({
      threadId,
      kind: "validation_report",
      data: { valid: true, configArtifactId: config.id, configVersion: config.version },
      approved: true,
    })
    const parent = runtime as unknown as ParentActionRuntime

    await assert.rejects(() => parent.executeRenderParentAction(threadId), /response was lost/)
    await assert.rejects(() => parent.executeRenderParentAction(threadId), /requires recovery: retry_required/)
    assert.equal(submissions, 1)
    assert.equal(store.listArtifacts(threadId).filter((artifact) => artifact.kind === "render_job").length, 0)

    runtime.dispose()
    runtime = new AgentRuntimeManager(runtimeOptions)
    await runtime.retryCurrentAction(threadId)

    assert.equal(submissions, 2)
    assert.deepEqual(keys, [keys[0], keys[0]])
    assert.deepEqual(hashes, [hashes[0], hashes[0]])
    assert.equal(store.listArtifacts(threadId).filter((artifact) => artifact.kind === "render_job").length, 1)
    const renderAttempt = store.listActionAttempts(threadId).find((attempt) => String(attempt.action) === "render")
    assert.equal(renderAttempt?.status, "succeeded")
    assert.equal(renderAttempt?.attemptCount, 2)
    assert.equal(store.getThread(threadId)?.checkpoint?.type, "final_review_checkpoint")
  })

  it("persists a ready brief and exact selected target, then advances identically after restart", async () => {
    const manager = createRuntime(intakeResult(candidate()))
    const threadId = store!.createThread().id
    store!.savePipelinePlan(plan(threadId))

    await manager.runProductionBriefIntake(threadId, "Explicit request")
    const selection = await manager.resolveProductionTarget(threadId)
    assert.equal(selection.status, "selected")
    assert.deepEqual(selection.artifact?.data.target, { id: "target.video.001", schemaVersion: 1 })

    const before = deriveCoordinatorAction({
      plan: store!.getPipelinePlan(threadId),
      checkpoint: store!.getThread(threadId)!.checkpoint,
      artifacts: store!.listArtifacts(threadId),
    })
    const restarted = new AgentRuntimeManager({ store: store! })
    const after = deriveCoordinatorAction({
      plan: restarted.store.getPipelinePlan(threadId),
      checkpoint: restarted.store.getThread(threadId)!.checkpoint,
      artifacts: restarted.store.listArtifacts(threadId),
    })
    restarted.dispose()
    assert.equal(before, "research_or_skip")
    assert.equal(after, before)
  })

  it("persists unresolved intake as a recoverable focused checkpoint", async () => {
    const manager = createRuntime(
      intakeResult(candidate({ subject: unresolved("What exact subject should be used?", "No subject was supplied") })),
    )
    const threadId = store!.createThread().id
    store!.savePipelinePlan(plan(threadId))

    await manager.runProductionBriefIntake(threadId, "Incomplete request")

    const thread = store!.getThread(threadId)!
    assert.equal(thread.status, "waiting")
    assert.equal(thread.checkpoint?.type, "intake_clarification")
    assert.deepEqual(
      (thread.checkpoint?.payload as { questions: Array<{ question: string }> }).questions.map((item) => item.question),
      ["What exact subject should be used?"],
    )
    assert.equal(
      deriveCoordinatorAction({
        plan: store!.getPipelinePlan(threadId),
        checkpoint: thread.checkpoint,
        artifacts: store!.listArtifacts(threadId),
      }),
      "wait_for_human",
    )
  })

  it("rejects stale clarification decisions without replacing the current checkpoint", async () => {
    const manager = createRuntime(
      intakeResult(candidate({ subject: unresolved("What exact subject should be used?", "No subject was supplied") })),
    )
    const threadId = store!.createThread().id
    await manager.runProductionBriefIntake(threadId, "Incomplete request")
    const currentId = store!.getThread(threadId)!.checkpoint!.id

    await assert.rejects(
      () => manager.resumeClarification(threadId, "stale-checkpoint", "A supplied subject"),
      /Stale clarification checkpoint/,
    )
    assert.equal(store!.getThread(threadId)!.checkpoint!.id, currentId)
  })

  it("does not select a default when explicit target fields remain ambiguous", async () => {
    const manager = createRuntime(
      intakeResult(
        candidate({
          dimensions: provided({ width: 1080, height: 1920, unit: "px" }),
          aspectRatio: provided("9:16"),
          targetRequirements: provided([]),
        }),
      ),
    )
    const threadId = store!.createThread().id
    await manager.runProductionBriefIntake(threadId, "Ambiguous explicit target request")

    const resolution = await manager.resolveProductionTarget(threadId)
    const repeated = await manager.resolveProductionTarget(threadId)

    assert.equal(resolution.status, "needs_input")
    assert.equal(repeated.checkpointId, resolution.checkpointId)
    assert.equal(store!.getThread(threadId)?.checkpoint?.type, "target_clarification")
    assert.equal(
      store!.listArtifacts(threadId).some((artifact) => artifact.kind === "selected_target"),
      false,
    )
  })

  it("recomputes parent status and refuses an invalid specialist artifact", async () => {
    const valid = intakeResult(candidate())
    const manager = createRuntime({
      ...valid,
      artifact: { ...valid.artifact, unresolvedFields: ["subject"] },
      status: "ready",
    })
    const threadId = store!.createThread().id

    await assert.rejects(
      () => manager.runProductionBriefIntake(threadId, "Forged ready result"),
      /Parent rejected the intake artifact/,
    )
    assert.equal(store!.listArtifacts(threadId).length, 0)
  })

  it("applies an exact target clarification as a human-reviewed brief revision", async () => {
    const manager = createRuntime(
      intakeResult(
        candidate({
          dimensions: provided({ width: 1080, height: 1920, unit: "px" }),
          aspectRatio: provided("9:16"),
          targetRequirements: provided([]),
        }),
      ),
      {
        createCopywriterSpecialistRunner: () => ({
          async run() {
            return {
              runId: "clarification-copywriter",
              modelRoute: "test/copywriter",
              script: {
                title: "Clarified target script",
                objective: "Verify clarification continuation",
                scenes: [
                  {
                    id: "scene-1",
                    type: "hero",
                    title: "Clarified target",
                    durationInSeconds: 3,
                    missingCapabilities: [],
                  },
                ],
              },
            }
          },
        }),
      },
    )
    const threadId = store!.createThread().id
    store!.savePipelinePlan(plan(threadId))
    const parent = manager as unknown as ParentActionRuntime
    await parent.executeIntakeParentAction(threadId, "Choose an explicit target")
    await parent.executeTargetParentAction(threadId, "Choose an explicit target")
    const checkpointId = store!.getThread(threadId)?.checkpoint?.id
    assert.ok(checkpointId)

    await manager.resumeClarification(threadId, checkpointId, "target.video.003")

    const selected = store!.listArtifacts(threadId).find((artifact) => artifact.kind === "selected_target")
    const briefs = store!.listArtifacts(threadId).filter((artifact) => artifact.kind === "production_brief")
    assert.equal((selected?.data as { target?: { id?: string } } | undefined)?.target?.id, "target.video.003")
    assert.equal(briefs.length, 2)
    assert.equal(
      (briefs[1]?.data as { brief: { targetRequirements: { source: string } } }).brief.targetRequirements.source,
      "human_review",
    )
    assert.equal(store!.getThread(threadId)?.checkpoint?.type, "script_checkpoint")
  })

  it("rejects a clarification whose artifact version is no longer current", async () => {
    const manager = createRuntime(
      intakeResult(
        candidate({ subject: unresolved("What subject should be used?", "The request omitted the subject") }),
      ),
    )
    const threadId = store!.createThread().id
    await manager.runProductionBriefIntake(threadId, "Missing subject")
    const checkpoint = store!.getThread(threadId)!.checkpoint!
    store!.saveArtifact({
      threadId,
      kind: "production_brief",
      data: intakeResult(candidate()).artifact,
      approved: true,
    })

    await assert.rejects(
      () => manager.resumeClarification(threadId, checkpoint.id, "A supplied subject"),
      /Stale clarification artifact/,
    )
    assert.equal(store!.getThread(threadId)?.checkpoint?.id, checkpoint.id)
  })
})
