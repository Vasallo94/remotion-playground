import { useState } from "react"
import type { CheckpointData } from "../types"
import { useAppTheme } from "../hooks/useAppTheme"
import { btnStyle } from "./btnStyle"
import { getSceneScript, getSceneTitle } from "./reviewData"

interface Props {
  data: CheckpointData
  onApprove: () => void
  onRequestChanges: (feedback: string) => void
  disabled?: boolean
}

export function CheckpointCard({ data, onApprove, onRequestChanges, disabled }: Props) {
  const { theme } = useAppTheme()
  const [feedback, setFeedback] = useState("")
  const [showFeedback, setShowFeedback] = useState(false)
  const totalDuration = data.scenes.reduce((sum, s) => sum + (s.durationInSeconds || 0), 0)
  const scenesWithScript = data.scenes
    .map((scene, index) => ({ index, text: getSceneScript(scene as Record<string, unknown>) }))
    .filter((entry) => entry.text)

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
          Escaleta propuesta
        </h3>
      </div>

      {data.brief && (
        <div
          style={{
            fontSize: 12,
            color: theme.colors.text.secondary,
            marginBottom: 12,
            padding: "8px 10px",
            backgroundColor: theme.colors.bg.primary,
            borderRadius: theme.radius.sm,
            fontFamily: theme.fonts.mono,
          }}
        >
          <span style={{ color: theme.colors.text.muted }}>plataforma:</span> {data.brief.platform}
          {" | "}
          <span style={{ color: theme.colors.text.muted }}>audiencia:</span> {data.brief.audience}
          {" | "}
          <span style={{ color: theme.colors.text.muted }}>tono:</span> {data.brief.tone}
        </div>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 12 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${theme.colors.border.default}` }}>
            {["#", "Tipo", "Contenido", "Dur."].map((h, i) => (
              <th
                key={h}
                style={{
                  padding: "6px 8px",
                  textAlign: i === 3 ? "right" : "left",
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
          {data.scenes.map((scene, i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${theme.colors.border.subtle}` }}>
              <td
                style={{
                  padding: "6px 8px",
                  fontFamily: theme.fonts.mono,
                  color: theme.colors.text.muted,
                  fontSize: 12,
                }}
              >
                {String(i + 1).padStart(2, "0")}
              </td>
              <td
                style={{
                  padding: "6px 8px",
                  color: theme.colors.accent.primary,
                  fontFamily: theme.fonts.mono,
                  fontSize: 12,
                }}
              >
                {scene.type}
              </td>
              <td style={{ padding: "6px 8px", color: theme.colors.text.primary }}>
                {getSceneTitle(scene as Record<string, unknown>)}
              </td>
              <td
                style={{
                  padding: "6px 8px",
                  textAlign: "right",
                  fontFamily: theme.fonts.mono,
                  color: theme.colors.text.secondary,
                  fontSize: 12,
                }}
              >
                {scene.durationInSeconds}s
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ fontSize: 12, color: theme.colors.text.secondary, marginBottom: 14, fontFamily: theme.fonts.mono }}>
        total: {totalDuration}s / {data.scenes.length} escenas
      </div>

      {scenesWithScript.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div
            style={{
              color: theme.colors.text.muted,
              fontSize: 11,
              fontWeight: 700,
              marginBottom: 6,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Guion disponible
          </div>
          {scenesWithScript.map((entry) => (
            <div
              key={entry.index}
              style={{
                display: "grid",
                gridTemplateColumns: "42px 1fr",
                gap: 8,
                color: theme.colors.text.secondary,
                fontSize: 12,
                lineHeight: 1.5,
                padding: "5px 0",
                borderBottom: `1px solid ${theme.colors.border.subtle}`,
              }}
            >
              <span style={{ color: theme.colors.text.muted, fontFamily: theme.fonts.mono }}>
                {String(entry.index + 1).padStart(2, "0")}
              </span>
              <span>{entry.text}</span>
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
            placeholder="Describe los cambios que quieres..."
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
