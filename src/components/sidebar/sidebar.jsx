const COLORS = {
  card: "#0F1E38",
  border: "#1E3A5F",
  accent: "#F97316",
  muted: "#64748B",
  text: "#F1F5F9",
  yellow: "#FCD34D",
};

const NAV_ITEMS = [
  { id: "dashboard",   emoji: "🏠", section: "nav", key: "dashboard" },
  { id: "depenses",    emoji: "📊", section: "nav", key: "depenses" },
  { id: "aides",       emoji: "🏛️", section: "nav", key: "aides" },
  { id: "abonnements", emoji: "📋", section: "nav", key: "abonnements" },
  { id: "profil",      emoji: "👤", section: "nav", key: "profil" },
];

export default function Sidebar({ activeNav, onNavChange, onSignOut, user, t }) {
  const prenom = user?.user_metadata?.name || user?.email?.split("@")[0] || "toi";

  return (
    <div style={{
      width: 220, minHeight: "100vh",
      background: COLORS.card,
      borderRight: `1px solid ${COLORS.border}`,
      display: "flex", flexDirection: "column",
      padding: "28px 16px", gap: 4,
      position: "sticky", top: 0, height: "100vh",
    }}>

      {/* ── Logo ── */}
      <div style={{ marginBottom: 16, paddingLeft: 8 }}>
        <div style={{
          fontSize: 22,
          fontFamily: "'DM Serif Display', Georgia, serif",
          color: COLORS.text, lineHeight: 1,
        }}>
          🌴 BudgetKazPei
        </div>
        <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 4 }}>
          {t("header", "tagline")}
        </div>
      </div>

      {/* ── Message bienvenue ── */}
      <div style={{
        background: `${COLORS.accent}15`,
        border: `1px solid ${COLORS.accent}33`,
        borderRadius: 10, padding: "10px 12px", marginBottom: 12,
      }}>
        <div style={{ fontSize: 11, color: COLORS.accent, fontWeight: 600 }}>
          👋 Bienvenue,
        </div>
        <div style={{ fontSize: 14, color: COLORS.text, fontWeight: 600, marginTop: 2 }}>
          {prenom}
        </div>
      </div>

      {/* ── Navigation ── */}
      {NAV_ITEMS.map(item => (
        <button
          key={item.id}
          onClick={() => onNavChange(item.id)}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 14px", borderRadius: 10,
            border: "none", cursor: "pointer",
            background: activeNav === item.id ? `${COLORS.accent}22` : "transparent",
            color: activeNav === item.id ? COLORS.accent : COLORS.muted,
            fontSize: 14, fontFamily: "inherit", textAlign: "left",
            borderLeft: activeNav === item.id ? `3px solid ${COLORS.accent}` : "3px solid transparent",
            transition: "all 0.2s",
            fontWeight: activeNav === item.id ? 600 : 400,
          }}
        >
          <span>{item.emoji}</span>
          <span>
            {item.id === "profil" ? "Mon Profil" : t(item.section, item.key)}
          </span>
        </button>
      ))}

      {/* ── Bas de sidebar ── */}
      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10 }}>

        {/* Bon plan */}
        <div style={{
          background: `${COLORS.accent}15`,
          border: `1px solid ${COLORS.accent}33`,
          borderRadius: 12, padding: "14px 12px",
        }}>
          <div style={{ fontSize: 12, color: COLORS.accent, fontWeight: 600, marginBottom: 4 }}>
            {t("bonPlan", "title")}
          </div>
          <div style={{ fontSize: 11, color: COLORS.muted, lineHeight: 1.5 }}>
            {t("bonPlan", "message")}
          </div>
        </div>

        {/* Bouton déconnexion */}
        <button
          onClick={onSignOut}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "10px 14px", borderRadius: 10,
            border: `1px solid ${COLORS.border}`,
            background: "transparent",
            color: COLORS.muted, cursor: "pointer",
            fontSize: 13, fontFamily: "inherit",
            transition: "all 0.2s",
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "#EF4444"; e.currentTarget.style.color = "#EF4444"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = COLORS.border; e.currentTarget.style.color = COLORS.muted; }}
        >
          🚪 Se déconnecter
        </button>
      </div>
    </div>
  );
}
