import React from "react"
import type { ThemeName } from "../../compositions/ClaudeCodeTutorial/schema"

export const ThemeContext = React.createContext<ThemeName>("betelgeuse")
export const useTheme = () => React.useContext(ThemeContext)
