import assert from "node:assert/strict"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, it } from "node:test"
import { createClaquetaResourceLoader, discoverClaquetaResources } from "../src/resourceLoader.js"
import { cleanupTestDirectory, createTestTemporaryDirectory } from "../src/testCleanup.js"

const tmpRoots: string[] = []

afterEach(() => {
  while (tmpRoots.length > 0) {
    const root = tmpRoots.pop()
    if (root) cleanupTestDirectory(root)
  }
})

function makeTempRoot(): string {
  const root = createTestTemporaryDirectory("agent-pi-resource-loader-")
  tmpRoots.push(root)
  return root
}

function touchSkill(root: string, relativeDir: string): void {
  const skillDir = join(root, relativeDir)
  mkdirSync(skillDir, { recursive: true })
  writeFileSync(join(skillDir, "SKILL.md"), `---\nname: ${relativeDir.split("/").at(-1)}\ndescription: test\n---\n`)
}

describe("Claqueta resource loader", () => {
  it("discovers only Claqueta-owned skills and reports missing optional ones", () => {
    const root = makeTempRoot()

    touchSkill(root, "packages/agent/skills/scene-catalog")
    touchSkill(root, "packages/agent/skills/video-best-practices")
    touchSkill(root, "packages/agent/skills/scene-timing-guide")
    touchSkill(root, "packages/agent/skills/gemini-tts")
    touchSkill(root, "packages/agent/skills/sound-engineer")

    const discovery = discoverClaquetaResources(root)

    assert.deepEqual(discovery.skillPaths.map((path) => path.replace(`${root}/`, "")).sort(), [
      "packages/agent/skills/gemini-tts",
      "packages/agent/skills/scene-catalog",
      "packages/agent/skills/scene-timing-guide",
      "packages/agent/skills/sound-engineer",
      "packages/agent/skills/video-best-practices",
    ])
    assert.deepEqual(discovery.promptPaths, [])
    assert.equal(discovery.skillDiagnostics.filter((diagnostic) => diagnostic.type === "warning").length, 2)
    assert.ok(discovery.skillDiagnostics.some((diagnostic) => diagnostic.message.includes("remotion-director")))
    assert.ok(discovery.skillDiagnostics.some((diagnostic) => diagnostic.message.includes("brand-guidelines")))
    assert.equal(
      discovery.skillDiagnostics.some((diagnostic) => diagnostic.type === "error"),
      false,
    )
    assert.equal(discovery.promptDiagnostics.length, 0)
  })

  it("loads curated skills without legacy prompt or global contamination", async () => {
    const loader = createClaquetaResourceLoader()
    await loader.reload()

    const skillResult = loader.getSkills()
    const skillNames = skillResult.skills.map((skill) => skill.name)

    assert.ok(skillNames.includes("scene-catalog"))
    assert.ok(skillNames.includes("video-best-practices"))
    assert.ok(skillNames.includes("scene-timing-guide"))
    assert.ok(skillNames.includes("remotion-director"))
    assert.ok(skillNames.includes("brand-guidelines"))
    assert.ok(skillNames.includes("gemini-tts"))
    assert.ok(skillNames.includes("sound-engineer"))
    assert.equal(skillNames.includes("self-improvement"), false)
    assert.equal(
      skillResult.diagnostics.some((diagnostic) => diagnostic.type === "error"),
      false,
    )

    const promptResult = loader.getPrompts()
    assert.deepEqual(promptResult.prompts, [])
    assert.equal(
      promptResult.diagnostics.some((diagnostic) => diagnostic.type === "error"),
      false,
    )
  })
})
