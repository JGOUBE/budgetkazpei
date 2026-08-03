import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import React from "react"
import { renderToString } from "react-dom/server"
import { createServer } from "vite"
import {
  FREE_OPERATIONAL_SCAN_LIMIT,
  MONTHLY_QUOTA_REACHED_CODE,
  PLAN_FEATURE_STATUS,
  PLAN_IDS,
  PLAN_NAMES,
  PLAN_PRICES,
  PLAN_SCAN_POLICY,
  PREMIUM_PLUS_SAFETY_MESSAGE,
  PREMIUM_PLUS_SAFETY_SCAN_LIMIT,
  PUBLIC_PLAN_CARDS,
  SCAN_SAFETY_LIMIT_REACHED_CODE,
  getPlanQuotaExceededCode,
  getPlanScanPolicy,
  getPlanScanLimit,
  normalizePlan,
} from "../src/config/plans.js"

const root = process.cwd()
const read = file => readFileSync(join(root, file), "utf8")

const targetedTextFiles = [
  "src/config/plans.js",
  "src/pages/PublicHomePage.jsx",
  "src/components/landing/landingContent.js",
  "src/components/landing/PricingSection.jsx",
  "src/components/landing/LandingHeader.jsx",
  "src/components/landing/FinalCTA.jsx",
  "src/pages/PremiumLandingPage.jsx",
  "src/components/premium/PremiumPage.jsx",
  "src/features/receipts/hooks/useReceiptQuota.js",
  "src/features/receipts/pages/ReceiptsPage.jsx",
  "src/services/scan/receiptScannerApi.ts",
]

const targetedPublicTexts = targetedTextFiles
  .filter(file => !file.includes("plans.js") && !file.includes("ReceiptsPage") && !file.includes("useReceiptQuota") && !file.includes("receiptScannerApi"))
  .map(read)
  .join("\n")

const allTargetedTexts = targetedTextFiles.map(read).join("\n")
const app = read("src/App.jsx")
const pricing = read("src/components/landing/PricingSection.jsx")
const landingContent = read("src/components/landing/landingContent.js")
const publicHome = read("src/pages/PublicHomePage.jsx")
const premiumLanding = read("src/pages/PremiumLandingPage.jsx")
const premiumPage = read("src/components/premium/PremiumPage.jsx")
const receiptQuota = read("src/features/receipts/hooks/useReceiptQuota.js")
const receiptsPage = read("src/features/receipts/pages/ReceiptsPage.jsx")
const scannerApi = read("src/services/scan/receiptScannerApi.ts")
const scanUsage = read("src/services/scan/scanUsageService.ts")
const scannerTypes = read("src/services/scan/receiptScannerTypes.ts")
const migration = read("supabase/migrations/202607180001_receipt_scan_server_quota.sql")
const pythonQuota = read("services/receipt-scanner/receipt_scanner/quota.py")
const pythonErrors = read("services/receipt-scanner/receipt_scanner/api/errors.py")

function lineNumberOf(text, pattern) {
  const match = text.match(pattern)
  if (!match || match.index == null) return -1
  return text.slice(0, match.index).split("\n").length
}

async function loadReceiptsPageComponent() {
  const viteServer = await createServer({
    appType: "custom",
    logLevel: "error",
    server: {
      middlewareMode: true,
    },
  })

  try {
    const module = await viteServer.ssrLoadModule("/src/features/receipts/pages/ReceiptsPage.jsx")
    return module.default
  } finally {
    await viteServer.close()
  }
}

function createReceiptsPageProps(overrides = {}) {
  return {
    user: null,
    t: key => key,
    isMobile: false,
    isPremium: false,
    isPremiumPlus: false,
    subscriptionLoading: false,
    onAddTransaction: () => {},
    onOpenReceipts: () => {},
    onOpenShoppingList: () => {},
    ...overrides,
  }
}

const ReceiptsPageComponent = await loadReceiptsPageComponent()

function renderReceiptsPageSsr(overrides = {}) {
  return renderToString(
    React.createElement(
      ReceiptsPageComponent,
      createReceiptsPageProps(overrides),
    ),
  )
}

