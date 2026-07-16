import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  TARGET_CONTRACT_SCHEMA_VERSION,
  createTargetRegistry,
  resolveTargetContract,
  type ApprovedBriefLike,
  type TargetContract,
  type TargetSelector,
  type TargetRegistry,
  type TargetResolution,
  type TargetSceneContract,
} from "@claqueta/scene-contracts"
import { PROJECT_ROOT } from "./paths.js"
import {
  validateProductionBriefArtifact,
  type ProductionBrief,
  type ProductionBriefArtifact,
  type ProvidedBriefInput,
  type TargetRequirement,
} from "./productionBrief.js"

interface CatalogScene {
  type?: string
  componentId?: string
  composition?: string
  propContract?: string
  [key: string]: unknown
}

interface SourceCatalog {
  scenes?: Record<string, { builtin?: CatalogScene[]; custom?: CatalogScene[] }>
}

const TUTORIAL_THEME_CAPABILITIES = ["default", "linea-directa", "atom-dark", "h-alpha", "claqueta", "betelgeuse"]
const PRODUCT_THEME_CAPABILITIES = ["linea-directa"]
const FORMAT_CAPABILITY = "video/mp4"

function loadSourceCatalog(): SourceCatalog {
  return JSON.parse(readFileSync(join(PROJECT_ROOT, "src/shared/scene-catalog.json"), "utf-8")) as SourceCatalog
}

function contractMetadata(entry: CatalogScene): Record<string, unknown> {
  const { type, componentId, composition, propContract, ...metadata } = entry
  void type
  void componentId
  void composition
  void propContract
  return metadata
}

function builtinScenes(entries: CatalogScene[], compositionSchemaId: string): TargetSceneContract[] {
  const schemaPath = compositionSchemaId.split("#", 1)[0]!
  const runtimeSchemaSource = readFileSync(join(PROJECT_ROOT, schemaPath), "utf-8")
  return entries.flatMap((entry) => {
    if (typeof entry.type !== "string" || !entry.type) return []
    return [
      {
        id: `builtin.${entry.type}`,
        kind: "builtin" as const,
        schema: { id: `${compositionSchemaId}#${entry.type}`, version: 1 },
        propContract: {
          id: `${compositionSchemaId}#${entry.type}`,
          format: "runtime-reference" as const,
          source: `${compositionSchemaId}#${entry.type}`,
        },
        adapter: { sceneType: entry.type },
        metadata: { ...contractMetadata(entry), runtimeSchemaSource },
      },
    ]
  })
}

function customScenes(entries: CatalogScene[], compositionSchemaId: string): TargetSceneContract[] {
  return entries.flatMap((entry) => {
    if (typeof entry.componentId !== "string" || !entry.componentId) return []
    const source =
      typeof entry.propContract === "string" ? entry.propContract : `${compositionSchemaId}#custom:${entry.componentId}`
    return [
      {
        id: `custom.${entry.componentId}`,
        kind: "custom" as const,
        schema: { id: `${compositionSchemaId}#custom`, version: 1 },
        propContract: {
          id: `${compositionSchemaId}#custom:${entry.componentId}`,
          format: typeof entry.propContract === "string" ? ("typescript" as const) : ("runtime-reference" as const),
          source,
        },
        adapter: { sceneType: "custom", componentId: entry.componentId },
        metadata: contractMetadata(entry),
      },
    ]
  })
}

function target(
  id: string,
  options: {
    dimensions: { width: number; height: number }
    themes: readonly string[]
    composition: string
    configSchemaId: string
    scenes: readonly TargetSceneContract[]
    publicationTarget: string
    publicationAdapter: string
  },
): TargetContract {
  return {
    schemaVersion: TARGET_CONTRACT_SCHEMA_VERSION,
    id,
    capabilities: {
      formats: [FORMAT_CAPABILITY],
      dimensions: [options.dimensions],
      themes: options.themes,
      compositions: [{ id: options.composition, schemaId: options.configSchemaId }],
    },
    scenes: options.scenes,
    rendering: {
      configSchema: { id: options.configSchemaId, version: 1 },
      fps: { supported: [30], default: 30 },
      defaults: { fps: 30 },
      constraints: { configMustValidateAgainst: options.configSchemaId, frameAnimation: "declarative-data-only" },
    },
    publication: {
      targetId: options.publicationTarget,
      adapter: options.publicationAdapter,
      constraints: { requiresHumanApproval: true },
    },
  }
}

