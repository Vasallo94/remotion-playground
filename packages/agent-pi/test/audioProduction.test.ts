import assert from "node:assert/strict"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, it } from "node:test"
import { AudioAssetProducer } from "../src/audioProduction.js"
import { cleanupTestDirectory, createTestTemporaryDirectory } from "../src/testCleanup.js"
import type { AudioChart } from "../src/types.js"

const roots: string[] = []
function root(): string {
  const value = createTestTemporaryDirectory("claqueta-audio-production-")
  roots.push(value)
  return value
}
afterEach(() => roots.splice(0).forEach(cleanupTestDirectory))

const silent: AudioChart = {
  voiceover: null,
  soundDesign: { enabled: false, musicBed: null, sfx: [] },
  warnings: [],
}

describe("AudioAssetProducer", () => {
  it("completes silent production without process or API access", async () => {
    const producer = new AudioAssetProducer({
      root: root(),
      runVoiceGenerator: async () => assert.fail("voice generator must not run"),
    })
    const result = await producer.produce({
      config: { id: "silent-story" },
      configPath: "config.json",
      chart: silent,
      sceneCount: 1,
    })
    assert.equal(result.voiceStatus, "skipped")
    assert.equal(result.soundStatus, "skipped")
    assert.deepEqual(result.assets, [])
  })

  it("copies approved local music without credentials", async () => {
    const project = root()
    mkdirSync(join(project, "public/audio/library"), { recursive: true })
    writeFileSync(join(project, "public/audio/library/gentle-loop.mp3"), "audio")
    const chart: AudioChart = {
      voiceover: null,
      soundDesign: {
        enabled: true,
        musicBed: {
          libraryId: "gentle-loop",
          volume: -18,
          duckingVolume: -26,
          fadeInMs: 500,
          fadeOutMs: 500,
          duckingFadeMs: 300,
        },
        sfx: [],
      },
      warnings: [],
    }
    const result = await new AudioAssetProducer({ root: project }).produce({
      config: { id: "local-music" },
      configPath: "config.json",
      chart,
      sceneCount: 1,
    })
    assert.equal(result.soundStatus, "completed")
    assert.equal(result.assets[0]?.kind, "music")
    assert.equal(result.assets[0]?.sizeBytes, 5)
  })

  it("generates CP3-approved Gemini voiceover by default and verifies expected scene files", async () => {
    const project = root()
    const chart: AudioChart = {
      voiceover: {
        enabled: true,
        provider: "gemini",
        language: "es-ES",
        voiceId: "Leda",
        scenes: { "0": "Una narración aprobada." },
      },
      soundDesign: { enabled: false, musicBed: null, sfx: [] },
      warnings: [],
    }
    const input = {
      config: { id: "spoken-story", voiceover: chart.voiceover },
      configPath: "",
      chart,
      sceneCount: 1,
    }
    let temporaryConfigPath = ""
    const producer = new AudioAssetProducer({
      root: project,
      runVoiceGenerator: async (configPath) => {
        temporaryConfigPath = configPath
        assert.equal(existsSync(configPath), true)
        mkdirSync(join(project, "public/voiceover/spoken-story"), { recursive: true })
        writeFileSync(join(project, "public/voiceover/spoken-story/0.mp3"), "voice")
      },
    })
    const result = await producer.produce(input)
    assert.equal(result.voiceStatus, "completed")
    assert.equal(result.assets[0]?.sceneIndex, "0")
    assert.equal(existsSync(temporaryConfigPath), false)

    await assert.rejects(
      new AudioAssetProducer({ root: project, allowApiGeneration: false }).produce(input),
      /explicitly disabled/,
    )
  })
})
