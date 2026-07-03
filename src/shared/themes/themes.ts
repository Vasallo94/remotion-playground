// Shared Remotion theme tokens
import { loadFont } from "@remotion/google-fonts/JetBrainsMono"
import { useTheme } from "./ThemeContext"
import type { ThemeName } from "../../compositions/ClaudeCodeTutorial/schema"

export type { ThemeName }

const { fontFamily: monoFont } = loadFont("normal", { weights: ["400", "700"] })

export type ThemeTokens = {
  // Backgrounds
  background: string
  backgroundGradient: string
  // Foreground
  foreground: string
  foregroundMid: string
  foregroundLow: string
  // Brand
  primary: string
  primaryForeground: string
  secondary: string
  // Typography
  fontFamily: string
  monoFontFamily: string
  fontFaces?: Array<{
    family: string
    file: string
    weight?: string
    style?: string
  }>
  radius: number
  // Terminal
  terminal: {
    sceneBackground: string
    bg: string
    titleBar: string
    titleText: string
    command: string
    output: string
    claude: string
    shadow: string
    dots: [string, string, string]
    labelColor: string
    successColor: string
    statusBarBg: string
    borderColor: string
    separatorColor: string
    costColor: string
    userMessageBg: string
    userMessageBorder: string
  }
  // Cards / Callouts
  card: {
    bg: string
    bgGradient: string
    border: string
    accentBorder: string
    shadow: string
  }
  // Mascot
  mascot: {
    show: boolean
    cornerScale: number
    cornerOpacity: number
    cornerBottom: number
    cornerRight: number
  }
  // Overlay
  overlay: string
  // Optional brand ornaments
  constellation?: {
    showIntro: boolean
    lineColor: string
    starColor: string
    accentStarColor: string
    opacity: number
  }
  watermark?: {
    type: "pixel-logo" | "cinturon"
    opacity: number
    bottom: number
    right: number
    scale: number
  }
  // Labels
  label: string
  labelColor: string
  // Accent line (intro decoration)
  accentLine: string
}

const defaultTheme: ThemeTokens = {
  background: "#0d1117",
  backgroundGradient: "linear-gradient(135deg, #0d1117 0%, #161b22 100%)",
  foreground: "#f0f6fc",
  foregroundMid: "#8b949e",
  foregroundLow: "#484f58",
  primary: "#7ee787",
  primaryForeground: "#0d1117",
  secondary: "#79c0ff",
  fontFamily: "system-ui, sans-serif",
  monoFontFamily: monoFont,
  radius: 10,
  terminal: {
    sceneBackground: "#0d1117",
    bg: "#0d1117",
    titleBar: "#21262d",
    titleText: "#6e7681",
    command: "#7ee787",
    output: "#c9d1d9",
    claude: "#79c0ff",
    shadow: "0 20px 60px rgba(0,0,0,0.6)",
    dots: ["#ff5f57", "#febc2e", "#28c840"],
    labelColor: "#8b949e",
    successColor: "#7ee787",
    statusBarBg: "#161b22",
    borderColor: "#30363d",
    separatorColor: "#30363d",
    costColor: "#484f58",
    userMessageBg: "#161b22",
    userMessageBorder: "#30363d",
  },
  card: {
    bg: "#161b22",
    bgGradient: "linear-gradient(135deg, #161b22 0%, #21262d 100%)",
    border: "#30363d",
    accentBorder: "#7ee787",
    shadow: "0 12px 40px rgba(0,0,0,0.5)",
  },
  mascot: {
    show: false,
    cornerScale: 0.5,
    cornerOpacity: 0.7,
    cornerBottom: 20,
    cornerRight: 24,
  },
  overlay: "rgba(0,0,0,0.65)",
  label: "Claude Code \u00B7 Tutorial",
  labelColor: "#484f58",
  accentLine: "linear-gradient(90deg, #7ee787, #79c0ff)",
}