function resolveReceiptQuotaStatePure({
  usage = null,
  fallbackUsed = 0,
  fallbackPlan = "free",
  source = "scan_usage",
} = {}) {
  const plan = normalizePlan(usage?.plan || fallbackPlan || "free")
  const used = Number(usage?.used ?? usage?.aiUsed ?? fallbackUsed ?? 0)
  const policy = getPlanScanPolicy(plan)
  const limit = getPlanScanLimit(plan)
  const remaining = Math.max(limit - used, 0)
  const reached = remaining <= 0

  return {
    used,
    limit,
    remaining,
    reached,
    isUnlimitedForUser: policy.isUnlimitedForUser,
    isSafetyLimited: policy.isSafetyLimited,
    safetyLimitReached: policy.isSafetyLimited && reached,
    plan,
    planLabel: PLAN_NAMES[plan],
    source,
  }
}

function formatReceiptQuotaTicketsLabelFrPure(quota) {
  return quota?.isUnlimitedForUser
    ? `Premium+ actif \u2014 Utilisation du mois : ${quota.used}`
    : `Analyses IA : ${quota.used} / ${quota.limit} \u2014 ${quota.planLabel}`
}

function getReceiptQuotaBlockingMessagePure(quota, txt) {
  return quota?.safetyLimitReached ? txt.intensiveUsage : txt.quotaReached
}

function resolveScanUsageSnapshotPure(data, fallbackPlan = "free") {
  return {
    used: Number(data?.ai_scan_count ?? data?.scan_count ?? 0),
    aiUsed: Number(data?.ai_scan_count || 0),
    manualUsed: Number(data?.manual_count || 0),
    plan: normalizePlan(data?.plan || fallbackPlan || "free"),
  }
}

assert.doesNotMatch(
  allTargetedTexts,
  /Ã|â‚¬|â€|ðŸ|âœ|�/,
  "targeted quota and offer texts must not contain mojibake remnants",
)

assert.equal(PLAN_PRICES[PLAN_IDS.free], "0 €")
assert.equal(PLAN_PRICES[PLAN_IDS.premium], "2,99 €/mois")
assert.equal(PLAN_PRICES[PLAN_IDS.premiumPlus], "4,99 €/mois")
assert.equal(FREE_OPERATIONAL_SCAN_LIMIT, 1)
assert.equal(getPlanScanLimit(PLAN_IDS.premium), 10)
assert.equal(PREMIUM_PLUS_SAFETY_SCAN_LIMIT, 50)
assert.equal(PLAN_SCAN_POLICY[PLAN_IDS.premiumPlus].commercialScanLimit, null)
assert.equal(PLAN_SCAN_POLICY[PLAN_IDS.premiumPlus].operationalScanLimit, 50)
assert.equal(PLAN_SCAN_POLICY[PLAN_IDS.premiumPlus].isUnlimitedForUser, true)
assert.equal(PLAN_SCAN_POLICY[PLAN_IDS.premiumPlus].isSafetyLimited, true)
assert.equal(getPlanQuotaExceededCode(PLAN_IDS.free), MONTHLY_QUOTA_REACHED_CODE)
assert.equal(getPlanQuotaExceededCode(PLAN_IDS.premium), MONTHLY_QUOTA_REACHED_CODE)
assert.equal(getPlanQuotaExceededCode(PLAN_IDS.premiumPlus), SCAN_SAFETY_LIMIT_REACHED_CODE)
assert.match(PREMIUM_PLUS_SAFETY_MESSAGE, /nombre inhabituel de scans ce mois-ci/i)
assert.match(PREMIUM_PLUS_SAFETY_MESSAGE, /Par sécurité/i)

assert.doesNotMatch(targetedPublicTexts, /\b50\b|50 sur 50/, "Premium+ safety limit must not be visible in public offer texts")
assert.doesNotMatch(targetedPublicTexts, /Gratuit[\s\S]{0,160}\b1\s+scan/i, "free public offer must not expose the provisional numeric quota")
assert.ok(PUBLIC_PLAN_CARDS.find(plan => plan.id === PLAN_IDS.premium)?.items.some(item => item.text === "10 scans par mois"), "Premium public quota must be visible")
assert.ok(PUBLIC_PLAN_CARDS.find(plan => plan.id === PLAN_IDS.premiumPlus)?.items.some(item => /Scans illimit/i.test(item.text)), "Premium+ public quota must stay commercially unlimited")
assert.ok(PUBLIC_PLAN_CARDS.every(plan => plan.items.every(item => Object.values(PLAN_FEATURE_STATUS).includes(item.status))), "all public plan features must have a status")
assert.ok(PUBLIC_PLAN_CARDS.some(plan => plan.items.some(item => item.status === PLAN_FEATURE_STATUS.soon)), "future features must use a dedicated soon status")

