import { describe, it, after } from "node:test"
import assert from "node:assert/strict"
import { mkdirSync, rmdirSync, symlinkSync, unlinkSync } from "node:fs"
import { join } from "node:path"
import { assertAllowedWritePath, PROJECT_ROOT, projectRelativePath, slugify } from "../src/paths.js"
import { cleanupTestDirectory, createTestTemporaryDirectory } from "../src/testCleanup.js"

const testDir = join(PROJECT_ROOT, ".generated/agent-pi-path-test")

after(() => {
  try {
    unlinkSync(join(testDir, "outside-link"))
  } catch {
    // The symlink was not created by this test run.
  }
  try {
    rmdirSync(testDir)
  } catch {
    // The test directory is already absent or unexpectedly non-empty.
  }
})

describe("path policy", () => {
  it("allows writes inside configured allowlist roots", () => {
    const resolved = assertAllowedWritePath(".generated/agent-pi-path-test/config.json")
    assert.equal(projectRelativePath(resolved), ".generated/agent-pi-path-test/config.json")
  })

  it("rejects writes outside allowlist", () => {
    assert.throws(() => assertAllowedWritePath("src/not-allowed.ts"), /not allowlisted/)
  })

  it("rejects traversal outside project root", () => {
    assert.throws(() => assertAllowedWritePath("../../outside.txt"), /outside project root|not allowlisted/)
  })

  it("rejects symlink escapes", () => {
    mkdirSync(testDir, { recursive: true })
    const outside = createTestTemporaryDirectory("claqueta-agent-pi-")
    const link = join(testDir, "outside-link")
    symlinkSync(outside, link)
    assert.throws(
      () => assertAllowedWritePath(".generated/agent-pi-path-test/outside-link/file.json"),
      /outside project root/,
    )
    cleanupTestDirectory(outside)
  })

  it("slugifies Spanish titles predictably", () => {
    assert.equal(slugify("El comando /compact: guía rápida"), "el-comando-compact-guia-rapida")
  })
})
