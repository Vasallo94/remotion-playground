import express from "express"
import cors from "cors"
import { randomUUID } from "crypto"
import { spawn } from "child_process"
import { existsSync, mkdirSync, writeFileSync, readdirSync, statSync, readFileSync, rmSync } from "fs"
import { pathToFileURL } from "url"
import path from "path"
import { insertJob, updateJob, getJob, getJobByConfigId, listJobs, recoverOrphanedJobs, purgeOldJobs } from "./db"

const app = express()
app.use(cors())
app.use(express.json({ limit: "10mb" }))

const ROOT_DIR = process.env.ROOT_DIR || path.resolve(__dirname, "../../..")
const JOBS_DIR = path.resolve(ROOT_DIR, ".generated/renders")
mkdirSync(JOBS_DIR, { recursive: true })

function summarizeConfig(configPath: string) {
  const config = JSON.parse(readFileSync(configPath, "utf-8"))
  const scenes = Array.isArray(config.scenes) ? config.scenes : []
  return {
    configPath: path.relative(ROOT_DIR, configPath),
    configId: config.id || path.basename(path.dirname(configPath)),
    composition: config.composition || "ClaudeCodeTutorial",
    title: config.title || config.headline || config.product || path.basename(path.dirname(configPath)),
    sceneCount: scenes.length,
    durationSeconds: scenes.reduce(
      (sum: number, scene: { durationInSeconds?: number }) => sum + Number(scene.durationInSeconds || 0),
      0,
    ),
  }
}

function summarizeGeneratedRender(configPath: string) {
  const summary = summarizeConfig(configPath)
  const jobId = path.basename(path.dirname(configPath))
  return {
    ...summary,
    jobId,
    source: "render",
  }
}

function listConfigFiles(): string[] {
  const roots = ["content/tutorials", "content/shorts", "content/presentations"]
  const files: string[] = []
  for (const root of roots) {
    const dir = path.join(ROOT_DIR, root)
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const configPath = path.join(dir, entry.name, "config.json")
        try {
          statSync(configPath)
          files.push(configPath)
        } catch {
          // Directory without config.
        }
      }
    } catch {
      // Optional content root.
    }
  }

  return files
}

function listGeneratedRenderConfigFiles(limit = 25): string[] {
  try {
    return readdirSync(JOBS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("validate-"))
      .map((entry) => path.join(JOBS_DIR, entry.name))
      .filter((dir) => existsSync(path.join(dir, "config.json")) && existsSync(path.join(dir, "output.mp4")))
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
      .slice(0, limit)
      .map((dir) => path.join(dir, "config.json"))
  } catch {
    return []
  }
}

// POST /api/validate — validate config against Zod schemas
app.post("/api/validate", (req, res) => {
  const jobDir = path.join(JOBS_DIR, `validate-${randomUUID()}`)
  mkdirSync(jobDir, { recursive: true })
  const configPath = path.join(jobDir, "config.json")
  writeFileSync(configPath, JSON.stringify(req.body, null, 2))

  const child = spawn("npx", ["tsx", "scripts/validate-config.ts", configPath], {
    cwd: ROOT_DIR,
    shell: true,
  })

  let stdout = ""
  let stderr = ""
  child.stdout.on("data", (d) => (stdout += d.toString()))
  child.stderr.on("data", (d) => (stderr += d.toString()))

  child.on("close", (code) => {
    try {
      // npx on Windows may prepend loader output before the JSON
      const jsonMatch = stdout.match(/(\{[\s\S]*\})\s*$/)
      const result = JSON.parse(jsonMatch ? jsonMatch[1] : stdout)
      res.status(code === 0 ? 200 : 400).json(result)
    } catch {
      res.status(500).json({ error: "Validation script error", details: stderr || stdout })
    }
  })
})

