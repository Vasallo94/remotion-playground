import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  COMPOSED_SCENE_CONTRACT_SUMMARY,
  VISUAL_PROGRAM_CONTRACT_SUMMARY,
  createVisualRecipeTemplate,
  validateComposedScene,
  type VisualRecipeTemplate,
} from "@claqueta/scene-contracts"
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
import { Type } from "typebox"
import type { ThreadEventBus } from "./events.js"
import type { ModelRouter } from "./modelRouter.js"
import { PROJECT_ROOT } from "./paths.js"
import type { SceneCompositionResult, ScriptDraft } from "./types.js"

const GapSchema = Type.Object({
  capability: Type.String(),
  whyDslInsufficient: Type.String(),
  reuseAnalysis: Type.String(),
  proposedGenericContract: Type.Record(Type.String(), Type.Any()),
  securitySurface: Type.Array(Type.String()),
  affectedFiles: Type.Array(Type.String()),
  acceptanceTests: Type.Array(Type.String()),
})
const ResolutionSchema = Type.Union([
  Type.Object({
    sceneId: Type.String(),
    outcome: Type.Literal("composed"),
    rationale: Type.String(),
    spec: Type.Record(Type.String(), Type.Any()),
  }),
  Type.Object({
    sceneId: Type.String(),
    outcome: Type.Literal("reuse"),
    rationale: Type.String(),
    componentId: Type.String(),
    propsPlan: Type.Record(Type.String(), Type.Any()),
  }),
  Type.Object({
    sceneId: Type.String(),
    outcome: Type.Literal("capability_gap"),
    rationale: Type.String(),
    gap: GapSchema,
  }),
])
const ResultSchema = Type.Object({ summary: Type.String(), resolutions: Type.Array(ResolutionSchema) })
const RecipeProposalSchema = Type.Object({
  summary: Type.String(),
  sceneId: Type.String(),
  template: Type.Any(),
})

export interface VisualRecipeProposal {
  summary: string
  sceneId: string
  template: VisualRecipeTemplate
}

export interface SceneComposerSession {
  subscribe(listener: (event: AgentSessionEvent) => void): () => void
  prompt(text: string): Promise<void>
  abort(): Promise<void>
  dispose(): void
}

export function validateSceneComposition(
  result: SceneCompositionResult,
  targetSceneIds: string[],
  registeredComponentIds: Set<string>,
): SceneCompositionResult {
  const ids = result.resolutions.map((resolution) => resolution.sceneId)
  if (ids.length !== targetSceneIds.length || ids.some((id, index) => id !== targetSceneIds[index])) {
    throw new Error("Scene composition must resolve every target exactly once in the supplied order")
  }
  if (new Set(ids).size !== ids.length) throw new Error("Scene composition contains duplicate scene ids")
  for (const resolution of result.resolutions) {
    if (resolution.outcome === "composed") {
      const validation = validateComposedScene(resolution.spec)
      if (!validation.valid)
        throw new Error(`Scene '${resolution.sceneId}' has invalid composed spec: ${validation.errors.join("; ")}`)
    } else if (resolution.outcome === "reuse") {
      if (
        resolution.componentId === "composed-scene" ||
        resolution.componentId === "visual-program" ||
        !registeredComponentIds.has(resolution.componentId)
      ) {
        throw new Error(
          `Scene '${resolution.sceneId}' reuses unknown or reserved component '${resolution.componentId}'`,
        )
      }
      if (Object.keys(resolution.propsPlan).length === 0)
        throw new Error(`Scene '${resolution.sceneId}' reuse requires concrete props`)
    } else {
      const gap = resolution.gap
      if (
        !gap.capability.trim() ||
        !gap.whyDslInsufficient.trim() ||
        !gap.reuseAnalysis.trim() ||
        gap.acceptanceTests.length === 0 ||
        gap.affectedFiles.length === 0
      ) {
        throw new Error(`Scene '${resolution.sceneId}' capability gap is incomplete`)
      }
    }
  }
  return result
}

export class SceneComposerRunner {
  constructor(
    private readonly options: {
      threadId: string
      eventBus: ThreadEventBus
      modelRouter: ModelRouter
      authStorage: AuthStorage
      modelRegistry: ModelRegistry
      createSession?: (capture: (result: SceneCompositionResult) => void) => Promise<SceneComposerSession>
      createRecipeSession?: (capture: (proposal: VisualRecipeProposal) => void) => Promise<SceneComposerSession>
    },
  ) {}

