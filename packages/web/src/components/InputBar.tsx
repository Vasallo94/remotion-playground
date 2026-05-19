import { useAppTheme } from "../hooks/useAppTheme"
import type { ActiveVideoTarget } from "../types"

interface Props {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  disabled: boolean
  activeTarget?: ActiveVideoTarget | null
}

const TARGET_ACTIONS = [
  "Audita este video",
  "Renderiza otra vez",
  "Mejora el ritmo",
  "Regenera la voz",
  "Haz una version corta",
]

export function InputBar({ value, onChange, onSend, disabled, activeTarget }: Props) {
  const { theme } = useAppTheme()
  return (
    <div
      style={{
        padding: "12px 16px",
        borderTop: `1px solid ${theme.colors.border.default}`,
        flexShrink: 0,
      }}
    >
      {activeTarget && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <span style={{ color: theme.colors.text.muted, fontSize: 11, fontFamily: theme.fonts.mono }}>target</span>
          <span style={{ color: theme.colors.text.secondary, fontSize: 12 }}>
            {activeTarget.title || activeTarget.configId || activeTarget.configPath}
          </span>
          {TARGET_ACTIONS.map((action) => (
            <button
              key={action}
              type="button"
              onClick={() => onChange(action)}
              disabled={disabled}
              style={{
                padding: "4px 7px",
                borderRadius: theme.radius.sm,
                border: `1px solid ${theme.colors.border.subtle}`,
                backgroundColor: theme.colors.bg.elevated,
                color: theme.colors.text.secondary,
                fontSize: 11,
                cursor: disabled ? "not-allowed" : "pointer",
              }}
            >
              {action}
            </button>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) onSend()
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSend()
          }}
          aria-label="Mensaje para generar video"
          placeholder={
            activeTarget ? "Pide una revision, auditoria, render o variante..." : "Describe el video que necesitas..."
          }
          disabled={disabled}
          style={{
            flex: 1,
            padding: "10px 14px",
            borderRadius: theme.radius.md,
            border: `1px solid ${theme.colors.border.default}`,
            backgroundColor: theme.colors.bg.elevated,
            color: theme.colors.text.primary,
            fontSize: 14,
            fontFamily: theme.fonts.sans,
            outline: "none",
            transition: "border-color 150ms",
          }}
          onFocus={(e) => (e.target.style.borderColor = theme.colors.accent.primary)}
          onBlur={(e) => (e.target.style.borderColor = theme.colors.border.default)}
        />
        <button
          onClick={onSend}
          disabled={disabled || !value.trim()}
          aria-label="Enviar mensaje"
          style={{
            padding: "10px 20px",
            backgroundColor: theme.colors.accent.primary,
            color: "#fff",
            border: "none",
            borderRadius: theme.radius.md,
            cursor: disabled || !value.trim() ? "not-allowed" : "pointer",
            fontSize: 14,
            fontWeight: 500,
            opacity: disabled || !value.trim() ? 0.5 : 1,
            transition: "opacity 150ms, background-color 150ms",
          }}
          onMouseEnter={(e) => {
            if (!disabled && value.trim()) e.currentTarget.style.backgroundColor = theme.colors.accent.primaryHover
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = theme.colors.accent.primary
          }}
        >
          Enviar
        </button>
      </div>
    </div>
  )
}
