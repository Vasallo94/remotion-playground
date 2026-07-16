import type { VisualProgram } from "../../src/index.js"

/** Topic-neutral evidence fixture: containment stops one path while the uncontained path completes. */
export const cascadeFixture: VisualProgram = {
  version: 1,
  durationMs: 5000,
  panels: [
    {
      id: "contained",
      label: "Contained path",
      nodes: [
        { id: "c-source", label: "Source", position: { x: 0.16, y: 0.5 }, initialState: "idle" },
        { id: "c-bridge", label: "Bridge", position: { x: 0.5, y: 0.5 }, initialState: "idle" },
        { id: "c-end", label: "End", position: { x: 0.84, y: 0.5 }, initialState: "idle" },
      ],
      edges: [
        { id: "c-source-bridge", from: "c-source", to: "c-bridge", initialState: "idle" },
        { id: "c-bridge-end", from: "c-bridge", to: "c-end", initialState: "idle" },
      ],
    },
    {
      id: "uncontained",
      label: "Uncontained path",
      nodes: [
        { id: "u-source", label: "Source", position: { x: 0.16, y: 0.5 }, initialState: "idle" },
        { id: "u-bridge", label: "Bridge", position: { x: 0.5, y: 0.5 }, initialState: "idle" },
        { id: "u-end", label: "End", position: { x: 0.84, y: 0.5 }, initialState: "idle" },
      ],
      edges: [
        { id: "u-source-bridge", from: "u-source", to: "u-bridge", initialState: "idle" },
        { id: "u-bridge-end", from: "u-bridge", to: "u-end", initialState: "idle" },
      ],
    },
  ],
  events: [
    {
      id: "propagate-source",
      atMs: 1000,
      changes: [
        { target: "node", id: "c-source", state: "active" },
        { target: "node", id: "u-source", state: "active" },
        { target: "edge", id: "c-source-bridge", state: "active" },
        { target: "edge", id: "u-source-bridge", state: "active" },
      ],
      pulses: [
        { target: "node", id: "c-source", durationMs: 350 },
        { target: "node", id: "u-source", durationMs: 350 },
      ],
    },
    {
      id: "propagate-bridge",
      atMs: 2000,
      changes: [
        { target: "node", id: "c-bridge", state: "active" },
        { target: "node", id: "u-bridge", state: "active" },
        { target: "edge", id: "c-source-bridge", state: "completed" },
        { target: "edge", id: "u-source-bridge", state: "completed" },
        { target: "edge", id: "c-bridge-end", state: "active" },
        { target: "edge", id: "u-bridge-end", state: "active" },
      ],
      pulses: [
        { target: "node", id: "c-bridge", durationMs: 350 },
        { target: "node", id: "u-bridge", durationMs: 350 },
      ],
    },
    {
      id: "compare-containment",
      atMs: 3000,
      changes: [
        { target: "node", id: "c-end", state: "blocked" },
        { target: "node", id: "u-end", state: "completed" },
        { target: "edge", id: "c-bridge-end", state: "isolated" },
        { target: "edge", id: "u-bridge-end", state: "completed" },
      ],
      isolation: [
        { target: "edge", id: "c-bridge-end", mode: "contained" },
        { target: "edge", id: "u-bridge-end", mode: "uncontained" },
      ],
      boundaries: [
        {
          id: "contained-boundary",
          panelId: "contained",
          nodeIds: ["c-bridge", "c-end"],
          state: "closed",
          label: "Contained",
        },
        {
          id: "uncontained-boundary",
          panelId: "uncontained",
          nodeIds: ["u-bridge", "u-end"],
          state: "open",
          label: "Uncontained",
        },
      ],
    },
    {
      id: "stopped-propagation",
      atMs: 4000,
      changes: [
        { target: "node", id: "c-source", state: "completed" },
        { target: "node", id: "c-bridge", state: "blocked" },
        { target: "node", id: "u-source", state: "completed" },
        { target: "node", id: "u-bridge", state: "completed" },
      ],
    },
  ],
  assertions: [
    {
      id: "initial",
      atMs: 0,
      checks: [
        { target: "node", id: "c-source", state: "idle" },
        { target: "node", id: "u-end", state: "idle" },
        { target: "edge", id: "c-bridge-end", state: "idle" },
      ],
    },
    {
      id: "source-propagation",
      atMs: 1000,
      checks: [
        { target: "node", id: "c-source", state: "active" },
        { target: "node", id: "u-source", state: "active" },
        { target: "edge", id: "c-source-bridge", state: "active" },
      ],
    },
    {
      id: "bridge-propagation",
      atMs: 2000,
      checks: [
        { target: "node", id: "c-bridge", state: "active" },
        { target: "node", id: "u-bridge", state: "active" },
        { target: "edge", id: "u-bridge-end", state: "active" },
      ],
    },
    {
      id: "contained-versus-uncontained",
      atMs: 3000,
      checks: [
        { target: "node", id: "c-end", state: "blocked" },
        { target: "node", id: "u-end", state: "completed" },
        { target: "edge", id: "c-bridge-end", state: "isolated" },
      ],
      isolation: [
        { target: "edge", id: "c-bridge-end", mode: "contained" },
        { target: "edge", id: "u-bridge-end", mode: "uncontained" },
      ],
    },
    {
      id: "stopped",
      atMs: 4000,
      checks: [
        { target: "node", id: "c-bridge", state: "blocked" },
        { target: "node", id: "u-bridge", state: "completed" },
      ],
    },
    {
      id: "terminal",
      atMs: 5000,
      checks: [
        { target: "node", id: "c-end", state: "blocked" },
        { target: "node", id: "u-end", state: "completed" },
      ],
    },
  ],
}
