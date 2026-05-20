import React from "react"
import { AbsoluteFill } from "remotion"
import { usePhase1Entry } from "../../../../shared/hooks/usePhase1Entry"
import { useBeatReveal } from "../../../../shared/hooks/useBeatReveal"
import { useThemeTokens } from "../../../../shared/themes"
import type { Beat } from "../../../../utils/direction"

interface Block {
  id: string
  label: string
  sublabel?: string
  row: number
  col: number
  connections?: string[]
}

interface Props {
  title: string
  blocks: Block[]
  beats?: Beat[]
}

const NodeBlock: React.FC<{
  block: Block
  index: number
  beat: Beat | null
}> = ({ block, index, beat }) => {
  const { opacity, y } = useBeatReveal({
    beat: beat ?? undefined,
    fallbackDelayMs: 200 + index * 150,
    animationMs: 250,
  })
  const tokens = useThemeTokens()

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${y}px)`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: 320,
        height: 160,
        background: tokens.card.bg,
        border: `2px solid ${tokens.card.border}`,
        borderRadius: 16,
        boxShadow: tokens.card.shadow,
        zIndex: 2,
      }}
    >
      <span style={{ fontSize: 32, fontWeight: 700, color: tokens.foreground }}>{block.label}</span>
      {block.sublabel && (
        <span style={{ fontSize: 24, color: tokens.primary, marginTop: 12, fontWeight: 500 }}>{block.sublabel}</span>
      )}
    </div>
  )
}

const Arrow: React.FC<{ beat: Beat | null; delayOffset: number }> = ({ beat, delayOffset }) => {
  const { opacity } = useBeatReveal({
    beat: beat ?? undefined,
    fallbackDelayMs: delayOffset,
    animationMs: 200,
  })
  const tokens = useThemeTokens()

  return (
    <div
      style={{
        opacity,
        display: "flex",
        alignItems: "center",
        width: 80,
        height: 4,
        background: tokens.primary,
        position: "relative",
        zIndex: 1,
      }}
    >
      <div
        style={{
          position: "absolute",
          right: -2,
          top: "50%",
          transform: "translateY(-50%)",
          width: 0,
          height: 0,
          borderTop: "10px solid transparent",
          borderBottom: "10px solid transparent",
          borderLeft: `14px solid ${tokens.primary}`,
        }}
      />
    </div>
  )
}

export const HookArchitectureScene: React.FC<Record<string, unknown>> = (rawProps) => {
  const props = rawProps as unknown as Props
  const { title, blocks = [], beats = [] } = props
  const phase1 = usePhase1Entry({ durationMs: 100 })
  const tokens = useThemeTokens()

  return (
    <AbsoluteFill
      style={{
        background: tokens.background,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 60,
      }}
    >
      <h1
        style={{
          opacity: phase1.opacity,
          transform: `scale(${phase1.scale})`,
          fontFamily: tokens.fontFamily,
          fontSize: 64,
          fontWeight: 800,
          color: tokens.foreground,
          marginBottom: 120,
        }}
      >
        {title}
      </h1>

      <div style={{ display: "flex", alignItems: "center", gap: 30 }}>
        {blocks.map((block, i) => {
          const beat = beats[i + 1] ?? null
          const isLast = i === blocks.length - 1

          return (
            <React.Fragment key={block.id}>
              <NodeBlock block={block} index={i} beat={beat} />
              {!isLast && <Arrow beat={beats[i + 2] ?? null} delayOffset={200 + (i + 1) * 150} />}
            </React.Fragment>
          )
        })}
      </div>
    </AbsoluteFill>
  )
}
