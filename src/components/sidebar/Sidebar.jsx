
import CreoleIcon from "../CreoleIcon"

const COLORS = {
  card: "#0F1E38",
  border: "#1E3A5F",
  accent: "#F97316",
  muted: "#64748B",
  text: "#F1F5F9",
  yellow: "#FCD34D",
}

const NAV_ITEMS = [
  { id: "dashboard", emoji: "🏠", section: "nav", key: "dashboard" },
  { id: "depenses", emoji: "📊", section: "nav", key: "depenses" },
  { id: "aides", emoji: "🏛️", section: "nav", key: "aides" },
  { id: "abonnements", emoji: "📋", section: "nav", key: "abonnements" },
  { id: "profil", emoji: "👤", section: "nav", key: "profil" },
]

export default function Sidebar({ activeNav, onNavChange, onSignOut, user, isPremium, lang, t }) {
  const prenom = user?.user_metadata?.name || user?.email?.split("@")[0] || "toi"

  return (
    <div style={{
      width: 220,
      minHeight: "100vh",
      background: COLORS.card,
      borderRight: `1px solid ${COLORS.border}`,
      display: "flex",
      flexDirection: "column",
      padding: "28px 16px",
      gap: 4,
      position: "sticky",
      top: 0,
      height: "100vh",
    }}>

      {/* Logo */}
      <div style={{
        position: "relative",
        height: 76,
        marginBottom: 16,
        paddingLeft: 0,
      }}>
        <CreoleIcon
          name="palmier"
          alt="Palmier"
          style={{
            position: "absolute",
            left: -12,
            top: -8,
            width: 68,
            height: 68,
            objectFit: "contain",
            transform: "rotate(-10deg)",
            filter: "drop-shadow(2px 3px 0 #05080c)",
            zIndex: 2,
          }}
        />

        <div style={{
          position: "absolute",
          left: 42,
          top: 10,
          transform: "rotate(-2.5deg)",
          transformOrigin: "left center",
          zIndex: 1,
        }}>
          <div style={{
            fontSize: 29,
            fontFamily: "Impact, 'Arial Black', 'DM Serif Display', Georgia, serif",
            color: "#F8ECD0",
            lineHeight: 0.9,
            letterSpacing: -0.5,
            whiteSpace: "nowrap",
            textShadow: "3px 3px 0 #05080c, 5px 5px 0 rgba(0,0,0,0.45)",
          }}>
            BudgetKazPei
          </div>

          <div style={{
            fontSize: 12,
            color: COLORS.accent,
            marginTop: 8,
            fontWeight: 800,
            fontStyle: "italic",
            whiteSpace: "nowrap",
          }}>
            {t("header", "tagline")}
          </div>
        </div>
      </div>

      {/* Bienvenue */}
      <div style={{
        background: `${COLORS.accent}15`,
        border: `1px solid ${COLORS.accent}33`,
        borderRadius: 10,
        padding: "10px 12px",
        marginBottom: 12,
      }}>
        <div style={{ fontSize: 11, color: COLORS.accent, fontWeight: 600 }}>👋 Bienvenue,</div>
        <div style={{ fontSize: 14, color: COLORS.text, fontWeight: 600, marginTop: 2 }}>{prenom}</div>
        {isPremium && (
          <div style={{ fontSize: 10, color: COLORS.yellow, fontWeight: 600, marginTop: 4 }}>
            ⭐ {t("profil", "comptePremium")}
          </div>
        )}
      </div>

      {/* Navigation */}
      {NAV_ITEMS.map(item => (
        <button
          key={item.id}
          onClick={() => onNavChange(item.id)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            borderRadius: 10,
            border: "none",
            cursor: "pointer",
            background: activeNav === item.id ? `${COLORS.accent}22` : "transparent",
            color: activeNav === item.id ? COLORS.accent : COLORS.muted,
            fontSize: 14,
            fontFamily: "inherit",
            textAlign: "left",
            borderLeft: activeNav === item.id ? `3px solid ${COLORS.accent}` : "3px solid transparent",
            transition: "all 0.2s",
            fontWeight: activeNav === item.id ? 600 : 400,
          }}
        >
          <span>{item.emoji}</span>
          <span>{t(item.section, item.key)}</span>
        </button>
      ))}

      {/* Premium */}
      {!isPremium && (
        <button
          onClick={() => onNavChange("premium")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            borderRadius: 10,
            border: `1px solid ${COLORS.yellow}44`,
            cursor: "pointer",
            background: activeNav === "premium" ? `${COLORS.yellow}22` : `${COLORS.yellow}11`,
            color: COLORS.yellow,
            fontSize: 14,
            fontFamily: "inherit",
            textAlign: "left",
            transition: "all 0.2s",
            fontWeight: 600,
            marginTop: 4,
          }}
        >
          <span>⭐</span>
          <span>{t("nav", "premium")}</span>
        </button>
      )}

      {/* Bas sidebar */}
      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10 }}>

        <div style={{
          background: `${COLORS.accent}15`,
          border: `1px solid ${COLORS.accent}33`,
          borderRadius: 12,
          padding: "14px 12px",
        }}>
          <div style={{ fontSize: 12, color: COLORS.accent, fontWeight: 600, marginBottom: 4 }}>
            {t("bonPlan", "title")}
          </div>
          <div style={{ fontSize: 11, color: COLORS.muted, lineHeight: 1.5 }}>
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
            fontFamily: "inherit",
            transition: "all 0.2s",
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
          🚪 {t("common", "signout")}
        </button>
      </div>
    </div>
  )
}