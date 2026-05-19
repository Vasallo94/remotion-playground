import { useAppTheme } from "../hooks/useAppTheme"

const AGENT_LABELS: Record<string, string> = {
  researcher: "Investigando",
  copywriter: "Escribiendo guion",
  scene_creator: "Creando escena",
  director: "Dirigiendo",
  sound_engineer: "Disenando sonido",
}

export function SubagentBadge({ agentName }: { agentName: string }) {
  const { theme } = useAppTheme()
  const label = AGENT_LABELS[agentName] ?? agentName

  return (
    <div
      className="animate-fade-in"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 14px",
        borderRadius: 20,
        backgroundColor: theme.colors.accent.primaryMuted,
        border: `1px solid ${theme.colors.accent.primary}`,
        fontSize: 13,
        color: theme.colors.accent.primary,
        fontWeight: 500,
      }}
    >
      <span
        className="animate-pulse"
        style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: theme.colors.accent.primary }}
      />
      <span>{label}...</span>
    </div>
  )
}
