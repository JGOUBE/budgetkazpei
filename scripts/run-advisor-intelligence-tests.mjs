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
assert.match(fixedAnswer.fr, /Loyer.*700,00\\s*€/i)
assert.doesNotMatch(fixedAnswer.fr, /est\\s+\\./)
assert.match(fixedAnswer.kr, /Loyer.*700,00\\s*€/i)

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
assert.match(groceryAnswer.fr, /210,00\\s*€/)
assert.match(groceryAnswer.fr, /prix unitaires/)
assert.match(groceryAnswer.fr, /historiques peuvent avoir changé/)
assert.match(groceryAnswer.kr, /210,00\\s*€/)

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
assert.match(backend, /buildOpenQuestionSystemPrompt\\(/)
assert.match(backend, /protectedTopic \\|\\| context.action === "analyze_refusal"/)
assert.ok(backend.indexOf('rpc("reserve_advisor_ai_request"') <
  backend.indexOf("const openAiResult = await callOpenAi"))
assert.ok(backend.indexOf('rpc("reserve_advisor_openai"') <
  backend.indexOf("const openAiResult = await callOpenAi"))
assert.match(backend, /const memoryEnrichmentAllowed = false/)
assert.doesNotMatch(backend, /source: "local_offtopic"/)

console.log("OK: budget responses, short FR/KR topic changes, off-topic quotas, compact prompts and single-call safeguards.")
