import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  TARGET_CONTRACT_SCHEMA_VERSION,
  createTargetRegistry,
  resolveTargetContract,
  validateTargetContract,
  type TargetContract,
} from "../src/index.js"

function target(
  id: string,
  options: { width: number; height: number; theme: string; composition: string; publication: string },
): TargetContract {
  return {
    schemaVersion: TARGET_CONTRACT_SCHEMA_VERSION,
    id,
    capabilities: {
      formats: ["video/mp4"],
      dimensions: [{ width: options.width, height: options.height }],
      themes: [options.theme],
      compositions: [{ id: options.composition, schemaId: `schema.${options.composition}` }],
    },
    scenes: [
      {
        id: "builtin.title",
        kind: "builtin",
        schema: { id: "schema.scene.title", version: 1 },
        propContract: { id: "props.scene.title", format: "runtime-reference", source: "schema.scene.title" },
        adapter: { sceneType: "title" },
        metadata: { nested: { labels: ["title"] } },
      },
    ],
    rendering: {
      configSchema: { id: `schema.${options.composition}`, version: 1 },
      fps: { supported: [30], default: 30 },
      defaults: { fps: 30 },
      constraints: {
        configMustValidateAgainst: `schema.${options.composition}`,
        frameAnimation: "declarative-data-only",
      },
    },
    publication: {
      targetId: options.publication,
      adapter: "parent.publisher",
      constraints: { requiresHumanApproval: true },
    },
  }
}

const alpha = target("target.alpha", {
  width: 1280,
  height: 720,
  theme: "theme.alpha",
  composition: "adapter.alpha",
  publication: "publish.alpha",
})
const beta = target("target.beta", {
  width: 1080,
  height: 1920,
  theme: "theme.beta",
  composition: "adapter.beta",
  publication: "publish.beta",
})
const registry = createTargetRegistry([alpha, beta])

