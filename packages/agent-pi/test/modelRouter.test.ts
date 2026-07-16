import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { isSafeDefaultModel, loadModelRoutingConfigFromEnv, parseModelRoute } from "../src/modelRouter.js"

describe("model routing", () => {
  it("parses provider/model with thinking suffix", () => {
    assert.deepEqual(parseModelRoute("anthropic/claude-sonnet-4-5:high"), {
      provider: "anthropic",
      model: "claude-sonnet-4-5",
      thinkingLevel: "high",
    })
  })

  it("loads task routes from env", () => {
    const config = loadModelRoutingConfigFromEnv({
      CLAQUETA_PI_MODEL: "anthropic/claude-sonnet-4-5",
      CLAQUETA_PI_MODEL_RESEARCH: "openai-codex/gpt-5.4-mini:medium",
      CLAQUETA_PI_MODEL_DIRECTION: "openai/gpt-5.1:low",
      CLAQUETA_PI_MODEL_AUDIO_PLAN: "openai-codex/gpt-5.4-mini:medium",
      CLAQUETA_PI_MODEL_SCENE_QA: "google/gemini-3.1-flash-preview:medium",
      CLAQUETA_PI_MODEL_SCENE_CREATION: "openai-codex/gpt-5.4:high",
    })
    assert.equal(config.routes.main?.provider, "anthropic")
    assert.equal(config.routes.research?.model, "gpt-5.4-mini")
    assert.equal(config.routes.direction?.provider, "openai")
    assert.equal(config.routes.direction?.thinkingLevel, "low")
    assert.equal(config.routes.audio_plan?.model, "gpt-5.4-mini")
    assert.equal(config.routes.scene_qa?.provider, "google")
    assert.equal(config.routes.scene_creation?.thinkingLevel, "high")
  })

  it("does not select account-limited Codex Spark as a server default", () => {
    assert.equal(isSafeDefaultModel({ provider: "openai-codex", id: "gpt-5.3-codex-spark" }), false)
    assert.equal(isSafeDefaultModel({ provider: "openai-codex", id: "gpt-5.4-mini" }), true)
    assert.equal(isSafeDefaultModel({ provider: "anthropic", id: "claude-sonnet" }), true)
  })

  it("rejects routes without provider/model format", () => {
    assert.throws(() => parseModelRoute("claude-sonnet"), /provider\/model/)
  })
})
