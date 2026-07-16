import { describe, it, afterEach, beforeEach } from "node:test"
import assert from "node:assert/strict"
import { createServer, type Server } from "node:http"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { AgentPiStore } from "../src/store.js"
import { ThreadEventBus } from "../src/events.js"
import { createClaquetaTools, type ClaquetaToolContext } from "../src/tools.js"
import {
  AGENT_PI_TEST_FIXTURE_DIRECTORY,
  cleanupTestDirectory,
  createTestTemporaryDirectory,
} from "../src/testCleanup.js"

let store: AgentPiStore
let eventBus: ThreadEventBus
let threadId: string
let dbDir: string
let dbPath: string
let server: Server | undefined
let renderServiceUrl = "http://127.0.0.1:3100"
let produceAudioAssets: ClaquetaToolContext["produceAudioAssets"]
let runAudioPlannerSpecialist: ClaquetaToolContext["runAudioPlannerSpecialist"]
let runResearchSpecialist: ClaquetaToolContext["runResearchSpecialist"]
let runSceneComposerSpecialist: ClaquetaToolContext["runSceneComposerSpecialist"]
let runSceneQaSpecialist: ClaquetaToolContext["runSceneQaSpecialist"]
let runCopywriterSpecialist: ClaquetaToolContext["runCopywriterSpecialist"]
let runDirectionSpecialist: ClaquetaToolContext["runDirectionSpecialist"]

beforeEach(() => {
  dbDir = createTestTemporaryDirectory("agent-pi-tools-")
  dbPath = join(dbDir, "test.db")
  store = new AgentPiStore(dbPath)
  eventBus = new ThreadEventBus(store)
  threadId = store.createThread().id
  produceAudioAssets = undefined
  runAudioPlannerSpecialist = undefined
  runResearchSpecialist = undefined
  runSceneComposerSpecialist = undefined
  runSceneQaSpecialist = undefined
  runCopywriterSpecialist = undefined
  runDirectionSpecialist = undefined
})

afterEach(() => {
  server?.close()
  server = undefined
  store.close()
  cleanupTestDirectory(dbDir)
  cleanupTestDirectory(AGENT_PI_TEST_FIXTURE_DIRECTORY)
})

function toolByName(name: string) {
  const tool = createClaquetaTools({
    threadId,
    store,
    eventBus,
    renderServiceUrl,
    produceAudioAssets,
    runAudioPlannerSpecialist,
    runResearchSpecialist,
    runSceneComposerSpecialist,
    runSceneQaSpecialist,
    runCopywriterSpecialist,
    runDirectionSpecialist,
  }).find((tool) => tool.name === name)
  assert(tool, `tool not found: ${name}`)
  return tool
}

async function executeTool(name: string, params: Record<string, unknown>) {
  return toolByName(name).execute("call-1", params as never, undefined, undefined, undefined as never)
}

function startMockRenderService(): Promise<void> {
  server = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json")
    if (req.url === "/api/validate" && req.method === "POST") {
      res.writeHead(200)
      res.end(JSON.stringify({ valid: true }))
      return
    }
    if (req.url === "/api/render" && req.method === "POST") {
      res.writeHead(200)
      res.end(JSON.stringify({ jobId: "job-123" }))
      return
    }
    if (req.url === "/api/render/job-123/review" && req.method === "GET") {
      res.writeHead(200)
      res.end(
        JSON.stringify({
          jobId: "job-123",
          configId: "compact-demo",
          reviewedAt: "2026-07-02T00:00:11Z",
          passed: true,
          fileSizeBytes: 1234,
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
      )
      return
    }
    if (req.url === "/api/render/job-123/status" && req.method === "GET") {
      res.writeHead(200)
      res.end(
        JSON.stringify({
          id: "job-123",
          config_id: "compact-demo",
          title: "Compact demo",
          composition: "ClaudeCodeTutorial",
          status: "done",
          progress: 100,
          output_path: "/tmp/output.mp4",
          file_size: 1234,
          thread_id: threadId,
          error: null,
          created_at: "2026-07-02T00:00:00Z",
          completed_at: "2026-07-02T00:00:10Z",
        }),
      )
      return
    }
    res.writeHead(404)
    res.end(JSON.stringify({ error: "not found" }))
  })

  return new Promise((resolve) => {
    server!.listen(0, "127.0.0.1", () => {
      const address = server!.address()
      assert(address && typeof address === "object")
      renderServiceUrl = `http://127.0.0.1:${address.port}`
      resolve()
    })
  })
}

