import { createHash } from "node:crypto"
import {
  DEFAULT_VISUAL_PROGRAM_TARGET_ADAPTER,
  VISUAL_PROGRAM_COMPILER_VERSION,
  VISUAL_PROGRAM_RENDERER_VERSION,
  VISUAL_PROGRAM_SCHEMA_VERSION,
  type CompiledVisualProgram,
  type VisualBoundary,
  type VisualProgram,
  type VisualProgramState,
  type VisualProgramStateEdge,
  type VisualProgramStateIsolation,
  type VisualProgramStateNode,
  type VisualProgramStatePulse,
  type VisualRecipeBinding,
  type VisualRecipeTemplate,
  type VisualStateChange,
  canonicalizeCompiledVisualProgram,
  cloneAndFreezeVisualProgram,
  replaceTextBindings,
  validateVisualProgram,
  validateVisualRecipeBindings,
  validateVisualRecipeTemplate,
  validateCompiledVisualProgram,
} from "./visualProgramContract.js"

export { DEFAULT_VISUAL_PROGRAM_TARGET_ADAPTER, VISUAL_PROGRAM_COMPILER_VERSION, VISUAL_PROGRAM_RENDERER_VERSION }

export interface VisualProgramCompileOptions {
  targetAdapter?: string
  compilerVersion?: string
  rendererVersion?: string
  bindings?: readonly VisualRecipeBinding[]
}

