import { randomUUID } from "node:crypto"
import { validateComposedScene } from "@claqueta/scene-contracts"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { StringEnum, type Api, type Model } from "@earendil-works/pi-ai/compat"
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
import { Type } from "typebox"
import type { ThreadEventBus } from "./events.js"
import type { ModelRouter } from "./modelRouter.js"
import { PROJECT_ROOT } from "./paths.js"
import type { CreativeBrief, DirectionDraft, ScriptDraft } from "./types.js"

const ScriptSceneSchema = Type.Object({
  id: Type.String(),
  type: StringEnum(["intro", "terminal", "callout", "outro", "hero", "benefits", "pricing", "cta", "custom"] as const),
  title: Type.String(),
  voiceover: Type.Optional(Type.String()),
  visualNotes: Type.String(),
  narrativeRole: Type.String(),
  visualType: StringEnum(["builtin", "custom"] as const),
  componentId: Type.Optional(Type.String()),
  visualRole: Type.String(),
  propsPlan: Type.Record(Type.String(), Type.Any()),
  visualRationale: Type.String(),
  requiredAssets: Type.Array(Type.String()),
  missingCapabilities: Type.Array(Type.String()),
  riskNotes: Type.Array(Type.String()),
  durationInSeconds: Type.Number({ exclusiveMinimum: 0 }),
})

const SpecialistScriptDraftSchema = Type.Object({
  title: Type.String(),
  objective: Type.String(),
  audience: Type.Optional(Type.String()),
  tone: Type.Optional(Type.String()),
  scenes: Type.Array(ScriptSceneSchema, { minItems: 1 }),
  estimatedDurationSeconds: Type.Optional(Type.Number({ exclusiveMinimum: 0 })),
  notes: Type.Optional(Type.String()),
})

const BeatSchema = Type.Object({
  id: Type.String(),
  startMs: Type.Number({ minimum: 0 }),
  endMs: Type.Optional(Type.Number({ minimum: 0 })),
  narration: Type.Optional(Type.String()),
  visual: Type.Optional(Type.String()),
  animation: Type.Optional(Type.String()),
  emphasis: Type.Optional(StringEnum(["low", "medium", "high"] as const)),
})

const SpecialistDirectionSceneSchema = Type.Object({
  sceneId: Type.String(),
  sceneType: Type.String(),
  componentId: Type.Optional(Type.String()),
  title: Type.Optional(Type.String()),
  technicalIntent: Type.String(),
  visualContract: Type.String(),
  timing: Type.Object({
    tailHoldMs: Type.Optional(Type.Number({ minimum: 0 })),
    transitionMs: Type.Optional(Type.Number({ minimum: 0, maximum: 1500 })),
  }),
  beats: Type.Array(BeatSchema),
  assets: Type.Array(Type.String()),
  risks: Type.Array(Type.String()),
})

const SpecialistDirectionDraftSchema = Type.Object({
  title: Type.Optional(Type.String()),
  scenes: Type.Array(SpecialistDirectionSceneSchema),
  warnings: Type.Array(Type.String()),
  risks: Type.Array(Type.String()),
})

export interface DirectionSpecialistSession {
  subscribe(listener: (event: AgentSessionEvent) => void): () => void
  prompt(text: string): Promise<void>
  abort(): Promise<void>
  dispose(): void
}

interface CreateDirectionSessionInput {
  captureDirection: (direction: DirectionDraft) => void
}

type CreateDirectionSession = (input: CreateDirectionSessionInput) => Promise<DirectionSpecialistSession>

export interface DirectionSpecialistRunnerOptions {
  threadId: string
  eventBus: ThreadEventBus
  modelRouter: ModelRouter
  authStorage: AuthStorage
  modelRegistry: ModelRegistry
  createSession?: CreateDirectionSession
}

export interface DirectionSpecialistResult {
  runId: string
  modelRoute: string
  direction: DirectionDraft
}

export interface DirectionSpecialistRevisionContext {
  feedback?: string
  previousDirection?: DirectionDraft
  /** Exactly one parent-selected target summary. */
  selectedTarget?: Record<string, unknown>
}

