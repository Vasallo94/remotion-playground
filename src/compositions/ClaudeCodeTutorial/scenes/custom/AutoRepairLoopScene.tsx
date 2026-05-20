import React from "react"
import { AbsoluteFill } from "remotion"
import { usePhase1Entry } from "../../../../shared/hooks/usePhase1Entry"
import { useThemeTokens } from "../../../../shared/themes"
import type { Beat } from "../../../../utils/direction"
import { useBeatReveal } from "../../../../shared/hooks/useBeatReveal"

interface Props {
  title: string
  description: string
  beats?: Beat[]
}

const Step: React.FC<{ text: string; index: number }> = ({ text, index }) => {
  const { opacity, y } = useBeatReveal({
    fallbackDelayMs: 200 + index * 250,
    animationMs: 300,
  })
  const tokens = useThemeTokens()

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${y}px)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 40px",
        background: tokens.card.bg,
        border: `2px solid ${tokens.card.border}`,
        borderRadius: 24,
        boxShadow: tokens.card.shadow,
        fontSize: 36,
        fontWeight: 700,
        color: tokens.foreground,
        minWidth: 260,
        textAlign: "center",
      }}
    >
      {text.trim()}
    </div>
  )
}

const Arrow: React.FC<{ index: number }> = ({ index }) => {
  const { opacity } = useBeatReveal({
    fallbackDelayMs: 350 + index * 250,
    animationMs: 200,
  })
  const tokens = useThemeTokens()

  // Use an SVG arrow for better visuals
  return (
    <div
      style={{
        opacity,
        display: "flex",
        alignItems: "center",
        color: tokens.primary,
        padding: "0 10px",
      }}
    >
      <svg
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="5" y1="12" x2="19" y2="12"></line>
        <polyline points="12 5 19 12 12 19"></polyline>
      </svg>
    </div>
  )
}

export const AutoRepairLoopScene: React.FC<Record<string, unknown>> = (rawProps) => {
  const props = rawProps as unknown as Props
  const { title, description } = props
  const phase1 = usePhase1Entry({ durationMs: 150 })
  const tokens = useThemeTokens()

  const steps = title.split("→").map((s) => s.trim())

  return (
    <AbsoluteFill
      style={{
        background: tokens.background,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 80,
      }}
    >
      {/* Visual steps */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 120 }}>
        {steps.map((step, i) => (
          <React.Fragment key={i}>
            <Step text={step} index={i} />
            {i < steps.length - 1 && <Arrow index={i} />}
          </React.Fragment>
        ))}
      </div>

      {/* Description */}
      <div
        style={{
          opacity: phase1.opacity,
          transform: `translateY(${(1 - phase1.progress) * 30}px)`,
          maxWidth: 1000,
          textAlign: "center",
          fontSize: 40,
          lineHeight: 1.6,
          color: `${tokens.foreground}e6`,
          fontFamily: tokens.fontFamily,
          fontWeight: 500,
        }}
      >
        {description}
      </div>
    </AbsoluteFill>
  )
}
