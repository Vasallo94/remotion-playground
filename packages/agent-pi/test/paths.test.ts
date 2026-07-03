import { describe, it, after } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { assertAllowedWritePath, PROJECT_ROOT, projectRelativePath, slugify } from "../src/paths.js"

const testDir = join(PROJECT_ROOT, ".generated/agent-pi-path-test")

after(() => {
  rmSync(testDir, { recursive: true, force: true })
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
    const outside = mkdtempSync(join(tmpdir(), "claqueta-agent-pi-"))
    const link = join(testDir, "outside-link")
    symlinkSync(outside, link)
    assert.throws(
      () => assertAllowedWritePath(".generated/agent-pi-path-test/outside-link/file.json"),
      /outside project root/,
    )
    rmSync(outside, { recursive: true, force: true })
  })

  it("slugifies Spanish titles predictably", () => {
    assert.equal(slugify("El comando /compact: guía rápida"), "el-comando-compact-guia-rapida")
  })
})
