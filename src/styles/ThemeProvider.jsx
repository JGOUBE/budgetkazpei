/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo } from "react"
import { applyTheme, getThemeTokens } from "./designSystem"

const ThemeContext = createContext(null)
const LIGHT_THEME = "light"

export function ThemeProvider({ children }) {
  useEffect(() => {
    applyTheme(LIGHT_THEME, { persist: true })
  }, [])

  const value = useMemo(() => ({
    themeName: LIGHT_THEME,
    resolvedTheme: LIGHT_THEME,
    tokens: getThemeTokens(LIGHT_THEME),
    isDark: false,
    toggleTheme: () => {},
    setThemeName: () => applyTheme(LIGHT_THEME, { persist: true }),
  }), [])

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    return {
      themeName: LIGHT_THEME,
      resolvedTheme: LIGHT_THEME,
      tokens: getThemeTokens(LIGHT_THEME),
      isDark: false,
      toggleTheme: () => {},
      setThemeName: () => {},
    }
  }
  return context
}
