import {
  Home,
  BarChart3,
  Landmark,
  ClipboardList,
  User,
  Star,
  LogOut,
  Sparkles,
  Lightbulb,
  Lock,
  CalendarClock,
} from "lucide-react"

const COLORS = {
  card: "#0F1E38",
  border: "#1E3A5F",
  accent: "#F97316",
  muted: "#8EA4C5",
  text: "#F1F5F9",
  yellow: "#FCD34D",
  cyan: "#23D3D6",
  purple: "#A78BFA",
}

const NAV_ITEMS = [
  { id: "dashboard", icon: Home, section: "nav", key: "dashboard" },
  { id: "depenses", icon: BarChart3, section: "nav", key: "depenses" },
  { id: "aides", icon: Landmark, section: "nav", key: "aides" },
  { id: "opportunites", icon: Lightbulb, section: "nav", key: "opportunites", premiumOnly: true },
  { id: "abonnements", icon: ClipboardList, section: "nav", key: "abonnements" },
  { id: "historique", icon: CalendarClock, section: "nav", key: "monthlyHistory", premiumOnly: true },
  { id: "profil", icon: User, section: "nav", key: "profil" },
]

export default function Sidebar({
  activeNav,
  onNavChange,
  onSignOut,
  user,
  isPremium,
  isPremiumPlus = false,
  t,
}) {
  const prenom =
    user?.user_metadata?.name ||
    user?.user_metadata?.full_name ||
    user?.email?.split("@")[0] ||
    "Utilisateur"

  const premiumButtonLabel = isPremiumPlus
    ? "Gérer Premium+"
    : isPremium
      ? "Passer Premium+"
      : t("nav", "premium")

  const premiumButtonIcon = isPremiumPlus ? "👑" : isPremium ? "👑" : null
  const premiumColor = isPremiumPlus || isPremium ? COLORS.purple : COLORS.yellow

  return (
    <aside
      style={{
        width: 236,
        height: "100dvh",
        background: COLORS.card,
        borderRight: `1px solid ${COLORS.border}`,
        display: "flex",
        flexDirection: "column",
        padding: "20px 16px 14px",
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
        <div style={{ textAlign: "center", marginBottom: 14 }}>
          <img
            src="/icons-creole/logo-budgetkazpei.png"
            alt="BudgetKazPei"
            style={{
              width: "100%",
              maxWidth: 700,
              height: "auto",
              display: "block",
              margin: "35px auto -35px",
              objectFit: "contain",
              filter: "drop-shadow(2px 5px 0 rgba(5,8,12,.75))",
            }}
          />

          <div
            style={{
              marginTop: -45,
              fontSize: 13,
              color: COLORS.cyan,
              fontWeight: 900,
              fontFamily: "Poppins, 'DM Sans', sans-serif",
              whiteSpace: "nowrap",
            }}
          >
            {t("header", "tagline")}
          </div>
        </div>

        <div
          style={{
            background: "rgba(249,115,22,.10)",
            border: "1px solid rgba(249,115,22,.30)",
            borderRadius: 14,
            padding: "11px 13px",
            marginBottom: 10,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: COLORS.accent,
              fontWeight: 900,
            }}
          >
            <Sparkles size={13} />
            Bienvenue,
          </div>

          <div
            style={{
              marginTop: 3,
              fontSize: 15,
              color: COLORS.text,
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

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (locked) {
                    onNavChange("premium")
                  } else {
                    onNavChange(item.id)
                  }
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                  width: "100%",
                  padding: "10px 13px",
                  borderRadius: 12,
                  border: active
                    ? `1px solid ${COLORS.accent}66`
                    : locked
                      ? `1px solid ${COLORS.yellow}35`
                      : "1px solid transparent",
                  background: active
                    ? "rgba(249,115,22,.15)"
                    : locked
                      ? "rgba(252,211,77,.08)"
                      : "transparent",
                  color: active
                    ? COLORS.accent
                    : locked
                      ? COLORS.yellow
                      : COLORS.muted,
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: active || locked ? 900 : 700,
                  fontFamily: "inherit",
                  textAlign: "left",
                }}
              >
                <Icon size={17} />
                <span style={{ flex: 1 }}>{t(item.section, item.key)}</span>
                {locked && <Lock size={14} />}
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
            marginTop: 10,
            padding: "11px 13px",
            borderRadius: 13,
            border: `1px solid ${premiumColor}55`,
            background: `linear-gradient(135deg, ${premiumColor}22, rgba(245,158,11,.10))`,
            color: premiumColor,
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 900,
            fontFamily: "inherit",
            textAlign: "left",
          }}
        >
          {premiumButtonIcon ? (
            <span style={{ fontSize: 17 }}>{premiumButtonIcon}</span>
          ) : (
            <Star size={17} fill={COLORS.yellow} />
          )}
          <span>{premiumButtonLabel}</span>
        </button>

        <div
          style={{
            marginTop: 12,
            background:
              "linear-gradient(135deg, rgba(35,211,214,.12), rgba(249,115,22,.08))",
            border: "1px solid rgba(35,211,214,.25)",
            borderRadius: 14,
            padding: "11px 12px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              color: COLORS.cyan,
              fontWeight: 900,
              marginBottom: 5,
            }}
          >
            <Lightbulb size={14} />
            {t("bonPlan", "title")}
          </div>

          <div
            style={{
              fontSize: 10.5,
              color: COLORS.muted,
              lineHeight: 1.35,
            }}
          >
            {t("bonPlan", "message")}
          </div>
        </div>

        <button
          type="button"
          onClick={onSignOut}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            marginTop: 12,
            marginBottom: 90,
            padding: "11px 13px",
            borderRadius: 14,
            border: "1px solid rgba(239,68,68,.38)",
            background:
              "linear-gradient(135deg, rgba(239,68,68,.13), rgba(15,30,56,.95))",
            color: "#FCA5A5",
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 900,
            fontFamily: "inherit",
          }}
        >
          <LogOut size={17} />
          {t("nav", "signOut")}
        </button>
      </div>
    </aside>
  )
}