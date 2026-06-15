// src/compositions/ClaudeCodeTutorial/scenes/CalloutScene.tsx
import React from "react"
import { AbsoluteFill } from "remotion"
import type { CalloutSceneProps } from "../schema"
import { useThemeTokens } from "../../../shared/themes"
import { MascotWatermark } from "../../../shared/components/MascotWatermark"
import { usePhase1Entry } from "../../../shared/hooks/usePhase1Entry"

const ALIGN_MAP: Record<"top" | "center" | "bottom" | "right", string> = {
  top: "flex-start",
  center: "center",
  bottom: "flex-end",
  right: "center",
}

export const CalloutScene: React.FC<CalloutSceneProps> = ({ text, position, background }) => {
  const tokens = useThemeTokens()

  const phase1 = usePhase1Entry({ durationMs: 100 })

  const justify = position === "right" ? "flex-end" : ("center" as const)
  const align = ALIGN_MAP[position]

  const bgColor = background === "overlay" ? tokens.overlay : tokens.background

  return (
    <AbsoluteFill
      style={{
        background: bgColor,
        display: "flex",
        alignItems: align,
        justifyContent: justify,
        padding: 80,
      }}
    >
      <div
        style={{
          maxWidth: 640,
          background: tokens.card.bgGradient,
          border: `1px solid ${tokens.card.border}`,
          borderLeft: `4px solid ${tokens.card.accentBorder}`,
          borderRadius: 10,
          padding: "28px 36px",
          opacity: phase1.opacity,
          transform: `scale(${phase1.scale})`,
          boxShadow: tokens.card.shadow,
        }}
      >
        <div
          style={{
            fontFamily: tokens.fontFamily,
            fontSize: 22,
            lineHeight: 1.5,
            color: tokens.foreground,
            fontWeight: 500,
            whiteSpace: "pre-line",
          }}
        >
          {text}
        </div>
      </div>
      <MascotWatermark animation="idle" />
    </AbsoluteFill>
  )
}
