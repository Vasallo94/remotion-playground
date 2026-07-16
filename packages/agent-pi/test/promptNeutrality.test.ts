import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"
import { PROJECT_ROOT } from "../src/paths.js"
import { CLAQUETA_PI_SYSTEM_PROMPT } from "../src/prompt.js"

const agentPromptDir = join(PROJECT_ROOT, "packages", "agent-pi", "resources", "agents")
const specialistPrompts = readdirSync(agentPromptDir)
  .filter((name) => name.endsWith(".md"))
  .map((name) => ({ name, text: readFileSync(join(agentPromptDir, name), "utf-8") }))
const forbiddenRoleDefaults = [
  "ClaudeCodeTutorial",
  "ProductShort",
  "VerticalShort",
  "betelgeuse",
  "1280x720",
  "1080x1920",
  "es-ES",
  "technology means",
  "science means",
  "product means",
  "social means",
  "Spanish",
  "Instagram",
  "YouTube",
  "TikTok",
  "target.video.",
  "content/tutorials",
  "content/shorts",
  "video/mp4",
]

describe("topic-neutral agent prompts", () => {
  it("keeps composition, format, theme, dimensions, and topic recipes out of every agent prompt", () => {
    for (const prompt of [{ name: "main", text: CLAQUETA_PI_SYSTEM_PROMPT }, ...specialistPrompts]) {
      for (const forbidden of forbiddenRoleDefaults) {
        assert.equal(prompt.text.includes(forbidden), false, `${prompt.name} hardcodes '${forbidden}'`)
      }
    }
  })
})
