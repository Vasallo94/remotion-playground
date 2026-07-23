import { randomUUID } from "node:crypto"
import { readFileSync, realpathSync, statSync } from "node:fs"
import { isAbsolute, join, relative, resolve } from "node:path"
import type { Api, ImageContent, Model } from "@earendil-works/pi-ai/compat"
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
import type { AudioChart, DirectionDraft, SceneQaReport, ScriptDraft } from "./types.js"

const IssueSchema = Type.Object({
  category: Type.Unsafe<SceneQaReport["scenes"][number]["issues"][number]["category"]>({
    type: "string",
    enum: ["legibility", "clipping", "hierarchy", "coherence", "continuity", "accessibility", "accuracy", "other"],
  }),
  severity: Type.Unsafe<SceneQaReport["scenes"][number]["issues"][number]["severity"]>({
    type: "string",
    enum: ["minor", "major"],
  }),
  observation: Type.String(),
  evidence: Type.String(),
  suggestedChange: Type.Optional(Type.String()),
})
const ReportSchema = Type.Object({
  summary: Type.String(),
  scenes: Type.Array(
    Type.Object({
      index: Type.Integer(),
      verdict: Type.Unsafe<SceneQaReport["scenes"][number]["verdict"]>({
        type: "string",
        enum: ["PASS", "MINOR_FIX", "MAJOR_ISSUE"],
      }),
      score: Type.Number(),
      observations: Type.Array(Type.String()),
      issues: Type.Array(IssueSchema),
    }),
  ),
})

export interface SceneStill {
  /** Source scene index. Multiple ordered evidence frames may share one scene index. */
  index: number
  path: string
  frameNumber: number
  evidenceIndex?: number
  atMs?: number
  image: ImageContent
}

export function validateSceneQaReport(report: SceneQaReport, sceneCount: number): SceneQaReport {
  if (report.scenes.length !== sceneCount) throw new Error("Scene QA report must cover every scene exactly once")
  const indexes = report.scenes.map((scene) => scene.index)
  if (new Set(indexes).size !== sceneCount || indexes.some((index, position) => index !== position)) {
    throw new Error("Scene QA report indexes must be unique and ordered from zero")
  }
  for (const scene of report.scenes) {
    if (scene.score < 1 || scene.score > 10) throw new Error(`Scene ${scene.index} score is outside 1-10`)
    if (scene.verdict === "PASS" && scene.issues.length > 0)
      throw new Error(`PASS scene ${scene.index} cannot contain issues`)
    if (scene.verdict !== "PASS" && scene.issues.length === 0)
      throw new Error(`${scene.verdict} scene ${scene.index} requires issues`)
    if (scene.verdict === "MAJOR_ISSUE" && !scene.issues.some((issue) => issue.severity === "major")) {
      throw new Error(`MAJOR_ISSUE scene ${scene.index} requires major issue evidence`)
    }
    if (scene.verdict === "MINOR_FIX" && scene.issues.some((issue) => issue.severity === "major")) {
      throw new Error(`MINOR_FIX scene ${scene.index} cannot contain major issues`)
    }
  }
  return report
}

export class SceneStillClient {
  constructor(
    private readonly renderServiceUrl: string,
    private readonly jobsRoot = join(PROJECT_ROOT, ".generated/renders"),
  ) {}