export interface VisualProgramCompilationInput {
  program: VisualProgram
  bindings: readonly VisualRecipeBinding[]
  targetAdapter: string
  schemaVersion: number
  compilerVersion: string
  rendererVersion: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
function clone<T>(value: T): T {
  if (Array.isArray(value)) return value.map((entry) => clone(entry)) as T
  if (isRecord(value)) {
    const result: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value)) result[key] = clone(entry)
    return result as T
  }
  return value
}
function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ")
}
function compareTargeted(left: { target: string; id: string }, right: { target: string; id: string }): number {
  return compareStrings(`${left.target}:${left.id}`, `${right.target}:${right.id}`)
}
function compareId(left: { id: string }, right: { id: string }): number {
  return compareStrings(left.id, right.id)
}
function canonicalPosition(index: number, count: number): { x: number; y: number } {
  const columns = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(count))))
  const rows = Math.ceil(count / columns)
  const column = index % columns
  const row = Math.floor(index / columns)
  return { x: (column + 1) / (columns + 1), y: (row + 1) / (rows + 1) }
}
function normalizeProgram(program: VisualProgram): VisualProgram {
  const normalized = clone(program)
  const panels = normalized.panels
    .map((panel) => ({
      ...panel,
      label: panel.label === undefined ? undefined : normalizeText(panel.label),
      nodes: [...panel.nodes].sort(compareId).map((node, index, allNodes) => ({
        ...node,
        label: normalizeText(node.label),
        text: node.text === undefined ? undefined : normalizeText(node.text),
        position: node.position ?? canonicalPosition(index, allNodes.length),
      })),
      edges: [...panel.edges]
        .map((edge) => ({ ...edge, label: edge.label === undefined ? undefined : normalizeText(edge.label) }))
        .sort(compareId),
    }))
    .sort((left, right) => compareStrings(left.id, right.id))
  return {
    ...normalized,
    panels,
    events: [...normalized.events]
      .sort((left, right) => left.atMs - right.atMs || compareStrings(left.id, right.id))
      .map((event) => ({
        ...event,
        changes: [...event.changes].sort(compareTargeted),
        pulses: event.pulses ? [...event.pulses].sort(compareTargeted) : undefined,
        isolation: event.isolation ? [...event.isolation].sort(compareTargeted) : undefined,
        boundaries: event.boundaries
          ? [...event.boundaries]
              .sort((left, right) => compareStrings(left.id, right.id))
              .map((boundary) => ({ ...boundary, nodeIds: [...boundary.nodeIds].sort(compareStrings) }))
          : undefined,
      })),
    assertions: [...normalized.assertions]
      .map((assertion) => ({
        ...assertion,
        checks: [...assertion.checks].sort(compareTargeted),
        isolation: assertion.isolation ? [...assertion.isolation].sort(compareTargeted) : undefined,
      }))
      .sort((left, right) => left.atMs - right.atMs || compareStrings(left.id, right.id)),
  }
}
function stateKey(target: string, id: string): string {
  return `${target}:${id}`
}
function applyChanges(
  nodes: VisualProgramStateNode[],
  edges: VisualProgramStateEdge[],
  changes: readonly VisualStateChange[],
): void {
  const nodeById = new Map(nodes.map((entry) => [entry.id, entry]))
  const edgeById = new Map(edges.map((entry) => [entry.id, entry]))
  for (const change of changes) {
    const target = change.target === "node" ? nodeById.get(change.id) : edgeById.get(change.id)
    if (target) target.state = change.state as never
  }
}
function initialState(program: VisualProgram): VisualProgramState {
  return {
    atMs: 0,
    nodes: program.panels
      .flatMap((panel) => panel.nodes.map(({ id, initialState: state }) => ({ id, state })))
      .sort(compareId),
    edges: program.panels
      .flatMap((panel) => panel.edges.map(({ id, initialState: state }) => ({ id, state })))
      .sort(compareId),
    pulses: [],
    isolation: [],
    boundaries: [],
  }
}
function makeTimeline(program: VisualProgram): readonly VisualProgramState[] {
  const first = initialState(program)
  const nodes = first.nodes.map((entry) => ({ ...entry }))
  const edges = first.edges.map((entry) => ({ ...entry }))
  const isolation = new Map<string, VisualProgramStateIsolation>()
  const boundaries = new Map<string, VisualBoundary>()
  const pulseStarts = new Map<string, VisualProgramStatePulse>()
  const states: VisualProgramState[] = [first]
  for (const event of program.events) {
    applyChanges(nodes, edges, event.changes)
    for (const entry of event.isolation ?? []) isolation.set(stateKey(entry.target, entry.id), { ...entry })
    for (const entry of event.boundaries ?? []) boundaries.set(entry.id, { ...entry, nodeIds: [...entry.nodeIds] })
    for (const pulse of event.pulses ?? [])
      pulseStarts.set(stateKey(pulse.target, pulse.id), {
        target: pulse.target,
        id: pulse.id,
        untilMs: event.atMs + pulse.durationMs,
      })
    states.push({
      atMs: event.atMs,
      nodes: nodes.map((entry) => ({ ...entry })),
      edges: edges.map((entry) => ({ ...entry })),
      pulses: [...pulseStarts.values()].filter((pulse) => pulse.untilMs > event.atMs).sort(compareTargeted),
      isolation: [...isolation.values()].sort(compareTargeted),
      boundaries: [...boundaries.values()].sort((left, right) => compareStrings(left.id, right.id)),
    })
  }
  const last = states[states.length - 1]
  if (last && last.atMs < program.durationMs)
    states.push({
      ...last,
      atMs: program.durationMs,
      nodes: last.nodes.map((entry) => ({ ...entry })),
      edges: last.edges.map((entry) => ({ ...entry })),
      pulses: last.pulses.filter((pulse) => pulse.untilMs > program.durationMs),
    })
  return states
}
function stateAtBoundary(timeline: readonly VisualProgramState[], atMs: number): VisualProgramState {
  let selected = timeline[0]
  for (const state of timeline) {
    if (state.atMs > atMs) break
    selected = state
  }
  return selected ?? { atMs: 0, nodes: [], edges: [], pulses: [], isolation: [], boundaries: [] }
}
function assertBehavior(program: VisualProgram, timeline: readonly VisualProgramState[]): void {
  for (const assertion of program.assertions) {
    const state = stateAtBoundary(timeline, assertion.atMs)
    for (const check of assertion.checks) {
      const actual =
        check.target === "node"
          ? state.nodes.find((entry) => entry.id === check.id)?.state
          : state.edges.find((entry) => entry.id === check.id)?.state
      if (actual !== check.state)
        throw new Error(
          `Assertion '${assertion.id}' expected ${check.target} '${check.id}' to be ${check.state}, got ${actual ?? "missing"}`,
        )
    }
    for (const expected of assertion.isolation ?? []) {
      const actual = state.isolation.find((entry) => entry.target === expected.target && entry.id === expected.id)?.mode
      if (actual !== expected.mode)
        throw new Error(
          `Assertion '${assertion.id}' expected isolation ${expected.target}:${expected.id} to be ${expected.mode}`,
        )
    }
  }
}
function ensureBindings(bindings: readonly VisualRecipeBinding[]): readonly VisualRecipeBinding[] {
  if (!validateVisualRecipeBindings(bindings)) throw new Error("Invalid visual recipe bindings")
  return [...bindings].sort((left, right) => compareStrings(left.id, right.id))
}
function ensureVersion(value: string | undefined, expected: string, name: string): string {
  const result = value ?? expected
  if (result !== expected) throw new Error(`${name} must be ${expected}`)
  return result
}

