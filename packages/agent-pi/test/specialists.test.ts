import assert from "node:assert/strict"
import { join } from "node:path"
import { afterEach, beforeEach, describe, it } from "node:test"
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent"
import { ThreadEventBus } from "../src/events.js"
import { ModelRouter } from "../src/modelRouter.js"
import {
  CopywriterSpecialistRunner,
  DirectionSpecialistRunner,
  type DirectionSpecialistSession,
} from "../src/specialists.js"
import { AgentPiStore } from "../src/store.js"
import { cleanupTestDirectory, createTestTemporaryDirectory } from "../src/testCleanup.js"
import type { DirectionDraft, ScriptDraft } from "../src/types.js"

let dbDir: string
let store: AgentPiStore
let eventBus: ThreadEventBus
let threadId: string

const script: ScriptDraft = {
  title: "Una historia sobre cualquier tema",
  objective: "Explicar una idea con claridad",
  scenes: [
    {
      id: "scene-1",
      type: "callout",
      title: "Idea central",
      narrativeRole: "explanation",
      visualType: "builtin",
      visualRole: "presentar una afirmación",
      propsPlan: { text: "Una idea concreta" },
      durationInSeconds: 5,
    },
  ],
}

const direction: DirectionDraft = {
  title: "Dirección editorial",
  scenes: [
    {
      sceneId: "scene-1",
      sceneType: "callout",
      title: "Idea central",
      technicalIntent: "Mantener una única afirmación legible",
      visualContract: "Texto central sin estructuras visuales no soportadas",
      timing: { tailHoldMs: 350, transitionMs: 250 },
      beats: [],
      assets: [],
      risks: [],
    },
  ],
  warnings: [],
  risks: [],
}

beforeEach(() => {
  dbDir = createTestTemporaryDirectory("agent-pi-specialist-")
  store = new AgentPiStore(join(dbDir, "test.db"))
  eventBus = new ThreadEventBus(store)
  threadId = store.createThread().id
})

afterEach(() => {
  store.close()
  cleanupTestDirectory(dbDir)
})

function createFakeSession(
  onPrompt: (listener: ((event: AgentSessionEvent) => void) | undefined, text: string) => Promise<void> | void,
  state: { disposed: boolean; aborted: boolean },
): DirectionSpecialistSession {
  let listener: ((event: AgentSessionEvent) => void) | undefined
  return {
    subscribe(nextListener) {
      listener = nextListener
      return () => {
        listener = undefined
      }
    },
    async prompt(text) {
      await onPrompt(listener, text)
    },
    async abort() {
      state.aborted = true
    },
    dispose() {
      state.disposed = true
    },
  }
}

describe("CopywriterSpecialistRunner", () => {
  it("returns a topic-neutral structured script and includes revision context", async () => {
    const state = { disposed: false, aborted: false }
    const prompts: string[] = []
    const modelRouter = new ModelRouter({
      routes: { narrative: { provider: "openai-codex", model: "copywriter-test", thinkingLevel: "medium" } },
    })
    const revisedScript: ScriptDraft = {
      title: "La madera y la humedad",
      objective: "Explicar un comportamiento material",
      scenes: [
        {
          id: "scene-1",
          type: "callout",
          title: "Intercambio de humedad",
          visualNotes: "Una afirmación visible y concreta",
          narrativeRole: "explanation",
          visualType: "builtin",
          visualRole: "destacar la idea principal",
          propsPlan: { text: "La madera intercambia humedad con el aire" },
          visualRationale: "La escena solo necesita una afirmación legible",
          requiredAssets: [],
          missingCapabilities: [],
          riskNotes: [],
          durationInSeconds: 6,
        },
      ],
    }
    const runner = new CopywriterSpecialistRunner({
      threadId,
      eventBus,
      modelRouter,
      authStorage: modelRouter.authStorage,
      modelRegistry: modelRouter.modelRegistry,
      createSession: async ({ captureScript }) =>
        createFakeSession((_listener, text) => {
          prompts.push(text)
          captureScript(revisedScript)
        }, state),
    })

    const result = await runner.run(
      "Explica por qué se mueve la madera",
      { subject: "Movimiento de la madera", goal: "Enseñar el efecto de la humedad" },
      { feedback: "Haz visible el intercambio de humedad", previousScript: revisedScript },
    )

    assert.deepEqual(result.script, revisedScript)
    assert.equal(result.modelRoute, "openai-codex/copywriter-test")
    assert.match(prompts[0], /Human feedback/)
    assert.match(prompts[0], /Previous script/)
    assert.equal(state.disposed, true)
    assert.deepEqual(
      store.listEvents(threadId).map((event) => event.type),
      ["subagent_start", "subagent_end"],
    )
  })

  it("fails explicitly and disposes when structured script output is omitted", async () => {
    const state = { disposed: false, aborted: false }
    const modelRouter = new ModelRouter({ routes: {} })
    const runner = new CopywriterSpecialistRunner({
      threadId,
      eventBus,
      modelRouter,
      authStorage: modelRouter.authStorage,
      modelRegistry: modelRouter.modelRegistry,
      createSession: async () => createFakeSession(() => undefined, state),
    })

    await assert.rejects(
      () =>
        runner.run("Create a video", {
          subject: "An arbitrary subject",
          goal: "Explain one idea",
        }),
      /without calling submit_script after one repair attempt/,
    )
    assert.equal(state.disposed, true)
    assert.equal(store.listEvents(threadId).at(-1)?.type, "subagent_error")
  })
})