// POST /api/render-stills — render a PNG still per scene for QA (called by the Python agent)
app.post("/api/render-stills", (req, res) => {
  const configJson = typeof req.body === "string" ? req.body : JSON.stringify(req.body)
  const config = typeof req.body === "string" ? JSON.parse(req.body) : req.body
  const configId = (config.id as string | undefined) ?? `stills-${randomUUID()}`

  const stillsDir = path.join(JOBS_DIR, `stills-${configId}-${Date.now()}`)
  mkdirSync(stillsDir, { recursive: true })

  const configPath = path.join(stillsDir, "config.json")
  writeFileSync(configPath, configJson)

  const child = spawn("npx", ["tsx", "scripts/render-scene-stills.ts", configPath, stillsDir], {
    cwd: ROOT_DIR,
    shell: true,
  })

  let stdout = ""
  let stderr = ""
  child.stdout.on("data", (d) => (stdout += d.toString()))
  child.stderr.on("data", (d) => (stderr += d.toString()))

  child.on("close", (code) => {
    if (code !== 0) {
      res.status(500).json({ error: stderr.trim() || "render-scene-stills failed" })
      return
    }
    try {
      // Extract JSON from the last line that starts with { or [ to avoid
      // capturing debug/progress output mixed into stdout
      const lines = stdout.trim().split("\n")
      const lastJsonLine = [...lines]
        .reverse()
        .find((l) => l.trimStart().startsWith("{") || l.trimStart().startsWith("["))
      const result = JSON.parse(lastJsonLine || stdout)
      res.status(200).json(result)
    } catch {
      res.status(500).json({ error: "Failed to parse stills manifest", raw: stdout })
    }
  })
})

// POST /api/render — submit render job
app.post("/api/render", (req, res) => {
  const jobId = randomUUID()
  const jobDir = path.join(JOBS_DIR, jobId)
  mkdirSync(jobDir, { recursive: true })

  const configPath = path.join(jobDir, "config.json")
  writeFileSync(configPath, JSON.stringify(req.body, null, 2))

  insertJob({
    id: jobId,
    config_id: req.body.id,
    title: req.body.title || req.body.headline || req.body.product,
    composition: req.body.composition || "ClaudeCodeTutorial",
    thread_id: req.body._threadId,
  })

  // First validate
  const validateChild = spawn("npx", ["tsx", "scripts/validate-config.ts", configPath], {
    cwd: ROOT_DIR,
    shell: true,
  })

  let valOut = ""
  let valErr = ""
  validateChild.stdout.on("data", (d) => (valOut += d.toString()))
  validateChild.stderr.on("data", (d) => (valErr += d.toString()))

  validateChild.on("close", (valCode) => {
    let validationPassed = valCode === 0
    try {
      const jsonMatch = valOut.match(/(\{[\s\S]*\})\s*$/)
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[1])
        validationPassed = result.valid === true || (Array.isArray(result.errors) && result.errors.length === 0)
        if (!validationPassed) {
          updateJob(jobId, {
            status: "error",
            error: JSON.stringify(result.errors || result),
            completed_at: new Date().toISOString(),
          })
          return
        }
      }
    } catch {
      if (valCode !== 0) {
        updateJob(jobId, {
          status: "error",
          error: valErr || valOut || "Config validation failed",
          completed_at: new Date().toISOString(),
        })
        return
      }
    }

    updateJob(jobId, { status: "rendering" })

    const renderArgs = ["tsx", "scripts/render.ts", configPath]
    if (req.body._skipAudioGeneration) renderArgs.push("--skip-audio-generation")

    const renderChild = spawn("npx", renderArgs, {
      cwd: ROOT_DIR,
      shell: true,
    })

    let renderStderr = ""
    const MAX_STDERR = 8000
    const NOISE_PATTERNS = [/Failed to load resource.*timestamps\.json/i, /\.timestamps\.json\] Failed/i]

    renderChild.stdout.on("data", (data) => {
      const match = data.toString().match(/(\d+)%/)
      if (match) updateJob(jobId, { progress: parseInt(match[1]) })
    })

    renderChild.stderr.on("data", (data) => {
      const chunk = data.toString()
      const match = chunk.match(/(\d+)%/)
      if (match) updateJob(jobId, { progress: parseInt(match[1]) })
      const lines = chunk.split("\n").filter((line: string) => {
        if (!line.trim()) return false
        return !NOISE_PATTERNS.some((p) => p.test(line))
      })
      const filtered = lines.join("\n")
      if (filtered && renderStderr.length < MAX_STDERR) {
        renderStderr += filtered.slice(0, MAX_STDERR - renderStderr.length)
      }
    })

    renderChild.on("close", (code) => {
      if (code === 0) {
        const outputPath = path.join(jobDir, "output.mp4")
        updateJob(jobId, {
          status: "done",
          progress: 100,
          output_path: outputPath,
          file_size: statSync(outputPath).size,
          completed_at: new Date().toISOString(),
        })
        const configId = req.body.id as string | undefined
        if (configId) {
          const oldIds = purgeOldJobs(configId, jobId)
          for (const id of oldIds) {
            try {
              rmSync(path.join(JOBS_DIR, id), { recursive: true, force: true })
            } catch {
              /* ignore */
            }
          }
          if (oldIds.length > 0) console.log(`Purged ${oldIds.length} old render(s) for ${configId}`)
        }
      } else {
        const detail = renderStderr.trim()
        updateJob(jobId, {
          status: "error",
          error: detail || `Render exited with code ${code}`,
          completed_at: new Date().toISOString(),
        })
      }
    })
  })

  // Return immediately with job ID
  res.json({ jobId })
})

