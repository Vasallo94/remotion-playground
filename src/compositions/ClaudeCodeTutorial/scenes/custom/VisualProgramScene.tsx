import type { CSSProperties } from "react"
import { useMemo } from "react"
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion"
import type { CompiledVisualProgram, VisualProgramPanel, VisualProgramState } from "@claqueta/scene-contracts"
import { cloneAndFreezeVisualProgram, isCompiledVisualProgram } from "@claqueta/scene-contracts"
import { useThemeTokens } from "../../../../shared/themes"

export interface VisualProgramSceneProps {
  compiled: CompiledVisualProgram
}

function stateColor(state: string, tokens: ReturnType<typeof useThemeTokens>): string {
  switch (state) {
    case "active":
      return tokens.primary
    case "completed":
      return tokens.secondary
    case "blocked":
      return tokens.terminal.dots[0]
    case "contained":
      return tokens.terminal.dots[1]
    case "isolated":
      return tokens.terminal.dots[2]
    default:
      return tokens.foregroundMid
  }
}

function stateAtFrame(compiled: CompiledVisualProgram, frame: number, fps: number): VisualProgramState {
  const atMs = (frame / fps) * 1000
  let selected = compiled.timeline[0]
  for (const state of compiled.timeline) {
    if (state.atMs > atMs) break
    selected = state
  }
  if (selected) return { ...selected, atMs, pulses: selected.pulses.filter((pulse) => pulse.untilMs > atMs) }
  return { atMs, nodes: [], edges: [], pulses: [], isolation: [], boundaries: [] }
}

function nodeState(state: VisualProgramState, id: string): string {
  return state.nodes.find((entry) => entry.id === id)?.state ?? "idle"
}
function edgeState(state: VisualProgramState, id: string): string {
  return state.edges.find((entry) => entry.id === id)?.state ?? "idle"
}
function stateDash(state: string): string | undefined {
  switch (state) {
    case "completed":
      return "0.018 0.008"
    case "blocked":
      return "0.004 0.016"
    case "isolated":
      return "0.022 0.006"
    case "contained":
      return "0.012 0.012"
    default:
      return undefined
  }
}
function isolationMode(state: VisualProgramState, target: "node" | "edge", id: string): string | undefined {
  return state.isolation.find((entry) => entry.target === target && entry.id === id)?.mode
}

const panelStyle: CSSProperties = { position: "relative", minWidth: 0, minHeight: 0, overflow: "hidden" }

