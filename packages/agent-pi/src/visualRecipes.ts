import {
  compileVisualRecipe,
  evaluateCompiledVisualProgram,
  verifyCompiledVisualProgramDigest,
} from "@claqueta/scene-contracts/compiler"
import type { CompiledVisualProgram, VisualRecipeBinding, VisualRecipeTemplate } from "@claqueta/scene-contracts"
import { contentHash } from "./contentHash.js"

export interface VisualRecipeEvidence {
  readonly schemaVersion: 1
  readonly recipeId: string
  readonly boundaries: readonly { atMs: number; stateDigest: string }[]
  readonly digest: string
}

export interface VisualRecipeArtifactData {
  readonly schemaVersion: 1
  readonly recipeId: string
  readonly targetId: string
  readonly sceneIndex: number
  readonly template: VisualRecipeTemplate
  readonly bindings: readonly VisualRecipeBinding[]
  readonly compiled: CompiledVisualProgram
  readonly evidenceDigest: string
  readonly digest: string
}

export interface ActiveVisualRecipeEntry {
  readonly sceneIndex: number
  readonly recipeId: string
  readonly recipeDigest: string
  readonly evidenceDigest: string
}

export interface ActiveVisualRecipeSet {
  readonly schemaVersion: 1
  readonly targetId: string
  readonly entries: readonly ActiveVisualRecipeEntry[]
  readonly digest: string
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function requireIdentity(value: string, name: string): void {
  if (!/^[a-z0-9][a-z0-9._-]{2,127}$/.test(value)) throw new Error(`${name} must be a stable lowercase identifier`)
}

function boundaryTimes(template: VisualRecipeTemplate): number[] {
  return [...new Set([0, ...template.program.events.map((event) => event.atMs), template.program.durationMs])].sort(
    (left, right) => left - right,
  )
}

export function buildVisualRecipeArtifacts(input: {
  targetId: string
  sceneIndex: number
  template: VisualRecipeTemplate
  bindings?: readonly VisualRecipeBinding[]
}): { recipe: VisualRecipeArtifactData; evidence: VisualRecipeEvidence } {
  requireIdentity(input.targetId, "targetId")
  if (!Number.isInteger(input.sceneIndex) || input.sceneIndex < 0)
    throw new Error("sceneIndex must be a non-negative integer")
  const template = clone(input.template)
  const bindings = clone(input.bindings ?? template.bindings)
  const compiled = clone(compileVisualRecipe(template, bindings))
  const boundaries = boundaryTimes(template).map((atMs) => ({
    atMs,
    stateDigest: contentHash(evaluateCompiledVisualProgram(compiled, atMs)),
  }))
  const evidenceDigest = contentHash({ schemaVersion: 1, boundaries })
  const identity = {
    schemaVersion: 1 as const,
    targetId: input.targetId,
    sceneIndex: input.sceneIndex,
    template,
    bindings,
    compiled,
    evidenceDigest,
  }
  const digest = contentHash(identity)
  const recipeId = `recipe.${digest}`
  return {
    recipe: { ...identity, recipeId, digest },
    evidence: { schemaVersion: 1, recipeId, boundaries, digest: evidenceDigest },
  }
}

function verifyVisualRecipeArtifact(recipe: VisualRecipeArtifactData): boolean {
  try {
    const rebuilt = buildVisualRecipeArtifacts({
      targetId: recipe.targetId,
      sceneIndex: recipe.sceneIndex,
      template: recipe.template,
      bindings: recipe.bindings,
    })
    return verifyCompiledVisualProgramDigest(recipe.compiled) && contentHash(recipe) === contentHash(rebuilt.recipe)
  } catch {
    return false
  }
}

export function verifyVisualRecipeArtifacts(recipe: VisualRecipeArtifactData, evidence: VisualRecipeEvidence): boolean {
  if (!verifyVisualRecipeArtifact(recipe)) return false
  const rebuilt = buildVisualRecipeArtifacts({
    targetId: recipe.targetId,
    sceneIndex: recipe.sceneIndex,
    template: recipe.template,
    bindings: recipe.bindings,
  })
  return contentHash(evidence) === contentHash(rebuilt.evidence) && evidence.recipeId === recipe.recipeId
}

export function verifyActiveVisualRecipeSet(activeSet: ActiveVisualRecipeSet): boolean {
  if (activeSet.schemaVersion !== 1 || activeSet.entries.some((entry) => entry.sceneIndex < 0)) return false
  try {
    requireIdentity(activeSet.targetId, "targetId")
  } catch {
    return false
  }
  const indexes = activeSet.entries.map((entry) => entry.sceneIndex)
  const sortedIndexes = [...indexes].sort((left, right) => left - right)
  if (
    new Set(indexes).size !== indexes.length ||
    indexes.some((index, position) => index !== sortedIndexes[position])
  ) {
    return false
  }
  const identity = { schemaVersion: 1 as const, targetId: activeSet.targetId, entries: activeSet.entries }
  return activeSet.digest === contentHash(identity)
}

export function buildActiveVisualRecipeSet(
  targetId: string,
  recipe: VisualRecipeArtifactData,
  previous?: ActiveVisualRecipeSet,
): ActiveVisualRecipeSet {
  requireIdentity(targetId, "targetId")
  if (!verifyVisualRecipeArtifact(recipe)) throw new Error("Visual Recipe is invalid or stale")
  if (previous && !verifyActiveVisualRecipeSet(previous))
    throw new Error("Previous active Visual Recipe set is invalid")
  if (recipe.targetId !== targetId || (previous && previous.targetId !== targetId)) {
    throw new Error("Visual Recipe activation target does not match")
  }
  const entries = [
    ...(previous?.entries.filter((entry) => entry.sceneIndex !== recipe.sceneIndex) ?? []),
    {
      sceneIndex: recipe.sceneIndex,
      recipeId: recipe.recipeId,
      recipeDigest: recipe.digest,
      evidenceDigest: recipe.evidenceDigest,
    },
  ].sort((left, right) => left.sceneIndex - right.sceneIndex)
  const identity = { schemaVersion: 1 as const, targetId, entries }
  return { ...identity, digest: contentHash(identity) }
}

export function projectActiveVisualRecipes(
  config: Record<string, unknown>,
  activeSet: ActiveVisualRecipeSet,
  recipes: readonly VisualRecipeArtifactData[],
): Record<string, unknown> {
  const scenes = Array.isArray(config.scenes) ? clone(config.scenes) : null
  if (!scenes) throw new Error("Config scenes are required for Visual Recipe projection")
  if (!verifyActiveVisualRecipeSet(activeSet)) throw new Error("Active Visual Recipe set is invalid")
  const byId = new Map(recipes.map((recipe) => [recipe.recipeId, recipe]))
  for (const entry of activeSet.entries) {
    const recipe = byId.get(entry.recipeId)
    if (
      !recipe ||
      !verifyVisualRecipeArtifact(recipe) ||
      recipe.targetId !== activeSet.targetId ||
      recipe.sceneIndex !== entry.sceneIndex ||
      recipe.digest !== entry.recipeDigest ||
      recipe.evidenceDigest !== entry.evidenceDigest
    ) {
      throw new Error(`Active Visual Recipe '${entry.recipeId}' is missing or stale`)
    }
    if (entry.sceneIndex >= scenes.length)
      throw new Error(`Visual Recipe scene index ${entry.sceneIndex} is out of range`)
    scenes[entry.sceneIndex] = {
      type: "custom",
      componentId: "visual-program",
      props: { compiled: clone(recipe.compiled) },
      durationInSeconds: recipe.compiled.durationMs / 1000,
    }
  }
  return { ...clone(config), scenes, activeVisualRecipeSetDigest: activeSet.digest }
}