assert.match(receiptQuota, /subscription_loading/, "receipt quota hook must keep a dedicated subscription loading state")
assert.match(receiptQuota, /getReceiptQuotaBlockingMessage/, "receipt quota hook must expose a shared quota blocking helper")
assert.match(receiptQuota, /Premium\+ actif \u2014 Utilisation du mois : \$\{quota\.used\}/, "receipt quota helper must expose the Premium+ usage label without surfacing the safety limit")
assert.match(receiptsPage, /Chargement de votre formule en cours/, "Receipts page must show a loading state instead of a temporary free label")
assert.match(receiptsPage, /formatReceiptQuotaTicketsLabelFr|formatReceiptQuotaTicketsLabelKr/, "Receipts page must render the shared ticket quota label helper")
assert.match(receiptsPage, /subscriptionLoading/, "Receipts page must receive the subscription loading flag")
assert.match(receiptsPage, /getReceiptQuotaBlockingMessage/, "Receipts page must classify scanner blocking messages through the shared quota helper")
assert.doesNotMatch(receiptsPage, /premium_plus"\s*\?\s*txt\.intensiveUsage/, "Premium+ scanner blocking must not be tied directly to the plan name")
assert.doesNotMatch(receiptsPage, /50 sur 50|tous vos scans/, "Receipts page must not expose Premium+ as a normal 50 quota")

const premiumPlusDisplayQuota = resolveReceiptQuotaStatePure({
  usage: { used: 0, aiUsed: 0, manualUsed: 0, plan: "premium_plus" },
  fallbackPlan: "free",
  source: "scan_usage",
})
assert.equal(formatReceiptQuotaTicketsLabelFrPure(premiumPlusDisplayQuota), "Premium+ actif \u2014 Utilisation du mois : 0")
assert.equal(premiumPlusDisplayQuota.used, 0)
assert.equal(premiumPlusDisplayQuota.plan, "premium_plus")
assert.equal(premiumPlusDisplayQuota.reached, false)
assert.equal(premiumPlusDisplayQuota.safetyLimitReached, false)
assert.equal(getReceiptQuotaBlockingMessagePure(premiumPlusDisplayQuota, { intensiveUsage: "safety", quotaReached: "quota" }), "quota")
assert.doesNotMatch(formatReceiptQuotaTicketsLabelFrPure(premiumPlusDisplayQuota), /Gratuit|0 \/ 50|50/, "Premium+ empty-month label must not fall back to Free or expose the safety threshold")

const premiumPlusFortyNineQuota = resolveReceiptQuotaStatePure({
  usage: { used: 49, aiUsed: 49, manualUsed: 0, plan: "premium_plus" },
  fallbackPlan: "free",
  source: "scan_usage",
})
assert.equal(premiumPlusFortyNineQuota.reached, false)
assert.equal(premiumPlusFortyNineQuota.safetyLimitReached, false)
assert.equal(formatReceiptQuotaTicketsLabelFrPure(premiumPlusFortyNineQuota), "Premium+ actif \u2014 Utilisation du mois : 49")
assert.doesNotMatch(formatReceiptQuotaTicketsLabelFrPure(premiumPlusFortyNineQuota), /50|Gratuit/, "Premium+ 49-use label must stay commercial and must not expose the safety threshold")

const premiumPlusSafetyQuota = resolveReceiptQuotaStatePure({
  usage: { used: 50, aiUsed: 50, manualUsed: 0, plan: "premium_plus" },
  fallbackPlan: "free",
  source: "scan_usage",
})
assert.equal(premiumPlusSafetyQuota.reached, true)
assert.equal(premiumPlusSafetyQuota.safetyLimitReached, true)
assert.equal(formatReceiptQuotaTicketsLabelFrPure(premiumPlusSafetyQuota), "Premium+ actif \u2014 Utilisation du mois : 50")
assert.equal(getReceiptQuotaBlockingMessagePure(premiumPlusSafetyQuota, { intensiveUsage: "safety", quotaReached: "quota" }), "safety")
assert.doesNotMatch(formatReceiptQuotaTicketsLabelFrPure(premiumPlusSafetyQuota), /0 \/ 50|Quota atteint|Gratuit/, "Premium+ 50-use label must not become a commercial quota label")

const emptyMonthSnapshot = resolveScanUsageSnapshotPure(null, "premium_plus")
assert.equal(emptyMonthSnapshot.plan, "premium_plus")
assert.equal(emptyMonthSnapshot.used, 0)

assert.match(scanUsage, /resolveScanUsageSnapshot/, "scan usage service must centralize plan fallback resolution")
assert.match(scanUsage, /data\?\.plan \|\| fallbackPlan/, "scan usage service must keep the resolved subscription plan when scan_usage has no row yet")
assert.match(receiptQuota, /source: subscriptionLoading \? "subscription_loading" : "scan_usage"/, "receipt quota hook must expose an explicit subscription loading state instead of defaulting to free")
assert.match(receiptQuota, /if \(subscriptionLoading\)/, "receipt quota hook must short-circuit while the subscription plan is still loading")
assert.match(receiptQuota, /fallbackPlan,\s*source: "scan_usage_error"/, "receipt quota hook must keep the resolved plan even when scan usage loading fails")
assert.match(receiptsPage, /const automatedScanDisabled = busy \|\| quota\.loading/, "Receipts page must disable automated scan buttons only while busy or still loading the subscription state")
assert.match(receiptsPage, /if \(quota\.loading\)[\s\S]{0,160}txt\.quotaLoading/, "Receipts page must show a loading message instead of applying a default free quota")
assert.doesNotMatch(receiptsPage, /passez à Premium\+|passer à Premium\+/i, "Receipts page must not upsell Premium+ when the safety guard is reached")

const busyDeclarationLine = lineNumberOf(receiptsPage, /const \[busy,\s*setBusy\] = useState\(false\)/)
const busyFirstUsageLine = lineNumberOf(receiptsPage, /const automatedScanDisabled = busy \|\| quota\.loading/)
assert.ok(busyDeclarationLine > 0, "Receipts page must declare busy state")
assert.ok(busyFirstUsageLine > 0, "Receipts page must compute automatedScanDisabled from busy")
assert.ok(busyDeclarationLine < busyFirstUsageLine, "busy must be declared before its first use to avoid a Temporal Dead Zone crash")
assert.match(receiptsPage, /subscriptionLoading = false/, "Receipts page props must support an initial subscriptionLoading render")
assert.match(receiptsPage, /userId: user\?\.id,[\s\S]{0,120}subscriptionLoading/, "Receipts page must pass subscriptionLoading into the quota hook during initial render")
assert.match(receiptsPage, /const automatedScanDisabled = busy \|\| quota\.loading/, "Receipts page initial render must derive disabled state from declared busy and quota loading")

assert.doesNotThrow(() => {
  renderReceiptsPageSsr({
    user: { id: "subscription-loading-user" },
    subscriptionLoading: true,
  })
}, "Receipts page initial SSR render must not crash while subscriptionLoading is true")

const premiumPlusEmptyMarkup = renderReceiptsPageSsr({
  isPremium: true,
  isPremiumPlus: true,
})
assert.match(premiumPlusEmptyMarkup, /Premium\+ actif/, "Receipts page Premium+ SSR render must stay stable when no scan_usage row exists yet")

assert.doesNotThrow(() => {
  renderReceiptsPageSsr({
    user: { id: "transition-user" },
    subscriptionLoading: true,
  })
  renderReceiptsPageSsr({
    isPremium: true,
    isPremiumPlus: true,
    subscriptionLoading: false,
  })
}, "Receipts page SSR render sequence must stay stable when subscriptionLoading changes from true to false")

assert.match(app, /\.eq\("status", "active"\)/, "subscription plan lookup must target only active subscriptions")
assert.match(app, /setSubscriptionPlan\(profile\?\.plan \|\| "free"\)/, "expired or missing subscriptions must fall back explicitly only after the active-subscription lookup completes")
assert.match(app, /setSubscriptionLoading\(true\)/, "App must expose a loading state while the active subscription is being resolved")
assert.match(app, /setSubscriptionLoading\(false\)/, "App must clear the subscription loading state after resolution")
assert.match(app, /\}, \[user\?\.id, profile\?\.plan\]\)/, "App must refresh the resolved plan when the profile plan changes without a full reload")
assert.match(app, /currentPlan=\{plan\}/, "Premium page must receive the resolved current plan from App")
assert.match(app, /subscriptionLoading=\{profileLoading \|\| subscriptionLoading\}/, "Receipts and Premium pages must receive the shared subscription loading flag")

