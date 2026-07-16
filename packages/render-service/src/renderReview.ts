import { execFile } from "node:child_process"
import { existsSync, readFileSync, statSync } from "node:fs"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

interface ProbeStream {
  codec_type?: string
  codec_name?: string
  width?: number
  height?: number
  avg_frame_rate?: string
}
interface ProbeData {
  format?: { duration?: string }
  streams?: ProbeStream[]
}

interface RenderReviewConfig {
  width?: unknown
  height?: unknown
  fps?: unknown
  scenes?: Array<{ durationInSeconds?: unknown }>
  voiceover?: { enabled?: unknown } | null
  soundDesign?: {
    enabled?: unknown
    musicBed?: unknown
    sfx?: unknown[]
  } | null
}

export interface RenderReviewReport {
  passed: boolean
  fileSizeBytes: number
  duration: {
    actualSeconds: number
    expectedSeconds: number
    deltaSeconds: number
    toleranceSeconds: number
    matches: boolean
  }
  video: {
    present: boolean
    codec: string | null
    width: number | null
    height: number | null
    fps: number | null
    dimensionsMatch: boolean
    fpsMatches: boolean
  }
  audio: { expected: boolean; present: boolean; codec: string | null; matchesExpectation: boolean }
  failures: string[]
  warnings: string[]
}

function fraction(value?: string): number | null {
  if (!value) return null
  const [left, right] = value.split("/").map(Number)
  if (!Number.isFinite(left) || !Number.isFinite(right) || right === 0) return null
  return left / right
}

export function buildRenderReview(
  config: RenderReviewConfig,
  outputPath: string,
  probe: ProbeData,
): RenderReviewReport {
  const streams = probe.streams ?? []
  const video = streams.find((stream) => stream.codec_type === "video")
  const audio = streams.find((stream) => stream.codec_type === "audio")
  const scenes = Array.isArray(config.scenes) ? config.scenes : []
  const expectedSeconds = scenes.reduce((sum, scene) => sum + (Number(scene.durationInSeconds) || 0), 0)
  const actualSeconds = Number(probe.format?.duration ?? 0)
  const deltaSeconds = Math.abs(actualSeconds - expectedSeconds)
  const toleranceSeconds = Math.max(0.5, scenes.length * 0.1)
  const expectedWidth = Number(config.width ?? 1280)
  const expectedHeight = Number(config.height ?? 720)
  const expectedFps = Number(config.fps ?? 30)
  const actualFps = fraction(video?.avg_frame_rate)
  const expectedAudio = Boolean(
    config.voiceover?.enabled ||
    (config.soundDesign?.enabled && (config.soundDesign?.musicBed || config.soundDesign?.sfx?.length > 0)),
  )
  const failures: string[] = []
  const warnings: string[] = []
  if (!video) failures.push("No video stream found")
  const dimensionsMatch = video?.width === expectedWidth && video?.height === expectedHeight
  if (video && !dimensionsMatch)
    failures.push(`Dimensions ${video.width}x${video.height} do not match ${expectedWidth}x${expectedHeight}`)
  const fpsMatches = actualFps !== null && Math.abs(actualFps - expectedFps) <= 0.01
  if (video && !fpsMatches) failures.push(`Frame rate ${actualFps ?? "unknown"} does not match ${expectedFps}`)
  const durationMatches = Number.isFinite(actualSeconds) && deltaSeconds <= toleranceSeconds
  if (!durationMatches)
    failures.push(`Duration differs by ${deltaSeconds.toFixed(3)}s (tolerance ${toleranceSeconds.toFixed(3)}s)`)
  if (expectedAudio && !audio) failures.push("Approved config expects audio but no audio stream was found")
  if (!expectedAudio && audio)
    warnings.push("Audio stream is present although the approved config does not require audio")
  const fileSizeBytes = existsSync(outputPath) ? statSync(outputPath).size : 0
  if (fileSizeBytes <= 0) failures.push("Rendered MP4 is missing or empty")
  return {
    passed: failures.length === 0,
    fileSizeBytes,
    duration: { actualSeconds, expectedSeconds, deltaSeconds, toleranceSeconds, matches: durationMatches },
    video: {
      present: Boolean(video),
      codec: video?.codec_name ?? null,
      width: video?.width ?? null,
      height: video?.height ?? null,
      fps: actualFps,
      dimensionsMatch,
      fpsMatches,
    },
    audio: {
      expected: expectedAudio,
      present: Boolean(audio),
      codec: audio?.codec_name ?? null,
      matchesExpectation: expectedAudio ? Boolean(audio) : true,
    },
    failures,
    warnings,
  }
}

export async function reviewRenderFiles(configPath: string, outputPath: string): Promise<RenderReviewReport> {
  if (!existsSync(configPath) || !existsSync(outputPath)) throw new Error("Completed render files are missing")
  const config = JSON.parse(readFileSync(configPath, "utf-8")) as RenderReviewConfig
  const { stdout } = await execFileAsync(
    "ffprobe",
    ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", outputPath],
    { timeout: 30_000, maxBuffer: 2 * 1024 * 1024 },
  )
  return buildRenderReview(config, outputPath, JSON.parse(stdout) as ProbeData)
}
