import { useEffect, useRef } from "react"
import type { PipelineEvent } from "../types"
import { useAppTheme } from "../hooks/useAppTheme"

function formatTime(date: Date): string {
  return date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

export function EventLog({ events }: { events: PipelineEvent[] }) {
  const { theme } = useAppTheme()
  const bottomRef = useRef<HTMLLIElement>(null)

  const TYPE_COLORS: Record<PipelineEvent["type"], string> = {
    info: theme.colors.text.secondary,
    checkpoint: theme.colors.status.warning,
    success: theme.colors.status.success,
    error: theme.colors.status.error,
  }

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
        esperando instrucciones...
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
            display: "flex",
            gap: 8,
          }}
        >
          <span style={{ color: theme.colors.text.muted, flexShrink: 0 }}>{formatTime(event.timestamp)}</span>
          <span style={{ color: TYPE_COLORS[event.type] }}>{event.message}</span>
        </li>
      ))}
      <li ref={bottomRef} />
    </ul>
  )
}
