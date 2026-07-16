export const PRODUCTION_BRIEF_SCHEMA_VERSION = 1 as const

export type ProductionBriefInputStatus = "provided" | "explicitly_absent" | "unresolved"
export type ProductionBriefInputSource = "user" | "human_review" | "previous_artifact"

export interface ProvidedBriefInput<TValue> {
  status: "provided"
  value: TValue
  source: ProductionBriefInputSource
}

export interface ExplicitlyAbsentBriefInput {
  status: "explicitly_absent"
  rationale: string
}

export interface UnresolvedBriefInput {
  status: "unresolved"
  question: string
  rationale: string
}

export type ProductionBriefInput<TValue> =
  | ProvidedBriefInput<TValue>
  | ExplicitlyAbsentBriefInput
  | UnresolvedBriefInput

export type RequiredProductionBriefInput<TValue> = ProvidedBriefInput<TValue> | UnresolvedBriefInput
export type OptionalProductionBriefInput<TValue> = ProductionBriefInput<TValue>

export interface ProductionDimensions {
  width: number
  height: number
  unit: string
}

export type ProductionDuration = { seconds: number } | { minSeconds: number; maxSeconds: number }

export interface EvidenceRequirements {
  claims: string[]
  sourceReferences: string[]
  externalVerification: "required" | "not_required"
}

export interface AudioPreferences {
  voiceover: "required" | "optional" | "none"
  music: "required" | "optional" | "none"
  soundEffects: "required" | "optional" | "none"
  accessibilityNotes: string[]
  notes: string[]
}

export interface TargetRequirement {
  name: string
  requirement: string
}

export interface ResearchDecision {
  researchRequired: boolean | null
  rationale: string
  status: "required" | "not_required" | "unresolved"
}

export interface ProductionBrief {
  schemaVersion: typeof PRODUCTION_BRIEF_SCHEMA_VERSION
  subject: RequiredProductionBriefInput<string>
  objective: RequiredProductionBriefInput<string>
  audience: RequiredProductionBriefInput<string>
  language: RequiredProductionBriefInput<string>
  platform: RequiredProductionBriefInput<string>
  format: RequiredProductionBriefInput<string>
  dimensions: RequiredProductionBriefInput<ProductionDimensions>
  aspectRatio: RequiredProductionBriefInput<string>
  duration: RequiredProductionBriefInput<ProductionDuration>
  brand: OptionalProductionBriefInput<string>
  tone: OptionalProductionBriefInput<string>
  evidence: OptionalProductionBriefInput<EvidenceRequirements>
  assets: OptionalProductionBriefInput<string[]>
  constraints: OptionalProductionBriefInput<string[]>
  audioPreferences: OptionalProductionBriefInput<AudioPreferences>
  targetRequirements: RequiredProductionBriefInput<TargetRequirement[]>
  acceptanceCriteria: RequiredProductionBriefInput<string[]>
  researchRequirement: RequiredProductionBriefInput<"required" | "not_required">
  researchRationale: RequiredProductionBriefInput<string>
}

export interface ProductionBriefArtifact {
  artifactType: "production_brief"
  schemaVersion: typeof PRODUCTION_BRIEF_SCHEMA_VERSION
  brief: ProductionBrief
  research: ResearchDecision
  unresolvedFields: string[]
}

/** The only brief shape accepted from the intake specialist. */
export type ProductionBriefCandidate = Omit<ProductionBrief, "schemaVersion">

export type ProductionBriefFieldName = Exclude<keyof ProductionBrief, "schemaVersion">

export interface ProductionBriefQuestion {
  field: ProductionBriefFieldName
  required: boolean
  question: string
  rationale: string
}

export interface ProductionBriefValidation {
  valid: boolean
  ready: boolean
  errors: string[]
  unresolvedFields: ProductionBriefFieldName[]
  questions: ProductionBriefQuestion[]
}

const REQUIRED_FIELDS = new Set<ProductionBriefFieldName>([
  "subject",
  "objective",
  "audience",
  "language",
  "platform",
  "format",
  "dimensions",
  "aspectRatio",
  "duration",
  "targetRequirements",
  "acceptanceCriteria",
  "researchRequirement",
  "researchRationale",
])