function normalizeCompilationInput(input: VisualProgramCompilationInput): VisualProgramCompilationInput {
  return {
    program: normalizeProgram(input.program),
    bindings: [...input.bindings]
      .sort((left, right) => compareStrings(left.id, right.id))
      .map((binding) => ({ ...binding })),
    targetAdapter: input.targetAdapter,
    schemaVersion: input.schemaVersion,
    compilerVersion: input.compilerVersion,
    rendererVersion: input.rendererVersion,
  }
}

export function canonicalizeVisualProgramInput(input: VisualProgramCompilationInput): string {
  // This is the complete normalized lineage tuple, not merely the renderer output.
  const value = normalizeCompilationInput(input) as unknown as Record<string, unknown>
  const canonical = (entry: unknown): unknown => {
    if (entry === null || typeof entry === "string" || typeof entry === "boolean" || typeof entry === "number")
      return Object.is(entry, -0) ? 0 : entry
    if (Array.isArray(entry)) return entry.map(canonical)
    if (isRecord(entry)) {
      const result: Record<string, unknown> = {}
      for (const key of Object.keys(entry).sort(compareStrings))
        if (entry[key] !== undefined) result[key] = canonical(entry[key])
      return result
    }
    throw new Error("Cannot canonicalize unsupported input")
  }
  return JSON.stringify(canonical(value))
}

/** Node-only SHA-256. Browser consumers must only validate the compiled shape. */
export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

export function digestVisualProgramInput(input: VisualProgramCompilationInput): string {
  return sha256(canonicalizeVisualProgramInput(input))
}

export function digestCompiledVisualProgram(value: Omit<CompiledVisualProgram, "digest">): string {
  return sha256(canonicalizeCompiledVisualProgram(value))
}

/** Node-only integrity check for compiler/persistence boundaries; the browser contract checks shape and semantics. */
export function verifyCompiledVisualProgramDigest(value: unknown): value is CompiledVisualProgram {
  const validation = validateCompiledVisualProgram(value)
  if (!validation.valid || !isRecord(value) || typeof value.digest !== "string") return false
  const copy = { ...value }
  delete copy.digest
  return digestCompiledVisualProgram(copy as Omit<CompiledVisualProgram, "digest">) === value.digest
}