function buildRegisteredTargetRegistry(catalog: SourceCatalog): TargetRegistry {
  const tutorial = catalog.scenes?.tutorial ?? {}
  const product = catalog.scenes?.productShort ?? {}
  const tutorialSchemaId = "src/compositions/ClaudeCodeTutorial/schema.ts#TutorialConfigSchema"
  const productSchemaId = "src/compositions/ProductShort/schema.ts#ProductShortConfigSchema"
  const tutorialScenes = [
    ...builtinScenes(tutorial.builtin ?? [], tutorialSchemaId),
    ...customScenes(tutorial.custom ?? [], tutorialSchemaId),
  ]
  const productScenes = builtinScenes(product.builtin ?? [], productSchemaId)

  return createTargetRegistry([
    target("target.video.001", {
      dimensions: { width: 1280, height: 720 },
      themes: TUTORIAL_THEME_CAPABILITIES,
      composition: "ClaudeCodeTutorial",
      configSchemaId: tutorialSchemaId,
      scenes: tutorialScenes,
      publicationTarget: "content/tutorials",
      publicationAdapter: "content-tutorial-publisher",
    }),
    target("target.video.002", {
      dimensions: { width: 1080, height: 1920 },
      themes: ["h-alpha"],
      composition: "VerticalShort",
      configSchemaId: tutorialSchemaId,
      scenes: tutorialScenes,
      publicationTarget: "content/shorts",
      publicationAdapter: "content-short-publisher",
    }),
    target("target.video.003", {
      dimensions: { width: 1080, height: 1920 },
      themes: PRODUCT_THEME_CAPABILITIES,
      composition: "ProductShort",
      configSchemaId: productSchemaId,
      scenes: productScenes,
      publicationTarget: "content/shorts",
      publicationAdapter: "content-short-publisher",
    }),
  ])
}

export const REGISTERED_TARGETS = buildRegisteredTargetRegistry(loadSourceCatalog())

export interface SelectedTargetArtifact {
  artifactType: "selected_target"
  schemaVersion: 1
  target: { id: string; schemaVersion: number }
  productionBrief: { artifactId: string; version: number }
  selector: TargetSelector
}

const TARGET_REQUIREMENT_SELECTOR_FIELDS = {
  "target.id": "id",
  "target.theme": "theme",
  "target.composition": "composition",
  "target.publicationTarget": "publicationTarget",
} as const satisfies Readonly<Record<string, keyof TargetSelector>>

function providedValue<T>(input: ProductionBrief[keyof ProductionBrief]): T | undefined {
  return input && typeof input === "object" && "status" in input && input.status === "provided"
    ? (input as ProvidedBriefInput<T>).value
    : undefined
}

/** Maps only explicit technical brief fields and exact target requirement names. */
export function targetSelectorFromProductionBrief(brief: ProductionBrief): TargetSelector {
  const selector: TargetSelector = {}
  const format = providedValue<string>(brief.format)
  const dimensions = providedValue<{ width: number; height: number }>(brief.dimensions)
  if (format !== undefined) selector.format = format
  if (dimensions !== undefined) selector.dimensions = { width: dimensions.width, height: dimensions.height }

  const requirements = providedValue<TargetRequirement[]>(brief.targetRequirements) ?? []
  for (const entry of requirements) {
    const field = TARGET_REQUIREMENT_SELECTOR_FIELDS[entry.name as keyof typeof TARGET_REQUIREMENT_SELECTOR_FIELDS]
    if (field === undefined) continue
    const previous = selector[field]
    if (previous !== undefined && previous !== entry.requirement) {
      throw new Error(`Conflicting explicit target requirements for '${entry.name}'`)
    }
    selector[field] = entry.requirement
  }
  return selector
}

