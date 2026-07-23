import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
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

const DEFAULT_ROUTES: Partial<Record<ModelTask, string>> = {
  main: "azure-openai/gpt-5.6-sol:low",
  intake: "azure-openai/gpt-5.6-luna:low",
  research: "azure-openai/gpt-5.6-luna:low",
  narrative: "azure-openai/gpt-5.6-sol:low",
  direction: "azure-openai/gpt-5.6-sol:low",
  audio_plan: "azure-openai/gpt-5.6-luna:low",
  scene_qa: "google-vertex/gemini-2.5-flash:off",
  scene_creation: "azure-openai/gpt-5.6-luna:low",
  config: "azure-openai/gpt-5.6-luna:low",
  validation: "azure-openai/gpt-5.6-luna:low",
}

export interface ModelRouteDiagnostic {
  task: ModelTask
  route: string
  resolved: boolean
  authenticated: boolean
  supportsImages: boolean
}

type AuthData = NonNullable<Parameters<typeof AuthStorage.inMemory>[0]>

const VERTEX_CREDENTIALS_MARKER = "gcp-vertex-credentials"

export function createRuntimeAuthStorage(env: NodeJS.ProcessEnv = process.env): AuthStorage {
  const credentialsPath = env.GOOGLE_APPLICATION_CREDENTIALS
  if (!credentialsPath || !existsSync(credentialsPath)) return AuthStorage.create()

  const serviceAccount = JSON.parse(readFileSync(credentialsPath, "utf8")) as { project_id?: unknown }
  const project =
    env.GOOGLE_CLOUD_PROJECT ?? (typeof serviceAccount.project_id === "string" ? serviceAccount.project_id : undefined)
  if (!project) throw new Error("Google Vertex service account requires GOOGLE_CLOUD_PROJECT or project_id")

  const authPath = join(homedir(), ".pi/agent/auth.json")
  const credentials = existsSync(authPath) ? (JSON.parse(readFileSync(authPath, "utf8")) as AuthData) : ({} as AuthData)
  credentials["google-vertex"] = {
    type: "api_key",
    key: VERTEX_CREDENTIALS_MARKER,
    env: {
      GOOGLE_APPLICATION_CREDENTIALS: credentialsPath,
      GOOGLE_CLOUD_PROJECT: project,
      GOOGLE_CLOUD_LOCATION: env.GOOGLE_CLOUD_LOCATION ?? "global",
    },
  }
  return AuthStorage.inMemory(credentials)
}

export class ModelRouter {
  readonly authStorage: AuthStorage
  readonly modelRegistry: ModelRegistry
  readonly config: ModelRoutingConfig

  constructor(config = loadModelRoutingConfigFromEnv()) {
    this.authStorage = createRuntimeAuthStorage()
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

  diagnostics(): ModelRouteDiagnostic[] {
    return Object.entries(this.config.routes).map(([task, route]) => {
      const model = this.modelRegistry.find(route.provider, route.model)
      return {
        task: task as ModelTask,
        route: `${route.provider}/${route.model}`,
        resolved: model !== undefined,
        authenticated: model !== undefined && this.modelRegistry.hasConfiguredAuth(model),
        supportsImages: model?.input.includes("image") ?? false,
      }
    })
  }
}

export function isSafeDefaultModel(model: Pick<Model<Api>, "provider" | "id">): boolean {
  return !(model.provider === "openai-codex" && model.id.endsWith("-spark"))
}

export function loadModelRoutingConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ModelRoutingConfig {
  const routes: Partial<Record<ModelTask, ModelRoute>> = {}
  for (const [task, envName] of Object.entries(TASK_ENV) as Array<[ModelTask, string]>) {
    const parsed = parseModelRoute(env[envName] ?? DEFAULT_ROUTES[task])
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
