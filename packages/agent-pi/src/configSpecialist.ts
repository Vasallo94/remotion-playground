import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { Api, Model } from "@earendil-works/pi-ai/compat"
import {
  createAgentSession,
  DefaultResourceLoader,
  defineTool,
  SessionManager,
  SettingsManager,
  type AgentSessionEvent,
  type AuthStorage,
  type ModelRegistry,
} from "@earendil-works/pi-coding-agent"
import type { TargetContract } from "@claqueta/scene-contracts"
import { Type } from "typebox"
import TutorialSchemaModule from "../../../src/compositions/ClaudeCodeTutorial/schema.js"
import ProductShortSchemaModule from "../../../src/compositions/ProductShort/schema.js"
import { canonicalJson, contentHash } from "./contentHash.js"
import type { ThreadEventBus } from "./events.js"
import type { ModelRouter } from "./modelRouter.js"
import { PROJECT_ROOT } from "./paths.js"
import { validateProductionBriefArtifact, type ProductionBriefArtifact } from "./productionBrief.js"
import {
  targetContractFromResolvedSummary,
  targetSelectorFromProductionBriefArtifact,
  type ResolvedTargetContractSummary,
} from "./targetContracts.js"
import type { AudioChart, DirectionDraft, ScriptDraft } from "./types.js"

export const CONFIG_LINEAGE_SCHEMA_VERSION = 1 as const

export interface ApprovedConfigInputArtifact<T> {
  artifactId: string
  version: number
  approved: true
  data: T
}

export interface ConfigArtifactLineageRef {
  artifactId: string
  version: number
  contentHash: string
}

export interface ConfigLineageMetadata {
  schemaVersion: typeof CONFIG_LINEAGE_SCHEMA_VERSION
  productionBrief: ConfigArtifactLineageRef
  target: {
    targetId: string
    contractSchemaVersion: number
    configSchemaId: string
    configSchemaVersion: number
  }
  script: ConfigArtifactLineageRef
  direction: ConfigArtifactLineageRef
  audio: ConfigArtifactLineageRef | null
  previousConfig: { artifactId: string; version: number; contentHash: string } | null
}

export interface PreviousConfigInput {
  artifactId: string
  version: number
  /** Parent-observed latest version. A mismatch rejects a stale selection before model execution. */
  latestVersion: number
  data: Record<string, unknown>
  contentHash: string
  lineage: ConfigLineageMetadata
}

export interface ConfigSpecialistInput {
  productionBrief: ApprovedConfigInputArtifact<ProductionBriefArtifact>
  target: ResolvedTargetContractSummary
  script: ApprovedConfigInputArtifact<ScriptDraft>
  direction: ApprovedConfigInputArtifact<DirectionDraft>
  audio?: ApprovedConfigInputArtifact<AudioChart>
  /** Explicitly null for first generation; otherwise the exact latest parent-owned config artifact. */
  previousConfig: PreviousConfigInput | null
}

export interface ConfigSpecialistResult {
  runId: string
  modelRoute: string
  config: Record<string, unknown>
  configHash: string
  lineage: ConfigLineageMetadata
}

/** Kept only so existing, not-yet-migrated wiring typechecks; runtime prerequisite validation rejects it. */
interface UnwiredLegacyConfigInput {
  script: ScriptDraft
  direction: DirectionDraft
  audioChart?: AudioChart
  catalog: Record<string, unknown>
  previousConfig?: Record<string, unknown>
}

