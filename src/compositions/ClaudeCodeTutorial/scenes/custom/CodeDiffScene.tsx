import React from "react"
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion"
import { useThemeTokens } from "../../../../shared/themes"
import type { Beat, Timing } from "../../../../utils/direction"
import { getBeatStartFrame } from "../../../../utils/direction"
import { usePhase1Entry } from "../../../../shared/hooks/usePhase1Entry"

interface CodeDiffProps {
  fileName: string
  additions: string[]
  deletions: string[]
  context?: { before?: string[]; after?: string[] }
  title?: string
  timing?: Timing
  beats?: Beat[]
}

export const CodeDiffScene: React.FC<Record<string, unknown>> = (rawProps) => {
  const props = rawProps as unknown as CodeDiffProps
  const { fileName, additions, deletions, context, title, beats } = props
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const tokens = useThemeTokens()
  const phase1 = usePhase1Entry({ durationMs: 100 })

  type DiffLine = { text: string; type: "context" | "deletion" | "addition" }
  const lines: DiffLine[] = [
    ...(context?.before ?? []).map((t): DiffLine => ({ text: t, type: "context" })),
    ...deletions.map((t): DiffLine => ({ text: t, type: "deletion" })),
    ...additions.map((t): DiffLine => ({ text: t, type: "addition" })),
    ...(context?.after ?? []).map((t): DiffLine => ({ text: t, type: "context" })),
  ]

  const linesStartDelay = Math.ceil(fps * 0.25)
  const beatOffset = title ? 1 : 0

  const lineColors: Record<string, { bg: string; text: string; prefix: string }> = {
    context: { bg: "transparent", text: tokens.foreground, prefix: " " },
    deletion: { bg: "rgba(255,80,80,0.12)", text: "#ffa0a0", prefix: "-" },
    addition: { bg: "rgba(80,255,120,0.10)", text: "#7ee787", prefix: "+" },
  }

  return (
    <AbsoluteFill
      style={{
        background: tokens.backgroundGradient,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "30px 80px",
      }}
    >
      {title && (
        <div
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: tokens.foreground,
            fontFamily: tokens.fontFamily,
            marginBottom: 20,
            opacity: phase1.opacity,
            transform: `scale(${phase1.scale})`,
          }}
        >
          {title}
        </div>
      )}

      <div
        style={{
          width: "100%",
          maxWidth: 640,
          borderRadius: 8,
          overflow: "hidden",
          border: `1px solid ${tokens.card.border}`,
          boxShadow: tokens.card.shadow,
          opacity: phase1.opacity,
        }}
      >
        {/* Header */}
        <div
          style={{
            background: tokens.terminal.titleBar,
            padding: "8px 14px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            borderBottom: `1px solid ${tokens.card.border}`,
          }}
        >
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: tokens.foreground,
              fontFamily: tokens.monoFontFamily,
            }}
          >
            {fileName}
          </span>
          <span
            style={{
              fontSize: 11,
              color: tokens.foregroundMid,
              background: `${tokens.foregroundLow}20`,
              padding: "2px 8px",
              borderRadius: 10,
              fontFamily: tokens.monoFontFamily,
            }}
          >
            +{additions.length} -{deletions.length}
          </span>
        </div>

        {/* Diff lines — line-by-line reveal is Phase 2 content animation */}
        <div style={{ background: tokens.terminal.bg, padding: 0 }}>
          {lines.map((line, i) => {
            const lineDelay = beats?.[i + beatOffset]
              ? getBeatStartFrame(beats[i + beatOffset], fps)
              : line.type === "context"
                ? linesStartDelay
                : linesStartDelay + i * Math.ceil(fps * 0.15)
            const lineOpacity =
              line.type === "context"
                ? phase1.opacity
                : interpolate(frame, [lineDelay, lineDelay + 8], [0, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  })

            const colors = lineColors[line.type]

            return (
              <div
                key={i}
                style={{
                  padding: "3px 14px",
                  background: colors.bg,
                  fontFamily: tokens.monoFontFamily,
                  fontSize: 13,
                  color: colors.text,
                  opacity: lineOpacity,
                  display: "flex",
                  gap: 8,
                  lineHeight: 1.6,
                }}
              >
                <span style={{ color: tokens.foregroundLow, width: 12, flexShrink: 0 }}>{colors.prefix}</span>
                <span>{line.text}</span>
              </div>
            )
          })}
        </div>
      </div>
    </AbsoluteFill>
  )
}
