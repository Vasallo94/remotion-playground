import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  createRuntimeAuthStorage,
  ModelRouter,
  isSafeDefaultModel,
  loadModelRoutingConfigFromEnv,
  parseModelRoute,
} from "../src/modelRouter.js"

describe("model routing", () => {
  it("defaults text tasks to Azure Luna/Sol and visual QA to Google Vertex", () => {
    const routes = loadModelRoutingConfigFromEnv({}).routes
    const textTasks = [
      "main",
      "intake",
      "research",
      "narrative",
      "direction",
      "audio_plan",
      "scene_creation",
      "config",
      "validation",
    ] as const

    for (const task of textTasks) {
      assert.equal(routes[task]?.provider, "azure-openai")
      assert.match(routes[task]?.model ?? "", /^gpt-5\.6-(luna|sol)$/)
    }
    assert.equal(routes.scene_qa?.provider, "google-vertex")
    assert.equal(routes.scene_qa?.model, "gemini-2.5-flash")
    assert.equal(routes.scene_qa?.thinkingLevel, "off")
  })

  it("adapts a Vertex service account for Pi without copying its secret", () => {
    const directory = mkdtempSync(join(tmpdir(), "claqueta-vertex-auth-"))
    const credentialsPath = join(directory, "service-account.json")
    writeFileSync(credentialsPath, JSON.stringify({ project_id: "vertex-project", private_key: "not-copied" }))

    try {
      assert.deepEqual(
        createRuntimeAuthStorage({ GOOGLE_APPLICATION_CREDENTIALS: credentialsPath }).get("google-vertex"),
        {
          type: "api_key",
          key: "gcp-vertex-credentials",
          env: {
            GOOGLE_APPLICATION_CREDENTIALS: credentialsPath,
            GOOGLE_CLOUD_PROJECT: "vertex-project",
            GOOGLE_CLOUD_LOCATION: "global",
          },
        },
      )
    } finally {
      rmSync(directory, { recursive: true })
    }
  })

  it("reports configured routes that cannot be resolved", () => {
    const router = new ModelRouter({ routes: { main: { provider: "missing", model: "missing" } } })
    assert.deepEqual(router.diagnostics(), [
      {
        task: "main",
        route: "missing/missing",
        resolved: false,
        authenticated: false,
        supportsImages: false,
      },
    ])
  })

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
