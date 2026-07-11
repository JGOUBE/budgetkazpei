import LanguageSwitcher from "../LanguageSwitcher"
import { BkIcons } from "../icons-budgetkazpei"
import { ds, buttonStyle } from "../../styles/designSystem"
import AppLogo from "../AppLogo"

export default function Header({ activeNav, onAdd, lang, onToggleLang, t, commune }) {
  const LocationIcon = BkIcons.location
  const AddIcon = BkIcons.add
  const AppearanceIcon = BkIcons.appearance

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

  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28, gap: 16, flexWrap: "wrap" }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10, minHeight: 38 }}>
          <AppLogo size={36} />
          <span style={{ color: ds.textPrimary, fontWeight: 950, fontSize: 20, letterSpacing: 0, lineHeight: 1 }}>BudgetKazPei</span>
        </div>
        <h1 style={{ margin: 0, fontSize: 24, fontFamily: "'DM Serif Display', serif", fontWeight: 400, color: ds.textPrimary }}>
          {t(current.section, current.key)}
        </h1>
        <p style={{ margin: "5px 0 0", color: ds.textSecondary, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          {moisFormate}
          <span>·</span>
          <LocationIcon size={14} />
          {lieu}
        </p>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button type="button" style={buttonStyle({ padding: "0 12px", background: "rgba(255,255,255,.05)", color: ds.textSecondary, display: "inline-flex", alignItems: "center", gap: 8 })}>
          <AppearanceIcon size={17} />
          {lang === "fr" ? "Apparence" : "Aparans"}
        </button>
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
