// scripts/render-scene-stills.ts
// Usage: npx tsx scripts/render-scene-stills.ts <config.json> <output-dir>

import { bundle } from "@remotion/bundler"
import { renderStill, selectComposition } from "@remotion/renderer"
import { createHash } from "crypto"
import { readFileSync, readdirSync, existsSync, mkdirSync, cpSync, statSync } from "fs"
import path from "path"
import { enableTailwindAndWorkspaceTypeScript } from "./remotion-webpack-override"

const configPath = process.argv[2]
const outputDir = process.argv[3]

if (!configPath || !outputDir) {
  console.error("Usage: npx tsx scripts/render-scene-stills.ts <config.json> <output-dir>")
  process.exit(1)
}

const CACHE_DIR = path.resolve("packages/render-service/jobs/.bundle-cache")

function computeSourceHash(): string {
  const srcDir = path.resolve("src")
  const files = readdirSync(srcDir, { recursive: true, encoding: "utf-8" })
    .filter((f) => /\.(ts|tsx|css)$/.test(f))
    .sort()

  const hash = createHash("sha256")
  for (const file of files) {
    const fullPath = path.join(srcDir, file)
    if (statSync(fullPath).isFile()) {
      hash.update(readFileSync(fullPath))
    }
  }
  return hash.digest("hex").slice(0, 16)
}

async function getCachedOrBundle(): Promise<string> {
  const hash = computeSourceHash()
  const cachedPath = path.join(CACHE_DIR, hash)

  if (existsSync(cachedPath)) {
    return cachedPath
  }

  const bundleLocation = await bundle({
    entryPoint: path.resolve("./src/index.ts"),
    webpackOverride: enableTailwindAndWorkspaceTypeScript,
  })

  mkdirSync(CACHE_DIR, { recursive: true })
  cpSync(bundleLocation, cachedPath, { recursive: true })
  return cachedPath
}

async function main() {
  const config = JSON.parse(readFileSync(configPath, "utf-8"))
  mkdirSync(outputDir, { recursive: true })

  const bundleLocation = await getCachedOrBundle()

  const compositionId = config.composition || "ClaudeCodeTutorial"
  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: compositionId,
    inputProps: config,
  })

  const fps = config.fps || 30
  const configScenes: Array<{ durationInSeconds?: number }> = config.scenes ?? []

  // Scale config durations proportionally to actual composition length.
  // calculateMetadata may compress total duration (audio sync, transitions),
  // so raw durationInSeconds * fps diverges from real frame positions.
  const totalConfigFrames = configScenes.reduce((sum, s) => sum + Math.round((s.durationInSeconds ?? 5) * fps), 0)
  const scaleFactor = totalConfigFrames > 0 ? composition.durationInFrames / totalConfigFrames : 1

  const scenes: Array<{ index: number; path: string; frameNumber: number }> = []
  let cumulativeConfigFrames = 0

  for (let i = 0; i < configScenes.length; i++) {
    const scene = configScenes[i]
    const durationFrames = Math.round((scene.durationInSeconds ?? 5) * fps)

    const scaledStart = Math.floor(cumulativeConfigFrames * scaleFactor)
    const scaledDuration = Math.floor(durationFrames * scaleFactor)
    const targetFrame = scaledStart + Math.floor(scaledDuration * 0.6)
    const clampedFrame = Math.min(targetFrame, composition.durationInFrames - 1)

    const outputPath = path.join(outputDir, `scene-${i}.png`)

    await renderStill({
      composition,
      serveUrl: bundleLocation,
      output: outputPath,
      inputProps: config,
      frame: clampedFrame,
      imageFormat: "png",
    })

    scenes.push({ index: i, path: outputPath, frameNumber: clampedFrame })
    cumulativeConfigFrames += durationFrames
  }

  const manifest = { scenes }
  process.stdout.write(JSON.stringify(manifest))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