const ALL_FIELDS: ProductionBriefFieldName[] = [
  ...REQUIRED_FIELDS,
  "brand",
  "tone",
  "evidence",
  "assets",
  "constraints",
  "audioPreferences",
]
const INPUT_KEYS = {
  provided: ["status", "value", "source"],
  explicitly_absent: ["status", "rationale"],
  unresolved: ["status", "question", "rationale"],
} as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], path: string, errors: string[]): void {
  const expectedSet = new Set(expected)
  for (const key of Object.keys(value)) {
    if (!expectedSet.has(key)) errors.push(`${path} contains unknown field '${key}'`)
  }
  for (const key of expected) {
    if (!(key in value)) errors.push(`${path}.${key} is required`)
  }
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function validateInput(
  value: unknown,
  path: string,
  errors: string[],
  validateProvided: (provided: unknown, path: string, errors: string[]) => void,
): ProductionBriefInputStatus | undefined {
  if (!isRecord(value) || typeof value.status !== "string") {
    errors.push(`${path} must declare provided, explicitly_absent, or unresolved status`)
    return undefined
  }
  if (!(value.status in INPUT_KEYS)) {
    errors.push(`${path}.status is invalid`)
    return undefined
  }
  exactKeys(value, INPUT_KEYS[value.status as keyof typeof INPUT_KEYS], path, errors)
  if (value.status === "provided") {
    if (!(["user", "human_review", "previous_artifact"] as string[]).includes(String(value.source))) {
      errors.push(`${path}.source is invalid`)
    }
    validateProvided(value.value, `${path}.value`, errors)
  } else {
    if (!nonEmptyString(value.rationale)) errors.push(`${path}.rationale must be a non-empty string`)
    if (value.status === "unresolved" && !nonEmptyString(value.question)) {
      errors.push(`${path}.question must be a non-empty string`)
    }
  }
  return value.status as ProductionBriefInputStatus
}

function validateString(value: unknown, path: string, errors: string[]): void {
  if (!nonEmptyString(value)) errors.push(`${path} must be a non-empty string`)
}

function validateStringArray(value: unknown, path: string, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array`)
    return
  }
  value.forEach((item, index) => validateString(item, `${path}[${index}]`, errors))
}

function validateDimensions(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`)
    return
  }
  exactKeys(value, ["width", "height", "unit"], path, errors)
  for (const key of ["width", "height"] as const) {
    if (typeof value[key] !== "number" || !Number.isFinite(value[key]) || value[key] <= 0) {
      errors.push(`${path}.${key} must be a positive finite number`)
    }
  }
  validateString(value.unit, `${path}.unit`, errors)
}

function validateDuration(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`)
    return
  }
  const hasSeconds = "seconds" in value
  const hasRange = "minSeconds" in value || "maxSeconds" in value
  if (hasSeconds === hasRange || (!hasSeconds && !hasRange)) {
    errors.push(`${path} must contain either seconds or minSeconds and maxSeconds`)
    return
  }
  if (hasSeconds) {
    exactKeys(value, ["seconds"], path, errors)
    if (typeof value.seconds !== "number" || !Number.isFinite(value.seconds) || value.seconds <= 0) {
      errors.push(`${path}.seconds must be a positive finite number`)
    }
    return
  }
  exactKeys(value, ["minSeconds", "maxSeconds"], path, errors)
  if (
    typeof value.minSeconds !== "number" ||
    !Number.isFinite(value.minSeconds) ||
    value.minSeconds <= 0 ||
    typeof value.maxSeconds !== "number" ||
    !Number.isFinite(value.maxSeconds) ||
    value.maxSeconds < value.minSeconds
  ) {
    errors.push(`${path}.minSeconds and maxSeconds must be positive and ordered`)
  }
}

function validateEvidence(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`)
    return
  }
  exactKeys(value, ["claims", "sourceReferences", "externalVerification"], path, errors)
  validateStringArray(value.claims, `${path}.claims`, errors)
  validateStringArray(value.sourceReferences, `${path}.sourceReferences`, errors)
  if (value.externalVerification !== "required" && value.externalVerification !== "not_required") {
    errors.push(`${path}.externalVerification must be required or not_required`)
  }
}

function validateAudioPreferences(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`)
    return
  }
  exactKeys(value, ["voiceover", "music", "soundEffects", "accessibilityNotes", "notes"], path, errors)
  for (const key of ["voiceover", "music", "soundEffects"] as const) {
    if (!["required", "optional", "none"].includes(String(value[key]))) {
      errors.push(`${path}.${key} must be required, optional, or none`)
    }
  }
  validateStringArray(value.accessibilityNotes, `${path}.accessibilityNotes`, errors)
  validateStringArray(value.notes, `${path}.notes`, errors)
}

function validateTargetRequirements(value: unknown, path: string, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array`)
    return
  }
  value.forEach((item, index) => {
    const itemPath = `${path}[${index}]`
    if (!isRecord(item)) {
      errors.push(`${itemPath} must be an object`)
      return
    }
    exactKeys(item, ["name", "requirement"], itemPath, errors)
    validateString(item.name, `${itemPath}.name`, errors)
    validateString(item.requirement, `${itemPath}.requirement`, errors)
  })
}

