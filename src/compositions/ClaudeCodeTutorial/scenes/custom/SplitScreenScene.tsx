import React from "react"
import { AbsoluteFill } from "remotion"
import { useThemeTokens } from "../../../../shared/themes"
import { MascotWatermark } from "../../../../shared/components/MascotWatermark"
import { CheckIcon, CrossIcon, FolderIcon, UserIcon, CodeIcon } from "./svg-icons"
import type { Beat, Timing } from "../../../../utils/direction"
import { usePhase1Entry } from "../../../../shared/hooks/usePhase1Entry"
import { useBeatReveal } from "../../../../shared/hooks/useBeatReveal"

interface PanelConfig {
  label: string
  icon?: "check" | "cross" | "folder" | "user" | "code"
  items: string[]
  accent?: string
}

interface SplitScreenProps {
  title?: string
  left?: PanelConfig
  right?: PanelConfig
  timing?: Timing
  beats?: Beat[]
}

const iconMap: Record<string, React.FC<{ size?: number; color?: string }>> = {
  check: CheckIcon,
  cross: CrossIcon,
  folder: FolderIcon,
  user: UserIcon,
  code: CodeIcon,
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}

const asString = (value: unknown): string => (typeof value === "string" ? value : "")

const normalizeItems = (panel: Record<string, unknown>): string[] => {
  if (Array.isArray(panel.items)) {
    return panel.items.map((item) => String(item)).filter(Boolean)
  }
  const subtitle = asString(panel.subtitle)
  const description = asString(panel.description)
  const text = asString(panel.text)
  return [subtitle || description || text].filter(Boolean)
}

const normalizePanel = (value: unknown, fallbackLabel: string, fallbackAccent: string): PanelConfig => {
  const panel = asRecord(value)
  const icon = asString(panel.icon)
  const allowedIcon = icon in iconMap ? (icon as PanelConfig["icon"]) : undefined

  return {
    label: asString(panel.label) || asString(panel.title) || fallbackLabel,
    icon: allowedIcon,
    items: normalizeItems(panel),
    accent: asString(panel.accent) || fallbackAccent,
  }
}

const PanelItem: React.FC<{
  text: string
  beat: Beat | null
  index: number
  accent: string
  tokens: ReturnType<typeof useThemeTokens>
}> = ({ text, beat, index, accent, tokens }) => {
  const { opacity, y } = useBeatReveal({
    beat: beat ?? undefined,
    fallbackDelayMs: 300 + index * 150,
    animationMs: 250,
  })

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        opacity,
        transform: `translateY(${y}px)`,
      }}
    >
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: accent,
          marginTop: 8,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontFamily: tokens.fontFamily,
          fontSize: 20,
          color: tokens.foreground,
          lineHeight: 1.5,
        }}
      >
        {text}
      </span>
    </div>
  )
}

export const SplitScreenScene: React.FC<Record<string, unknown>> = (rawProps) => {
  const props = rawProps as unknown as SplitScreenProps
  const { title, left, right, beats } = props
  const tokens = useThemeTokens()
  const phase1 = usePhase1Entry({ durationMs: 100 })
  const normalizedLeft = normalizePanel(left, "Izquierda", tokens.primary)
  const normalizedRight = normalizePanel(right, "Derecha", tokens.secondary)

  const leftPanelBeat = beats?.[1] ?? null
  const rightPanelBeat = beats?.[2] ?? null

  return (
    <AbsoluteFill
      style={{
        background: tokens.backgroundGradient,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 48,
        gap: 32,
      }}
    >
      {title && (
        <div
          style={{
            fontFamily: tokens.fontFamily,
            fontSize: 36,
            fontWeight: 700,
            color: tokens.foreground,
            textAlign: "center",
            opacity: phase1.opacity,
            transform: `scale(${phase1.scale})`,
          }}
        >
          {title}
        </div>
      )}

      <div style={{ display: "flex", gap: 24, width: "100%", maxWidth: 1100 }}>
        {/* Left Panel — card frame is Phase 1, items are Phase 2 */}
        {(() => {
          const accent = normalizedLeft.accent || tokens.primary
          const IconComponent = normalizedLeft.icon ? iconMap[normalizedLeft.icon] : null
          return (
            <div
              style={{
                flex: 1,
                background: tokens.card.bg,
                border: `1px solid ${tokens.card.border}`,
                borderTop: `3px solid ${accent}`,
                borderRadius: 10,
                padding: "28px 32px",
                opacity: phase1.opacity,
                boxShadow: tokens.card.shadow,
                display: "flex",
                flexDirection: "column",
                gap: 20,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {IconComponent && <IconComponent size={28} color={accent} />}
                <span style={{ fontFamily: tokens.fontFamily, fontSize: 26, fontWeight: 700, color: accent }}>
                  {normalizedLeft.label}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {normalizedLeft.items.map((item, i) => (
                  <PanelItem key={i} text={item} beat={leftPanelBeat} index={i} accent={accent} tokens={tokens} />
                ))}
              </div>
            </div>
          )
        })()}

        {/* Right Panel */}
        {(() => {
          const accent = normalizedRight.accent || tokens.primary
          const IconComponent = normalizedRight.icon ? iconMap[normalizedRight.icon] : null
          return (
            <div
              style={{
                flex: 1,
                background: tokens.card.bg,
                border: `1px solid ${tokens.card.border}`,
                borderTop: `3px solid ${accent}`,
                borderRadius: 10,
                padding: "28px 32px",
                opacity: phase1.opacity,
                boxShadow: tokens.card.shadow,
                display: "flex",
                flexDirection: "column",
                gap: 20,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {IconComponent && <IconComponent size={28} color={accent} />}
                <span style={{ fontFamily: tokens.fontFamily, fontSize: 26, fontWeight: 700, color: accent }}>
                  {normalizedRight.label}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {normalizedRight.items.map((item, i) => (
                  <PanelItem key={i} text={item} beat={rightPanelBeat} index={i} accent={accent} tokens={tokens} />
                ))}
              </div>
            </div>
          )
        })()}
      </div>

      <MascotWatermark animation="idle" />
    </AbsoluteFill>
  )
}