  async render(config: Record<string, unknown>, sceneCount: number, signal?: AbortSignal): Promise<SceneStill[]> {
    const response = await fetch(`${this.renderServiceUrl}/api/render-stills`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(config),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(180_000)]) : AbortSignal.timeout(180_000),
    })
    if (!response.ok)
      throw new Error(`Scene still rendering failed (${response.status}): ${(await response.text()).slice(0, 500)}`)
    const manifest = (await response.json()) as {
      scenes?: Array<{ index: number; path: string; frameNumber: number }>
      evidence?: Array<{ index: number; evidenceIndex: number; atMs: number; path: string; frameNumber: number }>
    }
    if (!Array.isArray(manifest.scenes) || manifest.scenes.length !== sceneCount) {
      throw new Error("Stills manifest must cover every scene")
    }
    const representatives = [...manifest.scenes].sort((left, right) => left.index - right.index)
    if (representatives.some((still, position) => still.index !== position)) {
      throw new Error("Stills manifest indexes must be unique and ordered from zero")
    }
    const evidence = Array.isArray(manifest.evidence)
      ? [...manifest.evidence].sort(
          (left, right) => left.index - right.index || left.evidenceIndex - right.evidenceIndex,
        )
      : []
    if (evidence.length > 64) throw new Error("Scene evidence frame limit exceeded")
    const configScenes = Array.isArray(config.scenes) ? config.scenes : []
    for (let index = 0; index < sceneCount; index += 1) {
      const scene = configScenes[index] as
        | { componentId?: unknown; props?: { compiled?: { timeline?: unknown } } }
        | undefined
      const expectedTimes =
        scene?.componentId === "visual-program" && Array.isArray(scene.props?.compiled?.timeline)
          ? scene.props.compiled.timeline.map((state) => (state as { atMs?: unknown }).atMs)
          : []
      const sceneEvidence = evidence.filter((still) => still.index === index)
      if (
        expectedTimes.length !== sceneEvidence.length ||
        sceneEvidence.some(
          (still, position) =>
            still.evidenceIndex !== position ||
            still.atMs !== expectedTimes[position] ||
            !Number.isInteger(still.frameNumber) ||
            still.frameNumber < 0,
        )
      ) {
        throw new Error(`Scene ${index} evidence must cover every ordered Visual Program boundary`)
      }
    }
    if (evidence.some((still) => still.index < 0 || still.index >= sceneCount)) {
      throw new Error("Scene evidence references an unknown scene")
    }
    const selected = representatives.flatMap((representative) => {
      const orderedEvidence = evidence.filter((still) => still.index === representative.index)
      return orderedEvidence.length > 0 ? orderedEvidence : [representative]
    })
    const root = realpathSync(this.jobsRoot)
    let totalBytes = 0
    return selected.map((still) => {
      const candidate = realpathSync(isAbsolute(still.path) ? still.path : resolve(PROJECT_ROOT, still.path))
      const rel = relative(root, candidate)
      if (rel.startsWith("..") || isAbsolute(rel)) throw new Error(`Still path escapes render jobs root: ${still.path}`)
      if (!candidate.toLowerCase().endsWith(".png")) throw new Error(`Still is not PNG: ${still.path}`)
      const bytes = statSync(candidate).size
      totalBytes += bytes
      if (bytes <= 0 || bytes > 10 * 1024 * 1024 || totalBytes > 80 * 1024 * 1024) {
        throw new Error("Scene still byte limit exceeded")
      }
      return {
        ...still,
        path: candidate,
        image: { type: "image" as const, data: readFileSync(candidate).toString("base64"), mimeType: "image/png" },
      }
    })
  }
}

export interface SceneQaSession {
  subscribe(listener: (event: AgentSessionEvent) => void): () => void
  prompt(text: string, options?: { images?: ImageContent[] }): Promise<void>
  abort(): Promise<void>
  dispose(): void
}

export class SceneQaRunner {
  constructor(
    private readonly options: {
      threadId: string
      eventBus: ThreadEventBus
      modelRouter: ModelRouter
      authStorage: AuthStorage
      modelRegistry: ModelRegistry
      createSession?: (capture: (report: SceneQaReport) => void) => Promise<SceneQaSession>
    },
  ) {}

