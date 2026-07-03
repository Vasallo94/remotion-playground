import {
  AuthStorage,
  createAgentSession,
  createExtensionRuntime,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type AgentSessionEvent,
  type ResourceLoader,
} from "@earendil-works/pi-coding-agent"
import type { Api, Model } from "@earendil-works/pi-ai/compat"
import { createClaquetaTools } from "./tools.js"
import { ThreadEventBus, normalizePiEvent } from "./events.js"
import { ModelRouter } from "./modelRouter.js"
import { CLAQUETA_PI_SYSTEM_PROMPT, checkpointResumePrompt } from "./prompt.js"
import { AgentPiStore } from "./store.js"
import { PROJECT_ROOT } from "./paths.js"
import { nextDraftFileName, scriptToMarkdown, writeJsonArtifact, writeTextArtifact } from "./artifacts.js"
import type { ScriptDraft } from "./types.js"

export interface AgentRuntimeOptions {
  cwd?: string
  agentDir?: string
  renderServiceUrl?: string
  store?: AgentPiStore
  eventBus?: ThreadEventBus
  modelRouter?: ModelRouter
}

interface ManagedSession {
  session: AgentSession
  unsubscribe: () => void
}

function isScriptDraft(value: unknown): value is ScriptDraft {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const draft = value as Partial<ScriptDraft>
  return typeof draft.title === "string" && typeof draft.objective === "string" && Array.isArray(draft.scenes)
}

function createClaquetaResourceLoader(): ResourceLoader {
  return {
    getExtensions: () => ({ extensions: [], errors: [], runtime: createExtensionRuntime() }),
    getSkills: () => ({ skills: [], diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => CLAQUETA_PI_SYSTEM_PROMPT,
    getAppendSystemPrompt: () => [],
    extendResources: () => {},
    reload: async () => {},
  }
}

export class AgentRuntimeManager {
  readonly cwd: string
  readonly agentDir: string | undefined
  readonly renderServiceUrl: string
  readonly store: AgentPiStore
  readonly eventBus: ThreadEventBus
  readonly modelRouter: ModelRouter
  readonly authStorage: AuthStorage
  readonly modelRegistry: ModelRegistry
  private sessions = new Map<string, ManagedSession>()

  constructor(options: AgentRuntimeOptions = {}) {
    this.cwd = options.cwd ?? PROJECT_ROOT
    this.agentDir = options.agentDir
    this.renderServiceUrl = options.renderServiceUrl ?? process.env.RENDER_URL ?? "http://127.0.0.1:3100"
    this.store = options.store ?? new AgentPiStore()
    this.eventBus = options.eventBus ?? new ThreadEventBus(this.store)
    this.modelRouter = options.modelRouter ?? new ModelRouter()
    this.authStorage = this.modelRouter.authStorage
    this.modelRegistry = this.modelRouter.modelRegistry
  }

  async getOrCreateThread(threadId?: string | null, title?: string): Promise<string> {
    if (threadId) {
      const existing = this.store.getThread(threadId)
      if (!existing) throw new Error(`Unknown thread: ${threadId}`)
      return existing.id
    }
    return this.store.createThread({ title: title?.slice(0, 80) ?? null }).id
  }

  async getOrCreateSession(threadId: string): Promise<AgentSession> {
    const current = this.sessions.get(threadId)
    if (current) return current.session

    const thread = this.store.getThread(threadId)
    if (!thread) throw new Error(`Unknown thread: ${threadId}`)

    const sessionManager = thread.piSessionFile
      ? SessionManager.open(thread.piSessionFile)
      : SessionManager.create(this.cwd)
    const tools = createClaquetaTools({
      threadId,
      store: this.store,
      eventBus: this.eventBus,
      renderServiceUrl: this.renderServiceUrl,
    })
    const toolNames = tools.map((tool) => tool.name)
    const model = this.modelRouter.findModel("main")
    const thinkingLevel = this.modelRouter.thinkingLevel("main")

    const { session } = await createAgentSession({
      cwd: this.cwd,
      ...(this.agentDir ? { agentDir: this.agentDir } : {}),
      model: model as Model<Api> | undefined,
      ...(thinkingLevel ? { thinkingLevel } : {}),
      authStorage: this.authStorage,
      modelRegistry: this.modelRegistry,
      resourceLoader: createClaquetaResourceLoader(),
      customTools: tools,
      tools: toolNames,
      sessionManager,
      settingsManager: SettingsManager.inMemory({
        compaction: { enabled: true },
        retry: { enabled: true, maxRetries: 1 },
      }),
    })

    this.store.updatePiSession(threadId, session.sessionId, session.sessionFile)
    const unsubscribe = session.subscribe((event) => this.handleSessionEvent(threadId, event))
    this.sessions.set(threadId, { session, unsubscribe })
    return session
  }

  async sendMessage(threadId: string, message: string, options: { displayUserMessage?: boolean } = {}): Promise<void> {
    const session = await this.getOrCreateSession(threadId)
    this.store.updateThreadStatus(threadId, "running")
    if (options.displayUserMessage !== false) {
      this.eventBus.publish({ threadId, type: "message_delta", payload: { role: "user", delta: message } })
    }
    try {
      await session.prompt(message, session.isStreaming ? { streamingBehavior: "followUp" } : undefined)
      const thread = this.store.getThread(threadId)
      if (thread?.status === "running") this.store.updateThreadStatus(threadId, "idle")
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.store.updateThreadStatus(threadId, "error")
      this.eventBus.publish({ threadId, type: "error", payload: { recoverable: false, message } })
      throw error
    }
  }

  async resumeCheckpoint(threadId: string, decision: Record<string, unknown>): Promise<void> {
    const thread = this.store.getThread(threadId)
    if (!thread?.checkpoint) throw new Error(`Thread has no pending checkpoint: ${threadId}`)
    if (decision.approved === true && thread.checkpoint.artifactId) {
      this.store.markArtifactApproved(thread.checkpoint.artifactId)
    }
    if (decision.approved === true && thread.checkpoint.type === "script_checkpoint") {
      const script = decision.script
      if (isScriptDraft(script)) {
        const artifact = writeJsonArtifact(
          this.store,
          threadId,
          "script",
          nextDraftFileName(this.store, threadId, "script"),
          script,
          true,
        )
        const markdown = writeTextArtifact(
          this.store,
          threadId,
          "script_markdown",
          nextDraftFileName(this.store, threadId, "script_markdown", "md"),
          scriptToMarkdown(script),
          true,
        )
        this.eventBus.publish({
          threadId,
          type: "artifact_updated",
          payload: { kind: "script", artifact, markdownPath: markdown.path, approved: true },
        })
      }
    }
    this.store.clearCheckpoint(threadId, "running")
    this.eventBus.publish({
      threadId,
      type: "artifact_updated",
      payload: { kind: "checkpoint_decision", checkpoint: thread.checkpoint, decision },
    })
    await this.sendMessage(threadId, checkpointResumePrompt(decision), { displayUserMessage: false })
  }

  dispose(): void {
    for (const managed of this.sessions.values()) {
      managed.unsubscribe()
      managed.session.dispose()
    }
    this.sessions.clear()
  }

  private handleSessionEvent(threadId: string, event: AgentSessionEvent): void {
    const normalized = normalizePiEvent(event)
    if (!normalized) return
    this.eventBus.publish({ threadId, type: normalized.type, payload: normalized.payload })
  }
}