function validateResearch(value: ResearchDecision, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push("research must be an object")
    return
  }
  exactKeys(value, ["researchRequired", "rationale", "status"], "research", errors)
  if (value.researchRequired !== true && value.researchRequired !== false && value.researchRequired !== null) {
    errors.push("research.researchRequired must be true, false, or null")
  }
  validateString(value.rationale, "research.rationale", errors)
  if (!["required", "not_required", "unresolved"].includes(String(value.status))) {
    errors.push("research.status is invalid")
  }
  if (value.status === "required" && value.researchRequired !== true)
    errors.push("research.required must have researchRequired=true")
  if (value.status === "not_required" && value.researchRequired !== false) {
    errors.push("research.not_required must have researchRequired=false")
  }
  if (value.status === "unresolved" && value.researchRequired !== null) {
    errors.push("research.unresolved must have researchRequired=null")
  }
}

export function deriveResearchRequirement(
  brief: Pick<ProductionBriefCandidate, "researchRequirement" | "researchRationale">,
): ResearchDecision {
  const researchRequirement = brief.researchRequirement
  const researchRationale = brief.researchRationale
  if (researchRequirement?.status === "provided" && researchRationale?.status === "provided") {
    const required = researchRequirement.value === "required"
    return {
      researchRequired: required,
      rationale: researchRationale.value,
      status: required ? "required" : "not_required",
    }
  }

  const unresolvedRationale =
    researchRequirement?.status === "unresolved"
      ? researchRequirement.rationale
      : researchRationale?.status === "unresolved"
        ? researchRationale.rationale
        : "The explicit research requirement and rationale are unresolved."
  return {
    researchRequired: null,
    rationale: unresolvedRationale,
    status: "unresolved",
  }
}

function normalizeProductionBrief(brief: ProductionBriefCandidate): ProductionBrief {
  const candidate = brief as Record<ProductionBriefFieldName, unknown>
  return {
    schemaVersion: PRODUCTION_BRIEF_SCHEMA_VERSION,
    subject: candidate.subject as ProductionBrief["subject"],
    objective: candidate.objective as ProductionBrief["objective"],
    audience: candidate.audience as ProductionBrief["audience"],
    language: candidate.language as ProductionBrief["language"],
    platform: candidate.platform as ProductionBrief["platform"],
    format: candidate.format as ProductionBrief["format"],
    dimensions: candidate.dimensions as ProductionBrief["dimensions"],
    aspectRatio: candidate.aspectRatio as ProductionBrief["aspectRatio"],
    duration: candidate.duration as ProductionBrief["duration"],
    brand: candidate.brand as ProductionBrief["brand"],
    tone: candidate.tone as ProductionBrief["tone"],
    evidence: candidate.evidence as ProductionBrief["evidence"],
    assets: candidate.assets as ProductionBrief["assets"],
    constraints: candidate.constraints as ProductionBrief["constraints"],
    audioPreferences: candidate.audioPreferences as ProductionBrief["audioPreferences"],
    targetRequirements: candidate.targetRequirements as ProductionBrief["targetRequirements"],
    acceptanceCriteria: candidate.acceptanceCriteria as ProductionBrief["acceptanceCriteria"],
    researchRequirement: candidate.researchRequirement as ProductionBrief["researchRequirement"],
    researchRationale: candidate.researchRationale as ProductionBrief["researchRationale"],
  }
}

function unresolvedBriefFields(brief: ProductionBrief): ProductionBriefFieldName[] {
  return ALL_FIELDS.filter((field) => brief[field]?.status === "unresolved")
}

export function buildProductionBriefArtifact(brief: ProductionBriefCandidate): ProductionBriefArtifact {
  const normalizedBrief = normalizeProductionBrief(brief)
  return {
    artifactType: "production_brief",
    schemaVersion: PRODUCTION_BRIEF_SCHEMA_VERSION,
    brief: normalizedBrief,
    research: deriveResearchRequirement(normalizedBrief),
    unresolvedFields: unresolvedBriefFields(normalizedBrief),
  }
}

export function validateProductionBriefCandidate(value: unknown): ProductionBriefValidation {
  const errors: string[] = []
  if (!isRecord(value)) {
    return {
      valid: false,
      ready: false,
      errors: ["production brief candidate must be an object"],
      unresolvedFields: [],
      questions: [],
    }
  }
  exactKeys(value, ALL_FIELDS, "production brief candidate", errors)
  const artifact = buildProductionBriefArtifact(value as ProductionBriefCandidate)
  const validation = validateProductionBriefArtifact(artifact)
  return {
    ...validation,
    valid: errors.length === 0 && validation.valid,
    errors: [...errors, ...validation.errors],
  }
}