const lineaDirectaTheme: ThemeTokens = {
  background: "#FFFFFF",
  backgroundGradient: "#FFFFFF",
  foreground: "#1A1A1A",
  foregroundMid: "#888888",
  foregroundLow: "#555555",
  primary: "#CC3333",
  primaryForeground: "#FFFFFF",
  secondary: "#225050",
  fontFamily: "Arial, Helvetica, sans-serif",
  monoFontFamily: monoFont,
  radius: 10,
  terminal: {
    sceneBackground: "radial-gradient(ellipse at 50% 60%, #2d1c22 0%, #141014 100%)",
    bg: "#0d0d0d",
    titleBar: "#1a1a1a",
    titleText: "#666666",
    command: "#e0e0e0",
    output: "#d4d4d4",
    claude: "#C15F3C",
    shadow: "0 8px 30px rgba(0,0,0,0.3)",
    dots: ["#ff5f57", "#febc2e", "#28c840"],
    labelColor: "#888888",
    successColor: "#6a9955",
    statusBarBg: "#111111",
    borderColor: "#333333",
    separatorColor: "#333333",
    costColor: "#666666",
    userMessageBg: "#111111",
    userMessageBorder: "#333333",
  },
  card: {
    bg: "#FFFFFF",
    bgGradient: "#FFFFFF",
    border: "#EFEFEF",
    accentBorder: "#CC3333",
    shadow: "0 4px 20px rgba(0,0,0,0.08)",
  },
  mascot: {
    show: true,
    cornerScale: 0.5,
    cornerOpacity: 0.7,
    cornerBottom: 20,
    cornerRight: 24,
  },
  overlay: "rgba(255,255,255,0.85)",
  label: "L\u00EDnea Directa \u00B7 Claude Code",
  labelColor: "#CC3333",
  accentLine: "#CC3333",
}

const atomDarkTheme: ThemeTokens = {
  background: "#282c34",
  backgroundGradient: "linear-gradient(135deg, #282c34 0%, #21252b 100%)",
  foreground: "#abb2bf",
  foregroundMid: "#636d83",
  foregroundLow: "#4b5263",
  primary: "#61afef",
  primaryForeground: "#282c34",
  secondary: "#c678dd",
  fontFamily: "system-ui, sans-serif",
  monoFontFamily: monoFont,
  radius: 10,
  terminal: {
    sceneBackground: "#21252b",
    bg: "#282c34",
    titleBar: "#21252b",
    titleText: "#636d83",
    command: "#98c379",
    output: "#abb2bf",
    claude: "#61afef",
    shadow: "0 20px 60px rgba(0,0,0,0.5)",
    dots: ["#e06c75", "#d19a66", "#98c379"],
    labelColor: "#636d83",
    successColor: "#98c379",
    statusBarBg: "#21252b",
    borderColor: "#3e4451",
    separatorColor: "#3e4451",
    costColor: "#4b5263",
    userMessageBg: "#2c313a",
    userMessageBorder: "#3e4451",
  },
  card: {
    bg: "#2c313a",
    bgGradient: "linear-gradient(135deg, #2c313a 0%, #282c34 100%)",
    border: "#3e4451",
    accentBorder: "#61afef",
    shadow: "0 12px 40px rgba(0,0,0,0.4)",
  },
  mascot: {
    show: false,
    cornerScale: 0.5,
    cornerOpacity: 0.7,
    cornerBottom: 20,
    cornerRight: 24,
  },
  overlay: "rgba(33,37,43,0.85)",
  label: "Claude Code · Tutorial",
  labelColor: "#636d83",
  accentLine: "linear-gradient(90deg, #61afef, #c678dd)",
}

