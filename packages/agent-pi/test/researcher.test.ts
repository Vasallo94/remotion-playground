import assert from "node:assert/strict"
import { join } from "node:path"
import { afterEach, beforeEach, describe, it } from "node:test"
import { ThreadEventBus } from "../src/events.js"
import { ModelRouter } from "../src/modelRouter.js"
import { ResearchCallBudget, ResearchSpecialistRunner, type ResearchSpecialistSession } from "../src/researcher.js"
import { AgentPiStore } from "../src/store.js"
import { cleanupTestDirectory, createTestTemporaryDirectory } from "../src/testCleanup.js"
import type { ResearchBrief } from "../src/types.js"

let dir: string
let store: AgentPiStore
let eventBus: ThreadEventBus
let threadId: string

const research: ResearchBrief = {
  topic: "Migración de las aves",
  objective: "Explicar una ruta migratoria concreta",
  summary: "Las rutas dependen de especie, estación y geografía.",
  keyConcepts: ["ruta migratoria", "estacionalidad"],
  claims: [
    {
      claim: "La fuente describe una ruta migratoria estacional.",
      sourceUrls: ["https://example.org/birds"],
      confidence: "high",
    },
  ],
  examples: ["Una ruta documentada por la fuente"],
  unknowns: [],
  sourceUrls: ["https://example.org/birds"],
}

beforeEach(() => {
  dir = createTestTemporaryDirectory("agent-pi-researcher-")
  store = new AgentPiStore(join(dir, "test.db"))
  eventBus = new ThreadEventBus(store)
  threadId = store.createThread().id
})

afterEach(() => {
  store.close()
  cleanupTestDirectory(dir)
})

function fakeSession(onPrompt: () => void, state: { disposed: boolean }): ResearchSpecialistSession {
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

describe("ResearchCallBudget", () => {
  it("caps combined web calls", () => {
    const budget = new ResearchCallBudget(2)
    budget.consume()
    budget.consume()
    assert.throws(() => budget.consume(), /limit exceeded/)
  })
})

describe("ResearchSpecialistRunner", () => {
  it("returns cited structured research and disposes its session", async () => {
    const state = { disposed: false }
    const modelRouter = new ModelRouter({
      routes: { research: { provider: "openai-codex", model: "research-test", thinkingLevel: "medium" } },
    })
    const runner = new ResearchSpecialistRunner({
      threadId,
      eventBus,
      modelRouter,
      authStorage: modelRouter.authStorage,
      modelRegistry: modelRouter.modelRegistry,
      createSession: async ({ captureResearch }) => fakeSession(() => captureResearch(research), state),
    })

    const result = await runner.run({
      request: "Explica una migración de aves",
      subject: "Migración de aves",
      objective: "Documentar una ruta",
      language: "es-ES",
    })

    assert.deepEqual(result.research, research)
    assert.equal(result.modelRoute, "openai-codex/research-test")
    assert.equal(state.disposed, true)
    assert.deepEqual(
      store.listEvents(threadId).map((event) => event.type),
      ["subagent_start", "subagent_end"],
    )
  })

  it("rejects uncited or non-HTTPS claims and disposes", async () => {
    const state = { disposed: false }
    const modelRouter = new ModelRouter({ routes: {} })
    const runner = new ResearchSpecialistRunner({
      threadId,
      eventBus,
      modelRouter,
      authStorage: modelRouter.authStorage,
      modelRegistry: modelRouter.modelRegistry,
      createSession: async ({ captureResearch }) =>
        fakeSession(() => captureResearch({ ...research, sourceUrls: ["http://example.org"], claims: [] }), state),
    })

    await assert.rejects(
      () => runner.run({ request: "Research", subject: "Any", objective: "Verify" }),
      /HTTPS source URLs/,
    )
    assert.equal(state.disposed, true)
    assert.equal(store.listEvents(threadId).at(-1)?.type, "subagent_error")
  })
})
