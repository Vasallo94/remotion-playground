import { randomUUID } from "node:crypto"
import { readFileSync, readdirSync } from "node:fs"
import { extname, join, parse } from "node:path"
import { type Api, type Model } from "@earendil-works/pi-ai/compat"
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
import type { AudioChart, DirectionDraft, ScriptDraft } from "./types.js"

export const GEMINI_VOICE_IDS = [
  "Orus",
  "Kore",
  "Puck",
  "Charon",
  "Leda",
  "Zephyr",
  "Aoede",
  "Fenrir",
  "Achernar",
  "Algieba",
  "Autonoe",
  "Callirrhoe",
  "Despina",
  "Erinome",
  "Gacrux",
  "Iapetus",
  "Keid",
  "Laomedeia",
  "Pulcherrima",
  "Rasalgethi",
  "Sadachbia",
  "Sadaltager",
  "Schedar",
  "Sulafat",
  "Umbriel",
  "Vindemiatrix",
  "Enceladus",
  "Thalassa",
  "Proteus",
  "Dione",
] as const

export interface AudioLibraryEntry {
  id: string
  kind: "music" | "sfx"
  relativePath: string
}

const SpeakerSchema = Type.Object({ name: Type.String(), voiceId: Type.String() })
const VoiceoverSchema = Type.Object({
  enabled: Type.Literal(true),
  provider: Type.Literal("gemini"),
  language: Type.String(),
  voiceId: Type.Optional(Type.String()),
  speakers: Type.Optional(Type.Array(SpeakerSchema, { minItems: 2, maxItems: 2 })),
  scenes: Type.Record(Type.String(), Type.String()),
})
const MusicBedSchema = Type.Object({
  libraryId: Type.String(),
  volume: Type.Number({ minimum: -60, maximum: 0 }),
  duckingVolume: Type.Number({ minimum: -60, maximum: 0 }),
  fadeInMs: Type.Number({ minimum: 0, maximum: 10_000 }),
  fadeOutMs: Type.Number({ minimum: 0, maximum: 10_000 }),
  duckingFadeMs: Type.Number({ minimum: 0, maximum: 5_000 }),
})
const AudioChartSchema = Type.Object({
  voiceover: Type.Union([Type.Null(), VoiceoverSchema]),
  soundDesign: Type.Object({
    enabled: Type.Boolean(),
    musicBed: Type.Union([Type.Null(), MusicBedSchema]),
    sfx: Type.Array(Type.Record(Type.String(), Type.Any()), { maxItems: 0 }),
  }),
  warnings: Type.Array(Type.String()),
})

export function listAudioLibrary(root = PROJECT_ROOT): AudioLibraryEntry[] {
  const libraryDir = join(root, "public/audio/library")
  try {
    return readdirSync(libraryDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === ".mp3")
      .map((entry) => {
        const id = parse(entry.name).name
        return {
          id,
          kind: id.startsWith("sfx-") ? ("sfx" as const) : ("music" as const),
          relativePath: `public/audio/library/${entry.name}`,
        }
      })
      .sort((a, b) => a.id.localeCompare(b.id))
  } catch {
    return []
  }
}

function assertKnownVoice(voiceId: string): void {
  if (!(GEMINI_VOICE_IDS as readonly string[]).includes(voiceId)) {
    throw new Error(`Unknown Gemini voiceId '${voiceId}'`)
  }
}