describe("Claqueta tools", () => {
  it("persists and updates the pipeline plan", async () => {
    const created = await executeTool("create_pipeline_plan", {
      mode: "new_video",
      goal: "Create a tutorial",
      steps: [{ id: "cp1_script", owner: "model", title: "Invented", status: "pending" }],
    })
    assert.equal(created.details.planPath, "/pipeline/plan.json")
    assert.equal(store.listEvents(threadId).at(-1)?.type, "plan_updated")

    const read = await executeTool("read_pipeline_plan", {})
    assert.equal(read.details.exists, true)
    assert.equal((read.details.plan as { steps: Array<{ id: string; status: string }> }).steps[0].id, "research")
    assert.equal(
      (read.details.plan as { steps: Array<{ id: string }> }).steps.some((step) => step.id === "cp1_script"),
      false,
    )

    const updated = await executeTool("update_pipeline_step", {
      stepId: "research",
      status: "in_progress",
      summary: "Collecting references",
    })
    assert.equal((updated.details.step as { status: string }).status, "in_progress")

    const next = await executeTool("get_next_pipeline_step", {})
    assert.equal(next.details.status, "in_progress")

    await assert.rejects(
      executeTool("update_pipeline_step", { stepId: "invented_step", status: "completed" }),
      /Unknown pipeline step/,
    )

    await executeTool("record_pipeline_decision", {
      decisionId: "decision-1",
      checkpointId: "cp-1",
      stepId: "research",
      status: "approved",
      summary: "Looks good",
    })

    const plan = store.getPipelinePlan(threadId)
    assert.equal(plan?.decisions.length, 1)
    assert.equal(plan?.status, "active")
  })

  it("persists cited research and injects it into copywriter evidence", async () => {
    await executeTool("create_pipeline_plan", { mode: "new_video", goal: "Create a factual video" })
    runResearchSpecialist = async () => ({
      runId: "research-run-1",
      modelRoute: "openai-codex/research-test",
      research: {
        topic: "Migración de aves",
        objective: "Documentar una ruta",
        summary: "Resumen citado",
        keyConcepts: ["migración"],
        claims: [
          {
            claim: "La ruta es estacional.",
            sourceUrls: ["https://example.org/birds"],
            confidence: "high",
          },
        ],
        examples: [],
        unknowns: [],
        sourceUrls: ["https://example.org/birds"],
      },
    })
    const researchResult = await executeTool("run_research_specialist", {
      request: "Explica una migración de aves",
      subject: "Migración de aves",
      objective: "Documentar una ruta",
    })
    assert.equal((researchResult.details.artifact as { kind: string }).kind, "research")
    assert.equal(store.getPipelinePlan(threadId)?.steps.find((step) => step.id === "research")?.status, "completed")

    let receivedEvidence: string[] = []
    runCopywriterSpecialist = async (_request, brief) => {
      receivedEvidence = brief.evidence ?? []
      return {
        runId: "copywriter-after-research",
        modelRoute: "openai-codex/copywriter-test",
        script: {
          title: "Migración",
          objective: "Explicar una ruta",
          scenes: [
            {
              id: "scene-1",
              type: "callout",
              title: "Ruta estacional",
              visualNotes: "Afirmación citada",
              narrativeRole: "explanation",
              visualType: "builtin",
              visualRole: "destacar evidencia",
              propsPlan: { text: "La ruta es estacional" },
              visualRationale: "Una afirmación concreta",
              requiredAssets: [],
              missingCapabilities: [],
              riskNotes: [],
              durationInSeconds: 5,
            },
          ],
        },
      }
    }
    await executeTool("run_copywriter_specialist", {
      request: "Explica una migración de aves",
      brief: { subject: "Migración de aves", goal: "Explicar una ruta" },
    })
    assert.equal(receivedEvidence.length, 1)
    assert.match(receivedEvidence[0], /https:\/\/example\.org\/birds/)
  })

  it("runs the isolated copywriter and persists a catalog-valid script", async () => {
    await executeTool("create_pipeline_plan", { mode: "new_video", goal: "Create a topic-neutral video" })
    runCopywriterSpecialist = async () => ({
      runId: "copywriter-run-1",
      modelRoute: "openai-codex/copywriter-test",
      script: {
        title: "La madera y la humedad",
        objective: "Explicar un comportamiento material",
        scenes: [
          {
            id: "scene-1",
            type: "callout",
            title: "Intercambio de humedad",
            visualNotes: "Una afirmación concreta",
            narrativeRole: "explanation",
            visualType: "builtin",
            visualRole: "destacar la idea principal",
            propsPlan: { text: "La madera intercambia humedad con el aire" },
            visualRationale: "Una afirmación legible encaja con el contrato",
            requiredAssets: [],
            missingCapabilities: [],
            riskNotes: [],
            durationInSeconds: 6,
          },
        ],
      },
    })

    const result = await executeTool("run_copywriter_specialist", {
      request: "Explica por qué se mueve la madera",
      brief: { subject: "Movimiento de la madera", goal: "Enseñar el efecto de la humedad" },
    })

    assert.equal(result.details.runId, "copywriter-run-1")
    assert.equal((result.details.artifact as { kind: string }).kind, "script")
    const copywritingStep = store.getPipelinePlan(threadId)?.steps.find((step) => step.id === "copywriting")
    assert.equal(copywritingStep?.status, "in_progress")
    assert.equal(copywritingStep?.owner, "copywriter")
    assert.equal(copywritingStep?.modelRoute, "openai-codex/copywriter-test")
  })

  it("rejects copywriter output that invents an unregistered scene component", async () => {
    await executeTool("create_pipeline_plan", { mode: "new_video", goal: "Create a video" })
    runCopywriterSpecialist = async () => ({
      runId: "copywriter-invalid",
      modelRoute: "openai-codex/copywriter-test",
      script: {
        title: "Invalid draft",
        objective: "Test catalog enforcement",
        scenes: [
          {
            id: "scene-1",
            type: "custom",
            componentId: "invented-topic-scene",
            title: "Invented",
            visualNotes: "A made-up visual",
            narrativeRole: "explanation",
            visualType: "custom",
            visualRole: "show an unsupported structure",
            propsPlan: { value: "x" },
            visualRationale: "Invalid on purpose",
            requiredAssets: [],
            missingCapabilities: [],
            riskNotes: [],
            durationInSeconds: 6,
          },
        ],
      },
    })

    await assert.rejects(
      () =>
        executeTool("run_copywriter_specialist", {
          request: "Create a video",
          brief: { subject: "Any subject", goal: "Explain it" },
        }),
      /unknown componentId/,
    )
    assert.equal(
      store.listArtifacts(threadId).some((artifact) => artifact.kind === "script"),
      false,
    )
    assert.equal(store.getPipelinePlan(threadId)?.steps.find((step) => step.id === "copywriting")?.status, "failed")
  })

  it("runs the audio planner and presents a recoverable CP3 checkpoint", async () => {
    await executeTool("create_pipeline_plan", { mode: "new_video", goal: "Create a silent story" })
    const script = {
      title: "Una carta tardía",
      objective: "Contar una historia",
      scenes: [
        {
          id: "scene-1",
          type: "callout",
          title: "La carta llega",
          visualNotes: "Una frase",
          narrativeRole: "hook",
          visualType: "builtin",
          visualRole: "centrar la atención",
          propsPlan: { text: "Veinte años después" },
          visualRationale: "Una apertura legible",
          requiredAssets: [],
          missingCapabilities: [],
          riskNotes: [],
          durationInSeconds: 6,
        },
      ],
    }
    await executeTool("save_script_artifact", { script, approved: true })
    await executeTool("save_direction_artifact", {
      approved: true,
      direction: {
        scenes: [
          {
            sceneId: "scene-1",
            sceneType: "callout",
            technicalIntent: "Mantener intimidad",
            visualContract: "Texto central",
            timing: { tailHoldMs: 400 },
            beats: [],
            assets: [],
            risks: [],
          },
        ],
        warnings: [],
      },
    })
    runAudioPlannerSpecialist = async () => ({
      runId: "audio-run-1",
      modelRoute: "openai-codex/audio-test",
      chart: {
        voiceover: null,
        soundDesign: { enabled: false, musicBed: null, sfx: [] },
        warnings: ["Silence is deliberate"],
      },
    })

    const result = await executeTool("run_audio_planner_specialist", {
      preferences: { voiceover: "none", soundDesign: "none" },
    })
    const artifact = result.details.artifact as { id: string; kind: string }
    assert.equal(artifact.kind, "audio_chart")
    assert.equal(
      store.getPipelinePlan(threadId)?.steps.find((step) => step.id === "audio_plan")?.modelRoute,
      "openai-codex/audio-test",
    )

    await executeTool("present_audio_chart_checkpoint", { artifactId: artifact.id })
    assert.equal(store.getThread(threadId)?.checkpoint?.type, "audio_chart_checkpoint")
  })

  it("resolves missing visuals through declarative composition without source writes", async () => {
    await executeTool("create_pipeline_plan", { mode: "new_video", goal: "Compose a reusable visual" })
    const source = await executeTool("save_script_artifact", {
      script: {
        title: "Measured result",
        objective: "Explain one result",
        scenes: [
          {
            id: "result",
            type: "callout",
            narrativeRole: "proof",
            visualType: "builtin",
            visualRole: "show metric and meaning",
            propsPlan: { text: "42" },
            visualRationale: "Truthful fallback",
            requiredAssets: [],
            missingCapabilities: ["Combine metric and explanation"],
            riskNotes: [],
            durationInSeconds: 5,
          },
        ],
      },
    })
    await assert.rejects(
      executeTool("present_script_checkpoint", { artifactId: (source.details.artifact as { id: string }).id }),
      /run_scene_composer_specialist/,
    )
    runSceneComposerSpecialist = async () => ({
      runId: "composer-run",
      modelRoute: "openai-codex/composer-test",
      result: {
        summary: "Resolved declaratively",
        resolutions: [
          {
            sceneId: "result",
            outcome: "composed",
            rationale: "Standard primitives are sufficient",
            spec: {
              version: 1,
              root: {
                type: "group",
                direction: "row",
                children: [
                  { type: "metric", value: "42", label: "Result" },
                  { type: "card", title: "Meaning", body: "Approved explanation" },
                ],
              },
            },
          },
        ],
      },
    })
    const result = await executeTool("run_scene_composer_specialist", {
      scriptArtifactId: (source.details.artifact as { id: string }).id,
    })
    const script = result.details.script as { scenes: Array<{ componentId: string; missingCapabilities: string[] }> }
    assert.equal(script.scenes[0]?.componentId, "composed-scene")
    assert.deepEqual(script.scenes[0]?.missingCapabilities, [])
    assert.equal(result.terminate, true)
    assert.equal(store.getThread(threadId)?.checkpoint?.type, "script_checkpoint")
    assert.equal(
      store.getPipelinePlan(threadId)?.steps.find((step) => step.id === "scene_creation")?.status,
      "completed",
    )
  })

  it("persists Scene QA findings and presents a recoverable checkpoint", async () => {
    await executeTool("create_pipeline_plan", { mode: "new_video", goal: "Review a rendered scene" })
    await executeTool("save_script_artifact", {
      approved: true,
      script: {
        title: "Visual",
        objective: "Inform",
        scenes: [{ id: "s1", type: "intro", title: "Start", durationInSeconds: 3 }],
      },
    })
    await executeTool("save_direction_artifact", {
      approved: true,
      direction: { scenes: [{ sceneId: "s1", sceneType: "intro", technicalIntent: "Open" }], warnings: [] },
    })
    await executeTool("generate_remotion_config", {
      config: { id: "visual-qa", title: "Visual", scenes: [{ type: "intro", title: "Start", durationInSeconds: 3 }] },
    })
    runSceneQaSpecialist = async () => ({
      runId: "qa-run",
      modelRoute: "google/qa-test",
      report: {
        summary: "One localized legibility issue",
        scenes: [
          {
            index: 0,
            verdict: "MINOR_FIX",
            score: 7,
            observations: ["Title is visible"],
            issues: [
              {
                category: "legibility",
                severity: "minor",
                observation: "Subtitle is small",
                evidence: "Bottom subtitle occupies few pixels",
                suggestedChange: "Increase existing subtitle size",
              },
            ],
          },
        ],
      },
    })
    const result = await executeTool("run_scene_qa_specialist", {})
    assert.equal(result.details.needsReview, true)
    const artifact = result.details.artifact as { id: string }
    await executeTool("present_qa_report_checkpoint", { artifactId: artifact.id })
    assert.equal(store.getThread(threadId)?.checkpoint?.type, "qa_report_checkpoint")
    assert.equal(store.getPipelinePlan(threadId)?.steps.find((step) => step.id === "scene_qa")?.status, "blocked")
  })

  it("materializes approved audio and completes independent production steps", async () => {
    await executeTool("create_pipeline_plan", { mode: "new_video", goal: "Produce approved audio" })
    await executeTool("save_script_artifact", {
      approved: true,
      script: {
        title: "Silent",
        objective: "Test",
        scenes: [{ id: "s1", type: "intro", title: "Start", durationInSeconds: 3 }],
      },
    })
    store.saveArtifact({
      threadId,
      kind: "audio_chart",
      approved: true,
      data: { voiceover: null, soundDesign: { enabled: false, musicBed: null, sfx: [] }, warnings: [] },
    })
    await executeTool("generate_remotion_config", {
      config: {
        id: "silent-production",
        title: "Silent",
        scenes: [{ type: "intro", title: "Start", durationInSeconds: 3 }],
      },
    })
    produceAudioAssets = async () => ({
      configId: "silent-production",
      voiceStatus: "skipped",
      soundStatus: "skipped",
      assets: [],
      generatedAt: new Date().toISOString(),
    })

    const result = await executeTool("produce_approved_audio_assets", {})
    assert.equal((result.details.manifest as { voiceStatus: string }).voiceStatus, "skipped")
    assert.equal(
      store.listArtifacts(threadId).some((artifact) => artifact.kind === "audio_assets"),
      true,
    )
    assert.equal(
      store.getPipelinePlan(threadId)?.steps.find((step) => step.id === "voice_generation")?.status,
      "skipped",
    )
    assert.equal(store.getPipelinePlan(threadId)?.steps.find((step) => step.id === "sound_assets")?.status, "skipped")
  })

  it("runs the isolated direction specialist and persists its artifact", async () => {
    await executeTool("create_pipeline_plan", { mode: "new_video", goal: "Create a topic-neutral video" })
    const script = {
      title: "Tema libre",
      objective: "Explicar una idea",
      scenes: [
        {
          id: "scene-1",
          type: "callout",
          title: "Idea",
          visualType: "builtin",
          propsPlan: { text: "Idea concreta" },
          durationInSeconds: 5,
        },
      ],
    }
    await executeTool("save_script_artifact", { script, approved: true })
    runDirectionSpecialist = async () => ({
      runId: "director-run-1",
      modelRoute: "anthropic/director-test",
      direction: {
        title: "Dirección",
        scenes: [
          {
            sceneId: "scene-1",
            sceneType: "callout",
            technicalIntent: "Mantener una idea legible",
            visualContract: "Texto central",
            timing: { transitionMs: 250 },
            beats: [],
            assets: [],
            risks: [],
          },
        ],
        warnings: [],
        risks: [],
      },
    })

    const result = await executeTool("run_direction_specialist", {})

    assert.equal(result.details.runId, "director-run-1")
    assert.equal((result.details.artifact as { kind: string }).kind, "direction")
    const directionStep = store.getPipelinePlan(threadId)?.steps.find((step) => step.id === "direction")
    assert.equal(directionStep?.status, "in_progress")
    assert.equal(directionStep?.owner, "director")
    assert.equal(directionStep?.modelRoute, "anthropic/director-test")
  })

  it("saves and presents a script checkpoint", async () => {
    const script = {
      title: "Tutorial /compact",
      objective: "Explicar /compact en Codex",
      audience: "developers",
      tone: "práctico",
      scenes: [{ id: "s1", type: "intro", title: "Hook", durationInSeconds: 3 }],
      estimatedDurationSeconds: 3,
    }

    await executeTool("create_script_draft", { script })
    const scriptArtifact = store.listArtifacts(threadId).find((artifact) => artifact.kind === "script")
    assert(scriptArtifact)

    const result = await executeTool("present_script_checkpoint", {})
    assert.equal(result.terminate, true)
    assert.equal(store.getThread(threadId)?.status, "waiting")
    assert.equal(store.listEvents(threadId).at(-1)?.type, "checkpoint")
  })

  it("returns recoverable validation feedback for invented visual types", async () => {
    const result = await executeTool("create_script_draft", {
      script: {
        title: "Bad visual planning",
        objective: "Avoid invented scene contracts",
        scenes: [
          {
            id: "s1",
            type: "callout",
            title: "Horarios",
            visualType: "ui-dashboard",
            durationInSeconds: 4,
          },
        ],
      },
    })

    assert.equal(result.details.valid, false)
    assert.match((result.details.errors as string[]).join("\n"), /visualType must be 'builtin' or 'custom'/i)
    assert.equal(store.listEvents(threadId).at(-1)?.type, "error")
  })

  it("returns recoverable validation feedback for invented scene types", async () => {
    const result = await executeTool("create_script_draft", {
      script: {
        title: "Bad scene type",
        objective: "Avoid fallback callouts",
        scenes: [{ id: "s1", type: "explainer", title: "Mapa", durationInSeconds: 4 }],
      },
    })

    assert.equal(result.details.valid, false)
    assert.match((result.details.errors as string[]).join("\n"), /unknown type 'explainer'/i)
  })

  it("requires a props plan for custom script scenes", async () => {
    const result = await executeTool("create_script_draft", {
      script: {
        title: "Missing props plan",
        objective: "Avoid vague custom scenes",
        scenes: [
          {
            id: "s1",
            type: "custom",
            title: "Diagrama",
            visualType: "custom",
            componentId: "block-diagram",
            durationInSeconds: 4,
          },
        ],
      },
    })

    assert.equal(result.details.valid, false)
    assert.match((result.details.errors as string[]).join("\n"), /does not include propsPlan/i)
  })

  it("exports scene-level visual planning fields to markdown", async () => {
    const script = {
      title: "Visual planning demo",
      objective: "Test scene planning export",
      scenes: [
        {
          id: "s1",
          type: "callout",
          title: "Hook",
          narrativeRole: "hook",
          visualType: "builtin",
          componentId: "callout",
          visualRole: "callout de apertura",
          propsPlan: { text: "Idea principal", position: "center" },
          visualRationale: "Usa un callout para abrir con una idea clara",
          requiredAssets: ["headline copy", "brand accent"],
          missingCapabilities: ["confirmed screenshot"],
          riskNotes: ["Could feel static if text is too long"],
          durationInSeconds: 4,
        },
      ],
    }

    await executeTool("create_script_draft", { script })
    const markdownArtifact = store.listArtifacts(threadId).find((artifact) => artifact.kind === "script_markdown")
    assert(markdownArtifact)
    assert.match(markdownArtifact.data as string, /Función narrativa.*hook/)
    assert.match(markdownArtifact.data as string, /Tipo visual.*builtin/)
    assert.match(markdownArtifact.data as string, /Componente.*callout/)
    assert.match(markdownArtifact.data as string, /Rol visual.*callout de apertura/)
    assert.match(markdownArtifact.data as string, /Plan de props.*Idea principal/)
    assert.match(markdownArtifact.data as string, /Razón visual.*Usa un callout/)
    assert.match(markdownArtifact.data as string, /Recursos requeridos:/)
    assert.match(markdownArtifact.data as string, /Capacidades faltantes:/)
    assert.match(markdownArtifact.data as string, /Notas de riesgo:/)
  })

  it("generates config with ClaudeCodeTutorial defaults", async () => {
    const result = await executeTool("generate_remotion_config", {
      config: { title: "Compact demo", scenes: [{ type: "intro", title: "Hola", durationInSeconds: 3 }] },
    })
    const config = result.details.config as Record<string, unknown>
    assert.equal(config.composition, "ClaudeCodeTutorial")
    assert.equal(config.theme, "betelgeuse")
    assert.equal(config.fps, 30)
    assert.equal(
      store.listArtifacts(threadId).some((artifact) => artifact.kind === "config"),
      true,
    )
  })

  it("normalizes script-like scene fields into valid Remotion scene props", async () => {
    const result = await executeTool("generate_remotion_config", {
      config: {
        title: "Compact demo",
        transition: "cut",
        scenes: [
          {
            type: "terminal",
            title: "Demo",
            lines: [
              { kind: "command", text: "/compact" },
              { kind: "output", text: "ok" },
            ],
            durationInSeconds: 5,
          },
          { type: "callout", title: "Cuándo usarlo", items: ["antes", "después"], durationInSeconds: 4 },
          { type: "outro", title: "Resumen", summary: "No empiezas de cero", durationInSeconds: 3 },
        ],
      },
    })
    const config = result.details.config as { scenes: Array<Record<string, unknown>>; transition: { type: string } }
    assert.deepEqual(config.scenes[0].lines, [
      { kind: "command", text: "/compact" },
      { kind: "output", text: "ok" },
    ])
    assert.equal(config.scenes[1].text, "antes · después")
    assert.deepEqual(config.scenes[2].bullets, ["No empiezas de cero"])
    assert.equal(config.transition.type, "none")
  })

  it("preserves registered custom scenes when generating config", async () => {
    const result = await executeTool("generate_remotion_config", {
      config: {
        title: "Custom scene demo",
        scenes: [
          {
            type: "custom",
            componentId: "block-diagram",
            props: { title: "Pipeline", blocks: [{ id: "a", label: "A" }] },
            durationInSeconds: 8,
          },
        ],
      },
    })

    const config = result.details.config as { scenes: Array<Record<string, unknown>> }
    assert.deepEqual(config.scenes[0], {
      type: "custom",
      componentId: "block-diagram",
      props: { title: "Pipeline", blocks: [{ id: "a", label: "A" }] },
      durationInSeconds: 8,
    })
  })

  it("preserves only contract-valid composed scenes", async () => {
    const result = await executeTool("generate_remotion_config", {
      config: {
        title: "Declarative visual",
        scenes: [
          {
            type: "custom",
            componentId: "composed-scene",
            props: {
              version: 1,
              title: "Measured result",
              root: {
                type: "group",
                direction: "grid",
                columns: 2,
                children: [
                  { type: "metric", value: "42", label: "Result", tone: "accent" },
                  { type: "card", title: "Meaning", body: "Approved explanation" },
                ],
              },
            },
            durationInSeconds: 6,
          },
        ],
      },
    })
    const config = result.details.config as { scenes: Array<{ componentId: string }> }
    assert.equal(config.scenes[0]?.componentId, "composed-scene")

    await assert.rejects(
      executeTool("generate_remotion_config", {
        config: {
          title: "Unsafe visual",
          scenes: [
            {
              type: "custom",
              componentId: "composed-scene",
              props: { version: 1, root: { type: "text", text: "Unsafe", style: { position: "fixed" } } },
              durationInSeconds: 4,
            },
          ],
        },
      }),
      /invalid composed-scene props/i,
    )
  })

  it("fails terminal scenes without lines instead of inventing fallback content", async () => {
    await assert.rejects(
      executeTool("generate_remotion_config", {
        config: {
          title: "Broken terminal demo",
          scenes: [{ type: "terminal", title: "Demo", durationInSeconds: 5 }],
        },
      }),
      /must define non-empty lines/i,
    )
  })

  it("fails unknown custom componentIds with an actionable error", async () => {
    await assert.rejects(
      executeTool("generate_remotion_config", {
        config: {
          title: "Unknown custom demo",
          scenes: [{ type: "custom", componentId: "not-registered", durationInSeconds: 5 }],
        },
      }),
      /unknown componentId/i,
    )
  })

  it("fails unknown scene types instead of downgrading them to callouts", async () => {
    await assert.rejects(
      executeTool("generate_remotion_config", {
        config: {
          title: "Unknown type demo",
          scenes: [{ type: "explainer", title: "Mapa", durationInSeconds: 5 }],
        },
      }),
      /unknown scene type/i,
    )
  })

  it("publishes approved artifacts to content/tutorials", async () => {
    const script = {
      title: "Agent Pi tools test",
      objective: "Verify publishing",
      scenes: [{ id: "s1", type: "intro", title: "Hook", durationInSeconds: 3 }],
    }
    await executeTool("save_script_artifact", { script, approved: true })
    await executeTool("save_direction_artifact", {
      direction: { scenes: [{ sceneId: "s1", sceneType: "intro", technicalIntent: "Open" }], warnings: [] },
      approved: true,
    })
    store.saveArtifact({
      threadId,
      kind: "audio_chart",
      approved: true,
      data: {
        voiceover: null,
        soundDesign: { enabled: false, musicBed: null, sfx: [] },
        warnings: [],
      },
    })
    const generated = await executeTool("generate_remotion_config", {
      config: {
        id: "agent-pi-tools-test",
        title: "Agent Pi tools test",
        scenes: [{ type: "intro", title: "Hola", durationInSeconds: 3 }],
      },
    })

    await executeTool("publish_approved_artifacts", {
      slug: "agent-pi-tools-test",
      configArtifactId: (generated.details.artifact as { id: string }).id,
    })

    assert.equal(existsSync(join(AGENT_PI_TEST_FIXTURE_DIRECTORY, "script.json")), true)
    assert.equal(existsSync(join(AGENT_PI_TEST_FIXTURE_DIRECTORY, "script.md")), true)
    assert.equal(existsSync(join(AGENT_PI_TEST_FIXTURE_DIRECTORY, "direction.json")), true)
    assert.equal(existsSync(join(AGENT_PI_TEST_FIXTURE_DIRECTORY, "audio-chart.json")), true)
    assert.equal(existsSync(join(AGENT_PI_TEST_FIXTURE_DIRECTORY, "config.json")), true)
  })

  it("calls render-service validation and render endpoints", async () => {
    await startMockRenderService()
    const config = {
      id: "compact-demo",
      title: "Compact demo",
      description: "Demo",
      fps: 30,
      width: 1280,
      height: 720,
      theme: "betelgeuse",
      scenes: [{ type: "intro", title: "Hola", durationInSeconds: 3 }],
    }

    const validation = await executeTool("validate_video_config", { config })
    assert.equal(validation.details.valid, true)

    await executeTool("generate_remotion_config", {
      config: { title: "Latest config", scenes: [{ type: "intro", title: "Hola", durationInSeconds: 4 }] },
    })
    const latestValidation = await executeTool("validate_video_config", {})
    assert.equal(latestValidation.details.valid, true)

    const render = await executeTool("submit_render", { config })
    assert.equal((render.details.job as { id: string }).id, "job-123")

    const status = await executeTool("check_render_status", { jobId: "job-123" })
    assert.equal((status.details.job as { status: string }).status, "done")
    assert.equal(store.listEvents(threadId).at(-1)?.type, "render_status")

    const review = await executeTool("review_completed_render", {})
    assert.equal((review.details.report as { passed: boolean }).passed, true)
    const reviewArtifact = review.details.artifact as { id: string; kind: string }
    assert.equal(reviewArtifact.kind, "render_review")
    await executeTool("present_final_review_checkpoint", { artifactId: reviewArtifact.id })
    assert.equal(store.getThread(threadId)?.checkpoint?.type, "final_review_checkpoint")
  })
})
