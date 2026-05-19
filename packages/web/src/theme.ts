export interface AppTheme {
  fonts: {
    sans: string
    mono: string
  }
  radius: { sm: number; md: number; lg: number; xl: number }
  spacing: { xs: number; sm: number; md: number; lg: number; xl: number; xxl: number }
  colors: {
    bg: { primary: string; secondary: string; elevated: string; hover: string }
    accent: { primary: string; primaryHover: string; primaryMuted: string; primaryGlow: string }
    text: { primary: string; secondary: string; muted: string; inverse: string }
    border: { default: string; accent: string; subtle: string }
    status: { success: string; warning: string; error: string }
  }
}

export const darkTheme: AppTheme = {
  fonts: {
    sans: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    mono: "'JetBrains Mono', 'Cascadia Code', monospace",
  },
  radius: { sm: 4, md: 8, lg: 12, xl: 16 },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  colors: {
    bg: { primary: "#0D0D0D", secondary: "#141414", elevated: "#1A1A1A", hover: "#242424" },
    accent: {
      primary: "#CC3333",
      primaryHover: "#E63939",
      primaryMuted: "rgba(204, 51, 51, 0.15)",
      primaryGlow: "rgba(204, 51, 51, 0.3)",
    },
    text: { primary: "#E8E8E8", secondary: "#888888", muted: "#555555", inverse: "#0D0D0D" },
    border: { default: "#2A2A2A", accent: "#CC3333", subtle: "#1E1E1E" },
    status: { success: "#22C55E", warning: "#F59E0B", error: "#EF4444" },
  },
}

export const lightTheme: AppTheme = {
  fonts: {
    sans: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    mono: "'JetBrains Mono', 'Cascadia Code', monospace",
  },
  radius: { sm: 4, md: 8, lg: 12, xl: 16 },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  colors: {
    bg: { primary: "#F5F5F5", secondary: "#FFFFFF", elevated: "#EBEBEB", hover: "#E0E0E0" },
    accent: {
      primary: "#CC3333",
      primaryHover: "#B02828",
      primaryMuted: "rgba(204, 51, 51, 0.10)",
      primaryGlow: "rgba(204, 51, 51, 0.20)",
    },
    text: { primary: "#141414", secondary: "#555555", muted: "#999999", inverse: "#F5F5F5" },
    border: { default: "#D8D8D8", accent: "#CC3333", subtle: "#E8E8E8" },
    status: { success: "#16A34A", warning: "#D97706", error: "#DC2626" },
  },
}

// Keep backward compat for any non-migrated files
export const theme = darkTheme