export function validateAudioChart(chart: AudioChart, sceneCount: number, library: AudioLibraryEntry[]): AudioChart {
  const voiceover = chart.voiceover
  if (voiceover) {
    const hasVoice = typeof voiceover.voiceId === "string" && voiceover.voiceId.length > 0
    const hasSpeakers = Array.isArray(voiceover.speakers)
    if (hasVoice === hasSpeakers) {
      throw new Error("Voiceover must define either one voiceId or exactly two speakers")
    }
    if (hasVoice) assertKnownVoice(voiceover.voiceId!)
    if (hasSpeakers) {
      const speakers = voiceover.speakers!
      if (speakers.length !== 2) throw new Error("Multi-speaker voiceover requires exactly two speakers")
      if (new Set(speakers.map((speaker) => speaker.name)).size !== 2) {
        throw new Error("Multi-speaker names must be distinct")
      }
      if (new Set(speakers.map((speaker) => speaker.voiceId)).size !== 2) {
        throw new Error("Multi-speaker voice ids must be distinct")
      }
      speakers.forEach((speaker) => assertKnownVoice(speaker.voiceId))
      const names = new Set(speakers.map((speaker) => speaker.name))
      for (const text of Object.values(voiceover.scenes)) {
        for (const line of text.split("\n").filter(Boolean)) {
          const name = line.split(":", 1)[0]?.trim()
          if (!name || !names.has(name)) throw new Error(`Dialogue line uses unknown speaker '${name || "(missing)"}'`)
        }
      }
    }
    for (const key of Object.keys(voiceover.scenes)) {
      if (!/^\d+$/.test(key) || Number(key) < 0 || Number(key) >= sceneCount) {
        throw new Error(`Voiceover scene key '${key}' does not map to an approved script scene`)
      }
    }
  }

  if (!chart.soundDesign.enabled && chart.soundDesign.musicBed) {
    throw new Error("Disabled sound design cannot define a music bed")
  }
  if (chart.soundDesign.sfx.length > 0) {
    throw new Error("Pi audio planning does not yet support SFX assets")
  }
  const musicBed = chart.soundDesign.musicBed
  if (musicBed) {
    const musicIds = new Set(library.filter((entry) => entry.kind === "music").map((entry) => entry.id))
    if (!musicIds.has(musicBed.libraryId)) throw new Error(`Unknown music libraryId '${musicBed.libraryId}'`)
    if (musicBed.duckingVolume > musicBed.volume) {
      throw new Error("Music duckingVolume must not be louder than normal volume")
    }
  }
  return chart
}

export interface AudioPlannerPreferences {
  language?: string
  voiceover?: "required" | "optional" | "none"
  soundDesign?: "required" | "optional" | "none"
  notes?: string[]
  /** Exactly one parent-selected target summary. */
  selectedTarget?: Record<string, unknown>
}

export interface AudioPlannerRevisionContext {
  feedback?: string
  previousChart?: AudioChart
}

export interface AudioPlannerSession {
  subscribe(listener: (event: AgentSessionEvent) => void): () => void
  prompt(text: string): Promise<void>
  abort(): Promise<void>
  dispose(): void
}

export interface AudioPlannerResult {
  runId: string
  modelRoute: string
  chart: AudioChart
  library: AudioLibraryEntry[]
}

export interface AudioPlannerRunnerOptions {
  threadId: string
  eventBus: ThreadEventBus
  modelRouter: ModelRouter
  authStorage: AuthStorage
  modelRegistry: ModelRegistry
  createSession?: (input: { captureChart: (chart: AudioChart) => void }) => Promise<AudioPlannerSession>
}

function routeLabel(model: Model<Api> | undefined): string {
  return model ? `${model.provider}/${model.id}` : "default"
}

function loadPrompt(): string {
  return readFileSync(join(PROJECT_ROOT, "packages/agent-pi/resources/agents/audio-planner.md"), "utf-8")
}

export class AudioPlannerRunner {
  private readonly createSession: NonNullable<AudioPlannerRunnerOptions["createSession"]>

  constructor(private readonly options: AudioPlannerRunnerOptions) {
    this.createSession = options.createSession ?? ((input) => this.createDefaultSession(input))
  }

