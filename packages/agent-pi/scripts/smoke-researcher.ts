import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ThreadEventBus } from "../src/events.js"
import { ModelRouter } from "../src/modelRouter.js"
import { ResearchSpecialistRunner } from "../src/researcher.js"
import { AgentPiStore } from "../src/store.js"
import { createClaquetaTools } from "../src/tools.js"

const dir = mkdtempSync(join(tmpdir(), "claqueta-researcher-smoke-"))
const store = new AgentPiStore(join(dir, "smoke.db"))

try {
  const threadId = store.createThread({ title: "Research specialist smoke test" }).id
  const eventBus = new ThreadEventBus(store)
  const modelRouter = new ModelRouter()
  const runner = new ResearchSpecialistRunner({
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
    runResearchSpecialist: (input, signal) => runner.run(input, signal),
  })
  const execute = async (name: string, params: Record<string, unknown>) => {
    const tool = tools.find((candidate) => candidate.name === name)
    if (!tool) throw new Error(`Missing tool: ${name}`)
    return tool.execute(`smoke-${name}`, params as never, undefined, undefined, undefined as never)
  }

  await execute("create_pipeline_plan", { mode: "new_video", goal: "Create a factual bird-migration video" })
  const result = await execute("run_research_specialist", {
    request: "Prepara evidencia para explicar qué es la migración de las aves y por qué ocurre.",
    subject: "Migración de las aves",
    objective: "Obtener dos o tres afirmaciones introductorias verificables para público general",
    language: "es-ES",
    sourceUrls: ["https://en.wikipedia.org/api/rest_v1/page/summary/Bird_migration"],
    constraints: ["No añadir cifras que no aparezcan en la fuente", "Separar hechos verificados de incógnitas"],
  })
  const research = result.details.research as { claims: unknown[]; sourceUrls: string[]; unknowns: string[] }
  console.log(
    JSON.stringify(
      {
        modelRoute: result.details.modelRoute,
        claimCount: research.claims.length,
        sourceCount: research.sourceUrls.length,
        unknownCount: research.unknowns.length,
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
