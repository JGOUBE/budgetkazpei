import LanguageSwitcher from "../LanguageSwitcher"
import { BkIcons } from "../icons-budgetkazpei"
import { ds, buttonStyle } from "../../styles/designSystem"
import AppLogo from "../AppLogo"
import ThemeToggle from "../ThemeToggle"
import { useTheme } from "../../styles/ThemeProvider"

export default function Header({ activeNav, onAdd, lang, onToggleLang, t, commune }) {
  useTheme()
  const LocationIcon = BkIcons.location
  const AddIcon = BkIcons.add

  const titles = {
    dashboard: { section: "nav", key: "dashboard" },
    depenses: { section: "nav", key: "depenses" },
    aides: { section: "nav", key: "aides" },
    abonnements: { section: "nav", key: "abonnements" },
  }

  const current = titles[activeNav] || titles.dashboard
  const now = new Date()
  const mois = now.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
  const moisFormate = mois.charAt(0).toUpperCase() + mois.slice(1)
  const lieu = commune ? `${commune}, La Reunion` : t("header", "location")
  const title = activeNav === "contact"
    ? (lang === "fr" ? "Contactez-nous" : "Contacte a nou")
    : t(current.section, current.key)
  const showSubtitle = activeNav !== "contact"

  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28, gap: 16, flexWrap: "wrap" }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10, minHeight: 38 }}>
          <AppLogo size={36} />
          <span style={{ color: ds.textPrimary, fontWeight: 950, fontSize: 20, letterSpacing: 0, lineHeight: 1 }}>BudgetKazPei</span>
        </div>
        <h1 style={{ margin: 0, fontSize: 24, fontFamily: "'DM Serif Display', serif", fontWeight: 400, color: ds.textPrimary }}>
          {title}
        </h1>
        {showSubtitle && (
          <p style={{ margin: "5px 0 0", color: ds.textSecondary, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
            {moisFormate}
            <span>·</span>
            <LocationIcon size={14} />
            {lieu}
          </p>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <ThemeToggle />
        <LanguageSwitcher lang={lang} onToggle={onToggleLang} />
        <button
          onClick={onAdd}
          style={buttonStyle({
            background: ds.primary,
            border: "none",
            padding: "0 18px",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            gap: 8,
            boxShadow: `0 4px 20px ${ds.primary}44`,
          })}
        >
          <AddIcon size={18} />
          {t("header", "addButton")}
        </button>
      </div>
    </div>
  )
}
