import { theme } from "../theme"

function CinturonMini() {
  return (
    <svg width="34" height="20" viewBox="0 0 72 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <line x1="10" y1="30" x2="62" y2="10" stroke={theme.colors.border.high} strokeWidth="1.5" />
      <circle cx="10" cy="30" r="3.5" fill={theme.colors.text.primary} />
      <circle cx="36" cy="20" r="3.5" fill={theme.colors.text.primary} />
      <circle cx="62" cy="10" r="3.5" fill={theme.colors.accent.primary} />
    </svg>
  )
}

interface Props {
  label: string
}

export function WorkingIndicator({ label }: Props) {
  return (
    <div className="animate-slide-in" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
      <div
        style={{
          padding: "10px 14px",
          backgroundColor: theme.colors.bg.elevated,
          border: `1px solid ${theme.colors.border.default}`,
          borderLeft: `2px solid ${theme.colors.accent.primary}`,
          fontSize: 13,
          color: theme.colors.text.secondary,
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontFamily: theme.fonts.mono,
        }}
      >
        <CinturonMini />
        <span>[run]</span>
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