export function validateProductionBriefArtifact(value: unknown): ProductionBriefValidation {
  const errors: string[] = []
  if (!isRecord(value))
    return {
      valid: false,
      ready: false,
      errors: ["production brief artifact must be an object"],
      unresolvedFields: [],
      questions: [],
    }
  exactKeys(value, ["artifactType", "schemaVersion", "brief", "research", "unresolvedFields"], "artifact", errors)
  if (value.artifactType !== "production_brief") errors.push("artifact.artifactType must be production_brief")
  if (value.schemaVersion !== PRODUCTION_BRIEF_SCHEMA_VERSION) errors.push("artifact.schemaVersion is unsupported")
  if (!isRecord(value.brief)) errors.push("artifact.brief must be an object")
  if (!Array.isArray(value.unresolvedFields) || value.unresolvedFields.some((field) => typeof field !== "string")) {
    errors.push("artifact.unresolvedFields must be an array of field names")
  }
  validateResearch(value.research as ResearchDecision, errors)

  const unresolvedFields: ProductionBriefFieldName[] = []
  const questions: ProductionBriefQuestion[] = []
  if (isRecord(value.brief)) {
    const brief = value.brief
    exactKeys(brief, ["schemaVersion", ...ALL_FIELDS], "artifact.brief", errors)
    if (brief.schemaVersion !== PRODUCTION_BRIEF_SCHEMA_VERSION)
      errors.push("artifact.brief.schemaVersion is unsupported")
    for (const field of ALL_FIELDS) {
      const status = validateInput(brief[field], `artifact.brief.${field}`, errors, (provided, path, fieldErrors) => {
        if (field === "dimensions") validateDimensions(provided, path, fieldErrors)
        else if (field === "duration") validateDuration(provided, path, fieldErrors)
        else if (field === "evidence") validateEvidence(provided, path, fieldErrors)
        else if (field === "assets" || field === "constraints" || field === "acceptanceCriteria")
          validateStringArray(provided, path, fieldErrors)
        else if (field === "targetRequirements") validateTargetRequirements(provided, path, fieldErrors)
        else if (field === "audioPreferences") validateAudioPreferences(provided, path, fieldErrors)
        else if (field === "researchRequirement") {
          if (provided !== "required" && provided !== "not_required")
            fieldErrors.push(`${path} must be required or not_required`)
        } else validateString(provided, path, fieldErrors)
      })
      if (status === "unresolved") {
        unresolvedFields.push(field)
        const unresolved = brief[field] as UnresolvedBriefInput
        questions.push({
          field,
          required: REQUIRED_FIELDS.has(field),
          question: unresolved.question,
          rationale: unresolved.rationale,
        })
      }
      if (REQUIRED_FIELDS.has(field) && status === "explicitly_absent") {
        errors.push(`artifact.brief.${field} is required and cannot be explicitly absent`)
      }
    }

    const evidence = brief.evidence as ProductionBriefInput<EvidenceRequirements>
    const researchRequirement = brief.researchRequirement as RequiredProductionBriefInput<"required" | "not_required">
    if (evidence?.status === "provided" && researchRequirement?.status === "provided") {
      const expectedRequirement = evidence.value.externalVerification
      if (researchRequirement.value !== expectedRequirement) {
        errors.push("artifact.brief.researchRequirement conflicts with evidence.externalVerification")
      }
    }
    const declaredUnresolved = Array.isArray(value.unresolvedFields) ? value.unresolvedFields : []
    if (JSON.stringify([...declaredUnresolved].sort()) !== JSON.stringify([...unresolvedFields].sort())) {
      errors.push("artifact.unresolvedFields must exactly match unresolved brief fields")
    }
    const research = value.research as Partial<ResearchDecision> | undefined
    const derived = deriveResearchRequirement(brief as ProductionBriefCandidate)
    if (
      !research ||
      research.status !== derived.status ||
      research.researchRequired !== derived.researchRequired ||
      research.rationale !== derived.rationale
    ) {
      errors.push("artifact.research must match the explicit research requirement and rationale")
    }
  }

  const valid = errors.length === 0
  return {
    valid,
    ready: valid && unresolvedFields.filter((field) => REQUIRED_FIELDS.has(field)).length === 0,
    errors,
    unresolvedFields,
    questions,
  }
}

export function isProductionBriefArtifact(value: unknown): value is ProductionBriefArtifact {
  return validateProductionBriefArtifact(value).valid
}

export function requiredProductionBriefFields(): readonly ProductionBriefFieldName[] {
  return [...REQUIRED_FIELDS]
}
