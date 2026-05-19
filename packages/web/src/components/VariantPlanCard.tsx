import type { VariantPlanData } from "../types"
import { useAppTheme } from "../hooks/useAppTheme"
import { btnStyle } from "./btnStyle"

interface Props {
  data: VariantPlanData
  onApprove: () => void
  onRequestChanges: (feedback: string) => void
  disabled?: boolean
}

export function VariantPlanCard({ data, onApprove, onRequestChanges, disabled }: Props) {
  const { theme } = useAppTheme()
  const source = String(data.source.title ?? data.source.configId ?? data.source.configPath ?? "source")
  const variant = String(data.variant.title ?? data.variant.configId ?? data.variant.configPath ?? "variant")

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
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: theme.colors.text.primary }}>Plan de variante</h3>
      </div>

      <div style={{ fontSize: 12, color: theme.colors.text.secondary, fontFamily: theme.fonts.mono, marginBottom: 12 }}>
        {source} → {variant}
      </div>

      <ul
        style={{
          margin: "0 0 14px",
          paddingLeft: 18,
          color: theme.colors.text.secondary,
          fontSize: 12,
          lineHeight: 1.6,
        }}
      >
        {data.proposedChanges.map((change, index) => (
          <li key={index}>{change}</li>
        ))}
      </ul>

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => onApprove()} disabled={disabled} style={btnStyle(theme.colors.status.success, disabled)}>
          Crear variante
        </button>
        <button
          onClick={() => onRequestChanges("Ajusta el plan de variante antes de crear un config nuevo.")}
          disabled={disabled}
          style={btnStyle(theme.colors.status.warning, disabled)}
        >
          Ajustar plan
        </button>
      </div>
    </div>
  )
}
