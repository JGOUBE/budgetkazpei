import { BkIcons } from "./icons-budgetkazpei"
import { ds, buttonStyle } from "../styles/designSystem"
import { useTheme } from "../styles/ThemeProvider"

export default function ThemeToggle({ compact = false }) {
  const { isDark, toggleTheme } = useTheme()
  const Icon = isDark ? BkIcons.light : BkIcons.dark
  const label = isDark ? "Activer le mode clair" : "Activer le mode sombre"

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      style={buttonStyle({
        minWidth: compact ? 44 : 136,
        width: compact ? 44 : "auto",
        height: 44,
        padding: compact ? 0 : "0 13px",
        background: ds.surfaceWash,
        color: ds.textSecondary,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        flexShrink: 0,
      })}
    >
      <Icon size={18} aria-hidden="true" />
      {!compact && <span>{isDark ? "Mode clair" : "Mode sombre"}</span>}
    </button>
  )
}
