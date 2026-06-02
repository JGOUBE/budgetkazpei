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
} from "lucide-react"

const COLORS = {
  card: "#0F1E38",
  border: "#1E3A5F",
  accent: "#F97316",
  muted: "#64748B",
  text: "#F1F5F9",
  yellow: "#FCD34D",
  turquoise: "#23D3D6",
}

const NAV_ITEMS = [
  { id: "dashboard", icon: Home, section: "nav", key: "dashboard" },
  { id: "depenses", icon: BarChart3, section: "nav", key: "depenses" },
  { id: "aides", icon: Landmark, section: "nav", key: "aides" },
  { id: "abonnements", icon: ClipboardList, section: "nav", key: "abonnements" },
  { id: "profil", icon: User, section: "nav", key: "profil" },
]

export default function Sidebar({
  activeNav,
  onNavChange,
  onSignOut,
  user,
  isPremium,
  t,
}) {
  const prenom =
    user?.user_metadata?.name ||
    user?.email?.split("@")[0] ||
    "toi"

  return (
    <div
      style={{
        width: 220,
        minHeight: "100vh",
        background: COLORS.card,
        borderRight: `1px solid ${COLORS.border}`,
        display: "flex",
        flexDirection: "column",
        padding: "24px 16px",
        gap: 4,
        position: "sticky",
        top: 0,
        height: "100vh",
      }}
    >
      {/* Logo */}
      <div
        style={{
          textAlign: "center",
          marginBottom: 6,
          paddingTop: 0,
        }}
      >
        <img
          src="/icons-creole/logo-budgetkazpei.png"
          alt="BudgetKazPei"
          style={{
            display: "block",
            width: "100%",
            maxWidth: 195,
            height: "auto",
            margin: "0 auto",
            objectFit: "contain",
            filter: "drop-shadow(2px 4px 0 rgba(5, 8, 12, 0.72))",
          }}
        />

        <div
          style={{
            marginTop: -42,
            fontSize: 11,
            color: COLORS.turquoise,
            fontWeight: 700,
            fontFamily: "Poppins, 'DM Sans', sans-serif",
            letterSpacing: 0.1,
            whiteSpace: "nowrap",
            textShadow: "1px 1px 0 rgba(5, 8, 12, 0.8)",
          }}
        >
          {t("header", "tagline")}
        </div>
      </div>

      {/* Bienvenue */}
      <div
        style={{
          background: `${COLORS.accent}15`,
          border: `1px solid ${COLORS.accent}33`,
          borderRadius: 12,
          padding: "8px 12px",
          marginBottom: 12,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 11,
            color: COLORS.accent,
            fontWeight: 700,
          }}
        >
          <Sparkles size={14} />
          Bienvenue,
        </div>

        <div
          style={{
            fontSize: 14,
            color: COLORS.text,
            fontWeight: 700,
            marginTop: 3,
          }}
        >
          {prenom}
        </div>

        {isPremium && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontSize: 10,
              color: COLORS.yellow,
              fontWeight: 700,
              marginTop: 5,
            }}
          >
            <Star size={12} fill={COLORS.yellow} />
            {t("profil", "comptePremium")}
          </div>
        )}
      </div>

      {/* Navigation */}
      {NAV_ITEMS.map(item => {
        const Icon = item.icon
        const isActive = activeNav === item.id

        return (
          <button
            key={item.id}
            onClick={() => onNavChange(item.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 14px",
              borderRadius: 10,
              cursor: "pointer",
              background: isActive ? `${COLORS.accent}22` : "transparent",
              color: isActive ? COLORS.accent : COLORS.muted,
              fontSize: 14,
              textAlign: "left",
              border: "none",
              borderLeft: isActive
                ? `3px solid ${COLORS.accent}`
                : "3px solid transparent",
              transition: "all .2s",
              fontWeight: isActive ? 700 : 500,
              fontFamily: "inherit",
            }}
          >
            <Icon size={18} strokeWidth={2.2} />
            <span>{t(item.section, item.key)}</span>
          </button>
        )
      })}

      {/* Premium */}
      {!isPremium && (
        <button
          onClick={() => onNavChange("premium")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 14px",
            borderRadius: 12,
            border: `1px solid ${COLORS.yellow}44`,
            cursor: "pointer",
            background:
              "linear-gradient(135deg, rgba(252,211,77,.20), rgba(245,158,11,.12))",
            color: COLORS.yellow,
            fontSize: 14,
            textAlign: "left",
            fontWeight: 800,
            marginTop: 10,
            boxShadow: "0 0 18px rgba(252,211,77,.10)",
            fontFamily: "inherit",
          }}
        >
          <Star size={18} fill={COLORS.yellow} strokeWidth={2.2} />
          <span>{t("nav", "premium")}</span>
        </button>
      )}

      {/* Bas sidebar */}
      <div
        style={{
          marginTop: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div
          style={{
            background: `${COLORS.accent}15`,
            border: `1px solid ${COLORS.accent}33`,
            borderRadius: 12,
            padding: "14px 12px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: COLORS.accent,
              fontWeight: 800,
              marginBottom: 5,
            }}
          >
            <Lightbulb size={15} />
            {t("bonPlan", "title")}
          </div>

          <div
            style={{
              fontSize: 11,
              color: COLORS.muted,
              lineHeight: 1.5,
            }}
          >
            {t("bonPlan", "message")}
          </div>
        </div>

        <button
          onClick={onSignOut}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            borderRadius: 10,
            border: `1px solid ${COLORS.border}`,
            background: "transparent",
            color: COLORS.muted,
            cursor: "pointer",
            fontSize: 13,
            transition: "all .2s",
            fontFamily: "inherit",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = "#EF4444"
            e.currentTarget.style.color = "#EF4444"
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = COLORS.border
            e.currentTarget.style.color = COLORS.muted
          }}
        >
          <LogOut size={16} />
          {t("common", "signout")}
        </button>
      </div>
    </div>
  )
}