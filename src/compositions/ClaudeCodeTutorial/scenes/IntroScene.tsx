// src/compositions/ClaudeCodeTutorial/scenes/IntroScene.tsx
import React from "react"
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion"
import type { IntroSceneProps } from "../schema"
import { useThemeTokens } from "../../../shared/themes"
import { LineaDirectaBrandLockup } from "../../../shared/components/LineaDirectaBrandLockup"
import { PixelLogo } from "../../../shared/components/pixel-art/PixelLogo"
import { getBeatStartFrame } from "../../../utils/direction"
import { usePhase1Entry } from "../../../shared/hooks/usePhase1Entry"

const OrionConstellation: React.FC<{
  tokens: ReturnType<typeof useThemeTokens>
  opacity: number
}> = ({ tokens, opacity }) => {
  const constellation = tokens.constellation
  if (!constellation?.showIntro) return null

  return (
    <svg
      width="660"
      height="430"
      viewBox="0 0 660 430"
      style={{ position: "absolute", top: 52, right: 70, opacity: opacity * constellation.opacity }}
      aria-hidden="true"
    >
      <g fill="none" stroke={constellation.lineColor} strokeWidth="1.2">
        <path d="M128 58 L238 140 L330 134 L450 72" />
        <path d="M238 140 L268 228 L312 214 L350 200 L330 134" />
        <path d="M268 228 L194 350" />
        <path d="M350 200 L462 336" />
      </g>
      {[
        [128, 58, 3.5],
        [238, 140, 3.2],
        [330, 134, 3.2],
        [450, 72, 4.2],
        [268, 228, 2.8],
        [312, 214, 2.8],
        [350, 200, 2.8],
        [194, 350, 3.6],
        [462, 336, 3.6],
      ].map(([cx, cy, r], index) => (
        <circle
          key={index}
          cx={cx}
          cy={cy}
          r={r}
          fill={index === 3 ? constellation.accentStarColor : constellation.starColor}
        />
      ))}
    </svg>
  )
}

export const IntroScene: React.FC<IntroSceneProps & { showThemeLabel?: boolean }> = ({
  title,
  subtitle,
  pixelLogo,
  beats,
  showThemeLabel = true,
}) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const tokens = useThemeTokens()

  const phase1 = usePhase1Entry({ durationMs: 100 })
  const firstNarratedBeat = beats?.find((beat) => beat.narration?.trim())
  const accentStart = firstNarratedBeat ? getBeatStartFrame(firstNarratedBeat, fps) : Math.ceil(fps * 0.2)

  // Accent line waits for the first narrated beat
  const accentFrame = Math.max(0, frame - accentStart)
  const lineWidth = interpolate(accentFrame, [0, Math.ceil(fps * 0.5)], [0, 120], {
    extrapolateRight: "clamp",
  })

  const showPixelLogo = pixelLogo?.enabled && !tokens.mascot.show
  const logoScale = pixelLogo?.scale ?? 4
  const logoAnimation = pixelLogo?.animation ?? "glint"

  return (
    <AbsoluteFill
      style={{
        background: tokens.backgroundGradient,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
      }}
    >
      <OrionConstellation tokens={tokens} opacity={phase1.opacity} />

      {tokens.mascot.show && (
        <div style={{ marginBottom: 2, opacity: phase1.opacity }}>
          <LineaDirectaBrandLockup scale={0.72} animation="reveal" compact />
        </div>
      )}

      {showPixelLogo && (
        <div
          style={{
            marginBottom: 8,
            opacity: phase1.opacity,
            transform: `scale(${phase1.scale})`,
            position: "relative",
            width: 64 * logoScale,
            height: 96 * logoScale,
          }}
        >
          <div style={{ position: "absolute", inset: 0 }}>
            <PixelLogo scale={logoScale} animation="none" />
          </div>
          {logoAnimation !== "none" && (
            <div style={{ position: "absolute", inset: 0 }}>
              <PixelLogo scale={logoScale} animation={logoAnimation} delayFrames={accentStart} />
            </div>
          )}
        </div>
      )}

      {showThemeLabel && !tokens.mascot.show && (
        <div
          style={{
            fontFamily: tokens.fontFamily,
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: 4,
            textTransform: "uppercase",
            color: tokens.primary,
            opacity: phase1.opacity,
          }}
        >
          {tokens.label}
        </div>
      )}

      <div
        style={{
          fontFamily: tokens.fontFamily,
          fontSize: 56,
          fontWeight: 800,
          color: tokens.foreground,
          textAlign: "center",
          maxWidth: 900,
          lineHeight: 1.2,
          opacity: phase1.opacity,
          transform: `scale(${phase1.scale})`,
        }}
      >
        {title}
      </div>

      <div
        style={{
          width: lineWidth,
          height: 2,
          background: tokens.accentLine,
          borderRadius: tokens.radius,
        }}
      />

      {subtitle && (
        <div
          style={{
            fontFamily: tokens.fontFamily,
            fontSize: 22,
            color: tokens.foregroundMid,
            textAlign: "center",
            maxWidth: 700,
            opacity: phase1.opacity,
            transform: `scale(${phase1.scale})`,
          }}
        >
          {subtitle}
        </div>
      )}
    </AbsoluteFill>
  )
}
