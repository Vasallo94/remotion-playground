import React from "react"
import { AbsoluteFill } from "remotion"
import { usePhase1Entry } from "../../../../shared/hooks/usePhase1Entry"
import { useBeatReveal } from "../../../../shared/hooks/useBeatReveal"
import { useThemeTokens } from "../../../../shared/themes"
import type { Beat } from "../../../../utils/direction"

interface Props {
  title: string
  language: string
  filename: string
  code: string
  highlightLines: number[]
  beats?: Beat[]
}

const CodeLine: React.FC<{
  line: string
  lineNumber: number
  isHighlighted: boolean
  beat: Beat | null
  index: number
}> = ({ line, lineNumber, isHighlighted, beat, index }) => {
  const { opacity, y, progress } = useBeatReveal({
    beat: beat ?? undefined,
    fallbackDelayMs: 200 + index * 50,
    animationMs: 200,
  })
  const tokens = useThemeTokens()

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${y}px)`,
        display: "flex",
        padding: "8px 24px",
        position: "relative",
        fontFamily: "monospace",
        fontSize: 26,
        color: isHighlighted ? tokens.foreground : `${tokens.foreground}b3`, // ~70% opacity
        whiteSpace: "pre",
      }}
    >
      {isHighlighted && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: tokens.primary,
            opacity: progress * 0.15,
            borderLeft: `4px solid ${tokens.primary}`,
            zIndex: 0,
          }}
        />
      )}
      <span style={{ width: 48, opacity: 0.5, userSelect: "none", zIndex: 1 }}>{lineNumber}</span>
      <span style={{ zIndex: 1 }}>{line}</span>
    </div>
  )
}

export const SettingsJsonScene: React.FC<Record<string, unknown>> = (rawProps) => {
  const props = rawProps as unknown as Props
  const { title, filename, code, highlightLines = [], beats = [] } = props
  const phase1 = usePhase1Entry({ durationMs: 150 })
  const tokens = useThemeTokens()

  const lines = code.split("\n")

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
      <h1
        style={{
          opacity: phase1.opacity,
          transform: `scale(${phase1.scale})`,
          fontFamily: tokens.fontFamily,
          fontSize: 56,
          fontWeight: 800,
          color: tokens.foreground,
          marginBottom: 60,
        }}
      >
        {title}
      </h1>

      <div
        style={{
          width: "100%",
          maxWidth: 900,
          background: tokens.card.bg,
          border: `2px solid ${tokens.card.border}`,
          borderRadius: 16,
          boxShadow: tokens.card.shadow,
          overflow: "hidden",
          opacity: phase1.opacity,
          transform: `translateY(${100 - phase1.progress * 100}px)`,
        }}
      >
        <div
          style={{
            background: `${tokens.card.border}66`,
            padding: "16px 24px",
            borderBottom: `1px solid ${tokens.card.border}`,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#ef4444" }} />
            <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#eab308" }} />
            <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#22c55e" }} />
          </div>
          <span
            style={{
              fontFamily: tokens.fontFamily,
              color: tokens.foreground,
              opacity: 0.8,
              fontSize: 18,
              marginLeft: 8,
            }}
          >
            {filename}
          </span>
        </div>

        <div style={{ padding: "24px 0" }}>
          {lines.map((line, i) => {
            const lineNumber = i + 1
            const highlightIndex = highlightLines.indexOf(lineNumber)
            const isHighlighted = highlightIndex !== -1

            // Map line numbers to beats.
            let beatToUse: Beat | null = null
            if (isHighlighted) {
              beatToUse = beats[highlightIndex + 1] ?? null
            }

            return (
              <CodeLine
                key={i}
                line={line}
                lineNumber={lineNumber}
                isHighlighted={isHighlighted}
                beat={beatToUse}
                index={i}
              />
            )
          })}
        </div>
      </div>
    </AbsoluteFill>
  )
}
