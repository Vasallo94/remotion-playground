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
import { fetchPublicText, searchPublicWeb } from "./publicWeb.js"
import type { ResearchBrief } from "./types.js"

const MAX_RESEARCH_CALLS = 4

export class ResearchCallBudget {
  private used = 0

  constructor(private readonly limit = MAX_RESEARCH_CALLS) {}

  consume(): void {
    this.used += 1
    if (this.used > this.limit) throw new Error(`Research web-call limit exceeded (${this.limit})`)
  }
}

const ResearchClaimSchema = Type.Object({
  claim: Type.String(),
  sourceUrls: Type.Array(Type.String(), { minItems: 1 }),
  confidence: StringEnum(["high", "medium", "low"] as const),
})

const ResearchBriefSchema = Type.Object({
  topic: Type.String(),
  objective: Type.String(),
  summary: Type.String(),
  keyConcepts: Type.Array(Type.String()),
  claims: Type.Array(ResearchClaimSchema),
  examples: Type.Array(Type.String()),
  unknowns: Type.Array(Type.String()),
  sourceUrls: Type.Array(Type.String()),
})

export interface ResearchSpecialistInput {
  request: string
  subject: string
  objective: string
  language?: string
  sourceUrls?: string[]
  constraints?: string[]
}

export interface ResearchSpecialistSession {
  subscribe(listener: (event: AgentSessionEvent) => void): () => void
  prompt(text: string): Promise<void>
  abort(): Promise<void>
  dispose(): void
}

export interface ResearchSpecialistResult {
  runId: string
  modelRoute: string
  research: ResearchBrief
}

export interface ResearchSpecialistRunnerOptions {
  threadId: string
  eventBus: ThreadEventBus
  modelRouter: ModelRouter
  authStorage: AuthStorage
  modelRegistry: ModelRegistry
  createSession?: (input: { captureResearch: (research: ResearchBrief) => void }) => Promise<ResearchSpecialistSession>
}

function routeLabel(model: Model<Api> | undefined): string {
  return model ? `${model.provider}/${model.id}` : "default"
}

function loadResearcherPrompt(): string {
  return readFileSync(join(PROJECT_ROOT, "packages/agent-pi/resources/agents/researcher.md"), "utf-8")
}

function normalizeResearchBrief(research: ResearchBrief): ResearchBrief {
  const citedUrls = research.claims.flatMap((claim) => claim.sourceUrls)
  const sourceUrls = [...new Set([...research.sourceUrls, ...citedUrls])]
  for (const url of sourceUrls) {
    const parsed = new URL(url)
    if (parsed.protocol !== "https:") throw new Error("Research citations must use HTTPS source URLs")
  }
  return { ...research, sourceUrls }
}

export class ResearchSpecialistRunner {
  private readonly createSession: NonNullable<ResearchSpecialistRunnerOptions["createSession"]>

  constructor(private readonly options: ResearchSpecialistRunnerOptions) {
    this.createSession = options.createSession ?? ((input) => this.createDefaultSession(input))
  }

