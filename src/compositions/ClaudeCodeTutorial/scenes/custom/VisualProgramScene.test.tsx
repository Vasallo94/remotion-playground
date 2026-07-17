import { createRequire } from "node:module"
import type { ReactNode } from "react"
import { describe, expect, it } from "vitest"
import type { VisualProgramPanel, VisualProgramState } from "@claqueta/scene-contracts"
import { compileVisualProgram } from "../../../../../packages/scene-contracts/src/visualProgramCompiler.js"
import { getTheme } from "../../../../shared/themes"
import { prepareCompiledVisualProgram, VisualPanel } from "./VisualProgramScene"
import { cascadeFixture } from "../../../../../packages/scene-contracts/test/fixtures/cascade"

const { renderToStaticMarkup } = createRequire(`${process.cwd()}/package.json`)("react-dom/server") as {
  renderToStaticMarkup(node: ReactNode): string
}

describe("VisualProgramScene pixels", () => {
  it("clones and freezes mutable JSON-derived renderer props", () => {
    const source = structuredClone(compileVisualProgram(cascadeFixture))
    const originalLabel = source.panels[0]!.nodes[0]!.label
    const prepared = prepareCompiledVisualProgram(source)

    source.panels[0]!.nodes[0]!.label = "Mutated after validation"

    expect(prepared.panels[0]!.nodes[0]!.label).toBe(originalLabel)
    expect(Object.isFrozen(prepared)).toBe(true)
    expect(Object.isFrozen(prepared.panels[0]!.nodes[0])).toBe(true)
  })

  it("renders semantic geometry without implementation state identifiers", () => {
    const panel: VisualProgramPanel = {
      id: "panel",
      label: "Comparison",
      nodes: [
        { id: "left", label: "Left", position: { x: 0.25, y: 0.5 }, initialState: "idle" },
        { id: "right", label: "Right", position: { x: 0.75, y: 0.5 }, initialState: "idle" },
      ],
      edges: [{ id: "flow", from: "left", to: "right", label: "Flow", initialState: "idle" }],
    }
    const state: VisualProgramState = {
      atMs: 1000,
      nodes: [
        { id: "left", state: "blocked" },
        { id: "right", state: "completed" },
      ],
      edges: [{ id: "flow", state: "completed" }],
      pulses: [{ target: "edge", id: "flow", untilMs: 1200 }],
      isolation: [{ target: "node", id: "left", mode: "contained" }],
      boundaries: [{ id: "boundary", panelId: "panel", nodeIds: ["left", "right"], state: "closed" }],
    }
    const markup = renderToStaticMarkup(<VisualPanel panel={panel} state={state} tokens={getTheme("betelgeuse")} />)
    expect(markup).toMatch(/Comparison/)
    expect(markup).toMatch(/Flow/)
    expect(markup).not.toMatch(/Visual program|digest|idle|active|completed|blocked|contained|isolated|uncontained/)
  })

  it("keeps nearby cards separate and renders direction above boundaries", () => {
    const panel: VisualProgramPanel = {
      id: "tight-panel",
      nodes: [
        { id: "source", label: "Source", position: { x: 0.16, y: 0.5 }, initialState: "idle" },
        { id: "bridge", label: "Bridge", position: { x: 0.36, y: 0.5 }, initialState: "idle" },
        { id: "end", label: "End", position: { x: 0.58, y: 0.5 }, initialState: "idle" },
      ],
      edges: [
        { id: "source-bridge", from: "source", to: "bridge", initialState: "idle" },
        { id: "bridge-end", from: "bridge", to: "end", initialState: "idle" },
      ],
    }
    const state: VisualProgramState = {
      atMs: 1000,
      nodes: panel.nodes.map((node) => ({ id: node.id, state: "idle" })),
      edges: panel.edges.map((edge) => ({ id: edge.id, state: "active" })),
      pulses: [],
      isolation: [],
      boundaries: [{ id: "boundary", panelId: panel.id, nodeIds: ["bridge"], state: "closed" }],
    }

    const markup = renderToStaticMarkup(<VisualPanel panel={panel} state={state} tokens={getTheme("betelgeuse")} />)
    expect(markup).toContain("width:16%")
    expect(markup).toContain("<polygon")
    expect(markup).toContain("z-index:2")
    expect(markup).toContain("z-index:1")
  })
})