  async run(
    input: {
      script: ScriptDraft
      targetSceneIds: string[]
      catalog: Record<string, unknown>
      registeredComponentIds: string[]
      selectedTarget?: Record<string, unknown>
    },
    signal?: AbortSignal,
  ): Promise<{ runId: string; modelRoute: string; result: SceneCompositionResult }> {
    const runId = randomUUID()
    const model = this.options.modelRouter.findModel("scene_creation")
    const route = this.options.modelRouter.route("scene_creation")
    const modelRoute = route ? `${route.provider}/${route.model}` : model ? `${model.provider}/${model.id}` : "default"
    let captured: SceneCompositionResult | undefined
    this.options.eventBus.publish({
      threadId: this.options.threadId,
      type: "subagent_start",
      payload: {
        runId,
        subagentType: "scene_creator",
        modelRoute,
        startedAt: new Date().toISOString(),
        description: "Resolve visual needs through reuse or bounded declarative composition",
      },
    })
    const session = await (this.options.createSession
      ? this.options.createSession((value) => (captured = value))
      : this.createDefaultSession(model, (value) => (captured = value)))
    const unsubscribe = session.subscribe(() => undefined)
    const abortHandler = () => void session.abort()
    if (signal?.aborted) abortHandler()
    else signal?.addEventListener("abort", abortHandler, { once: true })
    try {
      const targets = input.script.scenes.filter((scene) => input.targetSceneIds.includes(scene.id))
      await session.prompt(
        [
          "Resolve every target scene in order.",
          "## Approved draft context",
          JSON.stringify(input.script, null, 2),
          "## Target scenes",
          JSON.stringify(targets, null, 2),
          input.selectedTarget ? `## Selected target contract\n${JSON.stringify(input.selectedTarget, null, 2)}` : "",
          "## Registered scene catalog",
          JSON.stringify(input.catalog, null, 2),
          "## Exact composed-scene contract",
          JSON.stringify(COMPOSED_SCENE_CONTRACT_SUMMARY, null, 2),
        ].join("\n"),
      )
      if (!captured)
        await session.prompt(
          "Call submit_scene_composition now with complete ordered resolutions; do not answer with prose.",
        )
      if (!captured) throw new Error("Scene composer finished without structured output")
      let result: SceneCompositionResult
      try {
        result = validateSceneComposition(captured, input.targetSceneIds, new Set(input.registeredComponentIds))
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        captured = undefined
        await session.prompt(
          `The parent rejected the composition: ${message}. Call submit_scene_composition exactly once with a corrected complete result; do not answer with prose.`,
        )
        if (!captured) throw new Error("Scene composer did not submit a corrected result")
        result = validateSceneComposition(captured, input.targetSceneIds, new Set(input.registeredComponentIds))
      }
      this.options.eventBus.publish({
        threadId: this.options.threadId,
        type: "subagent_end",
        payload: {
          runId,
          subagentType: "scene_creator",
          modelRoute,
          result: result.summary,
          completedAt: new Date().toISOString(),
        },
      })
      return { runId, modelRoute, result }
    } catch (error) {
      this.options.eventBus.publish({
        threadId: this.options.threadId,
        type: "subagent_error",
        payload: {
          runId,
          subagentType: "scene_creator",
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

  async runVisualRecipe(
    input: {
      script: ScriptDraft
      sceneId: string
      approvedGap: Record<string, unknown>
      selectedTarget: Record<string, unknown>
    },
    signal?: AbortSignal,
  ): Promise<{ runId: string; modelRoute: string; proposal: VisualRecipeProposal }> {
    const scene = input.script.scenes.find((candidate) => candidate.id === input.sceneId)
    if (!scene) throw new Error(`Visual Recipe proposal cannot find scene '${input.sceneId}'`)
    const runId = randomUUID()
    const model = this.options.modelRouter.findModel("scene_creation")
    const route = this.options.modelRouter.route("scene_creation")
    const modelRoute = route ? `${route.provider}/${route.model}` : model ? `${model.provider}/${model.id}` : "default"
    let captured: VisualRecipeProposal | undefined
    this.options.eventBus.publish({
      threadId: this.options.threadId,
      type: "subagent_start",
      payload: {
        runId,
        subagentType: "scene_creator",
        modelRoute,
        startedAt: new Date().toISOString(),
        description: "Propose one bounded Visual Program recipe for an approved capability gap",
      },
    })
    const session = await (this.options.createRecipeSession
      ? this.options.createRecipeSession((value) => (captured = value))
      : this.createDefaultRecipeSession(model, (value) => (captured = value)))
    const unsubscribe = session.subscribe(() => undefined)
    const abortHandler = () => void session.abort()
    if (signal?.aborted) abortHandler()
    else signal?.addEventListener("abort", abortHandler, { once: true })
    try {
      await session.prompt(
        [
          "Propose exactly one bounded Visual Recipe for the approved capability gap.",
          "Use inert Visual Program data only. Do not emit code, files, components, styles, or registry changes.",
          "## Approved scene",
          JSON.stringify(scene, null, 2),
          "## Approved generic capability gap",
          JSON.stringify(input.approvedGap, null, 2),
          "## Selected target contract",
          JSON.stringify(input.selectedTarget, null, 2),
          "## Exact Visual Program contract",
          JSON.stringify(VISUAL_PROGRAM_CONTRACT_SUMMARY, null, 2),
        ].join("\n"),
      )
      if (!captured)
        await session.prompt("Call submit_visual_recipe now with one complete proposal; do not answer with prose.")
      if (!captured) throw new Error("Scene composer finished without a Visual Recipe proposal")
      if (captured.sceneId !== input.sceneId) throw new Error("Visual Recipe proposal changed the target scene")
      let accepted = captured
      let template: VisualRecipeTemplate
      try {
        template = createVisualRecipeTemplate(accepted.template)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        captured = undefined
        await session.prompt(
          `The parent rejected the Visual Recipe: ${message}. Call submit_visual_recipe exactly once with a corrected proposal; do not answer with prose.`,
        )
        const corrected = captured as VisualRecipeProposal | undefined
        if (!corrected) throw new Error("Scene composer did not submit a corrected Visual Recipe")
        if (corrected.sceneId !== input.sceneId) throw new Error("Corrected Visual Recipe changed the target scene")
        accepted = corrected
        template = createVisualRecipeTemplate(accepted.template)
      }
      if (template.program.durationMs !== scene.durationInSeconds * 1000) {
        throw new Error("Visual Recipe duration must exactly match the approved scene duration")
      }
      const proposal = { ...accepted, template }
      this.options.eventBus.publish({
        threadId: this.options.threadId,
        type: "subagent_end",
        payload: {
          runId,
          subagentType: "scene_creator",
          modelRoute,
          result: proposal.summary,
          completedAt: new Date().toISOString(),
        },
      })
      return { runId, modelRoute, proposal }
    } catch (error) {
      this.options.eventBus.publish({
        threadId: this.options.threadId,
        type: "subagent_error",
        payload: {
          runId,
          subagentType: "scene_creator",
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

  private async createDefaultSession(
    model: Model<Api> | undefined,
    capture: (result: SceneCompositionResult) => void,
  ): Promise<SceneComposerSession> {
    const submit = defineTool({
      name: "submit_scene_composition",
      label: "Submit Scene Composition",
      description: "Return ordered reuse, declarative composition, or reusable capability-gap resolutions.",
      parameters: Type.Object({ result: ResultSchema }),
      async execute(_id, params) {
        capture(params.result as SceneCompositionResult)
        return {
          content: [{ type: "text" as const, text: "Scene composition accepted." }],
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
      systemPrompt: readFileSync(join(PROJECT_ROOT, "packages/agent-pi/resources/agents/scene-composer.md"), "utf-8"),
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

  private async createDefaultRecipeSession(
    model: Model<Api> | undefined,
    capture: (proposal: VisualRecipeProposal) => void,
  ): Promise<SceneComposerSession> {
    const submit = defineTool({
      name: "submit_visual_recipe",
      label: "Submit Visual Recipe",
      description: "Return one bounded inert Visual Program recipe proposal for the approved capability gap.",
      parameters: Type.Object({ proposal: RecipeProposalSchema }),
      async execute(_id, params) {
        capture(params.proposal as VisualRecipeProposal)
        return {
          content: [{ type: "text" as const, text: "Visual Recipe proposal accepted for parent validation." }],
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
      systemPrompt: readFileSync(
        join(PROJECT_ROOT, "packages/agent-pi/resources/agents/scene-composer-visual-recipe.md"),
        "utf-8",
      ),
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
