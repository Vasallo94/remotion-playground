import { theme } from "../theme"

const AGENT_LABELS: Record<string, string> = {
  researcher: "Investigando",
  copywriter: "Escribiendo guion",
  scene_creator: "Creando escena",
  director: "Dirigiendo",
  sound_engineer: "Disenando sonido",
}

export function SubagentBadge({ agentName }: { agentName: string }) {
  const label = AGENT_LABELS[agentName] ?? agentName

  return (
    <div
      className="animate-fade-in"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 14px",
        backgroundColor: theme.colors.accent.primaryMuted,
        border: `1px solid ${theme.colors.accent.primary}`,
        fontSize: 13,
        color: theme.colors.accent.primary,
        fontWeight: 700,
        fontFamily: theme.fonts.mono,
      }}
    >
      <span className="animate-pulse" style={{ width: 6, height: 10, backgroundColor: theme.colors.accent.primary }} />
      <span>{label}...</span>
    </div>
  )
}
