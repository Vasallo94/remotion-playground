import { describe, it, afterEach, beforeEach } from "node:test"
import assert from "node:assert/strict"
import { createServer, type Server } from "node:http"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { AgentPiStore } from "../src/store.js"
import { ThreadEventBus } from "../src/events.js"
import { createClaquetaTools } from "../src/tools.js"
import { PROJECT_ROOT } from "../src/paths.js"

let store: AgentPiStore
let eventBus: ThreadEventBus
let threadId: string
let dbPath: string
let server: Server | undefined
let renderServiceUrl = "http://127.0.0.1:3100"

beforeEach(() => {
  dbPath = join(mkdtempSync(join(tmpdir(), "agent-pi-tools-")), "test.db")
  store = new AgentPiStore(dbPath)
  eventBus = new ThreadEventBus(store)
  threadId = store.createThread().id
})

afterEach(() => {
  server?.close()
  server = undefined
  store.close()
  rmSync(join(dbPath, ".."), { recursive: true, force: true })
  rmSync(join(PROJECT_ROOT, "content/tutorials/agent-pi-tools-test"), { recursive: true, force: true })
})

function toolByName(name: string) {
  const tool = createClaquetaTools({ threadId, store, eventBus, renderServiceUrl }).find((tool) => tool.name === name)
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
    })
    assert.equal(created.details.planPath, "/pipeline/plan.json")
    assert.equal(store.listEvents(threadId).at(-1)?.type, "plan_updated")

    const read = await executeTool("read_pipeline_plan", {})
    assert.equal(read.details.exists, true)
    assert.equal((read.details.plan as { steps: Array<{ id: string; status: string }> }).steps[0].id, "research")

    const updated = await executeTool("update_pipeline_step", {
      stepId: "research",
      status: "in_progress",
      summary: "Collecting references",
    })
    assert.equal((updated.details.step as { status: string }).status, "in_progress")

    const next = await executeTool("get_next_pipeline_step", {})
    assert.equal(next.details.status, "in_progress")

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

    const result = await executeTool("present_script_checkpoint", { artifactId: scriptArtifact.id })
    assert.equal(result.terminate, true)
    assert.equal(store.getThread(threadId)?.status, "waiting")
    assert.equal(store.listEvents(threadId).at(-1)?.type, "checkpoint")
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

    assert.equal(existsSync(join(PROJECT_ROOT, "content/tutorials/agent-pi-tools-test/script.json")), true)
    assert.equal(existsSync(join(PROJECT_ROOT, "content/tutorials/agent-pi-tools-test/script.md")), true)
    assert.equal(existsSync(join(PROJECT_ROOT, "content/tutorials/agent-pi-tools-test/direction.json")), true)
    assert.equal(existsSync(join(PROJECT_ROOT, "content/tutorials/agent-pi-tools-test/config.json")), true)
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
  })
})
