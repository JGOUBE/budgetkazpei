export const APP_ROUTE = "/app"
export const DASHBOARD_ROUTE = "/dashboard"
export const GOOD_DEALS_REVIEW_ADMIN_ROUTE = "/admin/bons-plans-validation"
export const LOGIN_ROUTE = "/login"
export const REGISTER_ROUTE = "/register"
export const DISCOVER_ROUTE = "/decouvrir"
export const AUTH_CALLBACK_ROUTE = "/auth/callback"
export const HAS_AUTHENTICATED_KEY = "budgetkazpei_has_authenticated"
export const SESSION_EXPIRED_MESSAGE =
  "Votre session a expiré. Reconnectez-vous pour continuer."

export const ROUTE_CHANGE_EVENT = "budgetkazpei:route-change"

const PUBLIC_PAGES = new Set([
  "/",
  DISCOVER_ROUTE,
  "/premium",
  "/privacy",
  "/terms",
  "/suppression-compte",
  "/reset-password",
])

const PUBLIC_ONLY_PAGES = new Set([LOGIN_ROUTE, REGISTER_ROUTE])

export function normalizePath(pathname = "/") {
  if (!pathname || typeof pathname !== "string") return "/"

  const cleanPath = pathname.split("?")[0].split("#")[0] || "/"
  if (cleanPath.length > 1 && cleanPath.endsWith("/")) {
    return cleanPath.slice(0, -1)
  }

  return cleanPath
}

export function isPremiumPath(pathname) {
  const path = normalizePath(pathname)
  return path === "/premium" || path.startsWith("/premium/")
}

export function isProtectedPath(pathname) {
  const path = normalizePath(pathname)
  return path === APP_ROUTE || path === DASHBOARD_ROUTE || path === GOOD_DEALS_REVIEW_ADMIN_ROUTE
}

export function isPublicOnlyPath(pathname) {
  return PUBLIC_ONLY_PAGES.has(normalizePath(pathname))
}

export function isAuthCallbackPath(pathname) {
  return normalizePath(pathname) === AUTH_CALLBACK_ROUTE
}

export function sanitizeNextPath(nextPath) {
  if (!nextPath || typeof nextPath !== "string") return APP_ROUTE

  const trimmed = nextPath.trim()
  if (!trimmed || trimmed.startsWith("//")) return APP_ROUTE
  if (/^[a-z][a-z\d+.-]*:/i.test(trimmed)) return APP_ROUTE

  try {
    const url = new URL(trimmed, "https://budgetkazpei.local")
    if (url.origin !== "https://budgetkazpei.local") return APP_ROUTE

    const path = normalizePath(url.pathname)
    if (path === APP_ROUTE || path === GOOD_DEALS_REVIEW_ADMIN_ROUTE) return path
    if (path === DASHBOARD_ROUTE) return APP_ROUTE
  } catch {
    return APP_ROUTE
  }

  return APP_ROUTE
}

export function getNextFromSearch(search = "") {
  const params = new URLSearchParams(search)
  return sanitizeNextPath(params.get("next"))
}

export function buildLoginPath(nextPath = APP_ROUTE, message = "") {
  const params = new URLSearchParams()
  params.set("next", sanitizeNextPath(nextPath))

  if (message) {
    params.set("message", message)
  }

  return `${LOGIN_ROUTE}?${params.toString()}`
}

