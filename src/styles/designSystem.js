export const THEME_STORAGE_KEY = "budgetkazpei:theme"

export const themeDark = {
  name: "dark",
  colorScheme: "dark",
  pageBackground: "#081526",
  background: "#081526",
  backgroundSoft: "#0A1628",
  sidebar: "#0D1B31",
  card: "#10213D",
  cardHover: "#152A4D",
  elevated: "#172B4E",
  surfaceSecondary: "#132747",
  hoverSurface: "#1A3158",
  selectedSurface: "rgba(249,115,22,.16)",
  borderSubtle: "rgba(255,255,255,.08)",
  border: "#26466F",
  borderStrong: "#315680",
  textPrimary: "#F8FAFC",
  textSecondary: "#A9BAD3",
  textMuted: "#7890B0",
  textInverse: "#07111F",
  primary: "#F97316",
  primaryHover: "#FB923C",
  primarySoft: "rgba(249,115,22,.14)",
  secondaryAction: "#23D3D6",
  success: "#22C55E",
  successSoft: "rgba(34,197,94,.12)",
  warning: "#FCD34D",
  warningSoft: "rgba(252,211,77,.14)",
  danger: "#EF4444",
  dangerSoft: "rgba(239,68,68,.12)",
  info: "#38BDF8",
  infoSoft: "rgba(56,189,248,.12)",
  cyan: "#23D3D6",
  purple: "#A78BFA",
  input: "#152A4D",
  inputBorder: "#315680",
  inputText: "#F8FAFC",
  disabled: "#64748B",
  disabledBg: "rgba(100,116,139,.18)",
  disabledText: "#94A3B8",
  chartTooltip: "#0F1E38",
  overlay: "rgba(3,10,20,.72)",
  focusRing: "#23D3D6",
  shadow: "0 18px 46px rgba(0,0,0,.22)",
  appBackground: "linear-gradient(180deg, #07192E 0%, #0A1628 46%, #07111F 100%)",
  surfaceWash: "rgba(255,255,255,.06)",
  listRow: "rgba(255,255,255,.045)",
  listRowHover: "rgba(255,255,255,.075)",
  progressTrack: "rgba(255,255,255,.12)",
  radius: 16,
  radiusLg: 22,
  spacing: 16,
}

export const themeLight = {
  name: "light",
  colorScheme: "light",
  pageBackground: "#F9FAF7",
  background: "#F9FAF7",
  backgroundSoft: "#FFFDF8",
  sidebar: "#FFFDF8",
  card: "#FFFFFF",
  cardHover: "#FFF7ED",
  elevated: "#FFFFFF",
  surfaceSecondary: "#FFF4D9",
  hoverSurface: "#FCE7DA",
  selectedSurface: "#FCE7DA",
  borderSubtle: "#F0E7DA",
  border: "#E8DED1",
  borderStrong: "#D8C8B8",
  textPrimary: "#142033",
  textSecondary: "#526074",
  textMuted: "#667085",
  textInverse: "#FFFFFF",
  primary: "#EA580C",
  primaryHover: "#EA580C",
  primarySoft: "#FCE7DA",
  secondaryAction: "#0284C7",
  success: "#15803D",
  successSoft: "#E2F1E7",
  warning: "#B45309",
  warningSoft: "#FFF4D9",
  danger: "#DC2626",
  dangerSoft: "#FEF2F2",
  info: "#0284C7",
  infoSoft: "#DCEEFE",
  cyan: "#0284C7",
  purple: "#7C3AED",
  lavenderSoft: "#EEE7FB",
  peachSoft: "#FCE7DA",
  sageSoft: "#E2F1E7",
  creamSoft: "#FFF4D9",
  blueSoftPastel: "#DCEEFE",
  input: "#FFFFFF",
  inputBorder: "#D8C8B8",
  inputText: "#142033",
  disabled: "#94A3B8",
  disabledBg: "#F3F4F6",
  disabledText: "#6B7280",
  chartTooltip: "#FFFFFF",
  overlay: "rgba(15,23,42,.46)",
  focusRing: "#0EA5E9",
  shadow: "0 14px 34px rgba(20,32,51,.08)",
  appBackground: "linear-gradient(180deg, #FFFDF8 0%, #F9FAF7 48%, #FFF4D9 100%)",
  surfaceWash: "#FFF7ED",
  listRow: "#FFFFFF",
  listRowHover: "#FFF7ED",
  progressTrack: "#E8DED1",
  radius: 16,
  radiusLg: 22,
  spacing: 16,
}

