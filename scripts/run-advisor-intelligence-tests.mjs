// Focused, no-network regression tests for smarter BudgetKazPeï responses.
// No authenticated user, Stripe call or OpenAI request is made.
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import {
  isSelfContainedNewQuestion,
  shouldLookupAdvisorAids,
  shouldUseLocalBudgetAnswer,
  resolveAdvisorModeForQuestion,
} from "../src/services/advisorQuestionRouter.js"
import {
  detectAssistantIntent,
  answerAssistantQuestion,
} from "../src/services/ai/assistantIntentEngine.js"
import {
  classifyAdvisorSpendScope,
} from "../supabase/functions/assistant-aisupabase/engine/routing/offTopicPolicy.ts"
import {
  buildSystemPrompt,
  buildOpenQuestionSystemPrompt,
} from "../supabase/functions/assistant-aisupabase/prompts/systemPrompt.ts"

const handoff = { aideId: 12, aideName: "APL" }
for (const [question, expected] of [
  ["C'est quoi un volcan ?", true],
  ["Kosa i lé in volcan ?", true],
  ["Parle-moi du soleil", true],
  ["Koman marche in volcan ?", true],
  ["Quelle est la capitale du Japon ?", true],
  ["C'est quoi ça ?", false],
  ["Combien ?", false],
  ["Et ensuite ?", false],
]) {
  assert.equal(isSelfContainedNewQuestion(question), expected, question)
}

for (const question of [
  "C'est quoi un volcan ?",
  "Kosa i lé in volcan ?",
  "Parle-moi du soleil",
  "Koman marche in volcan ?",
]) {
  assert.equal(shouldLookupAdvisorAids({
    question, mode:"trouver_aide", handoffContext:handoff,
  }), false, "Stale CAF handoff on new subject: " + question)
  assert.equal(resolveAdvisorModeForQuestion({
    question, mode:"trouver_aide", intent:detectAssistantIntent(question),
  }), "general", question)
}

assert.equal(shouldLookupAdvisorAids({
  question:"Et combien ?", mode:"trouver_aide", handoffContext:handoff,
}), true, "Real aid follow-ups stay in scope")

for (const question of [
  "Pourquoi les courses de chevaux existent-elles ce mois-ci ?",
  "Quelle course à pied faire ce mois-ci ?",
]) {
  assert.equal(shouldUseLocalBudgetAnswer({
    question, mode:"general", intent:detectAssistantIntent(question),
  }), false, "Sport should never trigger personal budget analytics: " + question)
}
assert.equal(classifyAdvisorSpendScope({
  question:"Pourquoi les courses de chevaux existent-elles ?", mode:"general",
}), "offtopic")
assert.equal(classifyAdvisorSpendScope({
  question:"Quelles aides pour payer mon loyer ?", mode:"general",
}), "useful")

const onlyFixed = {
  budgetAdvisorContext: {
    period:{label:"1er → 20 novembre"},
    spendingByCategory:[],
    recurringCharges:[{id:"rent",label:"Loyer",amount:700,category:"logement"}],
  },
}
const fixedAnswer = answerAssistantQuestion({
  question:"Comment améliorer mon budget ?",insights:onlyFixed,
})
assert.match(fixedAnswer.fr, /pas encore assez de dépenses classées/i)
assert.match(fixedAnswer.fr, /Loyer.*700,00\s*€/i)
assert.doesNotMatch(fixedAnswer.fr, /est\s+\./)
assert.match(fixedAnswer.kr, /Loyer.*700,00\s*€/i)

const onlyGrocery = {
  budgetAdvisorContext: {
    period:{label:"1er → 20 novembre"},
    spendingByCategory:[{category:"alimentaire",amount:210,share:100}],
    recurringCharges:null,
  },
}
const groceryAnswer = answerAssistantQuestion({
  question:"Comment réduire mes dépenses ?",insights:onlyGrocery,
})
assert.match(groceryAnswer.fr, /210,00\s*€/)
assert.match(groceryAnswer.fr, /prix unitaires/)
assert.match(groceryAnswer.fr, /historiques peuvent avoir changé/)
assert.match(groceryAnswer.kr, /210,00\s*€/)

const full = buildSystemPrompt("fr", "", "general")
for (const language of ["fr","kreol"]) {
  const compact = buildOpenQuestionSystemPrompt(language)
  assert.ok(compact.length < full.length / 3,
    "Open-topic system instructions must stay materially cheaper: " + language)
  assert.match(compact, /Internet en direct/)
  assert.match(compact, /profil/)
  assert.match(compact, language === "kreol" ? /créole réunionnais/ : /français uniquement/)
}
assert.match(buildOpenQuestionSystemPrompt("kreol",true), /bilingue/)

const backend = await readFile(new URL(
  "../supabase/functions/assistant-aisupabase/index.ts",import.meta.url),"utf8")
