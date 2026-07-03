import { defineTool } from "@earendil-works/pi-coding-agent"
import { Type } from "typebox"
import { randomUUID } from "node:crypto"
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { AgentPiStore } from "./store.js"
import { ThreadEventBus } from "./events.js"
import {
  configIdFromTitle,
  createCheckpointPayload,
  nextDraftFileName,
  scriptToMarkdown,
  writeJsonArtifact,
  writeTextArtifact,
} from "./artifacts.js"
import { PROJECT_ROOT, assertProjectPath, contentTutorialDir, ensureDirectory, projectRelativePath } from "./paths.js"
import type { ArtifactKind, ArtifactRecord, DirectionDraft, RenderJobStatus, ScriptDraft } from "./types.js"

const SceneScriptSchema = Type.Object({
  id: Type.String(),
  type: Type.String(),
  title: Type.Optional(Type.String()),
  voiceover: Type.Optional(Type.String()),
  visualNotes: Type.Optional(Type.String()),
  durationInSeconds: Type.Number(),
})

const ScriptDraftSchema = Type.Object({
  title: Type.String(),
  objective: Type.String(),
  audience: Type.Optional(Type.String()),
  tone: Type.Optional(Type.String()),
  scenes: Type.Array(SceneScriptSchema),
  estimatedDurationSeconds: Type.Optional(Type.Number()),
  notes: Type.Optional(Type.String()),
})

const DirectionDraftSchema = Type.Object({
  title: Type.Optional(Type.String()),
  scenes: Type.Array(Type.Record(Type.String(), Type.Any())),
  warnings: Type.Optional(Type.Array(Type.String())),
  audio: Type.Optional(Type.Record(Type.String(), Type.Any())),
  risks: Type.Optional(Type.Array(Type.String())),
})

export interface ClaquetaToolContext {
  threadId: string
  store: AgentPiStore
  eventBus: ThreadEventBus
  renderServiceUrl: string
}

function textResult(text: string, details: Record<string, unknown> = {}, terminate = false) {
  return {
    content: [{ type: "text" as const, text }],
    details,
    terminate,
  }
}

function readJsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf-8"))
}

function summarizeConfig(configPath: string): Record<string, unknown> {
  const config = readJsonFile(configPath) as Record<string, unknown>
  const scenes = Array.isArray(config.scenes) ? config.scenes : []
  return {
    configPath: projectRelativePath(configPath),
    configId: typeof config.id === "string" ? config.id : configPath.split("/").at(-2),
    composition: typeof config.composition === "string" ? config.composition : "ClaudeCodeTutorial",
    title:
      typeof config.title === "string"
        ? config.title
        : typeof config.headline === "string"
          ? config.headline
          : typeof config.product === "string"
            ? config.product
            : configPath.split("/").at(-2),
    sceneCount: scenes.length,
    durationSeconds: scenes.reduce((sum, scene) => {
      if (typeof scene !== "object" || scene === null) return sum
      const duration = Number((scene as Record<string, unknown>).durationInSeconds ?? 0)
      return Number.isFinite(duration) ? sum + duration : sum
    }, 0),
  }
}

function listConfigPaths(): string[] {
  const roots = ["content/tutorials", "content/shorts", "content/presentations"]
  const paths: string[] = []
  for (const root of roots) {
    const rootPath = assertProjectPath(root)
    if (!existsSync(rootPath)) continue
    for (const entry of readdirSync(rootPath, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const configPath = join(rootPath, entry.name, "config.json")
      try {
        statSync(configPath)
        paths.push(configPath)
      } catch {
        // Optional config.
      }
    }
  }
  const generated = assertProjectPath(".generated/renders")
  if (existsSync(generated)) {
    for (const entry of readdirSync(generated, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith("validate-")) continue
      const configPath = join(generated, entry.name, "config.json")
      if (existsSync(configPath)) paths.push(configPath)
    }
  }
  return paths.sort()
}

function resolveConfigPath(pathOrSlug: string): string {
  const direct = assertProjectPath(pathOrSlug)
  try {
    const stat = statSync(direct)
    if (stat.isFile()) return direct
    if (stat.isDirectory() && existsSync(join(direct, "config.json"))) return join(direct, "config.json")
  } catch {
    // Resolve by slug/id below.
  }

  const slug = pathOrSlug.split("/").filter(Boolean).at(-1) ?? pathOrSlug
  const matches = listConfigPaths().filter((candidate) => {
    try {
      const config = readJsonFile(candidate) as Record<string, unknown>
      return candidate.split("/").at(-2) === slug || config.id === slug || config.title === slug
    } catch {
      return false
    }
  })
  if (matches.length === 1) return matches[0]
  if (matches.length > 1) {
    throw new Error(`Multiple configs match '${pathOrSlug}': ${matches.map(projectRelativePath).join(", ")}`)
  }
  throw new Error(`No config found for '${pathOrSlug}'`)
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, ms)
    if (!signal) return
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout)
        reject(new Error("Aborted"))
      },
      { once: true },
    )
  })
}

