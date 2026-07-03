import { useMemo, useState, type CSSProperties } from "react"
import type { ScriptCheckpointData } from "../types"
import { theme } from "../theme"
import { btnStyle } from "./btnStyle"

interface Props {
  data: ScriptCheckpointData
  onApprove: (payload?: Record<string, unknown>) => void
  onRequestChanges: (feedback: string) => void
  disabled?: boolean
}

type EditableScene = ScriptCheckpointData["scenes"][number]

function cloneScenes(scenes: EditableScene[]): EditableScene[] {
  return scenes.map((scene) => ({ ...scene }))
}

export function ScriptCard({ data, onApprove, onRequestChanges, disabled }: Props) {
  const [title, setTitle] = useState(data.title)
  const [objective, setObjective] = useState(data.objective)
  const [audience, setAudience] = useState(data.audience ?? "")
  const [tone, setTone] = useState(data.tone ?? "")
  const [notes, setNotes] = useState(data.notes ?? "")
  const [scenes, setScenes] = useState(() => cloneScenes(data.scenes))
  const [feedback, setFeedback] = useState("")
  const [showFeedback, setShowFeedback] = useState(false)

  const totalDuration = useMemo(
    () => scenes.reduce((sum, scene) => sum + Number(scene.durationInSeconds || 0), 0),
    [scenes],
  )

  const updateScene = (index: number, patch: Partial<EditableScene>) => {
    setScenes((current) => current.map((scene, sceneIndex) => (sceneIndex === index ? { ...scene, ...patch } : scene)))
  }

  const approve = () => {
    onApprove({
      script: {
        title,
        objective,
        audience: audience || undefined,
        tone: tone || undefined,
        estimatedDurationSeconds: totalDuration,
        notes: notes || undefined,
        scenes,
      },
    })
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
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: theme.colors.text.primary }}>Guion editable</h3>
      </div>

      <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
        <label style={{ display: "grid", gap: 4, fontSize: 12, color: theme.colors.text.muted }}>
          Título
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={disabled}
            style={inputStyle()}
          />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 12, color: theme.colors.text.muted }}>
          Objetivo
          <textarea
            value={objective}
            onChange={(event) => setObjective(event.target.value)}
            disabled={disabled}
            style={{ ...inputStyle(), minHeight: 56, resize: "vertical" }}
          />
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label style={{ display: "grid", gap: 4, fontSize: 12, color: theme.colors.text.muted }}>
            Audiencia
            <input
              value={audience}
              onChange={(event) => setAudience(event.target.value)}
              disabled={disabled}
              style={inputStyle()}
            />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12, color: theme.colors.text.muted }}>
            Tono
            <input
              value={tone}
              onChange={(event) => setTone(event.target.value)}
              disabled={disabled}
              style={inputStyle()}
            />
          </label>
        </div>
      </div>

      <div
        style={{
          color: theme.colors.text.muted,
          fontSize: 11,
          fontWeight: 700,
          marginBottom: 8,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        Escenas ({totalDuration}s)
      </div>

      <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
        {scenes.map((scene, index) => (
          <div
            key={scene.id || index}
            style={{
              border: `1px solid ${theme.colors.border.subtle}`,
              borderRadius: theme.radius.md,
              padding: 10,
              backgroundColor: theme.colors.bg.primary,
            }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "42px 1fr 88px", gap: 8, marginBottom: 8 }}>
              <div style={{ fontFamily: theme.fonts.mono, color: theme.colors.text.muted, paddingTop: 8 }}>
                {String(index + 1).padStart(2, "0")}
              </div>
              <input
                value={scene.title ?? ""}
                onChange={(event) => updateScene(index, { title: event.target.value })}
                disabled={disabled}
                placeholder={scene.type}
                style={inputStyle()}
              />
              <input
                value={scene.durationInSeconds}
                type="number"
                min={1}
                max={120}
                onChange={(event) => updateScene(index, { durationInSeconds: Number(event.target.value) })}
                disabled={disabled}
                style={inputStyle()}
              />
            </div>
            <textarea
              value={scene.voiceover ?? ""}
              onChange={(event) => updateScene(index, { voiceover: event.target.value })}
              disabled={disabled}
              placeholder="Voiceover de la escena"
              style={{ ...inputStyle(), minHeight: 58, resize: "vertical", marginBottom: 8 }}
            />
            <textarea
              value={scene.visualNotes ?? ""}
              onChange={(event) => updateScene(index, { visualNotes: event.target.value })}
              disabled={disabled}
              placeholder="Notas visuales"
              style={{ ...inputStyle(), minHeight: 48, resize: "vertical" }}
            />
          </div>
        ))}
      </div>

      <textarea
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        disabled={disabled}
        placeholder="Notas generales opcionales"
        style={{ ...inputStyle(), minHeight: 52, resize: "vertical", marginBottom: 12 }}
      />

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={approve} disabled={disabled} style={btnStyle(theme.colors.status.success, disabled)}>
          Aprobar guion
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
            onChange={(event) => setFeedback(event.target.value)}
            placeholder="Describe los cambios que quieres..."
            style={{ ...inputStyle(), minHeight: 60, resize: "vertical" }}
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

function inputStyle(): CSSProperties {
  return {
    width: "100%",
    padding: "8px 10px",
    borderRadius: theme.radius.sm,
    border: `1px solid ${theme.colors.border.default}`,
    backgroundColor: theme.colors.bg.primary,
    color: theme.colors.text.primary,
    fontSize: 13,
    fontFamily: theme.fonts.sans,
  }
}
