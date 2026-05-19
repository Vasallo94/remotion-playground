import { useAppTheme } from "../hooks/useAppTheme"

export function ClapperboardIcon({ size = 28 }: { size?: number } = {}) {
  const { theme } = useAppTheme()
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Board body */}
      <rect
        x="3"
        y="12"
        width="22"
        height="13"
        rx="2"
        fill={theme.colors.bg.hover}
        stroke={theme.colors.text.muted}
        strokeWidth="1.5"
      />

      {/* Stripes on body */}
      <line x1="10" y1="12" x2="10" y2="25" stroke={theme.colors.border.default} strokeWidth="1" />
      <line x1="17" y1="12" x2="17" y2="25" stroke={theme.colors.border.default} strokeWidth="1" />

      {/* Clapper arm — hinges from left, animated via CSS class */}
      <g className="clapper-arm" style={{ transformOrigin: "3px 12px" }}>
        <rect
          x="3"
          y="7"
          width="22"
          height="5"
          rx="1"
          fill={theme.colors.accent.primary}
          stroke={theme.colors.accent.primary}
          strokeWidth="0.5"
        />
        {/* Diagonal stripes on clapper */}
        <line x1="8" y1="7" x2="6" y2="12" stroke={theme.colors.bg.primary} strokeWidth="1.5" />
        <line x1="13" y1="7" x2="11" y2="12" stroke={theme.colors.bg.primary} strokeWidth="1.5" />
        <line x1="18" y1="7" x2="16" y2="12" stroke={theme.colors.bg.primary} strokeWidth="1.5" />
        <line x1="23" y1="7" x2="21" y2="12" stroke={theme.colors.bg.primary} strokeWidth="1.5" />
      </g>

      {/* Hinge circle */}
      <circle cx="5" cy="12" r="2" fill={theme.colors.text.muted} />
    </svg>
  )
}

interface Props {
  label: string
}

export function WorkingIndicator({ label }: Props) {
  const { theme } = useAppTheme()
  return (
    <div className="animate-slide-in" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
      <div
        style={{
          padding: "10px 14px",
          borderRadius: "12px 12px 12px 2px",
          backgroundColor: theme.colors.bg.elevated,
          border: `1px solid ${theme.colors.border.default}`,
          fontSize: 13,
          color: theme.colors.text.secondary,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <ClapperboardIcon />
        <span>{label}</span>
        <span style={{ display: "flex", gap: 3 }}>
          <span className="loading-dot" />
          <span className="loading-dot" />
          <span className="loading-dot" />
        </span>
      </div>
    </div>
  )
}
