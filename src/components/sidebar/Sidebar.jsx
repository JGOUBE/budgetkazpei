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
  muted: "#8EA4C5",
  text: "#F1F5F9",
  yellow: "#FCD34D",
  cyan: "#23D3D6",
  red: "#EF4444",
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
  lang,
  t,
}) {
  const prenom =
    user?.user_metadata?.name ||
    user?.user_metadata?.full_name ||
    user?.email?.split("@")[0] ||
    "Utilisateur"

  const signOutLabel = lang === "kr" ? "Dékonèkté" : "Se déconnecter"

  return (
    <aside
      style={{
        width: 236,
        height: "100dvh",
        background: COLORS.card,
        borderRight: `1px solid ${COLORS.border}`,
        display: "flex",
        flexDirection: "column",
        padding: "14px 16px",
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
        <div style={{ textAlign: "center", marginBottom: 10 }}>
          <img
            src="/icons-creole/logo-budgetkazpei.png"
            alt="BudgetKazPei"
            style={{
              width: 150,
              height: "auto",
              display: "block",
              margin: "0 auto",
              objectFit: "contain",
              filter: "drop-shadow(2px 4px 0 rgba(5,8,12,.75))",
            }}
          />

          <div
            style={{
              marginTop: -6,
              fontSize: 12,
              color: COLORS.cyan,
              fontWeight: 800,
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

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavChange(item.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                  width: "100%",
                  padding: "10px 13px",
                  borderRadius: 12,
                  border: active
                    ? `1px solid ${COLORS.accent}66`
                    : "1px solid transparent",
                  background: active ? "rgba(249,115,22,.15)" : "transparent",
                  color: active ? COLORS.accent : COLORS.muted,
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: active ? 900 : 700,
                  fontFamily: "inherit",
                  textAlign: "left",
                }}
              >
                <Icon size={17} />
                <span>{t(item.section, item.key)}</span>
              </button>
            )
          })}
        </nav>

        {!isPremium && (
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
              border: `1px solid ${COLORS.yellow}55`,
              background:
                "linear-gradient(135deg, rgba(252,211,77,.22), rgba(245,158,11,.12))",
              color: COLORS.yellow,
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 900,
              fontFamily: "inherit",
              textAlign: "left",
            }}
          >
            <Star size={17} fill={COLORS.yellow} />
            <span>{t("nav", "premium")}</span>
          </button>
        )}

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
      </div>

      <button
        type="button"
        onClick={onSignOut}
        style={{
          flexShrink: 0,
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          marginTop: 10,
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
          boxShadow: "0 -8px 20px rgba(10,22,40,.55)",
        }}
      >
        <LogOut size={17} />
        {signOutLabel}
      </button>
    </aside>
  )
}