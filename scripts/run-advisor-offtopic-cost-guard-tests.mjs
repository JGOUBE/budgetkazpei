import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import {
  getLocalCourtesyAnswer,
  getOffTopicLimits,
  getOffTopicLimitAnswer,
  isOffTopicAdvisorQuestion,
} from "../supabase/functions/assistant-aisupabase/engine/routing/offTopicCostGuard.mjs"

const tests = [
  ["Pourquoi le ciel est-il bleu ?", true],
  ["Tu veux danser ?", true],
  ["Raconte-moi une blague sur l'APL", true],
  ["Explique-moi la relativité d'Einstein", true],
  ["Quel est le résultat du match de football ?", true],
  ["Aide-moi à écrire une chanson", true],
  ["Comment cuisiner du riz ?", true],
  ["Comment puis-je réduire mon budget courses ?", false],
  ["Je veux trouver les aides possibles pour ma situation.", false],
  ["Konbien i reste a moin ?", false],
  ["Kosa mi pé réduire ?", false],
  ["Mon bann dépans la ogmanté ?", false],
  ["Je veux comprendre mes droits.", false],
  ["J'ai besoin d'aides pour mon logement", false],
  ["Quelles aides pour ma famille à La Réunion ?", false],
  ["Comment faire mon recours CAF ?", false],
  ["Je cherche une formation professionnelle", false],
  ["Mon loyer est trop élevé, quelles solutions ?", false],
  ["Peux-tu m'aider à comprendre ma fiche de paie ?", false],
  ["Je n'ai plus d'ARE : quels sont mes droits ?", false],
  ["Comment préparer un dossier administratif ?", false],
  ["Je cherche un emploi et j'ai besoin d'aide au permis", false],
]
for (const [question, expected] of tests) {
  assert.equal(isOffTopicAdvisorQuestion({ question }), expected, question)
}

const now = new Date("2026-11-18T08:30:00Z").getTime()
const ctx = { previousQuestion: "Quelles aides pour mon loyer CAF ?", previousAt: "2026-11-18T08:00:00Z", now }
assert.equal(isOffTopicAdvisorQuestion({ question: "Et quelles conditions ?", ...ctx }), false)
assert.equal(isOffTopicAdvisorQuestion({ question: "Combien ?", ...ctx }), false)
assert.equal(isOffTopicAdvisorQuestion({ question: "Pourquoi le ciel est-il bleu ?", ...ctx }), true)
assert.equal(isOffTopicAdvisorQuestion({
  question: "Combien ?", previousQuestion: "Pourquoi Jupiter est-elle une planète ?",
  previousAt: "2026-11-18T08:00:00Z", now,
}), true, "Do not inherit an unrelated topic")
assert.equal(isOffTopicAdvisorQuestion({
  question: "Combien ?", ...ctx, previousAt: "2026-11-17T08:00:00Z",
}), true, "Old conversations must not grant unlimited free-chat exemption")
assert.equal(isOffTopicAdvisorQuestion({ question: "Donne-moi une blague", action: "analyze_refusal" }), false)

for (const question of ["Salut", "Coucou !", "Ça va ?", "Ça va ? On danse ?", "Merci beaucoup"]) {
  assert.ok(getLocalCourtesyAnswer(question), question)
}
assert.equal(getLocalCourtesyAnswer("Pourquoi le ciel est-il bleu ?"), null)
assert.match(getLocalCourtesyAnswer("Ça va ? On danse ?", "kreol"), /danse/)
assert.deepEqual(getOffTopicLimits("premium"), { day: 3, month: 15 })
assert.deepEqual(getOffTopicLimits("premium_plus"), { day: 6, month: 30 })
assert.match(getOffTopicLimitAnswer("fr"), /budget/)

const backend = await readFile(new URL("../supabase/functions/assistant-aisupabase/index.ts", import.meta.url), "utf8")
const migration = await readFile(new URL("../supabase/migrations/20261118111500_advisor_offtopic_cost_guard.sql", import.meta.url), "utf8")
assert.ok(backend.indexOf('getLocalCourtesyAnswer(context.question') < backend.indexOf('await callOpenAi({'))
assert.ok(backend.indexOf('rpc("advisor_reserve_offtopic"') < backend.indexOf('await callOpenAi({'))
assert.match(backend, /p_user_id: context.userId/)
assert.match(backend, /lastConversation?.question/)
assert.match(backend, /if \(offTopicError \|\| !offTopicAllowance\)/, "Fail closed on quota DB errors")
assert.match(backend, /offTopicLimitReached: true/)
assert.match(backend, /openAiCallCount: 0/)
assert.match(backend, /await saveAssistantConversation\\([\\s\\S]*courtesyAnswer/)
assert.match(backend, /const cappedAnswer = getOffTopicLimitAnswer/)

assert.match(migration, /on conflict \(user_id\) do update/i)
assert.match(migration, /where \(case when usage.day_key/i)
assert.match(migration, /Indian\/Reunion/)
assert.match(migration, /enable row level security/i)
assert.match(migration, /revoke all on public.advisor_offtopic_usage from public, anon, authenticated/i)
assert.match(migration, /revoke all on function public.advisor_reserve_offtopic[\s\S]*from public, anon, authenticated/i)
assert.match(migration, /grant execute on function public.advisor_reserve_offtopic[\s\S]*to service_role/i)
console.log("OK: Budget/advice still available; small talk local; off-topic cost capped server-side.")