export const VisualPanel: React.FC<{
  panel: VisualProgramPanel
  state: VisualProgramState
  tokens: ReturnType<typeof useThemeTokens>
}> = ({ panel, state, tokens }) => {
  const nodeById = new Map(panel.nodes.map((node) => [node.id, node]))
  const boundaries = state.boundaries.filter((entry) => entry.panelId === panel.id)
  return (
    <div
      style={{
        ...panelStyle,
        border: `1px solid ${tokens.card.border}`,
        borderRadius: tokens.radius,
        background: tokens.card.bg,
      }}
    >
      {panel.label && (
        <div
          style={{
            position: "absolute",
            top: 18,
            left: 22,
            zIndex: 3,
            color: tokens.foregroundMid,
            fontSize: 18,
            fontWeight: 700,
          }}
        >
          {panel.label}
        </div>
      )}
      <svg
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}
      >
        {panel.edges.map((edge) => {
          const from = nodeById.get(edge.from)?.position
          const to = nodeById.get(edge.to)?.position
          if (!from || !to) return null
          const mode = isolationMode(state, "edge", edge.id)
          const pulse = state.pulses.some((entry) => entry.target === "edge" && entry.id === edge.id)
          const color = stateColor(edgeState(state, edge.id), tokens)
          const opacity = mode === "isolated" ? 0.3 : mode === "contained" ? 0.7 : 1
          const dash =
            mode === "uncontained"
              ? "0.018 0.012"
              : mode === "isolated"
                ? "0.008 0.014"
                : stateDash(edgeState(state, edge.id))
          const midX = (from.x + to.x) / 2
          const midY = (from.y + to.y) / 2
          return (
            <g key={edge.id} opacity={opacity}>
              <line
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={color}
                strokeWidth={pulse ? "0.018" : "0.008"}
                strokeDasharray={dash}
              />
              {pulse && (
                <line
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={tokens.primary}
                  strokeWidth="0.028"
                  opacity="0.35"
                />
              )}
              <text x={midX} y={midY - 0.025} textAnchor="middle" fill={color} fontSize="0.028" fontWeight="700">
                {edge.label}
              </text>
            </g>
          )
        })}
      </svg>
      {panel.nodes.map((node) => {
        const currentState = nodeState(state, node.id)
        const mode = isolationMode(state, "node", node.id)
        const pulse = state.pulses.some((entry) => entry.target === "node" && entry.id === node.id)
        const color = stateColor(currentState, tokens)
        const opacity = mode === "isolated" ? 0.35 : mode === "contained" ? 0.78 : 1
        const borderStyle =
          mode === "uncontained"
            ? "dashed"
            : mode === "isolated"
              ? "dotted"
              : currentState === "blocked"
                ? "double"
                : currentState === "isolated"
                  ? "dashed"
                  : currentState === "contained"
                    ? "dotted"
                    : "solid"
        return (
          <div
            key={node.id}
            style={{
              position: "absolute",
              left: `${(node.position ?? { x: 0.5, y: 0.5 }).x * 100}%`,
              top: `${(node.position ?? { x: 0.5, y: 0.5 }).y * 100}%`,
              transform: "translate(-50%, -50%)",
              width: "25%",
              minHeight: 86,
              padding: "14px 10px",
              boxSizing: "border-box",
              border: `${pulse ? 4 : 2}px ${borderStyle} ${color}`,
              borderRadius: tokens.radius,
              background: tokens.background,
              color: tokens.foreground,
              opacity,
              textAlign: "center",
              fontFamily: tokens.fontFamily,
              boxShadow:
                mode === "contained"
                  ? `0 0 0 5px ${tokens.terminal.dots[1]}80`
                  : mode === "uncontained"
                    ? `0 0 0 3px ${tokens.primary}55`
                    : undefined,
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.2 }}>{node.label}</div>
            {node.text && <div style={{ color: tokens.foregroundMid, fontSize: 14, marginTop: 7 }}>{node.text}</div>}
          </div>
        )
      })}
      {boundaries.map((boundary) => {
        const positions = boundary.nodeIds
          .map((id) => nodeById.get(id)?.position)
          .filter((position): position is { x: number; y: number } => Boolean(position))
        if (positions.length === 0) return null
        const left = Math.max(0.01, Math.min(...positions.map((position) => position.x)) - 0.16)
        const right = Math.min(0.99, Math.max(...positions.map((position) => position.x)) + 0.16)
        const top = Math.max(0.08, Math.min(...positions.map((position) => position.y)) - 0.16)
        const bottom = Math.min(0.98, Math.max(...positions.map((position) => position.y)) + 0.16)
        return (
          <div
            key={boundary.id}
            style={{
              position: "absolute",
              left: `${left * 100}%`,
              width: `${(right - left) * 100}%`,
              top: `${top * 100}%`,
              height: `${(bottom - top) * 100}%`,
              boxSizing: "border-box",
              border: `2px ${boundary.state === "closed" ? "solid" : "dashed"} ${tokens.terminal.dots[1]}`,
              borderRadius: tokens.radius,
              pointerEvents: "none",
              zIndex: 2,
            }}
          >
            {boundary.label && (
              <span style={{ position: "absolute", top: -28, left: 10, color: tokens.terminal.dots[1], fontSize: 14 }}>
                {boundary.label}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function prepareCompiledVisualProgram(value: unknown): CompiledVisualProgram {
  if (!value || !isCompiledVisualProgram(value))
    throw new Error("VisualProgramScene requires valid, version-pinned compiled visual-program props")
  return cloneAndFreezeVisualProgram(value)
}

export const VisualProgramScene: React.FC<Record<string, unknown>> = (rawProps) => {
  const tokens = useThemeTokens()
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const rawCompiled = rawProps.compiled
  const compiled = useMemo(() => prepareCompiledVisualProgram(rawCompiled), [rawCompiled])
  const state = stateAtFrame(compiled, frame, fps)
  return (
    <AbsoluteFill
      style={{
        background: tokens.backgroundGradient,
        color: tokens.foreground,
        fontFamily: tokens.fontFamily,
        padding: 56,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: compiled.panels.length === 1 ? "1fr" : "repeat(2, minmax(0, 1fr))",
          gap: 22,
          height: "100%",
          minHeight: 0,
        }}
      >
        {compiled.panels.map((panel) => (
          <VisualPanel key={panel.id} panel={panel} state={state} tokens={tokens} />
        ))}
      </div>
    </AbsoluteFill>
  )
}