// GET /api/render/jobs — list all jobs (must be before :id routes)
app.get("/api/render/jobs", (req, res) => {
  const configId = req.query.config_id as string | undefined
  if (configId) {
    const job = getJobByConfigId(configId)
    res.json({ jobs: job ? [job] : [], total: job ? 1 : 0, limit: 1, offset: 0 })
    return
  }
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100)
  const offset = parseInt(req.query.offset as string) || 0
  const result = listJobs(limit, offset)
  res.json({ ...result, limit, offset })
})

// GET /api/configs — list selectable video configs
app.get("/api/configs", (_req, res) => {
  const curated = listConfigFiles().map((configPath) => {
    try {
      return { ...summarizeConfig(configPath), source: "content" }
    } catch (error) {
      return {
        configPath: path.relative(ROOT_DIR, configPath),
        source: "content",
        error: error instanceof Error ? error.message : String(error),
      }
    }
  })
  const generated = listGeneratedRenderConfigFiles().map((configPath) => {
    try {
      return summarizeGeneratedRender(configPath)
    } catch (error) {
      return {
        configPath: path.relative(ROOT_DIR, configPath),
        source: "render",
        jobId: path.basename(path.dirname(configPath)),
        error: error instanceof Error ? error.message : String(error),
      }
    }
  })
  const configs = [...generated, ...curated]
  res.json({ configs })
})

// GET /api/render/:id/status — check render progress
app.get("/api/render/:id/status", (req, res) => {
  const job = getJob(req.params.id)
  if (!job) {
    res.status(404).json({ error: "Job not found" })
    return
  }
  res.json(job)
})

// Resolve video path from job ID (immune to host vs container path mismatch)
function resolveOutputPath(jobId: string): string {
  return path.join(JOBS_DIR, jobId, "output.mp4")
}

// GET /api/render/:id/stream — serve video for in-browser playback (supports Range)
app.get("/api/render/:id/stream", (req, res) => {
  const job = getJob(req.params.id)
  const filePath = resolveOutputPath(req.params.id)
  if (job && job.status !== "done") {
    res.status(404).json({ error: "Video not available" })
    return
  }
  try {
    statSync(filePath)
  } catch {
    res.status(job ? 410 : 404).json({ error: job ? "Video file deleted" : "Video not available" })
    return
  }
  res.sendFile(filePath, { headers: { "Content-Type": "video/mp4" }, dotfiles: "allow" })
})

// GET /api/render/:id/download — download rendered video
app.get("/api/render/:id/download", (req, res) => {
  const job = getJob(req.params.id)
  const filePath = resolveOutputPath(req.params.id)
  if (job && job.status !== "done") {
    res.status(404).json({ error: "Video not available" })
    return
  }
  try {
    statSync(filePath)
  } catch {
    res.status(job ? 410 : 404).json({ error: job ? "Video file deleted" : "Video not available" })
    return
  }
  const filename = `${job?.config_id || req.params.id}.mp4`
  res.sendFile(filePath, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
    dotfiles: "allow",
  })
})

// GET /api/audio/library — list available music tracks
app.get("/api/audio/library", (_req, res) => {
  const libraryDir = path.join(ROOT_DIR, "public/audio/library")
  try {
    const files = readdirSync(libraryDir)
      .filter((f: string) => f.endsWith(".mp3"))
      .map((f: string) => f.replace(".mp3", ""))
    res.json({ tracks: files })
  } catch {
    res.json({ tracks: [] })
  }
})

const PORT = parseInt(process.env.PORT || "3100")
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const recovered = recoverOrphanedJobs()
  if (recovered > 0) console.log(`Recovered ${recovered} orphaned job(s) from previous run`)
  app.listen(PORT, () => {
    console.log(`Render service listening on :${PORT}`)
  })
}

export { app }
