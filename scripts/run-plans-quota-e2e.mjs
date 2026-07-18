import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  FREE_OPERATIONAL_SCAN_LIMIT,
  MONTHLY_QUOTA_REACHED_CODE,
  PLAN_FEATURE_STATUS,
  PLAN_IDS,
  PLAN_PRICES,
  PLAN_SCAN_POLICY,
  PREMIUM_PLUS_SAFETY_MESSAGE,
  PREMIUM_PLUS_SAFETY_SCAN_LIMIT,
  PUBLIC_PLAN_CARDS,
  SCAN_SAFETY_LIMIT_REACHED_CODE,
  getPlanPublicScanLabel,
  getPlanQuotaExceededCode,
  getPlanScanLimit,
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
const plans = read("src/config/plans.js")
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

assert.match(allTargetedTexts, /Accès découverte au scanner/, "free public scanner wording must be accented")
assert.match(allTargetedTexts, /Scans illimités/, "Premium+ public scanner wording must be accented")
assert.match(allTargetedTexts, /Bientôt/, "future badges must be accented")
assert.match(allTargetedTexts, /Réunion/, "Réunion must be accented in public texts")
assert.doesNotMatch(
  allTargetedTexts,
  /Ãƒ|Ã‚|Ã¢â‚¬|Ã¢â‚¬â„¢|Ã°Å¸|ï¿½/,
  "targeted visible quota and offer texts must not contain mojibake",
)
assert.doesNotMatch(
  allTargetedTexts,
  /\bAcces\b|\bBientot\b|\billimites\b|\bReunion\b|\bdemarches\b|Conseiller renforce/,
  "targeted offer texts must not keep unaccented audit terms",
)

assert.equal(PLAN_PRICES[PLAN_IDS.free], "0 €")
assert.equal(PLAN_PRICES[PLAN_IDS.premium], "2,99 €/mois")
assert.equal(PLAN_PRICES[PLAN_IDS.premiumPlus], "4,99 €/mois")
assert.equal(FREE_OPERATIONAL_SCAN_LIMIT, 1)
assert.equal(PLAN_SCAN_POLICY[PLAN_IDS.free].commercialScanLimit, null)
assert.equal(PLAN_SCAN_POLICY[PLAN_IDS.free].operationalScanLimit, 1)
assert.equal(PLAN_SCAN_POLICY[PLAN_IDS.free].needsCommercialValidation, true)
assert.equal(getPlanPublicScanLabel(PLAN_IDS.free), "Accès découverte au scanner")
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
assert.equal(getPlanQuotaExceededCode(PLAN_IDS.free), MONTHLY_QUOTA_REACHED_CODE)
assert.equal(getPlanQuotaExceededCode(PLAN_IDS.premium), MONTHLY_QUOTA_REACHED_CODE)
assert.equal(getPlanQuotaExceededCode(PLAN_IDS.premiumPlus), SCAN_SAFETY_LIMIT_REACHED_CODE)
assert.match(PREMIUM_PLUS_SAFETY_MESSAGE, /nombre inhabituel de scans ce mois-ci/)
assert.match(PREMIUM_PLUS_SAFETY_MESSAGE, /Par sécurité/)

assert.doesNotMatch(targetedPublicTexts, /\b50\b|50 sur 50/, "Premium+ safety limit must not be visible in public offer texts")
assert.doesNotMatch(targetedPublicTexts, /Gratuit[\s\S]{0,160}\b1\s+scan/i, "free public offer must not expose the provisional numeric quota")
assert.ok(PUBLIC_PLAN_CARDS.find(plan => plan.id === PLAN_IDS.premium)?.items.some(item => item.text === "10 scans par mois"), "Premium public quota must be visible")
assert.ok(PUBLIC_PLAN_CARDS.find(plan => plan.id === PLAN_IDS.premiumPlus)?.items.some(item => item.text === "Scans illimités"), "Premium+ public quota must be unlimited")
assert.doesNotMatch(targetedPublicTexts, /Disponible/, "offer cards must not repeat Disponible badges")
assert.ok(PUBLIC_PLAN_CARDS.every(plan => plan.items.every(item => Object.values(PLAN_FEATURE_STATUS).includes(item.status))), "all public plan features must have a status")
assert.ok(PUBLIC_PLAN_CARDS.some(plan => plan.items.some(item => item.status === PLAN_FEATURE_STATUS.soon)), "future features must use Bientôt status")

assert.match(receiptQuota, /isUnlimitedForUser/, "receipt quota hook must expose commercial unlimited flag")
assert.match(receiptQuota, /safetyLimitReached/, "receipt quota hook must expose safety threshold state")
assert.match(receiptsPage, /Scans illimités/, "Premium+ normal counter must display unlimited wording")
assert.match(receiptsPage, /PREMIUM_PLUS_SAFETY_MESSAGE/, "Premium+ safety message must be reused in the scanner UI")
assert.doesNotMatch(receiptsPage, /premium_plus"\s*\?\s*txt\.intensiveUsage/, "Premium+ message must be tied to safety threshold, not plan name alone")
assert.doesNotMatch(receiptsPage, /50 sur 50|tous vos scans/, "scanner UI must not expose Premium+ as a normal 50 quota")

assert.match(scannerTypes, /monthly_quota_reached/, "front error types must include monthly quota code")
assert.match(scannerTypes, /scan_safety_limit_reached/, "front error types must include safety limit code")
assert.match(scannerApi, /monthly_quota_reached/, "front API must map monthly quota code")
assert.match(scannerApi, /scan_safety_limit_reached/, "front API must map safety limit code")
assert.match(scanUsage, /getPlanQuotaExceededCode/, "legacy scan usage RPC must classify quota failures centrally")

assert.match(migration, /Indian\/Reunion/, "migration must align monthly quota period with La Reunion timezone")
assert.doesNotMatch(migration, /time zone 'UTC'/, "migration quota month must not be based on UTC")
assert.match(migration, /when p_plan = 'premium_plus' then 50/, "migration must use Premium+ safety threshold 50")
assert.match(migration, /when p_plan = 'premium' then 10/, "migration must use Premium limit 10")
assert.match(migration, /else 1/, "migration must use provisional free operational limit 1")
assert.match(migration, /scan_safety_limit_reached/, "migration must return safety limit reason")
assert.match(migration, /monthly_quota_reached/, "migration must return monthly quota reason")
assert.doesNotMatch(migration, /then 100|then 30/, "migration must not keep old 10/30/100 rule")
assert.match(migration, /pg_advisory_xact_lock/, "migration must keep concurrency guard")
assert.match(migration, /on conflict \(user_id, request_id, scan_type\)/, "migration must keep idempotent reservation key")
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
assert.doesNotMatch(publicHome + landingContent, /Chez\s+[A-Z]|SARL\s+[A-Z]|prix publicitaire|partenaire officiel/, "Bons plans section must not invent partners or ad prices")

assert.match(premiumLanding + premiumPage + pricing, /Conseiller renforcé/, "Premium+ advisor wording must be accented")
assert.match(premiumLanding + premiumPage + pricing, /Bientôt|bientôt disponible/, "future Premium+ functions must be marked as soon")

console.log("Plans quota e2e checks passed.")
