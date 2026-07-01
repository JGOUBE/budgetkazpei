export const TROPICAL_VARIANTS = {
  lagoon: {
    bg: "linear-gradient(135deg, rgba(0,194,184,.42) 0%, rgba(13,148,136,.28) 55%, rgba(16,33,61,.92) 100%)",
    border: "rgba(0,212,199,.38)",
    glow: "rgba(0,212,199,.18)",
    iconBg: "rgba(0,212,199,.16)",
    iconBorder: "rgba(0,212,199,.28)",
    accent: "#5EEAD4",
  },
  green: {
    bg: "linear-gradient(135deg, rgba(101,163,13,.44) 0%, rgba(21,128,61,.28) 58%, rgba(16,33,61,.92) 100%)",
    border: "rgba(132,204,22,.38)",
    glow: "rgba(132,204,22,.16)",
    iconBg: "rgba(132,204,22,.15)",
    iconBorder: "rgba(132,204,22,.26)",
    accent: "#BEF264",
  },
  coral: {
    bg: "linear-gradient(135deg, rgba(255,122,69,.46) 0%, rgba(234,88,12,.30) 55%, rgba(16,33,61,.9) 100%)",
    border: "rgba(251,146,60,.42)",
    glow: "rgba(251,146,60,.17)",
    iconBg: "rgba(251,146,60,.16)",
    iconBorder: "rgba(251,146,60,.28)",
    accent: "#FDBA74",
  },
  purple: {
    bg: "linear-gradient(135deg, rgba(124,58,237,.40) 0%, rgba(76,29,149,.32) 55%, rgba(16,33,61,.94) 100%)",
    border: "rgba(167,139,250,.38)",
    glow: "rgba(167,139,250,.16)",
    iconBg: "rgba(167,139,250,.15)",
    iconBorder: "rgba(167,139,250,.25)",
    accent: "#C4B5FD",
  },
  ocean: {
    bg: "linear-gradient(135deg, rgba(14,165,233,.36) 0%, rgba(30,58,138,.34) 55%, rgba(16,33,61,.95) 100%)",
    border: "rgba(56,189,248,.38)",
    glow: "rgba(56,189,248,.16)",
    iconBg: "rgba(56,189,248,.14)",
    iconBorder: "rgba(56,189,248,.25)",
    accent: "#7DD3FC",
  },
  gold: {
    bg: "linear-gradient(135deg, rgba(212,160,23,.38) 0%, rgba(139,111,26,.28) 52%, rgba(16,33,61,.95) 100%)",
    border: "rgba(250,204,21,.36)",
    glow: "rgba(250,204,21,.15)",
    iconBg: "rgba(250,204,21,.13)",
    iconBorder: "rgba(250,204,21,.24)",
    accent: "#FDE68A",
  },
}

export default function TropicalCard({
  children,
  variant = "lagoon",
  emoji,
  style = {},
  innerStyle = {},
}) {
  const theme = TROPICAL_VARIANTS[variant] || TROPICAL_VARIANTS.lagoon
  const Icon = typeof emoji === "function" ? emoji : null

  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: 20,
        padding: 20,
        background: theme.bg,
        border: `1px solid ${theme.border}`,
        boxShadow:
          `0 18px 38px rgba(0,0,0,.20), inset 0 1px 0 rgba(255,255,255,.08), 0 0 30px ${theme.glow}`,
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        transition:
          "transform .25s ease, box-shadow .25s ease, border-color .25s ease",
        ...style,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = "translateY(-3px)"
        e.currentTarget.style.boxShadow =
          `0 22px 48px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.10), 0 0 38px ${theme.glow}`
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = "translateY(0)"
        e.currentTarget.style.boxShadow =
          `0 18px 38px rgba(0,0,0,.20), inset 0 1px 0 rgba(255,255,255,.08), 0 0 30px ${theme.glow}`
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 18% 12%, rgba(255,255,255,.11), transparent 28%), radial-gradient(circle at 88% 85%, rgba(255,255,255,.06), transparent 30%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.035,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.22) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.16) 1px, transparent 1px)",
          backgroundSize: "18px 18px",
          maskImage: "linear-gradient(135deg, black, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      {Icon && (
        <div
          style={{
            position: "absolute",
            left: 20,
            top: 22,
            width: 48,
            height: 48,
            borderRadius: 999,
            background: theme.iconBg,
            border: `1px solid ${theme.iconBorder}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,.08)",
            color: theme.accent,
          }}
        >
          <Icon size={24} />
        </div>
      )}

      <div style={{ position: "relative", zIndex: 1, ...innerStyle }}>
        {children}
      </div>
    </div>
  )
}