  async run(input: ResearchSpecialistInput, signal?: AbortSignal): Promise<ResearchSpecialistResult> {
    const runId = randomUUID()
    const model = this.options.modelRouter.findModel("research")
    const configuredRoute = this.options.modelRouter.route("research")
    const modelRoute = configuredRoute ? `${configuredRoute.provider}/${configuredRoute.model}` : routeLabel(model)
    const startedAt = new Date().toISOString()
    let capturedResearch: ResearchBrief | undefined
    let childError: string | undefined
    let session: ResearchSpecialistSession | undefined
    let unsubscribe: (() => void) | undefined
    let abortHandler: (() => void) | undefined

    this.options.eventBus.publish({
      threadId: this.options.threadId,
      type: "subagent_start",
      payload: {
        runId,
        subagentType: "researcher",
        description: "Gather cited evidence for the explicit video objective",
        modelRoute,
        startedAt,
      },
    })

    try {
      session = await this.createSession({ captureResearch: (research) => (capturedResearch = research) })
      unsubscribe = session.subscribe((event) => {
        if (
          event.type === "message_end" &&
          event.message.role === "assistant" &&
          event.message.stopReason === "error"
        ) {
          childError = event.message.errorMessage ?? "Research specialist model request failed"
        }
        this.publishSessionUpdate(runId, event)
      })
      if (signal) {
        abortHandler = () => void session?.abort()
        if (signal.aborted) abortHandler()
        else signal.addEventListener("abort", abortHandler, { once: true })
      }

      await session.prompt(
        [
          "Research only the supplied objective and return a cited factual brief.",
          "",
          "## Original request",
          input.request,
          "",
          "## Research assignment",
          JSON.stringify(
            {
              subject: input.subject,
              objective: input.objective,
              language: input.language ?? "es-ES",
              sourceUrls: input.sourceUrls ?? [],
              constraints: input.constraints ?? [],
            },
            null,
            2,
          ),
        ].join("\n"),
      )
      if (childError) throw new Error(childError)
      if (!capturedResearch) {
        await session.prompt(
          "Your previous turn did not satisfy the output contract. Call submit_research exactly once now with the complete cited brief; do not answer with prose.",
        )
        if (childError) throw new Error(childError)
      }
      if (!capturedResearch) {
        throw new Error("Research specialist finished without calling submit_research after one repair attempt")
      }

      const research = normalizeResearchBrief(capturedResearch)
      const completedAt = new Date().toISOString()
      this.options.eventBus.publish({
        threadId: this.options.threadId,
        type: "subagent_end",
        payload: {
          runId,
          subagentType: "researcher",
          modelRoute,
          result: `Research brief completed with ${research.claims.length} cited claims`,
          startedAt,
          completedAt,
        },
      })
      return { runId, modelRoute, research }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.options.eventBus.publish({
        threadId: this.options.threadId,
        type: "subagent_error",
        payload: {
          runId,
          subagentType: "researcher",
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
    captureResearch,
  }: {
    captureResearch: (research: ResearchBrief) => void
  }): Promise<ResearchSpecialistSession> {
    const model = this.options.modelRouter.findModel("research")
    const thinkingLevel = this.options.modelRouter.thinkingLevel("research")
    const callBudget = new ResearchCallBudget()
    const webSearch = defineTool({
      name: "web_search",
      label: "Web Search",
      description: "Search the public web through capped DuckDuckGo Instant Answers. Returns at most five results.",
      parameters: Type.Object({ query: Type.String() }),
      async execute(_toolCallId, params, signal) {
        callBudget.consume()
        const results = await searchPublicWeb(params.query, signal)
        return {
          content: [
            { type: "text" as const, text: results.length ? JSON.stringify(results, null, 2) : "No results found." },
          ],
          details: { results },
        }
      },
    })
    const webFetch = defineTool({
      name: "web_fetch",
      label: "Web Fetch",
      description:
        "Fetch capped text from a validated public HTTPS URL. Private/local targets and unsafe redirects fail.",
      parameters: Type.Object({ url: Type.String() }),
      async execute(_toolCallId, params, signal) {
        callBudget.consume()
        const result = await fetchPublicText(params.url, { signal })
        return {
          content: [
            {
              type: "text" as const,
              text: `Source: ${result.url}\nContent-Type: ${result.contentType}\nTruncated: ${result.truncated}\n\n${result.text}`,
            },
          ],
          details: { url: result.url, contentType: result.contentType, truncated: result.truncated },
        }
      },
    })
    const submitResearch = defineTool({
      name: "submit_research",
      label: "Submit Research",
      description: "Return the complete cited research brief to the parent Claqueta runtime.",
      parameters: Type.Object({ research: ResearchBriefSchema }),
      async execute(_toolCallId, params) {
        captureResearch(params.research as ResearchBrief)
        return {
          content: [{ type: "text" as const, text: "Research brief accepted." }],
          details: { claimCount: params.research.claims.length, sourceCount: params.research.sourceUrls.length },
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
      systemPrompt: loadResearcherPrompt(),
    })
    const { session } = await createAgentSession({
      cwd: PROJECT_ROOT,
      model: model as Model<Api> | undefined,
      ...(thinkingLevel ? { thinkingLevel } : {}),
      authStorage: this.options.authStorage,
      modelRegistry: this.options.modelRegistry,
      resourceLoader,
      customTools: [webSearch, webFetch, submitResearch],
      tools: [webSearch.name, webFetch.name, submitResearch.name],
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
        subagentType: "researcher",
        kind: event.type === "tool_execution_start" ? "tool_start" : "tool_end",
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        ...(event.type === "tool_execution_end" ? { isError: event.isError } : {}),
      },
    })
  }
}
