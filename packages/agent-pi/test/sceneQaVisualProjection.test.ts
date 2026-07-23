import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { sceneQaVisualProjection } from "../src/session.js"

describe("sceneQaVisualProjection", () => {
  it("ignores approved audio fields but preserves every visual field", () => {
    const draft = {
      id: "demo",
      theme: "linea-directa",
      scenes: [{ type: "callout", text: "Visible", voiceover: { text: "Draft" } }],
    }
    const final = {
      ...draft,
      voiceover: { enabled: true, scenes: { 0: "Final" } },
      soundDesign: { enabled: false },
      scenes: [{ ...draft.scenes[0], voiceover: { text: "Final", voice: "Orus" } }],
    }
    assert.deepEqual(sceneQaVisualProjection(final), sceneQaVisualProjection(draft))
    assert.notDeepEqual(sceneQaVisualProjection({ ...final, theme: "betelgeuse" }), sceneQaVisualProjection(draft))
  })
})