export function targetSelectorFromProductionBriefArtifact(artifact: ProductionBriefArtifact): TargetSelector {
  const validation = validateProductionBriefArtifact(artifact)
  if (!validation.valid || !validation.ready) {
    throw new Error(`A valid ready production brief is required for target resolution: ${validation.errors.join("; ")}`)
  }
  return targetSelectorFromProductionBrief(artifact.brief)
}

export function resolveProductionBriefTarget(artifact: ProductionBriefArtifact): TargetResolution {
  try {
    return resolveRegisteredTarget({ target: targetSelectorFromProductionBriefArtifact(artifact) })
  } catch (error) {
    return {
      ok: false,
      kind: "unsupported",
      code: "unsupported_combination",
      issues: [
        {
          field: "id",
          requested: error instanceof Error ? error.message : String(error),
          supported: REGISTERED_TARGETS.targets.map((target) => target.id),
        },
      ],
    }
  }
}

export function buildSelectedTargetArtifact(
  targetContract: TargetContract,
  productionBrief: { id: string; version: number; data: ProductionBriefArtifact },
): SelectedTargetArtifact {
  return {
    artifactType: "selected_target",
    schemaVersion: 1,
    target: { id: targetContract.id, schemaVersion: targetContract.schemaVersion },
    productionBrief: { artifactId: productionBrief.id, version: productionBrief.version },
    selector: targetSelectorFromProductionBriefArtifact(productionBrief.data),
  }
}

function selectorsEqual(left: TargetSelector, right: TargetSelector): boolean {
  const leftKeys = Object.keys(left).sort()
  const rightKeys = Object.keys(right).sort()
  if (JSON.stringify(leftKeys) !== JSON.stringify(rightKeys)) return false
  return leftKeys.every((key) => {
    const leftValue = left[key as keyof TargetSelector]
    const rightValue = right[key as keyof TargetSelector]
    return JSON.stringify(leftValue) === JSON.stringify(rightValue)
  })
}

function isTargetSelectorShape(value: unknown): value is TargetSelector {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const selector = value as Record<string, unknown>
  const allowed = new Set(["id", "format", "dimensions", "theme", "composition", "publicationTarget"])
  if (Object.keys(selector).some((key) => !allowed.has(key))) return false
  for (const key of ["id", "format", "theme", "composition", "publicationTarget"]) {
    if (selector[key] !== undefined && (typeof selector[key] !== "string" || selector[key].trim() === "")) return false
  }
  if (selector.dimensions !== undefined) {
    const dimensions = selector.dimensions
    if (
      typeof dimensions !== "object" ||
      dimensions === null ||
      Array.isArray(dimensions) ||
      Object.keys(dimensions).some((key) => key !== "width" && key !== "height") ||
      typeof (dimensions as { width?: unknown }).width !== "number" ||
      typeof (dimensions as { height?: unknown }).height !== "number" ||
      !Number.isInteger((dimensions as { width: number }).width) ||
      !Number.isInteger((dimensions as { height: number }).height) ||
      (dimensions as { width: number }).width <= 0 ||
      (dimensions as { height: number }).height <= 0
    ) {
      return false
    }
  }
  return true
}