describe("target contract", () => {
  it("validates the versioned schema and rejects incompatible versions", () => {
    assert.equal(validateTargetContract(alpha).valid, true)
    const incompatible = { ...alpha, schemaVersion: 0 }
    const validation = validateTargetContract(incompatible)
    assert.equal(validation.valid, false)
    assert.match(validation.errors.join(" "), /schemaVersion/)
  })

  it("rejects malformed nested contracts, non-finite capability data, and inconsistent adapters", () => {
    const malformed = structuredClone(alpha) as unknown as Record<string, unknown>
    const capabilities = malformed.capabilities as Record<string, unknown>
    const dimensions = capabilities.dimensions as Array<{ width: number }>
    const compositions = capabilities.compositions as Array<Record<string, unknown>>
    const scenes = malformed.scenes as Array<Record<string, unknown>>
    const rendering = malformed.rendering as Record<string, unknown>
    const fps = rendering.fps as Record<string, unknown>
    const publication = malformed.publication as Record<string, unknown>

    dimensions[0]!.width = Number.POSITIVE_INFINITY
    compositions[0]!.unexpected = true
    ;(scenes[0]!.propContract as Record<string, unknown>).format = "yaml"
    scenes[0] = {
      ...scenes[0],
      id: "custom.other",
      kind: "custom",
      adapter: { sceneType: "title", componentId: "component" },
    }
    ;(fps.supported as number[])[0] = Number.NaN
    rendering.defaults = { fps: 24 }
    rendering.constraints = { configMustValidateAgainst: "wrong.schema", frameAnimation: "css-transitions" }
    publication.constraints = { requiresHumanApproval: false }

    const validation = validateTargetContract(malformed)
    assert.equal(validation.valid, false)
    const errors = validation.errors.join("\n")
    assert.match(errors, /dimensions\[0\]\.width must be a finite positive integer/)
    assert.match(errors, /compositions\[0\]\.unexpected is not allowed/)
    assert.match(errors, /propContract\.format is invalid/)
    assert.match(errors, /adapter\.sceneType must be 'custom'/)
    assert.match(errors, /id must match adapter\.componentId/)
    assert.match(errors, /fps\.supported must be a non-empty array of finite positive numbers/)
    assert.match(errors, /defaults\.fps must equal fps\.default/)
    assert.match(errors, /constraints\.configMustValidateAgainst must equal configSchema\.id/)
    assert.match(errors, /constraints\.frameAnimation/)
    assert.match(errors, /publication\.constraints\.requiresHumanApproval must be true/)
  })

  it("deeply freezes cloned contracts, arrays, and nested capability structures", () => {
    const mutable = target("target.mutable", {
      width: 640,
      height: 360,
      theme: "theme.mutable",
      composition: "adapter.mutable",
      publication: "publish.mutable",
    })
    const immutable = createTargetRegistry([mutable])
    const contract = immutable.targets[0]!
    const nestedMetadata = contract.scenes[0]!.metadata.nested as { labels: string[] }

    assert.equal(Object.isFrozen(immutable), true)
    assert.equal(Object.isFrozen(immutable.targets), true)
    assert.equal(Object.isFrozen(contract), true)
    assert.equal(Object.isFrozen(contract.capabilities), true)
    assert.equal(Object.isFrozen(contract.capabilities.themes), true)
    assert.equal(Object.isFrozen(contract.capabilities.dimensions[0]), true)
    assert.equal(Object.isFrozen(contract.scenes[0]!.metadata), true)
    assert.equal(Object.isFrozen(nestedMetadata), true)
    assert.equal(Object.isFrozen(nestedMetadata.labels), true)

    assert.throws(() => (contract.capabilities.themes as string[]).push("theme.other"), TypeError)
    assert.throws(() => (nestedMetadata.labels as string[]).push("mutated"), TypeError)
    ;(mutable.capabilities.themes as string[]).push("theme.source-mutation")
    ;(mutable.scenes[0]!.metadata.nested as { labels: string[] }).labels.push("source-mutation")
    assert.deepEqual(contract.capabilities.themes, ["theme.mutable"])
    assert.deepEqual(nestedMetadata.labels, ["title"])
  })

  it("resolves one exact target from an explicit approved-brief selector", () => {
    const result = resolveTargetContract(registry, {
      target: {
        format: "video/mp4",
        dimensions: { width: 1080, height: 1920 },
        theme: "theme.beta",
        composition: "adapter.beta",
      },
    })
    assert.equal(result.ok, true)
    if (result.ok) assert.equal(result.target.id, "target.beta")
  })

  it("reports ambiguity rather than applying a target default", () => {
    const result = resolveTargetContract(registry, { target: { format: "video/mp4" } })
    assert.deepEqual(result, {
      ok: false,
      kind: "unresolved",
      code: "ambiguous_target",
      candidates: ["target.alpha", "target.beta"],
    })
  })

  it("reports missing and unsupported selections structurally", () => {
    const missing = resolveTargetContract(registry, {})
    assert.equal(missing.ok, false)
    if (!missing.ok) {
      assert.equal(missing.kind, "unresolved")
      assert.equal(missing.code, "target_selection_required")
    }

    const unsupported = resolveTargetContract(registry, { target: { dimensions: { width: 1, height: 1 } } })
    assert.equal(unsupported.ok, false)
    if (!unsupported.ok) {
      assert.equal(unsupported.kind, "unsupported")
      assert.equal(unsupported.code, "unsupported_combination")
      assert.equal(unsupported.issues[0].field, "dimensions")
    }
  })

  it("rejects incompatible capability data for an explicitly selected target", () => {
    const result = resolveTargetContract(registry, { target: { id: "target.alpha", theme: "theme.beta" } })
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.kind, "unsupported")
      assert.equal(result.code, "unsupported_capability")
      assert.deepEqual(result.issues, [{ field: "theme", requested: "theme.beta", supported: ["theme.alpha"] }])
    }
  })
})
