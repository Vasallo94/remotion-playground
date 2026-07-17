import { useState } from "react"
import { theme } from "../theme"
import { btnStyle } from "./btnStyle"
import { asArray, asRecord, asString } from "./reviewData"

interface Props {
  data: Record<string, unknown>
  onApprove: () => void
  onRequestChanges: (feedback: string) => void
  disabled?: boolean
}

function displayValue(value: unknown): string {
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return ""
}

function checkpointTitle(checkpointType: string, isClarification: boolean): string {
  if (isClarification) return "Necesitamos una aclaración"
  const titles: Record<string, string> = {
    qa_report_checkpoint: "Revisión visual",
    final_review_checkpoint: "Revisión final del render",
    capability_gap_checkpoint: "Decisión de capacidad visual",
    visual_recipe_adoption_checkpoint: "Adopción de receta visual",
    candidate_promotion_checkpoint: "Promoción de componente",
  }
  return titles[checkpointType] ?? (checkpointType ? checkpointType.replace(/_/g, " ") : "Revisión pendiente")
}

export function buildGenericCheckpointPresentation(data: Record<string, unknown>) {
  const questions = asArray(data.questions)
    .map(asRecord)
    .filter((question): question is Record<string, unknown> => Boolean(question))
  const isClarification = questions.length > 0
  const checkpointType = asString(data.checkpointType) || asString(data.type)
  const technicalData = { ...data }
  delete technicalData.registry
  return {
    checkpointType,
    questions,
    isClarification,
    technicalData,
    summary: asString(data.summary),
    title: checkpointTitle(checkpointType, isClarification),
  }
}

export function GenericCheckpointCard({ data, onApprove, onRequestChanges, disabled }: Props) {
  const { checkpointType, questions, isClarification, technicalData, summary, title } =
    buildGenericCheckpointPresentation(data)
  const finalReview = checkpointType === "final_review_checkpoint"
  const reviewVideo = asRecord(data.video)
  const reviewDuration = asRecord(data.duration)
  const reviewWarnings = asArray(data.warnings).map(asString).filter(Boolean)
  const [feedback, setFeedback] = useState("")
  const [showFeedback, setShowFeedback] = useState(isClarification)

  const answerForm = showFeedback && (
    <div style={{ marginTop: 10 }}>
      <textarea
        value={feedback}
        onChange={(event) => setFeedback(event.target.value)}
        placeholder={isClarification ? "Escribe tu respuesta…" : "Describe los cambios…"}
        aria-label={isClarification ? "Respuesta a la aclaración" : "Feedback del checkpoint"}
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
          if (!isClarification) setShowFeedback(false)
        }}
        disabled={disabled || !feedback.trim()}
        style={{ ...btnStyle(theme.colors.accent.primary, disabled || !feedback.trim()), marginTop: 6 }}
      >
        {isClarification ? "Responder" : "Enviar feedback"}
      </button>
    </div>
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
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: theme.colors.text.primary }}>{title}</h3>
      </div>

      {isClarification && (
        <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
          {questions.map((question, index) => {
            const requested = displayValue(question.requested)
            const supported = asArray(question.supported).map(displayValue).filter(Boolean)
            return (
              <div
                key={`${asString(question.field)}-${index}`}
                style={{
                  padding: "12px 14px",
                  backgroundColor: theme.colors.bg.primary,
                  border: `1px solid ${theme.colors.border.default}`,
                  borderRadius: theme.radius.md,
                }}
              >
                <div style={{ color: theme.colors.text.primary, fontSize: 14, lineHeight: 1.45 }}>
                  {asString(question.question) || "¿Qué valor debemos usar?"}
                </div>
                {requested && (
                  <div style={{ marginTop: 8, color: theme.colors.text.secondary, fontSize: 12 }}>
                    <span style={{ color: theme.colors.text.muted }}>Solicitado:</span> {requested}
                  </div>
                )}
                {supported.length > 0 && (
                  <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ color: theme.colors.text.muted, fontSize: 12 }}>Opciones disponibles:</span>
                    {supported.map((value) => (
                      <code
                        key={value}
                        style={{
                          color: theme.colors.accent.primary,
                          backgroundColor: theme.colors.bg.elevated,
                          border: `1px solid ${theme.colors.border.subtle}`,
                          borderRadius: theme.radius.sm,
                          padding: "2px 6px",
                          fontSize: 12,
                        }}
                      >
                        {value}
                      </code>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {!isClarification && summary && (
        <p style={{ color: theme.colors.text.secondary, fontSize: 13, lineHeight: 1.5, margin: "0 0 12px" }}>
          {summary}
        </p>
      )}

      {finalReview && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 8,
            marginBottom: 12,
          }}
        >
          {[
            ["Resultado", data.passed === true ? "Correcto" : "Requiere revisión"],
            [
              "Vídeo",
              [
                displayValue(reviewVideo?.codec),
                reviewVideo?.width && reviewVideo?.height ? `${reviewVideo.width}×${reviewVideo.height}` : "",
              ]
                .filter(Boolean)
                .join(" · "),
            ],
            ["Fotogramas", reviewVideo?.fps ? `${reviewVideo.fps} fps` : ""],
            [
              "Duración",
              reviewDuration?.actualSeconds
                ? `${Number(reviewDuration.actualSeconds).toFixed(2)} s de ${displayValue(reviewDuration.expectedSeconds)} s`
                : "",
            ],
          ].map(([label, value]) => (
            <div
              key={label}
              style={{
                padding: "9px 10px",
                backgroundColor: theme.colors.bg.primary,
                borderRadius: theme.radius.sm,
                border: `1px solid ${theme.colors.border.subtle}`,
              }}
            >
              <div style={{ color: theme.colors.text.muted, fontSize: 10, textTransform: "uppercase" }}>{label}</div>
              <div style={{ color: theme.colors.text.primary, fontSize: 13, marginTop: 3 }}>{value || "—"}</div>
            </div>
          ))}
          {reviewWarnings.length > 0 && (
            <div
              style={{
                gridColumn: "1 / -1",
                color: theme.colors.status.warning,
                fontSize: 12,
                lineHeight: 1.45,
              }}
            >
              {reviewWarnings.join(" · ")}
            </div>
          )}
        </div>
      )}

      <details style={{ marginBottom: 14 }}>
        <summary style={{ color: theme.colors.text.muted, fontSize: 11, cursor: "pointer" }}>Detalles técnicos</summary>
        <pre
          style={{
            padding: "8px 10px",
            backgroundColor: theme.colors.bg.primary,
            borderRadius: theme.radius.sm,
            fontFamily: theme.fonts.mono,
            fontSize: 11,
            color: theme.colors.text.secondary,
            overflow: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {JSON.stringify(technicalData, null, 2)}
        </pre>
      </details>

      {!isClarification && (
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => onApprove()}
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
      )}

      {answerForm}
    </div>
  )
}
