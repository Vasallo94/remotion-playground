export const TARGET_CONTRACT_SCHEMA_VERSION = 1 as const

export interface TargetDimension {
  width: number
  height: number
}

export interface TargetCompositionCapability {
  /** Internal runtime adapter identifier. It is capability data, not role identity. */
  id: string
  schemaId: string
}

export interface TargetSceneContract {
  id: string
  kind: "builtin" | "custom"
  /** Exact runtime schema adapter used by the parent validator. */
  schema: { id: string; version: number }
  /** Exact prop contract reference or source supplied by the parent after target selection. */
  propContract: { id: string; format: "typescript" | "json" | "runtime-reference"; source: string }
  adapter: { sceneType: string; componentId?: string }
  metadata: Record<string, unknown>
}

export interface TargetContract {
  schemaVersion: typeof TARGET_CONTRACT_SCHEMA_VERSION
  id: string
  capabilities: {
    formats: readonly string[]
    dimensions: readonly TargetDimension[]
    themes: readonly string[]
    compositions: readonly TargetCompositionCapability[]
  }
  scenes: readonly TargetSceneContract[]
  rendering: {
    configSchema: { id: string; version: number }
    fps: { supported: readonly number[]; default: number }
    defaults: { fps: number }
    constraints: { configMustValidateAgainst: string; frameAnimation: "declarative-data-only" }
  }
  publication: { targetId: string; adapter: string; constraints: { requiresHumanApproval: true } }
}

export interface TargetSelector {
  id?: string
  format?: string
  dimensions?: TargetDimension
  theme?: string
  composition?: string
  publicationTarget?: string
}

export interface ApprovedBriefLike {
  target?: TargetSelector | null
}

export interface TargetRegistry {
  schemaVersion: typeof TARGET_CONTRACT_SCHEMA_VERSION
  targets: readonly TargetContract[]
}

export interface TargetContractValidation {
  valid: boolean
  errors: string[]
}

export interface UnsupportedTargetCapability {
  field: "id" | "format" | "dimensions" | "theme" | "composition" | "publicationTarget"
  requested: unknown
  supported: unknown[]
}

export type TargetResolution =
  | { ok: true; target: TargetContract }
  | {
      ok: false
      kind: "unresolved"
      code: "target_selection_required" | "ambiguous_target"
      candidates: string[]
    }
  | {
      ok: false
      kind: "unsupported"
      code: "unknown_target_id" | "unsupported_capability" | "unsupported_combination"
      issues: UnsupportedTargetCapability[]
    }

const PROP_CONTRACT_FORMATS = ["typescript", "json", "runtime-reference"] as const
const FRAME_ANIMATION_CONSTRAINT = "declarative-data-only"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
}

function isFinitePositiveInteger(value: unknown): value is number {
  return isFinitePositive(value) && Number.isInteger(value)
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[], path: string, errors: string[]): void {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) errors.push(`${path}.${key} is not allowed`)
}

function hasRequiredKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  path: string,
  errors: string[],
): void {
  for (const key of required) if (!(key in value)) errors.push(`${path}.${key} is required`)
}

function validateExactRecord(
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
  hasRequiredKeys(value, required, path, errors)
  hasOnlyKeys(value, allowed, path, errors)
  return true
}

function validateStringArray(value: unknown, path: string, errors: string[]): value is string[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((entry) => !isNonEmptyString(entry))) {
    errors.push(`${path} must be a non-empty string array`)
    return false
  }
  if (new Set(value).size !== value.length) errors.push(`${path} must not contain duplicates`)
  return true
}

function validateDimension(value: unknown, path: string, errors: string[]): value is TargetDimension {
  if (!validateExactRecord(value, ["width", "height"], ["width", "height"], path, errors)) return false
  if (!isFinitePositiveInteger(value.width)) errors.push(`${path}.width must be a finite positive integer`)
  if (!isFinitePositiveInteger(value.height)) errors.push(`${path}.height must be a finite positive integer`)
  return isFinitePositiveInteger(value.width) && isFinitePositiveInteger(value.height)
}

function sameDimension(left: TargetDimension, right: TargetDimension): boolean {
  return left.width === right.width && left.height === right.height
}

function dimensionKey(value: TargetDimension): string {
  return `${value.width}x${value.height}`
}