async function fetchJson(url: string, options?: RequestInit): Promise<{ status: number; body: unknown }> {
  const response = await fetch(url, options)
  const text = await response.text()
  let body: unknown = text
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = { raw: text }
    }
  }
  return { status: response.status, body }
}

function configFromInput(
  store: AgentPiStore,
  threadId: string,
  config: unknown,
  artifactId?: string,
): Record<string, unknown> {
  if (artifactId) {
    const artifact = store.getArtifact<Record<string, unknown>>(artifactId)
    if (!artifact) throw new Error(`Artifact not found: ${artifactId}`)
    if (artifact.kind !== "config") throw new Error(`Artifact is not a config: ${artifactId}`)
    return withTutorialDefaults(artifact.data)
  }
  if (typeof config === "object" && config !== null && !Array.isArray(config)) {
    return withTutorialDefaults(config as Record<string, unknown>)
  }
  const artifact = latestArtifact<Record<string, unknown>>(store, threadId, "config")
  if (artifact) return withTutorialDefaults(artifact.data)
  throw new Error("A config object or config artifactId is required")
}

function latestArtifact<TData>(
  store: AgentPiStore,
  threadId: string,
  kind: ArtifactKind,
  approvedOnly = false,
): ArtifactRecord<TData> | undefined {
  return store
    .listArtifacts(threadId)
    .filter((artifact) => artifact.kind === kind && (!approvedOnly || artifact.approved))
    .at(-1) as ArtifactRecord<TData> | undefined
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const items = value
    .map((item) => {
      if (typeof item === "string") return item
      if (typeof item === "object" && item !== null && typeof (item as { text?: unknown }).text === "string") {
        return (item as { text: string }).text
      }
      return undefined
    })
    .filter((item): item is string => item !== undefined && item.trim().length > 0)
  return items.length > 0 ? items : undefined
}

function normalizeTerminalLines(scene: Record<string, unknown>): Array<Record<string, unknown>> {
  const rawLines = Array.isArray(scene.lines) ? scene.lines : undefined
  if (rawLines?.length) {
    return rawLines.map((line) => {
      if (typeof line !== "object" || line === null) return { kind: "output", text: String(line) }
      const record = line as Record<string, unknown>
      const rawKind = asString(record.kind)?.toLowerCase()
      const kind =
        rawKind === "command" || rawKind === "output" || rawKind === "claude" || rawKind === "blank"
          ? rawKind
          : "output"
      return { ...record, kind, text: asString(record.text) ?? "" }
    })
  }

  const command = asString(scene.command) ?? "/compact"
  const output = asString(scene.expectedOutput) ?? asString(scene.output) ?? "✓ Contexto compactado"
  return [
    { kind: "command", text: command },
    { kind: "output", text: output },
  ]
}

