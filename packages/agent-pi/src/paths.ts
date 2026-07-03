import { existsSync, mkdirSync, realpathSync } from "node:fs"
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path"

export const PROJECT_ROOT = resolve(process.env.ROOT_DIR ?? join(import.meta.dirname, "../../.."))

export const DEFAULT_GENERATED_DIR = ".generated/claqueta-pi"

const WRITE_ALLOWLIST = ["content/tutorials", ".generated", "public/audio", "public/voiceover"] as const

export function toPosixPath(path: string): string {
  return path.split(sep).join("/")
}

export function projectRelativePath(path: string): string {
  return toPosixPath(relative(PROJECT_ROOT, path))
}

function isSubpath(parent: string, candidate: string): boolean {
  const rel = relative(parent, candidate)
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))
}

function nearestExistingParent(path: string): string {
  let current = path
  while (!existsSync(current)) {
    const next = dirname(current)
    if (next === current) break
    current = next
  }
  return current
}

export function resolveProjectPath(input: string): string {
  const normalized = input.startsWith("@") ? input.slice(1) : input
  return isAbsolute(normalized) ? resolve(normalized) : resolve(PROJECT_ROOT, normalized)
}

export function assertProjectPath(input: string): string {
  const target = resolveProjectPath(input)
  const rootReal = realpathSync(PROJECT_ROOT)
  const existingParent = nearestExistingParent(target)
  const parentReal = realpathSync(existingParent)

  if (!isSubpath(rootReal, parentReal)) {
    throw new Error(`Path is outside project root: ${input}`)
  }

  return target
}

export function assertAllowedWritePath(input: string): string {
  const target = assertProjectPath(input)
  const rootReal = realpathSync(PROJECT_ROOT)
  const existingParent = nearestExistingParent(target)
  const parentReal = realpathSync(existingParent)

  if (!isSubpath(rootReal, parentReal)) {
    throw new Error(`Path is outside project root: ${input}`)
  }

  const rel = toPosixPath(relative(PROJECT_ROOT, target))
  const allowed = WRITE_ALLOWLIST.some((prefix) => rel === prefix || rel.startsWith(`${prefix}/`))
  if (!allowed) {
    throw new Error(`Write path is not allowlisted: ${rel}`)
  }

  return target
}

export function ensureDirectoryForFile(path: string): void {
  mkdirSync(dirname(path), { recursive: true })
}

export function ensureDirectory(path: string): void {
  mkdirSync(path, { recursive: true })
}

export function generatedThreadDir(threadId: string): string {
  return assertAllowedWritePath(join(DEFAULT_GENERATED_DIR, threadId))
}

export function slugify(value: string): string {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return normalized || "video"
}

export function contentTutorialDir(slug: string): string {
  return assertAllowedWritePath(join("content/tutorials", slugify(slug)))
}
