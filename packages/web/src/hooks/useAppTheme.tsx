import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import { darkTheme, lightTheme, type AppTheme } from "../theme"

type ThemeMode = "dark" | "light"

interface ThemeContextValue {
  theme: AppTheme
  mode: ThemeMode
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: darkTheme,
  mode: "dark",
  toggle: () => {},
})

const STORAGE_KEY = "video-gen-theme"

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored === "light" ? "light" : "dark"
    } catch {
      return "dark"
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, mode)
    } catch {
      // storage unavailable — ignore (eslint-disable-next-line no-empty)
    }
    document.documentElement.setAttribute("data-theme", mode)
  }, [mode])

  const toggle = () => setMode((m) => (m === "dark" ? "light" : "dark"))
  const activeTheme = mode === "dark" ? darkTheme : lightTheme

  return <ThemeContext.Provider value={{ theme: activeTheme, mode, toggle }}>{children}</ThemeContext.Provider>
}

export function useAppTheme(): ThemeContextValue {
  return useContext(ThemeContext)
}
