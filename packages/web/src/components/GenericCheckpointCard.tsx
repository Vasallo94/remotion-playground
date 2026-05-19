import { useState } from "react"
import { useAppTheme } from "../hooks/useAppTheme"
import { btnStyle } from "./btnStyle"

interface Props {
  data: Record<string, unknown>
  onApprove: () => void
  onRequestChanges: (feedback: string) => void
  disabled?: boolean
}

export function GenericCheckpointCard({ data, onApprove, onRequestChanges, disabled }: Props) {
  const { theme } = useAppTheme()
  const [feedback, setFeedback] = useState("")
  const [showFeedback, setShowFeedback] = useState(false)
  const [jsonExpanded, setJsonExpanded] = useState(false)
  const cpType = (data.type as string) || "checkpoint"

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
          {cpType.replace(/_/g, " ")}
        </h3>
      </div>

      <div
        onClick={() => setJsonExpanded(!jsonExpanded)}
        style={{
          padding: "8px 10px",
          backgroundColor: theme.colors.bg.primary,
          borderRadius: theme.radius.sm,
          fontFamily: theme.fonts.mono,
          fontSize: 11,
          color: theme.colors.text.secondary,
          cursor: "pointer",
          marginBottom: 14,
          maxHeight: jsonExpanded ? "none" : 120,
          overflow: "hidden",
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
        }}
      >
        <div style={{ color: theme.colors.text.muted, fontSize: 10, marginBottom: 4 }}>
          {jsonExpanded ? "▲ colapsar" : "▼ expandir JSON"}
        </div>
        {JSON.stringify(data, null, 2)}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => onApprove()} disabled={disabled} style={btnStyle(theme.colors.status.success, disabled)}>
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
            placeholder="Describe los cambios..."
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
              onRequestChanges(feedback)
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
    </div>
  )
}
