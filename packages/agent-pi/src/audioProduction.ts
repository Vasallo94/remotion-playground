import { execFile } from "node:child_process"
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { promisify } from "node:util"
import type { AudioAssetsManifest, AudioChart, ProducedAudioAsset } from "./types.js"
import { PROJECT_ROOT } from "./paths.js"
import { listAudioLibrary, validateAudioChart } from "./audioPlanner.js"

const execFileAsync = promisify(execFile)

export interface AudioProductionInput {
  config: Record<string, unknown>
  configPath: string
  chart: AudioChart
  sceneCount: number
}

export interface AudioProductionOptions {
  root?: string
  allowApiGeneration?: boolean
  runVoiceGenerator?: (configPath: string) => Promise<void>
}

function configId(config: Record<string, unknown>): string {
  const id = config.id
  if (typeof id !== "string" || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(id)) {
    throw new Error("Audio production requires a safe kebab-case config id")
  }
  return id
}

function asset(path: string, kind: ProducedAudioAsset["kind"], sceneIndex?: string): ProducedAudioAsset {
  const sizeBytes = statSync(path).size
  if (sizeBytes <= 0) throw new Error(`Generated audio asset is empty: ${path}`)
  return { kind, ...(sceneIndex ? { sceneIndex } : {}), path, sizeBytes }
}

export class AudioAssetProducer {
  private readonly root: string
  private readonly allowApiGeneration: boolean
  private readonly runVoiceGenerator: (configPath: string) => Promise<void>

  constructor(options: AudioProductionOptions = {}) {
    this.root = options.root ?? PROJECT_ROOT
    this.allowApiGeneration = options.allowApiGeneration ?? true
    this.runVoiceGenerator =
      options.runVoiceGenerator ??
      (async (configPath) => {
        await execFileAsync(
          resolve(this.root, "node_modules/.bin/tsx"),
          ["scripts/generate-voiceover.ts", configPath],
          {
            cwd: this.root,
            timeout: 10 * 60_000,
            maxBuffer: 2 * 1024 * 1024,
            env: process.env,
          },
        )
      })
  }

  async produce(input: AudioProductionInput): Promise<AudioAssetsManifest> {
    validateAudioChart(input.chart, input.sceneCount, listAudioLibrary(this.root))
    const id = configId(input.config)
    const assets: ProducedAudioAsset[] = []
    let voiceStatus: AudioAssetsManifest["voiceStatus"] = "skipped"
    let soundStatus: AudioAssetsManifest["soundStatus"] = "skipped"

    const narration = input.chart.voiceover
    const expectedScenes = Object.entries(narration?.scenes ?? {}).filter(([, text]) => text.trim().length > 0)
    if (expectedScenes.length > 0) {
      if (!this.allowApiGeneration) {
        throw new Error("Voice generation was explicitly disabled after CP3 approval")
      }
      let configPath = input.configPath
      let temporaryDirectory: string | undefined
      if (!configPath) {
        temporaryDirectory = mkdtempSync(join(tmpdir(), "claqueta-voice-"))
        configPath = join(temporaryDirectory, "config.json")
        writeFileSync(configPath, JSON.stringify(input.config))
      }
      try {
        await this.runVoiceGenerator(configPath)
      } finally {
        if (temporaryDirectory) rmSync(temporaryDirectory, { recursive: true, force: true })
      }
      for (const [sceneIndex] of expectedScenes) {
        const absolutePath = join(this.root, "public/voiceover", id, `${sceneIndex}.mp3`)
        if (!existsSync(absolutePath)) throw new Error(`Voice generator did not create scene ${sceneIndex} MP3`)
        assets.push(asset(absolutePath, "voiceover", sceneIndex))
      }
      voiceStatus = "completed"
    }

    const musicBed = input.chart.soundDesign.musicBed
    if (input.chart.soundDesign.sfx.length > 0) throw new Error("Generated SFX production is not supported")
    if (musicBed) {
      const source = join(this.root, "public/audio/library", `${musicBed.libraryId}.mp3`)
      if (!existsSync(source)) throw new Error(`Approved music library asset is missing: ${musicBed.libraryId}`)
      const outputDir = join(this.root, "public/audio", id)
      mkdirSync(outputDir, { recursive: true })
      const destination = join(outputDir, "music-bed.mp3")
      copyFileSync(source, destination)
      assets.push(asset(destination, "music"))
      soundStatus = "completed"
    }

    return { configId: id, voiceStatus, soundStatus, assets, generatedAt: new Date().toISOString() }
  }
}
