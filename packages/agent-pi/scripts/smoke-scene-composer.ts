import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ThreadEventBus } from "../src/events.js"
import { ModelRouter } from "../src/modelRouter.js"
import { SceneComposerRunner } from "../src/sceneComposer.js"
import { AgentPiStore } from "../src/store.js"

const dir = mkdtempSync(join(tmpdir(), "claqueta-scene-composer-smoke-"))
const store = new AgentPiStore(join(dir, "smoke.db"))

try {
  const threadId = store.createThread({ title: "Declarative scene composer smoke" }).id
  const eventBus = new ThreadEventBus(store)
  const modelRouter = new ModelRouter()
  const runner = new SceneComposerRunner({
    threadId,
    eventBus,
    modelRouter,
    authStorage: modelRouter.authStorage,
    modelRegistry: modelRouter.modelRegistry,
  })
  const result = await runner.run({
    script: {
      title: "El jardín que redujo su consumo de agua",
      objective: "Explicar un resultado medido y su causa sin inventar datos adicionales",
      audience: "Personas interesadas en jardinería doméstica",
      tone: "Claro y sereno",
      scenes: [
        {
          id: "measured-result",
          type: "callout",
          title: "El resultado medido",
          voiceover:
            "El consumo semanal bajó de ciento veinte a setenta y dos litros después de reagrupar las plantas por necesidad de riego.",
          visualNotes: "Contrastar las dos mediciones y explicar la intervención en la misma escena",
          narrativeRole: "proof",
          visualType: "builtin",
          visualRole: "mostrar la magnitud del cambio y su explicación",
          propsPlan: { text: "120 L → 72 L" },
          visualRationale: "Callout is a truthful fallback but cannot show measurement plus explanation clearly",
          requiredAssets: [],
          missingCapabilities: [
            "Combine before/after measurements with a concise explanatory card in one bounded layout",
          ],
          riskNotes: ["Do not infer a percentage reduction"],
          durationInSeconds: 7,
        },
      ],
    },
    targetSceneIds: ["measured-result"],
    catalog: {
      custom: [
        { componentId: "before-after", description: "Side-by-side comparison" },
        { componentId: "big-number", description: "Single metric" },
        { componentId: "comparison-table", description: "Two-column comparison" },
      ],
    },
    registeredComponentIds: ["before-after", "big-number", "comparison-table"],
  })

  console.log(
    JSON.stringify(
      {
        modelRoute: result.modelRoute,
        outcome: result.result.resolutions[0]?.outcome,
        summary: result.result.summary,
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
