import LanguageSwitcher from "../LanguageSwitcher"
import { BkIcons } from "../icons-budgetkazpei"
import { ds, buttonStyle } from "../../styles/designSystem"
import AppLogo from "../AppLogo"
import ThemeToggle from "../ThemeToggle"
import { useTheme } from "../../styles/ThemeProvider"

export default function Header({ activeNav, lang, onToggleLang, t, commune, onProfile }) {
  useTheme()
  const LocationIcon = BkIcons.location
  const ProfileIcon = BkIcons.user

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
  const title = activeNav === "dashboard"
    ? (lang === "fr" ? "Accueil" : "Akèy")
    : activeNav === "contact"
    ? (lang === "fr" ? "Contactez-nous" : "Contacte a nou")
    : activeNav === "goodDealsAdminReview"
      ? "Validation bons plans"
      : activeNav === "retailPriceAdminReview"
        ? "Validation prix et promotions"
    : t(current.section, current.key)
  const showSubtitle = activeNav !== "contact"

  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28, gap: 16, flexWrap: "wrap" }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10, minHeight: 38 }}>
          <AppLogo size={36} />
          <span style={{ color: ds.textPrimary, fontWeight: 950, fontSize: 20, letterSpacing: 0, lineHeight: 1 }}>BudgetKazPéi</span>
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
          type="button"
          onClick={onProfile}
          aria-label={lang === "fr" ? "Mon profil" : "Mon profil"}
          style={buttonStyle({
            background: ds.card,
            border: `1px solid ${ds.border}`,
            padding: 0,
            width: 48,
            color: ds.textPrimary,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          })}
        >
          <ProfileIcon size={20} />
        </button>
      </div>
    </div>
  )
}
