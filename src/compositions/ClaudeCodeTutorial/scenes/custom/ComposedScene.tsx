import type { CSSProperties } from "react"
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion"
import {
  type ComposedNode,
  type ComposedSceneSpec,
  type SemanticTone,
  validateComposedScene,
} from "@claqueta/scene-contracts"
import { usePhase1Entry } from "../../../../shared/hooks/usePhase1Entry"
import { type ThemeTokens, useThemeTokens } from "../../../../shared/themes"

const gaps = { none: 0, small: 12, medium: 22, large: 36 }
const spacers = { small: 12, medium: 28, large: 52 }

function toneColor(tone: SemanticTone | undefined, tokens: ThemeTokens): string {
  switch (tone) {
    case "accent":
      return tokens.primary
    case "muted":
      return tokens.foregroundMid
    case "success":
      return tokens.terminal.successColor
    case "warning":
      return tokens.terminal.dots[1]
    case "danger":
      return tokens.terminal.dots[0]
    default:
      return tokens.foreground
  }
}

function nodeEntrance(node: ComposedNode, frame: number, fps: number): CSSProperties {
  const start = Math.round(((node.revealAtMs ?? 200) / 1000) * fps)
  const progress = spring({
    frame: Math.max(0, frame - start),
    fps,
    config: { damping: 28, stiffness: 190 },
    durationInFrames: Math.max(1, Math.round(fps * 0.3)),
  })
  const entrance = node.entrance ?? "fade"
  if (entrance === "none") return {}
  const opacity = interpolate(progress, [0, 0.4], [0, 1], { extrapolateRight: "clamp" })
  if (entrance === "slide-up") return { opacity, transform: `translateY(${interpolate(progress, [0, 1], [18, 0])}px)` }
  if (entrance === "scale") return { opacity, transform: `scale(${interpolate(progress, [0, 1], [0.94, 1])})` }
  return { opacity }
}

