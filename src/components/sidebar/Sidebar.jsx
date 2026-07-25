import { BkIcons } from "../icons-budgetkazpei"
import { ds } from "../../styles/designSystem"
import { useTheme } from "../../styles/ThemeProvider"
import AppLogo from "../AppLogo"

const NAV_ITEMS = [
  { id: "dashboard", icon: BkIcons.dashboard, section: "nav", key: "dashboard" },
  { id: "depenses", icon: BkIcons.depenses, section: "nav", key: "depenses" },
  { id: "receipts", icon: BkIcons.receipts, section: "nav", key: "receipts" },
  { id: "shopping", icon: BkIcons.shopping, section: "nav", key: "shopping" },
  { id: "goodDeals", icon: BkIcons.deals, section: "nav", key: "goodDeals" },
  { id: "statistics", icon: BkIcons.stats, section: "nav", key: "statistics" },
  { id: "savings", icon: BkIcons.savings, section: "nav", key: "savings" },
  { id: "shoppingList", icon: BkIcons.list, section: "nav", key: "shoppingList" },
  { id: "financeAssistant", icon: BkIcons.assistant, section: "nav", key: "financeAssistant" },
  { id: "aides", icon: BkIcons.aides, section: "nav", key: "aides" },
  { id: "demarches", icon: BkIcons.demarches, section: "nav", key: "demarches" },
  { id: "conseiller", icon: BkIcons.assistant, section: "nav", key: "conseiller" },
  { id: "abonnements", icon: BkIcons.abonnements, section: "nav", key: "abonnements" },
  { id: "historique", icon: BkIcons.calendar, section: "nav", key: "monthlyHistory", premiumOnly: true },
  { id: "profil", icon: BkIcons.user, section: "nav", key: "profil" },
]

