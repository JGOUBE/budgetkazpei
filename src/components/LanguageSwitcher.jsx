import { ds } from "../styles/designSystem"

export default function LanguageSwitcher({ lang, onToggle }) {
  return (
    <button
      onClick={onToggle}
      title={lang === "fr" ? "Passer en kreol" : "Passer en francais"}
      style={{
        background: "transparent",
        border: `1px solid ${ds.border}`,
        borderRadius: 8,
        padding: "6px 12px",
        color: ds.textSecondary,
        cursor: "pointer",
        fontSize: 13,
        fontFamily: "inherit",
        display: "flex",
        alignItems: "center",
        gap: 6,
        transition: "all 0.2s",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = ds.primary
        e.currentTarget.style.color = ds.primary
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = ds.border
        e.currentTarget.style.color = ds.textSecondary
      }}
    >
      {lang === "fr" ? "Kreol" : "Francais"}
    </button>
  )
}
