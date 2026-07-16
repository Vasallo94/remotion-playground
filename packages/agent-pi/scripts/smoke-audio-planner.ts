import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { AudioPlannerRunner } from "../src/audioPlanner.js"
import { ThreadEventBus } from "../src/events.js"
import { ModelRouter } from "../src/modelRouter.js"
import { AgentPiStore } from "../src/store.js"

const dir = mkdtempSync(join(tmpdir(), "claqueta-audio-planner-smoke-"))
const store = new AgentPiStore(join(dir, "smoke.db"))

try {
  const threadId = store.createThread({ title: "Audio planner specialist smoke test" }).id
  const eventBus = new ThreadEventBus(store)
  const modelRouter = new ModelRouter()
  const runner = new AudioPlannerRunner({
    threadId,
    eventBus,
    modelRouter,
    authStorage: modelRouter.authStorage,
    modelRegistry: modelRouter.modelRegistry,
  })
  const result = await runner.run(
    {
      title: "Una carta que llega veinte años tarde",
      objective: "Contar una microhistoria íntima sobre memoria y segundas oportunidades",
      audience: "Público general adulto",
      tone: "Íntimo y esperanzador",
      scenes: [
        {
          id: "arrival",
          type: "callout",
          title: "La carta llega",
          voiceover: "La carta llevaba veinte años esperando llegar.",
          visualNotes: "Un sobre y una fecha antigua ocupan el centro",
          narrativeRole: "hook",
          visualType: "builtin",
          visualRole: "crear intriga",
          propsPlan: { text: "Veinte años después" },
          visualRationale: "Una frase breve abre la historia",
          requiredAssets: [],
          missingCapabilities: [],
          riskNotes: [],
          durationInSeconds: 7,
        },
        {
          id: "reply",
          type: "outro",
          title: "Todavía puede responder",
          voiceover: "El tiempo había cambiado la respuesta, pero no la necesidad de escribirla.",
          visualNotes: "Una hoja en blanco cierra la historia",
          narrativeRole: "resolution",
          visualType: "builtin",
          visualRole: "cerrar con esperanza",
          propsPlan: { title: "Todavía puede responder" },
          visualRationale: "Una conclusión limpia deja espacio emocional",
          requiredAssets: [],
          missingCapabilities: [],
          riskNotes: [],
          durationInSeconds: 8,
        },
      ],
    },
    {
      scenes: [
        {
          sceneId: "arrival",
          sceneType: "callout",
          technicalIntent: "Abrir con intimidad",
          visualContract: "Texto breve y sobre",
          timing: { tailHoldMs: 400 },
          beats: [],
          assets: [],
          risks: [],
        },
        {
          sceneId: "reply",
          sceneType: "outro",
          technicalIntent: "Cerrar sin prisa",
          visualContract: "Conclusión y hoja en blanco",
          timing: { tailHoldMs: 700 },
          beats: [],
          assets: [],
          risks: [],
        },
      ],
      warnings: [],
    },
    {
      language: "es-ES",
      voiceover: "optional",
      soundDesign: "optional",
      notes: ["No usar SFX", "La música solo si una pista local encaja con el tono íntimo"],
    },
  )

  console.log(
    JSON.stringify(
      {
        modelRoute: result.modelRoute,
        voiceMode: result.chart.voiceover?.speakers ? "dialogue" : (result.chart.voiceover?.voiceId ?? "silent"),
        narratedScenes: Object.keys(result.chart.voiceover?.scenes ?? {}).length,
        musicBed: result.chart.soundDesign.musicBed?.libraryId ?? null,
        warningCount: result.chart.warnings.length,
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
