export const VISUAL_PROGRAM_SCHEMA_VERSION = 1 as const
export const VISUAL_PROGRAM_VERSION = VISUAL_PROGRAM_SCHEMA_VERSION
export const VISUAL_RECIPE_SCHEMA_VERSION = 1 as const
export const VISUAL_RECIPE_VERSION = VISUAL_RECIPE_SCHEMA_VERSION
export const VISUAL_PROGRAM_COMPILER_VERSION = "visual-program-compiler-1" as const
export const VISUAL_PROGRAM_RENDERER_VERSION = "visual-program-renderer-1" as const
export const DEFAULT_VISUAL_PROGRAM_TARGET_ADAPTER = "claqueta.remotion" as const

export type VisualNodeState = "idle" | "active" | "completed" | "blocked" | "contained" | "isolated"
export type VisualEdgeState = "idle" | "active" | "completed" | "blocked" | "isolated"
export type VisualIsolationMode = "isolated" | "contained" | "uncontained"
export type VisualStateTarget = "node" | "edge"

export interface NormalizedCoordinate {
  x: number
  y: number
}
export interface VisualProgramNode {
  id: string
  label: string
  text?: string
  /** Omit to let the Node-only compiler assign a canonical position. */
  position?: NormalizedCoordinate
  initialState: VisualNodeState
}
export interface VisualProgramEdge {
  id: string
  from: string
  to: string
  label?: string
  initialState: VisualEdgeState
}
export interface VisualProgramPanel {
  id: string
  label?: string
  nodes: readonly VisualProgramNode[]
  edges: readonly VisualProgramEdge[]
}
export interface VisualStateChange {
  target: VisualStateTarget
  id: string
  state: VisualNodeState | VisualEdgeState
}
export interface VisualPulse {
  target: VisualStateTarget
  id: string
  durationMs: number
}
export interface VisualIsolation {
  target: VisualStateTarget
  id: string
  mode: VisualIsolationMode
}
export interface VisualBoundary {
  id: string
  panelId: string
  nodeIds: readonly string[]
  state: "open" | "closed"
  label?: string
}
export interface VisualProgramEvent {
  id: string
  atMs: number
  changes: readonly VisualStateChange[]
  pulses?: readonly VisualPulse[]
  isolation?: readonly VisualIsolation[]
  boundaries?: readonly VisualBoundary[]
}
export interface VisualAssertionCheck {
  target: VisualStateTarget
  id: string
  state: VisualNodeState | VisualEdgeState
}
export interface VisualAssertionIsolation {
  target: VisualStateTarget
  id: string
  mode: VisualIsolationMode
}
export interface VisualAssertion {
  id: string
  atMs: number
  checks: readonly VisualAssertionCheck[]
  isolation?: readonly VisualAssertionIsolation[]
}
export interface VisualProgram {
  version: typeof VISUAL_PROGRAM_SCHEMA_VERSION
  durationMs: number
  panels: readonly VisualProgramPanel[]
  events: readonly VisualProgramEvent[]
  assertions: readonly VisualAssertion[]
}
export interface VisualProgramStateNode {
  id: string
  state: VisualNodeState
}
export interface VisualProgramStateEdge {
  id: string
  state: VisualEdgeState
}
export interface VisualProgramStateIsolation {
  target: VisualStateTarget
  id: string
  mode: VisualIsolationMode
}
export interface VisualProgramStatePulse {
  target: VisualStateTarget
  id: string
  untilMs: number
}
export interface VisualProgramState {
  atMs: number
  nodes: readonly VisualProgramStateNode[]
  edges: readonly VisualProgramStateEdge[]
  pulses: readonly VisualProgramStatePulse[]
  isolation: readonly VisualProgramStateIsolation[]
  boundaries: readonly VisualBoundary[]
}

/** v1 bindings are deliberately text-only; typed substitution is deferred to a later recipe version. */
export type VisualBindingValue = string
export type VisualBindingType = "text"
export interface VisualRecipeBinding {
  id: string
  type: VisualBindingType
  value: VisualBindingValue
}
export interface VisualRecipeTemplate {
  version: typeof VISUAL_RECIPE_SCHEMA_VERSION
  templateId: string
  program: VisualProgram
  bindings: readonly VisualRecipeBinding[]
}

export interface CompiledVisualProgram {
  version: typeof VISUAL_PROGRAM_SCHEMA_VERSION
  compilerVersion: string
  rendererVersion: string
  targetAdapter: string
  durationMs: number
  panels: readonly VisualProgramPanel[]
  timeline: readonly VisualProgramState[]
  bindings: readonly VisualRecipeBinding[]
  assertions: readonly VisualAssertion[]
  /** SHA-256 of the complete normalized compilation input tuple. */
  inputDigest: string
  /** SHA-256 of the renderer props, including inputDigest. */
  digest: string
}

export interface VisualProgramContractValidation {
  valid: boolean
  errors: string[]
  metrics: { panels: number; nodes: number; edges: number; events: number; assertions: number; words: number }
}

export const VISUAL_PROGRAM_LIMITS = {
  panels: 2,
  nodes: 32,
  edges: 48,
  events: 48,
  assertions: 96,
  durationMs: 30_000,
  textLength: 160,
  sourceWords: 600,
  compiledWords: 600,
  changesPerEvent: 96,
  pulsesPerEvent: 32,
  isolationPerEvent: 32,
  boundariesPerEvent: 8,
  boundaryNodes: 16,
  checksPerAssertion: 96,
  isolationPerAssertion: 32,
  totalChanges: 768,
  totalPulses: 256,
  totalIsolation: 256,
  totalBoundaries: 128,
  totalBoundaryNodes: 512,
  totalChecks: 768,
  totalAssertionIsolation: 256,
  sourceSerializedBytes: 160_000,
  compiledSerializedBytes: 8_000_000,
  compiledTimelineStates: 50,
} as const

export const VISUAL_PROGRAM_CONTRACT_SUMMARY = {
  version: VISUAL_PROGRAM_SCHEMA_VERSION,
  sceneKeys: ["version", "durationMs", "panels", "events", "assertions"],
  operations: ["state-change", "pulse", "isolation", "boundary"],
  limits: VISUAL_PROGRAM_LIMITS,
  panels: 2,
  coordinates: "normalized-0-to-1",
  runtime: "precomputed-state-only",
} as const

const NODE_STATES = ["idle", "active", "completed", "blocked", "contained", "isolated"] as const
const EDGE_STATES = ["idle", "active", "completed", "blocked", "isolated"] as const
const ISOLATION_MODES = ["isolated", "contained", "uncontained"] as const
const TARGETS = ["node", "edge"] as const
const IDENTIFIER = /^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/

