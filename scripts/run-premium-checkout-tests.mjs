import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const read = p => readFileSync(join(process.cwd(), p), "utf8")
const webhook = read("supabase/functions/budgetkazpei-stripe-events/index.ts")
const plans = read("src/config/plans.js")
const publicOffer = read("src/pages/PremiumLandingPage.jsx")
const app = read("src/App.jsx")
const profile = read("src/components/profile/ProfilePage.jsx")
const trial = read("supabase/migrations/20261118170000_premium_unified_free_scan_discovery.sql")
const trialExpires = read("supabase/migrations/20261118172500_free_discovery_only_first_30_days.sql")
const verifiedEvents = read("supabase/migrations/20261118180000_budgetkazpei_stripe_verified_events.sql")
const claim = read("supabase/migrations/20261118182500_stripe_claim_verified_account.sql")

// One commercially advertised paid tier, two billing periods, matching prices.
assert.match(publicOffer, /STRIPE_LINKS\.premiumMonthly/)
assert.match(publicOffer, /STRIPE_LINKS\.premiumAnnual/)
assert.match(publicOffer, /49,90 €/)
assert.match(publicOffer, /4,99 €/)
assert.doesNotMatch(publicOffer, /Premium\+/)
assert.doesNotMatch(publicOffer, /100 scans|1200 appels|1 200 appels/)
assert.match(plans, /PLAN_ORDER = \[PLAN_IDS\.free, PLAN_IDS\.premium\]/)

// A signed, idempotent, recognized Stripe subscription lifecycle.
assert.match(webhook, /verifyStripeSignature/)
assert.match(webhook, /Math\.abs\(Math\.floor\(Date\.now\(\) \/ 1000\) - timestamp\) > 300/)
assert.match(webhook, /get_budgetkazpei_stripe_signing_secret/)
assert.match(webhook, /stripe-signature/)
assert.match(webhook, /budgetkazpei_stripe_events/)
assert.match(webhook, /customer\.subscription\.deleted/)
assert.match(webhook, /price_1Ud6LYBQ1hdaYjbC4exwaAwu/)
assert.match(webhook, /onConflict: "stripe_subscription_id"/)
assert.match(webhook, /in\("status", \["active", "trialing"\]\)/)
assert.match(verifiedEvents, /vault\.decrypted_secrets/)
assert.match(verifiedEvents, /enable row level security/)
assert.match(verifiedEvents, /revoke all on function public\.get_budgetkazpei_stripe_signing_secret\(\)/)

// A client-side return parameter never grants paid access by itself.
assert.match(app, /premium_retour/)
assert.match(app, /claim_budgetkazpei_stripe_subscription/)
assert.match(app, /\["active", "trialing"\]\.includes\(row\.status\)/)
assert.match(app, /setSubscriptionHasBillingRecord\(rows\.length > 0\)/)
assert.match(profile, /rows\.find\(row => \["active", "trialing"\]\.includes\(row\.status\)\)/)
assert.match(claim, /email_confirmed_at is not null/)

// The free trial is granted and enforced on the server only.
assert.match(trial, /interval '30 days'/)
assert.match(trial, /v_trial_used >= 3/)
assert.match(trial, /get_receipt_scan_access/)
assert.match(trialExpires, /then 100 else 0/)

console.log("OK: Premium checkout, verified Stripe events, revoked plans and free discovery")