  async run(input: {
    config: Record<string, unknown>
    script: ScriptDraft
    direction: DirectionDraft
    audioChart?: AudioChart
    stills: SceneStill[]
    selectedTarget?: Record<string, unknown>
  }): Promise<{ runId: string; modelRoute: string; report: SceneQaReport }> {
    const runId = randomUUID()
    const model = this.options.modelRouter.findModel("scene_qa")
    const route = this.options.modelRouter.route("scene_qa")
    const modelRoute = route ? `${route.provider}/${route.model}` : model ? `${model.provider}/${model.id}` : "default"
    const thinkingLevel = this.options.modelRouter.thinkingLevel("scene_qa")
    let captured: SceneQaReport | undefined
    const session = await (this.options.createSession
      ? this.options.createSession((report) => (captured = report))
      : this.createDefaultSession(model, (report) => (captured = report), thinkingLevel, input.script.scenes.length))
    this.options.eventBus.publish({
      threadId: this.options.threadId,
      type: "subagent_start",
      payload: {
        runId,
        subagentType: "scene_qa",
        modelRoute,
        startedAt: new Date().toISOString(),
        description: "Review rendered scene stills against approved intent",
      },
    })
    const unsubscribe = session.subscribe(() => undefined)
    try {
      const prompt = [
        "Review every ordered image and submit one complete report.",
        "## Config",
        JSON.stringify(input.config, null, 2),
        "## Approved script",
        JSON.stringify(input.script, null, 2),
        "## Approved direction",
        JSON.stringify(input.direction, null, 2),
        "## Approved audio chart",
        JSON.stringify(input.audioChart ?? null, null, 2),
        input.selectedTarget ? `## Selected target contract\n${JSON.stringify(input.selectedTarget, null, 2)}` : "",
        "## Image mapping",
        input.stills
          .map((still, imageIndex) =>
            still.evidenceIndex === undefined
              ? `Image ${imageIndex}: scene ${still.index}, representative frame ${still.frameNumber}`
              : `Image ${imageIndex}: scene ${still.index}, ordered boundary ${still.evidenceIndex}, at ${still.atMs}ms, frame ${still.frameNumber}`,
          )
          .join("\n"),
      ].join("\n")
      await session.prompt(prompt, { images: input.stills.map((still) => still.image) })
      let report: SceneQaReport
      try {
        if (!captured) throw new Error("Scene QA specialist finished without structured output")
        report = validateSceneQaReport(captured, input.script.scenes.length)
      } catch (firstError) {
        const exactError = firstError instanceof Error ? firstError.message : String(firstError)
        captured = undefined
        await session.prompt(
          `Parent validation rejected the report: ${exactError}. Call submit_scene_qa_report exactly once with corrected complete ordered coverage; do not answer with prose.`,
        )
        if (!captured) throw new Error("Scene QA specialist finished without structured output")
        report = validateSceneQaReport(captured, input.script.scenes.length)
      }
      this.options.eventBus.publish({
        threadId: this.options.threadId,
        type: "subagent_end",
        payload: {
          runId,
          subagentType: "scene_qa",
          modelRoute,
          result: report.summary,
          completedAt: new Date().toISOString(),
        },
      })
      return { runId, modelRoute, report }
    } catch (error) {
      this.options.eventBus.publish({
        threadId: this.options.threadId,
        type: "subagent_error",
        payload: {
          runId,
          subagentType: "scene_qa",
          modelRoute,
          message: error instanceof Error ? error.message : String(error),
          completedAt: new Date().toISOString(),
        },
      })
      throw error
    } finally {
      unsubscribe()
      session.dispose()
    }
  }

  private async createDefaultSession(
    model: Model<Api> | undefined,
    capture: (report: SceneQaReport) => void,
    thinkingLevel: ReturnType<ModelRouter["thinkingLevel"]>,
    sceneCount: number,
  ): Promise<SceneQaSession> {
    const submit = defineTool({
      name: "submit_scene_qa_report",
      label: "Submit Scene QA Report",
      description: "Return the complete image-grounded scene QA report.",
      parameters: Type.Object({ report: ReportSchema }),
      async execute(_id, params) {
        try {
          capture(validateSceneQaReport(params.report as SceneQaReport, sceneCount))
          return {
            content: [{ type: "text" as const, text: "Scene QA report accepted." }],
            details: {},
            terminate: true,
          }
        } catch (error) {
          return {
            content: [{ type: "text" as const, text: error instanceof Error ? error.message : String(error) }],
            details: {},
            isError: true,
          }
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
      systemPrompt: readFileSync(join(PROJECT_ROOT, "packages/agent-pi/resources/agents/scene-qa.md"), "utf-8"),
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
      ...(thinkingLevel ? { thinkingLevel } : {}),
    })
    return session
  }
}
