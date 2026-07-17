import assert from "node:assert/strict"
import { join } from "node:path"
import { describe, it } from "node:test"
import { createVisualRecipeTemplate } from "@claqueta/scene-contracts"
import { cascadeFixture } from "../../scene-contracts/test/fixtures/cascade.js"
import { AgentPiStore } from "../src/store.js"
import { cleanupTestDirectory, createTestTemporaryDirectory } from "../src/testCleanup.js"
import {
  buildActiveVisualRecipeSet,
  buildVisualRecipeArtifacts,
  projectActiveVisualRecipes,
  verifyActiveVisualRecipeSet,
  verifyVisualRecipeArtifacts,
} from "../src/visualRecipes.js"

const template = createVisualRecipeTemplate({
  version: 1,
  templateId: "cascade-containment",
  program: cascadeFixture,
  bindings: [],
})

function build(sceneIndex = 1) {
  return buildVisualRecipeArtifacts({ targetId: "claude-code-tutorial", sceneIndex, template })
}

describe("minimal Visual Recipe artifacts", () => {
  it("builds deterministic recipe and complete boundary evidence", () => {
    const first = build()
    const second = build()
    assert.deepEqual(first, second)
    assert.deepEqual(
      first.evidence.boundaries.map((boundary) => boundary.atMs),
      [0, ...cascadeFixture.events.map((event) => event.atMs), cascadeFixture.durationMs],
    )
    assert.equal(verifyVisualRecipeArtifacts(first.recipe, first.evidence), true)

    const tampered = structuredClone(first.recipe)
    tampered.compiled.durationMs += 1
    assert.equal(verifyVisualRecipeArtifacts(tampered, first.evidence), false)
    const tamperedEvidence = structuredClone(first.evidence)
    tamperedEvidence.boundaries[0]!.stateDigest = "0".repeat(64)
    assert.equal(verifyVisualRecipeArtifacts(first.recipe, tamperedEvidence), false)
  })

  it("activates idempotently, replaces one scene, and rejects cross-target reuse", () => {
    const first = build(1).recipe
    const active = buildActiveVisualRecipeSet(first.targetId, first)
    assert.equal(verifyActiveVisualRecipeSet(active), true)
    assert.deepEqual(buildActiveVisualRecipeSet(first.targetId, first, active), active)

    const replacement = buildVisualRecipeArtifacts({
      targetId: first.targetId,
      sceneIndex: 1,
      template: createVisualRecipeTemplate({ ...template, templateId: "cascade-containment-v2" }),
    }).recipe
    const replaced = buildActiveVisualRecipeSet(first.targetId, replacement, active)
    assert.notEqual(replaced.digest, active.digest)
    assert.equal(replaced.entries.length, 1)
    assert.equal(verifyActiveVisualRecipeSet({ ...replaced, digest: "0".repeat(64) }), false)
    assert.throws(() => buildActiveVisualRecipeSet("product-short", first), /target does not match/)
  })

  it("projects exact compiled props without mutating unrelated scenes or prior configs", () => {
    const { recipe } = build(1)
    const active = buildActiveVisualRecipeSet(recipe.targetId, recipe)
    const config = {
      id: "projection-test",
      scenes: [
        { type: "intro", title: "Keep me" },
        { type: "callout", text: "Replace me" },
        { type: "outro", title: "Keep me too" },
      ],
    }
    const original = structuredClone(config)
    const projected = projectActiveVisualRecipes(config, active, [recipe])
    assert.deepEqual(config, original)
    assert.deepEqual((projected.scenes as unknown[])[0], original.scenes[0])
    assert.deepEqual((projected.scenes as unknown[])[2], original.scenes[2])
    assert.deepEqual((projected.scenes as Array<Record<string, unknown>>)[1], {
      type: "custom",
      componentId: "visual-program",
      props: { compiled: recipe.compiled },
      durationInSeconds: recipe.compiled.durationMs / 1000,
    })
  })

  it("persists recipe, evidence, and active set through the existing artifact store", () => {
    const directory = createTestTemporaryDirectory("agent-pi-visual-recipe-")
    const database = join(directory, "recipes.db")
    const { recipe, evidence } = build()
    const active = buildActiveVisualRecipeSet(recipe.targetId, recipe)
    let store = new AgentPiStore(database)
    const threadId = store.createThread().id
    store.saveArtifact({ threadId, kind: "visual_recipe", data: recipe, approved: false })
    store.saveArtifact({ threadId, kind: "visual_recipe_evidence", data: evidence, approved: false })
    store.saveArtifact({ threadId, kind: "active_visual_recipe_set", data: active, approved: true })
    store.close()

    store = new AgentPiStore(database)
    const persisted = new Map(store.listArtifacts(threadId).map((artifact) => [artifact.kind, artifact.data]))
    assert.deepEqual(persisted.get("visual_recipe"), recipe)
    assert.deepEqual(persisted.get("visual_recipe_evidence"), evidence)
    assert.deepEqual(persisted.get("active_visual_recipe_set"), active)
    store.close()
    cleanupTestDirectory(directory)
  })
})
