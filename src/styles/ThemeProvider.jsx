/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState } from "react"
import { applyTheme, getInitialThemeName, getThemeTokens } from "./designSystem"

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [themeName, setThemeName] = useState(() => getInitialThemeName())

  useEffect(() => {
    applyTheme(themeName)
  }, [themeName])

  useEffect(() => {
    if (typeof window === "undefined") return undefined

    const media = window.matchMedia?.("(prefers-color-scheme: light)")
    if (!media) return undefined

    function handleSystemThemeChange(event) {
      try {
        if (window.localStorage.getItem("budgetkazpei:theme")) return
      } catch {
        // Ignore storage errors and keep following the system preference.
      }
      setThemeName(event.matches ? "light" : "dark")
    }

    media.addEventListener?.("change", handleSystemThemeChange)
    return () => media.removeEventListener?.("change", handleSystemThemeChange)
  }, [])

  const value = useMemo(() => {
    const tokens = getThemeTokens(themeName)

    function chooseTheme(nextThemeName) {
      applyTheme(nextThemeName, { persist: true })
      setThemeName(nextThemeName)
    }

    return {
      themeName,
      resolvedTheme: themeName,
      tokens,
      isDark: themeName === "dark",
      toggleTheme: () => chooseTheme(themeName === "dark" ? "light" : "dark"),
      setThemeName: chooseTheme,
    }
  }, [themeName])

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    const themeName = getInitialThemeName()
    return {
      themeName,
      resolvedTheme: themeName,
      tokens: getThemeTokens(themeName),
      isDark: themeName === "dark",
      toggleTheme: () => {},
      setThemeName: () => {},
    }
  }
  return context
}