const ComposedNodeView: React.FC<{ node: ComposedNode; inheritedTone?: SemanticTone }> = ({ node, inheritedTone }) => {
  const tokens = useThemeTokens()
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const entrance = nodeEntrance(node, frame, fps)
  const effectiveTone = node.tone ?? inheritedTone
  const shared: CSSProperties = {
    ...entrance,
    color: toneColor(effectiveTone, tokens),
    gridColumn: node.span ? `span ${node.span}` : undefined,
    minWidth: 0,
  }

  switch (node.type) {
    case "group": {
      const isGrid = node.direction === "grid"
      return (
        <div
          style={{
            ...shared,
            display: isGrid ? "grid" : "flex",
            flexDirection: node.direction === "row" ? "row" : "column",
            gridTemplateColumns: isGrid ? `repeat(${node.columns ?? 2}, minmax(0, 1fr))` : undefined,
            gap: gaps[node.gap ?? "medium"],
            alignItems: node.align ?? "stretch",
            justifyContent: node.align === "center" ? "center" : undefined,
            width: "100%",
          }}
        >
          {node.children.map((child, index) => (
            <ComposedNodeView key={`${child.type}-${index}`} node={child} inheritedTone={effectiveTone} />
          ))}
        </div>
      )
    }
    case "text": {
      const sizes = { title: 54, heading: 36, body: 25, label: 18, caption: 15 }
      return (
        <div
          style={{
            ...shared,
            fontSize: sizes[node.variant ?? "body"],
            fontWeight: node.variant === "title" || node.variant === "heading" ? 700 : 400,
            lineHeight: 1.18,
            textAlign: node.align ?? "left",
            letterSpacing: node.variant === "label" ? 1.2 : undefined,
            textTransform: node.variant === "label" ? "uppercase" : undefined,
          }}
        >
          {node.text}
        </div>
      )
    }
    case "card":
      return (
        <div
          style={{
            ...shared,
            padding: 24,
            border: `1px solid ${node.tone === "accent" ? tokens.primary : tokens.card.border}`,
            borderLeft: `4px solid ${toneColor(node.tone ?? "accent", tokens)}`,
            background: tokens.card.bg,
            borderRadius: tokens.radius,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {node.title && <div style={{ fontSize: 27, fontWeight: 700 }}>{node.title}</div>}
          {node.body && <div style={{ fontSize: 20, lineHeight: 1.35, color: tokens.foregroundMid }}>{node.body}</div>}
          {node.children?.map((child, index) => (
            <ComposedNodeView key={`${child.type}-${index}`} node={child} inheritedTone={effectiveTone} />
          ))}
        </div>
      )
    case "metric":
      return (
        <div style={{ ...shared, display: "flex", flexDirection: "column", gap: 6 }}>
          <div
            style={{
              fontSize: 58,
              lineHeight: 1,
              fontWeight: 700,
              color: toneColor(effectiveTone ?? "accent", tokens),
            }}
          >
            {node.value}
            {node.unit && <span style={{ fontSize: 25, marginLeft: 6 }}>{node.unit}</span>}
          </div>
          <div style={{ fontSize: 18, color: tokens.foregroundMid }}>{node.label}</div>
        </div>
      )
    case "list":
      return (
        <div style={{ ...shared, display: "flex", flexDirection: "column", gap: 11 }}>
          {node.items.map((item, index) => (
            <div key={`${item}-${index}`} style={{ display: "flex", gap: 12, fontSize: 21, lineHeight: 1.3 }}>
              <span style={{ color: toneColor(node.tone ?? "accent", tokens) }}>
                {node.style === "number" ? `${index + 1}.` : node.style === "check" ? "✓" : "•"}
              </span>
              <span>{item}</span>
            </div>
          ))}
        </div>
      )
    case "progress":
      return (
        <div style={{ ...shared, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18 }}>
            <span>{node.label}</span>
            <span>{node.value}%</span>
          </div>
          <div style={{ height: 12, background: tokens.foregroundLow }}>
            <div
              style={{ width: `${node.value}%`, height: "100%", background: toneColor(node.tone ?? "accent", tokens) }}
            />
          </div>
        </div>
      )
    case "divider":
      return (
        <div
          style={{
            ...shared,
            height: 1,
            width: "100%",
            background: toneColor(node.tone ?? "muted", tokens),
            opacity: 0.5,
          }}
        />
      )
    case "spacer":
      return <div style={{ ...shared, height: spacers[node.size] }} />
  }
}

export const ComposedScene: React.FC<Record<string, unknown>> = (props) => {
  const specInput = { ...props }
  delete specInput.timing
  delete specInput.beats
  const validation = validateComposedScene(specInput)
  const tokens = useThemeTokens()
  const phase1 = usePhase1Entry({ durationMs: 120 })
  if (!validation.valid) {
    throw new Error(`Invalid composed-scene props: ${validation.errors.join("; ")}`)
  }
  const spec = specInput as unknown as ComposedSceneSpec
  const background =
    spec.backgroundTone === "contrast"
      ? tokens.card.bgGradient
      : spec.backgroundTone === "subtle"
        ? tokens.card.bg
        : tokens.backgroundGradient

  return (
    <AbsoluteFill style={{ background, color: tokens.foreground, fontFamily: tokens.fontFamily, padding: "58px 72px" }}>
      <div
        style={{
          opacity: phase1.opacity,
          transform: `scale(${phase1.scale})`,
          transformOrigin: "left center",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          marginBottom: spec.title || spec.subtitle ? 30 : 0,
        }}
      >
        {spec.title && <div style={{ fontSize: 45, lineHeight: 1.08, fontWeight: 700 }}>{spec.title}</div>}
        {spec.subtitle && <div style={{ fontSize: 21, color: tokens.foregroundMid }}>{spec.subtitle}</div>}
      </div>
      <div style={{ flex: 1, display: "flex", minHeight: 0, alignItems: "center" }}>
        <ComposedNodeView node={spec.root} />
      </div>
    </AbsoluteFill>
  )
}