export function isSelectedTargetArtifactForBrief(
  value: unknown,
  brief: { id: string; version: number; data?: ProductionBriefArtifact },
): value is SelectedTargetArtifact {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const artifact = value as Partial<SelectedTargetArtifact>
  if (
    Object.keys(value).some(
      (key) => !["artifactType", "schemaVersion", "target", "productionBrief", "selector"].includes(key),
    ) ||
    typeof artifact.target !== "object" ||
    artifact.target === null ||
    Array.isArray(artifact.target) ||
    Object.keys(artifact.target).some((key) => !["id", "schemaVersion"].includes(key)) ||
    typeof artifact.productionBrief !== "object" ||
    artifact.productionBrief === null ||
    Array.isArray(artifact.productionBrief) ||
    Object.keys(artifact.productionBrief).some((key) => !["artifactId", "version"].includes(key)) ||
    !isTargetSelectorShape(artifact.selector) ||
    artifact.artifactType !== "selected_target" ||
    artifact.schemaVersion !== 1 ||
    typeof artifact.target?.id !== "string" ||
    artifact.target.schemaVersion !== TARGET_CONTRACT_SCHEMA_VERSION ||
    artifact.productionBrief?.artifactId !== brief.id ||
    artifact.productionBrief.version !== brief.version ||
    typeof artifact.selector !== "object" ||
    artifact.selector === null ||
    Array.isArray(artifact.selector)
  ) {
    return false
  }
  const registered = REGISTERED_TARGETS.targets.find((target) => target.id === artifact.target!.id)
  if (registered?.schemaVersion !== artifact.target.schemaVersion) return false
  if (brief.data) {
    let expectedSelector: TargetSelector
    try {
      expectedSelector = targetSelectorFromProductionBriefArtifact(brief.data)
    } catch {
      return false
    }
    if (!selectorsEqual(artifact.selector as TargetSelector, expectedSelector)) return false
  }
  const resolution = resolveRegisteredTarget({ target: artifact.selector as TargetSelector })
  return resolution.ok && resolution.target.id === artifact.target.id
}

export function resolveRegisteredTarget(input: ApprovedBriefLike): TargetResolution {
  return resolveTargetContract(REGISTERED_TARGETS, input)
}

export interface ResolvedTargetContractSummary extends Record<string, unknown> {
  schemaVersion: number
  targetId: string
  capabilities: TargetContract["capabilities"]
  scenes: Array<{
    id: string
    kind: TargetSceneContract["kind"]
    schema: TargetSceneContract["schema"]
    propContract: TargetSceneContract["propContract"]
    adapter: TargetSceneContract["adapter"]
    metadata: Record<string, unknown>
  }>
  rendering: TargetContract["rendering"]
  publication: TargetContract["publication"]
}

export function summarizeTargetContract(targetContract: TargetContract): ResolvedTargetContractSummary {
  return {
    schemaVersion: targetContract.schemaVersion,
    targetId: targetContract.id,
    capabilities: targetContract.capabilities,
    scenes: targetContract.scenes.map((scene) => ({
      id: scene.id,
      kind: scene.kind,
      schema: scene.schema,
      propContract: scene.propContract,
      adapter: scene.adapter,
      metadata: scene.metadata,
    })),
    rendering: targetContract.rendering,
    publication: targetContract.publication,
  }
}

export type SelectedTargetSummary =
  | { ok: true; target: ResolvedTargetContractSummary }
  | Exclude<TargetResolution, { ok: true }>

function canonicalTargetJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalTargetJson).join(",")}]`
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalTargetJson(entry)}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}

export function targetContractFromResolvedSummary(value: unknown): TargetContract {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Exactly one resolved target contract summary is required")
  }
  const summary = value as Record<string, unknown>
  if (typeof summary.targetId !== "string") throw new Error("Resolved target summary must contain targetId")
  const target = REGISTERED_TARGETS.targets.find((candidate) => candidate.id === summary.targetId)
  if (!target) throw new Error(`Resolved target summary references unknown target '${summary.targetId}'`)
  if (canonicalTargetJson(summary) !== canonicalTargetJson(summarizeTargetContract(target))) {
    throw new Error(`Resolved target summary for '${summary.targetId}' does not match the parent registry`)
  }
  return target
}

/** Parent-only listing for target-selection clarification UI. Never pass this registry to a specialist. */
export function listRegisteredTargetSummaries(): Record<string, unknown> {
  return {
    schemaVersion: REGISTERED_TARGETS.schemaVersion,
    targets: REGISTERED_TARGETS.targets.map(summarizeTargetContract),
  }
}

/** Summaries cross a specialist boundary only after an explicit selector resolves one contract. */
export function summarizeSelectedRegisteredTarget(input: ApprovedBriefLike): SelectedTargetSummary {
  const resolution = resolveRegisteredTarget(input)
  if (!resolution.ok) return resolution
  return { ok: true, target: summarizeTargetContract(resolution.target) }
}