assert.match(backend, /buildOpenQuestionSystemPrompt\(/)
assert.match(backend, /protectedTopic \|\| context.action === "analyze_refusal"/)
assert.ok(backend.indexOf('rpc("reserve_advisor_ai_request"') <
  backend.indexOf("const openAiResult = await callOpenAi"))
assert.ok(backend.indexOf('rpc("reserve_advisor_openai"') <
  backend.indexOf("const openAiResult = await callOpenAi"))
assert.match(backend, /const memoryEnrichmentAllowed = false/)
assert.doesNotMatch(backend, /source: "local_offtopic"/)

console.log("OK: budget responses, short FR/KR topic changes, off-topic quotas, compact prompts and single-call safeguards.")

import { buildBudgetScenario } from "../supabase/functions/assistant-aisupabase/engine/routing/budgetScenarios.mjs"
import { buildExplicitBudgetEvidence,buildExplicitBudgetNotice } from "../src/services/ai/proactiveAdvisor.js"
import { buildBudgetAdvisorContext } from "../src/services/ai/budgetAdvisorContext.js"
assert.match(buildBudgetScenario({question:"Si j'économise 50 € par mois pendant 6 mois"}).answer,/300,00/)
assert.match(buildBudgetScenario({question:"Si mi met de koté 50 € par mwa pendant 6 mwa",language:"kreol"}).answer,/300,00/)
assert.match(buildBudgetScenario({question:"Je veux économiser 100 € en 3 mois"}).answer,/33,34/)
assert.match(buildBudgetScenario({question:"J'ai 200 € pour 9 jours"}).answer,/22,22/)
assert.match(buildBudgetScenario({question:"Avec 1800 € de revenus, 800 € de charges fixes, 600 € de dépenses variables"}).answer,/400,00/)
assert.match(buildBudgetScenario({question:"Avec 1000 € de revenus 800 € de charges fixes 400 € de dépenses variables"}).answer,/manquerait.*200,00/)
assert.equal(buildBudgetScenario({question:"J'ai 200 € pour 0 jours"}),null)
assert.equal(buildBudgetScenario({question:"J'ai 200 € pour 9 jours et quelles aides CAF ?"}),null)
assert.equal(buildBudgetScenario({question:"Je veux économiser 50 € par mois sur mes courses"}),null)
assert.equal(buildBudgetScenario({question:"Si j'économise 50 € par mois pendant 6 mois",mode:"comprendre_courrier"}),null)
const targetNow=new Date("2026-11-27T09:00:00Z"),targetUser="budget-test"
const targetData={userId:targetUser,now:targetNow,transactions:[{user_id:targetUser,category:"alimentaire",amount:-250,date:"2026-11-24"},{user_id:"other",category:"alimentaire",amount:-900,date:"2026-11-24"},{user_id:targetUser,category:"alimentaire",amount:-900,date:"2026-10-24"},{user_id:targetUser,category:"alimentaire",amount:50,date:"2026-11-24"}],targets:[{user_id:targetUser,id:"uuid",category:"alimentaire",amount:200,alert_enabled:true}]}
const evidence=buildExplicitBudgetEvidence(targetData)
assert.deepEqual(evidence,[{category:"alimentaire",spent:250,limit:200}])
assert.equal(buildExplicitBudgetEvidence({...targetData,loading:true}).length,0)
assert.equal(buildExplicitBudgetEvidence({...targetData,targets:[{...targetData.targets[0],alert_enabled:false}]}).length,0)
assert.equal(buildExplicitBudgetEvidence({...targetData,targets:[{...targetData.targets[0],user_id:"other"}]}).length,0)
assert.equal(buildExplicitBudgetNotice(evidence,"fr",targetNow).kind,"budget_target")
assert.match(buildExplicitBudgetNotice(evidence,"kreol",targetNow).text,/Ou la dépassé/)
const targetContext=buildBudgetAdvisorContext({currentMonth:{transactionsCount:1,categories:[{id:"alimentaire",amount:250}]},budgetTargets:[{id:"uuid",category:"alimentaire",amount:200}]})
assert.deepEqual(targetContext.budgetTargets,[{category:"alimentaire",amount:200,spent:250}])

assert.match(buildBudgetScenario({question:"Je veux économiser 600 € en six mois."}).answer,/100,00/)
assert.match(buildBudgetScenario({question:"Si je mets 80 € de côté chaque mois pendant un an ?"}).answer,/960,00/)
assert.match(buildBudgetScenario({question:"J'ai 100 € pour sept jours."}).answer,/14,28/)
assert.equal(buildBudgetScenario({question:"Je veux économiser 600 € en six mois et quelles aides CAF ?"}),null)

import { hasExplicitCashEnvelope } from "../supabase/functions/assistant-aisupabase/engine/routing/budgetScenarios.mjs"
const cashScenario="Il me reste 180 € pour 12 jours et je dois encore mettre 40 € d'essence. Comment m'organiser ?"
const cashAnswer=buildBudgetScenario({question:cashScenario})
assert.equal(cashAnswer.kind,"envelope_commitments")
assert.match(cashAnswer.answer,/140,00/)
assert.match(cashAnswer.answer,/11,66/)
assert.doesNotMatch(cashAnswer.answer,/996,10/)
assert.equal(shouldUseLocalBudgetAnswer({question:cashScenario,mode:"budget_depenses",intent:"budget_remaining"}),false)
assert.match(buildBudgetScenario({question:"Il me reste 200 € pour dix jours et je dois payer 40 € d'essence et je dois payer 60 € de téléphone. Comment faire ?"}).answer,/10,00/)
assert.match(buildBudgetScenario({question:"Il me reste 30 € pour 5 jours et je dois payer 40 € de carburant"}).answer,/manque.*10,00/)
assert.match(buildBudgetScenario({question:"Mi nana 180 € pou 12 zour ek mi doi met 40 € pou essence. Kosa mi pe fer ?",language:"kreol"}).answer,/11,66/)
assert.equal(buildBudgetScenario({question:"Il me reste 180 € pour 12 jours et je dois payer 40 € d'essence et quelles aides CAF ?"}),null)
assert.equal(buildBudgetScenario({question:"Il me reste 180 € pour 12 jours et je dois payer 40 € d'essence mais j'attends 200 € demain"}),null)
assert.equal(hasExplicitCashEnvelope("Il me reste 180 € pour 12 jours et j'attends un virement"),true)
assert.equal(shouldUseLocalBudgetAnswer({question:"Il me reste 180 € pour 12 jours et j'attends un virement",mode:"budget_depenses",intent:"budget_remaining"}),false)
