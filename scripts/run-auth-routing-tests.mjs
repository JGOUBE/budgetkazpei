import assert from "node:assert/strict"
import {
  APP_ROUTE,
  AUTH_CALLBACK_ROUTE,
  DISCOVER_ROUTE,
  LOGIN_ROUTE,
  REGISTER_ROUTE,
  buildLoginPath,
  getAuthCallbackUrl,
  mapAuthError,
  resolveAuthRoute,
  sanitizeNextPath,
} from "../src/services/authNavigation.js"
import {
  resetPasswordForEmailAuth,
  signInWithGoogleAuth,
  signInWithPasswordAuth,
  signUpWithEmailAuth,
} from "../src/services/authSupabase.js"

function route(pathname, { search = "", isAuthenticated = false, hasAuthenticatedBefore = false, loading = false } = {}) {
  return resolveAuthRoute({ pathname, search, isAuthenticated, hasAuthenticatedBefore, loading })
}

const cases = [
  ["loading keeps neutral screen", route("/", { loading: true }), { type: "loading" }],
  ["guest home is public", route("/"), { type: "render", page: "home" }],
  ["known logged-out home redirects login", route("/", { hasAuthenticatedBefore: true }), { type: "redirect", to: LOGIN_ROUTE, replace: true }],
  ["guest discover shows public offers", route(DISCOVER_ROUTE), { type: "render", page: "premium" }],
  ["known logged-out discover shows public offers", route(DISCOVER_ROUTE, { hasAuthenticatedBefore: true }), { type: "render", page: "premium" }],
  ["guest login renders login", route(LOGIN_ROUTE), { type: "render", page: "login", next: APP_ROUTE }],
  ["guest register renders register", route(REGISTER_ROUTE), { type: "render", page: "register", next: APP_ROUTE }],
  ["guest app redirects to login next app", route(APP_ROUTE), { type: "redirect", to: buildLoginPath(APP_ROUTE), replace: true }],
  ["guest dashboard redirects to login next app", route("/dashboard"), { type: "redirect", to: buildLoginPath(APP_ROUTE), replace: true }],
  ["guest auth callback waits callback", route(AUTH_CALLBACK_ROUTE), { type: "auth-callback" }],
  ["guest premium stays public", route("/premium"), { type: "render", page: "premium" }],
  ["guest premium child stays public", route("/premium/offre"), { type: "render", page: "premium" }],
  ["guest privacy stays public", route("/privacy"), { type: "render", page: "privacy" }],
  ["guest terms stays public", route("/terms"), { type: "render", page: "terms" }],
  ["guest deletion page stays public", route("/suppression-compte"), { type: "render", page: "suppression-compte" }],
  ["guest reset page stays public", route("/reset-password"), { type: "render", page: "reset-password" }],
  ["connected home redirects app", route("/", { isAuthenticated: true }), { type: "redirect", to: APP_ROUTE, replace: true }],
  ["connected login redirects app", route(LOGIN_ROUTE, { isAuthenticated: true }), { type: "redirect", to: APP_ROUTE, replace: true }],
  ["connected register redirects app", route(REGISTER_ROUTE, { isAuthenticated: true }), { type: "redirect", to: APP_ROUTE, replace: true }],
  ["connected discover shows public offers", route(DISCOVER_ROUTE, { isAuthenticated: true }), { type: "render", page: "premium" }],
  ["connected dashboard redirects app", route("/dashboard", { isAuthenticated: true }), { type: "redirect", to: APP_ROUTE, replace: true }],
  ["connected app renders app", route(APP_ROUTE, { isAuthenticated: true }), { type: "render", page: "app" }],
  ["connected callback remains callback", route(AUTH_CALLBACK_ROUTE, { isAuthenticated: true }), { type: "auth-callback" }],
  ["legacy app query redirects app", route("/", { search: "?app=true" }), { type: "redirect", to: APP_ROUTE, replace: true }],
  ["login next dashboard normalizes app", route(LOGIN_ROUTE, { search: "?next=/dashboard" }), { type: "render", page: "login", next: APP_ROUTE }],
]

for (const [name, actual, expected] of cases) {
  assert.deepEqual(actual, expected, name)
}

assert.equal(sanitizeNextPath("/app"), APP_ROUTE)
assert.equal(sanitizeNextPath("/dashboard"), APP_ROUTE)
assert.equal(sanitizeNextPath("https://evil.example/app"), APP_ROUTE)
assert.equal(sanitizeNextPath("//evil.example/app"), APP_ROUTE)
assert.equal(sanitizeNextPath("javascript:alert(1)"), APP_ROUTE)
assert.equal(sanitizeNextPath("/premium"), APP_ROUTE)

for (const origin of [
  "http://localhost:5175",
  "http://127.0.0.1:5196",
  "https://budgetkazpei.vercel.app",
]) {
  globalThis.window = { location: { origin } }
  assert.equal(getAuthCallbackUrl(), `${origin}${AUTH_CALLBACK_ROUTE}`)
}
delete globalThis.window

assert.equal(mapAuthError({ message: "Invalid login credentials" }), "Email ou mot de passe incorrect.")
assert.equal(
  mapAuthError({ message: "Email not confirmed" }),
  "Votre email n'est pas encore confirmé. Vérifiez votre boîte mail."
)
assert.equal(mapAuthError({ message: "User already registered" }), "Un compte existe déjà avec cet email.")

const calls = []
const mockSupabase = {
  auth: {
    signInWithPassword(payload) {
      calls.push(["signInWithPassword", payload])
      return Promise.resolve({ data: { session: { user: { id: "user-1" } } }, error: null })
    },
    signUp(payload) {
      calls.push(["signUp", payload])
      return Promise.resolve({ data: { user: { id: "user-2" }, session: null }, error: null })
    },
    resetPasswordForEmail(email, payload) {
      calls.push(["resetPasswordForEmail", email, payload])
      return Promise.resolve({ data: {}, error: null })
    },
    signInWithOAuth(payload) {
      calls.push(["signInWithOAuth", payload])
      return Promise.resolve({ data: {}, error: null })
    },
  },
}

await signInWithPasswordAuth(mockSupabase, "demo@example.com", "secret")
await signUpWithEmailAuth(mockSupabase, {
  email: "new@example.com",
  password: "secret",
  nom: "Demo",
  emailRedirectTo: "http://localhost:5173/auth/callback",
})
await resetPasswordForEmailAuth(mockSupabase, {
  email: "demo@example.com",
  redirectTo: "http://localhost:5173/reset-password",
})
await signInWithGoogleAuth(mockSupabase, {
  redirectTo: "http://localhost:5173/auth/callback",
})

assert.deepEqual(calls[0], [
  "signInWithPassword",
  { email: "demo@example.com", password: "secret" },
])
assert.deepEqual(calls[1], [
  "signUp",
  {
    email: "new@example.com",
    password: "secret",
    options: {
      data: { name: "Demo" },
      emailRedirectTo: "http://localhost:5173/auth/callback",
    },
  },
])
assert.deepEqual(calls[2], [
  "resetPasswordForEmail",
  "demo@example.com",
  { redirectTo: "http://localhost:5173/reset-password" },
])
assert.deepEqual(calls[3], [
  "signInWithOAuth",
  {
    provider: "google",
    options: {
      redirectTo: "http://localhost:5173/auth/callback",
      queryParams: { prompt: "select_account" },
    },
  },
])

console.log("Auth routing tests passed.")