function validateCapabilities(value: unknown, errors: string[]): void {
  const path = "target.capabilities"
  if (
    !validateExactRecord(
      value,
      ["formats", "dimensions", "themes", "compositions"],
      ["formats", "dimensions", "themes", "compositions"],
      path,
      errors,
    )
  )
    return

  validateStringArray(value.formats, `${path}.formats`, errors)
  validateStringArray(value.themes, `${path}.themes`, errors)

  if (!Array.isArray(value.dimensions) || value.dimensions.length === 0) {
    errors.push(`${path}.dimensions must be a non-empty array`)
  } else {
    const dimensions = value.dimensions.filter((dimension, index) =>
      validateDimension(dimension, `${path}.dimensions[${index}]`, errors),
    )
    if (new Set(dimensions.map(dimensionKey)).size !== dimensions.length)
      errors.push(`${path}.dimensions must not contain duplicates`)
  }

  if (!Array.isArray(value.compositions) || value.compositions.length === 0) {
    errors.push(`${path}.compositions must be a non-empty array`)
  } else {
    const ids = new Set<string>()
    value.compositions.forEach((composition, index) => {
      const compositionPath = `${path}.compositions[${index}]`
      if (!validateExactRecord(composition, ["id", "schemaId"], ["id", "schemaId"], compositionPath, errors)) return
      if (!isNonEmptyString(composition.id)) errors.push(`${compositionPath}.id must be a non-empty string`)
      if (!isNonEmptyString(composition.schemaId)) errors.push(`${compositionPath}.schemaId must be a non-empty string`)
      if (isNonEmptyString(composition.id)) {
        if (ids.has(composition.id)) errors.push(`${path}.compositions must not contain duplicate ids`)
        ids.add(composition.id)
      }
    })
  }
}

function validateScene(scene: unknown, index: number, errors: string[]): void {
  const path = `target.scenes[${index}]`
  if (
    !validateExactRecord(
      scene,
      ["id", "kind", "schema", "propContract", "adapter", "metadata"],
      ["id", "kind", "schema", "propContract", "adapter", "metadata"],
      path,
      errors,
    )
  )
    return

  if (!isNonEmptyString(scene.id)) errors.push(`${path}.id must be a non-empty string`)
  if (scene.kind !== "builtin" && scene.kind !== "custom") errors.push(`${path}.kind must be 'builtin' or 'custom'`)

  if (validateExactRecord(scene.schema, ["id", "version"], ["id", "version"], `${path}.schema`, errors)) {
    if (!isNonEmptyString(scene.schema.id)) errors.push(`${path}.schema.id must be a non-empty string`)
    if (!isFinitePositiveInteger(scene.schema.version))
      errors.push(`${path}.schema.version must be a finite positive integer`)
  }

  if (
    validateExactRecord(
      scene.propContract,
      ["id", "format", "source"],
      ["id", "format", "source"],
      `${path}.propContract`,
      errors,
    )
  ) {
    if (!isNonEmptyString(scene.propContract.id)) errors.push(`${path}.propContract.id must be a non-empty string`)
    if (!PROP_CONTRACT_FORMATS.includes(scene.propContract.format as (typeof PROP_CONTRACT_FORMATS)[number])) {
      errors.push(`${path}.propContract.format is invalid`)
    }
    if (!isNonEmptyString(scene.propContract.source))
      errors.push(`${path}.propContract.source must be a non-empty string`)
  }

  if (!isRecord(scene.metadata)) errors.push(`${path}.metadata must be an object`)

  if (!isRecord(scene.adapter)) {
    errors.push(`${path}.adapter must be an object`)
    return
  }
  const isCustom = scene.kind === "custom"
  const adapterKeys = isCustom ? ["sceneType", "componentId"] : ["sceneType"]
  hasRequiredKeys(scene.adapter, adapterKeys, `${path}.adapter`, errors)
  hasOnlyKeys(scene.adapter, adapterKeys, `${path}.adapter`, errors)
  if (!isNonEmptyString(scene.adapter.sceneType)) errors.push(`${path}.adapter.sceneType must be a non-empty string`)

  if (isCustom) {
    if (scene.adapter.sceneType !== "custom")
      errors.push(`${path}.adapter.sceneType must be 'custom' for a custom scene`)
    if (!isNonEmptyString(scene.adapter.componentId))
      errors.push(`${path}.adapter.componentId must be a non-empty string for a custom scene`)
    if (
      isNonEmptyString(scene.id) &&
      isNonEmptyString(scene.adapter.componentId) &&
      scene.id !== `custom.${scene.adapter.componentId}`
    ) {
      errors.push(`${path}.id must match adapter.componentId`)
    }
  } else if (
    scene.kind === "builtin" &&
    isNonEmptyString(scene.id) &&
    isNonEmptyString(scene.adapter.sceneType) &&
    scene.id !== `builtin.${scene.adapter.sceneType}`
  ) {
    errors.push(`${path}.id must match adapter.sceneType`)
  }
}

