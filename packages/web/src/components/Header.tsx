import { useAppTheme } from "../hooks/useAppTheme"
import type { ActiveVideoTarget, StoredVideoArtifact } from "../types"

interface Props {
  artifacts?: StoredVideoArtifact[]
  activeTarget?: ActiveVideoTarget | null
  onSelectTarget?: (target: StoredVideoArtifact | null) => void
}

export function Header({ artifacts = [], activeTarget, onSelectTarget }: Props) {
  const { theme, mode, toggle } = useAppTheme()
  return (
    <header
      style={{
        padding: "14px 20px",
        borderBottom: `1px solid ${theme.colors.border.default}`,
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexShrink: 0,
      }}
    >
      <div style={{ width: 3, height: 20, backgroundColor: theme.colors.accent.primary, borderRadius: 2 }} />
      <span style={{ fontSize: 16, fontWeight: 600, color: theme.colors.text.primary, letterSpacing: "-0.01em" }}>
        Video Generator
      </span>
      <span style={{ fontSize: 12, color: theme.colors.text.muted, fontFamily: theme.fonts.mono, marginLeft: 4 }}>
        mission control
      </span>
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, color: theme.colors.text.muted, fontFamily: theme.fonts.mono }}>target</span>
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
            borderRadius: theme.radius.sm,
            padding: "6px 8px",
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
        <button
          onClick={toggle}
          title={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          style={{
            background: "none",
            border: `1px solid ${theme.colors.border.default}`,
            borderRadius: theme.radius.sm,
            padding: "6px 10px",
            cursor: "pointer",
            color: theme.colors.text.secondary,
            fontSize: 14,
            lineHeight: 1,
          }}
        >
          {mode === "dark" ? "☀" : "◑"}
        </button>
      </div>
    </header>
  )
}
