import { randomUUID } from "node:crypto"
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
import {
  buildProductionBriefArtifact,
  validateProductionBriefArtifact,
  validateProductionBriefCandidate,
  type ProductionBriefArtifact,
  type ProductionBriefCandidate,
  type ProductionBriefValidation,
} from "./productionBrief.js"

const BriefSourceSchema = StringEnum(["user", "human_review", "previous_artifact"] as const)
const ProvidedStringSchema = Type.Object({
  status: Type.Literal("provided"),
  value: Type.String(),
  source: BriefSourceSchema,
})
const AbsentSchema = Type.Object({ status: Type.Literal("explicitly_absent"), rationale: Type.String() })
const UnresolvedSchema = Type.Object({
  status: Type.Literal("unresolved"),
  question: Type.String(),
  rationale: Type.String(),
})
const StringInputSchema = Type.Union([ProvidedStringSchema, AbsentSchema, UnresolvedSchema])
const StringArrayInputSchema = Type.Union([
  Type.Object({ status: Type.Literal("provided"), value: Type.Array(Type.String()), source: BriefSourceSchema }),
  AbsentSchema,
  UnresolvedSchema,
])
const DimensionsInputSchema = Type.Union([
  Type.Object({
    status: Type.Literal("provided"),
    value: Type.Object({
      width: Type.Number({ exclusiveMinimum: 0 }),
      height: Type.Number({ exclusiveMinimum: 0 }),
      unit: Type.String(),
    }),
    source: BriefSourceSchema,
  }),
  AbsentSchema,
  UnresolvedSchema,
])
const DurationInputSchema = Type.Union([
  Type.Object({
    status: Type.Literal("provided"),
    value: Type.Union([
      Type.Object({ seconds: Type.Number({ exclusiveMinimum: 0 }) }),
      Type.Object({
        minSeconds: Type.Number({ exclusiveMinimum: 0 }),
        maxSeconds: Type.Number({ exclusiveMinimum: 0 }),
      }),
    ]),
    source: BriefSourceSchema,
  }),
  AbsentSchema,
  UnresolvedSchema,
])
const EvidenceInputSchema = Type.Union([
  Type.Object({
    status: Type.Literal("provided"),
    value: Type.Object({
      claims: Type.Array(Type.String()),
      sourceReferences: Type.Array(Type.String()),
      externalVerification: StringEnum(["required", "not_required"] as const),
    }),
    source: BriefSourceSchema,
  }),
  AbsentSchema,
  UnresolvedSchema,
])
const AudioPreferencesInputSchema = Type.Union([
  Type.Object({
    status: Type.Literal("provided"),
    value: Type.Object({
      voiceover: StringEnum(["required", "optional", "none"] as const),
      music: StringEnum(["required", "optional", "none"] as const),
      soundEffects: StringEnum(["required", "optional", "none"] as const),
      accessibilityNotes: Type.Array(Type.String()),
      notes: Type.Array(Type.String()),
    }),
    source: BriefSourceSchema,
  }),
  AbsentSchema,
  UnresolvedSchema,
])
const TargetRequirementsInputSchema = Type.Union([
  Type.Object({
    status: Type.Literal("provided"),
    value: Type.Array(Type.Object({ name: Type.String(), requirement: Type.String() })),
    source: BriefSourceSchema,
  }),
  AbsentSchema,
  UnresolvedSchema,
])
const BriefSchema = Type.Object({
  subject: StringInputSchema,
  objective: StringInputSchema,
  audience: StringInputSchema,
  language: StringInputSchema,
  platform: StringInputSchema,
  format: StringInputSchema,
  dimensions: DimensionsInputSchema,
  aspectRatio: StringInputSchema,
  duration: DurationInputSchema,
  brand: StringInputSchema,
  tone: StringInputSchema,
  evidence: EvidenceInputSchema,
  assets: StringArrayInputSchema,
  constraints: StringArrayInputSchema,
  audioPreferences: AudioPreferencesInputSchema,
  targetRequirements: TargetRequirementsInputSchema,
  acceptanceCriteria: StringArrayInputSchema,
  researchRequirement: Type.Union([
    Type.Object({
      status: Type.Literal("provided"),
      value: StringEnum(["required", "not_required"] as const),
      source: BriefSourceSchema,
    }),
    AbsentSchema,
    UnresolvedSchema,
  ]),
  researchRationale: StringInputSchema,
})