function validateRendering(value: unknown, capabilities: unknown, errors: string[]): void {
  const path = "target.rendering"
  if (
    !validateExactRecord(
      value,
      ["configSchema", "fps", "defaults", "constraints"],
      ["configSchema", "fps", "defaults", "constraints"],
      path,
      errors,
    )
  )
    return

  let configSchemaId: string | undefined
  if (validateExactRecord(value.configSchema, ["id", "version"], ["id", "version"], `${path}.configSchema`, errors)) {
    if (!isNonEmptyString(value.configSchema.id)) errors.push(`${path}.configSchema.id must be a non-empty string`)
    else configSchemaId = value.configSchema.id
    if (!isFinitePositiveInteger(value.configSchema.version))
      errors.push(`${path}.configSchema.version must be a finite positive integer`)
  }

  if (isRecord(capabilities) && Array.isArray(capabilities.compositions) && configSchemaId) {
    const compositionSchemaIds = capabilities.compositions
      .filter(isRecord)
      .map((composition) => composition.schemaId)
      .filter(isNonEmptyString)
    if (!compositionSchemaIds.includes(configSchemaId))
      errors.push(`${path}.configSchema.id must match a capability composition schemaId`)
  }

  let defaultFps: number | undefined
  if (validateExactRecord(value.fps, ["supported", "default"], ["supported", "default"], `${path}.fps`, errors)) {
    if (
      !Array.isArray(value.fps.supported) ||
      value.fps.supported.length === 0 ||
      value.fps.supported.some((fps) => !isFinitePositive(fps))
    ) {
      errors.push(`${path}.fps.supported must be a non-empty array of finite positive numbers`)
    } else if (new Set(value.fps.supported).size !== value.fps.supported.length) {
      errors.push(`${path}.fps.supported must not contain duplicates`)
    }
    if (!isFinitePositive(value.fps.default)) errors.push(`${path}.fps.default must be a finite positive number`)
    else defaultFps = value.fps.default
    if (defaultFps !== undefined && Array.isArray(value.fps.supported) && !value.fps.supported.includes(defaultFps)) {
      errors.push(`${path}.fps.default must be one supported fps`)
    }
  }

  if (validateExactRecord(value.defaults, ["fps"], ["fps"], `${path}.defaults`, errors)) {
    if (!isFinitePositive(value.defaults.fps)) errors.push(`${path}.defaults.fps must be a finite positive number`)
    if (defaultFps !== undefined && value.defaults.fps !== defaultFps)
      errors.push(`${path}.defaults.fps must equal fps.default`)
  }

  if (
    validateExactRecord(
      value.constraints,
      ["configMustValidateAgainst", "frameAnimation"],
      ["configMustValidateAgainst", "frameAnimation"],
      `${path}.constraints`,
      errors,
    )
  ) {
    if (value.constraints.configMustValidateAgainst !== configSchemaId)
      errors.push(`${path}.constraints.configMustValidateAgainst must equal configSchema.id`)
    if (value.constraints.frameAnimation !== FRAME_ANIMATION_CONSTRAINT) {
      errors.push(`${path}.constraints.frameAnimation must be '${FRAME_ANIMATION_CONSTRAINT}'`)
    }
  }
}

function validatePublication(value: unknown, errors: string[]): void {
  const path = "target.publication"
  if (
    !validateExactRecord(
      value,
      ["targetId", "adapter", "constraints"],
      ["targetId", "adapter", "constraints"],
      path,
      errors,
    )
  )
    return
  if (!isNonEmptyString(value.targetId)) errors.push(`${path}.targetId must be a non-empty string`)
  if (!isNonEmptyString(value.adapter)) errors.push(`${path}.adapter must be a non-empty string`)
  if (
    validateExactRecord(
      value.constraints,
      ["requiresHumanApproval"],
      ["requiresHumanApproval"],
      `${path}.constraints`,
      errors,
    )
  ) {
    if (value.constraints.requiresHumanApproval !== true)
      errors.push(`${path}.constraints.requiresHumanApproval must be true`)
  }
}