function normalizeScene(rawScene: unknown): Record<string, unknown> {
  const scene = typeof rawScene === "object" && rawScene !== null ? (rawScene as Record<string, unknown>) : {}
  const type = asString(scene.type) ?? "callout"
  const durationInSeconds = Number(scene.durationInSeconds ?? 4)
  const safeDuration = Number.isFinite(durationInSeconds) ? durationInSeconds : 4
  const title = asString(scene.title) ?? asString(scene.heading) ?? asString(scene.id) ?? "Escena"
  const voiceover = asString(scene.voiceover) ?? asString(scene.narration) ?? asString(scene.summary)
  const items = asStringArray(scene.items) ?? asStringArray(scene.bullets)

  if (type === "intro") {
    return {
      ...scene,
      type: "intro",
      title,
      subtitle: asString(scene.subtitle) ?? voiceover,
      durationInSeconds: safeDuration,
    }
  }

  if (type === "terminal") {
    return {
      ...scene,
      type: "terminal",
      title,
      lines: normalizeTerminalLines(scene),
      durationInSeconds: safeDuration,
    }
  }

  if (type === "callout") {
    return {
      ...scene,
      type: "callout",
      text: asString(scene.text) ?? voiceover ?? items?.join(" · ") ?? title,
      position: asString(scene.position) ?? "bottom",
      background: asString(scene.background) ?? "overlay",
      durationInSeconds: safeDuration,
    }
  }

  if (type === "outro") {
    return {
      ...scene,
      type: "outro",
      title,
      bullets: asStringArray(scene.bullets) ?? items ?? (voiceover ? [voiceover] : undefined),
      durationInSeconds: safeDuration,
    }
  }

  if (type === "benefits") {
    return {
      ...scene,
      type: "benefits",
      title,
      items: (items ?? [voiceover ?? title]).map((text) => ({ text })),
      durationInSeconds: safeDuration,
    }
  }

  return {
    ...scene,
    type: "callout",
    text: voiceover ?? items?.join(" · ") ?? title,
    position: "bottom",
    background: "overlay",
    durationInSeconds: safeDuration,
  }
}

function normalizeTransition(transition: unknown): unknown {
  if (transition === undefined || transition === null) return transition
  if (typeof transition === "string") return { type: transition === "cut" ? "none" : transition }
  if (typeof transition !== "object") return transition
  const record = transition as Record<string, unknown>
  if (record.type === "cut") return { ...record, type: "none" }
  return transition
}

function withTutorialDefaults(config: Record<string, unknown>): Record<string, unknown> {
  const title = typeof config.title === "string" ? config.title : "claqueta-video"
  return {
    id: typeof config.id === "string" ? config.id : configIdFromTitle(title),
    title,
    description: typeof config.description === "string" ? config.description : title,
    fps: 30,
    width: 1280,
    height: 720,
    composition: "ClaudeCodeTutorial",
    theme: "betelgeuse",
    ...config,
    scenes: Array.isArray(config.scenes) ? config.scenes.map(normalizeScene) : [],
    transition: normalizeTransition(config.transition),
  }
}