  async run(
    script: ScriptDraft,
    direction: DirectionDraft,
    preferences: AudioPlannerPreferences = {},
    revision: AudioPlannerRevisionContext = {},
    signal?: AbortSignal,
  ): Promise<AudioPlannerResult> {
    const runId = randomUUID()
    const model = this.options.modelRouter.findModel("audio_plan")
    const configuredRoute = this.options.modelRouter.route("audio_plan")
    const modelRoute = configuredRoute ? `${configuredRoute.provider}/${configuredRoute.model}` : routeLabel(model)
    const library = listAudioLibrary()
    const startedAt = new Date().toISOString()
    let capturedChart: AudioChart | undefined
    let childError: string | undefined
    let session: AudioPlannerSession | undefined
    let unsubscribe: (() => void) | undefined
    let abortHandler: (() => void) | undefined

    this.options.eventBus.publish({
      threadId: this.options.threadId,
      type: "subagent_start",
      payload: {
        runId,
        subagentType: "audio_planner",
        description: "Plan a topic-neutral voice and sound chart from approved artifacts",
        modelRoute,
        startedAt,
      },
    })

    try {
      session = await this.createSession({ captureChart: (chart) => (capturedChart = chart) })
      unsubscribe = session.subscribe((event) => {
        if (
          event.type === "message_end" &&
          event.message.role === "assistant" &&
          event.message.stopReason === "error"
        ) {
          childError = event.message.errorMessage ?? "Audio planner model request failed"
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
          revision.feedback
            ? "Revise the previous audio chart using the human feedback."
            : "Create a complete audio chart from the approved artifacts and explicit preferences.",
          "",
          "## Approved script",
          JSON.stringify(script, null, 2),
          "",
          "## Approved direction",
          JSON.stringify(direction, null, 2),
          "",
          "## Audio preferences",
          JSON.stringify(preferences, null, 2),
          revision.feedback ? `\n## Human feedback\n${revision.feedback}` : "",
          revision.previousChart ? `\n## Previous chart\n${JSON.stringify(revision.previousChart, null, 2)}` : "",
          "",
          "## Supported Gemini voices",
          JSON.stringify(GEMINI_VOICE_IDS),
          "",
          "## Actual local audio library",
          JSON.stringify(library, null, 2),
        ].join("\n"),
      )
      if (childError) throw new Error(childError)
      if (!capturedChart) {
        await session.prompt(
          "Your previous turn did not satisfy the output contract. Call submit_audio_chart exactly once now with the complete chart; do not answer with prose.",
        )
        if (childError) throw new Error(childError)
      }
      if (!capturedChart) {
        throw new Error("Audio planner finished without calling submit_audio_chart after one repair attempt")
      }

      let chart: AudioChart
      try {
        chart = validateAudioChart(capturedChart, script.scenes.length, library)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        capturedChart = undefined
        await session.prompt(
          `The parent rejected the audio chart: ${message}. Call submit_audio_chart exactly once with a corrected complete chart; do not answer with prose.`,
        )
        if (childError) throw new Error(childError)
        if (!capturedChart) throw new Error("Audio planner did not submit a corrected chart")
        chart = validateAudioChart(capturedChart, script.scenes.length, library)
      }
      const completedAt = new Date().toISOString()
      this.options.eventBus.publish({
        threadId: this.options.threadId,
        type: "subagent_end",
        payload: {
          runId,
          subagentType: "audio_planner",
          modelRoute,
          result: `Audio chart completed with ${Object.keys(chart.voiceover?.scenes ?? {}).length} narrated scenes`,
          startedAt,
          completedAt,
        },
      })
      return { runId, modelRoute, chart, library }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.options.eventBus.publish({
        threadId: this.options.threadId,
        type: "subagent_error",
        payload: {
          runId,
          subagentType: "audio_planner",
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
    captureChart,
  }: {
    captureChart: (chart: AudioChart) => void
  }): Promise<AudioPlannerSession> {
    const model = this.options.modelRouter.findModel("audio_plan")
    const thinkingLevel = this.options.modelRouter.thinkingLevel("audio_plan")
    const submitChart = defineTool({
      name: "submit_audio_chart",
      label: "Submit Audio Chart",
      description: "Return the complete structured audio chart to the parent Claqueta runtime.",
      parameters: Type.Object({ chart: AudioChartSchema }),
      async execute(_toolCallId, params) {
        captureChart(params.chart as AudioChart)
        return {
          content: [{ type: "text" as const, text: "Audio chart accepted." }],
          details: { narratedSceneCount: Object.keys(params.chart.voiceover?.scenes ?? {}).length },
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
      systemPrompt: loadPrompt(),
    })
    const { session } = await createAgentSession({
      cwd: PROJECT_ROOT,
      model: model as Model<Api> | undefined,
      ...(thinkingLevel ? { thinkingLevel } : {}),
      authStorage: this.options.authStorage,
      modelRegistry: this.options.modelRegistry,
      resourceLoader,
      customTools: [submitChart],
      tools: [submitChart.name],
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
        subagentType: "audio_planner",
        kind: event.type === "tool_execution_start" ? "tool_start" : "tool_end",
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        ...(event.type === "tool_execution_end" ? { isError: event.isError } : {}),
      },
    })
  }
}
