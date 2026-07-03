import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { loadModelRoutingConfigFromEnv, parseModelRoute } from "../src/modelRouter.js"

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
      CLAQUETA_PI_MODEL_DIRECTION: "openai/gpt-5.1:low",
    })
    assert.equal(config.routes.main?.provider, "anthropic")
    assert.equal(config.routes.direction?.provider, "openai")
    assert.equal(config.routes.direction?.thinkingLevel, "low")
  })

  it("rejects routes without provider/model format", () => {
    assert.throws(() => parseModelRoute("claude-sonnet"), /provider\/model/)
  })
})