export const ds = {}

export function getSystemThemeName() {
  if (typeof window === "undefined") return "dark"
  return window.matchMedia?.("(prefers-color-scheme: light)")?.matches ? "light" : "dark"
}

export function getStoredThemeName() {
  if (typeof window === "undefined") return null
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    return stored === "light" || stored === "dark" ? stored : null
  } catch {
    return null
  }
}

export function getInitialThemeName() {
  return getStoredThemeName() || getSystemThemeName()
}

export function getThemeTokens(themeName = getInitialThemeName()) {
  return themeName === "light" ? themeLight : themeDark
}

export function applyTheme(themeName = getInitialThemeName(), { persist = false } = {}) {
  const tokens = getThemeTokens(themeName)
  Object.assign(ds, tokens)

  if (typeof document !== "undefined") {
    const root = document.documentElement
    root.dataset.theme = tokens.name
    root.style.colorScheme = tokens.colorScheme
    root.style.setProperty("--bkp-bg", tokens.background)
    root.style.setProperty("--bkp-page-bg", tokens.pageBackground)
    root.style.setProperty("--bkp-bg-soft", tokens.backgroundSoft)
    root.style.setProperty("--bkp-sidebar", tokens.sidebar)
    root.style.setProperty("--bkp-card", tokens.card)
    root.style.setProperty("--bkp-card-hover", tokens.cardHover)
    root.style.setProperty("--bkp-elevated", tokens.elevated)
    root.style.setProperty("--bkp-surface-secondary", tokens.surfaceSecondary)
    root.style.setProperty("--bkp-hover-surface", tokens.hoverSurface)
    root.style.setProperty("--bkp-selected-surface", tokens.selectedSurface)
    root.style.setProperty("--bkp-border-subtle", tokens.borderSubtle)
    root.style.setProperty("--bkp-border", tokens.border)
    root.style.setProperty("--bkp-border-strong", tokens.borderStrong)
    root.style.setProperty("--bkp-text", tokens.textPrimary)
    root.style.setProperty("--bkp-muted", tokens.textSecondary)
    root.style.setProperty("--bkp-subtle", tokens.textMuted)
    root.style.setProperty("--bkp-text-inverse", tokens.textInverse)
    root.style.setProperty("--bkp-primary", tokens.primary)
    root.style.setProperty("--bkp-primary-hover", tokens.primaryHover)
    root.style.setProperty("--bkp-success", tokens.success)
    root.style.setProperty("--bkp-success-soft", tokens.successSoft)
    root.style.setProperty("--bkp-warning", tokens.warning)
    root.style.setProperty("--bkp-warning-soft", tokens.warningSoft)
    root.style.setProperty("--bkp-danger", tokens.danger)
    root.style.setProperty("--bkp-danger-soft", tokens.dangerSoft)
    root.style.setProperty("--bkp-info", tokens.info)
    root.style.setProperty("--bkp-info-soft", tokens.infoSoft)
    root.style.setProperty("--bkp-cyan", tokens.cyan)
    root.style.setProperty("--bkp-purple", tokens.purple)
    root.style.setProperty("--bkp-peach-soft", tokens.peachSoft || tokens.primarySoft)
    root.style.setProperty("--bkp-sage-soft", tokens.sageSoft || tokens.successSoft)
    root.style.setProperty("--bkp-cream-soft", tokens.creamSoft || tokens.warningSoft)
    root.style.setProperty("--bkp-lavender-soft", tokens.lavenderSoft || "rgba(167,139,250,.14)")
    root.style.setProperty("--bkp-pastel-blue", tokens.blueSoftPastel || tokens.infoSoft)
    root.style.setProperty("--bkp-input", tokens.input)
    root.style.setProperty("--bkp-input-border", tokens.inputBorder)
    root.style.setProperty("--bkp-input-text", tokens.inputText)
    root.style.setProperty("--bkp-select-bg", tokens.input)
    root.style.setProperty("--bkp-select-text", tokens.inputText)
    root.style.setProperty("--bkp-select-border", tokens.inputBorder)
    root.style.setProperty("--bkp-select-option-bg", tokens.name === "light" ? tokens.card : tokens.chartTooltip)
    root.style.setProperty("--bkp-select-option-text", tokens.textPrimary)
    root.style.setProperty("--bkp-select-option-disabled-bg", tokens.disabledBg)
    root.style.setProperty("--bkp-select-option-disabled-text", tokens.disabledText)
    root.style.setProperty("--bkp-disabled-bg", tokens.disabledBg)
    root.style.setProperty("--bkp-disabled-text", tokens.disabledText)
    root.style.setProperty("--bkp-overlay", tokens.overlay)
    root.style.setProperty("--bkp-focus-ring", tokens.focusRing)
    root.style.setProperty("--bkp-shadow", tokens.shadow)
    root.style.setProperty("--bkp-app-bg", tokens.appBackground)
    root.style.setProperty("--bkp-surface-wash", tokens.surfaceWash)
    root.style.setProperty("--bkp-list-row", tokens.listRow)
    root.style.setProperty("--bkp-list-row-hover", tokens.listRowHover)
    root.style.setProperty("--bkp-progress-track", tokens.progressTrack)
  }

  if (persist && typeof window !== "undefined") {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, tokens.name)
    } catch {
      // Preference persistence is best effort in private browsing contexts.
    }
  }

  return tokens
}

