import React from "react"
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion"
import { useThemeTokens } from "../../../../shared/themes"
import { MascotWatermark } from "../../../../shared/components/MascotWatermark"
import type { Beat, Timing } from "../../../../utils/direction"
import { getBeatStartFrame } from "../../../../utils/direction"
import { usePhase1Entry } from "../../../../shared/hooks/usePhase1Entry"
import { useBeatReveal } from "../../../../shared/hooks/useBeatReveal"

// Derives linear step nodes from titles like "Step A → Step B → Step C"
const deriveNodesFromTitle = (title: string): FlowNode[] =>
  title
    .split("→")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((label, i) => ({ id: `step-${i}`, title: label }))

interface FlowNode {
  id: string
  title: string
  description?: string
  color?: string
  icon?: string
}

interface FlowEdge {
  from: string
  to: string
  label?: string
  style?: "solid" | "dashed"
}

interface FlowDiagramProps {
  title: string
  description?: string
  nodes?: FlowNode[]
  edges?: FlowEdge[]
  layout?: "horizontal" | "vertical"
  introText?: string
  outroText?: string
  showParticle?: boolean
  timing?: Timing
  beats?: Beat[]
}

const normalizeNodes = (raw: unknown): FlowNode[] => {
  if (!Array.isArray(raw)) return []
  const result: FlowNode[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const r = item as Record<string, unknown>
    const title = typeof r.title === "string" ? r.title : typeof r.label === "string" ? r.label : ""
    if (!title) continue
    result.push({
      id: typeof r.id === "string" ? r.id : title,
      title,
      description: typeof r.description === "string" ? r.description : undefined,
      color: typeof r.color === "string" ? r.color : undefined,
      icon: typeof r.icon === "string" ? r.icon : undefined,
    })
  }
  return result
}

const normalizeEdges = (raw: unknown): FlowEdge[] => {
  if (!Array.isArray(raw)) return []
  const result: FlowEdge[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const r = item as Record<string, unknown>
    const from = typeof r.from === "string" ? r.from : ""
    const to = typeof r.to === "string" ? r.to : ""
    if (!from || !to) continue
    result.push({
      from,
      to,
      label: typeof r.label === "string" ? r.label : undefined,
      style: r.style === "dashed" ? "dashed" : "solid",
    })
  }
  return result
}

