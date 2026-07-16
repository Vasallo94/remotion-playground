import type { Api, Model } from "@earendil-works/pi-ai/compat"
import { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent"
import type { ModelRoute, ModelRoutingConfig, ModelTask } from "./types.js"

type ThinkingLevel = NonNullable<ModelRoute["thinkingLevel"]>

const TASK_ENV: Record<ModelTask, string> = {
  main: "CLAQUETA_PI_MODEL",
  intake: "CLAQUETA_PI_MODEL_INTAKE",
  research: "CLAQUETA_PI_MODEL_RESEARCH",
  narrative: "CLAQUETA_PI_MODEL_NARRATIVE",
  direction: "CLAQUETA_PI_MODEL_DIRECTION",
  audio_plan: "CLAQUETA_PI_MODEL_AUDIO_PLAN",
  scene_qa: "CLAQUETA_PI_MODEL_SCENE_QA",
  scene_creation: "CLAQUETA_PI_MODEL_SCENE_CREATION",
  config: "CLAQUETA_PI_MODEL_CONFIG",
  validation: "CLAQUETA_PI_MODEL_VALIDATION",
  tts: "CLAQUETA_PI_MODEL_TTS",
  sfx: "CLAQUETA_PI_MODEL_SFX",
}

const THINKING_LEVELS = new Set(["off", "minimal", "low", "medium", "high", "xhigh"])

export class ModelRouter {
  readonly authStorage: AuthStorage
  readonly modelRegistry: ModelRegistry
  readonly config: ModelRoutingConfig

  constructor(config = loadModelRoutingConfigFromEnv()) {
    this.authStorage = AuthStorage.create()
    this.modelRegistry = ModelRegistry.create(this.authStorage)
    this.config = config
  }

  route(task: ModelTask = "main"): ModelRoute | undefined {
    return this.config.routes[task] ?? this.config.routes.main
  }

  findModel(task: ModelTask = "main"): Model<Api> | undefined {
    const route = this.route(task)
    if (route) return this.modelRegistry.find(route.provider, route.model)
    const available = this.modelRegistry.getAvailable()
    // Codex Spark can appear as credential-available while remaining disabled
    // for ChatGPT-backed Codex accounts, so it is not a safe server default.
    return available.find(isSafeDefaultModel) ?? available[0] ?? this.modelRegistry.getAll()[0]
  }

  thinkingLevel(task: ModelTask = "main"): ThinkingLevel | undefined {
    return this.route(task)?.thinkingLevel
  }
}

export function isSafeDefaultModel(model: Pick<Model<Api>, "provider" | "id">): boolean {
  return !(model.provider === "openai-codex" && model.id.endsWith("-spark"))
}

export function loadModelRoutingConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ModelRoutingConfig {
  const routes: Partial<Record<ModelTask, ModelRoute>> = {}
  for (const [task, envName] of Object.entries(TASK_ENV) as Array<[ModelTask, string]>) {
    const parsed = parseModelRoute(env[envName])
    if (parsed) routes[task] = parsed
  }
  return { routes }
}

export function parseModelRoute(value: string | undefined): ModelRoute | undefined {
  if (!value?.trim()) return undefined
  const trimmed = value.trim()
  const [modelPart, thinkingPart] = splitThinking(trimmed)
  const slashIndex = modelPart.indexOf("/")
  if (slashIndex <= 0 || slashIndex === modelPart.length - 1) {
    throw new Error(`Model route must use provider/model format: ${trimmed}`)
  }

  return {
    provider: modelPart.slice(0, slashIndex),
    model: modelPart.slice(slashIndex + 1),
    thinkingLevel: thinkingPart,
  }
}

function splitThinking(value: string): [string, ThinkingLevel | undefined] {
  const lastColon = value.lastIndexOf(":")
  if (lastColon === -1) return [value, undefined]
  const maybeThinking = value.slice(lastColon + 1)
  if (!THINKING_LEVELS.has(maybeThinking)) return [value, undefined]
  return [value.slice(0, lastColon), maybeThinking as ThinkingLevel]
}
