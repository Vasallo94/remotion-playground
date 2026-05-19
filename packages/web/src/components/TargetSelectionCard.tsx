import { useMemo, useState } from "react"
import type { ActiveVideoTarget, TargetSelectionData } from "../types"
import { useAppTheme } from "../hooks/useAppTheme"
import { btnStyle } from "./btnStyle"

interface Props {
  data: TargetSelectionData
  onApprove: (payload?: Record<string, unknown>) => void
  onRequestChanges: (feedback: string) => void
  disabled?: boolean
}

export function TargetSelectionCard({ data, onApprove, onRequestChanges, disabled }: Props) {
  const { theme } = useAppTheme()
  const candidates = data.candidates.filter((candidate) => !candidate.error)
  const [selectedPath, setSelectedPath] = useState(candidates[0]?.configPath ?? "")
  const selected = useMemo(
    () => candidates.find((candidate) => candidate.configPath === selectedPath),
    [candidates, selectedPath],
  )

  return (
    <div
      className="animate-card-reveal"
      style={{
        border: `1px solid ${theme.colors.border.accent}`,
        borderRadius: theme.radius.lg,
        padding: theme.spacing.lg,
        margin: "12px 0",
        backgroundColor: theme.colors.bg.elevated,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <div style={{ width: 3, height: 18, backgroundColor: theme.colors.accent.primary, borderRadius: 2 }} />
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: theme.colors.text.primary }}>
          Seleccionar target
        </h3>
        <span style={{ color: theme.colors.text.muted, fontSize: 11, fontFamily: theme.fonts.mono }}>{data.mode}</span>
      </div>

      <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
        {candidates.map((candidate) => (
          <label
            key={candidate.configPath}
            style={{
              display: "grid",
              gridTemplateColumns: "20px 1fr auto",
              gap: 8,
              alignItems: "center",
              padding: "8px 10px",
              borderRadius: theme.radius.md,
              border: `1px solid ${
                candidate.configPath === selectedPath ? theme.colors.border.accent : theme.colors.border.subtle
              }`,
              backgroundColor: theme.colors.bg.primary,
              cursor: "pointer",
            }}
          >
            <input
              type="radio"
              name="target"
              checked={candidate.configPath === selectedPath}
              onChange={() => setSelectedPath(candidate.configPath)}
            />
            <span>
              <span style={{ display: "block", color: theme.colors.text.primary, fontSize: 13, fontWeight: 600 }}>
                {candidate.title || candidate.configId || candidate.configPath}
              </span>
              <span
                style={{ display: "block", color: theme.colors.text.muted, fontSize: 11, fontFamily: theme.fonts.mono }}
              >
                {candidate.configPath}
              </span>
            </span>
            <span style={{ color: theme.colors.text.muted, fontSize: 11, fontFamily: theme.fonts.mono }}>
              {candidate.sceneCount ? `${candidate.sceneCount} escenas` : candidate.composition}
            </span>
          </label>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() => onApprove({ target: selected as ActiveVideoTarget })}
          disabled={disabled || !selected}
          style={btnStyle(theme.colors.status.success, disabled || !selected)}
        >
          Usar target
        </button>
        <button
          onClick={() => onRequestChanges("No quiero usar ninguno de estos targets. Muéstrame otras opciones.")}
          disabled={disabled}
          style={btnStyle(theme.colors.status.warning, disabled)}
        >
          Otros
        </button>
      </div>
    </div>
  )
}