assert.match(scannerTypes, /monthly_quota_reached/, "front error types must include monthly quota code")
assert.match(scannerTypes, /scan_safety_limit_reached/, "front error types must include safety limit code")
assert.match(scannerApi, /monthly_quota_reached/, "front API must map monthly quota code")
assert.match(scannerApi, /scan_safety_limit_reached/, "front API must map safety limit code")

assert.match(migration, /Indian\/Reunion/, "migration must align monthly quota period with La Reunion timezone")
assert.doesNotMatch(migration, /time zone 'UTC'/, "migration quota month must not be based on UTC")
assert.match(migration, /when p_plan = 'premium_plus' then 50/, "migration must use Premium+ safety threshold 50")
assert.match(migration, /when p_plan = 'premium' then 10/, "migration must use Premium limit 10")
assert.match(migration, /else 1/, "migration must use provisional free operational limit 1")
assert.match(migration, /scan_safety_limit_reached/, "migration must return safety limit reason")
assert.match(migration, /monthly_quota_reached/, "migration must return monthly quota reason")
assert.match(migration, /from public\.user_subscriptions/, "migration must prefer the server-side subscription table when available")
assert.doesNotMatch(migration, /v_profile ->> 'subscription_plan'/, "migration must not treat subscription period as a canonical plan")