export function resolveAuthRoute({
  pathname = "/",
  search = "",
  isAuthenticated = false,
  hasAuthenticatedBefore = false,
  loading = false,
} = {}) {
  const path = normalizePath(pathname)

  if (loading) return { type: "loading" }

  if (search.includes("app=true")) {
    return { type: "redirect", to: APP_ROUTE, replace: true }
  }

  if (path === DASHBOARD_ROUTE) {
    return {
      type: "redirect",
      to: isAuthenticated ? APP_ROUTE : buildLoginPath(APP_ROUTE),
      replace: true,
    }
  }

  if (path === AUTH_CALLBACK_ROUTE) {
    return { type: "auth-callback" }
  }

  if (isAuthenticated && (path === "/" || path === DISCOVER_ROUTE || isPublicOnlyPath(path))) {
    return { type: "redirect", to: APP_ROUTE, replace: true }
  }

  if (!isAuthenticated && path === "/" && hasAuthenticatedBefore) {
    return { type: "redirect", to: LOGIN_ROUTE, replace: true }
  }

  if (!isAuthenticated && path === APP_ROUTE) {
    return {
      type: "redirect",
      to: buildLoginPath(APP_ROUTE),
      replace: true,
    }
  }

  if (!isAuthenticated && path === GOOD_DEALS_REVIEW_ADMIN_ROUTE) {
    return {
      type: "redirect",
      to: buildLoginPath(GOOD_DEALS_REVIEW_ADMIN_ROUTE),
      replace: true,
    }
  }

  if (path === LOGIN_ROUTE) {
    return { type: "render", page: "login", next: getNextFromSearch(search) }
  }

  if (path === REGISTER_ROUTE) {
    return { type: "render", page: "register", next: getNextFromSearch(search) }
  }

  if (path === APP_ROUTE) {
    return { type: "render", page: "app" }
  }

  if (path === GOOD_DEALS_REVIEW_ADMIN_ROUTE) {
    return { type: "render", page: "admin-good-deals-review" }
  }

  if (isPremiumPath(path)) {
    return { type: "render", page: "premium" }
  }

  if (PUBLIC_PAGES.has(path)) {
    return { type: "render", page: path === "/" || path === DISCOVER_ROUTE ? "home" : path.slice(1) }
  }

  return { type: "render", page: "home" }
}

export function markAuthenticatedDevice() {
  if (typeof window === "undefined") return

  try {
    window.localStorage.setItem(HAS_AUTHENTICATED_KEY, "true")
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

export function hasAuthenticatedDevice() {
  if (typeof window === "undefined") return false

  try {
    return window.localStorage.getItem(HAS_AUTHENTICATED_KEY) === "true"
  } catch {
    return false
  }
}

export function navigate(path, { replace = false } = {}) {
  if (typeof window === "undefined") return

  const target = path || "/"
  if (replace) {
    window.history.replaceState({}, "", target)
  } else {
    window.history.pushState({}, "", target)
  }

  window.dispatchEvent(new Event(ROUTE_CHANGE_EVENT))
}

export function getCurrentLocation() {
  if (typeof window === "undefined") {
    return { pathname: "/", search: "" }
  }

  return {
    pathname: window.location.pathname,
    search: window.location.search,
  }
}

export function getAuthCallbackUrl() {
  if (typeof window === "undefined") return AUTH_CALLBACK_ROUTE
  return `${window.location.origin}${AUTH_CALLBACK_ROUTE}`
}

export function getResetPasswordRedirectUrl() {
  if (typeof window === "undefined") return "/reset-password"
  return `${window.location.origin}/reset-password`
}

export function mapAuthError(error, fallbackMessage = "Erreur d'authentification.") {
  const raw = `${error?.code || ""} ${error?.message || ""}`.toLowerCase()

  if (raw.includes("invalid login") || raw.includes("invalid_credentials")) {
    return "Email ou mot de passe incorrect."
  }

  if (raw.includes("email not confirmed")) {
    return "Votre email n'est pas encore confirmé. Vérifiez votre boîte mail."
  }

  if (raw.includes("rate limit") || raw.includes("too many")) {
    return "Trop de tentatives. Réessayez dans quelques minutes."
  }

  if (raw.includes("user already registered") || raw.includes("already registered")) {
    return "Un compte existe déjà avec cet email."
  }

  if (raw.includes("weak password")) {
    return "Le mot de passe est trop faible."
  }

  if (raw.includes("network") || raw.includes("failed to fetch")) {
    return "Connexion impossible. Vérifiez votre réseau puis réessayez."
  }

  return fallbackMessage
}
