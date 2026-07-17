// src/compositions/ClaudeCodeTutorial/scenes/OutroScene.tsx
import React from "react"
import { AbsoluteFill } from "remotion"
import type { OutroSceneProps } from "../schema"
import { useThemeTokens } from "../../../shared/themes"
import { MascotWatermark } from "../../../shared/components/MascotWatermark"
import { usePhase1Entry } from "../../../shared/hooks/usePhase1Entry"
import { useBeatReveal } from "../../../shared/hooks/useBeatReveal"
import type { Beat } from "../../../shared/schemas"

const OutroBullet: React.FC<{
  text: string
  beat: Beat | null
  index: number
  tokens: ReturnType<typeof useThemeTokens>
}> = ({ text, beat, index, tokens }) => {
  const { opacity, y } = useBeatReveal({
    beat: beat ?? undefined,
    fallbackDelayMs: 300 + index * 200,
    animationMs: 300,
  })
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 14, opacity, transform: `translateY(${y}px)` }}>
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: tokens.radius,
          background: tokens.primary,
          flexShrink: 0,
          marginTop: 8,
        }}
      />
      <div
        style={{
          fontFamily: tokens.fontFamily,
          fontSize: 22,
          color: tokens.foreground,
          opacity: 0.78,
          lineHeight: 1.5,
        }}
      >
        {text}
      </div>
    </div>
  )
}

export const OutroScene: React.FC<OutroSceneProps & { showThemeLabel?: boolean }> = ({
  title,
  bullets,
  beats,
  showThemeLabel = true,
}) => {
  const tokens = useThemeTokens()
  const phase1 = usePhase1Entry({ durationMs: 100 })

  return (
    <AbsoluteFill
      style={{
        background: tokens.backgroundGradient,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 80,
        gap: 32,
      }}
    >
      <div
        style={{
          fontFamily: tokens.fontFamily,
          fontSize: 48,
          fontWeight: 800,
          color: tokens.foreground,
          opacity: phase1.opacity,
          transform: `scale(${phase1.scale})`,
          textAlign: "center",
        }}
      >
        {title}
      </div>

      {bullets && bullets.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 700 }}>
          {bullets.map((bullet, i) => (
            <OutroBullet key={i} text={bullet} beat={beats?.[i] ?? null} index={i} tokens={tokens} />
          ))}
        </div>
      )}

      {showThemeLabel && (
        <div
          style={{
            marginTop: 16,
            fontFamily: tokens.fontFamily,
            fontSize: 13,
            color: tokens.labelColor,
            letterSpacing: 2,
            textTransform: "uppercase",
            opacity: phase1.opacity,
          }}
        >
          {tokens.label}
        </div>
      )}

      <MascotWatermark animation="idle" />
    </AbsoluteFill>
  )
}
