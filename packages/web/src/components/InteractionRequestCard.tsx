import { useMemo, useState } from "react"
import type { InteractionOption, InteractionRequestData } from "../types"
import { useAppTheme } from "../hooks/useAppTheme"
import { btnStyle } from "./btnStyle"

interface Props {
  data: InteractionRequestData
  onApprove: (payload?: Record<string, unknown>) => void
  onRequestChanges: (feedback: string) => void
  disabled?: boolean
}

function optionPayload(option: InteractionOption) {
  return {
    id: option.id,
    label: option.label,
    value: option.value,
    description: option.description,
  }
}

export function InteractionRequestCard({ data, onApprove, onRequestChanges, disabled }: Props) {
  const { theme } = useAppTheme()
  const input = data.input
  const [answer, setAnswer] = useState("")
  const [selected, setSelected] = useState(input.kind === "single_choice" ? (input.options[0]?.id ?? "") : "")
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [feedback, setFeedback] = useState("")
  const [showFeedback, setShowFeedback] = useState(false)

  const selectedOption = useMemo(() => {
    if (input.kind !== "single_choice") return undefined
    return input.options.find((option) => option.id === selected)
  }, [input, selected])

  const selectedOptions = useMemo(() => {
    if (input.kind !== "multi_choice") return []
    return input.options.filter((option) => checked.has(option.id))
  }, [checked, input])

  const canSubmit = useMemo(() => {
    if (disabled) return false
    if (input.kind === "text") return !input.required || answer.trim().length > 0
    if (input.kind === "single_choice") return Boolean(selectedOption)
    if (input.kind === "multi_choice") {
      const min = input.min ?? (input.required ? 1 : 0)
      const max = input.max ?? Number.POSITIVE_INFINITY
      return selectedOptions.length >= min && selectedOptions.length <= max
    }
    return true
  }, [answer, disabled, input, selectedOption, selectedOptions.length])

  const submit = () => {
    if (!canSubmit) return
    if (input.kind === "text") {
      onApprove({ approved: true, answer: answer.trim() })
    } else if (input.kind === "single_choice" && selectedOption) {
      onApprove({
        approved: true,
        selectedOption: optionPayload(selectedOption),
        selectedValue: selectedOption.value,
      })
    } else if (input.kind === "multi_choice") {
      onApprove({
        approved: true,
        selectedOptions: selectedOptions.map(optionPayload),
        selectedValues: selectedOptions.map((option) => option.value),
      })
    } else if (input.kind === "approval") {
      onApprove({ approved: true })
    }
  }

  const toggleChecked = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
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
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{ width: 3, height: 18, backgroundColor: theme.colors.accent.primary, borderRadius: 2 }} />
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: theme.colors.text.primary }}>{data.title}</h3>
        {data.intent && (
          <span style={{ color: theme.colors.text.muted, fontSize: 11, fontFamily: theme.fonts.mono }}>
            {data.intent}
          </span>
        )}
      </div>

      {data.body && (
        <p style={{ margin: "0 0 14px", color: theme.colors.text.secondary, fontSize: 13, lineHeight: 1.6 }}>
          {data.body}
        </p>
      )}

      {input.kind === "text" && (
        <textarea
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          placeholder={input.placeholder || "Escribe tu respuesta..."}
          disabled={disabled}
          style={{
            width: "100%",
            minHeight: 86,
            padding: 10,
            borderRadius: theme.radius.md,
            border: `1px solid ${theme.colors.border.default}`,
            backgroundColor: theme.colors.bg.primary,
            color: theme.colors.text.primary,
            fontSize: 13,
            lineHeight: 1.5,
            resize: "vertical",
            fontFamily: theme.fonts.sans,
            marginBottom: 12,
          }}
        />
      )}

      {input.kind === "single_choice" && (
        <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
          {input.options.map((option) => (
            <label
              key={option.id}
              style={{
                display: "grid",
                gridTemplateColumns: "20px 1fr",
                gap: 8,
                alignItems: "center",
                padding: "8px 10px",
                borderRadius: theme.radius.md,
                border: `1px solid ${selected === option.id ? theme.colors.border.accent : theme.colors.border.subtle}`,
                backgroundColor: theme.colors.bg.primary,
                cursor: disabled ? "default" : "pointer",
              }}
            >
              <input
                type="radio"
                name={`interaction-${data.title}`}
                checked={selected === option.id}
                disabled={disabled}
                onChange={() => setSelected(option.id)}
              />
              <span>
                <span style={{ display: "block", color: theme.colors.text.primary, fontSize: 13, fontWeight: 600 }}>
                  {option.label}
                </span>
                {option.description && (
                  <span style={{ display: "block", color: theme.colors.text.muted, fontSize: 12, lineHeight: 1.4 }}>
                    {option.description}
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>
      )}

      {input.kind === "multi_choice" && (
        <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
          {input.options.map((option) => (
            <label
              key={option.id}
              style={{
                display: "grid",
                gridTemplateColumns: "20px 1fr",
                gap: 8,
                alignItems: "center",
                padding: "8px 10px",
                borderRadius: theme.radius.md,
                border: `1px solid ${checked.has(option.id) ? theme.colors.border.accent : theme.colors.border.subtle}`,
                backgroundColor: theme.colors.bg.primary,
                cursor: disabled ? "default" : "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={checked.has(option.id)}
                disabled={disabled}
                onChange={() => toggleChecked(option.id)}
              />
              <span>
                <span style={{ display: "block", color: theme.colors.text.primary, fontSize: 13, fontWeight: 600 }}>
                  {option.label}
                </span>
                {option.description && (
                  <span style={{ display: "block", color: theme.colors.text.muted, fontSize: 12, lineHeight: 1.4 }}>
                    {option.description}
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={submit} disabled={!canSubmit} style={btnStyle(theme.colors.status.success, !canSubmit)}>
          {input.kind === "approval" ? input.approveLabel || "Aprobar" : "Enviar respuesta"}
        </button>
        {input.kind === "approval" && (
          <button
            onClick={() => setShowFeedback(!showFeedback)}
            disabled={disabled}
            style={btnStyle(theme.colors.status.warning, disabled)}
          >
            {input.rejectLabel || "Pedir cambios"}
          </button>
        )}
      </div>

      {input.kind === "approval" && showFeedback && (
        <div style={{ marginTop: 10 }}>
          <textarea
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
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
