import assert from "node:assert/strict"
import { existsSync, symlinkSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"
import { PROJECT_ROOT } from "../src/paths.js"
import { cleanupTestDirectory, createTestTemporaryDirectory } from "../src/testCleanup.js"

describe("test cleanup guard", () => {
  it("accepts a freshly created registered OS temporary directory", () => {
    const directory = createTestTemporaryDirectory("agent-pi-cleanup-")
    cleanupTestDirectory(directory)
    assert.equal(existsSync(directory), false)
  })

  it("rejects path traversal from a registered temporary directory", () => {
    const directory = createTestTemporaryDirectory("agent-pi-cleanup-")
    assert.throws(() => cleanupTestDirectory(join(directory, "..")), /Refusing recursive test cleanup/)
    cleanupTestDirectory(directory)
  })

  it("rejects the project root", () => {
    assert.throws(() => cleanupTestDirectory(PROJECT_ROOT), /Refusing recursive test cleanup/)
  })

  it("rejects a symbolic link even when it is inside a registered temporary directory", () => {
    const directory = createTestTemporaryDirectory("agent-pi-cleanup-")
    const link = join(directory, "project-root-link")
    symlinkSync(PROJECT_ROOT, link)
    assert.throws(() => cleanupTestDirectory(link), /symbolic link/)
    cleanupTestDirectory(directory)
  })

  it("rejects an unregistered temporary-directory prefix", () => {
    assert.throws(() => createTestTemporaryDirectory("unexpected-test-prefix-" as never), /prefix is not registered/)
  })
})
