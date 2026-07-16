import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ThreadEventBus } from "../src/events.js"
import { ModelRouter } from "../src/modelRouter.js"
import { DirectionSpecialistRunner } from "../src/specialists.js"
import { AgentPiStore } from "../src/store.js"

const dir = mkdtempSync(join(tmpdir(), "claqueta-director-smoke-"))
const store = new AgentPiStore(join(dir, "smoke.db"))

try {
  const threadId = store.createThread({ title: "Director specialist smoke test" }).id
  const eventBus = new ThreadEventBus(store)
  const modelRouter = new ModelRouter()
  const runner = new DirectionSpecialistRunner({
    threadId,
    eventBus,
    modelRouter,
    authStorage: modelRouter.authStorage,
    modelRegistry: modelRouter.modelRegistry,
  })

  const result = await runner.run({
    title: "Por qué la madera se mueve",
    objective: "Explicar que la humedad cambia las dimensiones de la madera",
    audience: "Personas que empiezan en carpintería",
    tone: "Claro y práctico",
    scenes: [
      {
        id: "idea-central",
        type: "callout",
        title: "La madera intercambia humedad",
        voiceover: "La madera absorbe y libera humedad del ambiente.",
        narrativeRole: "explanation",
        visualType: "builtin",
        visualRole: "destacar una única idea",
        propsPlan: { text: "La madera intercambia humedad con el aire" },
        visualRationale: "Una afirmación central legible",
        requiredAssets: [],
        missingCapabilities: [],
        riskNotes: [],
        durationInSeconds: 6,
      },
    ],
  })

  console.log(
    JSON.stringify(
      {
        modelRoute: result.modelRoute,
        sceneCount: result.direction.scenes.length,
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
