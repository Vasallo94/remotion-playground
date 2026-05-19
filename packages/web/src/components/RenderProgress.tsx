import { useAppTheme } from "../hooks/useAppTheme"

export function RenderProgress({ progress }: { progress: number }) {
  const { theme } = useAppTheme()
  return (
    <div className="animate-fade-in" style={{ margin: "12px 0" }}>
      <div style={{ fontSize: 12, color: theme.colors.text.secondary, marginBottom: 6, fontFamily: theme.fonts.mono }}>
        render: {progress}%
      </div>
      <div
        style={{
          width: "100%",
          height: 4,
          backgroundColor: theme.colors.border.default,
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${progress}%`,
            height: "100%",
            backgroundColor: theme.colors.accent.primary,
            borderRadius: 2,
            transition: "width 0.5s ease-in-out",
          }}
        />
      </div>
    </div>
  )
}
