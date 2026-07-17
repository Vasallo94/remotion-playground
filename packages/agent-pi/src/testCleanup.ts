import { existsSync, lstatSync, mkdtempSync, realpathSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, isAbsolute, join, relative, resolve } from "node:path"
import { PROJECT_ROOT } from "./paths.js"

const EXPECTED_TEMP_PREFIXES = [
  "agent-pi-action-executor-",
  "agent-pi-audio-planner-",
  "agent-pi-cleanup-",
  "agent-pi-researcher-",
  "agent-pi-resource-loader-",
  "agent-pi-specialist-",
  "agent-pi-tools-",
  "agent-pi-visual-recipe-",
  "claqueta-agent-pi-",
  "claqueta-audio-production-",
  "claqueta-quarantine-",
  "claqueta-scene-composer-",
  "claqueta-scene-qa-",
  "claqueta-scene-qa-repair-",
  "claqueta-stills-",
] as const

type ExpectedTempPrefix = (typeof EXPECTED_TEMP_PREFIXES)[number]

export const AGENT_PI_TEST_FIXTURE_DIRECTORY = join(PROJECT_ROOT, "content/tutorials/agent-pi-tools-test")

const registeredTempDirectories = new Set<string>()
const osTemporaryDirectory = realpathSync(tmpdir())
const fixtureDirectory = resolve(AGENT_PI_TEST_FIXTURE_DIRECTORY)

function isSubpath(parent: string, candidate: string): boolean {
  const pathRelative = relative(parent, candidate)
  return pathRelative === "" || (!pathRelative.startsWith("..") && !isAbsolute(pathRelative))
}

function assertExpectedPrefix(prefix: string): asserts prefix is ExpectedTempPrefix {
  if (!EXPECTED_TEMP_PREFIXES.includes(prefix as ExpectedTempPrefix)) {
    throw new Error(`Test temporary directory prefix is not registered: ${prefix}`)
  }
}

function assertDirectoryIsNotSymlink(target: string): void {
  const stat = lstatSync(target)
  if (stat.isSymbolicLink()) {
    throw new Error(`Refusing to recursively delete symbolic link: ${target}`)
  }
  if (!stat.isDirectory()) {
    throw new Error(`Refusing to recursively delete non-directory path: ${target}`)
  }
}

export function createTestTemporaryDirectory(prefix: ExpectedTempPrefix): string {
  assertExpectedPrefix(prefix)
  const directory = realpathSync(mkdtempSync(join(tmpdir(), prefix)))

  if (!isSubpath(osTemporaryDirectory, directory) || basename(directory).startsWith(prefix) === false) {
    throw new Error(`Refusing to register unexpected temporary directory: ${directory}`)
  }

  registeredTempDirectories.add(directory)
  return directory
}

export function cleanupTestDirectory(directory: string): void {
  const target = resolve(directory)
  if (target === fixtureDirectory && !existsSync(target)) return
  assertDirectoryIsNotSymlink(target)
  const realTarget = realpathSync(target)

  const isFreshRegisteredTemp =
    registeredTempDirectories.has(realTarget) &&
    isSubpath(osTemporaryDirectory, realTarget) &&
    EXPECTED_TEMP_PREFIXES.some((prefix) => basename(realTarget).startsWith(prefix))
  const isAllowlistedFixture = target === fixtureDirectory && realTarget === fixtureDirectory

  if (!isFreshRegisteredTemp && !isAllowlistedFixture) {
    throw new Error(
      `Refusing recursive test cleanup for ${target}: expected a freshly created registered OS temporary directory or ${fixtureDirectory}`,
    )
  }

  rmSync(realTarget, { recursive: true, force: false })
  registeredTempDirectories.delete(realTarget)
}
