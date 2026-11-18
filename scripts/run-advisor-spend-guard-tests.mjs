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
assert.ok(backend.indexOf('rpc("reserve_advisor_ai_request"') < backend.indexOf("const openAiResult = await callOpenAi"))
assert.match(backend,/if \(reservationError \|\| !requestReservation\)/)
assert.match(backend,/if \(requestReservation\.allowed !== true\)/)
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
const client = await readFile(new URL("../src/components/conseiller/AssistantConseiller.jsx", import.meta.url), "utf8")
assert.match(client, /error\\.context\\?\\.clone/)
assert.match(client, /serverError\\?\\.error \\|\\| error\\.message/)
assert.match(client, /offTopicLimitReached: serverError\\?\\.offTopicLimitReached === true/)
console.log("OK: paid calls are reserved atomically, off-topic limits are server-side, and simple greetings are free.")
