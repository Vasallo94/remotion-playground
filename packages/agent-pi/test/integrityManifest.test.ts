import assert from "node:assert/strict"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"
import {
  collectIntegrityHashes,
  compareIntegrityManifests,
  formatManifestComparison,
  hasManifestChanges,
  type IntegrityManifest,
} from "../src/integrityManifest.js"
import { cleanupTestDirectory, createTestTemporaryDirectory } from "../src/testCleanup.js"

function manifest(files: Record<string, string>, gitStatus: string[] = []): IntegrityManifest {
  return { version: 1, createdAt: "2026-07-12T00:00:00.000Z", root: "/workspace", gitStatus, files }
}

describe("workspace integrity manifest", () => {
  it("hashes source, specification, and configuration files while excluding dependencies and generated outputs", () => {
    const root = createTestTemporaryDirectory("agent-pi-cleanup-")
    mkdirSync(join(root, "src"), { recursive: true })
    mkdirSync(join(root, "_project_specs/features"), { recursive: true })
    mkdirSync(join(root, "node_modules/package"), { recursive: true })
    mkdirSync(join(root, ".generated"), { recursive: true })
    mkdirSync(join(root, "content/tutorials/example"), { recursive: true })
    writeFileSync(join(root, "src/main.ts"), "export const answer = 42\n")
    writeFileSync(join(root, "_project_specs/features/phase-0.md"), "# Phase 0\n")
    writeFileSync(join(root, "package.json"), "{}\n")
    writeFileSync(join(root, "README.md"), "# Workspace\n")
    writeFileSync(join(root, "eslint.config.mjs"), "export default []\n")
    writeFileSync(join(root, "node_modules/package/index.js"), "dependency\n")
    writeFileSync(join(root, ".generated/result.json"), "generated\n")
    writeFileSync(join(root, "content/tutorials/example/config.json"), "{}\n")
    writeFileSync(join(root, "content/tutorials/example/output.mp4"), "generated video\n")

    const hashes = collectIntegrityHashes(root)

    assert.deepEqual(Object.keys(hashes), [
      "README.md",
      "_project_specs/features/phase-0.md",
      "content/tutorials/example/config.json",
      "eslint.config.mjs",
      "package.json",
      "src/main.ts",
    ])
    cleanupTestDirectory(root)
  })

  it("reports hash and Git-status drift with actionable output", () => {
    const comparison = compareIntegrityManifests(
      manifest({ "src/unchanged.ts": "same", "src/removed.ts": "before" }, ["## main"]),
      manifest({ "src/added.ts": "new", "src/unchanged.ts": "after" }, ["## main", " M src/unchanged.ts"]),
    )

    assert.deepEqual(comparison.added, ["src/added.ts"])
    assert.deepEqual(comparison.changed, ["src/unchanged.ts"])
    assert.deepEqual(comparison.removed, ["src/removed.ts"])
    assert.equal(comparison.gitStatusChanged, true)
    assert.equal(hasManifestChanges(comparison), true)
    assert.match(formatManifestComparison(comparison, "before.json"), /do not use destructive Git recovery commands/)
  })
})
