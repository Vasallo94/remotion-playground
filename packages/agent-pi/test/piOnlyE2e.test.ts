import { strict as assert } from "node:assert"
import { createHash } from "node:crypto"
import { createVisualRecipeTemplate } from "@claqueta/scene-contracts"
import { cascadeFixture } from "../../scene-contracts/test/fixtures/cascade.js"
import { join } from "node:path"
import { test } from "node:test"
import { contentHash } from "../src/contentHash.js"
import { AgentRuntimeManager } from "../src/session.js"
import { AgentPiStore } from "../src/store.js"
import {
  buildProductionBriefArtifact,
  validateProductionBriefArtifact,
  type ProductionBriefCandidate,
} from "../src/productionBrief.js"
import type { ConfigSpecialistInput } from "../src/configSpecialist.js"
import { cleanupTestDirectory, createTestTemporaryDirectory } from "../src/testCleanup.js"
import { buildActiveVisualRecipeSet, buildVisualRecipeArtifacts } from "../src/visualRecipes.js"

const provided = <T>(value: T) => ({ status: "provided" as const, value, source: "user" as const })
const absent = (rationale: string) => ({ status: "explicitly_absent" as const, rationale })

function candidate(): ProductionBriefCandidate {
  return {
    subject: provided("A subject supplied only by the test input"),
    objective: provided("Produce one complete deterministic video"),
    audience: provided("A supplied audience"),
    language: provided("English"),
    platform: provided("Web"),
    format: provided("video/mp4"),
    dimensions: provided({ width: 1280, height: 720, unit: "px" }),
    aspectRatio: provided("16:9"),
    duration: provided({ seconds: 3 }),
    brand: absent("No brand"),
    tone: absent("No tone"),
    evidence: absent("No external evidence"),
    assets: absent("No supplied assets"),
    constraints: absent("No extra constraints"),
    audioPreferences: provided({
      voiceover: "none",
      music: "none",
      soundEffects: "none",
      accessibilityNotes: ["No spoken audio"],
      notes: [],
    }),
    targetRequirements: provided([{ name: "target.id", requirement: "target.video.001" }]),
    acceptanceCriteria: provided(["Reach final publication after explicit checkpoints"]),
    researchRequirement: provided("not_required"),
    researchRationale: provided("No external claims require verification"),
  }
}