export interface ConfigSpecialistSession {
  subscribe(listener: (event: AgentSessionEvent) => void): () => void
  prompt(text: string): Promise<void>
  abort(): Promise<void>
  dispose(): void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function configContentHash(value: unknown): string {
  return contentHash(value)
}

function sameValue(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right)
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function artifactRef<T>(artifact: ApprovedConfigInputArtifact<T>): ConfigArtifactLineageRef {
  return {
    artifactId: artifact.artifactId,
    version: artifact.version,
    contentHash: configContentHash(artifact.data),
  }
}

function assertApprovedArtifact<T>(value: unknown, label: string): asserts value is ApprovedConfigInputArtifact<T> {
  if (!isRecord(value) || value.approved !== true) throw new Error(`${label} artifact must be approved`)
  if (typeof value.artifactId !== "string" || !value.artifactId.trim()) {
    throw new Error(`${label} artifactId must be a non-empty string`)
  }
  if (!Number.isInteger(value.version) || (value.version as number) < 1) {
    throw new Error(`${label} artifact version must be a positive integer`)
  }
  if (!("data" in value)) throw new Error(`${label} artifact data is required`)
}

function buildLineage(input: ConfigSpecialistInput, target: TargetContract): ConfigLineageMetadata {
  return {
    schemaVersion: CONFIG_LINEAGE_SCHEMA_VERSION,
    productionBrief: artifactRef(input.productionBrief),
    target: {
      targetId: target.id,
      contractSchemaVersion: target.schemaVersion,
      configSchemaId: target.rendering.configSchema.id,
      configSchemaVersion: target.rendering.configSchema.version,
    },
    script: artifactRef(input.script),
    direction: artifactRef(input.direction),
    audio: input.audio ? artifactRef(input.audio) : null,
    previousConfig: input.previousConfig
      ? {
          artifactId: input.previousConfig.artifactId,
          version: input.previousConfig.version,
          contentHash: input.previousConfig.contentHash,
        }
      : null,
  }
}

function assertPreviousConfigFresh(previous: PreviousConfigInput, lineage: ConfigLineageMetadata): void {
  if (typeof previous.artifactId !== "string" || !previous.artifactId.trim()) {
    throw new Error("Previous config artifactId must be a non-empty string")
  }
  if (
    !Number.isInteger(previous.version) ||
    !Number.isInteger(previous.latestVersion) ||
    previous.version < 1 ||
    previous.latestVersion < 1
  ) {
    throw new Error("Previous config versions must be positive integers")
  }
  if (!isRecord(previous.data)) throw new Error("Previous config data must be an object")
  if (!isRecord(previous.lineage)) throw new Error("Previous config lineage is required")
  if (previous.version !== previous.latestVersion) {
    throw new Error(
      `Previous config is stale: selected version ${previous.version}, latest version ${previous.latestVersion}`,
    )
  }
  if (previous.contentHash !== configContentHash(previous.data)) {
    throw new Error("Previous config is stale or modified: content hash does not match")
  }
  const previousInputs = previous.lineage
  if (
    previousInputs.schemaVersion !== CONFIG_LINEAGE_SCHEMA_VERSION ||
    !sameValue(previousInputs.productionBrief, lineage.productionBrief) ||
    !sameValue(previousInputs.target, lineage.target) ||
    !sameValue(previousInputs.script, lineage.script) ||
    !sameValue(previousInputs.direction, lineage.direction)
  ) {
    throw new Error("Previous config is stale: approved input lineage does not match the current inputs")
  }
}

function providedBriefValue(artifact: ProductionBriefArtifact, field: "format" | "dimensions"): unknown {
  const input = artifact.brief[field]
  return input.status === "provided" ? input.value : undefined
}

function prepareInput(raw: ConfigSpecialistInput | UnwiredLegacyConfigInput): {
  input: ConfigSpecialistInput
  target: TargetContract
  lineage: ConfigLineageMetadata
} {
  const candidate = raw as Partial<ConfigSpecialistInput>
  assertApprovedArtifact<ProductionBriefArtifact>(candidate.productionBrief, "ProductionBrief")
  assertApprovedArtifact<ScriptDraft>(candidate.script, "Script")
  assertApprovedArtifact<DirectionDraft>(candidate.direction, "Direction")
  if (candidate.audio !== undefined) assertApprovedArtifact<AudioChart>(candidate.audio, "Audio")
  if (!("previousConfig" in candidate)) {
    throw new Error("Previous config input is required and must be explicitly null for first generation")
  }

  if (!isRecord(candidate.script.data) || !Array.isArray(candidate.script.data.scenes)) {
    throw new Error("Script artifact data must contain a scenes array")
  }
  if (!isRecord(candidate.direction.data) || !Array.isArray(candidate.direction.data.scenes)) {
    throw new Error("Direction artifact data must contain a scenes array")
  }
  if (candidate.audio !== undefined && !isRecord(candidate.audio.data)) {
    throw new Error("Audio artifact data must be an object")
  }

  const briefValidation = validateProductionBriefArtifact(candidate.productionBrief.data)
  if (!briefValidation.valid || !briefValidation.ready) {
    throw new Error(
      `ProductionBrief artifact must be valid and ready: ${briefValidation.errors.join("; ") || briefValidation.unresolvedFields.join(", ")}`,
    )
  }

  const target = targetContractFromResolvedSummary(candidate.target)
  const requestedFormat = providedBriefValue(candidate.productionBrief.data, "format")
  if (typeof requestedFormat !== "string" || !target.capabilities.formats.includes(requestedFormat)) {
    throw new Error("Approved ProductionBrief format is not supported by the selected target")
  }
  const requestedDimensions = providedBriefValue(candidate.productionBrief.data, "dimensions")
  if (
    !isRecord(requestedDimensions) ||
    !target.capabilities.dimensions.some(
      (dimensions) =>
        dimensions.width === requestedDimensions.width && dimensions.height === requestedDimensions.height,
    )
  ) {
    throw new Error("Approved ProductionBrief dimensions are not supported by the selected target")
  }

  const input = candidate as ConfigSpecialistInput
  const lineage = buildLineage(input, target)
  if (input.previousConfig) assertPreviousConfigFresh(input.previousConfig, lineage)
  return { input: clone(input), target, lineage }
}

export function validateGeneratedConfig(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error("config must be an object")
  if (!Array.isArray(value.scenes) || value.scenes.length === 0)
    throw new Error("config.scenes must be a non-empty array")
  return value
}

function formatSchemaErrors(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>): string {
  return issues.map((issue) => `${issue.path.join(".") || "config"}: ${issue.message}`).join("; ")
}

function validateRenderSchema(config: Record<string, unknown>, target: TargetContract): void {
  const schemaId = target.rendering.configSchema.id
  const schema = schemaId.includes("ProductShort/schema.ts")
    ? ProductShortSchemaModule.ProductShortConfigSchema
    : schemaId.includes("ClaudeCodeTutorial/schema.ts")
      ? TutorialSchemaModule.TutorialConfigSchema
      : undefined
  if (!schema) throw new Error(`No parent render-schema adapter is registered for '${schemaId}'`)
  const result = schema.safeParse(config)
  if (!result.success) throw new Error(`Render schema rejected config: ${formatSchemaErrors(result.error.issues)}`)
}

function sceneAdapterId(scene: Record<string, unknown>): string {
  if (scene.type === "custom") return `custom.${String(scene.componentId ?? "")}`
  return `builtin.${String(scene.type ?? "")}`
}

function validateCapabilities(config: Record<string, unknown>, target: TargetContract): void {
  if (!target.capabilities.compositions.some((capability) => capability.id === config.composition)) {
    throw new Error(
      `Config composition '${String(config.composition)}' is not supported by selected target '${target.id}'`,
    )
  }
  if (
    !target.capabilities.dimensions.some(
      (dimensions) => dimensions.width === config.width && dimensions.height === config.height,
    )
  ) {
    throw new Error(
      `Config dimensions '${String(config.width)}x${String(config.height)}' are not supported by selected target '${target.id}'`,
    )
  }
  if (!target.capabilities.themes.includes(String(config.theme))) {
    throw new Error(`Config theme '${String(config.theme)}' is not supported by selected target '${target.id}'`)
  }
  if (!target.rendering.fps.supported.includes(config.fps as number)) {
    throw new Error(`Config fps '${String(config.fps)}' is not supported by selected target '${target.id}'`)
  }
}

function validateExplicitTargetSelection(config: Record<string, unknown>, input: ConfigSpecialistInput): void {
  const selector = targetSelectorFromProductionBriefArtifact(input.productionBrief.data)
  for (const field of ["theme", "composition"] as const) {
    const selected = selector[field]
    if (selected !== undefined && config[field] !== selected) {
      throw new Error(
        `Config ${field} '${String(config[field])}' does not match explicit target ${field} '${selected}'`,
      )
    }
  }
}

function validateSceneLineage(
  config: Record<string, unknown>,
  input: ConfigSpecialistInput,
  target: TargetContract,
): void {
  const scenes = config.scenes as unknown[]
  const scriptScenes = input.script.data.scenes
  const directionScenes = input.direction.data.scenes
  if (scenes.length !== scriptScenes.length) {
    throw new Error(
      `Config scene count ${scenes.length} does not match approved script scene count ${scriptScenes.length}`,
    )
  }
  if (directionScenes.length !== scriptScenes.length) {
    throw new Error("Approved direction does not cover every approved script scene exactly once")
  }
  const contracts = new Map(target.scenes.map((contract) => [contract.id, contract]))

  scenes.forEach((rawScene, index) => {
    if (!isRecord(rawScene)) throw new Error(`Config scene ${index} must be an object`)
    const scriptScene = scriptScenes[index]!
    const directionScene = directionScenes[index]
    if (!isRecord(directionScene) || directionScene.sceneId !== scriptScene.id) {
      throw new Error(`Approved scene order lineage diverges at position ${index + 1}`)
    }
    if (directionScene.sceneType !== undefined && directionScene.sceneType !== scriptScene.type) {
      throw new Error(`Approved direction changed scene type for '${scriptScene.id}'`)
    }
    if (directionScene.componentId !== undefined && directionScene.componentId !== scriptScene.componentId) {
      throw new Error(`Approved direction changed component adapter for '${scriptScene.id}'`)
    }

    const expectedAdapter =
      scriptScene.type === "custom" ? `custom.${scriptScene.componentId ?? ""}` : `builtin.${scriptScene.type}`
    const contract = contracts.get(expectedAdapter)
    if (!contract) throw new Error(`Approved scene '${scriptScene.id}' has no exact adapter in selected target`)
    if (sceneAdapterId(rawScene) !== contract.id) {
      throw new Error(`Config scene '${scriptScene.id}' does not use approved adapter '${contract.id}'`)
    }
    if (rawScene.durationInSeconds !== scriptScene.durationInSeconds) {
      throw new Error(`Config scene '${scriptScene.id}' changed approved duration`)
    }
    if (
      typeof directionScene.durationInSeconds === "number" &&
      rawScene.durationInSeconds !== directionScene.durationInSeconds
    ) {
      throw new Error(`Config scene '${scriptScene.id}' diverges from approved direction duration`)
    }
    for (const field of ["timing", "beats"] as const) {
      if (directionScene[field] !== undefined && !sameValue(rawScene[field], directionScene[field])) {
        throw new Error(`Config scene '${scriptScene.id}' changed approved direction ${field}`)
      }
    }

    if (scriptScene.propsPlan) {
      if (scriptScene.type === "custom") {
        if (!sameValue(rawScene.props, scriptScene.propsPlan)) {
          throw new Error(`Config scene '${scriptScene.id}' changed approved custom props/copy`)
        }
      } else {
        for (const [key, approvedValue] of Object.entries(scriptScene.propsPlan)) {
          if (!sameValue(rawScene[key], approvedValue)) {
            throw new Error(`Config scene '${scriptScene.id}' changed approved prop/copy '${key}'`)
          }
        }
      }
    } else if (
      scriptScene.title !== undefined &&
      rawScene.title !== undefined &&
      rawScene.title !== scriptScene.title
    ) {
      throw new Error(`Config scene '${scriptScene.id}' changed approved title copy`)
    }
  })
}

function applyApprovedSceneLineage(
  config: Record<string, unknown>,
  input: ConfigSpecialistInput,
): Record<string, unknown> {
  const compiled = clone(config)
  const scenes = compiled.scenes as Array<Record<string, unknown>>
  scenes.forEach((scene, index) => {
    const scriptScene = input.script.data.scenes[index]
    const directionScene = input.direction.data.scenes[index]
    if (!scriptScene || !directionScene) return
    scene.durationInSeconds = scriptScene.durationInSeconds
    if (scriptScene.propsPlan) {
      if (scriptScene.type === "custom") scene.props = clone(scriptScene.propsPlan)
      else Object.assign(scene, clone(scriptScene.propsPlan))
    }
    for (const field of ["timing", "beats"] as const) {
      if (directionScene[field] !== undefined) scene[field] = clone(directionScene[field])
    }
  })
  return compiled
}

function validateApprovedAudio(
  config: Record<string, unknown>,
  audio: ApprovedConfigInputArtifact<AudioChart> | undefined,
): void {
  if (!audio) {
    for (const field of ["voiceover", "soundDesign"] as const) {
      if (config[field] !== undefined && config[field] !== null) {
        throw new Error(`Config ${field} requires an approved audio artifact`)
      }
    }
    return
  }
  if (!sameValue(config.voiceover ?? null, audio.data.voiceover)) {
    throw new Error("Config voiceover diverges from approved audio")
  }
  if (!sameValue(config.soundDesign ?? null, audio.data.soundDesign)) {
    throw new Error("Config soundDesign diverges from approved audio")
  }
}

export class ConfigSpecialistRunner {
  constructor(
    private readonly options: {
      threadId: string
      eventBus: ThreadEventBus
      modelRouter: ModelRouter
      authStorage: AuthStorage
      modelRegistry: ModelRegistry
      createSession?: (capture: (config: Record<string, unknown>) => void) => Promise<ConfigSpecialistSession>
      validateConfig?: (
        config: Record<string, unknown>,
        signal?: AbortSignal,
      ) => Promise<{ valid: boolean; errors?: string[] }>
    },
  ) {}

