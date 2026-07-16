import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { validateComposedScene } from "../src/index.js"

const valid = {
  version: 1,
  title: "A reusable visual",
  root: {
    type: "group",
    direction: "grid",
    columns: 2,
    children: [
      { type: "metric", value: "42", label: "Measured result", tone: "accent", entrance: "scale" },
      { type: "card", title: "Meaning", body: "The metric is explained with approved content." },
    ],
  },
}

describe("composed scene contract", () => {
  it("accepts bounded semantic scene trees", () => {
    const result = validateComposedScene(valid)
    assert.equal(result.valid, true)
    assert.equal(result.metrics.nodes, 3)
  })

  it("rejects arbitrary style, URLs, executable fields, and unknown node types", () => {
    for (const root of [
      { type: "text", text: "Unsafe", style: { color: "red" } },
      { type: "image", src: "https://example.com/tracker.png" },
      { type: "text", text: "Unsafe", onClick: "process.exit()" },
    ]) {
      const result = validateComposedScene({ version: 1, root })
      assert.equal(result.valid, false)
    }
  })

  it("rejects excessive depth, nodes, text, and timing ranges", () => {
    let deep: Record<string, unknown> = { type: "text", text: "End" }
    for (let index = 0; index < 7; index += 1) deep = { type: "group", direction: "column", children: [deep] }
    const result = validateComposedScene({
      version: 1,
      root: {
        type: "group",
        direction: "column",
        revealAtMs: 99_000,
        children: [deep, ...Array.from({ length: 12 }, (_, index) => ({ type: "text", text: `Node ${index}` }))],
      },
    })
    assert.equal(result.valid, false)
    assert.match(result.errors.join(" "), /depth|children|revealAtMs/)
  })
})
