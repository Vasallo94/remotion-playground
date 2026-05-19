import { useState } from "react"
import type { DirectionData } from "../types"
import { useAppTheme } from "../hooks/useAppTheme"
import { btnStyle } from "./btnStyle"
import { asArray, asRecord, getSceneTitle } from "./reviewData"

interface Props {
  data: DirectionData
  onApprove: () => void
  onRequestChanges: (feedback: string) => void
  disabled?: boolean
}

export function DirectionCard({ data, onApprove, onRequestChanges, disabled }: Props) {
  const { theme } = useAppTheme()
  const [feedback, setFeedback] = useState("")
  const [showFeedback, setShowFeedback] = useState(false)

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
          Direccion editorial
        </h3>
      </div>

      <div style={{ fontSize: 13, color: theme.colors.text.secondary, marginBottom: 12 }}>
        {data.scenes.length} escenas con timing y beats narrativos
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 14 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${theme.colors.border.default}` }}>
            {["#", "Escena", "Timing", "Beats"].map((h) => (
              <th
                key={h}
                style={{
                  padding: "6px 8px",
                  textAlign: "left",
                  color: theme.colors.text.muted,
                  fontWeight: 500,
                  fontSize: 11,
                  textTransform: "uppercase" as const,
                  letterSpacing: "0.05em",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.scenes.map((scene, index) => {
            const sceneRecord = scene as Record<string, unknown>
            const timing = asRecord(sceneRecord.timing)
            const beats = asArray(sceneRecord.beats)
            return (
              <tr key={index} style={{ borderBottom: `1px solid ${theme.colors.border.subtle}` }}>
                <td style={{ padding: "6px 8px", color: theme.colors.text.muted, fontFamily: theme.fonts.mono }}>
                  {String(index + 1).padStart(2, "0")}
                </td>
                <td style={{ padding: "6px 8px", color: theme.colors.text.primary }}>{getSceneTitle(sceneRecord)}</td>
                <td style={{ padding: "6px 8px", color: theme.colors.text.secondary, fontSize: 12 }}>
                  {timing
                    ? [
                        timing.leadInMs ? `in ${timing.leadInMs}ms` : "",
                        timing.audioStartMs ? `voz ${timing.audioStartMs}ms` : "",
                        timing.tailHoldMs ? `hold ${timing.tailHoldMs}ms` : "",
                      ]
                        .filter(Boolean)
                        .join(" · ") || "definido"
                    : "-"}
                </td>
                <td style={{ padding: "6px 8px", color: theme.colors.text.secondary, fontSize: 12 }}>
                  {beats.length > 0 ? `${beats.length} beats` : "-"}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {data.warnings.length > 0 && (
        <div
          style={{
            padding: "10px 12px",
            backgroundColor: theme.colors.status.warning + "14",
            borderRadius: theme.radius.md,
            border: `1px solid ${theme.colors.status.warning + "33"}`,
            marginBottom: 14,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: theme.colors.status.warning,
              marginBottom: 6,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Avisos del director
          </div>
          {data.warnings.map((w, i) => (
            <div key={i} style={{ fontSize: 12, color: theme.colors.text.secondary, marginBottom: 4, lineHeight: 1.5 }}>
              - {w}
            </div>
          ))}
        </div>
      )}

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
            placeholder="Describe los ajustes de timing o ritmo..."
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
