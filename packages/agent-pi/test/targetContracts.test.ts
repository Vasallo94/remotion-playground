import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"
import {
  REGISTERED_TARGETS,
  listRegisteredTargetSummaries,
  resolveProductionBriefTarget,
  resolveRegisteredTarget,
  summarizeSelectedRegisteredTarget,
  targetSelectorFromProductionBriefArtifact,
} from "../src/targetContracts.js"
import { PROJECT_ROOT } from "../src/paths.js"
import { buildProductionBriefArtifact, type ProductionBriefCandidate } from "../src/productionBrief.js"

const provided = <T>(value: T) => ({ status: "provided" as const, value, source: "user" as const })
const absent = (rationale: string) => ({ status: "explicitly_absent" as const, rationale })

function targetBrief(subject: string, targetRequirements: ProductionBriefCandidate["targetRequirements"]) {
  return buildProductionBriefArtifact({
    subject: provided(subject),
    objective: provided("Explicit objective"),
    audience: provided("Explicit audience"),
    language: provided("Explicit language"),
    platform: provided("Explicit platform"),
    format: provided("video/mp4"),
    dimensions: provided({ width: 1080, height: 1920, unit: "px" }),
    aspectRatio: provided("9:16"),
    duration: provided({ seconds: 30 }),
    brand: absent("No brand"),
    tone: absent("No tone"),
    evidence: absent("No evidence"),
    assets: absent("No assets"),
    constraints: absent("No constraints"),
    audioPreferences: absent("No audio preferences"),
    targetRequirements,
    acceptanceCriteria: provided(["Meet the objective"]),
    researchRequirement: provided("not_required"),
    researchRationale: provided("No verification requested"),
  })
}

describe("registered target contracts", () => {
  it("registers versioned parent-owned contracts with schema and prop-contract data", () => {
    assert.equal(REGISTERED_TARGETS.schemaVersion, 1)
    assert.equal(REGISTERED_TARGETS.targets.length, 3)
    for (const target of REGISTERED_TARGETS.targets) {
      assert.ok(target.scenes.length > 0)
      for (const scene of target.scenes) {
        assert.ok(scene.schema.id)
        assert.ok(scene.propContract.id)
        assert.ok(scene.propContract.source)
      }
    }
  })

  it("uses only composition adapters actually registered by Root.tsx", () => {
    const root = readFileSync(join(PROJECT_ROOT, "src/Root.tsx"), "utf-8")
    const registeredIds = new Set([...root.matchAll(/<Composition\s+id="([^"]+)"/g)].map((match) => match[1]))
    for (const target of REGISTERED_TARGETS.targets) {
      for (const composition of target.capabilities.compositions) {
        assert.equal(registeredIds.has(composition.id), true, `${composition.id} must be registered in Root.tsx`)
      }
    }
  })

  it("resolves an exact registered target only from explicit technical data", () => {
    const result = resolveRegisteredTarget({
      target: {
        format: "video/mp4",
        dimensions: { width: 1080, height: 1920 },
        theme: "linea-directa",
        composition: "ProductShort",
      },
    })
    assert.equal(result.ok, true)
    if (result.ok) assert.equal(result.target.id, "target.video.003")
  })

  it("adapts only explicit target fields and exact requirement names", () => {
    const artifact = targetBrief(
      "Product marketing tutorial keywords must not select a target",
      provided([
        { name: "target.theme", requirement: "linea-directa" },
        { name: "target.composition", requirement: "ProductShort" },
        { name: "topic recipe", requirement: "target.video.001" },
      ]),
    )
    assert.deepEqual(targetSelectorFromProductionBriefArtifact(artifact), {
      format: "video/mp4",
      dimensions: { width: 1080, height: 1920 },
      theme: "linea-directa",
      composition: "ProductShort",
    })
  })

  it("rejects conflicting exact target requirements instead of dropping them", () => {
    const artifact = targetBrief(
      "Explicit target conflict",
      provided([
        { name: "target.id", requirement: "target.video.001" },
        { name: "target.id", requirement: "target.video.003" },
      ]),
    )
    assert.throws(() => targetSelectorFromProductionBriefArtifact(artifact), /Conflicting explicit target requirements/)
    const resolution = resolveProductionBriefTarget(artifact)
    assert.equal(resolution.ok, false)
    if (!resolution.ok) assert.equal(resolution.code, "unsupported_combination")
  })

  it("returns structured ambiguity and unsupported errors instead of a default", () => {
    const ambiguous = resolveRegisteredTarget({ target: { format: "video/mp4" } })
    assert.equal(ambiguous.ok, false)
    if (!ambiguous.ok) {
      assert.equal(ambiguous.kind, "unresolved")
      assert.equal(ambiguous.code, "ambiguous_target")
    }

    const unsupported = resolveRegisteredTarget({ target: { dimensions: { width: 1, height: 1 } } })
    assert.equal(unsupported.ok, false)
    if (!unsupported.ok) {
      assert.equal(unsupported.kind, "unsupported")
      assert.equal(unsupported.code, "unsupported_combination")
    }
  })

  it("generates a specialist-safe summary only after one contract is explicitly selected", () => {
    const missing = summarizeSelectedRegisteredTarget({})
    assert.equal(missing.ok, false)
    assert.equal("target" in missing, false)

    const ambiguous = summarizeSelectedRegisteredTarget({ target: { format: "video/mp4" } })
    assert.equal(ambiguous.ok, false)
    assert.equal("target" in ambiguous, false)

    const selected = summarizeSelectedRegisteredTarget({ target: { id: "target.video.003" } })
    assert.equal(selected.ok, true)
    if (selected.ok) {
      assert.equal(selected.target.targetId, "target.video.003")
      assert.equal("targets" in selected.target, false)
    }
  })

  it("keeps registry listing parent-only for selection clarification", () => {
    const listing = listRegisteredTargetSummaries()
    assert.deepEqual(Object.keys(listing), ["schemaVersion", "targets"])
    const targets = listing.targets as Array<Record<string, unknown>>
    assert.deepEqual(
      targets.map((target) => target.targetId),
      ["target.video.001", "target.video.002", "target.video.003"],
    )
    assert.ok(targets.every((target) => Array.isArray(target.scenes)))
  })
})
