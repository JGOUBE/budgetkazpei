// Contract tests for both the FR and KR interfaces: no silent switch to
// French, no accidental off-topic fallback, and no extra AI call for
// deterministic answers. These run in every production build.
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

import {
  resolveAdvisorLanguage as clientLanguage,
} from "../src/services/advisorLanguage.js"
import {
  resolveAdvisorLanguage as serverLanguage,
} from "../supabase/functions/assistant-aisupabase/language/languagePolicy.ts"
import {
  classifyAdvisorSpendScope,
  getLocalAdvisorBudgetBasics,
  getLocalAdvisorBudgetObservation,
  getLocalAdvisorBudgetNoDataAdvice,
  getLocalAdvisorSmallTalk,
  isContextualAdvisorFollowUp,
  advisorTopicGroupForQuestion,
} from "../supabase/functions/assistant-aisupabase/engine/routing/offTopicPolicy.ts"
import {
  getVerifiedReunionFuelPriceComparison,
  reviewUnsupportedFuelPriceHistory,
} from "../supabase/functions/assistant-aisupabase/engine/review/fuelPriceEvidence.ts"
import {
  resolveAdvisorBudgetConfirmation,
  resolveAdvisorBudgetNoDataAdvice,
} from "../src/services/advisorConversation.js"

for (const resolver of [clientLanguage, serverLanguage]) {
  assert.equal(resolver({message:"Les prix ont augmenté de combien ?",interfaceLanguage:"kreol"}),"kreol",
    "KR button must keep Creole output, even for a French question")
  assert.equal(resolver({message:"Mi trouve lo carburant lé tro sèr",interfaceLanguage:"fr"}),"kreol",
    "An unambiguous Kreol sentence must still be recognized")
  assert.equal(resolver({message:"Réponds en français s'il te plaît",interfaceLanguage:"kreol"}),"fr",
    "Explicit French-language requests override KR")
  assert.equal(resolver({message:"Réponds en créole s'il te plaît",interfaceLanguage:"fr"}),"kreol",
    "Explicit Kreol-language requests override FR")
  assert.equal(resolver({message:"Le carburant est cher",interfaceLanguage:"fr"}),"fr")
}

assert.match(getLocalAdvisorSmallTalk("Bonzour", "kreol") || "", /Bonzour/)
assert.match(getLocalAdvisorBudgetBasics("Kosa i lé in bidzé ?", "kreol") || "", /In bidzé/)
assert.match(getLocalAdvisorBudgetBasics("Koman mi fé in bidzé ?", "kreol") || "", /Pou prépar/)
assert.match(getLocalAdvisorBudgetBasics("C'est quoi un budget ?", "fr") || "", /budget sert/i)

const krFuelQuestion = "Mi trouv carburan lé tro ser"
assert.equal(classifyAdvisorSpendScope({question:krFuelQuestion}),"useful")
assert.equal(classifyAdvisorSpendScope({question:"Lo mazout lé tro ser"}),"useful")
assert.equal(advisorTopicGroupForQuestion(krFuelQuestion),"carburant")
const observedKR = getLocalAdvisorBudgetObservation(krFuelQuestion,"kreol","general")
assert.match(observedKR || "", /Carburant i pé/)
const observedFR = getLocalAdvisorBudgetObservation("Je trouve que le carburant est cher","fr","general")
assert.match(observedFR || "", /Le carburant peut/)

const initialHistory = [{
  question:krFuelQuestion,
  answer:observedKR,
  source:"local_budget_observation",
}]
// A Kreol "Wi" confirmation is processed locally, at no provider cost.
const confirmedKR = resolveAdvisorBudgetConfirmation({
  question:"Wi",
  recentHistory:initialHistory,
  insights:{budgetAdvisorContext:{spendingByCategory:[],period:{label:"novanm 2026"}},
    dataAvailability:{transactions:true}},
  language:"kreol",
})
assert.equal(confirmedKR?.source,"local_budget_followup")
assert.match(confirmedKR?.answer || "", /Mi trouve pas ankor bann dépans/)
assert.equal(confirmedKR?.language,"kreol")