export function createClaquetaTools(ctx: ClaquetaToolContext) {
  const { threadId, store, eventBus, renderServiceUrl } = ctx

  return [
    defineTool({
      name: "list_scene_catalog",
      label: "List Scene Catalog",
      description: "List available Remotion scene types and narrative guidance for ClaudeCodeTutorial.",
      promptSnippet: "List the available scene catalog before choosing Remotion scene types.",
      parameters: Type.Object({}),
      async execute() {
        const catalogPath = join(PROJECT_ROOT, "src/shared/scene-catalog.json")
        const catalog = readJsonFile(catalogPath)
        return textResult("Scene catalog loaded.", { catalog })
      },
    }),

    defineTool({
      name: "list_existing_configs",
      label: "List Existing Configs",
      description: "List known content and generated video config.json files.",
      parameters: Type.Object({}),
      async execute() {
        const configs = listConfigPaths().map((configPath) => {
          try {
            return summarizeConfig(configPath)
          } catch (error) {
            return {
              configPath: projectRelativePath(configPath),
              error: error instanceof Error ? error.message : String(error),
            }
          }
        })
        return textResult(`Found ${configs.length} config(s).`, { configs })
      },
    }),

    defineTool({
      name: "load_existing_config",
      label: "Load Existing Config",
      description: "Load an existing config by relative path, directory, slug, or config id.",
      parameters: Type.Object({ pathOrSlug: Type.String() }),
      async execute(_id, params) {
        const configPath = resolveConfigPath(params.pathOrSlug)
        const config = readJsonFile(configPath)
        return textResult(`Loaded ${projectRelativePath(configPath)}.`, {
          sourcePath: projectRelativePath(configPath),
          config,
          summary: summarizeConfig(configPath),
        })
      },
    }),

    defineTool({
      name: "create_script_draft",
      label: "Create Script Draft",
      description: "Persist a structured editable script/escaleta draft for review.",
      parameters: Type.Object({ script: ScriptDraftSchema }),
      async execute(_id, params) {
        const script = params.script as ScriptDraft
        const artifact = writeJsonArtifact(
          store,
          threadId,
          "script",
          nextDraftFileName(store, threadId, "script"),
          script,
        )
        const markdown = writeTextArtifact(
          store,
          threadId,
          "script_markdown",
          nextDraftFileName(store, threadId, "script_markdown", "md"),
          scriptToMarkdown(script),
        )
        eventBus.publish({
          threadId,
          type: "artifact_updated",
          payload: { kind: "script", artifact, markdownPath: markdown.path },
        })
        return textResult("Script draft saved.", { artifact, markdownPath: markdown.path })
      },
    }),

    defineTool({
      name: "present_script_checkpoint",
      label: "Present Script Checkpoint",
      description: "Present the editable script checkpoint to the human and pause the run.",
      parameters: Type.Object({ artifactId: Type.Optional(Type.String()), script: Type.Optional(ScriptDraftSchema) }),
      async execute(_id, params) {
        let artifact = params.artifactId ? store.getArtifact<ScriptDraft>(params.artifactId) : null
        if (!artifact && params.script) {
          artifact = writeJsonArtifact(
            store,
            threadId,
            "script",
            nextDraftFileName(store, threadId, "script"),
            params.script as ScriptDraft,
          )
        }
        if (!artifact) throw new Error("present_script_checkpoint requires artifactId or script")
        const payload = createCheckpointPayload("script_checkpoint", artifact)
        const checkpoint = { id: randomUUID(), type: "script_checkpoint" as const, artifactId: artifact.id, payload }
        store.setCheckpoint(threadId, checkpoint)
        eventBus.publish({ threadId, type: "checkpoint", payload: checkpoint })
        return textResult(
          "Script checkpoint presented. Stop and wait for the user's approval or requested changes.",
          checkpoint,
          true,
        )
      },
    }),

    defineTool({
      name: "save_script_artifact",
      label: "Save Script Artifact",
      description: "Save the approved script artifact and human-readable Markdown export.",
      parameters: Type.Object({ script: ScriptDraftSchema, approved: Type.Optional(Type.Boolean()) }),
      async execute(_id, params) {
        const script = params.script as ScriptDraft
        const approved = params.approved ?? true
        const artifact = writeJsonArtifact(
          store,
          threadId,
          "script",
          nextDraftFileName(store, threadId, "script"),
          script,
          approved,
        )
        const markdown = writeTextArtifact(
          store,
          threadId,
          "script_markdown",
          nextDraftFileName(store, threadId, "script_markdown", "md"),
          scriptToMarkdown(script),
          approved,
        )
        eventBus.publish({
          threadId,
          type: "artifact_updated",
          payload: { kind: "script", artifact, markdownPath: markdown.path, approved },
        })
        return textResult("Approved script saved.", { artifact, markdownPath: markdown.path })
      },
    }),

    defineTool({
      name: "create_direction_draft",
      label: "Create Direction Draft",
      description: "Persist a technical/narrative Remotion direction draft.",
      parameters: Type.Object({ direction: DirectionDraftSchema }),
      async execute(_id, params) {
        const direction = params.direction as DirectionDraft
        const artifact = writeJsonArtifact(
          store,
          threadId,
          "direction",
          nextDraftFileName(store, threadId, "direction"),
          direction,
        )
        eventBus.publish({ threadId, type: "artifact_updated", payload: { kind: "direction", artifact } })
        return textResult("Direction draft saved.", { artifact })
      },
    }),

    defineTool({
      name: "present_direction_checkpoint",
      label: "Present Direction Checkpoint",
      description: "Present technical direction for review and pause the run.",
      parameters: Type.Object({
        artifactId: Type.Optional(Type.String()),
        direction: Type.Optional(DirectionDraftSchema),
      }),
      async execute(_id, params) {
        let artifact = params.artifactId ? store.getArtifact<DirectionDraft>(params.artifactId) : null
        if (!artifact && params.direction) {
          artifact = writeJsonArtifact(
            store,
            threadId,
            "direction",
            nextDraftFileName(store, threadId, "direction"),
            params.direction as DirectionDraft,
          )
        }
        if (!artifact) throw new Error("present_direction_checkpoint requires artifactId or direction")
        const payload = createCheckpointPayload("direction_checkpoint", artifact)
        const checkpoint = { id: randomUUID(), type: "direction_checkpoint" as const, artifactId: artifact.id, payload }
        store.setCheckpoint(threadId, checkpoint)
        eventBus.publish({ threadId, type: "checkpoint", payload: checkpoint })
        return textResult("Direction checkpoint presented. Stop and wait for approval or critique.", checkpoint, true)
      },
    }),

    defineTool({
      name: "save_direction_artifact",
      label: "Save Direction Artifact",
      description: "Save the approved technical direction artifact.",
      parameters: Type.Object({ direction: DirectionDraftSchema, approved: Type.Optional(Type.Boolean()) }),
      async execute(_id, params) {
        const approved = params.approved ?? true
        const artifact = writeJsonArtifact(
          store,
          threadId,
          "direction",
          nextDraftFileName(store, threadId, "direction"),
          params.direction as DirectionDraft,
          approved,
        )
        eventBus.publish({ threadId, type: "artifact_updated", payload: { kind: "direction", artifact, approved } })
        return textResult("Approved direction saved.", { artifact })
      },
    }),

    defineTool({
      name: "generate_remotion_config",
      label: "Generate Remotion Config",
      description: "Persist an exact ClaudeCodeTutorial config.json draft with safe defaults before validation/render.",
      parameters: Type.Object({ config: Type.Record(Type.String(), Type.Any()) }),
      async execute(_id, params) {
        const config = withTutorialDefaults(params.config as Record<string, unknown>)
        const artifact = writeJsonArtifact(store, threadId, "config", "config.json", config)
        eventBus.publish({ threadId, type: "artifact_updated", payload: { kind: "config", artifact } })
        return textResult("Remotion config generated.", { artifact, config })
      },
    }),

    defineTool({
      name: "validate_video_config",
      label: "Validate Video Config",
      description: "Validate a config object or saved config artifact against the render-service Zod endpoint.",
      parameters: Type.Object({ config: Type.Optional(Type.Any()), artifactId: Type.Optional(Type.String()) }),
      async execute(_id, params, signal) {
        const config = configFromInput(store, threadId, params.config, params.artifactId)
        const { status, body } = await fetchJson(`${renderServiceUrl}/api/validate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config),
          signal,
        })
        const valid =
          status >= 200 &&
          status < 300 &&
          typeof body === "object" &&
          body !== null &&
          (body as { valid?: unknown }).valid === true
        return textResult(valid ? "Config is valid." : "Config validation failed.", { valid, status, result: body })
      },
    }),

    defineTool({
      name: "submit_render",
      label: "Submit Render",
      description:
        "Submit a validated config object or config artifact to the render-service. V1 skips audio generation unless CLAQUETA_PI_ALLOW_AUDIO_GENERATION=true.",
      parameters: Type.Object({
        config: Type.Optional(Type.Any()),
        artifactId: Type.Optional(Type.String()),
        skipAudioGeneration: Type.Optional(Type.Boolean()),
        waitForCompletion: Type.Optional(Type.Boolean()),
        timeoutMs: Type.Optional(Type.Number()),
      }),
      async execute(_id, params, signal, onUpdate) {
        const allowAudioGeneration = process.env.CLAQUETA_PI_ALLOW_AUDIO_GENERATION === "true"
        const skipAudioGeneration = allowAudioGeneration ? (params.skipAudioGeneration ?? true) : true
        const config = {
          ...configFromInput(store, threadId, params.config, params.artifactId),
          _threadId: threadId,
          _skipAudioGeneration: skipAudioGeneration,
        }
        const { status, body } = await fetchJson(`${renderServiceUrl}/api/render`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config),
          signal,
        })
        if (status < 200 || status >= 300 || typeof body !== "object" || body === null || !("jobId" in body)) {
          throw new Error(`Render submission failed (${status}): ${JSON.stringify(body)}`)
        }
        const jobId = String((body as { jobId: unknown }).jobId)
        const artifact = store.saveArtifact({ threadId, kind: "render_job", data: { jobId, status: "submitted" } })
        eventBus.publish({
          threadId,
          type: "render_status",
          payload: { jobId, status: "submitted", artifactId: artifact.id },
        })

        if (params.waitForCompletion === false) {
          return textResult(`Render submitted: ${jobId}`, { jobId, artifact })
        }

        const timeoutMs = params.timeoutMs ?? 10 * 60 * 1000
        const startedAt = Date.now()
        let lastSignature = "submitted:0"
        while (Date.now() - startedAt < timeoutMs) {
          const statusResult = await fetchJson(`${renderServiceUrl}/api/render/${jobId}/status`, { signal })
          if (statusResult.status < 200 || statusResult.status >= 300) {
            throw new Error(`Render status failed (${statusResult.status}): ${JSON.stringify(statusResult.body)}`)
          }
          const job = statusResult.body as RenderJobStatus
          const signature = `${job.status}:${job.progress}`
          if (signature !== lastSignature) {
            lastSignature = signature
            eventBus.publish({ threadId, type: "render_status", payload: job })
            onUpdate?.({ content: [{ type: "text", text: `Render ${job.status} ${job.progress}%` }], details: { job } })
          }
          if (job.status === "done") {
            store.saveArtifact({ threadId, kind: "render_job", data: job, approved: true })
            return textResult(`Render completed: ${jobId}`, { job })
          }
          if (job.status === "error") {
            eventBus.publish({ threadId, type: "render_status", payload: job })
            throw new Error(`Render failed: ${job.error ?? "unknown error"}`)
          }
          await sleep(5000, signal)
        }

        throw new Error(`Render timed out after ${timeoutMs}ms: ${jobId}`)
      },
    }),

    defineTool({
      name: "publish_approved_artifacts",
      label: "Publish Approved Artifacts",
      description:
        "Copy the latest approved script/direction and generated config into content/tutorials/<slug>/ after the human-approved flow.",
      parameters: Type.Object({
        slug: Type.Optional(Type.String()),
        configArtifactId: Type.Optional(Type.String()),
      }),
      async execute(_id, params) {
        const configArtifact = params.configArtifactId
          ? store.getArtifact<Record<string, unknown>>(params.configArtifactId)
          : latestArtifact<Record<string, unknown>>(store, threadId, "config")
        if (!configArtifact) throw new Error("No config artifact available to publish")

        const config = configArtifact.data
        const title =
          typeof config.title === "string" ? config.title : typeof config.id === "string" ? config.id : threadId
        const slug = params.slug ?? (typeof config.id === "string" ? config.id : configIdFromTitle(title))
        const targetDir = contentTutorialDir(slug)
        ensureDirectory(targetDir)

        const written: Record<string, string> = {}
        const writeJson = (fileName: string, data: unknown) => {
          const absolutePath = `${targetDir}/${fileName}`
          writeFileSync(absolutePath, JSON.stringify(data, null, 2) + "\n", "utf-8")
          written[fileName] = projectRelativePath(absolutePath)
        }
        const writeText = (fileName: string, text: string) => {
          const absolutePath = `${targetDir}/${fileName}`
          writeFileSync(absolutePath, text.endsWith("\n") ? text : `${text}\n`, "utf-8")
          written[fileName] = projectRelativePath(absolutePath)
        }

        writeJson("config.json", config)

        const script = latestArtifact<ScriptDraft>(store, threadId, "script", true)
        if (script) {
          writeJson("script.json", script.data)
          writeText("script.md", scriptToMarkdown(script.data))
        }

        const direction = latestArtifact<DirectionDraft>(store, threadId, "direction", true)
        if (direction) writeJson("direction.json", direction.data)

        eventBus.publish({ threadId, type: "artifact_updated", payload: { kind: "published_artifacts", written } })
        return textResult("Approved artifacts published to content/tutorials.", { written })
      },
    }),

    defineTool({
      name: "check_render_status",
      label: "Check Render Status",
      description: "Check render job status and publish render progress to SSE.",
      parameters: Type.Object({ jobId: Type.String() }),
      async execute(_id, params, signal) {
        const { status, body } = await fetchJson(`${renderServiceUrl}/api/render/${params.jobId}/status`, { signal })
        if (status < 200 || status >= 300) {
          throw new Error(`Render status failed (${status}): ${JSON.stringify(body)}`)
        }
        const job = body as RenderJobStatus
        eventBus.publish({ threadId, type: "render_status", payload: job })
        return textResult(`Render status: ${job.status} (${job.progress}%).`, { job })
      },
    }),
  ]
}