function compileVisualProgramInternal(
  program: VisualProgram,
  options: VisualProgramCompileOptions = {},
  allowRecipeBindings = false,
): CompiledVisualProgram {
  const validation = validateVisualProgram(program)
  if (!validation.valid) throw new Error(`Invalid visual program: ${validation.errors.join("; ")}`)
  const normalizedProgram = normalizeProgram(program)
  const requestedBindings = options.bindings ?? []
  if (!allowRecipeBindings && requestedBindings.length > 0)
    throw new Error("Direct visual programs cannot declare recipe bindings")
  const bindings = ensureBindings(requestedBindings)
  const targetAdapter = options.targetAdapter ?? DEFAULT_VISUAL_PROGRAM_TARGET_ADAPTER
  if (targetAdapter !== DEFAULT_VISUAL_PROGRAM_TARGET_ADAPTER)
    throw new Error(`targetAdapter must be ${DEFAULT_VISUAL_PROGRAM_TARGET_ADAPTER}`)
  const compilerVersion = ensureVersion(options.compilerVersion, VISUAL_PROGRAM_COMPILER_VERSION, "compilerVersion")
  const rendererVersion = ensureVersion(options.rendererVersion, VISUAL_PROGRAM_RENDERER_VERSION, "rendererVersion")
  const timeline = makeTimeline(normalizedProgram)
  assertBehavior(normalizedProgram, timeline)
  const compilationInput: VisualProgramCompilationInput = {
    program: normalizedProgram,
    bindings,
    targetAdapter,
    schemaVersion: VISUAL_PROGRAM_SCHEMA_VERSION,
    compilerVersion,
    rendererVersion,
  }
  const propsWithoutDigest = {
    version: VISUAL_PROGRAM_SCHEMA_VERSION,
    compilerVersion,
    rendererVersion,
    targetAdapter,
    durationMs: normalizedProgram.durationMs,
    panels: normalizedProgram.panels,
    timeline,
    bindings,
    assertions: normalizedProgram.assertions,
    inputDigest: digestVisualProgramInput(compilationInput),
  } satisfies Omit<CompiledVisualProgram, "digest">
  const result: CompiledVisualProgram = {
    ...propsWithoutDigest,
    digest: digestCompiledVisualProgram(propsWithoutDigest),
  }
  const compiledValidation = validateCompiledVisualProgram(result)
  if (!compiledValidation.valid)
    throw new Error(`Compiler produced invalid renderer props: ${compiledValidation.errors.join("; ")}`)
  return cloneAndFreezeVisualProgram(result)
}

export function compileVisualProgram(
  program: VisualProgram,
  options: VisualProgramCompileOptions = {},
): CompiledVisualProgram {
  return compileVisualProgramInternal(program, options)
}

export function compileVisualRecipe(
  template: VisualRecipeTemplate,
  bindings: readonly VisualRecipeBinding[] = template.bindings,
  options: VisualProgramCompileOptions = {},
): CompiledVisualProgram {
  const templateValidation = validateVisualRecipeTemplate(template)
  if (!templateValidation.valid)
    throw new Error(`Invalid visual recipe template: ${templateValidation.errors.join("; ")}`)
  const selected = ensureBindings(bindings)
  const expected = [...template.bindings].sort((left, right) => compareStrings(left.id, right.id))
  if (
    selected.length !== expected.length ||
    selected.some((binding, index) => binding.id !== expected[index]?.id || binding.type !== expected[index]?.type)
  )
    throw new Error("Recipe bindings must exactly match the template binding IDs and types")
  const boundProgram = replaceTextBindings(template.program, selected)
  return compileVisualProgramInternal(boundProgram, { ...options, bindings: selected }, true)
}

export function evaluateCompiledVisualProgram(compiled: CompiledVisualProgram, atMs: number): VisualProgramState {
  if (!Number.isFinite(atMs) || atMs < 0 || atMs > compiled.durationMs)
    throw new Error("atMs must be a finite time within the program duration")
  const selected = stateAtBoundary(compiled.timeline, atMs)
  return { ...selected, atMs, pulses: selected.pulses.filter((pulse) => pulse.untilMs > atMs) }
}

export const compileVisualProgramProps = compileVisualProgram
export const canonicalVisualProgramInput = canonicalizeVisualProgramInput
