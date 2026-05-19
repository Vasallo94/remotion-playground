import { useAppTheme } from "../hooks/useAppTheme"
import type { StoredThread } from "../lib/threadStorage"

interface Props {
  threads: StoredThread[]
  currentThreadId: string | undefined
  onSelect: (threadId: string) => void
  onDelete: (threadId: string) => void
  onNew: () => void
}

export function ThreadList({ threads, currentThreadId, onSelect, onDelete, onNew }: Props) {
  const { theme } = useAppTheme()
  return (
    <div>
      <button
        onClick={onNew}
        style={{
          width: "100%",
          padding: "8px 12px",
          backgroundColor: theme.colors.accent.primary,
          color: "#fff",
          border: "none",
          borderRadius: theme.radius.md,
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 500,
          marginBottom: 8,
        }}
      >
        + Nueva conversacion
      </button>
      {threads.map((t) => (
        <div
          key={t.threadId}
          onClick={() => onSelect(t.threadId)}
          style={{
            padding: "8px 10px",
            borderRadius: theme.radius.sm,
            cursor: "pointer",
            backgroundColor: t.threadId === currentThreadId ? theme.colors.bg.hover : "transparent",
            borderLeft:
              t.threadId === currentThreadId ? `2px solid ${theme.colors.accent.primary}` : "2px solid transparent",
            marginBottom: 2,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ overflow: "hidden" }}>
            <div
              style={{
                fontSize: 12,
                color: theme.colors.text.primary,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: 160,
              }}
            >
              {t.title || "Sin titulo"}
            </div>
            <div style={{ fontSize: 10, color: theme.colors.text.muted }}>
              {new Date(t.lastActiveAt).toLocaleDateString()}
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete(t.threadId)
            }}
            style={{
              background: "none",
              border: "none",
              color: theme.colors.text.muted,
              cursor: "pointer",
              fontSize: 14,
              padding: "2px 4px",
            }}
            aria-label="Eliminar conversacion"
          >
            x
          </button>
        </div>
      ))}
    </div>
  )
}
