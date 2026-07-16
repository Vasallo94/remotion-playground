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
import { Type } from "typebox"
import type { ThreadEventBus } from "./events.js"
import type { ModelRouter } from "./modelRouter.js"
import { PROJECT_ROOT } from "./paths.js"
import type { SceneCapabilityGap, SceneScriptDraft } from "./types.js"

const CatalogMetadataSchema = Type.Object({
  description: Type.String(),
  narrativeRoles: Type.Array(Type.String()),
  bestFor: Type.Array(Type.String()),
  avoidWhen: Type.Array(Type.String()),
  textLimits: Type.Object({ maxVisibleWords: Type.Number(), maxWordsPerSecond: Type.Number() }),
  durationRange: Type.Tuple([Type.Number(), Type.Number()]),
  recommendedBeats: Type.Number(),
  placement: Type.Array(Type.String()),
  exampleUse: Type.String(),
})

const CandidateSchema = Type.Object({
  componentId: Type.String(),
  exportName: Type.String(),
  source: Type.String(),
  exampleProps: Type.Record(Type.String(), Type.Any()),
  sceneProps: Type.Record(Type.String(), Type.Record(Type.String(), Type.Any())),
  propContract: Type.String(),
  visualReadyMs: Type.Number(),
  catalog: CatalogMetadataSchema,
})

export interface ExecutableSceneCandidateDraft {
  componentId: string
  exportName: string
  source: string
  exampleProps: Record<string, unknown>
  sceneProps: Record<string, Record<string, unknown>>
  propContract: string
  visualReadyMs: number
  catalog: {
    description: string
    narrativeRoles: string[]
    bestFor: string[]
    avoidWhen: string[]
    textLimits: { maxVisibleWords: number; maxWordsPerSecond: number }
    durationRange: [number, number]
    recommendedBeats: number
    placement: string[]
    exampleUse: string
  }
}

export interface ExecutableSceneCandidateSession {
  subscribe(listener: (event: AgentSessionEvent) => void): () => void
  prompt(text: string): Promise<void>
  abort(): Promise<void>
  dispose(): void
}

export interface ExecutableSceneCandidateInput {
  proposalId: string
  gap: SceneCapabilityGap
  affectedScenes: SceneScriptDraft[]
  selectedTarget: Record<string, unknown>
  destinationPath: string
  policy: Record<string, unknown>
}

function validateDraftShape(draft: ExecutableSceneCandidateDraft): string[] {
  const errors: string[] = []
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.componentId)) errors.push("componentId must be kebab-case")
  if (!/^[A-Z][A-Za-z0-9]*Scene$/.test(draft.exportName)) errors.push("exportName must be PascalCase ending in Scene")
  if (!draft.source.trim() || draft.source.includes("```"))
    errors.push("source must be complete TSX without Markdown fences")
  if (!draft.propContract.trim()) errors.push("propContract is required")
  if (!Number.isInteger(draft.visualReadyMs) || draft.visualReadyMs < 0 || draft.visualReadyMs > 30_000)
    errors.push("visualReadyMs must be an integer between 0 and 30000")
  if (Object.keys(draft.exampleProps).length === 0) errors.push("exampleProps must be non-empty")
  if (Object.keys(draft.sceneProps).length === 0) errors.push("sceneProps must be non-empty")
  return errors
}

export class ExecutableSceneCandidateRunner {
  constructor(
    private readonly options: {
      threadId: string
      eventBus: ThreadEventBus
      modelRouter: ModelRouter
      authStorage: AuthStorage
      modelRegistry: ModelRegistry
      createSession?: (
        capture: (draft: ExecutableSceneCandidateDraft) => void,
      ) => Promise<ExecutableSceneCandidateSession>
    },
  ) {}

