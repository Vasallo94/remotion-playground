import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, it } from "node:test"
import { createClaquetaResourceLoader, discoverClaquetaResources } from "../src/resourceLoader.js"

const tmpRoots: string[] = []

afterEach(() => {
  while (tmpRoots.length > 0) {
    const root = tmpRoots.pop()
    if (root) rmSync(root, { recursive: true, force: true })
  }
})

function makeTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "agent-pi-resource-loader-"))
  tmpRoots.push(root)
  return root
}

function touchSkill(root: string, relativeDir: string): void {
  const skillDir = join(root, relativeDir)
  mkdirSync(skillDir, { recursive: true })
  writeFileSync(join(skillDir, "SKILL.md"), `---\nname: ${relativeDir.split("/").at(-1)}\ndescription: test\n---\n`)
}

function touchPrompt(root: string, relativeFile: string): void {
  const file = join(root, relativeFile)
  mkdirSync(join(file, ".."), { recursive: true })
  writeFileSync(file, "# prompt\n")
}

describe("Claqueta resource loader", () => {
  it("discovers only Claqueta-owned skills and reports missing optional ones", () => {
    const root = makeTempRoot()

    touchSkill(root, "packages/agent/skills/scene-catalog")
    touchSkill(root, "packages/agent/skills/video-best-practices")
    touchSkill(root, "packages/agent/skills/scene-timing-guide")
    touchSkill(root, "packages/agent/skills/gemini-tts")
    touchSkill(root, "packages/agent/skills/sound-engineer")
    touchPrompt(root, "packages/agent/prompts/copywriter.md")

    const discovery = discoverClaquetaResources(root)

    assert.deepEqual(discovery.skillPaths.map((path) => path.replace(`${root}/`, "")).sort(), [
      "packages/agent/skills/gemini-tts",
      "packages/agent/skills/scene-catalog",
      "packages/agent/skills/scene-timing-guide",
      "packages/agent/skills/sound-engineer",
      "packages/agent/skills/video-best-practices",
    ])
    assert.deepEqual(
      discovery.promptPaths.map((path) => path.replace(`${root}/`, "")),
      ["packages/agent/prompts"],
    )
    assert.equal(discovery.skillDiagnostics.filter((diagnostic) => diagnostic.type === "warning").length, 2)
    assert.ok(discovery.skillDiagnostics.some((diagnostic) => diagnostic.message.includes("remotion-director")))
    assert.ok(discovery.skillDiagnostics.some((diagnostic) => diagnostic.message.includes("brand-guidelines")))
    assert.equal(
      discovery.skillDiagnostics.some((diagnostic) => diagnostic.type === "error"),
      false,
    )
    assert.equal(discovery.promptDiagnostics.length, 0)
  })

  it("loads the curated Claqueta skill and prompt set without global contamination", async () => {
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
    const promptNames = promptResult.prompts.map((prompt) => prompt.name)
    assert.ok(promptNames.includes("copywriter"))
    assert.ok(promptNames.includes("director"))
    assert.ok(promptNames.includes("sound_engineer"))
    assert.equal(
      promptResult.diagnostics.some((diagnostic) => diagnostic.type === "error"),
      false,
    )
  })
})
