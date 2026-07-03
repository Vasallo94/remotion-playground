import { describe, it, afterEach, beforeEach } from "node:test"
import assert from "node:assert/strict"
import { createServer, type Server } from "node:http"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { AgentPiStore } from "../src/store.js"
import { ThreadEventBus } from "../src/events.js"
import { createClaquetaTools } from "../src/tools.js"

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

  it("generates config with ClaudeCodeTutorial defaults", async () => {
    const result = await executeTool("generate_remotion_config", {
      config: { title: "Compact demo", scenes: [{ type: "intro", title: "Hola", durationInSeconds: 3 }] },
    })
    const config = result.details.config as Record<string, unknown>
    assert.equal(config.composition, "ClaudeCodeTutorial")
    assert.equal(config.theme, "linea-directa")
    assert.equal(config.fps, 30)
    assert.equal(
      store.listArtifacts(threadId).some((artifact) => artifact.kind === "config"),
      true,
    )
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
      theme: "linea-directa",
      scenes: [{ type: "intro", title: "Hola", durationInSeconds: 3 }],
    }

    const validation = await executeTool("validate_video_config", { config })
    assert.equal(validation.details.valid, true)

    const render = await executeTool("submit_render", { config })
    assert.equal(render.details.jobId, "job-123")

    const status = await executeTool("check_render_status", { jobId: "job-123" })
    assert.equal((status.details.job as { status: string }).status, "done")
    assert.equal(store.listEvents(threadId).at(-1)?.type, "render_status")
  })
})
