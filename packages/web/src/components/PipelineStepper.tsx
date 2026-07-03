import { type PlanState, modeLabel, stepLabel } from "../lib/planState"
import { theme } from "../theme"

interface Props {
  plan: PlanState | null
  isLoading: boolean
  hasError: boolean
}

function dotColor(status: string, isLoading: boolean): string {
  switch (status) {
    case "completed":
    case "skipped":
      return theme.colors.status.success
    case "in_progress":
      return isLoading ? theme.colors.accent.primary : theme.colors.status.warning
    case "blocked":
    case "failed":
      return theme.colors.status.error
    default:
      return theme.colors.text.muted
  }
}

function lineColor(status: string): string {
  return status === "completed" || status === "skipped" ? theme.colors.status.success : theme.colors.border.default
}

export function PipelineStepper({ plan, isLoading, hasError }: Props) {
  if (!plan) {
    if (isLoading) {
      return (
        <div style={{ fontSize: 12, color: theme.colors.accent.primary, fontStyle: "italic", padding: "4px 0" }}>
          Iniciando pipeline...
        </div>
      )
    }
    return (
      <div style={{ fontSize: 12, color: theme.colors.text.muted, fontStyle: "italic", padding: "4px 0" }}>
        Esperando instrucciones...
      </div>
    )
  }

  const allDone = !isLoading && plan.steps.every((s) => s.status === "completed" || s.status === "skipped")
  const hasBlocker = plan.steps.some((s) => s.status === "blocked" || s.status === "failed")

  return (
    <div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: theme.colors.accent.primary,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: 10,
          fontFamily: theme.fonts.mono,
        }}
      >
        {modeLabel(plan.mode)}
      </div>

      <div role="list" aria-label="Etapas del pipeline" style={{ padding: "0 4px" }}>
        {plan.steps.map((step, i) => {
          const isLast = i === plan.steps.length - 1
          const isActive = step.status === "in_progress"
          const isDone = step.status === "completed" || step.status === "skipped"

          return (
            <div
              key={step.id}
              role="listitem"
              aria-current={isActive ? "step" : undefined}
              style={{ display: "flex", gap: 12 }}
            >
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 20 }}>
                <div
                  className={isActive && isLoading ? "animate-pulse" : undefined}
                  style={{
                    width: 12,
                    height: 12,
                    backgroundColor: dotColor(step.status, isLoading),
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "background-color 300ms",
                  }}
                >
                  {isDone && (
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                      <path
                        d="M1.5 4L3 5.5L6.5 2"
                        stroke={theme.colors.text.inverse}
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>
                {!isLast && (
                  <div
                    style={{
                      width: 2,
                      flex: 1,
                      minHeight: 20,
                      backgroundColor: lineColor(step.status),
                      transition: "background-color 300ms",
                    }}
                  />
                )}
              </div>
              <div style={{ paddingBottom: isLast ? 0 : 12, minHeight: 32 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: isActive ? 600 : 400,
                    color: step.status === "pending" ? theme.colors.text.muted : theme.colors.text.primary,
                    lineHeight: "12px",
                    transition: "color 300ms",
                  }}
                >
                  {stepLabel(step)}
                </div>
                {isActive && (
                  <div
                    style={{
                      fontSize: 11,
                      color: theme.colors.accent.primary,
                      marginTop: 3,
                      fontFamily: theme.fonts.mono,
                    }}
                  >
                    en curso...
                  </div>
                )}
                {(step.status === "blocked" || step.status === "failed") && (
                  <div
                    style={{
                      fontSize: 11,
                      color: theme.colors.status.error,
                      marginTop: 3,
                      fontFamily: theme.fonts.mono,
                    }}
                  >
                    {step.blockers.length > 0 ? step.blockers[0] : "bloqueado"}
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {allDone && !hasError && (
          <div
            className="animate-fade-in"
            style={{
              marginTop: 8,
              padding: "6px 10px",
              borderRadius: theme.radius.sm,
              backgroundColor: "rgba(124, 222, 177, 0.08)",
              border: `1px solid ${theme.colors.status.success}`,
            }}
          >
            <div style={{ fontSize: 12, color: theme.colors.status.success, fontWeight: 500 }}>Completado</div>
          </div>
        )}

        {hasError && (
          <div
            className="animate-fade-in"
            style={{
              marginTop: 8,
              padding: "6px 10px",
              borderRadius: theme.radius.sm,
              backgroundColor: "rgba(240, 82, 74, 0.08)",
              border: `1px solid ${theme.colors.status.error}`,
            }}
          >
            <div style={{ fontSize: 12, color: theme.colors.status.error, fontWeight: 500 }}>Error</div>
          </div>
        )}

        {hasBlocker && !hasError && (
          <div
            className="animate-fade-in"
            style={{
              marginTop: 8,
              padding: "6px 10px",
              borderRadius: theme.radius.sm,
              backgroundColor: "rgba(240, 82, 74, 0.08)",
              border: `1px solid ${theme.colors.status.error}`,
            }}
          >
            <div style={{ fontSize: 12, color: theme.colors.status.error, fontWeight: 500 }}>Bloqueado</div>
          </div>
        )}
      </div>
    </div>
  )
}
