import assert from "node:assert/strict"
import { join } from "node:path"
import { afterEach, describe, it } from "node:test"
import { ThreadEventBus } from "../src/events.js"
import { ModelRouter } from "../src/modelRouter.js"
import { SceneComposerRunner, validateSceneComposition, type SceneComposerSession } from "../src/sceneComposer.js"
import { AgentPiStore } from "../src/store.js"
import { cleanupTestDirectory, createTestTemporaryDirectory } from "../src/testCleanup.js"
import type { SceneCompositionResult, ScriptDraft } from "../src/types.js"

const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach(cleanupTestDirectory))

const composed: SceneCompositionResult = {
  summary: "Resolved with bounded semantic primitives",
  resolutions: [
    {
      sceneId: "result",
      outcome: "composed",
      rationale: "A metric and explanation need no executable component",
      spec: {
        version: 1,
        root: {
          type: "group",
          direction: "grid",
          children: [
            { type: "metric", value: "42", label: "Result" },
            { type: "card", title: "Meaning", body: "Approved explanation" },
          ],
        },
      },
    },
  ],
}

const script: ScriptDraft = {
  title: "Neutral result",
  objective: "Explain one measured outcome",
  scenes: [
    {
      id: "result",
      type: "callout",
      narrativeRole: "proof",
      visualType: "builtin",
      visualRole: "show result and meaning",
      propsPlan: { text: "42" },
      visualRationale: "Temporary truthful fallback",
      requiredAssets: [],
      missingCapabilities: ["Combine a metric with explanatory structure"],
      riskNotes: [],
      durationInSeconds: 5,
    },
  ],
}

describe("SceneComposerRunner", () => {
  it("validates declarative output and rejects executable-shaped fields", () => {
    assert.deepEqual(validateSceneComposition(composed, ["result"], new Set(["metric"])), composed)
    const unsafe = structuredClone(composed)
    if (unsafe.resolutions[0]?.outcome === "composed") {
      unsafe.resolutions[0].spec = { version: 1, root: { type: "text", text: "x", style: { position: "fixed" } } }
    }
    assert.throws(() => validateSceneComposition(unsafe, ["result"], new Set()), /invalid composed spec/)
  })

  it("does not expose visual-program as a model-authored reuse component before recipe projection", () => {
    const reuse: SceneCompositionResult = {
      summary: "unsafe reuse",
      resolutions: [
        {
          sceneId: "result",
          outcome: "reuse",
          rationale: "reuse",
          componentId: "visual-program",
          propsPlan: { compiled: {} },
        },
      ],
    }
    assert.throws(() => validateSceneComposition(reuse, ["result"], new Set(["visual-program"])), /reserved component/)
  })

  it("uses a fresh terminating-only session and disposes it", async () => {
    const dir = createTestTemporaryDirectory("claqueta-scene-composer-")
    dirs.push(dir)
    const store = new AgentPiStore(join(dir, "composer.db"))
    const threadId = store.createThread().id
    const router = new ModelRouter({ routes: { scene_creation: { provider: "openai-codex", model: "composer-test" } } })
    let disposed = false
    const session: SceneComposerSession = {
      subscribe() {
        return () => undefined
      },
      async prompt() {},
      async abort() {},
      dispose() {
        disposed = true
      },
    }
    const runner = new SceneComposerRunner({
      threadId,
      eventBus: new ThreadEventBus(store),
      modelRouter: router,
      authStorage: router.authStorage,
      modelRegistry: router.modelRegistry,
      createSession: async (capture) => {
        capture(composed)
        return session
      },
    })
    const result = await runner.run({ script, targetSceneIds: ["result"], catalog: {}, registeredComponentIds: [] })
    assert.equal(result.modelRoute, "openai-codex/composer-test")
    assert.equal(result.result.resolutions[0]?.outcome, "composed")
    assert.equal(disposed, true)
    store.close()
  })
})
