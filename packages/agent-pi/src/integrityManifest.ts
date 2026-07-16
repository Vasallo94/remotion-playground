import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync, readdirSync } from "node:fs"
import { relative, resolve } from "node:path"

const MANIFEST_VERSION = 1
const EXCLUDED_DIRECTORIES = new Set([
  ".cache",
  ".generated",
  ".git",
  ".next",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "public/audio",
  "public/voiceover",
])
const SOURCE_EXTENSIONS = new Set([".cjs", ".css", ".js", ".json", ".mjs", ".ts", ".tsx", ".yaml", ".yml"])
const ROOT_CONFIG_FILES = new Set([
  "Dockerfile",
  "docker-compose.yml",
  "eslint.config.js",
  "eslint.config.mjs",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "remotion.config.ts",
  "tsconfig.json",
  "vite.config.ts",
])

export interface IntegrityManifest {
  version: number
  createdAt: string
  root: string
  gitStatus: string[]
  files: Record<string, string>
}

export interface ManifestComparison {
  added: string[]
  changed: string[]
  removed: string[]
  gitStatusChanged: boolean
}

function toPosixPath(path: string): string {
  return path.replace(/\\/g, "/")
}

function extension(path: string): string {
  const index = path.lastIndexOf(".")
  return index === -1 ? "" : path.slice(index)
}

function isExcluded(relativePath: string): boolean {
  const segments = toPosixPath(relativePath).split("/")
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]
    const prefix = segments.slice(0, index + 1).join("/")
    if (segment && EXCLUDED_DIRECTORIES.has(segment)) return true
    if (EXCLUDED_DIRECTORIES.has(prefix)) return true
  }
  return relativePath.endsWith("/output.mp4")
}

function shouldHash(relativePath: string): boolean {
  const normalized = toPosixPath(relativePath)
  const [topLevel] = normalized.split("/")

  if (topLevel === "_project_specs" || topLevel === "docs") return normalized.endsWith(".md")
  if (["packages", "scripts", "src", "content"].includes(topLevel ?? "")) {
    return SOURCE_EXTENSIONS.has(extension(normalized))
  }
  return (
    !normalized.includes("/") &&
    (ROOT_CONFIG_FILES.has(normalized) || SOURCE_EXTENSIONS.has(extension(normalized)) || normalized.endsWith(".md"))
  )
}

function listFiles(root: string, current = root): string[] {
  return readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = resolve(current, entry.name)
    const relativePath = toPosixPath(relative(root, absolutePath))

    if (isExcluded(relativePath)) return []
    if (entry.isDirectory()) return listFiles(root, absolutePath)
    if (!entry.isFile() || !shouldHash(relativePath)) return []
    return [relativePath]
  })
}

export function collectIntegrityHashes(root: string): Record<string, string> {
  const resolvedRoot = resolve(root)
  const hashes: Record<string, string> = {}

  for (const path of listFiles(resolvedRoot).sort()) {
    hashes[path] = createHash("sha256")
      .update(readFileSync(resolve(resolvedRoot, path)))
      .digest("hex")
  }

  return hashes
}

export function readGitStatus(root: string): string[] {
  const output = execFileSync("git", ["status", "--short", "--branch"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
  return output.split("\n").filter(Boolean)
}

export function createIntegrityManifest(root: string): IntegrityManifest {
  const resolvedRoot = resolve(root)
  return {
    version: MANIFEST_VERSION,
    createdAt: new Date().toISOString(),
    root: resolvedRoot,
    gitStatus: readGitStatus(resolvedRoot),
    files: collectIntegrityHashes(resolvedRoot),
  }
}

export function compareIntegrityManifests(previous: IntegrityManifest, current: IntegrityManifest): ManifestComparison {
  const previousPaths = new Set(Object.keys(previous.files))
  const currentPaths = new Set(Object.keys(current.files))
  const added = [...currentPaths].filter((path) => !previousPaths.has(path)).sort()
  const removed = [...previousPaths].filter((path) => !currentPaths.has(path)).sort()
  const changed = [...currentPaths]
    .filter((path) => previous.files[path] !== current.files[path])
    .filter((path) => previousPaths.has(path))
    .sort()

  return {
    added,
    changed,
    removed,
    gitStatusChanged: JSON.stringify(previous.gitStatus) !== JSON.stringify(current.gitStatus),
  }
}

export function hasManifestChanges(comparison: ManifestComparison): boolean {
  return (
    comparison.added.length > 0 ||
    comparison.changed.length > 0 ||
    comparison.removed.length > 0 ||
    comparison.gitStatusChanged
  )
}

export function formatManifestComparison(comparison: ManifestComparison, comparedPath: string): string {
  if (!hasManifestChanges(comparison)) return `Integrity comparison clean: ${comparedPath}`

  const lines = [`Integrity comparison found changes against ${comparedPath}:`]
  if (comparison.gitStatusChanged) lines.push("- Git status changed: inspect `git status --short` before continuing.")
  for (const [label, paths] of [
    ["Added", comparison.added],
    ["Changed", comparison.changed],
    ["Removed", comparison.removed],
  ] as const) {
    if (paths.length > 0) lines.push(`- ${label}: ${paths.join(", ")}`)
  }
  lines.push("Review these paths before accepting a new baseline; do not use destructive Git recovery commands.")
  return lines.join("\n")
}
