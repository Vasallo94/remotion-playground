import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ThreadEventBus } from "../src/events.js"
import { ModelRouter } from "../src/modelRouter.js"
import { CopywriterSpecialistRunner } from "../src/specialists.js"
import { AgentPiStore } from "../src/store.js"
import { createClaquetaTools } from "../src/tools.js"

const dir = mkdtempSync(join(tmpdir(), "claqueta-copywriter-smoke-"))
const store = new AgentPiStore(join(dir, "smoke.db"))

try {
  const threadId = store.createThread({ title: "Copywriter specialist smoke test" }).id
  const eventBus = new ThreadEventBus(store)
  const modelRouter = new ModelRouter()
  const runner = new CopywriterSpecialistRunner({
    threadId,
    eventBus,
    modelRouter,
    authStorage: modelRouter.authStorage,
    modelRegistry: modelRouter.modelRegistry,
  })
  const tools = createClaquetaTools({
    threadId,
    store,
    eventBus,
    renderServiceUrl: "http://127.0.0.1:3100",
    runCopywriterSpecialist: (request, brief, revision, signal) => runner.run(request, brief, revision, signal),
  })
  const execute = async (name: string, params: Record<string, unknown>) => {
    const tool = tools.find((candidate) => candidate.name === name)
    if (!tool) throw new Error(`Missing tool: ${name}`)
    return tool.execute(`smoke-${name}`, params as never, undefined, undefined, undefined as never)
  }

  await execute("create_pipeline_plan", { mode: "new_video", goal: "Create a short fictional visual story" })
  const result = await execute("run_copywriter_specialist", {
    request: "Crea una microhistoria visual de una carta que llega veinte años tarde.",
    brief: {
      subject: "Una carta entregada veinte años tarde",
      goal: "Contar una historia breve sobre memoria y segundas oportunidades",
      audience: "Público general adulto",
      format: "microhistoria visual",
      tone: "Íntimo y esperanzador",
      language: "es-ES",
      targetDurationSeconds: 30,
      evidence: [
        "La historia es ficticia.",
        "La carta fue escrita por una amiga que se marchó de la ciudad.",
        "El destinatario decide responder aunque hayan pasado veinte años.",
      ],
      constraints: ["No usar terminales ni código", "No añadir hechos históricos o datos externos"],
    },
  })
  const script = result.details.script as { scenes: Array<{ type: string; componentId?: string }> }
  console.log(
    JSON.stringify(
      {
        modelRoute: result.details.modelRoute,
        sceneCount: script.scenes.length,
        visuals: script.scenes.map((scene) => scene.componentId ?? scene.type),
        eventTypes: store.listEvents(threadId).map((event) => event.type),
      },
      null,
      2,
    ),
  )
} finally {
  store.close()
  rmSync(dir, { recursive: true, force: true })
}
