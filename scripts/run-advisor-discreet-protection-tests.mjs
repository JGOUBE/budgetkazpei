import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const read = path => readFile(new URL("../" + path, import.meta.url), "utf8")
const uiFiles = [
  "src/components/conseiller/ConseillerPage.jsx",
  "src/config/plans.js",
  "src/components/premium/PremiumPage.jsx",
  "src/components/landing/landingContent.js",
  "src/pages/PremiumLandingPage.jsx",
]
const contents = await Promise.all(uiFiles.map(read))
const [advisor, plans, premium, landing, publicPage] = contents

assert.doesNotMatch(advisor, /bkp-advisor-usage-label|Utilisation illimitée|Utilisation limitée|Usage libre encadré|5 par jour|20 par mois|30 appels IA par heure/)
assert.doesNotMatch(publicPage, /normalUse|premium-plan__usage-note|5 par jour|20 par mois|30 appels IA par heure|Conseiller.{0,80}utilisation limitée/i)
for (const source of [plans, premium, landing]) {
  assert.doesNotMatch(source, /Conseiller BudgetKazPéi[^\n"]{0,95}(?:utilisation limitée|usage étendu|questions hors sujet limitées|illimitée)/i)
  assert.doesNotMatch(source, /Konseyé BudgetKazPéi[^\n"]{0,95}(?:itilizasion limité|itilizasion san limit)/i)
}
assert.match(plans, /Conseiller BudgetKazPéi — budget, aides et conseils/)
assert.match(premium, /Conseiller BudgetKazPéi — budget, aides et conseils/)
assert.match(landing, /Konseyé BudgetKazPéi — bidjé, èd ek konsey/)

const backend = await read("supabase/functions/assistant-aisupabase/index.ts")
assert.match(backend, /rpc\("reserve_advisor_ai_request"/)
assert.match(backend, /if \(requestReservation.allowed !== true\)/)
assert.match(backend, /source: "local_usage_guidance"/)
assert.match(backend, /type: "local_usage_guidance", calls: 0/)
assert.doesNotMatch(backend, /code: isFreeChat \? "advisor_offtopic_redirect" : "advisor_temporarily_paused"/)
assert.match(backend, /\? briefConversationFallback\(context.language\)/)
const brief = await read("supabase/functions/assistant-aisupabase/engine/routing/briefConversation.mjs")
assert.match(brief, /Mon rôle, c.est surtout de vous aider avec votre budget, vos courses, vos aides et vos démarches/)
assert.doesNotMatch(backend, /La limite de 5 questions libres par jour est atteinte|La limite de questions libres de ce mois est atteinte|Réessayez dans une heure/)
console.log("OK: advisor quota details are absent from public UI and abuse responses, but server-side protection remains.")