export default function Sidebar({
  activeNav,
  onNavChange,
  onSignOut,
  user,
  isPremium,
  isPremiumPlus = false,
  lang = "fr",
  t,
}) {
  useTheme()

  const PremiumIcon = BkIcons.premium
  const ContactIcon = BkIcons.contact
  const SignOutIcon = BkIcons.user
  const LockIcon = BkIcons.dark
  const isKreol = lang === "cr" || lang === "kreol"
  const premiumActive = activeNav === "premium"
  const contactActive = activeNav === "contact"

  const prenom =
    user?.user_metadata?.name ||
    user?.user_metadata?.full_name ||
    user?.email?.split("@")[0] ||
    "Utilisateur"

  const premiumButtonLabel = isPremiumPlus
    ? "Gérer Premium+"
    : isPremium
      ? "Passer à Premium+"
      : isKreol
        ? "Vir Premium"
        : "Découvrir Premium"

  const premiumColor = isPremiumPlus || isPremium ? ds.purple : ds.warning

  function getNavLabel(item) {
    if (item.id === "goodDeals") {
      return isKreol ? "Mon bann bon plan" : "Mes bons plans"
    }

    const translatedLabel = t(item.section, item.key)

    if (!isKreol && item.id === "demarches") return "Démarches"
    if (!isKreol && item.id === "conseiller") return "Conseiller"

    return translatedLabel
  }

  function getNavBorder({ active, locked }) {
    if (active) return `1px solid ${ds.primary}66`
    if (locked) return `1px solid ${ds.warning}35`
    return "1px solid transparent"
  }

  function getNavBackground({ active, locked }) {
    if (active) return "rgba(249,115,22,.15)"
    if (locked) return "rgba(252,211,77,.08)"
    return "transparent"
  }

  return (
    <aside
      style={{
        width: 248,
        height: "100dvh",
        background: ds.sidebar,
        borderRight: `1px solid ${ds.border}`,
        display: "flex",
        flexDirection: "column",
        padding: "18px 16px 14px",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          paddingRight: 2,
          paddingBottom: 10,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            margin: "12px 0 18px",
          }}
        >
          <AppLogo size={68} />

          <div
            style={{
              color: ds.textPrimary,
              fontWeight: 950,
              fontSize: 19,
              letterSpacing: 0,
              lineHeight: 1,
            }}
          >
            BudgetKazPei
          </div>
        </div>

        <div
          style={{
            background: "rgba(249,115,22,.10)",
            border: `1px solid ${ds.primary}55`,
            borderRadius: ds.radius,
            padding: "11px 13px",
            marginBottom: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              fontSize: 12,
              color: ds.primary,
              fontWeight: 900,
            }}
          >
            <PremiumIcon size={14} />
            {isKreol ? "Bienvenu," : "Bienvenue,"}
          </div>

          <div
            style={{
              marginTop: 3,
              fontSize: 15,
              color: ds.textPrimary,
              fontWeight: 900,
              lineHeight: 1.15,
              wordBreak: "break-word",
            }}
          >
            {prenom}
          </div>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {NAV_ITEMS.map(item => {
            const Icon = item.icon
            const active = activeNav === item.id
            const locked = item.premiumOnly && !isPremium
            const baseBorder = getNavBorder({ active, locked })
            const baseBackground = getNavBackground({ active, locked })

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavChange(locked ? "premium" : item.id)}
                onMouseEnter={event => {
                  if (active) return

                  event.currentTarget.style.border = locked
                    ? `1px solid ${ds.warning}88`
                    : `1px solid ${ds.primary}66`

                  event.currentTarget.style.background = locked
                    ? "rgba(252,211,77,.13)"
                    : "rgba(249,115,22,.08)"

                  event.currentTarget.style.boxShadow = locked
                    ? `0 0 0 2px ${ds.warning}18`
                    : `0 0 0 2px ${ds.primary}18`
                }}
                onMouseLeave={event => {
                  event.currentTarget.style.border = baseBorder
                  event.currentTarget.style.background = baseBackground
                  event.currentTarget.style.boxShadow = "none"
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                  width: "100%",
                  padding: "10px 13px",
                  borderRadius: 12,
                  border: baseBorder,
                  background: baseBackground,
                  color: active
                    ? ds.primary
                    : locked
                      ? ds.warning
                      : ds.textSecondary,
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: active || locked ? 900 : 700,
                  fontFamily: "inherit",
                  textAlign: "left",
                  transition:
                    "border-color .18s ease, background .18s ease, box-shadow .18s ease, color .18s ease",
                }}
              >
                <Icon size={17} />
                <span style={{ flex: 1 }}>{getNavLabel(item)}</span>
                {locked && <LockIcon size={14} />}
              </button>
            )
          })}
        </nav>

        <button
          type="button"
          onClick={() => onNavChange("premium")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            width: "100%",
            marginTop: 12,
            padding: "11px 13px",
            borderRadius: 13,
            border: `1px solid ${premiumColor}66`,
            background: premiumActive ? `${premiumColor}30` : `${premiumColor}18`,
            color: premiumColor,
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 900,
            fontFamily: "inherit",
            textAlign: "left",
          }}
        >
          <PremiumIcon size={17} />
          <span>{premiumButtonLabel}</span>
        </button>

        <button
          type="button"
          onClick={() => onNavChange("contact")}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            marginTop: 12,
            padding: "11px 13px",
            borderRadius: 14,
            border: contactActive ? `1px solid ${ds.cyan}66` : `1px solid ${ds.cyan}40`,
            background: contactActive ? "rgba(35,211,214,.20)" : "rgba(35,211,214,.10)",
            color: ds.cyan,
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 900,
            fontFamily: "inherit",
          }}
        >
          <ContactIcon size={17} />
          {isKreol ? "Contacte a nou" : "Contactez-nous"}
        </button>

        <button
          type="button"
          onClick={onSignOut}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            marginTop: 10,
            marginBottom: 90,
            padding: "11px 13px",
            borderRadius: 14,
            border: `1px solid ${ds.danger}55`,
            background: "rgba(239,68,68,.10)",
            color: "#FCA5A5",
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 900,
            fontFamily: "inherit",
          }}
        >
          <SignOutIcon size={17} />
          {t("nav", "signOut")}
        </button>
      </div>
    </aside>
  )
}