const missingHistory = [
  {question:"Wi",answer:confirmedKR?.answer,source:"local_budget_followup"},
  ...initialHistory,
]
const noDataKR = resolveAdvisorBudgetNoDataAdvice({
  question:"Propoz a moin bann solision",
  recentHistory:missingHistory,
  language:"kreol",
})
assert.equal(noDataKR?.source,"local_budget_advice")
assert.equal(noDataKR?.language,"kreol")
assert.match(noDataKR?.answer || "", /Minm san dépans/)
assert.match(getLocalAdvisorBudgetNoDataAdvice(
  "Propoz a moin bann solision",missingHistory,"kreol",
) || "", /Minm san dépans/)

assert.equal(isContextualAdvisorFollowUp("Ou krwar sa va ankor ogmanté ?"),true)
assert.equal(isContextualAdvisorFollowUp("Wi, sa va ankor ogmanté ?"),true)
assert.equal(isContextualAdvisorFollowUp("Et si la lune était en fromage ?"),false)
assert.equal(isContextualAdvisorFollowUp("Quelle est la capitale du Japon ?"),false)

const lastNovember = new Date("2026-11-18T15:00:00Z")
const verifiedFR = getVerifiedReunionFuelPriceComparison(
  "Les prix du carburant ont augmenté de combien depuis deux ans ?",
  "fr",lastNovember,
)
const verifiedKR = getVerifiedReunionFuelPriceComparison(
  "Lo mazout la ogmanté kombyin depi dé zan ?",
  "kreol",lastNovember,
)
assert.match(verifiedFR || "", /30,2 %/)
assert.match(verifiedKR || "", /30,2 %/)
assert.match(verifiedKR || "", /36,3 %/)
assert.match(verifiedKR || "", /Bann sources la Préfekti/)
assert.doesNotMatch(verifiedKR || "", /À La Réunion, la comparaison/)
assert.equal(getVerifiedReunionFuelPriceComparison(
  "Lo mazout la ogmanté kombyin depi dé zan ?",
  "kreol",new Date("2027-04-18T15:00:00Z"),
),null,"Expired data must never be silently recycled into later months")

const uncertainKR = reviewUnsupportedFuelPriceHistory({
  question:"Lo mazout la ogmanté kombyin depi 2025 ?",
  answer:"Li la ogmanté de 50 %",language:"kreol",
})
assert.match(uncertainKR,/Mi pé pa donne/)
assert.doesNotMatch(uncertainKR,/50 %/)
assert.match(uncertainKR,/Préfekti/)
const otherTerritory = reviewUnsupportedFuelPriceHistory({
  question:"Combien le carburant a augmenté à Paris depuis 2025 ?",
  answer:"Hausse de 40 %",language:"fr",
})
assert.doesNotMatch(otherTerritory,/40 %/)
assert.doesNotMatch(otherTerritory,/À La Réunion/)
assert.equal(reviewUnsupportedFuelPriceHistory({
  question:"Pourquoi la lune brille ?",answer:"Parce qu'elle réfléchit la lumière.",
}),"Parce qu'elle réfléchit la lumière.")

const edgeSource = await readFile(new URL(
  "../supabase/functions/assistant-aisupabase/index.ts",import.meta.url),"utf8")
assert.ok(edgeSource.indexOf("getVerifiedReunionFuelPriceComparison(") <
  edgeSource.indexOf("const openAiResult = await callOpenAi"))
assert.match(edgeSource,/reserve_advisor_openai/)
assert.match(edgeSource,/reviewUnsupportedFuelPriceHistory/)
assert.ok(edgeSource.includes('DATE DE RÉFÉRENCE À LA RÉUNION'))
assert.ok(edgeSource.includes('LANGUE DE SORTIE VERROUILLÉE : créole réunionnais simple uniquement'))
assert.ok(edgeSource.includes('const history = Array.isArray(body.recentHistory) ? body.recentHistory.slice(0, 3)'))
assert.ok(edgeSource.includes('const protectedTopic = spendScope === "useful" && (Boolean(purchaseIntent) || isProtectedAdvisorQuestion'))
assert.doesNotMatch(edgeSource, /source: "local_offtopic"/)

console.log("OK: FR/KR Premium advisor parity, Kreol local replies, contextual follow-ups, verified fuel prices and zero-extra-AI safeguards.")

assert.match(edgeSource,/briefConversation \? 160/)
assert.match(edgeSource,/source:"local_brief_conversation"/)