  async run(
    inputValue: ConfigSpecialistInput | UnwiredLegacyConfigInput,
    signal?: AbortSignal,
  ): Promise<ConfigSpecialistResult> {
    const prepared = prepareInput(inputValue)
    const { input, target, lineage } = prepared
    const runId = randomUUID()
    const model = this.options.modelRouter.findModel("validation")
    const route = this.options.modelRouter.route("validation")
    const modelRoute = route ? `${route.provider}/${route.model}` : model ? `${model.provider}/${model.id}` : "default"
    let captured: Record<string, unknown> | undefined
    let submissions = 0
    this.options.eventBus.publish({
      threadId: this.options.threadId,
      type: "subagent_start",
      payload: {
        runId,
        subagentType: "configurator",
        modelRoute,
        startedAt: new Date().toISOString(),
        description: "Compile approved artifacts into a target-bound configuration",
      },
    })
    const capture = (config: Record<string, unknown>) => {
      submissions += 1
      if (submissions === 1) captured = clone(config)
    }
    const session = await (this.options.createSession
      ? this.options.createSession(capture)
      : this.createDefaultSession(model, capture))
    const unsubscribe = session.subscribe(() => undefined)
    const abortHandler = () => void session.abort()
    if (signal?.aborted) abortHandler()
    else signal?.addEventListener("abort", abortHandler, { once: true })
    try {
      const initialPrompt = [
        "Compile the immutable approved inputs into one complete configuration matching the supplied resolved target contract.",
        "Call the terminating config submission tool exactly once. Do not answer with prose.",
        "## Approved ProductionBrief artifact",
        JSON.stringify(input.productionBrief, null, 2),
        "## Exactly one resolved target contract summary",
        JSON.stringify(input.target, null, 2),
        "## Approved script artifact",
        JSON.stringify(input.script, null, 2),
        "## Approved direction artifact",
        JSON.stringify(input.direction, null, 2),
        "## Optional approved audio artifact",
        JSON.stringify(input.audio ?? null, null, 2),
        "## Optional fresh previous config",
        JSON.stringify(input.previousConfig ?? null, null, 2),
      ].join("\n")

      let config: Record<string, unknown>
      await session.prompt(initialPrompt)
      try {
        config = await this.validateSubmission(captured, submissions, input, target, signal)
      } catch (firstError) {
        const exactError = firstError instanceof Error ? firstError.message : String(firstError)
        captured = undefined
        submissions = 0
        await session.prompt(
          `Parent validation rejected the configuration: ${exactError}. This is the one repair turn. Call the terminating config submission tool exactly once with one corrected complete configuration; do not answer with prose.`,
        )
        try {
          config = await this.validateSubmission(captured, submissions, input, target, signal)
        } catch (repairError) {
          throw new Error(
            `Configurator failed after one repair turn: ${repairError instanceof Error ? repairError.message : String(repairError)}`,
          )
        }
      }

      this.options.eventBus.publish({
        threadId: this.options.threadId,
        type: "subagent_end",
        payload: {
          runId,
          subagentType: "configurator",
          modelRoute,
          result: `${(config.scenes as unknown[]).length} scenes`,
          completedAt: new Date().toISOString(),
        },
      })
      return { runId, modelRoute, config, configHash: configContentHash(config), lineage }
    } catch (error) {
      this.options.eventBus.publish({
        threadId: this.options.threadId,
        type: "subagent_error",
        payload: {
          runId,
          subagentType: "configurator",
          modelRoute,
          message: error instanceof Error ? error.message : String(error),
          completedAt: new Date().toISOString(),
        },
      })
      throw error
    } finally {
      signal?.removeEventListener("abort", abortHandler)
      unsubscribe()
      session.dispose()
    }
  }

