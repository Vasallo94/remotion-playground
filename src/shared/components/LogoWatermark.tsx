import React from "react"
import { interpolate, useCurrentFrame } from "remotion"
import { useThemeTokens } from "../themes"
import { PixelLogo } from "./pixel-art/PixelLogo"
import { PixelSmoke } from "./pixel-art/PixelSmoke"

interface LogoWatermarkProps {
  bottom?: number
  right?: number
  opacity?: number
  logoScale?: number
}

const CinturonWatermark: React.FC<{ bottom: number; right: number; opacity: number; scale: number }> = ({
  bottom,
  right,
  opacity,
  scale,
}) => {
  const frame = useCurrentFrame()
  const tokens = useThemeTokens()
  const fadeIn = interpolate(frame, [0, 30], [0, opacity], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })

  return (
    <svg
      width={72 * scale}
      height={40 * scale}
      viewBox="0 0 72 40"
      style={{ position: "absolute", bottom, right, opacity: fadeIn, zIndex: 50 }}
      aria-hidden="true"
    >
      <line x1="10" y1="30" x2="62" y2="10" stroke={tokens.foregroundLow} strokeWidth="1" />
      <circle cx="10" cy="30" r="3.5" fill={tokens.foreground} />
      <circle cx="36" cy="20" r="3.5" fill={tokens.foreground} />
      <circle cx="62" cy="10" r="3.5" fill={tokens.primary} />
    </svg>
  )
}

export const LogoWatermark: React.FC<LogoWatermarkProps> = ({
  bottom = 12,
  right = 16,
  opacity = 0.5,
  logoScale = 1.2,
}) => {
  const frame = useCurrentFrame()
  const tokens = useThemeTokens()
  const watermark = tokens.watermark

  if (watermark?.type === "cinturon") {
    return (
      <CinturonWatermark
        bottom={watermark.bottom ?? bottom}
        right={watermark.right ?? right}
        opacity={watermark.opacity ?? opacity}
        scale={watermark.scale ?? logoScale}
      />
    )
  }

  // Fade in over first 30 frames
  const fadeIn = interpolate(frame, [0, 30], [0, opacity], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })

  // PixelLogo: 64*scale wide x 96*scale tall
  // Pipe/smoke origin in pixel map: ~column 6, row 55 (of 64x96)
  // That maps to: left offset ~6/64 = 9%, top offset ~55/96 = 57%
  const logoHeight = 96 * logoScale
  const smokeWidth = 20 * logoScale
  const smokeHeight = 24 * logoScale

  // Position smoke to the LEFT of the skull, at pipe height (~57% down)
  const smokeTop = logoHeight * 0.45
  const smokeRight = smokeWidth * 0.25 // slight overlap with skull edge

  return (
    <div
      style={{
        position: "absolute",
        bottom,
        right,
        opacity: fadeIn,
        zIndex: 50,
      }}
    >
      {/* Smoke at the pipe/mouth area — left side, flowing left-upward */}
      <div
        style={{
          position: "absolute",
          top: smokeTop,
          right: `calc(100% - ${smokeRight}px)`,
          width: smokeWidth,
          height: smokeHeight,
        }}
      >
        <PixelSmoke scale={logoScale} frameHold={5} />
      </div>
      {/* Static pixel logo */}
      <PixelLogo scale={logoScale} animation="none" />
    </div>
  )
}
