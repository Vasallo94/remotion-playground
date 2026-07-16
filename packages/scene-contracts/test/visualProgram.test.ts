/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict"
import { describe, it } from "node:test"
import * as browserContracts from "../src/index.js"
import {
  DEFAULT_VISUAL_PROGRAM_TARGET_ADAPTER,
  VISUAL_PROGRAM_COMPILER_VERSION,
  VISUAL_PROGRAM_RENDERER_VERSION,
  createVisualRecipeTemplate,
  validateCompiledVisualProgram,
  validateVisualProgram,
  validateVisualRecipeBindings,
  validateVisualRecipeTemplate,
  isCompiledVisualProgram,
  type VisualProgram,
} from "../src/index.js"
import {
  compileVisualProgram,
  compileVisualRecipe,
  digestCompiledVisualProgram,
  digestVisualProgramInput,
  evaluateCompiledVisualProgram,
  sha256,
  verifyCompiledVisualProgramDigest,
} from "../src/visualProgramCompiler.js"
import { cascadeFixture } from "./fixtures/cascade.js"

describe("visual program contract", () => {
  it("keeps the browser-safe root free of the compiler entry point", () => {
    assert.equal("compileVisualProgram" in browserContracts, false)
  })

  it("rejects executable fields, unknown keys, unsafe values, and dangling references", () => {
    const invalid = structuredClone(cascadeFixture) as unknown as Record<string, unknown>
    invalid.callback = "() => process.exit(1)"
    const panel = (invalid.panels as Array<Record<string, unknown>>)[0]!
    ;(panel.nodes as Array<Record<string, unknown>>)[0]!.style = { color: "red" }
    const event = (invalid.events as Array<Record<string, unknown>>)[0]!
    ;(event.changes as Array<Record<string, unknown>>)[0]!.id = "missing"
    const validation = validateVisualProgram(invalid)
    assert.equal(validation.valid, false)
    assert.match(validation.errors.join(" "), /not allowed|dangling/)

    const nonFinite = structuredClone(cascadeFixture) as unknown as Record<string, unknown>
    ;((nonFinite.panels as Array<Record<string, unknown>>)[0]!.nodes as Array<Record<string, unknown>>)[0]!.position = {
      x: NaN,
      y: 0.5,
    }
    assert.equal(validateVisualProgram(nonFinite).valid, false)
  })

  it("rejects invalid timing, excess panels, and unsupported recipe fields", () => {
    const invalid = structuredClone(cascadeFixture) as unknown as Record<string, unknown>
    invalid.durationMs = 100
    ;(invalid.events as Array<Record<string, unknown>>)[0]!.atMs = 101
    ;(invalid.events as Array<Record<string, unknown>>)[1]!.atMs = 50
    invalid.panels = [...(invalid.panels as unknown[]), structuredClone((invalid.panels as unknown[])[0])]
    assert.equal(validateVisualProgram(invalid).valid, false)

    const terminalEvent = structuredClone(cascadeFixture) as unknown as {
      durationMs: number
      events: Array<{ atMs: number }>
    }
    terminalEvent.events[0]!.atMs = terminalEvent.durationMs
    const terminalEventValidation = validateVisualProgram(terminalEvent)
    assert.equal(terminalEventValidation.valid, false)
    assert.match(terminalEventValidation.errors.join(" "), /events\[0\].atMs/)
    assert.throws(
      () => compileVisualProgram(terminalEvent as unknown as VisualProgram),
      /Invalid visual program.*events\[0\].atMs/,
    )
    assert.equal(cascadeFixture.assertions.at(-1)?.atMs, cascadeFixture.durationMs)
    assert.equal(validateVisualProgram(cascadeFixture).valid, true)

    const recipe = { version: 1, templateId: "cascade", program: cascadeFixture, bindings: [], extra: true }
    assert.equal(validateVisualRecipeTemplate(recipe).valid, false)

    const impossible = structuredClone(cascadeFixture) as unknown as {
      assertions: Array<{ checks: Array<{ target: string; id: string; state: string }> }>
    }
    impossible.assertions[0]!.checks[0]!.state = "active"
    assert.equal(validateVisualProgram(impossible).valid, false)
  })
})