const hAlphaTheme: ThemeTokens = {
  background: "#f4f1e8",
  backgroundGradient: "radial-gradient(ellipse at 50% 28%, #fbf9f3 0%, #f4f1e8 72%)",
  foreground: "#16232c",
  foregroundMid: "#586a72",
  foregroundLow: "#8a979e",
  primary: "#d94332",
  primaryForeground: "#fffdfa",
  secondary: "#2c7782",
  fontFamily: '"Times New Roman", Georgia, "DejaVu Serif", ui-serif, serif',
  monoFontFamily: monoFont,
  radius: 10,
  terminal: {
    sceneBackground: "#14313f",
    bg: "#14313f",
    titleBar: "#1b3d4d",
    titleText: "#7fa6b0",
    command: "#f4f1e8",
    output: "#d7e0e2",
    claude: "#e58a7d",
    shadow: "0 14px 34px rgba(22,31,38,0.18)",
    dots: ["#d94332", "#e0a93b", "#2c7782"],
    labelColor: "#586a72",
    successColor: "#2c7782",
    statusBarBg: "#0f2630",
    borderColor: "#2a4a57",
    separatorColor: "#2a4a57",
    costColor: "#7fa6b0",
    userMessageBg: "#1b3d4d",
    userMessageBorder: "#2a4a57",
  },
  card: {
    bg: "#fffdfa",
    bgGradient: "linear-gradient(180deg, #fffdfa 0%, #f7f4ec 100%)",
    border: "#d5d8d2",
    accentBorder: "#d94332",
    shadow: "0 14px 34px rgba(22,31,38,0.09)",
  },
  mascot: {
    show: false,
    cornerScale: 0.5,
    cornerOpacity: 0.7,
    cornerBottom: 20,
    cornerRight: 24,
  },
  overlay: "rgba(244,241,232,0.85)",
  label: "H-alpha · Física solar",
  labelColor: "#9d241c",
  accentLine: "linear-gradient(90deg, #d94332, #2c7782)",
}

const claquetaTheme: ThemeTokens = {
  background: "#0d0c0b",
  backgroundGradient: "radial-gradient(ellipse at 50% 35%, #1a1612 0%, #0d0c0b 70%)",
  foreground: "#f5efe0",
  foregroundMid: "#a89a82",
  foregroundLow: "#5f574a",
  primary: "#ffb347",
  primaryForeground: "#0d0c0b",
  secondary: "#e8dcc3",
  fontFamily: 'Georgia, "Times New Roman", ui-serif, serif',
  monoFontFamily: monoFont,
  radius: 10,
  terminal: {
    sceneBackground: "radial-gradient(ellipse at 50% 30%, #1a1612 0%, #0d0c0b 75%)",
    bg: "#14110e",
    titleBar: "#1f1a14",
    titleText: "#8a7c64",
    command: "#f5efe0",
    output: "#cfc4ac",
    claude: "#ffb347",
    shadow: "0 24px 70px rgba(0,0,0,0.75)",
    dots: ["#ff5f57", "#febc2e", "#28c840"],
    labelColor: "#a89a82",
    successColor: "#c9a44d",
    statusBarBg: "#110e0b",
    borderColor: "#332b20",
    separatorColor: "#332b20",
    costColor: "#5f574a",
    userMessageBg: "#1a1612",
    userMessageBorder: "#332b20",
  },
  card: {
    bg: "#171310",
    bgGradient: "linear-gradient(160deg, #1d1813 0%, #12100d 100%)",
    border: "#332b20",
    accentBorder: "#ffb347",
    shadow: "0 16px 50px rgba(0,0,0,0.6)",
  },
  mascot: {
    show: false,
    cornerScale: 0.5,
    cornerOpacity: 0.7,
    cornerBottom: 20,
    cornerRight: 24,
  },
  overlay: "rgba(13,12,11,0.82)",
  label: "Claqueta · se presenta",
  labelColor: "#ffb347",
  accentLine: "linear-gradient(90deg, #ffb347, #e8dcc3)",
}