  async run(
    input: ExecutableSceneCandidateInput,
    validate: (draft: ExecutableSceneCandidateDraft) => Promise<string[]> | string[],
    signal?: AbortSignal,
  ): Promise<{ runId: string; modelRoute: string; draft: ExecutableSceneCandidateDraft }> {
    const runId = randomUUID()
    const model = this.options.modelRouter.findModel("scene_creation")
    const route = this.options.modelRouter.route("scene_creation")
    const modelRoute = route ? `${route.provider}/${route.model}` : model ? `${model.provider}/${model.id}` : "default"
    let captured: ExecutableSceneCandidateDraft | undefined
    this.options.eventBus.publish({
      threadId: this.options.threadId,
      type: "subagent_start",
      payload: {
        runId,
        subagentType: "executable_scene_candidate",
        modelRoute,
        startedAt: new Date().toISOString(),
        description: "Create one quarantined reusable scene candidate",
      },
    })
    const session = await (this.options.createSession
      ? this.options.createSession((draft) => (captured = draft))
      : this.createDefaultSession(model, (draft) => (captured = draft)))
    const unsubscribe = session.subscribe(() => undefined)
    const abortHandler = () => void session.abort()
    if (signal?.aborted) abortHandler()
    else signal?.addEventListener("abort", abortHandler, { once: true })
    try {
      const prompt = [
        "Create the reusable executable scene candidate for this approved capability.",
        `## Proposal id\n${input.proposalId}`,
        `## Capability gap\n${JSON.stringify(input.gap, null, 2)}`,
        `## Affected approved scene requirements\n${JSON.stringify(input.affectedScenes, null, 2)}`,
        `## Selected target\n${JSON.stringify(input.selectedTarget, null, 2)}`,
        `## Exact destination path\n${input.destinationPath}`,
        `## Enforced policy\n${JSON.stringify(input.policy, null, 2)}`,
      ].join("\n")
      await session.prompt(prompt)
      for (let attempt = 0; attempt < 2; attempt += 1) {
        if (!captured) {
          await session.prompt(
            "Call submit_executable_scene_candidate now with the complete candidate; do not answer with prose.",
          )
        }
        if (!captured) throw new Error("Executable scene specialist finished without structured output")
        const requiredSceneIds = input.affectedScenes.map((scene) => scene.id)
        const scenePropErrors = requiredSceneIds
          .filter((sceneId) => !captured?.sceneProps[sceneId])
          .map((sceneId) => `sceneProps must include '${sceneId}'`)
        const extraScenePropErrors = Object.keys(captured.sceneProps)
          .filter((sceneId) => !requiredSceneIds.includes(sceneId))
          .map((sceneId) => `sceneProps contains unexpected scene '${sceneId}'`)
        const errors = [
          ...validateDraftShape(captured),
          ...scenePropErrors,
          ...extraScenePropErrors,
          ...(await validate(captured)),
        ]
        if (errors.length === 0) {
          this.options.eventBus.publish({
            threadId: this.options.threadId,
            type: "subagent_end",
            payload: {
              runId,
              subagentType: "executable_scene_candidate",
              modelRoute,
              result: `Candidate ${captured.componentId} accepted for quarantine evidence`,
              completedAt: new Date().toISOString(),
            },
          })
          return { runId, modelRoute, draft: captured }
        }
        if (attempt === 1) throw new Error(`Executable scene candidate failed validation: ${errors.join("; ")}`)
        captured = undefined
        await session.prompt(
          `The parent rejected the candidate:\n- ${errors.join("\n- ")}\nCorrect these exact failures and call submit_executable_scene_candidate again with the complete candidate.`,
        )
      }
      throw new Error("Executable scene candidate exhausted validation attempts")
    } catch (error) {
      this.options.eventBus.publish({
        threadId: this.options.threadId,
        type: "subagent_error",
        payload: {
          runId,
          subagentType: "executable_scene_candidate",
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
    capture: (draft: ExecutableSceneCandidateDraft) => void,
  ): Promise<ExecutableSceneCandidateSession> {
    const submit = defineTool({
      name: "submit_executable_scene_candidate",
      label: "Submit Executable Scene Candidate",
      description: "Return one bounded reusable TSX scene candidate and its generic metadata.",
      parameters: Type.Object({ candidate: CandidateSchema }),
      async execute(_id, params) {
        capture(params.candidate as ExecutableSceneCandidateDraft)
        return { content: [{ type: "text" as const, text: "Candidate received for parent validation." }], details: {} }
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
        join(PROJECT_ROOT, "packages/agent-pi/resources/agents/executable-scene-candidate.md"),
        "utf8",
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
