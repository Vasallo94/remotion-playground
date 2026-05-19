import React from "react"
import { AbsoluteFill } from "remotion"
import { useThemeTokens } from "../../../../shared/themes"
import { MascotWatermark } from "../../../../shared/components/MascotWatermark"
import {
  TerminalIcon,
  CloudIcon,
  CodeIcon,
  FolderIcon,
  ShieldIcon,
  GearIcon,
  UserIcon,
  BookIcon,
  LightbulbIcon,
  LayersIcon,
  LinkIcon,
  CheckIcon,
  FileIcon,
} from "./svg-icons"
import type { Beat, Timing } from "../../../../utils/direction"
import { usePhase1Entry } from "../../../../shared/hooks/usePhase1Entry"
import { useBeatReveal } from "../../../../shared/hooks/useBeatReveal"

type IconKey =
  | "terminal"
  | "cloud"
  | "code"
  | "folder"
  | "shield"
  | "gear"
  | "user"
  | "book"
  | "lightbulb"
  | "layers"
  | "link"
  | "check"
  | "file"

interface GridItem {
  icon: IconKey
  title: string
  description: string
  accent?: string
}

interface IconGridProps {
  title?: string
  items?: GridItem[]
  columns?: 2 | 3 | 4
  timing?: Timing
  beats?: Beat[]
}

const iconLookup: Record<string, React.FC<{ size?: number; color?: string }>> = {
  terminal: TerminalIcon,
  cloud: CloudIcon,
  code: CodeIcon,
  folder: FolderIcon,
  shield: ShieldIcon,
  gear: GearIcon,
  user: UserIcon,
  book: BookIcon,
  lightbulb: LightbulbIcon,
  layers: LayersIcon,
  link: LinkIcon,
  check: CheckIcon,
  file: FileIcon,
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}

const asString = (value: unknown): string => (typeof value === "string" ? value : "")

const normalizeItems = (items: unknown): GridItem[] => {
  if (!Array.isArray(items)) return []
  return items
    .map((item) => {
      if (typeof item === "string") {
        return { icon: "check" as IconKey, title: item, description: "" }
      }
      const record = asRecord(item)
      const icon = asString(record.icon)
      return {
        icon: icon in iconLookup ? (icon as IconKey) : "check",
        title: asString(record.title) || asString(record.label) || asString(record.name),
        description: asString(record.description) || asString(record.subtitle) || asString(record.text),
        accent: asString(record.accent) || undefined,
      }
    })
    .filter((item) => item.title || item.description)
}

const GridItemCard: React.FC<{
  item: GridItem
  beat: Beat | null
  index: number
  tokens: ReturnType<typeof useThemeTokens>
  cardWidth: number
}> = ({ item, beat, index, tokens, cardWidth }) => {
  const { opacity, y } = useBeatReveal({
    beat: beat ?? undefined,
    fallbackDelayMs: 200 + index * 150,
    animationMs: 250,
  })

  const accent = item.accent || tokens.primary
  const IconComponent = iconLookup[item.icon] || CodeIcon

  return (
    <div
      style={{
        width: cardWidth,
        background: tokens.card.bg,
        border: `1px solid ${tokens.card.border}`,
        borderRadius: 10,
        padding: "24px 20px",
        opacity,
        transform: `translateY(${y}px)`,
        boxShadow: tokens.card.shadow,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 8,
          background: `${accent}15`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <IconComponent size={24} color={accent} />
      </div>
      <div
        style={{
          fontFamily: tokens.fontFamily,
          fontSize: 20,
          fontWeight: 700,
          color: tokens.foreground,
        }}
      >
        {item.title}
      </div>
      <div
        style={{
          fontFamily: tokens.fontFamily,
          fontSize: 16,
          color: tokens.foreground,
          opacity: 0.7,
          lineHeight: 1.5,
        }}
      >
        {item.description}
      </div>
    </div>
  )
}

export const IconGridScene: React.FC<Record<string, unknown>> = (rawProps) => {
  const props = rawProps as unknown as IconGridProps
  const { title, columns = 3, beats } = props
  const tokens = useThemeTokens()
  const items = normalizeItems(props.items)
  const phase1 = usePhase1Entry({ durationMs: 100 })
  const beatOffset = 0

  const cols = Math.max(1, Math.min(columns, items.length || columns))
  const cardWidth = cols === 2 ? 440 : cols === 4 ? 240 : 300
  const gridGap = 24

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

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: gridGap,
          justifyContent: "center",
          maxWidth: cols * cardWidth + (cols - 1) * gridGap + 40,
        }}
      >
        {items.map((item, i) => (
          <GridItemCard
            key={i}
            item={item}
            beat={beats?.[i + beatOffset] ?? null}
            index={i}
            tokens={tokens}
            cardWidth={cardWidth}
          />
        ))}
      </div>

      <MascotWatermark animation="idle" />
    </AbsoluteFill>
  )
}
