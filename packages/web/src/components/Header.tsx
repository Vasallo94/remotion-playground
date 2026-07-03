import { theme } from "../theme"
import type { ActiveVideoTarget, StoredVideoArtifact } from "../types"

interface Props {
  artifacts?: StoredVideoArtifact[]
  activeTarget?: ActiveVideoTarget | null
  onSelectTarget?: (target: StoredVideoArtifact | null) => void
}

function CinturonMark({ width = 54 }: { width?: number }) {
  return (
    <svg width={width} height={(width * 40) / 72} viewBox="0 0 72 40" aria-hidden="true" style={{ flexShrink: 0 }}>
      <line x1="10" y1="30" x2="62" y2="10" stroke={theme.colors.border.high} strokeWidth="1" />
      <circle cx="10" cy="30" r="3.5" fill={theme.colors.text.primary} />
      <circle cx="36" cy="20" r="3.5" fill={theme.colors.text.primary} />
      <circle cx="62" cy="10" r="3.5" fill={theme.colors.accent.primary} />
    </svg>
  )
}

export function Header({ artifacts = [], activeTarget, onSelectTarget }: Props) {
  return (
    <header
      style={{
        padding: "14px 20px",
        borderBottom: `1px solid ${theme.colors.border.default}`,
        backgroundColor: "rgba(10, 14, 21, 0.86)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexShrink: 0,
      }}
    >
      <CinturonMark />
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <span
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: theme.colors.text.primary,
            letterSpacing: "0.02em",
            fontFamily: theme.fonts.serif,
          }}
        >
          Claqueta
        </span>
        <span
          style={{
            fontSize: 10,
            color: theme.colors.text.muted,
            fontFamily: theme.fonts.mono,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          observo · mido · construyo
        </span>
      </div>
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            fontSize: 10,
            color: theme.colors.text.muted,
            fontFamily: theme.fonts.mono,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          target
        </span>
        <select
          value={activeTarget?.configPath ?? ""}
          onChange={(event) => {
            const selected = artifacts.find((artifact) => artifact.configPath === event.target.value)
            onSelectTarget?.(selected ?? null)
          }}
          style={{
            minWidth: 220,
            maxWidth: 360,
            backgroundColor: theme.colors.bg.elevated,
            color: theme.colors.text.secondary,
            border: `1px solid ${theme.colors.border.default}`,
            padding: "7px 8px",
            fontSize: 12,
            fontFamily: theme.fonts.mono,
          }}
        >
          <option value="">Sin target activo</option>
          {artifacts.map((artifact) => (
            <option key={artifact.id} value={artifact.configPath}>
              {artifact.source === "render" ? "render · " : ""}
              {artifact.title || artifact.configId || artifact.configPath}
            </option>
          ))}
        </select>
      </div>
    </header>
  )
}
