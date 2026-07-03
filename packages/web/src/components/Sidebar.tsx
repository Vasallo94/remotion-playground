import type { PipelineEvent } from "../types"
import type { PlanState } from "../lib/planState"
import { theme } from "../theme"
import { PipelineStepper } from "./PipelineStepper"
import { EventLog } from "./EventLog"
import type { StoredThread } from "../lib/threadStorage"
import { ThreadList } from "./ThreadList"

interface Props {
  plan: PlanState | null
  isLoading: boolean
  hasError: boolean
  events: PipelineEvent[]
  threads: StoredThread[]
  currentThreadId: string | undefined
  onSelectThread: (threadId: string) => void
  onDeleteThread: (threadId: string) => void
  onNewThread: () => void
}

export function Sidebar({
  plan,
  isLoading,
  hasError,
  events,
  threads,
  currentThreadId,
  onSelectThread,
  onDeleteThread,
  onNewThread,
}: Props) {
  return (
    <div
      style={{
        width: 280,
        backgroundColor: "rgba(15, 21, 32, 0.92)",
        borderRight: `1px solid ${theme.colors.border.default}`,
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "16px 16px 12px", borderBottom: `1px solid ${theme.colors.border.default}` }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: theme.colors.text.muted,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: 14,
          }}
        >
          Pipeline
        </div>
        <PipelineStepper plan={plan} isLoading={isLoading} hasError={hasError} />
      </div>

      <div style={{ flex: 1, padding: "12px 16px", display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: theme.colors.text.muted,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: 8,
          }}
        >
          Log
        </div>
        <EventLog events={events} />
      </div>

      <div style={{ padding: "12px 16px", borderTop: `1px solid ${theme.colors.border.default}` }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: theme.colors.text.muted,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: 8,
          }}
        >
          Conversaciones
        </div>
        <ThreadList
          threads={threads}
          currentThreadId={currentThreadId}
          onSelect={onSelectThread}
          onDelete={onDeleteThread}
          onNew={onNewThread}
        />
      </div>
    </div>
  )
}
