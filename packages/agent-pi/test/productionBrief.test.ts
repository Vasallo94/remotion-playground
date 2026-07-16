import assert from "node:assert/strict"
import { mkdtempSync, readdirSync, realpathSync, rmdirSync, unlinkSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { afterEach, beforeEach, describe, it } from "node:test"
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent"
import { ThreadEventBus } from "../src/events.js"
import { ProductionBriefIntakeRunner, type IntakeSpecialistSession } from "../src/intake.js"
import { ModelRouter } from "../src/modelRouter.js"
import {
  buildProductionBriefArtifact,
  validateProductionBriefArtifact,
  type ProductionBriefArtifact,
  type ProductionBriefCandidate,
} from "../src/productionBrief.js"
import { AgentPiStore } from "../src/store.js"

let dbDir: string
let store: AgentPiStore
let eventBus: ThreadEventBus
let threadId: string

const provided = <T>(value: T) => ({ status: "provided" as const, value, source: "user" as const })
const absent = (rationale: string) => ({ status: "explicitly_absent" as const, rationale })
const unresolved = (question: string, rationale: string) => ({ status: "unresolved" as const, question, rationale })

function createCandidate(overrides: Partial<ProductionBriefCandidate> = {}): ProductionBriefCandidate {
  const brief: ProductionBriefCandidate = {
    subject: provided("An explicit subject"),
    objective: provided("Explain the stated objective"),
    audience: provided("The named audience"),
    language: provided("The requested language"),
    platform: provided("The requested platform"),
    format: provided("The requested format"),
    dimensions: provided({ width: 100, height: 100, unit: "px" }),
    aspectRatio: provided("1:1"),
    duration: provided({ seconds: 30 }),
    brand: absent("No brand was supplied or requested."),
    tone: absent("No tone preference was supplied."),
    evidence: provided({ claims: [], sourceReferences: [], externalVerification: "not_required" }),
    assets: absent("No assets were supplied or requested."),
    constraints: absent("No additional constraints were supplied."),
    audioPreferences: absent("No audio preference was supplied."),
    targetRequirements: provided([{ name: "rendering target", requirement: "Use the approved target contract." }]),
    acceptanceCriteria: provided(["The result must satisfy the stated objective."]),
    researchRequirement: provided("not_required"),
    researchRationale: provided("External verification was explicitly not required."),
    ...overrides,
  }
  return brief
}

function createArtifact(overrides: Partial<ProductionBriefCandidate> = {}): ProductionBriefArtifact {
  return buildProductionBriefArtifact(createCandidate(overrides))
}

beforeEach(() => {
  dbDir = mkdtempSync(join(tmpdir(), "agent-pi-production-brief-"))
  store = new AgentPiStore(join(dbDir, "test.db"))
  eventBus = new ThreadEventBus(store)
  threadId = store.createThread().id
})

function cleanupTemporaryDirectory(path: string): void {
  const temporaryRoot = realpathSync(tmpdir())
  const target = realpathSync(path)
  if (target === temporaryRoot || !target.startsWith(`${temporaryRoot}/`)) {
    throw new Error(`Refusing to clean a path outside the test temporary directory: ${path}`)
  }
  for (const entry of readdirSync(target)) {
    const child = join(target, entry)
    unlinkSync(child)
  }
  rmdirSync(target)
}

afterEach(() => {
  store.close()
  cleanupTemporaryDirectory(dbDir)
})

function createFakeSession(
  onPrompt: (text: string, listener: ((event: AgentSessionEvent) => void) | undefined) => void,
  state: { disposed: boolean; aborted: boolean },
): IntakeSpecialistSession {
  let listener: ((event: AgentSessionEvent) => void) | undefined
  return {
    subscribe(nextListener) {
      listener = nextListener
      return () => {
        listener = undefined
      }
    },
    async prompt(text) {
      onPrompt(text, listener)
    },
    async abort() {
      state.aborted = true
    },
    dispose() {
      state.disposed = true
    },
  }
}

describe("ProductionBrief contract", () => {
  it("accepts a complete brief and derives research from explicit research inputs", () => {
    const artifact = createArtifact({
      evidence: provided({ claims: ["A supplied claim"], sourceReferences: [], externalVerification: "required" }),
      researchRequirement: provided("required"),
      researchRationale: provided("The claim requires external verification."),
    })
    const validation = validateProductionBriefArtifact(artifact)

    assert.equal(validation.valid, true)
    assert.equal(validation.ready, true)
    assert.deepEqual(artifact.research, {
      researchRequired: true,
      rationale: "The claim requires external verification.",
      status: "required",
    })
  })

  it("preserves unresolved required fields as focused questions instead of inferring them", () => {
    const artifact = createArtifact({
      subject: unresolved("What is the exact subject?", "The request did not identify a subject."),
    })

    const validation = validateProductionBriefArtifact(artifact)

    assert.equal(validation.valid, true)
    assert.equal(validation.ready, false)
    assert.deepEqual(validation.unresolvedFields, ["subject"])
    assert.deepEqual(validation.questions, [
      {
        field: "subject",
        required: true,
        question: "What is the exact subject?",
        rationale: "The request did not identify a subject.",
      },
    ])
  })

  it("constructs parent-owned metadata and ignores candidate attempts to override it", () => {
    const candidate = {
      ...createCandidate(),
      artifactType: "not_production_brief",
      schemaVersion: 999,
      research: { researchRequired: true, rationale: "model override", status: "required" },
      unresolvedFields: ["subject"],
    } as unknown as ProductionBriefCandidate

    const artifact = buildProductionBriefArtifact(candidate)

    assert.equal(artifact.artifactType, "production_brief")
    assert.equal(artifact.schemaVersion, 1)
    assert.deepEqual(artifact.research, {
      researchRequired: false,
      rationale: "External verification was explicitly not required.",
      status: "not_required",
    })
    assert.deepEqual(artifact.unresolvedFields, [])
    assert.equal("research" in artifact.brief, false)
    assert.equal(validateProductionBriefArtifact(artifact).valid, true)
  })

  it("keeps research unresolved when either explicit research input is unresolved", () => {
    const artifact = buildProductionBriefArtifact(
      createCandidate({
        researchRequirement: unresolved("Should research be performed?", "The requester did not specify verification."),
        researchRationale: unresolved("Why is research needed?", "The research rationale was not supplied."),
        evidence: absent("No evidence requirements were supplied."),
      }),
    )

    const validation = validateProductionBriefArtifact(artifact)

    assert.equal(validation.valid, true)
    assert.equal(validation.ready, false)
    assert.deepEqual(artifact.research, {
      researchRequired: null,
      rationale: "The requester did not specify verification.",
      status: "unresolved",
    })
    assert.deepEqual(validation.unresolvedFields, ["researchRequirement", "researchRationale"])
  })

  it("rejects conflicting evidence and explicit research requirements", () => {
    const artifact = buildProductionBriefArtifact(
      createCandidate({
        evidence: provided({ claims: ["A claim"], sourceReferences: [], externalVerification: "required" }),
        researchRequirement: provided("not_required"),
      }),
    )

    const validation = validateProductionBriefArtifact(artifact)

    assert.equal(validation.valid, false)
    assert.match(validation.errors.join("\n"), /researchRequirement conflicts with evidence.externalVerification/)
  })

  it("rejects explicitly absent required input and unknown fields", () => {
    const artifact = createArtifact() as unknown as Record<string, unknown> & { brief: Record<string, unknown> }
    artifact.brief.subject = absent("The subject is not applicable.")
    artifact.brief.unexpected = "not allowed"

    const validation = validateProductionBriefArtifact(artifact)

    assert.equal(validation.valid, false)
    assert.match(validation.errors.join("\n"), /subject is required and cannot be explicitly absent/)
    assert.match(validation.errors.join("\n"), /contains unknown field 'unexpected'/)
  })

  it("persists and reloads the production_brief artifact through the generic store contract", () => {
    const artifact = createArtifact()
    const saved = store.saveArtifact({ threadId, kind: "production_brief", data: artifact })
    const restored = store.getArtifact<ProductionBriefArtifact>(saved.id)

    assert.deepEqual(restored?.data, artifact)
    assert.equal(restored?.kind, "production_brief")
    assert.equal(restored?.version, 1)
  })
})

describe("ProductionBriefIntakeRunner", () => {
  it("returns needs_input for unresolved required data and exposes only structured lifecycle events", async () => {
    const state = { disposed: false, aborted: false }
    const candidate = createCandidate({ subject: unresolved("What is the exact subject?", "No subject was supplied.") })
    const prompts: string[] = []
    const modelRouter = new ModelRouter({ routes: { intake: { provider: "test", model: "intake-model" } } })
    const runner = new ProductionBriefIntakeRunner({
      threadId,
      eventBus,
      modelRouter,
      authStorage: modelRouter.authStorage,
      modelRegistry: modelRouter.modelRegistry,
      createSession: async ({ captureBrief }) =>
        createFakeSession((text) => {
          prompts.push(text)
          captureBrief(candidate)
        }, state),
    })

    const result = await runner.run("Create a video without a subject")

    assert.equal(result.status, "needs_input")
    assert.equal(result.validation.ready, false)
    assert.deepEqual(result.validation.unresolvedFields, ["subject"])
    assert.equal(prompts.length, 1)
    assert.equal(state.disposed, true)
    assert.deepEqual(
      store.listEvents(threadId).map((event) => event.type),
      ["subagent_start", "subagent_end"],
    )
  })

  it("allows exactly one parent repair turn for an invalid candidate and preserves exact parent errors", async () => {
    const state = { disposed: false, aborted: false }
    const prompts: string[] = []
    const validCandidate = createCandidate()
    const invalidCandidate = { ...validCandidate, unresolvedFields: ["subject"] }
    const modelRouter = new ModelRouter({ routes: {} })
    const runner = new ProductionBriefIntakeRunner({
      threadId,
      eventBus,
      modelRouter,
      authStorage: modelRouter.authStorage,
      modelRegistry: modelRouter.modelRegistry,
      createSession: async ({ captureBrief }) =>
        createFakeSession((text) => {
          prompts.push(text)
          captureBrief((prompts.length === 1 ? invalidCandidate : validCandidate) as ProductionBriefCandidate)
        }, state),
    })

    const result = await runner.run("Create a complete production brief")

    assert.equal(result.status, "ready")
    assert.equal(prompts.length, 2)
    assert.match(prompts[1], /production brief candidate contains unknown field 'unresolvedFields'/)
    assert.match(prompts[1], /submit_production_brief exactly once/)
    assert.equal(state.disposed, true)
  })

  it("fails after one repair turn when the parent still rejects the artifact", async () => {
    const state = { disposed: false, aborted: false }
    let promptCount = 0
    const invalidCandidate = { ...createCandidate(), unresolvedFields: ["subject"] }
    const modelRouter = new ModelRouter({ routes: {} })
    const runner = new ProductionBriefIntakeRunner({
      threadId,
      eventBus,
      modelRouter,
      authStorage: modelRouter.authStorage,
      modelRegistry: modelRouter.modelRegistry,
      createSession: async ({ captureBrief }) =>
        createFakeSession(() => {
          promptCount += 1
          captureBrief(invalidCandidate as ProductionBriefCandidate)
        }, state),
    })

    await assert.rejects(() => runner.run("Create a malformed brief"), /after one repair turn/)
    assert.equal(promptCount, 2)
    assert.equal(state.disposed, true)
  })
})
