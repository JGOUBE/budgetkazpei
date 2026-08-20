import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  APP_ROUTE,
  DISCOVER_ROUTE,
  LOGIN_ROUTE,
  REGISTER_ROUTE,
  getAuthCallbackUrl,
  resolveAuthRoute,
} from "../src/services/authNavigation.js"
import {
  FREE_OPERATIONAL_SCAN_LIMIT,
  PLAN_IDS,
  PLAN_PRICES,
  PLAN_SCAN_LIMITS,
  PLAN_SCAN_POLICY,
  PREMIUM_PLUS_SAFETY_MESSAGE,
  PREMIUM_PLUS_SAFETY_SCAN_LIMIT,
  PUBLIC_PLAN_CARDS,
  getPlanFlags,
  getPlanPublicScanLabel,
  getPlanScanLimit,
  normalizePlan,
} from "../src/config/plans.js"

const root = process.cwd()
const read = file => readFileSync(join(root, file), "utf8")

function route(pathname, options = {}) {
  return resolveAuthRoute({ pathname, ...options })
}

assert.deepEqual(route("/", { isAuthenticated: true }), { type: "redirect", to: APP_ROUTE, replace: true })
assert.deepEqual(route(LOGIN_ROUTE, { isAuthenticated: true }), { type: "redirect", to: APP_ROUTE, replace: true })
assert.deepEqual(route(REGISTER_ROUTE, { isAuthenticated: true }), { type: "redirect", to: APP_ROUTE, replace: true })
assert.deepEqual(route(DISCOVER_ROUTE, { isAuthenticated: true }), { type: "render", page: "premium" })
assert.deepEqual(route("/"), { type: "render", page: "home" })
assert.deepEqual(route("/", { hasAuthenticatedBefore: true }), { type: "redirect", to: LOGIN_ROUTE, replace: true })
assert.deepEqual(route(DISCOVER_ROUTE, { hasAuthenticatedBefore: true }), { type: "render", page: "premium" })
assert.deepEqual(route(APP_ROUTE, { hasAuthenticatedBefore: true }), {
  type: "redirect",
  to: `${LOGIN_ROUTE}?next=%2Fapp`,
  replace: true,
})
assert.deepEqual(route("/", { loading: true, hasAuthenticatedBefore: true }), { type: "loading" })

