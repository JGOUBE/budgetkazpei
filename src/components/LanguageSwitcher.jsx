const COLORS = {
  card: "#0F1E38",
  border: "#1E3A5F",
  accent: "#F97316",
  muted: "#64748B",
  text: "#F1F5F9",
};

export default function LanguageSwitcher({ lang, onToggle }) {
  return (
    <button
      onClick={onToggle}
      title={lang === "fr" ? "Passer en créole" : "Passer en français"}
      style={{
        background: "transparent",
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        padding: "6px 12px",
        color: COLORS.muted,
        cursor: "pointer",
        fontSize: 13,
        fontFamily: "inherit",
        display: "flex",
        alignItems: "center",
        gap: 6,
        transition: "all 0.2s",
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = COLORS.accent; e.currentTarget.style.color = COLORS.accent; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = COLORS.border; e.currentTarget.style.color = COLORS.muted; }}
    >
      {lang === "fr" ? "🇷🇪 Kréol" : "🇫🇷 Français"}
    </button>
  );
}