export function validateTargetContract(input: unknown): TargetContractValidation {
  const errors: string[] = []
  if (
    !validateExactRecord(
      input,
      ["schemaVersion", "id", "capabilities", "scenes", "rendering", "publication"],
      ["schemaVersion", "id", "capabilities", "scenes", "rendering", "publication"],
      "target",
      errors,
    )
  ) {
    return { valid: false, errors }
  }
  if (input.schemaVersion !== TARGET_CONTRACT_SCHEMA_VERSION)
    errors.push(`target.schemaVersion must be ${TARGET_CONTRACT_SCHEMA_VERSION}`)
  if (!isNonEmptyString(input.id)) errors.push("target.id must be a non-empty string")

  validateCapabilities(input.capabilities, errors)

  if (!Array.isArray(input.scenes) || input.scenes.length === 0) {
    errors.push("target.scenes must be a non-empty array")
  } else {
    const sceneIds = new Set<string>()
    input.scenes.forEach((scene, index) => {
      validateScene(scene, index, errors)
      if (isRecord(scene) && isNonEmptyString(scene.id)) {
        if (sceneIds.has(scene.id)) errors.push(`target.scenes contains duplicate id '${scene.id}'`)
        sceneIds.add(scene.id)
      }
    })
  }

  validateRendering(input.rendering, input.capabilities, errors)
  validatePublication(input.publication, errors)
  return { valid: errors.length === 0, errors }
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

export function createTargetRegistry(targets: readonly TargetContract[]): TargetRegistry {
  const errors: string[] = []
  const ids = new Set<string>()
  for (const target of targets) {
    const validation = validateTargetContract(target)
    errors.push(...validation.errors.map((error) => `${target.id || "unknown"}: ${error}`))
    if (ids.has(target.id)) errors.push(`duplicate target id '${target.id}'`)
    ids.add(target.id)
  }
  if (errors.length > 0) throw new Error(`Invalid target registry: ${errors.join("; ")}`)
  return cloneAndFreeze({ schemaVersion: TARGET_CONTRACT_SCHEMA_VERSION, targets: [...targets] })
}

function requestedSelectors(input: ApprovedBriefLike): TargetSelector | undefined {
  if (!input || !isRecord(input) || input.target === null || input.target === undefined || !isRecord(input.target))
    return undefined
  return input.target as TargetSelector
}

function selectorIssues(target: TargetContract, selector: TargetSelector): UnsupportedTargetCapability[] {
  const issues: UnsupportedTargetCapability[] = []
  if (selector.format !== undefined && !target.capabilities.formats.includes(selector.format)) {
    issues.push({ field: "format", requested: selector.format, supported: [...target.capabilities.formats] })
  }
  if (
    selector.dimensions !== undefined &&
    !target.capabilities.dimensions.some((value) => sameDimension(value, selector.dimensions!))
  ) {
    issues.push({
      field: "dimensions",
      requested: selector.dimensions,
      supported: target.capabilities.dimensions.map(dimensionKey),
    })
  }
  if (selector.theme !== undefined && !target.capabilities.themes.includes(selector.theme)) {
    issues.push({ field: "theme", requested: selector.theme, supported: [...target.capabilities.themes] })
  }
  if (
    selector.composition !== undefined &&
    !target.capabilities.compositions.some((value) => value.id === selector.composition)
  ) {
    issues.push({
      field: "composition",
      requested: selector.composition,
      supported: target.capabilities.compositions.map((value) => value.id),
    })
  }
  if (selector.publicationTarget !== undefined && target.publication.targetId !== selector.publicationTarget) {
    issues.push({
      field: "publicationTarget",
      requested: selector.publicationTarget,
      supported: [target.publication.targetId],
    })
  }
  return issues
}

export function resolveTargetContract(registry: TargetRegistry, input: ApprovedBriefLike): TargetResolution {
  const selector = requestedSelectors(input)
  if (!selector || Object.keys(selector).length === 0) {
    return {
      ok: false,
      kind: "unresolved",
      code: "target_selection_required",
      candidates: registry.targets.map((target) => target.id),
    }
  }

  if (selector.id !== undefined) {
    const target = registry.targets.find((candidate) => candidate.id === selector.id)
    if (!target) {
      return {
        ok: false,
        kind: "unsupported",
        code: "unknown_target_id",
        issues: [{ field: "id", requested: selector.id, supported: registry.targets.map((candidate) => candidate.id) }],
      }
    }
    const issues = selectorIssues(target, selector)
    return issues.length === 0
      ? { ok: true, target }
      : { ok: false, kind: "unsupported", code: "unsupported_capability", issues }
  }

  const candidates = registry.targets.filter((target) => selectorIssues(target, selector).length === 0)
  if (candidates.length === 1) return { ok: true, target: candidates[0] }
  if (candidates.length > 1)
    return {
      ok: false,
      kind: "unresolved",
      code: "ambiguous_target",
      candidates: candidates.map((target) => target.id),
    }

  const issues = registry.targets.flatMap((target) => selectorIssues(target, selector))
  const uniqueIssues = issues.filter(
    (issue, index) => issues.findIndex((candidate) => candidate.field === issue.field) === index,
  )
  return { ok: false, kind: "unsupported", code: "unsupported_combination", issues: uniqueIssues }
}
