import assert from "node:assert/strict"
import { join } from "node:path"
import { afterEach, beforeEach, describe, it } from "node:test"
import {
  AudioPlannerRunner,
  listAudioLibrary,
  validateAudioChart,
  type AudioPlannerSession,
} from "../src/audioPlanner.js"
import { ThreadEventBus } from "../src/events.js"
import { ModelRouter } from "../src/modelRouter.js"
import { AgentPiStore } from "../src/store.js"
import { cleanupTestDirectory, createTestTemporaryDirectory } from "../src/testCleanup.js"
import type { AudioChart, DirectionDraft, ScriptDraft } from "../src/types.js"

let dir: string
let store: AgentPiStore
let eventBus: ThreadEventBus
let threadId: string

const script: ScriptDraft = {
  title: "Una carta tardía",
  objective: "Contar una historia íntima",
  scenes: [
    {
      id: "scene-1",
      type: "callout",
      title: "La carta llega",
      visualNotes: "Un mensaje breve",
      narrativeRole: "hook",
      visualType: "builtin",
      visualRole: "centrar la atención",
      propsPlan: { text: "Veinte años después" },
      visualRationale: "Una frase abre la historia",
      requiredAssets: [],
      missingCapabilities: [],
      riskNotes: [],
      durationInSeconds: 6,
    },
  ],
}
const direction: DirectionDraft = {
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
}
const silentChart: AudioChart = {
  voiceover: null,
  soundDesign: { enabled: false, musicBed: null, sfx: [] },
  warnings: ["Silence is deliberate"],
}

beforeEach(() => {
  dir = createTestTemporaryDirectory("agent-pi-audio-planner-")
  store = new AgentPiStore(join(dir, "test.db"))
  eventBus = new ThreadEventBus(store)
  threadId = store.createThread().id
})

afterEach(() => {
  store.close()
  cleanupTestDirectory(dir)
})

function fakeSession(onPrompt: () => void, state: { disposed: boolean }): AudioPlannerSession {
  return {
    subscribe() {
      return () => undefined
    },
    async prompt() {
      onPrompt()
    },
    async abort() {},
    dispose() {
      state.disposed = true
    },
  }
}

describe("audio chart validation", () => {
  it("accepts deliberate silence and valid single-speaker plans", () => {
    assert.deepEqual(validateAudioChart(silentChart, 1, listAudioLibrary()), silentChart)
    const spoken: AudioChart = {
      voiceover: {
        enabled: true,
        provider: "gemini",
        language: "es-ES",
        voiceId: "Leda",
        scenes: { "0": "La voz complementa la frase visible." },
      },
      soundDesign: { enabled: false, musicBed: null, sfx: [] },
      warnings: [],
    }
    assert.deepEqual(validateAudioChart(spoken, 1, listAudioLibrary()), spoken)

    const dialogue: AudioChart = {
      voiceover: {
        enabled: true,
        provider: "gemini",
        language: "es-ES",
        speakers: [
          { name: "Ana", voiceId: "Leda" },
          { name: "Luis", voiceId: "Orus" },
        ],
        scenes: { "0": "Ana: La carta llegó.\nLuis: Todavía podemos responder." },
      },
      soundDesign: { enabled: false, musicBed: null, sfx: [] },
      warnings: [],
    }
    assert.deepEqual(validateAudioChart(dialogue, 1, listAudioLibrary()), dialogue)
  })

  it("rejects invalid voices, scene keys, dialogue, and music ids", () => {
    assert.throws(
      () =>
        validateAudioChart(
          {
            voiceover: {
              enabled: true,
              provider: "gemini",
              language: "es-ES",
              voiceId: "InventedVoice",
              scenes: { "0": "Texto" },
            },
            soundDesign: { enabled: false, musicBed: null, sfx: [] },
            warnings: [],
          },
          1,
          [],
        ),
      /Unknown Gemini voiceId/,
    )
    assert.throws(
      () =>
        validateAudioChart(
          {
            voiceover: {
              enabled: true,
              provider: "gemini",
              language: "es-ES",
              voiceId: "Leda",
              scenes: { "2": "Fuera de rango" },
            },
            soundDesign: { enabled: false, musicBed: null, sfx: [] },
            warnings: [],
          },
          1,
          [],
        ),
      /does not map/,
    )
    assert.throws(
      () =>
        validateAudioChart(
          {
            voiceover: null,
            soundDesign: {
              enabled: true,
              musicBed: {
                libraryId: "invented-track",
                volume: -18,
                duckingVolume: -26,
                fadeInMs: 500,
                fadeOutMs: 500,
                duckingFadeMs: 300,
              },
              sfx: [],
            },
            warnings: [],
          },
          1,
          [],
        ),
      /Unknown music libraryId/,
    )
  })
})

describe("AudioPlannerRunner", () => {
  it("repairs a chart rejected by parent validation once", async () => {
    const state = { disposed: false }
    let prompts = 0
    const modelRouter = new ModelRouter({ routes: {} })
    const corrected: AudioChart = {
      voiceover: {
        enabled: true,
        provider: "gemini",
        language: "es-ES",
        voiceId: "Leda",
        scenes: { "0": "La voz complementa la escena." },
      },
      soundDesign: { enabled: false, musicBed: null, sfx: [] },
      warnings: [],
    }
    const runner = new AudioPlannerRunner({
      threadId,
      eventBus,
      modelRouter,
      authStorage: modelRouter.authStorage,
      modelRegistry: modelRouter.modelRegistry,
      createSession: async ({ captureChart }) =>
        fakeSession(() => {
          prompts += 1
          captureChart(
            prompts === 1
              ? {
                  ...corrected,
                  voiceover: { ...corrected.voiceover!, scenes: { "scene-1": "Invalid key" } },
                }
              : corrected,
          )
        }, state),
    })

    const result = await runner.run(script, direction)
    assert.deepEqual(result.chart, corrected)
    assert.equal(prompts, 2)
    assert.equal(state.disposed, true)
  })

  it("returns a validated chart and disposes its session", async () => {
    const state = { disposed: false }
    const modelRouter = new ModelRouter({
      routes: { audio_plan: { provider: "openai-codex", model: "audio-test", thinkingLevel: "medium" } },
    })
    const runner = new AudioPlannerRunner({
      threadId,
      eventBus,
      modelRouter,
      authStorage: modelRouter.authStorage,
      modelRegistry: modelRouter.modelRegistry,
      createSession: async ({ captureChart }) => fakeSession(() => captureChart(silentChart), state),
    })

    const result = await runner.run(script, direction, { voiceover: "none", soundDesign: "none" })

    assert.deepEqual(result.chart, silentChart)
    assert.equal(result.modelRoute, "openai-codex/audio-test")
    assert.equal(state.disposed, true)
    assert.deepEqual(
      store.listEvents(threadId).map((event) => event.type),
      ["subagent_start", "subagent_end"],
    )
  })
})
