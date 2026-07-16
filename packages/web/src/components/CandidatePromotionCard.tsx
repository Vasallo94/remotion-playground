/* eslint-disable @remotion/warn-native-media-tag -- Browser UI previews are not rendered by Remotion. */
import { useState } from "react"
import { AGENT_PI_URL } from "../api"
import { theme } from "../theme"
import { btnStyle } from "./btnStyle"

interface PromotionFile {
  path?: string
  bytes?: number
  sha256?: string
}

interface StageReport {
  status?: string
  durationMs?: number
  errors?: string[]
}

interface PreviewStill {
  index?: number
  path?: string
  frameNumber?: number
  sha256?: string
}

interface Props {
  data: Record<string, unknown>
  onApprove: () => void
  onRequestChanges: (feedback: string) => void
  disabled?: boolean
}

export function CandidatePromotionCard({ data, onApprove, onRequestChanges, disabled }: Props) {
  const [feedback, setFeedback] = useState("")
  const [showFeedback, setShowFeedback] = useState(false)
  const candidateId = String(data.candidateId ?? "")
  const componentId = String(data.componentId ?? "")
  const reports = (data.reports ?? {}) as Record<string, StageReport>
  const sourceFiles = Array.isArray(data.sourceFiles) ? (data.sourceFiles as PromotionFile[]) : []
  const registryOutputs = Array.isArray(data.registryOutputs) ? (data.registryOutputs as PromotionFile[]) : []
  const previews = Array.isArray(data.previewStills) ? (data.previewStills as PreviewStill[]) : []
  const stages = ["format", "typecheck", "lint", "bundle", "still"]

  return (
    <div
      style={{
        border: `1px solid ${theme.colors.border.accent}`,
        borderRadius: theme.radius.lg,
        padding: theme.spacing.lg,
        margin: "12px 0",
        backgroundColor: theme.colors.bg.elevated,
      }}
    >
      <div style={{ fontFamily: theme.fonts.mono, fontSize: 11, color: theme.colors.accent.primary }}>
        PROMOCIÓN TIER 2 · DECISIÓN SEPARADA DE CP4
      </div>
      <h3 style={{ color: theme.colors.text.primary, margin: "8px 0 4px", fontSize: 18 }}>{componentId}</h3>
      <div style={{ color: theme.colors.text.muted, fontSize: 12, marginBottom: 14 }}>{candidateId}</div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 6, marginBottom: 14 }}>
        {stages.map((stage) => {
          const report = reports[stage]
          const passed = report?.status === "passed"
          return (
            <div
              key={stage}
              style={{
                border: `1px solid ${passed ? theme.colors.status.success : theme.colors.status.warning}`,
                borderRadius: theme.radius.sm,
                padding: "7px 5px",
                textAlign: "center",
                color: passed ? theme.colors.status.success : theme.colors.status.warning,
                fontFamily: theme.fonts.mono,
                fontSize: 10,
              }}
              title={(report?.errors ?? []).join("\n")}
            >
              {stage}
              <br />
              {report?.status ?? "missing"}
            </div>
          )
        })}
      </div>

      {previews.map((preview) => {
        const pathParts = typeof preview.path === "string" ? preview.path.split("/") : []
        const fileName = pathParts.length > 0 ? pathParts[pathParts.length - 1] : null
        if (!fileName || !candidateId) return null
        return (
          <div key={`${preview.index}-${preview.sha256}`} style={{ marginBottom: 14 }}>
            <img
              src={`${AGENT_PI_URL}/api/pi/candidate-preview/${encodeURIComponent(candidateId)}/${encodeURIComponent(fileName)}`}
              alt={`Still de cuarentena ${preview.index ?? 0}`}
              style={{
                width: "100%",
                borderRadius: theme.radius.md,
                border: `1px solid ${theme.colors.border.default}`,
              }}
            />
            <div style={{ fontFamily: theme.fonts.mono, color: theme.colors.text.muted, fontSize: 10, marginTop: 4 }}>
              frame {preview.frameNumber ?? "?"} · {String(preview.sha256 ?? "").slice(0, 16)}…
            </div>
          </div>
        )
      })}

      <div style={{ color: theme.colors.text.secondary, fontSize: 12, marginBottom: 12 }}>
        {[...sourceFiles, ...registryOutputs].map((file) => (
          <div key={file.path} style={{ fontFamily: theme.fonts.mono, marginBottom: 3 }}>
            {file.path} <span style={{ color: theme.colors.text.muted }}>({file.bytes ?? "?"} bytes)</span>
          </div>
        ))}
      </div>

      <div style={{ color: theme.colors.status.warning, fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>
        Aprobar escribirá únicamente estos destinos mediante la transacción durable del padre. CP4 no autoriza esta
        acción.
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => onApprove()} disabled={disabled} style={btnStyle(theme.colors.status.success, disabled)}>
          Promover componente
        </button>
        <button
          onClick={() => setShowFeedback(!showFeedback)}
          disabled={disabled}
          style={btnStyle(theme.colors.status.warning, disabled)}
        >
          Rechazar promoción
        </button>
      </div>

      {showFeedback && (
        <div style={{ marginTop: 10 }}>
          <textarea
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            placeholder="Motivo del rechazo o cambios necesarios"
            style={{
              width: "100%",
              minHeight: 70,
              padding: 10,
              borderRadius: theme.radius.md,
              border: `1px solid ${theme.colors.border.default}`,
              background: theme.colors.bg.primary,
              color: theme.colors.text.primary,
            }}
          />
          <button
            onClick={() => onRequestChanges(feedback)}
            disabled={disabled || !feedback.trim()}
            style={{ ...btnStyle(theme.colors.accent.primary, disabled || !feedback.trim()), marginTop: 6 }}
          >
            Confirmar rechazo
          </button>
        </div>
      )}
    </div>
  )
}