function configResult(input: ConfigSpecialistInput) {
  const soundDesign = input.audio?.data.soundDesign ?? { enabled: false, musicBed: null, sfx: [] }
  const config = {
    id: "pi-only-e2e-silent",
    title: "Pi-only E2E",
    compositionId: "ClaudeCodeTutorial",
    width: 1280,
    height: 720,
    fps: 30,
    scenes: [{ type: "callout", title: "Complete", durationInSeconds: 3 }],
    ...(input.audio ? { soundDesign, voiceover: input.audio.data.voiceover ?? undefined } : {}),
  }
  return {
    runId: input.audio ? "config-final" : "config-draft",
    modelRoute: "test/config",
    config,
    configHash: contentHash(config),
    lineage: {
      schemaVersion: 1 as const,
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
}

test("Pi-only new_video reaches publication through every human checkpoint without a main session", async () => {
  const root = createTestTemporaryDirectory("claqueta-agent-pi-")
  const store = new AgentPiStore(join(root, "e2e.db"))
  let publications = 0
  let renders = 0
  let qaRuns = 0
  let directionRevisionFeedback: string | undefined
  let publishedFileNames: string[] = []
  const runtime = new AgentRuntimeManager({
    store,
    createProductionBriefIntakeRunner: () => ({
      async run() {
        const artifact = buildProductionBriefArtifact(candidate())
        return {
          runId: "intake-e2e",
          modelRoute: "test/intake",
          artifact,
          validation: validateProductionBriefArtifact(artifact),
          status: "ready" as const,
        }
      },
    }),
    createCopywriterSpecialistRunner: () => ({
      async run() {
        return {
          runId: "copy-e2e",
          modelRoute: "test/copywriter",
          script: {
            title: "Pi-only script",
            objective: "Complete the pipeline",
            scenes: [
              {
                id: "scene-1",
                type: "callout",
                title: "Complete",
                voiceover: "",
                durationInSeconds: 3,
                missingCapabilities: [],
              },
            ],
          },
        }
      },
    }),
    createDirectionSpecialistRunner: () => ({
      async run(script, revision) {
        if (revision?.feedback) directionRevisionFeedback = revision.feedback
        return {
          runId: "direction-e2e",
          modelRoute: "test/direction",
          direction: {
            title: "Pi-only direction",
            scenes: script.scenes.map((scene) => ({
              sceneId: scene.id,
              sceneType: scene.type,
              title: scene.title ?? scene.id,
              technicalIntent: "Preserve approved copy",
              visualContract: "Use registered scene props",
              timing: { tailHoldMs: 300, transitionMs: 200 },
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
    createConfigSpecialistRunner: () => ({
      async run(input) {
        return configResult(input)
      },
    }),
    createSceneStillClient: () => ({
      async render() {
        return [
          {
            index: 0,
            path: "/safe/e2e.png",
            frameNumber: 1,
            image: { type: "image" as const, data: "cG5n", mimeType: "image/png" },
          },
        ]
      },
    }),
    createSceneQaSpecialistRunner: () => ({
      async run() {
        qaRuns += 1
        return qaRuns === 1
          ? {
              runId: "qa-e2e-initial",
              modelRoute: "test/qa",
              report: {
                summary: "Remove the visible overlay",
                scenes: [
                  {
                    index: 0,
                    verdict: "MAJOR_ISSUE" as const,
                    score: 5,
                    observations: ["An unapproved overlay is visible"],
                    issues: [
                      {
                        category: "accuracy",
                        severity: "major" as const,
                        observation: "Overlay conflicts with approved intent",
                        evidence: "Visible in the parent-rendered still",
                        suggestedChange: "Remove the overlay",
                      },
                    ],
                  },
                ],
              },
            }
          : {
              runId: "qa-e2e-revised",
              modelRoute: "test/qa",
              report: {
                summary: "All revised scenes pass",
                scenes: [{ index: 0, verdict: "PASS" as const, score: 10, observations: [], issues: [] }],
              },
            }
      },
    }),
    createAudioPlannerSpecialistRunner: () => ({
      async run() {
        return {
          runId: "audio-e2e",
          modelRoute: "test/audio",
          chart: { voiceover: null, soundDesign: { enabled: false, musicBed: null, sfx: [] }, warnings: [] },
          library: [],
        }
      },
    }),
    createAudioAssetProducer: () => ({
      async produce(input) {
        return {
          configId: input.config.id as string,
          voiceStatus: "skipped" as const,
          soundStatus: "skipped" as const,
          assets: [],
          generatedAt: "2026-07-12T00:00:00Z",
        }
      },
    }),
    validateFinalConfig: async () => ({ valid: true }),
    submitRender: async () => {
      renders += 1
      return { jobId: "e2e-render", reused: false }
    },
    getRenderStatus: async () => ({
      id: "e2e-render",
      config_id: "pi-only-e2e-silent",
      title: "Pi-only E2E",
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
    reviewRender: async () => ({
      jobId: "e2e-render",
      configId: "pi-only-e2e-silent",
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
    publishFiles: async (_slug, files) => {
      publications += 1
      publishedFileNames = [...files.keys()]
      return Object.fromEntries(
        [...files].map(([name, content]) => [
          name,
          { path: `safe/${name}`, sha256: createHash("sha256").update(content).digest("hex") },
        ]),
      )
    },
  })

  try {
    const threadId = await runtime.getOrCreateThread(null, "Pi-only E2E")
    await runtime.sendMessage(threadId, "Create the supplied video", { mode: "new_video" })
    assert.equal(store.getThread(threadId)?.checkpoint?.type, "script_checkpoint")

    await runtime.resumeCheckpoint(threadId, { approved: true })
    assert.equal(store.getThread(threadId)?.checkpoint?.type, "direction_checkpoint")

    const visualArtifacts = buildVisualRecipeArtifacts({
      targetId: "target.video.001",
      sceneIndex: 0,
      template: createVisualRecipeTemplate({
        version: 1,
        templateId: "e2e-cascade",
        program: cascadeFixture,
        bindings: [],
      }),
    })
    store.saveArtifact({ threadId, kind: "visual_recipe", data: visualArtifacts.recipe, approved: true })
    store.saveArtifact({
      threadId,
      kind: "visual_recipe_evidence",
      data: visualArtifacts.evidence,
      approved: true,
    })
    const activeVisualRecipeSet = buildActiveVisualRecipeSet("target.video.001", visualArtifacts.recipe)
    store.saveArtifact({
      threadId,
      kind: "active_visual_recipe_set",
      data: activeVisualRecipeSet,
      approved: true,
    })

    await runtime.resumeCheckpoint(threadId, { approved: true })
    assert.equal(store.getThread(threadId)?.checkpoint?.type, "qa_report_checkpoint")
    await assert.rejects(
      () => runtime.resumeCheckpoint(threadId, { approved: false }),
      /rejection requires non-empty revision feedback/,
    )
    assert.equal(store.getThread(threadId)?.checkpoint?.type, "qa_report_checkpoint")

    await runtime.resumeCheckpoint(threadId, { approved: false, feedback: "Remove the unapproved overlay." })
    assert.equal(store.getThread(threadId)?.checkpoint?.type, "direction_checkpoint")
    assert.match(directionRevisionFeedback ?? "", /Remove the unapproved overlay/)
    assert.match(directionRevisionFeedback ?? "", /Exact parent-verified Scene QA findings/)

    await runtime.resumeCheckpoint(threadId, {
      approved: false,
      feedback: "Keep the revision but make the remediation contract explicit.",
    })
    assert.equal(store.getThread(threadId)?.checkpoint?.type, "direction_checkpoint")
    assert.match(directionRevisionFeedback ?? "", /make the remediation contract explicit/)

    await runtime.resumeCheckpoint(threadId, { approved: true })
    assert.equal(store.getThread(threadId)?.checkpoint?.type, "audio_chart_checkpoint")
    assert.equal(store.listArtifacts(threadId).filter((artifact) => artifact.kind === "qa_report").length, 2)
    assert.equal(store.listArtifacts(threadId).filter((artifact) => artifact.kind === "qa_lineage").length, 2)
    assert.equal(store.listArtifacts(threadId).filter((artifact) => artifact.kind === "direction").length, 3)
    assert.equal(store.listArtifacts(threadId).filter((artifact) => artifact.kind === "config").length, 2)

    await runtime.resumeCheckpoint(threadId, { approved: true })
    assert.equal(store.getThread(threadId)?.checkpoint?.type, "final_review_checkpoint")

    await runtime.resumeCheckpoint(threadId, { approved: true })
    assert.equal(store.getThread(threadId)?.checkpoint, null)
    const finalPlan = store.getPipelinePlan(threadId)!
    assert.deepEqual(
      finalPlan.steps
        .filter((step) => step.status !== "completed" && step.status !== "skipped")
        .map((step) => [step.id, step.status]),
      [],
    )
    assert.equal(finalPlan.status, "completed")
    assert.equal(finalPlan.progress.completed, finalPlan.progress.total)
    assert.equal(publications, 1)
    assert.equal(renders, 1)
    assert.ok(publishedFileNames.includes("visual-recipe-lineage.json"))
    const finalConfig = store
      .listArtifacts(threadId)
      .filter((artifact) => artifact.kind === "config")
      .sort((left, right) => right.version - left.version)[0]!
    assert.equal(
      (finalConfig.data as { activeVisualRecipeSetDigest: string }).activeVisualRecipeSetDigest,
      activeVisualRecipeSet.digest,
    )
    for (const kind of ["config_lineage", "qa_lineage", "validation_report", "render_job", "render_review"] as const) {
      const artifact = store
        .listArtifacts(threadId)
        .filter((candidate) => candidate.kind === kind)
        .sort((left, right) => right.version - left.version)[0]!
      assert.equal(
        (artifact.data as { activeVisualRecipeSet: { digest: string } }).activeVisualRecipeSet.digest,
        activeVisualRecipeSet.digest,
        `${kind} must retain exact active recipe lineage`,
      )
    }
    assert.equal(store.getThread(threadId)?.piSessionId, null)
    assert.equal(
      store.listActionAttempts(threadId).every((attempt) => attempt.status === "succeeded"),
      true,
    )
    assert.equal(
      store.listArtifacts(threadId).some((artifact) => artifact.kind === "render_review" && artifact.approved),
      true,
    )
  } finally {
    runtime.dispose()
    store.close()
    cleanupTestDirectory(root)
  }
})