const authContext = read("src/context/AuthContext.jsx")
const authSupabase = read("src/services/authSupabase.js")
const authCallback = read("src/components/auth/AuthCallbackPage.jsx")
assert.match(authContext, /HAS_AUTHENTICATED_KEY|hasAuthenticatedDevice|markAuthenticatedDevice/, "local marker must be wired")
assert.match(authContext, /navigate\("\/login", \{ replace: true \}\)/, "signOut must return to login")
assert.doesNotMatch(authContext, /localStorage\.setItem\([^)]*(email|token|jwt|user|profile|plan)/i, "marker must not store personal data")
for (const origin of ["http://localhost:5175", "http://127.0.0.1:5196", "https://budgetkazpei.vercel.app"]) {
  globalThis.window = { location: { origin } }
  assert.equal(getAuthCallbackUrl(), `${origin}/auth/callback`)
}
delete globalThis.window
assert.match(authSupabase, /signInWithOAuth/, "Google OAuth wrapper must call Supabase OAuth")
assert.match(authSupabase, /redirectTo,/, "Google OAuth wrapper must pass redirectTo")
assert.doesNotMatch(authContext, /budgetkazpei\.vercel\.app[\s\S]{0,120}auth\/callback/, "Auth flow must not hard-code Vercel callback")
assert.match(authCallback, /return <AuthLoadingScreen \/>/, "Callback must keep loading screen while session is restored")
assert.match(authCallback, /navigate\(getStoredNext\(\), \{ replace: true \}\)/, "Callback must replace-navigate after valid session")
assert.match(authCallback, /navigate\(LOGIN_ROUTE, \{ replace: true \}\)/, "Callback error must offer login")
assert.doesNotMatch(authCallback, /PublicHomePage|navigate\("\/"|\/#/, "Callback must not show landing or route to root/hash")

const login = read("src/components/auth/LoginPage.jsx")
const register = read("src/components/auth/RegisterPage.jsx")
assert.match(login, /REGISTER_ROUTE/, "Login must link to register")
assert.match(login, /DISCOVER_ROUTE/, "Login must link to discover")
assert.match(register, /LOGIN_ROUTE/, "Register must link to login")
assert.match(register, /DISCOVER_ROUTE/, "Register must link to discover")
assert.doesNotMatch(login, /Commencer gratuitement/, "Login must not use public free CTA wording")

const app = read("src/App.jsx")
assert.match(app, /hasAuthenticatedBefore: Boolean\(auth\.hasAuthenticatedBefore\)/, "App must pass known-device marker to router")
assert.match(app, /getPlanFlags/, "App must use central plan flags")
assert.doesNotMatch(app, /isAdmin\s*\|\|[\s\S]{0,120}premium/i, "Admin must not replace a paid plan")

const landingCss = read("src/styles/landing.css")
const headerBlock = landingCss.match(/\.landing-header\s*\{[\s\S]*?\n\}/)?.[0] || ""
assert.doesNotMatch(headerBlock, /backdrop-filter|blur\(18px\)/, "Landing header must not use blur(18px)")
const mobileMenuBlock = landingCss.match(/\.landing-mobile-menu__backdrop\s*\{[\s\S]*?\n\}/)?.[0] || ""
assert.doesNotMatch(mobileMenuBlock, /backdrop-filter|blur\(/, "Mobile menu backdrop must not use blur")

const landingHeader = read("src/components/landing/LandingHeader.jsx")
assert.match(landingHeader, /key === "Escape"/, "Mobile menu must close on Escape")
assert.match(landingHeader, /requestAnimationFrame\(\(\) => menuButtonRef\.current\?\.focus\(\)\)/, "Mobile menu must restore focus")
assert.match(landingHeader, /onNavigate=\{\(\) => closeMenu\(\)\}/, "Mobile menu must close after navigation")

assert.equal(normalizePlan("free"), PLAN_IDS.free)
assert.equal(normalizePlan("premium"), PLAN_IDS.premium)
assert.equal(normalizePlan("premium_plus"), PLAN_IDS.premiumPlus)
assert.equal(normalizePlan("Premium+"), PLAN_IDS.premiumPlus)
assert.deepEqual(getPlanFlags("premium_plus"), { plan: PLAN_IDS.premiumPlus, isPremium: true, isPremiumPlus: true })
assert.deepEqual(getPlanFlags("premium"), { plan: PLAN_IDS.premium, isPremium: true, isPremiumPlus: false })
assert.deepEqual(getPlanFlags("free"), { plan: PLAN_IDS.free, isPremium: false, isPremiumPlus: false })
assert.equal(PLAN_PRICES[PLAN_IDS.free], "0 €")
assert.equal(PLAN_PRICES[PLAN_IDS.premium], "2,99 €/mois")
assert.equal(PLAN_PRICES[PLAN_IDS.premiumPlus], "4,99 €/mois")

assert.equal(FREE_OPERATIONAL_SCAN_LIMIT, 1)
assert.equal(PLAN_SCAN_POLICY[PLAN_IDS.free].commercialScanLimit, null)
assert.equal(PLAN_SCAN_POLICY[PLAN_IDS.free].operationalScanLimit, FREE_OPERATIONAL_SCAN_LIMIT)
assert.equal(PLAN_SCAN_POLICY[PLAN_IDS.free].needsCommercialValidation, true)
assert.equal(getPlanPublicScanLabel(PLAN_IDS.free), "Accès découverte au scanner")
assert.equal(PLAN_SCAN_LIMITS[PLAN_IDS.free], FREE_OPERATIONAL_SCAN_LIMIT)

assert.equal(PLAN_SCAN_POLICY[PLAN_IDS.premium].commercialScanLimit, 10)
assert.equal(PLAN_SCAN_POLICY[PLAN_IDS.premium].operationalScanLimit, 10)
assert.equal(getPlanScanLimit(PLAN_IDS.premium), 10)
assert.equal(getPlanPublicScanLabel(PLAN_IDS.premium), "10 scans par mois")

assert.equal(PREMIUM_PLUS_SAFETY_SCAN_LIMIT, 50)
assert.equal(PLAN_SCAN_POLICY[PLAN_IDS.premiumPlus].commercialScanLimit, null)
assert.equal(PLAN_SCAN_POLICY[PLAN_IDS.premiumPlus].operationalScanLimit, 50)
assert.equal(PLAN_SCAN_POLICY[PLAN_IDS.premiumPlus].isUnlimitedForUser, true)
assert.equal(PLAN_SCAN_POLICY[PLAN_IDS.premiumPlus].isSafetyLimited, true)
assert.equal(getPlanPublicScanLabel(PLAN_IDS.premiumPlus), "Scans illimités")
assert.match(PREMIUM_PLUS_SAFETY_MESSAGE, /nombre inhabituel de scans/, "Premium+ safety message missing")
assert.notDeepEqual(
  [PLAN_SCAN_LIMITS[PLAN_IDS.free], PLAN_SCAN_LIMITS[PLAN_IDS.premium], PLAN_SCAN_LIMITS[PLAN_IDS.premiumPlus]],
  [10, 30, 100],
  "scanner quotas must not regress to 10/30/100",
)

const scanLimits = read("src/config/scanLimits.ts")
assert.match(scanLimits, /PLAN_SCAN_LIMITS/, "scanLimits must use central quota source")

const publicTexts = [
  read("src/components/landing/landingContent.js"),
  read("src/pages/PublicHomePage.jsx"),
  read("src/pages/PremiumLandingPage.jsx"),
].join("\n")
assert.doesNotMatch(publicTexts, /\b50\b|50 sur 50/, "Public marketing must not expose Premium+ safety limit")
assert.doesNotMatch(publicTexts, /Gratuit[\s\S]{0,120}\b(?:1|5|10)\s+scans?\b/i, "Free plan must not expose a definitive numeric scanner quota")
assert.match(read("src/config/plans.js"), /10 scans par mois/, "Premium public quota must be defined centrally")
assert.ok(PUBLIC_PLAN_CARDS.find(plan => plan.id === PLAN_IDS.premium)?.items.some(item => item.text === "10 scans par mois"), "Premium public quota must be visible")
assert.ok(PUBLIC_PLAN_CARDS.find(plan => plan.id === PLAN_IDS.premiumPlus)?.items.some(item => item.text === "Scans illimités"), "Premium+ must be commercially unlimited in public wording")
assert.equal(PUBLIC_PLAN_CARDS.length, 3)
assert.match(read("src/config/plans.js"), /PLAN_FEATURE_STATUS\.soon|soon/, "Future features must be labelled")

const main = read("src/main.jsx")
assert.match(main, /data-app-version/, "App version must be exposed discreetly on root")

console.log("Plans and routing tests passed.")
