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
  fontBody: '"DM Sans", "Helvetica Neue", Arial, sans-serif',
  fontDisplay: '"DM Serif Display", Georgia, serif',
}

export const themeLight = {
  name: "light",
  colorScheme: "light",
  pageBackground: "#F7F9F8",
  background: "#F7F9F8",
  backgroundSoft: "#F2F6F5",
  sidebar: "#FFFFFF",
  card: "#FFFFFF",
  cardHover: "#F5F9F8",
  elevated: "#FFFFFF",
  surfaceSecondary: "#EFF5F4",
  hoverSurface: "#E9F2F1",
  selectedSurface: "#E4F0ED",
  borderSubtle: "#E9EEED",
  border: "#DEE7E5",
  borderStrong: "#C8D7D5",
  textPrimary: "#23363D",
  textSecondary: "#52666E",
  textMuted: "#6D7E85",
  textInverse: "#23363D",
  primary: "#196F71",
  primaryHover: "#135D62",
  primarySoft: "#E4F1EE",
  secondaryAction: "#346F9B",
  success: "#286D52",
  successSoft: "#E5F2EA",
  warning: "#886684",
  warningSoft: "#F3ECF4",
  danger: "#A84055",
  dangerSoft: "#FCEEF1",
  info: "#346F9B",
  infoSoft: "#E7F1F8",
  cyan: "#278A95",
  purple: "#806F9E",
  lavenderSoft: "#F2EDF7",
  peachSoft: "#E4F1EE",
  sageSoft: "#E5F2EA",
  creamSoft: "#EEF3F7",
  blueSoftPastel: "#E7F1F8",
  input: "#FFFFFF",
  inputBorder: "#CEDBD9",
  inputText: "#23363D",
  disabled: "#84949A",
  disabledBg: "#F0F3F3",
  disabledText: "#667980",
  chartTooltip: "#FFFFFF",
  overlay: "rgba(26,46,53,.34)",
  focusRing: "#278A95",
  shadow: "none",
  appBackground: "#F7F9F8",
  surfaceWash: "#F7F9F8",
  listRow: "#FFFFFF",
  listRowHover: "#F3F8F6",
  progressTrack: "#E4ECEA",
  radius: 13,
  radiusLg: 18,
  spacing: 16,
  fontBody: '"DM Sans", "Helvetica Neue", Arial, sans-serif',
  fontDisplay: '"DM Sans", "Helvetica Neue", Arial, sans-serif',
}

export const ds = {}

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
  // A missing preference is intentionally light. The device/browser theme must
  // never silently choose the app theme before the user has made a choice.
  return getStoredThemeName() || "light"
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
    root.style.setProperty("--bkp-font-body", tokens.fontBody)
    root.style.setProperty("--bkp-font-display", tokens.fontDisplay)
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
    background: ds.card,
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