describe("DirectionSpecialistRunner", () => {
  it("captures structured direction and emits replayable lifecycle events", async () => {
    const state = { disposed: false, aborted: false }
    const modelRouter = new ModelRouter({
      routes: { direction: { provider: "anthropic", model: "director-test", thinkingLevel: "medium" } },
    })
    const runner = new DirectionSpecialistRunner({
      threadId,
      eventBus,
      modelRouter,
      authStorage: modelRouter.authStorage,
      modelRegistry: modelRouter.modelRegistry,
      createSession: async ({ captureDirection }) =>
        createFakeSession((listener) => {
          listener?.({
            type: "tool_execution_start",
            toolCallId: "submit-1",
            toolName: "submit_direction",
            args: {},
          } as AgentSessionEvent)
          captureDirection(direction)
          listener?.({
            type: "tool_execution_end",
            toolCallId: "submit-1",
            toolName: "submit_direction",
            result: { content: [], details: {} },
            isError: false,
          } as AgentSessionEvent)
        }, state),
    })

    const result = await runner.run(script)

    assert.deepEqual(result.direction, direction)
    assert.equal(result.modelRoute, "anthropic/director-test")
    assert.equal(state.disposed, true)
    assert.deepEqual(
      store.listEvents(threadId).map((event) => event.type),
      ["subagent_start", "subagent_update", "subagent_update", "subagent_end"],
    )
  })

  it("rejects a specialist that changes the approved scene contract", async () => {
    const state = { disposed: false, aborted: false }
    const modelRouter = new ModelRouter({ routes: {} })
    const runner = new DirectionSpecialistRunner({
      threadId,
      eventBus,
      modelRouter,
      authStorage: modelRouter.authStorage,
      modelRegistry: modelRouter.modelRegistry,
      createSession: async ({ captureDirection }) =>
        createFakeSession(() => {
          captureDirection({
            ...direction,
            scenes: [{ ...(direction.scenes[0] as Record<string, unknown>), sceneType: "terminal" }],
          })
        }, state),
    })

    await assert.rejects(() => runner.run(script), /changed scene type/)
    assert.equal(state.disposed, true)
    assert.equal(store.listEvents(threadId).at(-1)?.type, "subagent_error")
  })

  it("propagates abort and disposes the child session", async () => {
    const state = { disposed: false, aborted: false }
    const controller = new AbortController()
    const modelRouter = new ModelRouter({ routes: {} })
    const runner = new DirectionSpecialistRunner({
      threadId,
      eventBus,
      modelRouter,
      authStorage: modelRouter.authStorage,
      modelRegistry: modelRouter.modelRegistry,
      createSession: async () =>
        createFakeSession(() => {
          controller.abort()
          throw new Error("Director specialist aborted")
        }, state),
    })

    await assert.rejects(() => runner.run(script, {}, controller.signal), /aborted/)
    assert.equal(state.aborted, true)
    assert.equal(state.disposed, true)
    assert.equal(store.listEvents(threadId).at(-1)?.type, "subagent_error")
  })

  it("fails explicitly and disposes when the specialist omits structured output", async () => {
    const state = { disposed: false, aborted: false }
    const modelRouter = new ModelRouter({ routes: {} })
    const runner = new DirectionSpecialistRunner({
      threadId,
      eventBus,
      modelRouter,
      authStorage: modelRouter.authStorage,
      modelRegistry: modelRouter.modelRegistry,
      createSession: async () => createFakeSession(() => undefined, state),
    })

    await assert.rejects(() => runner.run(script), /without calling submit_direction/)
    assert.equal(state.disposed, true)
    assert.deepEqual(
      store.listEvents(threadId).map((event) => event.type),
      ["subagent_start", "subagent_error"],
    )
  })
})
