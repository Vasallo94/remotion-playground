import { useState } from "react"
import type { AudioChartData, SoundChartData } from "../types"
import { useAppTheme } from "../hooks/useAppTheme"
import { btnStyle } from "./btnStyle"
import { asRecord, asString, getMusicBed, getSfxEntries, getSoundDesign, getVoiceoverEntries } from "./reviewData"

interface Props {
  data: SoundChartData | AudioChartData
  onApprove?: () => void
  onRequestChanges?: (feedback: string) => void
  disabled?: boolean
  compact?: boolean
}

export function SoundChartCard({ data, onApprove, onRequestChanges, disabled, compact }: Props) {
  const { theme } = useAppTheme()
  const [feedback, setFeedback] = useState("")
  const [showFeedback, setShowFeedback] = useState(false)
  const dataRecord = data as unknown as Record<string, unknown>
  const soundDesign = getSoundDesign(dataRecord)
  const musicBed = getMusicBed(soundDesign)
  const sfxEntries = getSfxEntries(soundDesign)
  const legacyMusicBed = asRecord((data as SoundChartData).music_bed)
  const legacySfx = (data as SoundChartData).sfx_entries ?? []
  const effectiveMusicBed = musicBed ?? legacyMusicBed
  const effectiveSfx = sfxEntries.length > 0 ? sfxEntries : legacySfx
  const voiceover = asRecord((data as AudioChartData).voiceover)
  const voiceoverEntries = getVoiceoverEntries(voiceover)
  const hasActions = Boolean(onApprove && onRequestChanges)

  return (
    <div
      className={compact ? undefined : "animate-card-reveal"}
      style={{
        border: `1px solid ${theme.colors.border.accent}`,
        borderRadius: theme.radius.lg,
        padding: compact ? theme.spacing.md : theme.spacing.lg,
        margin: compact ? "8px 0" : "12px 0",
        backgroundColor: theme.colors.bg.elevated,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <div style={{ width: 3, height: 18, backgroundColor: theme.colors.accent.primary, borderRadius: 2 }} />
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: theme.colors.text.primary }}>
          {data.type === "audio_chart_checkpoint" ? "Carta de audio" : "Carta de sonido"}
        </h3>
      </div>

      {voiceover && (
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
          <span style={{ color: theme.colors.text.muted }}>voz:</span> {asString(voiceover.voiceId) || "sin definir"}{" "}
          <span style={{ color: theme.colors.text.muted }}>provider:</span> {asString(voiceover.provider) || "n/a"}{" "}
          <span style={{ color: theme.colors.text.muted }}>idioma:</span> {asString(voiceover.language) || "n/a"}
        </div>
      )}

      {voiceoverEntries.length > 0 && (
        <div style={{ marginBottom: 12 }}>
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
            Guion de locucion
          </div>
          {voiceoverEntries.map((entry) => (
            <div
              key={entry.scene}
              style={{
                display: "grid",
                gridTemplateColumns: "48px 1fr",
                gap: 8,
                fontSize: 12,
                color: theme.colors.text.secondary,
                lineHeight: 1.5,
                padding: "5px 0",
                borderBottom: `1px solid ${theme.colors.border.subtle}`,
              }}
            >
              <span style={{ color: theme.colors.text.muted, fontFamily: theme.fonts.mono }}>#{entry.scene}</span>
              <span>{entry.text}</span>
            </div>
          ))}
        </div>
      )}

      {effectiveMusicBed && (
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
          <span style={{ color: theme.colors.text.muted }}>music_bed:</span>{" "}
          {asString(effectiveMusicBed.libraryId) || "custom"}{" "}
          <span style={{ color: theme.colors.text.muted }}>vol:</span> {String(effectiveMusicBed.volume ?? "n/a")}dB{" "}
          <span style={{ color: theme.colors.text.muted }}>ducking:</span>{" "}
          {String(effectiveMusicBed.duckingVolume ?? effectiveMusicBed.ducking_volume ?? "n/a")}dB
        </div>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: hasActions ? 12 : 0 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${theme.colors.border.default}` }}>
            {["SFX", "Trigger", "Escenas", "Vol"].map((h, i) => (
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
          {effectiveSfx.map((sfx) => (
            <tr key={String(sfx.id)} style={{ borderBottom: `1px solid ${theme.colors.border.subtle}` }}>
              <td
                style={{
                  padding: "6px 8px",
                  color: theme.colors.accent.primary,
                  fontFamily: theme.fonts.mono,
                  fontSize: 12,
                }}
              >
                {String(sfx.id ?? "-")}
              </td>
              <td style={{ padding: "6px 8px", color: theme.colors.text.primary }}>
                {String(sfx.trigger ?? sfx.prompt ?? "-")}
              </td>
              <td style={{ padding: "6px 8px", color: theme.colors.text.secondary, fontSize: 12 }}>
                {Array.isArray(sfx.sceneTypes) ? sfx.sceneTypes.join(", ") : "all"}
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
                {String(sfx.volume ?? "n/a")}dB
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {hasActions && (
        <div style={{ display: "flex", gap: 8 }}>
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
            Ajustar
          </button>
        </div>
      )}

      {showFeedback && hasActions && (
        <div style={{ marginTop: 10 }}>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Describe los ajustes de sonido..."
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
    </div>
  )
}
