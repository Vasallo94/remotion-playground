export const theme = {
  colors: {
    bg: {
      primary: "#0A0E15",
      secondary: "#0F1520",
      elevated: "#121826",
      hover: "#182031",
    },
    accent: {
      primary: "#F0524A",
      primaryHover: "#FF6A60",
      primaryMuted: "rgba(240, 82, 74, 0.12)",
      primaryGlow: "rgba(240, 82, 74, 0.22)",
    },
    text: {
      primary: "#E6E4DC",
      secondary: "#B9C0CE",
      muted: "#8A92A0",
      inverse: "#0A0E15",
    },
    border: {
      default: "#1F2634",
      accent: "#F0524A",
      subtle: "#161D2A",
      high: "#2E3850",
    },
    status: {
      success: "#7CDEB1",
      warning: "#D9A441",
      error: "#F0524A",
    },
  },
  fonts: {
    serif: "'Computer Modern Serif', Georgia, 'Times New Roman', serif",
    sans: "'Computer Modern Sans', 'Helvetica Neue', Arial, sans-serif",
    mono: "'Computer Modern Typewriter', 'SFMono-Regular', Consolas, monospace",
  },
  radius: { sm: 0, md: 0, lg: 0, xl: 0 },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
} as const
