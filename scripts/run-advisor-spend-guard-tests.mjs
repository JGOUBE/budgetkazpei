import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import {
  ADVISOR_OFFTOPIC_LIMITS,
  classifyAdvisorSpendScope,
  getLocalAdvisorSmallTalk,
} from "../supabase/functions/assistant-aisupabase/engine/routing/offTopicPolicy.ts"

assert.deepEqual(ADVISOR_OFFTOPIC_LIMITS,{daily:5, monthly:20, hourlyAll:30})

const useful = [
  ["Quels sont les montants du RSA pour une famille ?", "general"],
  ["Quelles aides pour ma famille à La Réunion ?", "general"],
  ["Ai-je droit à l'APL ?", "general"],
  ["Combien me reste-t-il sur mon budget ?", "budget_depenses"],
  ["Mes dépenses alimentaires augmentent", "general"],
  ["Comment réduire mon loyer ?", "general"],
  ["Je veux gérer mes droits à la CAF", "general"],
  ["Mes factures d'électricité sont trop élevées", "general"],
  ["Comment contester mon refus administratif ?", "general"],
  ["Comment déposer un dossier à la MDPH ?", "general"],
  ["Comment améliorer mes économies ?", "general"],
  ["Et ensuite ?", "trouver_aide"],
  ["Combien ?", "budget_depenses"],
]
for (const [question,mode] of useful)
  assert.equal(classifyAdvisorSpendScope({question,mode}), "useful", question)
assert.equal(classifyAdvisorSpendScope({question:"Voici mon courrier",mode:"comprendre_courrier",action:"analyze_refusal"}),"useful")

const offTopic = [
  ["Pourquoi le ciel est bleu ?", "general"],
  ["Pourquoi le ciel est bleu, dis-moi en regardant mon budget ?", "general"],
  ["Quelle est la capitale du Japon ?", "trouver_aide"],
  ["Raconte-moi une histoire de dragon", "general"],
  ["On danse ?", "general"],
  ["Invente un poème", "general"],
  ["Combien de lunes a Jupiter ?", "general"],
  ["Aide-moi à écrire une chanson", "trouver_aide"],
  ["Que penses-tu du dernier match de foot ?", "budget_depenses"],
  ["Parle-moi des licornes", "general"],
  ["Pourquoi le chat président parle ?", "trouver_aide"],
  ["Donne-moi un conseil de jeu vidéo", "general"],
]
for (const [question,mode] of offTopic)
  assert.equal(classifyAdvisorSpendScope({question,mode}), "offtopic", question)

assert.match(getLocalAdvisorSmallTalk("Ça va ? On danse ?") || "", /danser/)
assert.match(getLocalAdvisorSmallTalk("Bonjour !") || "", /Bonjour/)
assert.match(getLocalAdvisorSmallTalk("Merci beaucoup") || "", /Avec plaisir/)
assert.equal(getLocalAdvisorSmallTalk("Bonjour, quelles aides pour moi ?"),null)
assert.equal(getLocalAdvisorSmallTalk("Ça va ? On danse en regardant mes dépenses ?"),null)
assert.equal(getLocalAdvisorSmallTalk("Bonjour, j'ai un problème de budget"),null)

const backend = await readFile(new URL("../supabase/functions/assistant-aisupabase/index.ts", import.meta.url), "utf8")
const migration = await readFile(new URL("../supabase/migrations/20261118120000_advisor_ai_spend_guard.sql", import.meta.url), "utf8")
assert.match(backend,/getLocalAdvisorSmallTalk\(context\.question, context\.language\)/)
assert.match(backend,/classifyAdvisorSpendScope\(\{/)
assert.match(backend,/rpc\("reserve_advisor_ai_request"/)
assert.ok(backend.includes('p_offtopic: spendScope === "offtopic"'), "Unrelated model calls must remain capped")
assert.match(backend,/buildBriefLocalConversation\(context.question, context.language\)/)
assert.match(backend,/max_tokens: briefConversation \? 160/)
assert.match(backend,/finishBriefConversation\(checkedAnswer,context.language\)/)
assert.doesNotMatch(backend, /source: "local_offtopic"/, "Avoid the old generic refusal")
assert.ok(backend.includes('const protectedTopic = spendScope === "useful" && (Boolean(purchaseIntent) || isProtectedAdvisorQuestion'), "No private budget context for off-topic questions")
assert.ok(backend.indexOf('rpc("reserve_advisor_ai_request"') < backend.indexOf("const openAiResult = await callOpenAi"))
assert.match(backend,/if \(reservationError \|\| !requestReservation\)/)
assert.match(backend,/if \(requestReservation\.allowed !== true\)/)
assert.match(backend,/source: "local_usage_guidance"/)
assert.match(backend,/type: "local_usage_guidance", calls: 0/)
assert.match(backend,/success: true,[\s\S]{0,150}answer: guidance/)
assert.doesNotMatch(backend,/La limite de questions libres|La limite de 5 questions libres|Réessayez dans une heure/)

assert.match(backend,/openAiCallCount: 0/)
assert.match(backend,/userPrompt\.length > 32000/)
assert.match(migration,/pg_advisory_xact_lock/)
assert.match(migration,/security invoker/)
assert.match(migration,/enable row level security/)
assert.match(migration,/revoke all on function public\.reserve_advisor_ai_request\(uuid,boolean\) from public, anon, authenticated/)
assert.match(migration,/grant execute on function public\.reserve_advisor_ai_request\(uuid,boolean\) to service_role/)
assert.match(migration,/v_daily_limit constant integer := 5/)
assert.match(migration,/v_monthly_limit constant integer := 20/)
assert.match(migration,/v_hourly_limit constant integer := 30/)
assert.ok(!migration.includes("message_body"))
console.log("OK: paid calls are reserved atomically, off-topic limits are server-side, and simple greetings are free.")

import { compactAdvisorLocalContext, compactShoppingFacts } from "../supabase/functions/assistant-aisupabase/engine/routing/compactAdvisorContext.mjs"
const hugePurchase={available:true,start:"2026-09-01",end:"2026-11-27",observedVisits:8,products:Array.from({length:500},(_,i)=>({label:"Produit "+i,purchaseDays:2})),recentProducts:Array.from({length:500},(_,i)=>({label:"Produit "+i})),trends:{priceChanges:Array.from({length:100},()=>({label:"Test",changePercent:15})),comparison:{observedDifference:10}},actionPlan:{preferences:{excludedFamilies:["cakes"],noCooking:true},goal:{monthlyTarget:20},priceChanges:Array(500).fill("duplicated")},rawRows:Array(1000).fill("raw")}
const compact=compactShoppingFacts(hugePurchase)
assert.equal(compact.products.length,6)
assert.equal(compact.trends.priceChanges.length,4)
assert.equal(compact.actionPlan.preferences.noCooking,true)
assert.equal(compact.actionPlan.goal.monthlyTarget,20)
assert.equal(compact.rawRows,undefined)
assert.equal(compact.actionPlan.priceChanges,undefined)
assert.ok(JSON.stringify(compactAdvisorLocalContext({financial:{budgetAdvisorContext:{shoppingHabits:hugePurchase},rawRows:hugePurchase.rawRows}})).length<5000)
assert.match(backend,/local_purchase_compact_fallback/)
assert.ok(backend.indexOf("local_purchase_compact_fallback")<backend.indexOf('rpc("reserve_advisor_ai_request"'))