export interface CopywriterSpecialistRevisionContext {
  feedback?: string
  previousScript?: ScriptDraft
}

export interface CopywriterSpecialistResult {
  runId: string
  modelRoute: string
  script: ScriptDraft
}

function loadSpecialistPrompt(name: "copywriter" | "director"): string {
  return readFileSync(join(PROJECT_ROOT, `packages/agent-pi/resources/agents/${name}.md`), "utf-8")
}

function loadDirectorPrompt(): string {
  return loadSpecialistPrompt("director")
}

function loadAvailableSceneCatalog(): unknown {
  const catalog = JSON.parse(readFileSync(join(PROJECT_ROOT, "src/shared/scene-catalog.json"), "utf-8")) as {
    scenes?: { tutorial?: unknown }
  }
  return catalog.scenes?.tutorial ?? {}
}

function routeLabel(model: Model<Api> | undefined): string {
  return model ? `${model.provider}/${model.id}` : "default"
}

function validateDirectionAgainstScript(direction: DirectionDraft, script: ScriptDraft): void {
  if (direction.scenes.length !== script.scenes.length) {
    throw new Error(
      `Director specialist returned ${direction.scenes.length} scenes for a ${script.scenes.length}-scene script`,
    )
  }

  direction.scenes.forEach((rawDirectionScene, index) => {
    const directionScene = rawDirectionScene as Record<string, unknown>
    const scriptScene = script.scenes[index]
    if (directionScene.sceneId !== scriptScene.id) {
      throw new Error(`Director specialist changed scene order/id at position ${index + 1}`)
    }
    if (directionScene.sceneType !== scriptScene.type) {
      throw new Error(`Director specialist changed scene type for '${scriptScene.id}'`)
    }
    const directionComponentId =
      typeof directionScene.componentId === "string" && directionScene.componentId
        ? directionScene.componentId
        : undefined
    if (directionComponentId !== scriptScene.componentId) {
      throw new Error(`Director specialist changed componentId for '${scriptScene.id}'`)
    }
    const durationMs = scriptScene.durationInSeconds * 1000
    const beats = Array.isArray(directionScene.beats) ? directionScene.beats : []
    for (const rawBeat of beats) {
      const beat = rawBeat as Record<string, unknown>
      if (typeof beat.startMs !== "number" || beat.startMs < 0 || beat.startMs >= durationMs) {
        throw new Error(`Director specialist returned an out-of-range beat for '${scriptScene.id}'`)
      }
      if (typeof beat.endMs === "number" && (beat.endMs <= beat.startMs || beat.endMs > durationMs)) {
        throw new Error(`Director specialist returned an invalid beat end for '${scriptScene.id}'`)
      }
    }
  })
}

export interface CopywriterSpecialistRunnerOptions {
  threadId: string
  eventBus: ThreadEventBus
  modelRouter: ModelRouter
  authStorage: AuthStorage
  modelRegistry: ModelRegistry
  createSession?: (input: { captureScript: (script: ScriptDraft) => void }) => Promise<DirectionSpecialistSession>
}

export class CopywriterSpecialistRunner {
  private readonly createSession: NonNullable<CopywriterSpecialistRunnerOptions["createSession"]>

  constructor(private readonly options: CopywriterSpecialistRunnerOptions) {
    this.createSession = options.createSession ?? ((input) => this.createDefaultSession(input))
  }

