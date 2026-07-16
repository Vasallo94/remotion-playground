export * from "./targetContract.js"
export * from "./visualProgramContract.js"
export const COMPOSED_SCENE_VERSION = 1 as const

export const COMPOSED_SCENE_CONTRACT_SUMMARY = {
  version: COMPOSED_SCENE_VERSION,
  sceneKeys: ["version", "title?", "subtitle?", "backgroundTone?", "root"],
  backgroundTones: ["default", "subtle", "contrast"],
  commonNodeKeys: ["tone?", "revealAtMs?", "entrance?", "span?"],
  tones: ["default", "accent", "muted", "success", "warning", "danger"],
  entrances: ["none", "fade", "slide-up", "scale"],
  nodes: {
    group: { required: ["type=group", "direction", "children"], optional: ["columns", "gap", "align"] },
    text: { required: ["type=text", "text"], optional: ["variant", "align"] },
    card: { required: ["type=card", "at least one of title/body/children"], optional: ["title", "body", "children"] },
    metric: { required: ["type=metric", "value", "label"], optional: ["unit"] },
    list: { required: ["type=list", "items"], optional: ["style"] },
    progress: { required: ["type=progress", "label", "value 0-100"], optional: [] },
    divider: { required: ["type=divider"], optional: [] },
    spacer: { required: ["type=spacer", "size"], optional: [] },
  },
  limits: { depth: 5, nodes: 40, childrenPerContainer: 12, words: 220, listItems: 10, revealAtMs: [0, 30_000] },
} as const

export type SemanticTone = "default" | "accent" | "muted" | "success" | "warning" | "danger"
export type Entrance = "none" | "fade" | "slide-up" | "scale"

interface NodeBase {
  tone?: SemanticTone
  revealAtMs?: number
  entrance?: Entrance
  span?: 1 | 2 | 3 | 4
}

export interface GroupNode extends NodeBase {
  type: "group"
  direction: "column" | "row" | "grid"
  columns?: 1 | 2 | 3 | 4
  gap?: "none" | "small" | "medium" | "large"
  align?: "start" | "center" | "end" | "stretch"
  children: ComposedNode[]
}
export interface TextNode extends NodeBase {
  type: "text"
  text: string
  variant?: "title" | "heading" | "body" | "label" | "caption"
  align?: "left" | "center" | "right"
}
export interface CardNode extends NodeBase {
  type: "card"
  title?: string
  body?: string
  children?: ComposedNode[]
}
export interface MetricNode extends NodeBase {
  type: "metric"
  value: string
  label: string
  unit?: string
}
export interface ListNode extends NodeBase {
  type: "list"
  items: string[]
  style?: "bullet" | "number" | "check"
}
export interface ProgressNode extends NodeBase {
  type: "progress"
  label: string
  value: number
}
export interface DividerNode extends NodeBase {
  type: "divider"
}
export interface SpacerNode extends NodeBase {
  type: "spacer"
  size: "small" | "medium" | "large"
}

export type ComposedNode =
  | GroupNode
  | TextNode
  | CardNode
  | MetricNode
  | ListNode
  | ProgressNode
  | DividerNode
  | SpacerNode

export interface ComposedSceneSpec {
  version: typeof COMPOSED_SCENE_VERSION
  title?: string
  subtitle?: string
  backgroundTone?: "default" | "subtle" | "contrast"
  root: GroupNode
}

export interface ComposedSceneContractValidation {
  valid: boolean
  errors: string[]
  metrics: { nodes: number; depth: number; words: number }
}

/** @deprecated Use ComposedSceneContractValidation instead. */
export type ContractValidation = ComposedSceneContractValidation

const LIMITS = { depth: 5, nodes: 40, children: 12, words: 220, listItems: 10, textLength: 500 }
const TONES = new Set(["default", "accent", "muted", "success", "warning", "danger"])
const ENTRANCES = new Set(["none", "fade", "slide-up", "scale"])
const BASE_KEYS = ["type", "tone", "revealAtMs", "entrance", "span"]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function strictKeys(value: Record<string, unknown>, allowed: string[], path: string, errors: string[]): void {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) errors.push(`${path}.${key} is not allowed`)
}

function text(value: unknown, path: string, errors: string[], required = true): number {
  if (value === undefined && !required) return 0
  if (typeof value !== "string" || value.length === 0 || value.length > LIMITS.textLength) {
    errors.push(`${path} must be a non-empty string of at most ${LIMITS.textLength} characters`)
    return 0
  }
  return value.trim().split(/\s+/).filter(Boolean).length
}

function oneOf(value: unknown, allowed: readonly string[], path: string, errors: string[], required = false): void {
  if (value === undefined && !required) return
  if (typeof value !== "string" || !allowed.includes(value))
    errors.push(`${path} must be one of: ${allowed.join(", ")}`)
}

function validateBase(node: Record<string, unknown>, path: string, errors: string[]): void {
  if (node.tone !== undefined && (typeof node.tone !== "string" || !TONES.has(node.tone)))
    errors.push(`${path}.tone is invalid`)
  if (node.entrance !== undefined && (typeof node.entrance !== "string" || !ENTRANCES.has(node.entrance)))
    errors.push(`${path}.entrance is invalid`)
  if (
    node.revealAtMs !== undefined &&
    (typeof node.revealAtMs !== "number" || node.revealAtMs < 0 || node.revealAtMs > 30_000)
  )
    errors.push(`${path}.revealAtMs must be between 0 and 30000`)
  if (node.span !== undefined && (![1, 2, 3, 4].includes(node.span as number) || !Number.isInteger(node.span)))
    errors.push(`${path}.span must be an integer from 1 to 4`)
}