const FlowNodeCard: React.FC<{
  node: FlowNode
  beat: Beat | null
  index: number
  tokens: ReturnType<typeof useThemeTokens>
  layout: "horizontal" | "vertical"
  nodeCount: number
}> = ({ node, beat, index, tokens, layout, nodeCount }) => {
  const { opacity, y } = useBeatReveal({
    beat: beat ?? undefined,
    fallbackDelayMs: 400 + index * 200,
    animationMs: 300,
  })

  const color = node.color || tokens.primary

  const width = layout === "horizontal" ? Math.min(220, Math.floor(900 / nodeCount)) : 400

  return (
    <div
      style={{
        width,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        opacity,
        transform: layout === "horizontal" ? `translateY(${y}px)` : `translateX(${y}px)`,
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 14,
          background: `${color}20`,
          border: `2px solid ${color}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: node.icon ? 28 : 20,
          fontWeight: 700,
          color,
          fontFamily: tokens.fontFamily,
        }}
      >
        {node.icon || String(index + 1)}
      </div>
      <div
        style={{
          fontFamily: tokens.fontFamily,
          fontSize: 18,
          fontWeight: 700,
          color: tokens.foreground,
          textAlign: "center",
          lineHeight: 1.3,
        }}
      >
        {node.title}
      </div>
      {node.description && (
        <div
          style={{
            fontFamily: tokens.fontFamily,
            fontSize: 14,
            color: tokens.foreground,
            opacity: 0.65,
            textAlign: "center",
            lineHeight: 1.4,
            maxWidth: width - 8,
          }}
        >
          {node.description}
        </div>
      )}
    </div>
  )
}

const EdgeArrow: React.FC<{
  index: number
  total: number
  layout: "horizontal" | "vertical"
  progress: number
  tokens: ReturnType<typeof useThemeTokens>
  edge?: FlowEdge
}> = ({ index, total, layout, progress, tokens, edge }) => {
  const threshold = (index + 1) / (total + 1)
  const edgeOpacity = interpolate(progress, [threshold - 0.1, threshold + 0.05], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })

  const isDashed = edge?.style === "dashed"
  const arrowColor = `${tokens.foreground}60`

  if (layout === "vertical") {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          opacity: edgeOpacity,
          padding: "4px 0",
        }}
      >
        <div
          style={{
            width: 2,
            height: 28,
            background: arrowColor,
            ...(isDashed
              ? {
                  backgroundImage: `repeating-linear-gradient(to bottom, ${arrowColor} 0, ${arrowColor} 4px, transparent 4px, transparent 8px)`,
                  background: "none",
                }
              : {}),
          }}
        />
        <div
          style={{
            width: 0,
            height: 0,
            borderLeft: "6px solid transparent",
            borderRight: "6px solid transparent",
            borderTop: `8px solid ${arrowColor}`,
          }}
        />
        {edge?.label && (
          <div
            style={{
              fontSize: 11,
              color: tokens.foreground,
              opacity: 0.5,
              fontFamily: tokens.fontFamily,
              marginTop: 2,
            }}
          >
            {edge.label}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        opacity: edgeOpacity,
        padding: "0 4px",
        flexDirection: "column",
      }}
    >
      <div style={{ display: "flex", alignItems: "center" }}>
        <div
          style={{
            width: 32,
            height: 2,
            background: arrowColor,
            ...(isDashed
              ? {
                  backgroundImage: `repeating-linear-gradient(to right, ${arrowColor} 0, ${arrowColor} 4px, transparent 4px, transparent 8px)`,
                  background: "none",
                }
              : {}),
          }}
        />
        <div
          style={{
            width: 0,
            height: 0,
            borderTop: "6px solid transparent",
            borderBottom: "6px solid transparent",
            borderLeft: `8px solid ${arrowColor}`,
          }}
        />
      </div>
      {edge?.label && (
        <div
          style={{ fontSize: 11, color: tokens.foreground, opacity: 0.5, fontFamily: tokens.fontFamily, marginTop: 4 }}
        >
          {edge.label}
        </div>
      )}
    </div>
  )
}

const DataDrivenFlow: React.FC<{
  nodes: FlowNode[]
  edges: FlowEdge[]
  layout: "horizontal" | "vertical"
  introText?: string
  outroText?: string
  showParticle?: boolean
  beats?: Beat[]
  tokens: ReturnType<typeof useThemeTokens>
}> = ({ nodes, edges, layout, introText, outroText, showParticle, beats, tokens }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const beatOffset = 1
  const visualDelay = beats?.[beatOffset] ? getBeatStartFrame(beats[beatOffset], fps) : Math.ceil(fps * 0.8)
  const edgeProgress = spring({
    frame: Math.max(0, frame - visualDelay),
    fps,
    config: { damping: 80 },
    durationInFrames: Math.ceil(fps * 2),
  })

  const introReveal = useBeatReveal({
    beat: beats?.[0] ?? undefined,
    fallbackDelayMs: 300,
    animationMs: 300,
  })

  const outroReveal = useBeatReveal({
    beat: undefined,
    fallbackDelayMs: 1200 + nodes.length * 200,
    animationMs: 300,
  })

  const particleX = showParticle ? interpolate(edgeProgress, [0, 1], [0, 100], { extrapolateRight: "clamp" }) : 0

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24, width: "100%" }}>
      {introText && (
        <div
          style={{
            fontFamily: tokens.fontFamily,
            fontSize: 22,
            color: tokens.foreground,
            opacity: introReveal.opacity * 0.85,
            transform: `translateY(${introReveal.y}px)`,
            textAlign: "center",
            maxWidth: 800,
            lineHeight: 1.5,
          }}
        >
          {introText}
        </div>
      )}

      <div
        style={{
          display: "flex",
          flexDirection: layout === "vertical" ? "column" : "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 0,
          position: "relative",
        }}
      >
        {nodes.map((node, i) => (
          <React.Fragment key={node.id}>
            <FlowNodeCard
              node={node}
              beat={beats?.[i + beatOffset] ?? null}
              index={i}
              tokens={tokens}
              layout={layout}
              nodeCount={nodes.length}
            />
            {i < nodes.length - 1 && (
              <EdgeArrow
                index={i}
                total={nodes.length - 1}
                layout={layout}
                progress={edgeProgress}
                tokens={tokens}
                edge={edges[i]}
              />
            )}
          </React.Fragment>
        ))}

        {showParticle && edgeProgress > 0.05 && edgeProgress < 0.95 && (
          <div
            style={{
              position: "absolute",
              [layout === "horizontal" ? "left" : "top"]: `${particleX}%`,
              [layout === "horizontal" ? "top" : "left"]: "50%",
              transform: "translate(-50%, -50%)",
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: tokens.primary,
              boxShadow: `0 0 12px ${tokens.primary}`,
            }}
          />
        )}
      </div>

      {outroText && (
        <div
          style={{
            fontFamily: tokens.fontFamily,
            fontSize: 20,
            color: tokens.primary,
            fontWeight: 600,
            opacity: outroReveal.opacity,
            transform: `translateY(${outroReveal.y}px)`,
            textAlign: "center",
            maxWidth: 800,
            marginTop: 8,
          }}
        >
          {outroText}
        </div>
      )}
    </div>
  )
}

const StepCard: React.FC<{
  node: FlowNode
  index: number
  beat?: Beat
  tokens: ReturnType<typeof useThemeTokens>
}> = ({ node, index, beat, tokens }) => {
  const { opacity, y } = useBeatReveal({
    beat,
    fallbackDelayMs: 250 + index * 220,
    animationMs: 320,
  })
  return (
    <div
      style={{
        opacity,
        transform: `translateY(${y}px)`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: tokens.primary,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 24,
          fontWeight: 800,
          color: tokens.primaryForeground,
          fontFamily: tokens.fontFamily,
          boxShadow: `0 4px 20px ${tokens.primary}55`,
        }}
      >
        {index + 1}
      </div>
      <div
        style={{
          padding: "20px 28px",
          background: tokens.card.bg,
          border: `2px solid ${tokens.card.border}`,
          borderTop: `3px solid ${tokens.primary}`,
          borderRadius: 16,
          fontSize: 28,
          fontWeight: 700,
          color: tokens.foreground,
          fontFamily: tokens.fontFamily,
          textAlign: "center",
          minWidth: 200,
          maxWidth: 280,
          lineHeight: 1.3,
          boxShadow: tokens.card.shadow,
        }}
      >
        {node.title}
      </div>
    </div>
  )
}

// Renders large numbered step cards for titles derived via "→" splitting.
// Replaces LegacyGitDiagram — used when no explicit nodes are provided.
const StepFlow: React.FC<{
  nodes: FlowNode[]
  description?: string
  beats?: Beat[]
  tokens: ReturnType<typeof useThemeTokens>
}> = ({ nodes, description, beats, tokens }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const arrowDelay = beats?.[nodes.length] ? getBeatStartFrame(beats[nodes.length], fps) : Math.ceil(fps * 1.2)
  const arrowProgress = spring({
    frame: Math.max(0, frame - arrowDelay),
    fps,
    config: { damping: 80 },
    durationInFrames: Math.ceil(fps * 1),
  })

  const descReveal = useBeatReveal({
    beat: beats?.[1] ?? undefined,
    fallbackDelayMs: 800 + nodes.length * 200,
    animationMs: 350,
  })

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 48, width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0 }}>
        {nodes.map((node, i) => {
          const arrowOpacity = interpolate(arrowProgress, [i / nodes.length, (i + 0.5) / nodes.length], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })
          return (
            <React.Fragment key={node.id}>
              <StepCard node={node} index={i} beat={beats?.[i]} tokens={tokens} />
              {i < nodes.length - 1 && (
                <div
                  style={{
                    opacity: arrowOpacity,
                    display: "flex",
                    alignItems: "center",
                    padding: "0 8px",
                    marginTop: -16,
                  }}
                >
                  <svg
                    width="40"
                    height="40"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={tokens.primary}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </div>
              )}
            </React.Fragment>
          )
        })}
      </div>

      {description && (
        <div
          style={{
            opacity: descReveal.opacity,
            transform: `translateY(${descReveal.y}px)`,
            fontFamily: tokens.fontFamily,
            fontSize: 28,
            color: tokens.foregroundMid,
            textAlign: "center",
            maxWidth: 820,
            lineHeight: 1.6,
            fontWeight: 400,
          }}
        >
          {description}
        </div>
      )}
    </div>
  )
}

export const FlowDiagramScene: React.FC<Record<string, unknown>> = (rawProps) => {
  const props = rawProps as unknown as FlowDiagramProps
  const { title, description, beats, layout = "horizontal", introText, outroText, showParticle } = props
  const tokens = useThemeTokens()
  const phase1 = usePhase1Entry({ durationMs: 100 })

  const explicitNodes = normalizeNodes(props.nodes)
  const edges = normalizeEdges(props.edges)

  // Prefer explicit nodes; fall back to splitting the title on "→"
  const nodes = explicitNodes.length > 0 ? explicitNodes : deriveNodesFromTitle(title)
  const isStepFlow = explicitNodes.length === 0 && nodes.length > 1

  return (
    <AbsoluteFill
      style={{
        background: tokens.backgroundGradient,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 60px",
      }}
    >
      {/* Title shown only when explicit nodes drive the diagram; step-flow renders its own header */}
      {!isStepFlow && (
        <div
          style={{
            textAlign: "center",
            maxWidth: 900,
            marginBottom: 32,
            opacity: phase1.opacity,
            transform: `scale(${phase1.scale})`,
          }}
        >
          <div
            style={{
              fontFamily: tokens.fontFamily,
              fontSize: 48,
              fontWeight: 700,
              color: tokens.foreground,
            }}
          >
            {title}
          </div>
        </div>
      )}

      {isStepFlow ? (
        <StepFlow nodes={nodes} description={description} beats={beats} tokens={tokens} />
      ) : (
        <DataDrivenFlow
          nodes={nodes}
          edges={edges}
          layout={layout}
          introText={introText || description}
          outroText={outroText}
          showParticle={showParticle}
          beats={beats}
          tokens={tokens}
        />
      )}

      <MascotWatermark animation="idle" />
    </AbsoluteFill>
  )
}