  async run(
    request: string,
    brief: CreativeBrief,
    revision: CopywriterSpecialistRevisionContext = {},
    signal?: AbortSignal,
  ): Promise<CopywriterSpecialistResult> {
    const runId = randomUUID()
    const model = this.options.modelRouter.findModel("narrative")
    const configuredRoute = this.options.modelRouter.route("narrative")
    const modelRoute = configuredRoute ? `${configuredRoute.provider}/${configuredRoute.model}` : routeLabel(model)
    const startedAt = new Date().toISOString()
    let capturedScript: ScriptDraft | undefined
    let childError: string | undefined
    let session: DirectionSpecialistSession | undefined
    let unsubscribe: (() => void) | undefined
    let abortHandler: (() => void) | undefined

    this.options.eventBus.publish({
      threadId: this.options.threadId,
      type: "subagent_start",
      payload: {
        runId,
        subagentType: "copywriter",
        description: "Turn the creative brief into a topic-neutral, catalog-grounded visual script",
        modelRoute,
        startedAt,
      },
    })

    try {
      session = await this.createSession({ captureScript: (script) => (capturedScript = script) })
      unsubscribe = session.subscribe((event) => {
        if (
          event.type === "message_end" &&
          event.message.role === "assistant" &&
          event.message.stopReason === "error"
        ) {
          childError = event.message.errorMessage ?? "Copywriter specialist model request failed"
        }
        this.publishSessionUpdate(runId, event)
      })

      if (signal) {
        abortHandler = () => void session?.abort()
        if (signal.aborted) abortHandler()
        else signal.addEventListener("abort", abortHandler, { once: true })
      }

      const prompt = [
        revision.feedback
          ? "Revise the previous script using the human feedback while preserving unaffected intent."
          : "Create a complete visual script from the request and creative brief.",
        "",
        "## Original request",
        request,
        "",
        "## Creative brief",
        JSON.stringify(brief, null, 2),
        revision.feedback ? `\n## Human feedback\n${revision.feedback}` : "",
        revision.previousScript ? `\n## Previous script\n${JSON.stringify(revision.previousScript, null, 2)}` : "",
        "",
        "## Exact available scene catalog",
        JSON.stringify(loadAvailableSceneCatalog(), null, 2),
      ].join("\n")
      await session.prompt(prompt)
      if (childError && !capturedScript) throw new Error(childError)

      if (!capturedScript) {
        await session.prompt(
          "Your previous turn did not satisfy the output contract. Call submit_script exactly once now with the complete structured draft; do not answer with prose.",
        )
        if (childError && !capturedScript) throw new Error(childError)
      }
      if (!capturedScript) {
        throw new Error("Copywriter specialist finished without calling submit_script after one repair attempt")
      }

      const sceneIds = capturedScript.scenes.map((scene) => scene.id)
      if (new Set(sceneIds).size !== sceneIds.length)
        throw new Error("Copywriter specialist returned duplicate scene ids")

      const completedAt = new Date().toISOString()
      this.options.eventBus.publish({
        threadId: this.options.threadId,
        type: "subagent_end",
        payload: {
          runId,
          subagentType: "copywriter",
          modelRoute,
          result: `Script draft completed with ${capturedScript.scenes.length} scenes`,
          startedAt,
          completedAt,
        },
      })
      return { runId, modelRoute, script: capturedScript }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.options.eventBus.publish({
        threadId: this.options.threadId,
        type: "subagent_error",
        payload: {
          runId,
          subagentType: "copywriter",
          modelRoute,
          message,
          startedAt,
          completedAt: new Date().toISOString(),
        },
      })
      throw error
    } finally {
      if (signal && abortHandler) signal.removeEventListener("abort", abortHandler)
      unsubscribe?.()
      session?.dispose()
    }
  }