assert.match(pythonQuota, /p_request_id/, "Python quota provider must send a request id to Supabase")
assert.match(pythonQuota, /p_scan_type/, "Python quota provider must send scan type to Supabase")
assert.doesNotMatch(pythonQuota, /p_plan|plan['"]\s*:/, "Python quota provider must not trust a frontend-provided plan")
assert.match(pythonQuota, /scan_safety_limit_reached/, "Python quota provider must map safety code")
assert.match(pythonQuota, /monthly_quota_reached/, "Python quota provider must map monthly code")
assert.match(pythonErrors, /scan_safety_limit_reached/, "Python API errors must expose safety code")
assert.match(pythonErrors, /monthly_quota_reached/, "Python API errors must expose monthly code")

assert.match(publicHome, /CONTACT_EMAIL = "contact\.budgetkazpei@gmail\.com"/, "professional CTA must use public contact email")
assert.match(publicHome, /href=\{`mailto:\$\{CONTACT_EMAIL\}`\}/, "professional CTA must build a mailto link from the public email")
assert.match(read("src/pages/PrivacyPage.jsx") + read("src/pages/TermsPage.jsx"), /contact\.budgetkazpei@gmail\.com/, "professional CTA email must already exist in official public pages")
assert.doesNotMatch(publicHome + landingContent, /Chez\s+[A-Z]|SARL\s+[A-Z]|prix publicitaire|partenaire officiel/, "public marketing copy must not invent partners or ad pricing")

assert.match(premiumLanding + pricing, /10 scans par mois|PLAN_PUBLIC_SCAN_LABELS\[PLAN_IDS\.premium\]/, "public plan pages must keep the Premium scan quota")
assert.match(premiumLanding + premiumPage + pricing, /Conseiller renforc\u00e9|Conseiller renforce/, "Premium+ advisor wording must stay present across the offer surfaces")
assert.match(premiumLanding + premiumPage + pricing, /Bient\u00f4t|Byento|bient\u00f4t disponible|Bientot/i, "future Premium+ functions must stay separated as soon features")
assert.match(premiumPage, /from "lucide-react"/, "Premium page must use Lucide icons instead of emojis")
assert.doesNotMatch(premiumPage, /\uD83C\uDF34|\u2B50|\uD83D\uDC51|FREE|\u2728/u, "Premium page must not use emojis or low-quality free badges")
assert.match(premiumPage, /Votre formule actuelle|Out formule actuelle/, "Premium page must expose a current plan banner")
assert.match(premiumPage, /Bient\u00f4t disponibles|Byento disponibles|Bientot disponibles/i, "Premium page must separate soon features from already available benefits")
assert.match(premiumPage, /repeat\(auto-fit, minmax\(240px, 1fr\)\)/, "Premium page cards must stay responsive on mobile")

console.log("Plans quota e2e checks passed.")