export interface IntakeSpecialistSession {
  subscribe(listener: (event: AgentSessionEvent) => void): () => void
  prompt(text: string): Promise<void>
  abort(): Promise<void>
  dispose(): void
}

export interface ProductionBriefIntakeRevision {
  feedback?: string
  previousArtifact?: ProductionBriefArtifact
}

export interface ProductionBriefIntakeResult {
  runId: string
  modelRoute: string
  artifact: ProductionBriefArtifact
  validation: ProductionBriefValidation
  status: "ready" | "needs_input"
}

export interface ProductionBriefIntakeRunnerOptions {
  threadId: string
  eventBus: ThreadEventBus
  modelRouter: ModelRouter
  authStorage: AuthStorage
  modelRegistry: ModelRegistry
  createSession?: (input: {
    captureBrief: (brief: ProductionBriefCandidate) => void
  }) => Promise<IntakeSpecialistSession>
}

function routeLabel(model: Model<Api> | undefined): string {
  return model ? `${model.provider}/${model.id}` : "default"
}

function loadIntakePrompt(): string {
  return readFileSync(join(PROJECT_ROOT, "packages/agent-pi/resources/agents/intake.md"), "utf-8")
}

export class ProductionBriefIntakeRunner {
  private readonly createSession: NonNullable<ProductionBriefIntakeRunnerOptions["createSession"]>

  constructor(private readonly options: ProductionBriefIntakeRunnerOptions) {
    this.createSession = options.createSession ?? ((input) => this.createDefaultSession(input))
  }