  private async createDefaultSession({
    captureScript,
  }: {
    captureScript: (script: ScriptDraft) => void
  }): Promise<DirectionSpecialistSession> {
    const model = this.options.modelRouter.findModel("narrative")
    const thinkingLevel = this.options.modelRouter.thinkingLevel("narrative")
    const submitScript = defineTool({
      name: "submit_script",
      label: "Submit Script",
      description: "Return the complete structured visual script to the parent Claqueta runtime.",
      parameters: Type.Object({ script: SpecialistScriptDraftSchema }),
      async execute(_toolCallId, params) {
        const script = params.script as ScriptDraft
        for (const scene of script.scenes) {
          if (scene.componentId !== "composed-scene") continue
          const validation = validateComposedScene(scene.propsPlan)
          if (!validation.valid) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Scene '${scene.id}' has invalid composed-scene props: ${validation.errors.join("; ")}`,
                },
              ],
              details: { sceneCount: params.script.scenes.length },
              isError: true,
            }
          }
        }
        captureScript(script)
        return {
          content: [{ type: "text" as const, text: "Script draft accepted." }],
          details: { sceneCount: params.script.scenes.length },
          terminate: true,
        }
      },
    })
    const resourceLoader = new DefaultResourceLoader({
      cwd: PROJECT_ROOT,
      agentDir: PROJECT_ROOT,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      systemPrompt: loadSpecialistPrompt("copywriter"),
    })
    const { session } = await createAgentSession({
      cwd: PROJECT_ROOT,
      model: model as Model<Api> | undefined,
      ...(thinkingLevel ? { thinkingLevel } : {}),
      authStorage: this.options.authStorage,
      modelRegistry: this.options.modelRegistry,
      resourceLoader,
      customTools: [submitScript],
      tools: [submitScript.name],
      sessionManager: SessionManager.inMemory(PROJECT_ROOT),
      settingsManager: SettingsManager.inMemory({
        compaction: { enabled: false },
        retry: { enabled: true, maxRetries: 1 },
      }),
    })
    return session
  }

  private publishSessionUpdate(runId: string, event: AgentSessionEvent): void {
    if (event.type !== "tool_execution_start" && event.type !== "tool_execution_end") return
    this.options.eventBus.publish({
      threadId: this.options.threadId,
      type: "subagent_update",
      payload: {
        runId,
        subagentType: "copywriter",
        kind: event.type === "tool_execution_start" ? "tool_start" : "tool_end",
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        ...(event.type === "tool_execution_end" ? { isError: event.isError } : {}),
      },
    })
  }
}

export class DirectionSpecialistRunner {
  private readonly createSession: CreateDirectionSession

  constructor(private readonly options: DirectionSpecialistRunnerOptions) {
    this.createSession = options.createSession ?? ((input) => this.createDefaultSession(input))
  }

  async run(
    script: ScriptDraft,
    revision: DirectionSpecialistRevisionContext = {},
    signal?: AbortSignal,
  ): Promise<DirectionSpecialistResult> {
    const runId = randomUUID()
    const model = this.options.modelRouter.findModel("direction")
    const configuredRoute = this.options.modelRouter.route("direction")
    const modelRoute = configuredRoute ? `${configuredRoute.provider}/${configuredRoute.model}` : routeLabel(model)
    const startedAt = new Date().toISOString()
    let capturedDirection: DirectionDraft | undefined
    let childError: string | undefined
    let session: DirectionSpecialistSession | undefined
    let unsubscribe: (() => void) | undefined
    let abortHandler: (() => void) | undefined

    this.options.eventBus.publish({
      threadId: this.options.threadId,
      type: "subagent_start",
      payload: {
        runId,
        subagentType: "director",
        description: "Review the approved script against real Remotion scene contracts",
        modelRoute,
        startedAt,
      },
    })

    try {
      session = await this.createSession({
        captureDirection: (direction) => {
          capturedDirection = direction
        },
      })
      unsubscribe = session.subscribe((event) => {
        if (
          event.type === "message_end" &&
          event.message.role === "assistant" &&
          event.message.stopReason === "error"
        ) {
          childError = event.message.errorMessage ?? "Director specialist model request failed"
        }
        this.publishSessionUpdate(runId, event)
      })

      if (signal) {
        abortHandler = () => {
          void session?.abort()
        }
        if (signal.aborted) abortHandler()
        else signal.addEventListener("abort", abortHandler, { once: true })
      }

      const prompt = [
        revision.feedback
          ? "Revise the previous direction using the human feedback while preserving the approved script."
          : "Create the direction draft for this approved script.",
        revision.feedback ? `\n## Human feedback\n${revision.feedback}` : "",
        revision.previousDirection
          ? `\n## Previous direction draft\n${JSON.stringify(revision.previousDirection, null, 2)}`
          : "",
        "",
        "## Approved script",
        JSON.stringify(script, null, 2),
        revision.selectedTarget
          ? `\n## Selected target contract\n${JSON.stringify(revision.selectedTarget, null, 2)}`
          : "",
        "",
        "## Exact available scene catalog",
        JSON.stringify(loadAvailableSceneCatalog(), null, 2),
      ].join("\n")
      await session.prompt(prompt)
      if (childError) throw new Error(childError)

      if (!capturedDirection) {
        await session.prompt(
          "Your previous turn did not satisfy the output contract. Call submit_direction exactly once now with the complete structured draft; do not answer with prose.",
        )
        if (childError) throw new Error(childError)
      }
      if (!capturedDirection) {
        throw new Error("Director specialist finished without calling submit_direction after one repair attempt")
      }
      try {
        validateDirectionAgainstScript(capturedDirection, script)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        capturedDirection = undefined
        await session.prompt(
          [
            `The parent rejected the direction draft: ${message}.`,
            "Preserve every sceneId, sceneType, componentId, duration, and order exactly as written in the approved script, even when the human feedback describes a parent-projected renderer.",
            "Call submit_direction exactly once with one corrected complete draft; do not answer with prose.",
          ].join("\n"),
        )
        if (childError) throw new Error(childError)
        if (!capturedDirection) throw new Error("Director specialist did not submit a corrected direction draft")
        validateDirectionAgainstScript(capturedDirection, script)
      }

      const completedAt = new Date().toISOString()
      this.options.eventBus.publish({
        threadId: this.options.threadId,
        type: "subagent_end",
        payload: {
          runId,
          subagentType: "director",
          modelRoute,
          result: `Direction draft completed for ${capturedDirection.scenes.length} scenes`,
          startedAt,
          completedAt,
        },
      })
      return { runId, modelRoute, direction: capturedDirection }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.options.eventBus.publish({
        threadId: this.options.threadId,
        type: "subagent_error",
        payload: {
          runId,
          subagentType: "director",
          modelRoute,
          message,
          startedAt,
          completedAt: new Date().toISOString(),
        },
      })
      throw error
    } finally {
      if (signal && abortHandler) signal.removeEventListener("abort", abortHandler)
      unsubscribe?.()
      session?.dispose()
    }
  }

  private async createDefaultSession({
    captureDirection,
  }: CreateDirectionSessionInput): Promise<DirectionSpecialistSession> {
    const model = this.options.modelRouter.findModel("direction")
    const thinkingLevel = this.options.modelRouter.thinkingLevel("direction")
    const submitDirection = defineTool({
      name: "submit_direction",
      label: "Submit Direction",
      description: "Return the complete structured direction draft to the parent Claqueta runtime.",
      parameters: Type.Object({ direction: SpecialistDirectionDraftSchema }),
      async execute(_toolCallId, params) {
        captureDirection(params.direction as DirectionDraft)
        return {
          content: [{ type: "text" as const, text: "Direction draft accepted." }],
          details: { sceneCount: params.direction.scenes.length },
          terminate: true,
        }
      },
    })
    const resourceLoader = new DefaultResourceLoader({
      cwd: PROJECT_ROOT,
      agentDir: PROJECT_ROOT,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      systemPrompt: loadDirectorPrompt(),
    })
    const { session } = await createAgentSession({
      cwd: PROJECT_ROOT,
      model: model as Model<Api> | undefined,
      ...(thinkingLevel ? { thinkingLevel } : {}),
      authStorage: this.options.authStorage,
      modelRegistry: this.options.modelRegistry,
      resourceLoader,
      customTools: [submitDirection],
      tools: [submitDirection.name],
      sessionManager: SessionManager.inMemory(PROJECT_ROOT),
      settingsManager: SettingsManager.inMemory({
        compaction: { enabled: false },
        retry: { enabled: true, maxRetries: 1 },
      }),
    })
    return session
  }

  private publishSessionUpdate(runId: string, event: AgentSessionEvent): void {
    if (event.type !== "tool_execution_start" && event.type !== "tool_execution_end") return
    this.options.eventBus.publish({
      threadId: this.options.threadId,
      type: "subagent_update",
      payload: {
        runId,
        subagentType: "director",
        kind: event.type === "tool_execution_start" ? "tool_start" : "tool_end",
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        ...(event.type === "tool_execution_end" ? { isError: event.isError } : {}),
      },
    })
  }
}