type MutableMetrics = VisualProgramContractValidation["metrics"]
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
function onlyKeys(value: Record<string, unknown>, allowed: readonly string[], path: string, errors: string[]): void {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) errors.push(`${path}.${key} is not allowed`)
}
function requiredKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  path: string,
  errors: string[],
): void {
  for (const key of required) if (!(key in value)) errors.push(`${path}.${key} is required`)
}
function exactRecord(
  value: unknown,
  required: readonly string[],
  allowed: readonly string[],
  path: string,
  errors: string[],
): value is Record<string, unknown> {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`)
    return false
  }
  requiredKeys(value, required, path, errors)
  onlyKeys(value, allowed, path, errors)
  return true
}
function nonEmptyString(value: unknown, path: string, errors: string[], max = 80): value is string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > max) {
    errors.push(`${path} must be a non-empty string of at most ${max} characters`)
    return false
  }
  if (/\b(?:https?|javascript|data):/i.test(value)) errors.push(`${path} must not contain a URL`)
  return true
}
function identifier(value: unknown, path: string, errors: string[], max = 48): value is string {
  if (!nonEmptyString(value, path, errors, max)) return false
  if (!IDENTIFIER.test(value)) errors.push(`${path} must use a stable lowercase ASCII identifier`)
  return IDENTIFIER.test(value)
}
function text(value: unknown, path: string, errors: string[], required: boolean, metrics: MutableMetrics): void {
  if (value === undefined && !required) return
  if (!nonEmptyString(value, path, errors, VISUAL_PROGRAM_LIMITS.textLength)) return
  metrics.words += value.trim().split(/\s+/).filter(Boolean).length
}
function textWithoutWordCount(value: unknown, path: string, errors: string[], required = false): void {
  if (value === undefined && !required) return
  nonEmptyString(value, path, errors, VISUAL_PROGRAM_LIMITS.textLength)
}
function finiteInteger(value: unknown, min: number, max: number, path: string, errors: string[]): boolean {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value < min || value > max) {
    errors.push(`${path} must be a finite integer between ${min} and ${max}`)
    return false
  }
  return true
}
function enumValue(value: unknown, allowed: readonly string[], path: string, errors: string[]): boolean {
  if (typeof value !== "string" || !allowed.includes(value)) {
    errors.push(`${path} must be one of: ${allowed.join(", ")}`)
    return false
  }
  return true
}
function validateCoordinate(value: unknown, path: string, errors: string[]): void {
  if (!exactRecord(value, ["x", "y"], ["x", "y"], path, errors)) return
  for (const axis of ["x", "y"] as const)
    if (typeof value[axis] !== "number" || !Number.isFinite(value[axis]) || value[axis] < 0 || value[axis] > 1)
      errors.push(`${path}.${axis} must be a finite number between 0 and 1`)
}
function validateNode(value: unknown, path: string, metrics: MutableMetrics, errors: string[]): string | undefined {
  if (
    !exactRecord(
      value,
      ["id", "label", "initialState"],
      ["id", "label", "text", "position", "initialState"],
      path,
      errors,
    )
  )
    return
  const id = identifier(value.id, `${path}.id`, errors)
  text(value.label, `${path}.label`, errors, true, metrics)
  text(value.text, `${path}.text`, errors, false, metrics)
  if (value.position !== undefined) validateCoordinate(value.position, `${path}.position`, errors)
  enumValue(value.initialState, NODE_STATES, `${path}.initialState`, errors)
  return id ? (value.id as string) : undefined
}
function validateEdge(
  value: unknown,
  path: string,
  metrics: MutableMetrics,
  errors: string[],
): { id?: string; from?: string; to?: string } {
  if (
    !exactRecord(
      value,
      ["id", "from", "to", "initialState"],
      ["id", "from", "to", "label", "initialState"],
      path,
      errors,
    )
  )
    return {}
  const id = identifier(value.id, `${path}.id`, errors)
  const from = identifier(value.from, `${path}.from`, errors)
  const to = identifier(value.to, `${path}.to`, errors)
  text(value.label, `${path}.label`, errors, false, metrics)
  enumValue(value.initialState, EDGE_STATES, `${path}.initialState`, errors)
  if (from && to && value.from === value.to) errors.push(`${path} cannot loop to itself`)
  return {
    id: id ? (value.id as string) : undefined,
    from: from ? (value.from as string) : undefined,
    to: to ? (value.to as string) : undefined,
  }
}
function validatePanel(
  value: unknown,
  index: number,
  metrics: MutableMetrics,
  errors: string[],
  globalNodes?: Set<string>,
  globalEdges?: Set<string>,
): string | undefined {
  const path = `program.panels[${index}]`
  if (!exactRecord(value, ["id", "nodes", "edges"], ["id", "label", "nodes", "edges"], path, errors)) return
  const id = identifier(value.id, `${path}.id`, errors)
  text(value.label, `${path}.label`, errors, false, metrics)
  const localNodes = new Set<string>()
  const localEdges = new Set<string>()
  if (!Array.isArray(value.nodes) || value.nodes.length === 0) errors.push(`${path}.nodes must be a non-empty array`)
  else {
    metrics.nodes += value.nodes.length
    value.nodes.forEach((node, nodeIndex) => {
      const nodeId = validateNode(node, `${path}.nodes[${nodeIndex}]`, metrics, errors)
      if (!nodeId) return
      if (localNodes.has(nodeId) || globalNodes?.has(nodeId))
        errors.push(`${path}.nodes contains duplicate global id '${nodeId}'`)
      localNodes.add(nodeId)
      globalNodes?.add(nodeId)
    })
  }
  if (!Array.isArray(value.edges)) errors.push(`${path}.edges must be an array`)
  else {
    metrics.edges += value.edges.length
    value.edges.forEach((edge, edgeIndex) => {
      const info = validateEdge(edge, `${path}.edges[${edgeIndex}]`, metrics, errors)
      if (!info.id) return
      if (localEdges.has(info.id) || globalEdges?.has(info.id) || globalNodes?.has(info.id))
        errors.push(`${path}.edges contains duplicate global id '${info.id}'`)
      localEdges.add(info.id)
      globalEdges?.add(info.id)
    })
    const nodeIds = new Set([...localNodes])
    value.edges.forEach((edge, edgeIndex) => {
      if (!isRecord(edge)) return
      if (typeof edge.from === "string" && !nodeIds.has(edge.from))
        errors.push(`${path}.edges[${edgeIndex}].from is dangling`)
      if (typeof edge.to === "string" && !nodeIds.has(edge.to))
        errors.push(`${path}.edges[${edgeIndex}].to is dangling`)
    })
  }
  return id ? (value.id as string) : undefined
}
function validateTargeted(
  value: unknown,
  path: string,
  errors: string[],
  expected?: VisualStateTarget,
): { target?: VisualStateTarget; id?: string } {
  if (!exactRecord(value, ["target", "id", "state"], ["target", "id", "state"], path, errors)) return {}
  const target = enumValue(value.target, TARGETS, `${path}.target`, errors)
    ? (value.target as VisualStateTarget)
    : undefined
  if (expected && target && target !== expected) errors.push(`${path}.target must be '${expected}' here`)
  const id = identifier(value.id, `${path}.id`, errors)
  if (target) enumValue(value.state, target === "node" ? NODE_STATES : EDGE_STATES, `${path}.state`, errors)
  return { target, id: id ? (value.id as string) : undefined }
}
function validatePulses(
  value: unknown,
  parentPath: string,
  atMs: number,
  durationMs: number,
  errors: string[],
  count: { total: number },
  nodeIds: Set<string>,
  edgeIds: Set<string>,
): void {
  if (!Array.isArray(value)) {
    errors.push(`${parentPath}.pulses must be an array`)
    return
  }
  if (value.length > VISUAL_PROGRAM_LIMITS.pulsesPerEvent)
    errors.push(`${parentPath}.pulses exceeds ${VISUAL_PROGRAM_LIMITS.pulsesPerEvent}`)
  count.total += value.length
  const seen = new Set<string>()
  value.slice(0, VISUAL_PROGRAM_LIMITS.pulsesPerEvent).forEach((pulse, index) => {
    const path = `${parentPath}.pulses[${index}]`
    if (!exactRecord(pulse, ["target", "id", "durationMs"], ["target", "id", "durationMs"], path, errors)) return
    const target = enumValue(pulse.target, TARGETS, `${path}.target`, errors) ? String(pulse.target) : ""
    const id = identifier(pulse.id, `${path}.id`, errors) ? String(pulse.id) : ""
    const key = `${target}:${id}`
    if (seen.has(key)) errors.push(`${parentPath}.pulses duplicates ${key}`)
    seen.add(key)
    if (id && !(target === "node" ? nodeIds : edgeIds).has(id)) errors.push(`${path} references dangling ${key}`)
    if (
      finiteInteger(pulse.durationMs, 1, durationMs, `${path}.durationMs`, errors) &&
      atMs + (pulse.durationMs as number) > durationMs
    )
      errors.push(`${path} ends after program duration`)
  })
}
function validateIsolation(
  value: unknown,
  parentPath: string,
  errors: string[],
  count: { total: number },
  assertion = false,
  nodeIds: Set<string> = new Set(),
  edgeIds: Set<string> = new Set(),
): void {
  if (!Array.isArray(value)) {
    errors.push(`${parentPath}.isolation must be an array`)
    return
  }
  const limit = assertion ? VISUAL_PROGRAM_LIMITS.isolationPerAssertion : VISUAL_PROGRAM_LIMITS.isolationPerEvent
  if (value.length > limit) errors.push(`${parentPath}.isolation exceeds ${limit}`)
  count.total += value.length
  const seen = new Set<string>()
  value.slice(0, limit).forEach((entry, index) => {
    const path = `${parentPath}.isolation[${index}]`
    if (!exactRecord(entry, ["target", "id", "mode"], ["target", "id", "mode"], path, errors)) return
    const target = enumValue(entry.target, TARGETS, `${path}.target`, errors) ? String(entry.target) : ""
    const id = identifier(entry.id, `${path}.id`, errors) ? String(entry.id) : ""
    const key = `${target}:${id}`
    if (seen.has(key)) errors.push(`${parentPath}.isolation duplicates ${key}`)
    seen.add(key)
    if (id && !(target === "node" ? nodeIds : edgeIds).has(id)) errors.push(`${path} references dangling ${key}`)
    enumValue(entry.mode, ISOLATION_MODES, `${path}.mode`, errors)
  })
}
function validateBoundaries(
  value: unknown,
  parentPath: string,
  metrics: MutableMetrics,
  errors: string[],
  count: { total: number; nodes: number },
): void {
  if (!Array.isArray(value)) {
    errors.push(`${parentPath}.boundaries must be an array`)
    return
  }
  if (value.length > VISUAL_PROGRAM_LIMITS.boundariesPerEvent)
    errors.push(`${parentPath}.boundaries exceeds ${VISUAL_PROGRAM_LIMITS.boundariesPerEvent}`)
  count.total += value.length
  value.slice(0, VISUAL_PROGRAM_LIMITS.boundariesPerEvent).forEach((entry, index) => {
    const path = `${parentPath}.boundaries[${index}]`
    if (
      !exactRecord(
        entry,
        ["id", "panelId", "nodeIds", "state"],
        ["id", "panelId", "nodeIds", "state", "label"],
        path,
        errors,
      )
    )
      return
    identifier(entry.id, `${path}.id`, errors)
    identifier(entry.panelId, `${path}.panelId`, errors)
    if (
      !Array.isArray(entry.nodeIds) ||
      entry.nodeIds.length === 0 ||
      entry.nodeIds.length > VISUAL_PROGRAM_LIMITS.boundaryNodes
    )
      errors.push(`${path}.nodeIds must contain 1-${VISUAL_PROGRAM_LIMITS.boundaryNodes} node ids`)
    else {
      count.nodes += entry.nodeIds.length
      entry.nodeIds.forEach((id, nodeIndex) => identifier(id, `${path}.nodeIds[${nodeIndex}]`, errors))
    }
    enumValue(entry.state, ["open", "closed"], `${path}.state`, errors)
    text(entry.label, `${path}.label`, errors, false, metrics)
  })
}

function serializedSize(value: unknown): number {
  try {
    const json = JSON.stringify(value)
    return json ? new TextEncoder().encode(json).length : 0
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

export function validateVisualProgram(input: unknown): VisualProgramContractValidation {
  const errors: string[] = []
  const metrics: MutableMetrics = { panels: 0, nodes: 0, edges: 0, events: 0, assertions: 0, words: 0 }
  if (
    !exactRecord(
      input,
      ["version", "durationMs", "panels", "events", "assertions"],
      ["version", "durationMs", "panels", "events", "assertions"],
      "program",
      errors,
    )
  )
    return { valid: false, errors, metrics }
  if (serializedSize(input) > VISUAL_PROGRAM_LIMITS.sourceSerializedBytes)
    errors.push(`program exceeds ${VISUAL_PROGRAM_LIMITS.sourceSerializedBytes} serialized bytes`)
  if (input.version !== VISUAL_PROGRAM_SCHEMA_VERSION)
    errors.push(`program.version must be ${VISUAL_PROGRAM_SCHEMA_VERSION}`)
  const durationMs = finiteInteger(input.durationMs, 1, VISUAL_PROGRAM_LIMITS.durationMs, "program.durationMs", errors)
    ? (input.durationMs as number)
    : 0
  const nodeIds = new Set<string>()
  const edgeIds = new Set<string>()
  const allIds = new Set<string>()
  const panelIds = new Set<string>()
  if (!Array.isArray(input.panels) || input.panels.length < 1 || input.panels.length > VISUAL_PROGRAM_LIMITS.panels)
    errors.push(`program.panels must contain 1-${VISUAL_PROGRAM_LIMITS.panels} panels`)
  else {
    metrics.panels = input.panels.length
    input.panels.forEach((panel, index) => {
      const id = validatePanel(panel, index, metrics, errors, nodeIds, edgeIds)
      if (id && panelIds.has(id)) errors.push(`program.panels contains duplicate id '${id}'`)
      if (id) panelIds.add(id)
    })
    for (const id of [...nodeIds, ...edgeIds]) {
      if (allIds.has(id)) errors.push(`program contains duplicate global id '${id}'`)
      allIds.add(id)
    }
  }
  if (metrics.nodes > VISUAL_PROGRAM_LIMITS.nodes) errors.push(`program exceeds ${VISUAL_PROGRAM_LIMITS.nodes} nodes`)
  if (metrics.edges > VISUAL_PROGRAM_LIMITS.edges) errors.push(`program exceeds ${VISUAL_PROGRAM_LIMITS.edges} edges`)
  const eventIds = new Set<string>()
  const boundaryIds = new Set<string>()
  let totalChanges = 0
  const pulseCount = { total: 0 }
  const isolationCount = { total: 0 }
  const boundaryCount = { total: 0, nodes: 0 }
  if (!Array.isArray(input.events) || input.events.length > VISUAL_PROGRAM_LIMITS.events)
    errors.push(`program.events must contain at most ${VISUAL_PROGRAM_LIMITS.events} events`)
  else {
    metrics.events = input.events.length
    let previousAtMs = 0
    input.events.forEach((event, index) => {
      const path = `program.events[${index}]`
      if (
        !exactRecord(
          event,
          ["id", "atMs", "changes"],
          ["id", "atMs", "changes", "pulses", "isolation", "boundaries"],
          path,
          errors,
        )
      )
        return
      const eventId = identifier(event.id, `${path}.id`, errors) ? (event.id as string) : undefined
      if (eventId && eventIds.has(eventId)) errors.push(`program.events contains duplicate id '${eventId}'`)
      if (eventId) eventIds.add(eventId)
      const atMs = finiteInteger(event.atMs, 1, durationMs - 1, `${path}.atMs`, errors)
        ? (event.atMs as number)
        : undefined
      if (atMs !== undefined && atMs < previousAtMs) errors.push(`program.events must be ordered by atMs`)
      if (atMs !== undefined) previousAtMs = atMs
      if (!Array.isArray(event.changes) || event.changes.length === 0)
        errors.push(`${path}.changes must be a non-empty array`)
      else {
        if (event.changes.length > VISUAL_PROGRAM_LIMITS.changesPerEvent)
          errors.push(`${path}.changes exceeds ${VISUAL_PROGRAM_LIMITS.changesPerEvent}`)
        totalChanges += event.changes.length
        const seen = new Set<string>()
        event.changes.slice(0, VISUAL_PROGRAM_LIMITS.changesPerEvent).forEach((change, changeIndex) => {
          const info = validateTargeted(change, `${path}.changes[${changeIndex}]`, errors)
          if (!info.target || !info.id) return
          const key = `${info.target}:${info.id}`
          if (seen.has(key)) errors.push(`${path}.changes duplicates ${key}`)
          seen.add(key)
          if ((info.target === "node" ? nodeIds : edgeIds).has(info.id) === false)
            errors.push(`${path}.changes references dangling ${key}`)
        })
      }
      if (event.pulses !== undefined && atMs !== undefined)
        validatePulses(event.pulses, path, atMs, durationMs, errors, pulseCount, nodeIds, edgeIds)
      else if (event.pulses !== undefined)
        validatePulses(event.pulses, path, 0, durationMs, errors, pulseCount, nodeIds, edgeIds)
      if (event.isolation !== undefined)
        validateIsolation(event.isolation, path, errors, isolationCount, false, nodeIds, edgeIds)
      if (event.boundaries !== undefined) {
        validateBoundaries(event.boundaries, path, metrics, errors, boundaryCount)
        if (Array.isArray(event.boundaries))
          event.boundaries.slice(0, VISUAL_PROGRAM_LIMITS.boundariesPerEvent).forEach((boundary) => {
            if (!isRecord(boundary)) return
            if (typeof boundary.id === "string") {
              if (boundaryIds.has(boundary.id)) errors.push(`program contains duplicate boundary id '${boundary.id}'`)
              boundaryIds.add(boundary.id)
            }
            if (typeof boundary.panelId === "string" && !panelIds.has(boundary.panelId))
              errors.push(`program boundary references dangling panel '${boundary.panelId}'`)
            if (Array.isArray(boundary.nodeIds) && typeof boundary.panelId === "string") {
              const panel = Array.isArray(input.panels)
                ? input.panels.find((candidate) => isRecord(candidate) && candidate.id === boundary.panelId)
                : undefined
              const ids =
                isRecord(panel) && Array.isArray(panel.nodes)
                  ? new Set(panel.nodes.filter(isRecord).map((node) => node.id))
                  : new Set()
              boundary.nodeIds.slice(0, VISUAL_PROGRAM_LIMITS.boundaryNodes).forEach((nodeId) => {
                if (typeof nodeId === "string" && !ids.has(nodeId))
                  errors.push(`program boundary references dangling node '${nodeId}'`)
              })
            }
          })
      }
    })
  }
  if (totalChanges > VISUAL_PROGRAM_LIMITS.totalChanges)
    errors.push(`program exceeds ${VISUAL_PROGRAM_LIMITS.totalChanges} total changes`)
  if (pulseCount.total > VISUAL_PROGRAM_LIMITS.totalPulses)
    errors.push(`program exceeds ${VISUAL_PROGRAM_LIMITS.totalPulses} total pulses`)
  if (isolationCount.total > VISUAL_PROGRAM_LIMITS.totalIsolation)
    errors.push(`program exceeds ${VISUAL_PROGRAM_LIMITS.totalIsolation} total isolation entries`)
  if (
    boundaryCount.total > VISUAL_PROGRAM_LIMITS.totalBoundaries ||
    boundaryCount.nodes > VISUAL_PROGRAM_LIMITS.totalBoundaryNodes
  )
    errors.push("program exceeds total boundary budgets")

  const assertionIds = new Set<string>()
  let totalChecks = 0
  const assertionIsolation = { total: 0 }
  const boundaryTimes = new Set<number>([0, durationMs])
  if (Array.isArray(input.events))
    for (const event of input.events)
      if (isRecord(event) && typeof event.atMs === "number") boundaryTimes.add(event.atMs)
  if (
    !Array.isArray(input.assertions) ||
    input.assertions.length < 1 ||
    input.assertions.length > VISUAL_PROGRAM_LIMITS.assertions
  )
    errors.push(`program.assertions must contain 1-${VISUAL_PROGRAM_LIMITS.assertions} assertions`)
  else {
    metrics.assertions = input.assertions.length
    input.assertions.forEach((assertion, index) => {
      const path = `program.assertions[${index}]`
      if (!exactRecord(assertion, ["id", "atMs", "checks"], ["id", "atMs", "checks", "isolation"], path, errors)) return
      const id = identifier(assertion.id, `${path}.id`, errors) ? (assertion.id as string) : undefined
      if (id && assertionIds.has(id)) errors.push(`program.assertions contains duplicate id '${id}'`)
      if (id) assertionIds.add(id)
      const atMs = finiteInteger(assertion.atMs, 0, durationMs, `${path}.atMs`, errors)
        ? (assertion.atMs as number)
        : undefined
      if (atMs !== undefined && !boundaryTimes.has(atMs))
        errors.push(`${path}.atMs must be an initial, event, intervention, or terminal boundary`)
      if (!Array.isArray(assertion.checks) || assertion.checks.length === 0)
        errors.push(`${path}.checks must be a non-empty array`)
      else {
        if (assertion.checks.length > VISUAL_PROGRAM_LIMITS.checksPerAssertion)
          errors.push(`${path}.checks exceeds ${VISUAL_PROGRAM_LIMITS.checksPerAssertion}`)
        totalChecks += assertion.checks.length
        const seen = new Set<string>()
        assertion.checks.slice(0, VISUAL_PROGRAM_LIMITS.checksPerAssertion).forEach((check, checkIndex) => {
          const info = validateTargeted(check, `${path}.checks[${checkIndex}]`, errors)
          if (!info.target || !info.id) return
          const key = `${info.target}:${info.id}`
          if (seen.has(key)) errors.push(`${path}.checks duplicates ${key}`)
          seen.add(key)
          if (!(info.target === "node" ? nodeIds : edgeIds).has(info.id))
            errors.push(`${path}.checks references dangling ${key}`)
        })
      }
      if (assertion.isolation !== undefined) {
        validateIsolation(assertion.isolation, path, errors, assertionIsolation, true, nodeIds, edgeIds)
        if (Array.isArray(assertion.isolation))
          assertion.isolation.slice(0, VISUAL_PROGRAM_LIMITS.isolationPerAssertion).forEach((entry) => {
            if (!isRecord(entry)) return
            if (
              typeof entry.target === "string" &&
              typeof entry.id === "string" &&
              !(entry.target === "node" ? nodeIds : edgeIds).has(entry.id)
            )
              errors.push(`${path}.isolation references dangling ${entry.target}:${entry.id}`)
          })
      }
    })
  }
  if (totalChecks > VISUAL_PROGRAM_LIMITS.totalChecks)
    errors.push(`program exceeds ${VISUAL_PROGRAM_LIMITS.totalChecks} total assertion checks`)
  if (assertionIsolation.total > VISUAL_PROGRAM_LIMITS.totalAssertionIsolation)
    errors.push(`program exceeds ${VISUAL_PROGRAM_LIMITS.totalAssertionIsolation} total assertion isolation entries`)
  if (metrics.words > VISUAL_PROGRAM_LIMITS.sourceWords)
    errors.push(`program exceeds ${VISUAL_PROGRAM_LIMITS.sourceWords} words`)
  for (const time of [...boundaryTimes].sort((a, b) => a - b))
    if (
      Array.isArray(input.assertions) &&
      !input.assertions.some((assertion) => isRecord(assertion) && (assertion.atMs as number) === time)
    )
      errors.push(`program.assertions must cover boundary ${time}ms`)
  validateAssertionSemantics(input, nodeIds, edgeIds, errors)
  return { valid: errors.length === 0, errors, metrics }
}

function validateAssertionSemantics(
  input: Record<string, unknown>,
  nodeIds: Set<string>,
  edgeIds: Set<string>,
  errors: string[],
): void {
  if (!Array.isArray(input.panels) || !Array.isArray(input.events) || !Array.isArray(input.assertions)) return
  for (const assertion of input.assertions) {
    if (!isRecord(assertion) || typeof assertion.atMs !== "number") continue
    const nodes = new Map<string, string>()
    const edges = new Map<string, string>()
    const isolation = new Map<string, string>()
    for (const panel of input.panels)
      if (isRecord(panel)) {
        if (Array.isArray(panel.nodes))
          for (const node of panel.nodes)
            if (isRecord(node) && typeof node.id === "string" && typeof node.initialState === "string")
              nodes.set(node.id, node.initialState)
        if (Array.isArray(panel.edges))
          for (const edge of panel.edges)
            if (isRecord(edge) && typeof edge.id === "string" && typeof edge.initialState === "string")
              edges.set(edge.id, edge.initialState)
      }
    const events = input.events
      .filter(isRecord)
      .filter((event) => typeof event.atMs === "number" && event.atMs <= (assertion.atMs as number))
      .slice()
      .sort((a, b) => Number(a.atMs) - Number(b.atMs) || compareStrings(String(a.id), String(b.id)))
    for (const event of events) {
      if (Array.isArray(event.changes))
        for (const change of event.changes)
          if (
            isRecord(change) &&
            typeof change.target === "string" &&
            typeof change.id === "string" &&
            typeof change.state === "string"
          )
            (change.target === "node" ? nodes : edges).set(change.id, change.state)
      if (Array.isArray(event.isolation))
        for (const entry of event.isolation)
          if (
            isRecord(entry) &&
            typeof entry.target === "string" &&
            typeof entry.id === "string" &&
            typeof entry.mode === "string"
          )
            isolation.set(`${entry.target}:${entry.id}`, entry.mode)
    }
    if (Array.isArray(assertion.checks))
      for (const check of assertion.checks)
        if (
          isRecord(check) &&
          typeof check.target === "string" &&
          typeof check.id === "string" &&
          typeof check.state === "string"
        ) {
          const actual = (check.target === "node" ? nodes : edges).get(check.id)
          if (actual !== check.state && (check.target === "node" ? nodeIds : edgeIds).has(check.id))
            errors.push(`program.assertions '${String(assertion.id)}' is impossible for ${check.target} '${check.id}'`)
        }
    if (Array.isArray(assertion.isolation))
      for (const check of assertion.isolation)
        if (
          isRecord(check) &&
          typeof check.target === "string" &&
          typeof check.id === "string" &&
          typeof check.mode === "string"
        ) {
          if (isolation.get(`${check.target}:${check.id}`) !== check.mode)
            errors.push(`program.assertions '${String(assertion.id)}' has impossible isolation`)
        }
  }
}

function validateBinding(binding: unknown, path: string, errors: string[]): binding is VisualRecipeBinding {
  if (!exactRecord(binding, ["id", "type", "value"], ["id", "type", "value"], path, errors)) return false
  const id = identifier(binding.id, `${path}.id`, errors)
  enumValue(binding.type, ["text"], `${path}.type`, errors)
  if (binding.type === "text") nonEmptyString(binding.value, `${path}.value`, errors, VISUAL_PROGRAM_LIMITS.textLength)
  return Boolean(id)
}
function validateBindings(
  bindings: unknown,
  path: string,
  errors: string[],
): bindings is readonly VisualRecipeBinding[] {
  if (!Array.isArray(bindings) || bindings.length > 32) {
    errors.push(`${path} must contain at most 32 bindings`)
    return false
  }
  const ids = new Set<string>()
  bindings.forEach((binding, index) => {
    if (!validateBinding(binding, `${path}[${index}]`, errors)) return
    const id = (binding as VisualRecipeBinding).id
    if (ids.has(id)) errors.push(`${path} contains duplicate id '${id}'`)
    ids.add(id)
  })
  return true
}

export function validateVisualRecipeBindings(input: unknown): boolean {
  const errors: string[] = []
  return validateBindings(input, "bindings", errors) && errors.length === 0
}

export function validateVisualRecipeTemplate(input: unknown): VisualProgramContractValidation {
  const errors: string[] = []
  const program = isRecord(input) ? input.program : undefined
  const validation = validateVisualProgram(program)
  const metrics = { ...validation.metrics }
  if (
    !exactRecord(
      input,
      ["version", "templateId", "program", "bindings"],
      ["version", "templateId", "program", "bindings"],
      "recipe",
      errors,
    )
  )
    return { valid: false, errors, metrics }
  if (input.version !== VISUAL_RECIPE_SCHEMA_VERSION)
    errors.push(`recipe.version must be ${VISUAL_RECIPE_SCHEMA_VERSION}`)
  identifier(input.templateId, "recipe.templateId", errors, 64)
  errors.push(...validation.errors.map((error) => error.replace(/^program/, "recipe.program")))
  validateBindings(input.bindings, "recipe.bindings", errors)
  const bindings = Array.isArray(input.bindings) ? input.bindings.filter(isRecord) : []
  const byId = new Map(
    bindings.filter((binding) => typeof binding.id === "string").map((binding) => [binding.id as string, binding]),
  )
  const references = new Set<string>()
  const visit = (value: unknown): void => {
    if (typeof value === "string") {
      const matches = value.matchAll(/\{\{([a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*)\}\}/g)
      for (const match of matches) {
        const id = match[1]!
        references.add(id)
        const binding = byId.get(id)
        if (!binding) errors.push(`recipe.program references undeclared binding '${id}'`)
        else if (binding.type !== "text") errors.push(`recipe.program text reference '${id}' requires a text binding`)
      }
    } else if (Array.isArray(value)) value.forEach(visit)
    else if (isRecord(value)) Object.values(value).forEach(visit)
  }
  visit(program)
  for (const binding of bindings)
    if (typeof binding.id === "string" && !references.has(binding.id))
      errors.push(`recipe binding '${binding.id}' is not used by the template`)
  return { valid: errors.length === 0, errors, metrics }
}

function cloneAndFreeze<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map((entry) => cloneAndFreeze(entry))) as T
  if (isRecord(value)) {
    const clone: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value)) clone[key] = cloneAndFreeze(entry)
    return Object.freeze(clone) as T
  }
  return value
}
export function createVisualRecipeTemplate(template: VisualRecipeTemplate): VisualRecipeTemplate {
  const validation = validateVisualRecipeTemplate(template)
  if (!validation.valid) throw new Error(`Invalid visual recipe template: ${validation.errors.join("; ")}`)
  return cloneAndFreeze(template)
}

function canonicalValue(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Cannot canonicalize a non-finite number")
    return Object.is(value, -0) ? 0 : value
  }
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (isRecord(value)) {
    const result: Record<string, unknown> = {}
    for (const key of Object.keys(value).sort(compareStrings))
      if (value[key] !== undefined) result[key] = canonicalValue(value[key])
    return result
  }
  throw new Error("Cannot canonicalize an executable or unsupported value")
}
export function canonicalizeCompiledVisualProgram(value: Omit<CompiledVisualProgram, "digest">): string {
  return JSON.stringify(canonicalValue(value))
}

function canonicalValuesEqual(left: unknown, right: unknown): boolean {
  try {
    return JSON.stringify(canonicalValue(left)) === JSON.stringify(canonicalValue(right))
  } catch {
    return false
  }
}

function validateCompiledVisualProgramUncached(value: unknown): VisualProgramContractValidation {
  const errors: string[] = []
  const metrics: MutableMetrics = { panels: 0, nodes: 0, edges: 0, events: 0, assertions: 0, words: 0 }
  const validRoot = exactRecord(
    value,
    [
      "version",
      "compilerVersion",
      "rendererVersion",
      "targetAdapter",
      "durationMs",
      "panels",
      "timeline",
      "bindings",
      "assertions",
      "inputDigest",
      "digest",
    ],
    [
      "version",
      "compilerVersion",
      "rendererVersion",
      "targetAdapter",
      "durationMs",
      "panels",
      "timeline",
      "bindings",
      "assertions",
      "inputDigest",
      "digest",
    ],
    "compiled",
    errors,
  )
  if (!validRoot) return { valid: false, errors, metrics }
  if (serializedSize(value) > VISUAL_PROGRAM_LIMITS.compiledSerializedBytes)
    errors.push(`compiled exceeds ${VISUAL_PROGRAM_LIMITS.compiledSerializedBytes} serialized bytes`)
  if (value.version !== VISUAL_PROGRAM_SCHEMA_VERSION) errors.push("compiled.version is unsupported")
  if (value.compilerVersion !== VISUAL_PROGRAM_COMPILER_VERSION) errors.push("compiled.compilerVersion is unsupported")
  if (value.rendererVersion !== VISUAL_PROGRAM_RENDERER_VERSION) errors.push("compiled.rendererVersion is unsupported")
  if (value.targetAdapter !== DEFAULT_VISUAL_PROGRAM_TARGET_ADAPTER)
    errors.push("compiled.targetAdapter is unsupported")
  const durationOk = finiteInteger(value.durationMs, 1, VISUAL_PROGRAM_LIMITS.durationMs, "compiled.durationMs", errors)
  const duration = durationOk ? (value.durationMs as number) : 0
  const nodes = new Set<string>()
  const edges = new Set<string>()
  const panels = new Set<string>()
  const panelNodeIds = new Map<string, Set<string>>()
  if (!Array.isArray(value.panels) || value.panels.length < 1 || value.panels.length > VISUAL_PROGRAM_LIMITS.panels) {
    errors.push("compiled.panels has an invalid count")
  } else {
    metrics.panels = value.panels.length
    let previousPanelId = ""
    value.panels.forEach((panel, index) => {
      const id = validatePanel(panel, index, metrics, errors, nodes, edges)
      if (id && previousPanelId && compareStrings(previousPanelId, id) > 0)
        errors.push("compiled.panels must be sorted by id")
      if (id) previousPanelId = id
      if (id && panels.has(id)) errors.push(`compiled.panels contains duplicate id '${id}'`)
      if (id) {
        panels.add(id)
        if (isRecord(panel) && Array.isArray(panel.nodes))
          panelNodeIds.set(id, new Set(panel.nodes.filter(isRecord).map((node) => String(node.id))))
      }
      if (isRecord(panel) && Array.isArray(panel.nodes)) {
        let previousNodeId = ""
        panel.nodes.forEach((node, nodeIndex) => {
          if (!isRecord(node)) return
          if (node.position === undefined)
            errors.push(`compiled.panels[${index}].nodes[${nodeIndex}].position is required`)
          if (typeof node.id === "string") {
            if (previousNodeId && compareStrings(previousNodeId, node.id) > 0)
              errors.push(`compiled.panels[${index}].nodes must be sorted by id`)
            previousNodeId = node.id
          }
        })
      }
      if (isRecord(panel) && Array.isArray(panel.edges)) {
        let previousEdgeId = ""
        panel.edges.forEach((edge) => {
          if (!isRecord(edge) || typeof edge.id !== "string") return
          if (previousEdgeId && compareStrings(previousEdgeId, edge.id) > 0)
            errors.push(`compiled.panels[${index}].edges must be sorted by id`)
          previousEdgeId = edge.id
        })
      }
    })
  }
  if (metrics.nodes > VISUAL_PROGRAM_LIMITS.nodes) errors.push(`compiled exceeds ${VISUAL_PROGRAM_LIMITS.nodes} nodes`)
  if (metrics.edges > VISUAL_PROGRAM_LIMITS.edges) errors.push(`compiled exceeds ${VISUAL_PROGRAM_LIMITS.edges} edges`)
  if (metrics.words > VISUAL_PROGRAM_LIMITS.compiledWords)
    errors.push(`compiled exceeds ${VISUAL_PROGRAM_LIMITS.compiledWords} words`)
  if (!validateBindings(value.bindings, "compiled.bindings", errors)) errors.push("compiled.bindings is invalid")
  if (Array.isArray(value.bindings)) {
    let previousBindingId = ""
    for (const binding of value.bindings) {
      if (!isRecord(binding) || typeof binding.id !== "string") continue
      if (previousBindingId && compareStrings(previousBindingId, binding.id) > 0)
        errors.push("compiled.bindings must be sorted by id")
      previousBindingId = binding.id
    }
  }

  const initialNodes = new Map<string, string>()
  const initialEdges = new Map<string, string>()
  if (Array.isArray(value.panels))
    for (const panel of value.panels) {
      if (!isRecord(panel)) continue
      if (Array.isArray(panel.nodes))
        for (const node of panel.nodes)
          if (isRecord(node) && typeof node.id === "string" && typeof node.initialState === "string")
            initialNodes.set(node.id, node.initialState)
      if (Array.isArray(panel.edges))
        for (const edge of panel.edges)
          if (isRecord(edge) && typeof edge.id === "string" && typeof edge.initialState === "string")
            initialEdges.set(edge.id, edge.initialState)
    }
  const timeline = value.timeline
  if (
    !Array.isArray(timeline) ||
    timeline.length < 1 ||
    timeline.length > VISUAL_PROGRAM_LIMITS.compiledTimelineStates
  ) {
    errors.push(`compiled.timeline must contain 1-${VISUAL_PROGRAM_LIMITS.compiledTimelineStates} states`)
  }
  const timelineTimes = new Set<number>()
  const statesByTime = new Map<number, Record<string, unknown>>()
  const boundaryDefinitions = new Map<string, string>()
  const previousBoundaryIds = new Set<string>()
  let totalPulses = 0
  let totalIsolation = 0
  let totalBoundaries = 0
  let totalBoundaryNodes = 0
  let previousPulses = new Map<string, number>()
  let previousIsolation = new Set<string>()
  if (Array.isArray(timeline)) {
    let previousAt = -1
    timeline.forEach((state, index) => {
      const path = `compiled.timeline[${index}]`
      if (
        !exactRecord(
          state,
          ["atMs", "nodes", "edges", "pulses", "isolation", "boundaries"],
          ["atMs", "nodes", "edges", "pulses", "isolation", "boundaries"],
          path,
          errors,
        )
      )
        return
      const at = finiteInteger(state.atMs, 0, duration, `${path}.atMs`, errors) ? (state.atMs as number) : 0
      if (at < previousAt) errors.push("compiled.timeline must be ordered")
      if (index === 0 && at !== 0) errors.push("compiled.timeline must start at 0")
      previousAt = at
      timelineTimes.add(at)
      statesByTime.set(at, state)
      if (index === timeline.length - 1 && at !== duration)
        errors.push("compiled.timeline must end at the program duration")
      const collections = [state.nodes, state.edges, state.pulses, state.isolation, state.boundaries]
      for (const collection of collections)
        if (!Array.isArray(collection)) errors.push(`${path} contains an invalid collection`)

      if (Array.isArray(state.nodes)) {
        if (state.nodes.length !== nodes.size)
          errors.push(`${path}.nodes must contain every compiled node exactly once`)
        const seen = new Set<string>()
        let previousId = ""
        state.nodes.forEach((entry, entryIndex) => {
          const entryPath = `${path}.nodes[${entryIndex}]`
          if (!exactRecord(entry, ["id", "state"], ["id", "state"], entryPath, errors)) return
          const id = typeof entry.id === "string" ? entry.id : String(entry.id)
          identifier(entry.id, `${entryPath}.id`, errors)
          enumValue(entry.state, NODE_STATES, `${entryPath}.state`, errors)
          if (previousId && compareStrings(previousId, id) > 0) errors.push(`${path}.nodes must be sorted by id`)
          previousId = id
          if (seen.has(id) || !nodes.has(id)) errors.push(`${path}.nodes contains an invalid or duplicate node`)
          seen.add(id)
          if (index === 0 && initialNodes.get(id) !== entry.state)
            errors.push(`${entryPath} does not match the panel initial state`)
        })
      }
      if (Array.isArray(state.edges)) {
        if (state.edges.length !== edges.size)
          errors.push(`${path}.edges must contain every compiled edge exactly once`)
        const seen = new Set<string>()
        let previousId = ""
        state.edges.forEach((entry, entryIndex) => {
          const entryPath = `${path}.edges[${entryIndex}]`
          if (!exactRecord(entry, ["id", "state"], ["id", "state"], entryPath, errors)) return
          const id = typeof entry.id === "string" ? entry.id : String(entry.id)
          identifier(entry.id, `${entryPath}.id`, errors)
          enumValue(entry.state, EDGE_STATES, `${entryPath}.state`, errors)
          if (previousId && compareStrings(previousId, id) > 0) errors.push(`${path}.edges must be sorted by id`)
          previousId = id
          if (seen.has(id) || !edges.has(id)) errors.push(`${path}.edges contains an invalid or duplicate edge`)
          seen.add(id)
          if (index === 0 && initialEdges.get(id) !== entry.state)
            errors.push(`${entryPath} does not match the panel initial state`)
        })
      }
      if (Array.isArray(state.pulses)) {
        if (index === 0 && state.pulses.length !== 0) errors.push(`${path}.pulses must be empty initially`)
        if (state.pulses.length > VISUAL_PROGRAM_LIMITS.totalPulses)
          errors.push(`${path}.pulses exceeds ${VISUAL_PROGRAM_LIMITS.totalPulses}`)
        totalPulses += state.pulses.length
        const seen = new Set<string>()
        let previousKey = ""
        state.pulses.forEach((pulse, pulseIndex) => {
          const pulsePath = `${path}.pulses[${pulseIndex}]`
          if (!exactRecord(pulse, ["target", "id", "untilMs"], ["target", "id", "untilMs"], pulsePath, errors)) return
          const target = enumValue(pulse.target, TARGETS, `${pulsePath}.target`, errors) ? (pulse.target as string) : ""
          const id = identifier(pulse.id, `${pulsePath}.id`, errors) ? String(pulse.id) : ""
          const key = `${target}:${id}`
          if (previousKey && compareStrings(previousKey, key) > 0)
            errors.push(`${path}.pulses must be sorted by target and id`)
          previousKey = key
          if (seen.has(key) || !(target === "node" ? nodes : edges).has(id))
            errors.push(`${path}.pulses has an invalid or duplicate target`)
          seen.add(key)
          if (
            !finiteInteger(pulse.untilMs, 1, duration, `${pulsePath}.untilMs`, errors) ||
            (pulse.untilMs as number) <= at
          )
            errors.push(`${pulsePath}.untilMs must be after the state time`)
        })
      }
      if (Array.isArray(state.isolation)) {
        if (index === 0 && state.isolation.length !== 0) errors.push(`${path}.isolation must be empty initially`)
        if (state.isolation.length > VISUAL_PROGRAM_LIMITS.totalIsolation)
          errors.push(`${path}.isolation exceeds ${VISUAL_PROGRAM_LIMITS.totalIsolation}`)
        totalIsolation += state.isolation.length
        const seen = new Set<string>()
        let previousKey = ""
        state.isolation.forEach((entry, entryIndex) => {
          const entryPath = `${path}.isolation[${entryIndex}]`
          if (!exactRecord(entry, ["target", "id", "mode"], ["target", "id", "mode"], entryPath, errors)) return
          const target = enumValue(entry.target, TARGETS, `${entryPath}.target`, errors) ? (entry.target as string) : ""
          const id = identifier(entry.id, `${entryPath}.id`, errors) ? String(entry.id) : ""
          const key = `${target}:${id}`
          if (previousKey && compareStrings(previousKey, key) > 0)
            errors.push(`${path}.isolation must be sorted by target and id`)
          previousKey = key
          if (seen.has(key) || !(target === "node" ? nodes : edges).has(id))
            errors.push(`${path}.isolation has an invalid or duplicate target`)
          seen.add(key)
          enumValue(entry.mode, ISOLATION_MODES, `${entryPath}.mode`, errors)
        })
      }
      if (Array.isArray(state.boundaries)) {
        if (index === 0 && state.boundaries.length !== 0) errors.push(`${path}.boundaries must be empty initially`)
        if (state.boundaries.length > VISUAL_PROGRAM_LIMITS.totalBoundaries)
          errors.push(`${path}.boundaries exceeds ${VISUAL_PROGRAM_LIMITS.totalBoundaries}`)
        totalBoundaries += state.boundaries.length
        const seen = new Set<string>()
        let previousId = ""
        state.boundaries.forEach((boundary, boundaryIndex) => {
          const boundaryPath = `${path}.boundaries[${boundaryIndex}]`
          if (
            !exactRecord(
              boundary,
              ["id", "panelId", "nodeIds", "state"],
              ["id", "panelId", "nodeIds", "state", "label"],
              boundaryPath,
              errors,
            )
          )
            return
          const id = identifier(boundary.id, `${boundaryPath}.id`, errors) ? String(boundary.id) : ""
          if (previousId && compareStrings(previousId, id) > 0) errors.push(`${path}.boundaries must be sorted by id`)
          previousId = id
          if (seen.has(id)) errors.push(`${path}.boundaries contains a duplicate id`)
          seen.add(id)
          const panelId = identifier(boundary.panelId, `${boundaryPath}.panelId`, errors)
            ? String(boundary.panelId)
            : ""
          if (!panels.has(panelId)) errors.push(`${boundaryPath}.panelId is dangling`)
          if (
            !Array.isArray(boundary.nodeIds) ||
            boundary.nodeIds.length < 1 ||
            boundary.nodeIds.length > VISUAL_PROGRAM_LIMITS.boundaryNodes
          ) {
            errors.push(`${boundaryPath}.nodeIds must contain 1-${VISUAL_PROGRAM_LIMITS.boundaryNodes} node ids`)
          } else {
            totalBoundaryNodes += boundary.nodeIds.length
            const boundaryNodeIds = new Set<string>()
            boundary.nodeIds.forEach((nodeId, nodeIndex) => {
              identifier(nodeId, `${boundaryPath}.nodeIds[${nodeIndex}]`, errors)
              const idValue = String(nodeId)
              if (boundaryNodeIds.has(idValue)) errors.push(`${boundaryPath}.nodeIds contains a duplicate node`)
              boundaryNodeIds.add(idValue)
              if (!panelNodeIds.get(panelId)?.has(idValue))
                errors.push(`${boundaryPath}.nodeIds contains a node outside its panel`)
            })
            const sorted = [...boundaryNodeIds].sort(compareStrings)
            if (JSON.stringify(sorted) !== JSON.stringify(boundary.nodeIds))
              errors.push(`${boundaryPath}.nodeIds must be sorted`)
          }
          enumValue(boundary.state, ["open", "closed"], `${boundaryPath}.state`, errors)
          const signature = JSON.stringify(canonicalValue(boundary))
          if (id && !boundaryDefinitions.has(id)) text(boundary.label, `${boundaryPath}.label`, errors, false, metrics)
          else textWithoutWordCount(boundary.label, `${boundaryPath}.label`, errors)
          if (id) {
            const prior = boundaryDefinitions.get(id)
            if (prior && prior !== signature) errors.push(`${boundaryPath} changes after declaration`)
            boundaryDefinitions.set(id, signature)
          }
        })
        const currentIds = new Set(
          state.boundaries.filter(isRecord).map((boundary) => (typeof boundary.id === "string" ? boundary.id : "")),
        )
        for (const id of previousBoundaryIds)
          if (!currentIds.has(id)) errors.push(`${path}.boundaries dropped persistent boundary '${id}'`)
        previousBoundaryIds.clear()
        currentIds.forEach((id) => previousBoundaryIds.add(id))
      }

      const currentPulses = new Map<string, number>()
      if (Array.isArray(state.pulses))
        for (const pulse of state.pulses)
          if (isRecord(pulse) && typeof pulse.target === "string" && typeof pulse.id === "string")
            currentPulses.set(`${pulse.target}:${pulse.id}`, Number(pulse.untilMs))
      const currentIsolation = new Set<string>()
      if (Array.isArray(state.isolation))
        for (const entry of state.isolation)
          if (isRecord(entry) && typeof entry.target === "string" && typeof entry.id === "string")
            currentIsolation.add(`${entry.target}:${entry.id}`)
      if (index > 0) {
        for (const [key, untilMs] of previousPulses)
          if (at < untilMs && !currentPulses.has(key))
            errors.push(`${path}.pulses dropped active pulse '${key}' before expiry`)
        for (const key of previousIsolation)
          if (!currentIsolation.has(key)) errors.push(`${path}.isolation dropped persistent entry '${key}'`)
      }
      previousPulses = currentPulses
      previousIsolation = currentIsolation
    })
  }
  if (
    Array.isArray(timeline) &&
    timeline.length > 0 &&
    timeline[timeline.length - 1] &&
    isRecord(timeline[timeline.length - 1])
  ) {
    const terminal = timeline[timeline.length - 1] as Record<string, unknown>
    if (terminal.atMs !== duration) errors.push("compiled.timeline has no terminal state")
    const previous = timeline
      .slice(0, -1)
      .reverse()
      .find((state): state is Record<string, unknown> => isRecord(state) && state.atMs !== duration)
    if (previous && terminal.atMs === duration) {
      for (const key of ["nodes", "edges", "isolation", "boundaries"])
        if (!canonicalValuesEqual(previous[key], terminal[key]))
          errors.push("compiled.timeline terminal state may only expire pulses")
    }
  }
  if (totalPulses > VISUAL_PROGRAM_LIMITS.totalPulses * VISUAL_PROGRAM_LIMITS.compiledTimelineStates)
    errors.push("compiled exceeds total pulse snapshots")
  if (totalIsolation > VISUAL_PROGRAM_LIMITS.totalIsolation * VISUAL_PROGRAM_LIMITS.compiledTimelineStates)
    errors.push("compiled exceeds total isolation snapshots")
  if (totalBoundaries > VISUAL_PROGRAM_LIMITS.totalBoundaries * VISUAL_PROGRAM_LIMITS.compiledTimelineStates)
    errors.push("compiled exceeds total boundary snapshots")
  if (totalBoundaryNodes > VISUAL_PROGRAM_LIMITS.totalBoundaryNodes * VISUAL_PROGRAM_LIMITS.compiledTimelineStates)
    errors.push("compiled exceeds total boundary node snapshots")
  if (metrics.words > VISUAL_PROGRAM_LIMITS.compiledWords)
    errors.push(`compiled exceeds ${VISUAL_PROGRAM_LIMITS.compiledWords} words`)

  const assertionIds = new Set<string>()
  let totalChecks = 0
  let totalAssertionIsolation = 0
  const assertions = value.assertions
  if (!Array.isArray(assertions) || assertions.length < 1 || assertions.length > VISUAL_PROGRAM_LIMITS.assertions) {
    errors.push(`compiled.assertions must contain 1-${VISUAL_PROGRAM_LIMITS.assertions} assertions`)
  } else {
    metrics.assertions = assertions.length
    let previousAssertionKey = ""
    for (const [index, assertion] of assertions.entries()) {
      const path = `compiled.assertions[${index}]`
      if (!exactRecord(assertion, ["id", "atMs", "checks"], ["id", "atMs", "checks", "isolation"], path, errors))
        continue
      const id = identifier(assertion.id, `${path}.id`, errors) ? String(assertion.id) : ""
      if (id && assertionIds.has(id)) errors.push(`compiled.assertions contains duplicate id '${id}'`)
      if (id) assertionIds.add(id)
      const atMs = finiteInteger(assertion.atMs, 0, duration, `${path}.atMs`, errors) ? (assertion.atMs as number) : -1
      const assertionKey = `${String(atMs).padStart(6, "0")}:${id}`
      if (previousAssertionKey && compareStrings(previousAssertionKey, assertionKey) > 0)
        errors.push("compiled.assertions must be in canonical order")
      previousAssertionKey = assertionKey
      if (!timelineTimes.has(atMs)) errors.push(`${path} is not on the compiled timeline`)
      if (!Array.isArray(assertion.checks) || assertion.checks.length === 0)
        errors.push(`${path}.checks must be a non-empty array`)
      else {
        if (assertion.checks.length > VISUAL_PROGRAM_LIMITS.checksPerAssertion)
          errors.push(`${path}.checks exceeds ${VISUAL_PROGRAM_LIMITS.checksPerAssertion}`)
        totalChecks += assertion.checks.length
        const seen = new Set<string>()
        let previousCheckKey = ""
        for (const [checkIndex, check] of assertion.checks.entries()) {
          const checkPath = `${path}.checks[${checkIndex}]`
          const info = validateTargeted(check, checkPath, errors)
          if (!info.target || !info.id) continue
          const key = `${info.target}:${info.id}`
          if (previousCheckKey && compareStrings(previousCheckKey, key) > 0)
            errors.push(`${path}.checks must be sorted by target and id`)
          previousCheckKey = key
          if (seen.has(key)) errors.push(`${path}.checks contains a duplicate target`)
          seen.add(key)
          if (!(info.target === "node" ? nodes : edges).has(info.id)) errors.push(`${checkPath} has a dangling target`)
          const state = statesByTime.get(atMs)
          const collection = info.target === "node" ? state?.nodes : state?.edges
          const actual = Array.isArray(collection)
            ? collection.find((entry) => isRecord(entry) && entry.id === info.id)?.state
            : undefined
          if (actual !== check.state) errors.push(`${path} is false for ${info.target} '${info.id}'`)
        }
      }
      if (assertion.isolation !== undefined) {
        if (
          !Array.isArray(assertion.isolation) ||
          assertion.isolation.length > VISUAL_PROGRAM_LIMITS.isolationPerAssertion
        )
          errors.push(`${path}.isolation must contain at most ${VISUAL_PROGRAM_LIMITS.isolationPerAssertion} entries`)
        else {
          totalAssertionIsolation += assertion.isolation.length
          const seen = new Set<string>()
          let previousIsolationKey = ""
          for (const [isolationIndex, entry] of assertion.isolation.entries()) {
            const entryPath = `${path}.isolation[${isolationIndex}]`
            if (!exactRecord(entry, ["target", "id", "mode"], ["target", "id", "mode"], entryPath, errors)) continue
            const target = enumValue(entry.target, TARGETS, `${entryPath}.target`, errors)
              ? (entry.target as string)
              : ""
            const entryId = identifier(entry.id, `${entryPath}.id`, errors) ? String(entry.id) : ""
            const key = `${target}:${entryId}`
            if (previousIsolationKey && compareStrings(previousIsolationKey, key) > 0)
              errors.push(`${path}.isolation must be sorted by target and id`)
            previousIsolationKey = key
            if (seen.has(key)) errors.push(`${path}.isolation contains a duplicate target`)
            seen.add(key)
            if (!(target === "node" ? nodes : edges).has(entryId)) errors.push(`${entryPath} has a dangling target`)
            enumValue(entry.mode, ISOLATION_MODES, `${entryPath}.mode`, errors)
            const actual = statesByTime.get(atMs)?.isolation
            const actualMode = Array.isArray(actual)
              ? actual.find(
                  (candidate) => isRecord(candidate) && candidate.target === target && candidate.id === entryId,
                )?.mode
              : undefined
            if (actualMode !== entry.mode) errors.push(`${path} has false isolation for ${target}:${entryId}`)
          }
        }
      }
    }
  }
  if (totalChecks > VISUAL_PROGRAM_LIMITS.totalChecks) errors.push("compiled exceeds total assertion checks")
  if (totalAssertionIsolation > VISUAL_PROGRAM_LIMITS.totalAssertionIsolation)
    errors.push("compiled exceeds total assertion isolation entries")
  for (const time of timelineTimes)
    if (!Array.isArray(assertions) || !assertions.some((assertion) => isRecord(assertion) && assertion.atMs === time))
      errors.push(`compiled.assertions must cover boundary ${time}ms`)
  if (Array.isArray(assertions)) {
    if (!assertions.some((assertion) => isRecord(assertion) && assertion.atMs === 0))
      errors.push("compiled.assertions must cover initial state")
    if (!assertions.some((assertion) => isRecord(assertion) && assertion.atMs === duration))
      errors.push("compiled.assertions must cover terminal state")
  }
  if (typeof value.inputDigest !== "string" || !/^[a-f0-9]{64}$/.test(value.inputDigest))
    errors.push("compiled.inputDigest is invalid")
  if (typeof value.digest !== "string" || !/^[a-f0-9]{64}$/.test(value.digest))
    errors.push("compiled.digest is invalid")
  return { valid: errors.length === 0, errors, metrics }
}

function isDeeplyFrozen(value: unknown, seen = new WeakSet<object>()): boolean {
  if (value === null || typeof value !== "object") return true
  if (seen.has(value)) return true
  if (!Object.isFrozen(value)) return false
  seen.add(value)
  return Object.values(value).every((entry) => isDeeplyFrozen(entry, seen))
}

const compiledValidationCache = new WeakMap<object, VisualProgramContractValidation>()

export function validateCompiledVisualProgram(value: unknown): VisualProgramContractValidation {
  if (!isRecord(value)) return validateCompiledVisualProgramUncached(value)
  const cached = compiledValidationCache.get(value)
  if (cached) return cached
  const validation = validateCompiledVisualProgramUncached(value)
  // Only cache immutable payloads: object identity is a safe key only when its contents cannot change.
  if (isDeeplyFrozen(value)) compiledValidationCache.set(value, validation)
  return validation
}

export function isCompiledVisualProgram(value: unknown): value is CompiledVisualProgram {
  return validateCompiledVisualProgram(value).valid
}

export function cloneAndFreezeVisualProgram<T>(value: T): T {
  return cloneAndFreeze(value)
}
export function replaceTextBindings<T>(value: T, bindings: readonly VisualRecipeBinding[]): T {
  const byId = new Map(bindings.map((binding) => [binding.id, binding]))
  const replace = (entry: unknown): unknown => {
    if (typeof entry === "string")
      return entry.replace(/\{\{([a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*)\}\}/g, (_match, id) => {
        const binding = byId.get(id)
        if (!binding || binding.type !== "text") throw new Error(`Unsupported or missing text binding '${id}'`)
        return String(binding.value)
      })
    if (Array.isArray(entry)) return entry.map(replace)
    if (isRecord(entry)) {
      const result: Record<string, unknown> = {}
      for (const [key, item] of Object.entries(entry)) result[key] = replace(item)
      return result
    }
    return entry
  }
  return replace(value) as T
}
