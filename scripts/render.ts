// scripts/render.ts
// Usage: npx tsx scripts/render.ts <path-to-config.json>

import { bundle } from "@remotion/bundler"
import { renderMedia, selectComposition } from "@remotion/renderer"
import { createHash } from "crypto"
import { readFileSync, readdirSync, existsSync, mkdirSync, cpSync, rmSync, statSync } from "fs"
import { execFileSync } from "child_process"
import path from "path"
import type { Beat, Timing } from "../src/utils/direction"
import { hasExplicitDirection } from "../src/utils/direction"
import { enableTailwindAndWorkspaceTypeScript } from "./remotion-webpack-override"

const configPath = process.argv[2]
if (!configPath) {
  console.error("Usage: npx tsx scripts/render.ts <path-to-config.json>")
  process.exit(1)
}

const CACHE_DIR = path.resolve("packages/render-service/jobs/.bundle-cache")
const MAX_CACHED_BUNDLES = 3

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

function cleanOldBundles(keepHash: string): void {
  if (!existsSync(CACHE_DIR)) return
  const entries = readdirSync(CACHE_DIR)
    .map((name) => ({ name, mtime: statSync(path.join(CACHE_DIR, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)

  for (const entry of entries.slice(MAX_CACHED_BUNDLES)) {
    if (entry.name !== keepHash) {
      rmSync(path.join(CACHE_DIR, entry.name), { recursive: true, force: true })
    }
  }
}

async function getCachedOrBundle(): Promise<string> {
  const hash = computeSourceHash()
  const cachedPath = path.join(CACHE_DIR, hash)

  if (existsSync(cachedPath)) {
    console.log(`📦 Using cached bundle (${hash})`)
    return cachedPath
  }

  console.log("📦 Bundling composition...")
  const bundleLocation = await bundle({
    entryPoint: path.resolve("./src/index.ts"),
    webpackOverride: enableTailwindAndWorkspaceTypeScript,
  })

  mkdirSync(CACHE_DIR, { recursive: true })
  cpSync(bundleLocation, cachedPath, { recursive: true })
  console.log(`📦 Bundle cached (${hash})`)
  cleanOldBundles(hash)
  return cachedPath
}

async function main() {
  const config = JSON.parse(readFileSync(configPath, "utf-8"))
  const outputPath = path.join(path.dirname(configPath), "output.mp4")
  const skipAudio = process.argv.includes("--skip-audio-generation")
  const directedScenes =
    config.scenes?.filter((scene: { timing?: Timing; beats?: Beat[] }) =>
      hasExplicitDirection(scene.timing, scene.beats),
    ).length ?? 0

  if (config.voiceover?.enabled && (!config.brief || directedScenes === 0)) {
    console.warn("⚠️  No clear director pass detected. Consider adding brief/timing/beats before final render.")
  }

  if (config.voiceover?.enabled && !skipAudio) {
    console.log("🎙️  Generating voiceover...")
    execFileSync("npx", ["tsx", "scripts/generate-voiceover.ts", configPath], {
      stdio: "inherit",
      shell: true,
    })
  }

  if (config.soundDesign?.enabled && !skipAudio) {
    console.log("🔊 Generating sound design...")
    execFileSync("npx", ["tsx", "scripts/generate-sound-design.ts", configPath], {
      stdio: "inherit",
      shell: true,
    })
  }

  const bundleLocation = await getCachedOrBundle()

  // Sync generated audio into the cached bundle so Remotion's server can find them
  for (const dir of ["voiceover", "audio"]) {
    const src = path.resolve("public", dir)
    const dest = path.join(bundleLocation, "public", dir)
    if (existsSync(src)) {
      cpSync(src, dest, { recursive: true })
    }
  }

  const compositionId = config.composition || "ClaudeCodeTutorial"
  console.log(`🔍 Selecting composition ${compositionId}...`)
  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: compositionId,
    inputProps: config,
  })

  console.log(`🎬 Rendering ${composition.durationInFrames} frames...`)
  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: "h264",
    outputLocation: outputPath,
    inputProps: config,
    onProgress: ({ progress }) => {
      process.stdout.write(`\r  ${Math.round(progress * 100)}%`)
    },
  })

  console.log(`\n✅ Video generated: ${outputPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