  private async validateSubmission(
    value: Record<string, unknown> | undefined,
    submissions: number,
    input: ConfigSpecialistInput,
    target: TargetContract,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    if (!value || submissions === 0) throw new Error("Configurator finished without structured output")
    if (submissions !== 1)
      throw new Error(`Configurator must submit exactly once per turn; received ${submissions} submissions`)
    const config = applyApprovedSceneLineage(validateGeneratedConfig(value), input)
    validateRenderSchema(config, target)
    validateCapabilities(config, target)
    validateExplicitTargetSelection(config, input)
    validateSceneLineage(config, input, target)
    validateApprovedAudio(config, input.audio)
    if (this.options.validateConfig) {
      const result = await this.options.validateConfig(config, signal)
      if (!result.valid) throw new Error(result.errors?.join("; ") || "target render validator rejected config")
    }
    return clone(config)
  }

  private async createDefaultSession(
    model: Model<Api> | undefined,
    capture: (config: Record<string, unknown>) => void,
  ): Promise<ConfigSpecialistSession> {
    const submit = defineTool({
      name: "submit_video_config",
      label: "Submit Video Config",
      description: "Return one complete configuration matching the supplied resolved target contract.",
      parameters: Type.Object({ config: Type.Record(Type.String(), Type.Any()) }),
      async execute(_id, params) {
        capture(params.config as Record<string, unknown>)
        return {
          content: [{ type: "text" as const, text: "Configuration captured for parent validation." }],
          details: {},
          terminate: true,
        }
      },
    })
    const loader = new DefaultResourceLoader({
      cwd: PROJECT_ROOT,
      agentDir: PROJECT_ROOT,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      systemPrompt: readFileSync(join(PROJECT_ROOT, "packages/agent-pi/resources/agents/configurator.md"), "utf-8"),
    })
    const { session } = await createAgentSession({
      cwd: PROJECT_ROOT,
      model,
      authStorage: this.options.authStorage,
      modelRegistry: this.options.modelRegistry,
      resourceLoader: loader,
      customTools: [submit],
      tools: [submit.name],
      sessionManager: SessionManager.inMemory(PROJECT_ROOT),
      settingsManager: SettingsManager.inMemory({
        compaction: { enabled: false },
        retry: { enabled: true, maxRetries: 1 },
      }),
    })
    return session
  }
}
