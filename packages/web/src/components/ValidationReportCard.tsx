import { useState } from "react"
import type { ValidationReportData } from "../types"
import { useAppTheme } from "../hooks/useAppTheme"
import { btnStyle } from "./btnStyle"
import type { AppTheme } from "../theme"

interface Props {
  data: ValidationReportData
  onApprove?: () => void
  onRequestChanges?: (feedback: string) => void
  disabled?: boolean
  compact?: boolean
}

function IssueGroup({
  title,
  items,
  color,
  theme,
}: {
  title: string
  items: string[]
  color: string
  theme: AppTheme
}) {
  if (items.length === 0) return null
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color,
          marginBottom: 6,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {title} ({items.length})
      </div>
      {items.map((item, index) => (
        <div key={index} style={{ fontSize: 12, color: theme.colors.text.secondary, lineHeight: 1.5, marginBottom: 4 }}>
          - {item}
        </div>
      ))}
    </div>
  )
}

export function ValidationReportCard({ data, onApprove, onRequestChanges, disabled, compact }: Props) {
  const { theme } = useAppTheme()
  const [feedback, setFeedback] = useState("")
  const [showFeedback, setShowFeedback] = useState(false)
  const hasActions = Boolean(onApprove && onRequestChanges)
  const isClean = data.errors.length === 0 && data.warnings.length === 0 && data.recommendations.length === 0

  return (
    <div
      className={compact ? undefined : "animate-card-reveal"}
      style={{
        border: `1px solid ${data.errors.length > 0 ? theme.colors.status.error : theme.colors.border.accent}`,
        borderRadius: theme.radius.lg,
        padding: compact ? theme.spacing.md : theme.spacing.lg,
        margin: compact ? "8px 0" : "12px 0",
        backgroundColor: theme.colors.bg.elevated,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <div
          style={{
            width: 3,
            height: 18,
            backgroundColor: data.errors.length > 0 ? theme.colors.status.error : theme.colors.status.success,
            borderRadius: 2,
          }}
        />
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: theme.colors.text.primary }}>
          Validacion del pipeline
        </h3>
      </div>

      {isClean ? (
        <div style={{ fontSize: 13, color: theme.colors.status.success }}>Sin errores, avisos ni recomendaciones.</div>
      ) : (
        <>
          <IssueGroup title="Errores" items={data.errors} color={theme.colors.status.error} theme={theme} />
          <IssueGroup title="Avisos" items={data.warnings} color={theme.colors.status.warning} theme={theme} />
          <IssueGroup
            title="Recomendaciones"
            items={data.recommendations}
            color={theme.colors.text.secondary}
            theme={theme}
          />
        </>
      )}

      {hasActions && (
        <>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              onClick={() => onApprove?.()}
              disabled={disabled}
              style={btnStyle(theme.colors.status.success, disabled)}
            >
              Aprobar
            </button>
            <button
              onClick={() => setShowFeedback(!showFeedback)}
              disabled={disabled}
              style={btnStyle(theme.colors.status.warning, disabled)}
            >
              Pedir cambios
            </button>
          </div>

          {showFeedback && (
            <div style={{ marginTop: 10 }}>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Describe que debe corregir el agente..."
                style={{
                  width: "100%",
                  padding: 10,
                  borderRadius: theme.radius.md,
                  border: `1px solid ${theme.colors.border.default}`,
                  backgroundColor: theme.colors.bg.primary,
                  color: theme.colors.text.primary,
                  fontSize: 13,
                  minHeight: 60,
                  resize: "vertical",
                  fontFamily: theme.fonts.sans,
                }}
              />
              <button
                onClick={() => {
                  onRequestChanges?.(feedback)
                  setFeedback("")
                  setShowFeedback(false)
                }}
                disabled={disabled || !feedback.trim()}
                style={{ ...btnStyle(theme.colors.accent.primary, disabled || !feedback.trim()), marginTop: 6 }}
              >
                Enviar feedback
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