export function createColorAliases(overrides = {}) {
  const aliases = {
    bg: () => ds.background,
    page: () => ds.pageBackground,
    card: () => ds.card,
    cardLight: () => ds.cardHover,
    elevated: () => ds.elevated,
    surface: () => ds.surfaceSecondary,
    hover: () => ds.hoverSurface,
    selected: () => ds.selectedSurface,
    borderSubtle: () => ds.borderSubtle,
    border: () => ds.border,
    borderStrong: () => ds.borderStrong,
    accent: () => ds.primary,
    accentHover: () => ds.primaryHover,
    accentSoft: () => ds.primarySoft,
    secondary: () => ds.secondaryAction,
    green: () => ds.success,
    greenSoft: () => ds.successSoft,
    red: () => ds.danger,
    redSoft: () => ds.dangerSoft,
    blue: () => ds.info,
    blueSoft: () => ds.infoSoft,
    cyan: () => ds.cyan,
    yellow: () => ds.warning,
    yellowSoft: () => ds.warningSoft,
    purple: () => ds.purple,
    peachSoft: () => ds.peachSoft || ds.primarySoft,
    sageSoft: () => ds.sageSoft || ds.successSoft,
    creamSoft: () => ds.creamSoft || ds.warningSoft,
    lavenderSoft: () => ds.lavenderSoft || "rgba(167,139,250,.14)",
    pastelBlue: () => ds.blueSoftPastel || ds.infoSoft,
    muted: () => ds.textSecondary,
    subtle: () => ds.textMuted,
    text: () => ds.textPrimary,
    inverseText: () => ds.textInverse,
    whiteSoft: () => (ds.name === "light" ? ds.textSecondary : "rgba(248,250,252,.82)"),
    overlay: () => ds.overlay,
    input: () => ds.input,
    inputBorder: () => ds.inputBorder,
    inputText: () => ds.inputText,
    disabledBg: () => ds.disabledBg,
    disabledText: () => ds.disabledText,
    focusRing: () => ds.focusRing,
    shadow: () => ds.shadow,
    row: () => ds.listRow,
    rowHover: () => ds.listRowHover,
    progressTrack: () => ds.progressTrack,
    themeName: () => ds.name,
    ...overrides,
  }

  return new Proxy({}, {
    get(_target, prop) {
      const resolver = aliases[prop]
      if (typeof resolver === "function") return resolver()
      return resolver
    },
  })
}

export function cardStyle(extra = {}) {
  return {
    background: ds.name === "light"
      ? ds.card
      : `linear-gradient(135deg, ${ds.card}, ${ds.cardHover})`,
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
    background: ds.name === "light" ? ds.card : ds.cardHover,
    color: ds.textPrimary,
    cursor: "pointer",
    fontFamily: "inherit",
    fontWeight: 900,
    ...extra,
  }
}

applyTheme(getInitialThemeName())
