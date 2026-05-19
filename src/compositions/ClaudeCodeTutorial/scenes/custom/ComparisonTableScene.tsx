import React from "react"
import { AbsoluteFill } from "remotion"
import { useThemeTokens } from "../../../../shared/themes"
import type { Beat, Timing } from "../../../../utils/direction"
import { usePhase1Entry } from "../../../../shared/hooks/usePhase1Entry"
import { useBeatReveal } from "../../../../shared/hooks/useBeatReveal"

const CheckIcon = ({ size, color }: { size: number; color: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

const CrossIcon = ({ size, color }: { size: number; color: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

interface ColumnData {
  header: string
  items: string[]
}

interface ComparisonTableProps {
  title: string
  leftColumn: ColumnData
  rightColumn: ColumnData
  leftColor?: string
  rightColor?: string
  leftIcon?: "check" | "cross"
  rightIcon?: "check" | "cross"
  timing?: Timing
  beats?: Beat[]
}

const ComparisonItem: React.FC<{
  text: string
  icon: "check" | "cross"
  color: string
  parentBeat: Beat | null
  index: number
  parentFallbackMs: number
  tokens: ReturnType<typeof useThemeTokens>
}> = ({ text, icon, color, parentBeat, index, parentFallbackMs, tokens }) => {
  const { opacity, y } = useBeatReveal({
    beat: parentBeat ?? undefined,
    fallbackDelayMs: parentFallbackMs + 200 + index * 100,
    animationMs: 200,
  })

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 16,
        opacity,
        transform: `translateY(${y}px)`,
      }}
    >
      <div style={{ marginTop: 2 }}>
        {icon === "check" ? <CheckIcon size={24} color={color} /> : <CrossIcon size={24} color={color} />}
      </div>
      <div style={{ fontFamily: tokens.fontFamily, fontSize: 20, color: tokens.foreground, lineHeight: 1.4 }}>
        {text}
      </div>
    </div>
  )
}

const ComparisonColumn: React.FC<{
  column: ColumnData
  accent: string
  icon: "check" | "cross"
  beat: Beat | null
  fallbackMs: number
  tokens: ReturnType<typeof useThemeTokens>
}> = ({ column, accent, icon, beat, fallbackMs, tokens }) => {
  const { opacity, y } = useBeatReveal({
    beat: beat ?? undefined,
    fallbackDelayMs: fallbackMs,
    animationMs: 300,
  })

  return (
    <div
      style={{
        flex: 1,
        background: tokens.card.bg,
        border: `2px solid ${tokens.card.border}`,
        borderTop: `6px solid ${accent}`,
        borderRadius: 12,
        padding: "32px",
        boxShadow: tokens.card.shadow,
        display: "flex",
        flexDirection: "column",
        gap: 20,
        backgroundColor: `${accent}08`,
        opacity,
        transform: `translateY(${y}px)`,
      }}
    >
      <div
        style={{
          fontFamily: tokens.fontFamily,
          fontSize: 26,
          fontWeight: 700,
          color: accent,
          textAlign: "center",
          marginBottom: 12,
        }}
      >
        {column.header}
      </div>
      {column.items.map((item, i) => (
        <ComparisonItem
          key={i}
          text={item}
          icon={icon}
          color={accent}
          parentBeat={beat}
          index={i}
          parentFallbackMs={fallbackMs}
          tokens={tokens}
        />
      ))}
    </div>
  )
}

export const ComparisonTableScene: React.FC<Record<string, unknown>> = (rawProps) => {
  const props = rawProps as unknown as ComparisonTableProps
  const {
    title,
    leftColumn,
    rightColumn,
    leftColor: leftColorProp,
    rightColor: rightColorProp,
    leftIcon = "check",
    rightIcon = "cross",
    beats,
  } = props
  const tokens = useThemeTokens()
  const phase1 = usePhase1Entry({ durationMs: 100 })

  const leftAccent = leftColorProp || "#22c55e"
  const rightAccent = rightColorProp || "#ef4444"

  return (
    <AbsoluteFill
      style={{
        background: tokens.backgroundGradient,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 60px",
        gap: 48,
      }}
    >
      <div
        style={{
          fontFamily: tokens.fontFamily,
          fontSize: 42,
          fontWeight: 700,
          color: tokens.foreground,
          opacity: phase1.opacity,
          transform: `scale(${phase1.scale})`,
        }}
      >
        {title}
      </div>

      <div style={{ display: "flex", width: "100%", maxWidth: 1000, gap: 40 }}>
        <ComparisonColumn
          column={leftColumn}
          accent={leftAccent}
          icon={leftIcon}
          beat={beats?.[1] ?? null}
          fallbackMs={300}
          tokens={tokens}
        />
        <ComparisonColumn
          column={rightColumn}
          accent={rightAccent}
          icon={rightIcon}
          beat={beats?.[2] ?? null}
          fallbackMs={600}
          tokens={tokens}
        />
      </div>
    </AbsoluteFill>
  )
}
