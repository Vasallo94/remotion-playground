import type { RevisionPlanData } from "../types"
import { useAppTheme } from "../hooks/useAppTheme"
import { btnStyle } from "./btnStyle"

interface Props {
  data: RevisionPlanData
  onApprove: () => void
  onRequestChanges: (feedback: string) => void
  disabled?: boolean
}

export function RevisionPlanCard({ data, onApprove, onRequestChanges, disabled }: Props) {
  const { theme } = useAppTheme()
  const targetTitle = String(
    data.target.title ?? data.target.configId ?? data.target.configPath ?? data.target.sourcePath ?? "target",
  )

  function list(items: string[]) {
    return (
      <ul style={{ margin: 0, paddingLeft: 18, color: theme.colors.text.secondary, fontSize: 12, lineHeight: 1.6 }}>
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    )
  }

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
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: theme.colors.text.primary }}>Plan de revisión</h3>
        {data.willRender && (
          <span style={{ color: theme.colors.status.success, fontSize: 11, fontFamily: theme.fonts.mono }}>
            render después
          </span>
        )}
      </div>

      <div style={{ fontSize: 12, color: theme.colors.text.secondary, fontFamily: theme.fonts.mono, marginBottom: 12 }}>
        target: {targetTitle}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <div>
          <div style={{ color: theme.colors.text.muted, fontSize: 11, fontWeight: 700, marginBottom: 6 }}>
            Cambios pedidos
          </div>
          {list(data.requestedChanges)}
        </div>
        <div>
          <div style={{ color: theme.colors.text.muted, fontSize: 11, fontWeight: 700, marginBottom: 6 }}>
            Edits propuestos
          </div>
          {list(data.proposedEdits)}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => onApprove()} disabled={disabled} style={btnStyle(theme.colors.status.success, disabled)}>
          Aprobar plan
        </button>
        <button
          onClick={() => onRequestChanges("Ajusta el plan antes de tocar el config.")}
          disabled={disabled}
          style={btnStyle(theme.colors.status.warning, disabled)}
        >
          Ajustar plan
        </button>
      </div>
    </div>
  )
}
