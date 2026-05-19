import React from "react"
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion"
import { useThemeTokens } from "../../../../shared/themes"
import { MascotWatermark } from "../../../../shared/components/MascotWatermark"
import type { Beat, Timing } from "../../../../utils/direction"
import { getBeatStartFrame } from "../../../../utils/direction"
import { usePhase1Entry } from "../../../../shared/hooks/usePhase1Entry"
import { useBeatReveal } from "../../../../shared/hooks/useBeatReveal"

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

const LegacyGitDiagram: React.FC<{
  description: string
  beats?: Beat[]
  tokens: ReturnType<typeof useThemeTokens>
}> = ({ description, beats, tokens }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const descReveal = useBeatReveal({
    beat: beats?.[1] ?? undefined,
    fallbackDelayMs: 400,
    animationMs: 300,
  })

  const visualDelay = beats?.[2] ? getBeatStartFrame(beats[2], fps) : Math.ceil(fps * 1)
  const visualProgress = spring({
    frame: Math.max(0, frame - visualDelay),
    fps,
    config: { damping: 100 },
    durationInFrames: Math.ceil(fps * 3),
  })

  const mainLineLength = interpolate(visualProgress, [0, 0.4], [0, 500], { extrapolateRight: "clamp" })
  const branchDivergeLength = interpolate(visualProgress, [0.3, 0.5], [0, 100], { extrapolateRight: "clamp" })
  const featureLineLength = interpolate(visualProgress, [0.5, 0.8], [0, 200], { extrapolateRight: "clamp" })
  const mergeLineLength = interpolate(visualProgress, [0.8, 1], [0, 100], { extrapolateRight: "clamp" })

  const mainColor = tokens.primary
  const branchColor = tokens.secondary || "#a855f7"

  const getCommitOpacity = (progress: number, threshold: number) =>
    interpolate(progress, [threshold - 0.05, threshold], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    })

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 40 }}>
      <div
        style={{
          fontFamily: tokens.fontFamily,
          fontSize: 24,
          color: tokens.foreground,
          opacity: descReveal.opacity * 0.8,
          transform: `translateY(${descReveal.y}px)`,
          lineHeight: 1.5,
          textAlign: "center",
          maxWidth: 700,
        }}
      >
        {description}
      </div>

      <div
        style={{
          width: 600,
          height: 200,
          position: "relative",
          opacity: interpolate(visualProgress, [0, 0.05], [0, 1], { extrapolateRight: "clamp" }),
        }}
      >
        <svg width="600" height="200" viewBox="0 0 600 200">
          <path
            d="M 50 150 L 550 150"
            fill="none"
            stroke={mainColor}
            strokeWidth="6"
            strokeDasharray="500"
            strokeDashoffset={500 - mainLineLength}
            strokeLinecap="round"
          />
          <path
            d="M 150 150 C 200 150, 200 50, 250 50"
            fill="none"
            stroke={branchColor}
            strokeWidth="6"
            strokeDasharray="150"
            strokeDashoffset={150 - branchDivergeLength * 1.5}
            strokeLinecap="round"
          />
          <path
            d="M 250 50 L 400 50"
            fill="none"
            stroke={branchColor}
            strokeWidth="6"
            strokeDasharray="150"
            strokeDashoffset={150 - featureLineLength * 0.75}
            strokeLinecap="round"
          />
          <path
            d="M 400 50 C 450 50, 450 150, 500 150"
            fill="none"
            stroke={branchColor}
            strokeWidth="6"
            strokeDasharray="150"
            strokeDashoffset={150 - mergeLineLength * 1.5}
            strokeLinecap="round"
          />

          <circle cx="50" cy="150" r="10" fill={mainColor} opacity={getCommitOpacity(visualProgress, 0.05)} />
          <circle cx="150" cy="150" r="10" fill={mainColor} opacity={getCommitOpacity(visualProgress, 0.15)} />
          <circle cx="280" cy="150" r="10" fill={mainColor} opacity={getCommitOpacity(visualProgress, 0.6)} />
          <circle cx="500" cy="150" r="10" fill={mainColor} opacity={getCommitOpacity(visualProgress, 0.95)} />

          <circle cx="250" cy="50" r="10" fill={branchColor} opacity={getCommitOpacity(visualProgress, 0.45)} />
          <circle cx="325" cy="50" r="10" fill={branchColor} opacity={getCommitOpacity(visualProgress, 0.65)} />
          <circle cx="400" cy="50" r="10" fill={branchColor} opacity={getCommitOpacity(visualProgress, 0.8)} />
        </svg>

        <div
          style={{
            position: "absolute",
            top: 170,
            left: 50,
            color: mainColor,
            fontFamily: tokens.monoFontFamily || tokens.fontFamily,
            fontWeight: "bold",
            opacity: getCommitOpacity(visualProgress, 0.1),
          }}
        >
          main
        </div>
        <div
          style={{
            position: "absolute",
            top: 15,
            left: 250,
            color: branchColor,
            fontFamily: tokens.monoFontFamily || tokens.fontFamily,
            fontWeight: "bold",
            opacity: getCommitOpacity(visualProgress, 0.5),
          }}
        >
          feature-branch
        </div>
      </div>
    </div>
  )
}

export const FlowDiagramScene: React.FC<Record<string, unknown>> = (rawProps) => {
  const props = rawProps as unknown as FlowDiagramProps
  const { title, description, beats, layout = "horizontal", introText, outroText, showParticle } = props
  const tokens = useThemeTokens()
  const phase1 = usePhase1Entry({ durationMs: 100 })

  const nodes = normalizeNodes(props.nodes)
  const edges = normalizeEdges(props.edges)
  const useDataDriven = nodes.length > 0

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
      <div
        style={{
          textAlign: "center",
          maxWidth: 900,
          marginBottom: useDataDriven ? 32 : 80,
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

      {useDataDriven ? (
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
      ) : (
        <LegacyGitDiagram description={description || ""} beats={beats} tokens={tokens} />
      )}

      <MascotWatermark animation="idle" />
    </AbsoluteFill>
  )
}