const betelgeuseFontFaces: NonNullable<ThemeTokens["fontFaces"]> = [
  { family: "Computer Modern Serif", file: "fonts/computer-modern/cmunrm.woff", weight: "400" },
  { family: "Computer Modern Serif", file: "fonts/computer-modern/cmunbx.woff", weight: "700" },
  { family: "Computer Modern Serif", file: "fonts/computer-modern/cmunit.woff", weight: "400", style: "italic" },
  { family: "Computer Modern Sans", file: "fonts/computer-modern/cmunss.woff", weight: "400" },
  { family: "Computer Modern Sans", file: "fonts/computer-modern/cmunsx.woff", weight: "700" },
  { family: "Computer Modern Typewriter", file: "fonts/computer-modern/cmuntt.woff", weight: "400" },
  { family: "Computer Modern Typewriter", file: "fonts/computer-modern/cmuntx.woff", weight: "700" },
]

const betelgeuseTheme: ThemeTokens = {
  background: "#0A0E15",
  backgroundGradient:
    "radial-gradient(circle at 78% 22%, rgba(240,82,74,0.14) 0 1.2px, transparent 1.8px), radial-gradient(circle at 22% 18%, rgba(230,228,220,0.12) 0 1px, transparent 1.6px), radial-gradient(ellipse at 50% 35%, #121826 0%, #0A0E15 70%)",
  foreground: "#E6E4DC",
  foregroundMid: "#8A92A0",
  foregroundLow: "#4C5668",
  primary: "#F0524A",
  primaryForeground: "#0A0E15",
  secondary: "#B9C0CE",
  fontFamily: '"Computer Modern Serif", Georgia, "Times New Roman", ui-serif, serif',
  monoFontFamily: '"Computer Modern Typewriter", "SFMono-Regular", Consolas, monospace',
  fontFaces: betelgeuseFontFaces,
  radius: 0,
  terminal: {
    sceneBackground:
      "radial-gradient(circle at 82% 20%, rgba(240,82,74,0.16) 0 1px, transparent 1.8px), radial-gradient(ellipse at 50% 32%, #121826 0%, #0A0E15 72%)",
    bg: "#0F1520",
    titleBar: "#121826",
    titleText: "#8A92A0",
    command: "#E6E4DC",
    output: "#B9C0CE",
    claude: "#F0524A",
    shadow: "none",
    dots: ["#E6E4DC", "#8A92A0", "#F0524A"],
    labelColor: "#8A92A0",
    successColor: "#7CDEB1",
    statusBarBg: "#0A0E15",
    borderColor: "#2E3850",
    separatorColor: "#1F2634",
    costColor: "#8A92A0",
    userMessageBg: "rgba(240,82,74,0.08)",
    userMessageBorder: "#F0524A",
  },
  card: {
    bg: "#121826",
    bgGradient: "#121826",
    border: "#2E3850",
    accentBorder: "#F0524A",
    shadow: "none",
  },
  mascot: {
    show: false,
    cornerScale: 0.5,
    cornerOpacity: 0.7,
    cornerBottom: 20,
    cornerRight: 24,
  },
  overlay: "rgba(10,14,21,0.84)",
  constellation: {
    showIntro: true,
    lineColor: "#2E3850",
    starColor: "#E6E4DC",
    accentStarColor: "#F0524A",
    opacity: 0.9,
  },
  watermark: {
    type: "cinturon",
    opacity: 0.62,
    bottom: 20,
    right: 26,
    scale: 1,
  },
  label: "Claqueta · Betelgeuse",
  labelColor: "#F0524A",
  accentLine: "#F0524A",
}

const themes: Record<ThemeName, ThemeTokens> = {
  default: defaultTheme,
  "linea-directa": lineaDirectaTheme,
  "atom-dark": atomDarkTheme,
  "h-alpha": hAlphaTheme,
  claqueta: claquetaTheme,
  betelgeuse: betelgeuseTheme,
}

export function getTheme(name: ThemeName): ThemeTokens {
  return themes[name]
}

export function useThemeTokens(): ThemeTokens {
  const name = useTheme()
  return getTheme(name)
}
