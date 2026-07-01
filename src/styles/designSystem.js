export const themeDark = {
  background: "#081526",
  sidebar: "#0D1B31",
  card: "#10213D",
  cardHover: "#152A4D",
  border: "#26466F",
  textPrimary: "#F8FAFC",
  textSecondary: "#9EB2D0",
  primary: "#F97316",
  success: "#22C55E",
  warning: "#FCD34D",
  danger: "#EF4444",
  cyan: "#23D3D6",
  purple: "#A78BFA",
  radius: 16,
  radiusLg: 22,
  shadow: "0 18px 46px rgba(0,0,0,.22)",
  spacing: 16,
}

export const themeLight = {
  background: "#F4F7FB",
  sidebar: "#FFFFFF",
  card: "#FFFFFF",
  cardHover: "#F0F6FF",
  border: "#D8E3F1",
  textPrimary: "#10213D",
  textSecondary: "#52657F",
  primary: "#EA580C",
  success: "#16A34A",
  warning: "#D97706",
  danger: "#DC2626",
  cyan: "#0891B2",
  purple: "#7C3AED",
  radius: 16,
  radiusLg: 22,
  shadow: "0 18px 42px rgba(15,30,56,.12)",
  spacing: 16,
}

export const ds = themeDark

export function cardStyle(extra = {}) {
  return {
    background: `linear-gradient(135deg, ${ds.card}, ${ds.cardHover})`,
    border: `1px solid ${ds.border}`,
    borderRadius: ds.radiusLg,
    boxShadow: ds.shadow,
    ...extra,
  }
}

export function buttonStyle(extra = {}) {
  return {
    minHeight: 44,
    borderRadius: ds.radius,
    border: `1px solid ${ds.border}`,
    background: ds.cardHover,
    color: ds.textPrimary,
    cursor: "pointer",
    fontFamily: "inherit",
    fontWeight: 900,
    ...extra,
  }
}