export function validateComposedScene(input: unknown): ComposedSceneContractValidation {
  const errors: string[] = []
  const metrics = { nodes: 0, depth: 0, words: 0 }
  if (!isRecord(input)) return { valid: false, errors: ["scene must be an object"], metrics }
  strictKeys(input, ["version", "title", "subtitle", "backgroundTone", "root"], "scene", errors)
  if (input.version !== COMPOSED_SCENE_VERSION) errors.push(`scene.version must be ${COMPOSED_SCENE_VERSION}`)
  metrics.words += text(input.title, "scene.title", errors, false)
  metrics.words += text(input.subtitle, "scene.subtitle", errors, false)
  oneOf(input.backgroundTone, ["default", "subtle", "contrast"], "scene.backgroundTone", errors)

  const visit = (raw: unknown, path: string, depth: number): void => {
    metrics.nodes += 1
    metrics.depth = Math.max(metrics.depth, depth)
    if (metrics.nodes > LIMITS.nodes) return
    if (depth > LIMITS.depth) errors.push(`${path} exceeds maximum depth ${LIMITS.depth}`)
    if (!isRecord(raw) || typeof raw.type !== "string") {
      errors.push(`${path} must be a typed node object`)
      return
    }
    validateBase(raw, path, errors)
    const allowed = (...keys: string[]) => strictKeys(raw, [...BASE_KEYS, ...keys], path, errors)
    switch (raw.type) {
      case "group": {
        allowed("direction", "columns", "gap", "align", "children")
        oneOf(raw.direction, ["column", "row", "grid"], `${path}.direction`, errors, true)
        if (raw.columns !== undefined && ![1, 2, 3, 4].includes(raw.columns as number))
          errors.push(`${path}.columns must be 1-4`)
        oneOf(raw.gap, ["none", "small", "medium", "large"], `${path}.gap`, errors)
        oneOf(raw.align, ["start", "center", "end", "stretch"], `${path}.align`, errors)
        if (!Array.isArray(raw.children) || raw.children.length === 0 || raw.children.length > LIMITS.children)
          errors.push(`${path}.children must contain 1-${LIMITS.children} nodes`)
        else raw.children.forEach((child, index) => visit(child, `${path}.children[${index}]`, depth + 1))
        break
      }
      case "text":
        allowed("text", "variant", "align")
        metrics.words += text(raw.text, `${path}.text`, errors)
        oneOf(raw.variant, ["title", "heading", "body", "label", "caption"], `${path}.variant`, errors)
        oneOf(raw.align, ["left", "center", "right"], `${path}.align`, errors)
        break
      case "card": {
        allowed("title", "body", "children")
        metrics.words += text(raw.title, `${path}.title`, errors, false)
        metrics.words += text(raw.body, `${path}.body`, errors, false)
        if (raw.children !== undefined) {
          if (!Array.isArray(raw.children) || raw.children.length > LIMITS.children)
            errors.push(`${path}.children must contain at most ${LIMITS.children} nodes`)
          else raw.children.forEach((child, index) => visit(child, `${path}.children[${index}]`, depth + 1))
        }
        if (raw.title === undefined && raw.body === undefined && raw.children === undefined)
          errors.push(`${path} card must contain title, body, or children`)
        break
      }
      case "metric":
        allowed("value", "label", "unit")
        metrics.words += text(raw.value, `${path}.value`, errors)
        metrics.words += text(raw.label, `${path}.label`, errors)
        metrics.words += text(raw.unit, `${path}.unit`, errors, false)
        break
      case "list":
        allowed("items", "style")
        if (!Array.isArray(raw.items) || raw.items.length === 0 || raw.items.length > LIMITS.listItems)
          errors.push(`${path}.items must contain 1-${LIMITS.listItems} strings`)
        else raw.items.forEach((item, index) => (metrics.words += text(item, `${path}.items[${index}]`, errors)))
        oneOf(raw.style, ["bullet", "number", "check"], `${path}.style`, errors)
        break
      case "progress":
        allowed("label", "value")
        metrics.words += text(raw.label, `${path}.label`, errors)
        if (typeof raw.value !== "number" || raw.value < 0 || raw.value > 100)
          errors.push(`${path}.value must be between 0 and 100`)
        break
      case "divider":
        allowed()
        break
      case "spacer":
        allowed("size")
        oneOf(raw.size, ["small", "medium", "large"], `${path}.size`, errors, true)
        break
      default:
        errors.push(`${path}.type '${raw.type}' is not supported`)
    }
  }

  visit(input.root, "scene.root", 1)
  if (metrics.nodes > LIMITS.nodes) errors.push(`scene exceeds maximum node count ${LIMITS.nodes}`)
  if (metrics.words > LIMITS.words) errors.push(`scene exceeds maximum word count ${LIMITS.words}`)
  return { valid: errors.length === 0, errors, metrics }
}
