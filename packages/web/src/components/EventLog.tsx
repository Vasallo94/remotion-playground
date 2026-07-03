import { useEffect, useRef } from "react"
import type { PipelineEvent } from "../types"
import { theme } from "../theme"

function formatTime(date: Date): string {
  return date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

const TYPE_COLORS: Record<PipelineEvent["type"], string> = {
  info: theme.colors.text.secondary,
  checkpoint: theme.colors.status.warning,
  success: theme.colors.status.success,
  error: theme.colors.status.error,
}

const TYPE_LABELS: Record<PipelineEvent["type"], string> = {
  info: "info",
  checkpoint: "checkpoint",
  success: "ok",
  error: "error",
}

export function EventLog({ events }: { events: PipelineEvent[] }) {
  const bottomRef = useRef<HTMLLIElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [events.length])

  if (events.length === 0) {
    return (
      <div
        style={{
          padding: "12px 0",
          fontSize: 11,
          color: theme.colors.text.muted,
          fontFamily: theme.fonts.mono,
          fontStyle: "italic",
        }}
      >
        [--:--:--] [idle] esperando instrucciones...
      </div>
    )
  }

  return (
    <ul
      aria-label="Registro de eventos del pipeline"
      style={{ overflowY: "auto", flex: 1, minHeight: 0, listStyle: "none", margin: 0, padding: 0 }}
    >
      {events.map((event) => (
        <li
          key={event.id}
          className="animate-fade-in"
          style={{
            fontSize: 11,
            fontFamily: theme.fonts.mono,
            lineHeight: 1.7,
            display: "grid",
            gridTemplateColumns: "82px 88px 1fr",
            gap: 6,
          }}
        >
          <span style={{ color: theme.colors.text.muted, flexShrink: 0 }}>[{formatTime(event.timestamp)}]</span>
          <span style={{ color: TYPE_COLORS[event.type] }}>[{TYPE_LABELS[event.type]}]</span>
          <span style={{ color: theme.colors.text.secondary }}>{event.message}</span>
        </li>
      ))}
      <li ref={bottomRef} />
    </ul>
  )
}