describe("visual program compiler", () => {
  it("produces canonical props and digest for equivalent input", () => {
    const first = compileVisualProgram(cascadeFixture, { targetAdapter: "claqueta.remotion" })
    const spaced = structuredClone(cascadeFixture) as unknown as { panels: Array<{ nodes: Array<{ label: string }> }> }
    spaced.panels[0]!.nodes[0]!.label = "  Source  "
    const second = compileVisualProgram(spaced as unknown as VisualProgram, { targetAdapter: "claqueta.remotion" })
    assert.deepEqual(first, second)
    assert.match(first.inputDigest, /^[a-f0-9]{64}$/)
    assert.match(first.digest, /^[a-f0-9]{64}$/)

    const renamed = structuredClone(cascadeFixture) as VisualProgram & { events: Array<{ id: string }> }
    renamed.events[0]!.id = "renamed-event"
    const renamedCompiled = compileVisualProgram(renamed)
    assert.notEqual(first.inputDigest, renamedCompiled.inputDigest)
  })

  it("keeps v1 recipe bindings text-only and rejects direct binding injection", () => {
    assert.equal(validateVisualRecipeBindings([{ id: "amount", type: "number", value: 1 }] as any), false)
    assert.throws(
      () => compileVisualProgram(cascadeFixture, { bindings: [{ id: "caption", type: "text", value: "x" }] }),
      /Direct visual programs/,
    )
  })

  it("uses standard SHA-256 and pins the renderer adapter", () => {
    assert.equal(sha256(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
    assert.equal(sha256("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    assert.throws(() => compileVisualProgram(cascadeFixture, { targetAdapter: "other.target" }), /targetAdapter/)
  })

  it("hashes the complete canonical input, including event-only behavior", () => {
    const input = {
      program: cascadeFixture,
      bindings: [],
      targetAdapter: DEFAULT_VISUAL_PROGRAM_TARGET_ADAPTER,
      schemaVersion: 1,
      compilerVersion: VISUAL_PROGRAM_COMPILER_VERSION,
      rendererVersion: VISUAL_PROGRAM_RENDERER_VERSION,
    }
    const changed = structuredClone(input)
    changed.program.events[0]!.changes[0]!.state = "completed"
    assert.notEqual(digestVisualProgramInput(input), digestVisualProgramInput(changed))
  })
})

describe("cascade state evidence", () => {
  const compiled = compileVisualProgram(cascadeFixture)

  it("covers initial and every propagation/isolation boundary", () => {
    assert.deepEqual(
      evaluateCompiledVisualProgram(compiled, 0).nodes.find((node) => node.id === "c-source")?.state,
      "idle",
    )
    assert.deepEqual(
      evaluateCompiledVisualProgram(compiled, 1000).nodes.find((node) => node.id === "c-source")?.state,
      "active",
    )
    assert.deepEqual(
      evaluateCompiledVisualProgram(compiled, 2000).nodes.find((node) => node.id === "u-bridge")?.state,
      "active",
    )
    assert.deepEqual(
      evaluateCompiledVisualProgram(compiled, 3000).nodes.find((node) => node.id === "c-end")?.state,
      "blocked",
    )
    assert.deepEqual(
      evaluateCompiledVisualProgram(compiled, 3000).nodes.find((node) => node.id === "u-end")?.state,
      "completed",
    )
    assert.deepEqual(
      evaluateCompiledVisualProgram(compiled, 4000).nodes.find((node) => node.id === "u-bridge")?.state,
      "completed",
    )
    assert.deepEqual(
      evaluateCompiledVisualProgram(compiled, 5000).nodes.find((node) => node.id === "u-end")?.state,
      "completed",
    )
  })

  it("keeps pulses and boundaries precomputed at event boundaries", () => {
    const state = evaluateCompiledVisualProgram(compiled, 3000)
    assert.equal(state.pulses.length, 0)
    assert.deepEqual(state.isolation, [
      { target: "edge", id: "c-bridge-end", mode: "contained" },
      { target: "edge", id: "u-bridge-end", mode: "uncontained" },
    ])
    assert.equal(state.boundaries.length, 2)
  })
})

describe("visual program safety boundaries", () => {
  it("rejects duplicate IDs across panels and pulse overruns", () => {
    const duplicate = structuredClone(cascadeFixture) as unknown as { panels: Array<{ nodes: Array<{ id: string }> }> }
    duplicate.panels[1]!.nodes[0]!.id = duplicate.panels[0]!.nodes[0]!.id
    assert.equal(validateVisualProgram(duplicate).valid, false)
    const overrun = structuredClone(cascadeFixture) as unknown as {
      events: Array<{ atMs: number; pulses: Array<{ durationMs: number }> }>
    }
    overrun.events[0]!.pulses[0]!.durationMs = 5000
    assert.match(validateVisualProgram(overrun).errors.join(" "), /ends after program duration/)
  })

  it("rejects aggregate operation budgets and validates every evidence boundary", () => {
    const oversized = structuredClone(cascadeFixture) as unknown as { events: Array<{ changes: unknown[] }> }
    oversized.events[0]!.changes = Array.from({ length: 97 }, () => ({
      target: "node",
      id: "c-source",
      state: "active",
    }))
    assert.match(validateVisualProgram(oversized).errors.join(" "), /changes exceeds/)
    const missing = structuredClone(cascadeFixture) as unknown as { assertions: Array<{ atMs: number }> }
    missing.assertions = missing.assertions.filter((assertion) => assertion.atMs !== 2000)
    assert.match(validateVisualProgram(missing).errors.join(" "), /cover boundary 2000ms/)
  })

  it("accepts the maximum event timeline and validates compiled boundaries exactly", () => {
    const program: VisualProgram = {
      version: 1,
      durationMs: 480,
      panels: [
        {
          id: "panel",
          nodes: [{ id: "node", label: "Node", position: { x: 0.5, y: 0.5 }, initialState: "idle" }],
          edges: [],
        },
      ],
      events: Array.from({ length: 48 }, (_, index) => ({
        id: `event-${index + 1}`,
        atMs: index + 1,
        changes: [{ target: "node" as const, id: "node", state: "active" as const }],
      })),
      assertions: [
        { id: "initial", atMs: 0, checks: [{ target: "node", id: "node", state: "idle" }] },
        ...Array.from({ length: 48 }, (_, index) => ({
          id: `assertion-${index + 1}`,
          atMs: index + 1,
          checks: [{ target: "node" as const, id: "node", state: "active" as const }],
        })),
        { id: "terminal", atMs: 480, checks: [{ target: "node", id: "node", state: "active" }] },
      ],
    }
    const compiled = compileVisualProgram(program)
    assert.equal(compiled.timeline.length, 50)
    assert.equal(isCompiledVisualProgram(compiled), true)

    const boundaryProgram: VisualProgram = {
      version: 1,
      durationMs: 100,
      panels: [
        {
          id: "panel",
          nodes: [{ id: "node", label: "Node", position: { x: 0.5, y: 0.5 }, initialState: "idle" }],
          edges: [],
        },
      ],
      events: [
        {
          id: "boundaries",
          atMs: 50,
          changes: [{ target: "node", id: "node", state: "active" }],
          boundaries: Array.from({ length: 8 }, (_, index) => ({
            id: `boundary-${index}`,
            panelId: "panel",
            nodeIds: ["node"],
            state: index % 2 === 0 ? ("open" as const) : ("closed" as const),
          })),
        },
      ],
      assertions: [
        { id: "initial", atMs: 0, checks: [{ target: "node", id: "node", state: "idle" }] },
        { id: "boundary", atMs: 50, checks: [{ target: "node", id: "node", state: "active" }] },
        { id: "terminal", atMs: 100, checks: [{ target: "node", id: "node", state: "active" }] },
      ],
    }
    assert.equal(isCompiledVisualProgram(compileVisualProgram(boundaryProgram)), true)

    const malformed = structuredClone(compiled) as any
    malformed.timeline[1]!.pulses.push({ target: "node", id: "node", untilMs: 10 })
    malformed.timeline[1]!.pulses.push({ target: "node", id: "node", untilMs: 10 })
    assert.equal(isCompiledVisualProgram(malformed), false)
  })

  it("accepts aggregate source boundaries and expands them into persistent compiled states", () => {
    const eventCount = 16
    const program: VisualProgram = {
      version: 1,
      durationMs: 1000,
      panels: [
        {
          id: "panel",
          nodes: [{ id: "node", label: "Node", position: { x: 0.5, y: 0.5 }, initialState: "idle" }],
          edges: [],
        },
      ],
      events: Array.from({ length: eventCount }, (_, eventIndex) => ({
        id: `event-${eventIndex + 1}`,
        atMs: (eventIndex + 1) * 10,
        changes: [{ target: "node" as const, id: "node", state: "active" as const }],
        boundaries: Array.from({ length: 8 }, (_, boundaryIndex) => ({
          id: `boundary-${eventIndex + 1}-${boundaryIndex + 1}`,
          panelId: "panel",
          nodeIds: ["node"],
          state: boundaryIndex % 2 === 0 ? ("open" as const) : ("closed" as const),
          label: "Boundary label",
        })),
      })),
      assertions: [
        { id: "initial", atMs: 0, checks: [{ target: "node", id: "node", state: "idle" }] },
        ...Array.from({ length: eventCount }, (_, eventIndex) => ({
          id: `assertion-${eventIndex + 1}`,
          atMs: (eventIndex + 1) * 10,
          checks: [{ target: "node" as const, id: "node", state: "active" as const }],
        })),
        { id: "terminal", atMs: 1000, checks: [{ target: "node", id: "node", state: "active" }] },
      ],
    }
    assert.equal(validateVisualProgram(program).valid, true)
    const compiled = compileVisualProgram(program)
    assert.equal(compiled.timeline[1]!.boundaries.length, 8)
    assert.equal(compiled.timeline[2]!.boundaries.length, 16)
    assert.equal(compiled.timeline.at(-1)!.boundaries.length, 128)
    assert.equal(validateCompiledVisualProgram(compiled).metrics.words, 257)
    assert.equal(isCompiledVisualProgram(compiled), true)
  })

  it("requires empty initial operations and exact pulse/isolation persistence", () => {
    const compiled = compileVisualProgram(cascadeFixture)
    const recompute = (mutate: (value: any) => void) => {
      const tampered = structuredClone(compiled) as any
      mutate(tampered)
      delete tampered.digest
      tampered.digest = digestCompiledVisualProgram(tampered)
      return tampered
    }

    const initialOperations = recompute((value) => {
      value.timeline[0].pulses.push({ target: "node", id: "c-source", untilMs: 100 })
      value.timeline[0].isolation.push({ target: "edge", id: "c-bridge-end", mode: "contained" })
      value.timeline[0].boundaries.push({
        id: "initial-boundary",
        panelId: "contained",
        nodeIds: ["c-bridge", "c-end"],
        state: "closed",
      })
    })
    assert.equal(isCompiledVisualProgram(initialOperations), false)
    assert.equal(verifyCompiledVisualProgramDigest(initialOperations), false)

    const droppedPulse = recompute((value) => {
      value.timeline[1].pulses[0].untilMs = 2500
      value.timeline[2].pulses = []
    })
    assert.equal(isCompiledVisualProgram(droppedPulse), false)
    assert.equal(verifyCompiledVisualProgramDigest(droppedPulse), false)

    const droppedIsolation = recompute((value) => {
      value.timeline[4].isolation = []
    })
    assert.equal(isCompiledVisualProgram(droppedIsolation), false)
    assert.equal(verifyCompiledVisualProgramDigest(droppedIsolation), false)
  })

  it("rejects terminal-only compiled transitions but allows pulse expiry", () => {
    const withTerminalPulse = structuredClone(cascadeFixture) as VisualProgram & {
      events: Array<{ pulses?: Array<{ target: "node"; id: string; durationMs: number }> }>
    }
    withTerminalPulse.events[3]!.pulses = [{ target: "node", id: "c-source", durationMs: 1000 }]
    const pulseCompiled = compileVisualProgram(withTerminalPulse)
    assert.equal(isCompiledVisualProgram(pulseCompiled), true)
    assert.deepEqual(pulseCompiled.timeline.at(-1)!.pulses, [])

    const terminalTransition = structuredClone(pulseCompiled) as any
    terminalTransition.timeline.at(-1).nodes.find((node: any) => node.id === "c-source").state = "active"
    const validation = validateCompiledVisualProgram(terminalTransition)
    assert.equal(validation.valid, false)
    assert.match(validation.errors.join(" "), /terminal state may only expire pulses/)
  })

  it("rejects malformed compiled boundaries, assertions, and terminal coverage", () => {
    const compiled = compileVisualProgram(cascadeFixture)
    const missingTerminal = structuredClone(compiled) as any
    missingTerminal.timeline.pop()
    assert.match(validateCompiledVisualProgram(missingTerminal).errors.join(" "), /terminal|duration/)
    const falseAssertion = structuredClone(compiled) as any
    falseAssertion.assertions[1]!.checks[0]!.state = "blocked"
    assert.equal(isCompiledVisualProgram(falseAssertion), false)
    const invalidBoundary = structuredClone(compiled) as any
    const boundary = invalidBoundary.timeline.find((state: any) => state.boundaries.length > 0).boundaries[0]
    boundary.state = "invalid"
    assert.equal(isCompiledVisualProgram(invalidBoundary), false)
    const crossPanel = structuredClone(compiled) as any
    const crossBoundary = crossPanel.timeline.find((state: any) => state.boundaries.length > 0).boundaries[0]
    crossBoundary.nodeIds = ["u-end"]
    assert.equal(isCompiledVisualProgram(crossPanel), false)
    const duplicateIsolation = structuredClone(compiled) as any
    const isolationState = duplicateIsolation.timeline.find((state: any) => state.isolation.length > 0)
    isolationState.isolation.push({ ...isolationState.isolation[0] })
    assert.equal(isCompiledVisualProgram(duplicateIsolation), false)
  })

  it("assigns deterministic compiler-owned positions when layout is omitted", () => {
    const withoutPositions = structuredClone(cascadeFixture) as VisualProgram
    for (const panel of withoutPositions.panels) for (const node of panel.nodes) delete node.position
    const reversed = structuredClone(withoutPositions)
    for (const panel of reversed.panels) panel.nodes = [...panel.nodes].reverse()
    const first = compileVisualProgram(withoutPositions)
    const second = compileVisualProgram(reversed)
    assert.deepEqual(first, second)
    assert.strictEqual(validateCompiledVisualProgram(first), validateCompiledVisualProgram(first))
    const mutable = structuredClone(first) as typeof first
    assert.equal(validateCompiledVisualProgram(mutable).valid, true)
    mutable.inputDigest = "not-a-digest"
    assert.equal(validateCompiledVisualProgram(mutable).valid, false)
    assert.equal(
      first.panels.every((panel) => panel.nodes.every((node) => node.position !== undefined)),
      true,
    )
  })

  it("substitutes an exact immutable recipe binding set", () => {
    const program = structuredClone(cascadeFixture) as VisualProgram & { panels: Array<{ label?: string }> }
    program.panels[0]!.label = "{{caption}}"
    const boundTemplate = createVisualRecipeTemplate({
      version: 1,
      templateId: "caption-recipe",
      program,
      bindings: [{ id: "caption", type: "text", value: "Template caption" }],
    })
    const compiled = compileVisualRecipe(boundTemplate, [{ id: "caption", type: "text", value: "Bound caption" }])
    assert.equal(compiled.panels[0]!.label, "Bound caption")
    assert.throws(() => compileVisualRecipe(boundTemplate, []), /exactly match/)
    assert.equal(Object.isFrozen(compiled), true)
    assert.equal(Object.isFrozen(compiled.panels), true)
    assert.equal(isCompiledVisualProgram(compiled), true)
    const tampered = structuredClone(compiled) as typeof compiled & { digest: string }
    tampered.panels[0]!.label = "tampered"
    assert.equal(isCompiledVisualProgram(tampered), true)
    assert.equal(verifyCompiledVisualProgramDigest(tampered), false)
    const unsupported = { ...compiled, rendererVersion: "visual-program-renderer-2" }
    assert.equal(isCompiledVisualProgram(unsupported), false)
    assert.equal(verifyCompiledVisualProgramDigest(unsupported), false)
    const incompleteTimeline = { ...compiled, timeline: [{ ...compiled.timeline[0], nodes: [] }] }
    assert.equal(isCompiledVisualProgram(incompleteTimeline), false)
  })
})