  async run(
    request: string,
    revision: ProductionBriefIntakeRevision = {},
    signal?: AbortSignal,
  ): Promise<ProductionBriefIntakeResult> {
    const runId = randomUUID()
    const model = this.options.modelRouter.findModel("intake")
    const configuredRoute = this.options.modelRouter.route("intake")
    const modelRoute = configuredRoute ? `${configuredRoute.provider}/${configuredRoute.model}` : routeLabel(model)
    const startedAt = new Date().toISOString()
    let capturedBrief: ProductionBriefCandidate | undefined
    let childError: string | undefined
    let session: IntakeSpecialistSession | undefined
    let unsubscribe: (() => void) | undefined
    let abortHandler: (() => void) | undefined

    this.options.eventBus.publish({
      threadId: this.options.threadId,
      type: "subagent_start",
      payload: {
        runId,
        subagentType: "intake",
        description: "Extract explicit production requirements without applying defaults",
        modelRoute,
        startedAt,
      },
    })

    try {
      session = await this.createSession({ captureBrief: (brief) => (capturedBrief = brief) })
      unsubscribe = session.subscribe((event) => {
        if (
          event.type === "message_end" &&
          event.message.role === "assistant" &&
          event.message.stopReason === "error"
        ) {
          childError = event.message.errorMessage ?? "Production intake specialist model request failed"
        }
        this.publishSessionUpdate(runId, event)
      })
      if (signal) {
        abortHandler = () => void session?.abort()
        if (signal.aborted) abortHandler()
        else signal.addEventListener("abort", abortHandler, { once: true })
      }

      await session.prompt(this.buildPrompt(request, revision))
      if (childError) throw new Error(childError)

      let captured = this.buildCaptured(capturedBrief)
      if (!captured.validation.valid) {
        const firstError = captured.validation.errors.join("; ")
        capturedBrief = undefined
        await session.prompt(
          `Parent validation rejected the production brief: ${firstError}. Call submit_production_brief exactly once with one corrected complete candidate; do not answer with prose.`,
        )
        if (childError) throw new Error(childError)
        captured = this.buildCaptured(capturedBrief)
        if (!captured.validation.valid) {
          throw new Error(`Production intake failed after one repair turn: ${captured.validation.errors.join("; ")}`)
        }
      }
      if (!captured.artifact) throw new Error("Production intake completed without a structured brief candidate")

      const result: ProductionBriefIntakeResult = {
        runId,
        modelRoute,
        artifact: captured.artifact,
        validation: captured.validation,
        status: captured.validation.ready ? "ready" : "needs_input",
      }
      this.options.eventBus.publish({
        threadId: this.options.threadId,
        type: "subagent_end",
        payload: {
          runId,
          subagentType: "intake",
          modelRoute,
          result: captured.validation.ready
            ? "Production brief is ready"
            : `Production brief needs input for ${captured.validation.unresolvedFields.join(", ")}`,
          startedAt,
          completedAt: new Date().toISOString(),
        },
      })
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.options.eventBus.publish({
        threadId: this.options.threadId,
        type: "subagent_error",
        payload: {
          runId,
          subagentType: "intake",
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

  private buildCaptured(brief: ProductionBriefCandidate | undefined): {
    artifact?: ProductionBriefArtifact
    validation: ProductionBriefValidation
  } {
    if (!brief) return { validation: validateProductionBriefCandidate(undefined) }
    const validation = validateProductionBriefCandidate(brief)
    if (!validation.valid) return { validation }
    const artifact = buildProductionBriefArtifact(brief)
    return { artifact, validation: validateProductionBriefArtifact(artifact) }
  }

  private buildPrompt(request: string, revision: ProductionBriefIntakeRevision): string {
    return [
      revision.feedback
        ? "Revise the previous production brief using the human feedback."
        : "Extract a production brief from the request.",
      "Do not infer, default, or silently complete any field.",
      "Represent missing required information as unresolved with one focused human question.",
      "Represent an intentionally omitted optional input as explicitly_absent with a rationale.",
      "Return one complete ProductionBrief candidate. The parent constructs the artifact metadata, research decision, unresolved fields, and human questions.",
      "",
      "## User request",
      request,
      revision.feedback ? `\n## Human feedback\n${revision.feedback}` : "",
      revision.previousArtifact
        ? `\n## Previous production brief\n${JSON.stringify(revision.previousArtifact, null, 2)}`
        : "",
    ].join("\n")
  }

  private async createDefaultSession({
    captureBrief,
  }: {
    captureBrief: (brief: ProductionBriefCandidate) => void
  }): Promise<IntakeSpecialistSession> {
    const model = this.options.modelRouter.findModel("intake")
    const thinkingLevel = this.options.modelRouter.thinkingLevel("intake")
    const submitBrief = defineTool({
      name: "submit_production_brief",
      label: "Submit Production Brief",
      description: "Return one complete ProductionBrief candidate to the parent runtime.",
      parameters: Type.Unsafe<ProductionBriefCandidate>(BriefSchema),
      async execute(_toolCallId, params) {
        captureBrief(params as ProductionBriefCandidate)
        return {
          content: [{ type: "text" as const, text: "Production brief captured for parent validation." }],
          details: { artifactType: "production_brief" },
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
      systemPrompt: loadIntakePrompt(),
    })
    const { session } = await createAgentSession({
      cwd: PROJECT_ROOT,
      model: model as Model<Api> | undefined,
      ...(thinkingLevel ? { thinkingLevel } : {}),
      authStorage: this.options.authStorage,
      modelRegistry: this.options.modelRegistry,
      resourceLoader,
      customTools: [submitBrief],
      tools: [submitBrief.name],
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
        subagentType: "intake",
        kind: event.type === "tool_execution_start" ? "tool_start" : "tool_end",
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        ...(event.type === "tool_execution_end" ? { isError: event.isError } : {}),
      },
    })
  }
}

export { BriefSchema as ProductionBriefSchema }
