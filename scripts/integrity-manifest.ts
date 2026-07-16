import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, relative, resolve } from "node:path"
import {
  compareIntegrityManifests,
  createIntegrityManifest,
  formatManifestComparison,
  hasManifestChanges,
  type IntegrityManifest,
} from "../packages/agent-pi/src/integrityManifest.js"

const DEFAULT_OUTPUT = ".generated/workspace-integrity.json"

function isSubpath(parent: string, candidate: string): boolean {
  const pathRelative = relative(parent, candidate)
  return pathRelative === "" || (!pathRelative.startsWith("..") && !isAbsolute(pathRelative))
}

interface CliOptions {
  comparePath?: string
  outputPath: string
  root: string
}

function parseArguments(argumentsList: string[]): CliOptions {
  let root = process.cwd()
  let outputPath: string | undefined
  let comparePath: string | undefined

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index]
    const value = argumentsList[index + 1]
    if (argument === "--root" && value) {
      root = resolve(value)
      index += 1
    } else if (argument === "--output" && value) {
      outputPath = value
      index += 1
    } else if (argument === "--compare" && value) {
      comparePath = value
      index += 1
    } else if (argument === "--help") {
      console.log("Usage: pnpm integrity:manifest [-- --compare <manifest> --output <manifest> --root <worktree>]")
      process.exit(0)
    } else {
      throw new Error(`Unknown or incomplete argument: ${argument}`)
    }
  }

  const resolvedRoot = resolve(root)
  const resolvedOutput = resolve(resolvedRoot, outputPath ?? DEFAULT_OUTPUT)
  if (!isSubpath(resolvedRoot, resolvedOutput)) {
    throw new Error(`Manifest output must stay inside the selected worktree: ${resolvedOutput}`)
  }

  const resolvedCompare = comparePath ? resolve(resolvedRoot, comparePath) : undefined
  if (resolvedCompare === resolvedOutput) {
    throw new Error(
      "Compare input and manifest output must differ so the baseline is not overwritten before comparison",
    )
  }

  return {
    comparePath: resolvedCompare,
    outputPath: resolvedOutput,
    root: resolvedRoot,
  }
}

function main(): void {
  const options = parseArguments(process.argv.slice(2))
  const manifest = createIntegrityManifest(options.root)
  mkdirSync(dirname(options.outputPath), { recursive: true })
  writeFileSync(options.outputPath, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`Wrote integrity manifest: ${relative(options.root, options.outputPath)}`)

  if (!options.comparePath) return
  const previous = JSON.parse(readFileSync(options.comparePath, "utf8")) as IntegrityManifest
  const comparison = compareIntegrityManifests(previous, manifest)
  console.log(formatManifestComparison(comparison, relative(options.root, options.comparePath)))
  if (hasManifestChanges(comparison)) process.exitCode = 1
}

main()
