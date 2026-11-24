import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import {
  ADVISOR_TURN_TYPES,
  buildAdvisorConversationContext,
  resolveAdvisorBudgetConfirmation,
  resolveAdvisorBudgetNoDataAdvice,
} from "../src/services/advisorConversation.js"
import {
  isSelfContainedNewQuestion,
  looksPlayfulOrFictionalQuestion,
  resolveAdvisorModeForQuestion,
  shouldLookupAdvisorAids,
  shouldUseLocalBudgetAnswer,
} from "../src/services/advisorQuestionRouter.js"
import { detectAssistantIntent } from "../src/services/ai/assistantIntentEngine.js"
import { isProtectedAdvisorQuestion } from "../supabase/functions/assistant-aisupabase/engine/routing/questionScope.ts"
import { getLocalAdvisorBudgetNoDataAdvice, getLocalAdvisorBudgetObservation, getLocalAdvisorSmallTalk, classifyAdvisorSpendScope, isContextualAdvisorFollowUp, advisorTopicGroupForQuestion, advisorTrustedTopicLabel } from "../supabase/functions/assistant-aisupabase/engine/routing/offTopicPolicy.ts"
import { buildSystemPrompt } from "../supabase/functions/assistant-aisupabase/prompts/systemPrompt.ts"
import { getVerifiedReunionFuelPriceComparison, reviewUnsupportedFuelPriceHistory } from "../supabase/functions/assistant-aisupabase/engine/review/fuelPriceEvidence.ts"

const base=buildAdvisorConversationContext({
  question: "Je cherche une aide financière pour inscrire mes enfants au sport",
  recentHistory: [],
  aides: [],
})
const aidHistory=[{
  question:"Je cherche une aide financière pour inscrire mes enfants au sport",
  answer:"Le Pass'Sport est une piste à vérifier.",
  conversationContext:base,
  recommendedAidIds:[41],
  recommendedAidNames:["Pass'Sport"],
}]
function afterAid(question) {
  return buildAdvisorConversationContext({question,recentHistory:aidHistory,aides:[]})
}
function newTopic(question,reason="") {
  const ctx=afterAid(question)
  assert.equal(ctx.turnType,ADVISOR_TURN_TYPES.NEW_TOPIC, reason || question)
  assert.equal(ctx.previouslyRecommendedAidIds.length,0, question)
  assert.equal(ctx.targetAidNames.length,0,question)
  return ctx
}
[
  "Combien de lunes possède Jupiter ?",
  "Pourquoi le ciel est-il bleu ?",
  "Comment se forment les volcans ?",
  "Peux-tu raconter une histoire de dragon ?",
  "Imagine une licorne au marché de Saint-Paul",
  "Quelles sont les planètes du système solaire ?",
  "Pourquoi les chats ronronnent-ils ?",
  "Combien de dents possède un requin ?",
  "Combien coûte un lancement de fusée ?",
  "Je voudrais une recette de gâteau à la mangue",
  "Comment écrire un poème sans rimes ?",
  "Invente une blague avec un chihuahua",
  "Et si la Lune était en fromage, aurais-je droit à l'APL ?",
  "Peux-tu m'aider à comprendre la relativité ?",
].forEach(q=>newTopic(q))

const directAid=afterAid("Je cherche maintenant une aide pour mon loyer")
assert.equal(directAid.turnType,ADVISOR_TURN_TYPES.NEW_TOPIC)
assert.deepEqual(directAid.activeTopic.domains,["logement"])
const alternative=afterAid("Il n'y a pas une autre aide ?")
assert.equal(alternative.turnType,ADVISOR_TURN_TYPES.REQUEST_ALTERNATIVE)
assert.equal(alternative.activeTopic.domains[0],"sport")
assert.deepEqual(alternative.previouslyRecommendedAidNames,["Pass'Sport"])
const shortDetail=afterAid("Combien ?")
assert.equal(shortDetail.turnType,ADVISOR_TURN_TYPES.ASK_DETAILS)
assert.deepEqual(shortDetail.targetAidNames,["Pass'Sport"])
assert.equal(afterAid("Et ensuite ?").turnType,ADVISOR_TURN_TYPES.NEXT_STEP)
assert.equal(afterAid("Et pour une licence en club ?").turnType,ADVISOR_TURN_TYPES.FOLLOW_UP)
assert.equal(afterAid("En fait, je voulais dire une aide pour l'énergie").turnType,ADVISOR_TURN_TYPES.CORRECTION)
assert.equal(afterAid("Combien de temps faut-il attendre ?").turnType,ADVISOR_TURN_TYPES.ASK_DETAILS)

const jupiter=newTopic("Combien de lunes possède Jupiter ?")
const jupiterHistory=[{
  question:"Combien de lunes possède Jupiter ?",
  answer:"Le nombre reconnu peut changer avec les découvertes.",
  conversationContext:jupiter,
}]
const why=buildAdvisorConversationContext({question:"Et pourquoi ?",recentHistory:jupiterHistory,aides:[]})
assert.equal(why.turnType,ADVISOR_TURN_TYPES.FOLLOW_UP)
assert.equal(why.activeTopic.query,jupiter.activeTopic.query)
assert.deepEqual(why.activeTopic.domains,[])
// A locally answered generic question must not resurrect an old aid context.
const localThenAid=buildAdvisorConversationContext({
  question:"Et pourquoi ?",
  recentHistory:[{question:"Pourquoi le soleil est-il jaune ?", answer:"La lumière solaire ..."},...aidHistory],
  aides:[],
})
assert.deepEqual(localThenAid.activeTopic.domains,[])
assert.equal(localThenAid.turnType,ADVISOR_TURN_TYPES.FOLLOW_UP)

const strange=[
 "Pourquoi le ciel est-il bleu ?",
 "Je veux une recette de rougail mangue",
 "Raconte une histoire où un volcan parle",
 "Combien coûte un voyage sur Jupiter ?",
 "Pourquoi les chats ronronnent-ils ?",
 "Et si la Lune était en fromage, aurais-je droit à l'APL ?",
]
for(const question of strange) {
  assert.equal(shouldLookupAdvisorAids({question,mode:"general",conversationContext:afterAid(question),recentHistory:aidHistory}),false,question)
  assert.equal(isProtectedAdvisorQuestion({question,mode:"general",conversationContext:afterAid(question)}),false,question)
}
const eligibleAid=[
 "Quelles aides existent pour mes enfants ?",
 "Je cherche une aide financière pour payer mon loyer",
 "Quels sont les montants de l'APL ?",
 "Je voudrais connaître le RSA",
 "Quel est le délai de mon dossier CAF ?",
]
for(const question of eligibleAid) {
  assert.equal(shouldLookupAdvisorAids({question,mode:"general",recentHistory:[]}),true,question)
  assert.equal(isProtectedAdvisorQuestion({question,mode:"general"}),true,question)
}
assert.equal(shouldLookupAdvisorAids({question:"Combien ?",mode:"general",conversationContext:shortDetail,recentHistory:aidHistory}),true)
assert.equal(isProtectedAdvisorQuestion({question:"Combien ?",mode:"general",conversationContext:shortDetail}),true)
assert.equal(shouldLookupAdvisorAids({question:"Aide-moi à comprendre la relativité",mode:"general"}),false)
assert.equal(isProtectedAdvisorQuestion({question:"Raconte-moi où en est mon dossier CAF",mode:"general"}),true)
assert.equal(isProtectedAdvisorQuestion({question:"Combien coûte un objet à 500 € ?",mode:"general"}),false)
assert.equal(isProtectedAdvisorQuestion({question:"Quel est mon budget courses ?",mode:"general"}),true)

const budgetCases=[
  ["Combien me reste-t-il après mes charges fixes ?",true],
  ["Quel abonnement me coûte le plus ?",true],
  ["Où est-ce que je dépense le plus ?",true],
  ["Combien j'ai dépensé en courses ?",true],
  ["Ma liste de courses rentre-t-elle dans mon budget ?",true],
  ["Mes dépenses ont-elles augmenté ?",true],
  ["Pourquoi les courses de chevaux existent-elles ?",false],
  ["Comment réduire la pollution de l'air ?",false],
  ["Pourquoi les chats dorment-ils autant ?",false],
  ["Quel abonnement Netflix existe pour regarder des films ?",false],
  ["Invente une histoire sur mon budget magique",false],
]
budgetCases.forEach(([question,expected])=>{
  const intent=detectAssistantIntent(question)
  const actual=shouldUseLocalBudgetAnswer({question,mode:"general",intent})
  assert.equal(actual,expected,question+" got "+intent)
})
assert.equal(resolveAdvisorModeForQuestion({question:"Combien de lunes possède Jupiter ?",mode:"budget_depenses",intent:"unknown"}),"general")
assert.equal(resolveAdvisorModeForQuestion({question:"Pourquoi le ciel est-il bleu ?",mode:"trouver_aide",intent:"unknown"}),"general")
assert.equal(resolveAdvisorModeForQuestion({question:"Quelles aides existent pour mes enfants ?",mode:"trouver_aide",intent:"unknown"}),"trouver_aide")
assert.equal(resolveAdvisorModeForQuestion({question:"Combien j'ai dépensé en courses ?",mode:"budget_depenses",intent:detectAssistantIntent("Combien j'ai dépensé en courses ?")}),"budget_depenses")
assert.equal(looksPlayfulOrFictionalQuestion("Imagine que les chats deviennent présidents"),true)
assert.equal(isSelfContainedNewQuestion("Combien de lunes possède Jupiter ?"),true)
assert.equal(isSelfContainedNewQuestion("Combien ?"),false)

const promptFr=buildSystemPrompt("fr","","general")
const promptKr=buildSystemPrompt("kreol","","general")
assert.match(promptFr,/OUVERTURE À TOUTES LES QUESTIONS/)
assert.match(promptFr,/Combien de lunes possède Jupiter/)
assert.match(promptKr,/TOUT BANN KESTION/)
const index=await readFile(new URL("../supabase/functions/assistant-aisupabase/index.ts",import.meta.url),"utf8")
assert.match(index,/isProtectedAdvisorQuestion/)
assert.match(index,/buildOpenTopicPrompt/)
assert.match(index,/!protectedTopic/)
assert.match(index,/const savedMemory = protectedTopic/)
assert.match(index,/context\.action === "analyze_refusal" \|\| !protectedTopic/)
const frontend=await readFile(new URL("../src/components/conseiller/AssistantConseiller.jsx",import.meta.url),"utf8")
assert.match(frontend,/resolveAdvisorModeForQuestion/)
assert.match(frontend,/shouldUseLocalBudgetAnswer/)
assert.match(frontend,/shouldLookupAdvisorAids/)
assert.match(frontend,/const aides = needAidFacts \? await fetchAides\(\) : \[\]/)

assert.match(frontend,/assistant-aisupabase-review/)
assert.ok(frontend.includes('get("conseillerBeta") === "1"'))
assert.ok(frontend.includes('hostname.endsWith(".budgetkazpei.pages.dev")'))


const oldAidHandoff = { aideId: 41, aideName: "Pass'Sport" }
for (const question of [
  "Aide-moi à comprendre la relativité",
  "Aide-moi à écrire un poème pour mon enfant",
  "Pourquoi les feuilles sont-elles vertes ?",
]) {
  assert.equal(isSelfContainedNewQuestion(question), true, question)
  assert.equal(
    shouldLookupAdvisorAids({
      question, mode: "trouver_aide",
      conversationContext: afterAid(question),
      recentHistory: aidHistory,
      handoffContext: oldAidHandoff,
    }),
    false, "Old aid handoff must not affect a new unrelated question: " + question,
  )
  assert.equal(
    resolveAdvisorModeForQuestion({ question, mode: "trouver_aide", intent: "unknown" }),
    "general", question,
  )
}
assert.equal(
  shouldLookupAdvisorAids({
    question: "Et pour cette aide ?", mode: "general",
    conversationContext: afterAid("Et pour cette aide ?"),
    recentHistory: aidHistory,
    handoffContext: oldAidHandoff,
  }),
  true, "A real aid follow-up retains its previous handoff",
)

// Regression: an ordinary no-data fuel observation followed by "Oui" and a
// request for solutions is a budget continuation, never an unrelated request.
// Both frontend and Edge Function should answer without spending OpenAI tokens.
const missingFuelHistory = [
  {
    question: "Oui",
    answer: "Je ne trouve pas encore de dépenses classées dans cette catégorie sur la période « 1er novembre → 18 novembre ». Pour comparer vos frais, commencez par enregistrer vos achats dans Mes dépenses.",
    source: "local_budget_followup",
  },
  {
    question: "Je trouve que le carburant est cher",
    answer: "Le carburant peut peser sur le budget. Souhaitez-vous examiner vos dépenses de carburant ?",
    source: "local_budget_observation",
  },
]
const requestSolutions = "Ok j'en ai pas encore mais tu me proposes quoi comme solution"
const localSolutions = resolveAdvisorBudgetNoDataAdvice({
  question: requestSolutions, recentHistory: missingFuelHistory, language: "fr",
})
assert.equal(localSolutions?.source, "local_budget_advice")
assert.match(localSolutions?.answer || "", /carburant/i)
assert.match(localSolutions?.answer || "", /regroupez plusieurs déplacements/i)
assert.doesNotMatch(localSolutions?.answer || "", /je peux surtout vous aider/i)
const serverSolutions = getLocalAdvisorBudgetNoDataAdvice(
  requestSolutions, missingFuelHistory, "fr",
)
assert.match(serverSolutions || "", /carburant/i)
assert.match(serverSolutions || "", /prix au litre/i)
assert.match(getLocalAdvisorBudgetNoDataAdvice(
  "Et si tu me donnes des conseils ?", missingFuelHistory, "kreol",
) || "", /carburant/i)
for (const newQuestion of [
  "Propose-moi une recette de gâteau",
  "Quelles aides CAF ou RSA pourrais-je avoir ?",
  "Je voudrais une comparaison précise des prix du carburant aujourd'hui à Saint-Leu",
  "Peux-tu me proposer une solution personnalisée pour ma situation ?",
  "Je gagne 1800 euros par mois, quelle solution me proposes-tu ?",
]) {
  assert.equal(resolveAdvisorBudgetNoDataAdvice({
    question: newQuestion, recentHistory: missingFuelHistory,
  }), null, "Genuine personalized or new-topic question must not be intercepted: " + newQuestion)
  assert.equal(getLocalAdvisorBudgetNoDataAdvice(
    newQuestion, missingFuelHistory, "fr",
  ), null)
}
assert.equal(resolveAdvisorBudgetNoDataAdvice({question: requestSolutions, recentHistory: []}), null)
assert.equal(getLocalAdvisorBudgetNoDataAdvice(requestSolutions, [], "fr"), null)
assert.equal(resolveAdvisorBudgetNoDataAdvice({
  question: requestSolutions,
  recentHistory: [{question: "Oui", answer: "Je dépense 40 euros dans ce poste.", source: "local_budget_followup"}, missingFuelHistory[1]],
}), null, "Real recorded spending must not trigger the no-data template")

// Screenshot regression: follow-up directly after "fuel is expensive" must
// receive relevant advice, even if there is no recorded spending yet.
const costObservation = [{
  question: "Je trouve que le carburant est cher",
  answer: "Le carburant peut peser sur le budget. Souhaitez-vous examiner vos dépenses de carburant ?",
  source: "local_budget_observation",
}]
for (const question of [
  "Je n'en ai pas encore enregistré mais propose moi des solutions",
  "Ok j'en ai pas encore mais tu me proposes quoi comme solution",
  "Propose-moi des conseils pour économiser",
]) {
  const fromUi = resolveAdvisorBudgetNoDataAdvice({
    question, recentHistory: costObservation, language: "fr",
  })
  assert.equal(fromUi?.source, "local_budget_advice", question)
  assert.match(fromUi?.answer || "", /carburant/i, question)
  const fromServer = getLocalAdvisorBudgetNoDataAdvice(question, costObservation, "fr")
  assert.match(fromServer || "", /prix au litre/i, question)
}
// If the old bug had already inserted the generic off-topic response, recover
// the previous legitimate budget topic instead of repeating that refusal.
const badFallbackHistory = [{
  question: "Je n'en ai pas encore enregistré mais propose moi des solutions",
  answer: "Je peux surtout vous aider sur votre budget, vos économies, les aides et les démarches.",
  source: "local_offtopic",
}, ...costObservation]
const alternativeUi = resolveAdvisorBudgetNoDataAdvice({
  question: "Propose moi autre chose", recentHistory: badFallbackHistory, language: "fr",
})
assert.match(alternativeUi?.answer || "", /pression des pneus/i)
const alternativeServer = getLocalAdvisorBudgetNoDataAdvice(
  "Propose moi autre chose", badFallbackHistory, "fr",
)
assert.match(alternativeServer || "", /pression des pneus/i)
assert.doesNotMatch(alternativeUi?.answer || "", /regroupez plusieurs déplacements/i)

// Continuing after our newly provided advice should also give new suggestions
// without repeating the same local script or paying OpenAI.
const firstAdviceHistory = [{
  question: "Je n'en ai pas encore enregistré mais propose moi des solutions",
  answer: alternativeUi?.answer || "",
  source: "local_budget_advice",
}, ...costObservation]
assert.match(resolveAdvisorBudgetNoDataAdvice({
  question: "Aurais-tu d'autres pistes ?", recentHistory: firstAdviceHistory,
})?.answer || "", /pression des pneus/i)
assert.match(getLocalAdvisorBudgetNoDataAdvice(
  "Propose moi autre chose", firstAdviceHistory,
) || "", /pression des pneus/i)

// Don't hijack an unrelated request after a money discussion.
for (const question of [
  "Propose-moi une recette de gâteau",
  "Propose-moi une chanson",
  "Je veux une solution personnalisée selon ma situation",
  "Peux-tu me proposer un devis précis à 180 euros ?",
]) {
  assert.equal(resolveAdvisorBudgetNoDataAdvice({ question, recentHistory: costObservation }), null)
  assert.equal(getLocalAdvisorBudgetNoDataAdvice(question, costObservation, "fr"), null)
}


// A natural follow-up after the Advisor's own AI answer is contextual,
// regardless of whether the prior reply was a saved-money observation.
// Trusted server topic (not client-reported history) authorizes its one
// metered model call. This reproduces the screenshot "Oui ça va encore augmenter ?".
const contextualQuestions = [
  "Oui ça va encore augmenter ?",
  "Est-ce que ça va baisser ?",
  "Et pourquoi ?",
  "Ça va encore durer longtemps ?",
  "Tu penses que ça va continuer ?",
  "C'est certain ?",
  "Et pour moi ?",
]
for (const question of contextualQuestions) {
  assert.equal(isContextualAdvisorFollowUp(question), true, question)
}
for (const question of [
  "Quelle est la capitale du Japon ?",
  "Pourquoi le ciel est-il bleu ?",
  "Et pourquoi les chats ronronnent-ils ?",
  "Et si la Lune était en fromage ?",
  "Je veux une recette de gâteau",
  "Combien de lunes possède Jupiter ?",
  "Comment fonctionne un volcan ?",
]) {
  assert.equal(isContextualAdvisorFollowUp(question), false, question)
}
assert.equal(advisorTopicGroupForQuestion("Le carburant est cher"), "carburant")
assert.equal(advisorTopicGroupForQuestion("Que faire pour mon APL ?"), "aides")
assert.equal(advisorTopicGroupForQuestion("Combien me coûtent mes courses ?"), "courses")
assert.equal(advisorTrustedTopicLabel("carburant"), "prix et dépenses de carburant")
assert.equal(advisorTrustedTopicLabel("not_a_real_topic"), "")
const trustedTopicMigration = await readFile(new URL("../supabase/migrations/20261118181000_advisor_trusted_conversation_topic.sql", import.meta.url), "utf8")
assert.match(trustedTopicMigration, /advisor_conversation_topics/)
assert.match(trustedTopicMigration, /enable row level security/)
assert.match(trustedTopicMigration, /revoke all on public.advisor_conversation_topics from public, anon, authenticated/)

const advisorEdgeSource = await readFile(new URL("../supabase/functions/assistant-aisupabase/index.ts", import.meta.url), "utf8")
assert.ok(
  advisorEdgeSource.indexOf("getLocalAdvisorBudgetNoDataAdvice(") <
  advisorEdgeSource.indexOf('if (spendScope === "offtopic" &&'),
  "Local no-data advice must be resolved before off-topic routing",
)
assert.match(advisorEdgeSource, /type: "local_budget_advice", calls: 0/)
assert.match(advisorEdgeSource, /readTrustedAdvisorTopic\(supabaseAdmin, context\.userId\)/)
assert.match(advisorEdgeSource, /isContextualAdvisorFollowUp\(context\.question\)/)
assert.match(advisorEdgeSource, /if \(trustedTopic\) \{\s*spendScope = "useful"/)
assert.match(advisorEdgeSource, /context\.body\.trustedPreviousTopic = trustedTopic/)
assert.match(advisorEdgeSource, /await rememberAdvisorTopic\(\s*supabaseAdmin, context\.userId, context\.question/)
// Open-ended questions now reach the model while still passing both atomic
// server cost guards. A generic local redirect must not swallow them.
assert.ok(advisorEdgeSource.includes('if (spendScope === "offtopic" &&'))
assert.doesNotMatch(advisorEdgeSource, /source: "local_offtopic"/)
assert.ok(advisorEdgeSource.includes('const protectedTopic = spendScope === "useful" && (Boolean(purchaseIntent) || isProtectedAdvisorQuestion'))
assert.ok(advisorEdgeSource.includes('context.memory = protectedTopic'))
assert.ok(advisorEdgeSource.includes('buildOpenTopicPrompt(context.body, context.language)'))
assert.ok(advisorEdgeSource.includes('DATE DE RÉFÉRENCE À LA RÉUNION'))
assert.ok(advisorEdgeSource.includes('dataCompleteness.missingFields'))
assert.ok(advisorEdgeSource.includes('Ne compare pas mécaniquement un mois partiel'))
assert.ok(advisorEdgeSource.includes('Pour les droits, barèmes, inflation, SMIC'))
assert.ok(advisorEdgeSource.indexOf('rpc("reserve_advisor_ai_request"') <
  advisorEdgeSource.indexOf('const openAiResult = await callOpenAi'))
assert.ok(advisorEdgeSource.indexOf('rpc("reserve_advisor_ai_request"') <
  advisorEdgeSource.indexOf('rpc("reserve_advisor_openai"'))
assert.match(advisorEdgeSource, /Pour un prix futur, n'affirme jamais une hausse ou une baisse certaine/)
assert.doesNotMatch(advisorEdgeSource, /const recentClientHistory = Array\.isArray\(context\.body\?\.recentHistory\)/)



// Regression: the app must never improvise "20 à 40 %" about historic fuel
// prices. Two official dated price observations can give an exact local answer
// for November 2024/2026 with ZERO OpenAI calls.
const asOfNovember2026 = new Date("2026-11-18T15:00:00Z")
const verifiedFuel = getVerifiedReunionFuelPriceComparison(
  "Les prix du carburant ont augmenté de combien depuis deux ans ?",
  "fr", asOfNovember2026,
)
assert.match(verifiedFuel || "", /1,62/)
assert.match(verifiedFuel || "", /2,11/)
assert.match(verifiedFuel || "", /1,24/)
assert.match(verifiedFuel || "", /1,69/)
assert.match(verifiedFuel || "", /30,2 %/)
assert.match(verifiedFuel || "", /36,3 %/)
assert.match(verifiedFuel || "", /reunion.gouv.fr/)
assert.equal(getVerifiedReunionFuelPriceComparison(
  "Les prix du carburant ont augmenté de combien depuis deux ans à Paris ?",
  "fr", asOfNovember2026,
), null)
assert.equal(getVerifiedReunionFuelPriceComparison(
  "Les prix du carburant ont augmenté de combien depuis deux ans ?",
  "fr", new Date("2027-04-18T15:00:00Z"),
), null, "Do not reuse dated November 2026 fuel prices as current in April 2027")
assert.match(getVerifiedReunionFuelPriceComparison(
  "Compare les prix du gazole en novembre 2024 et novembre 2026",
  "fr", new Date("2027-04-18T15:00:00Z"),
) || "", /36,3 %/, "Explicitly dated historical comparisons remain valid")
const unsupportedFuelAnswer = reviewUnsupportedFuelPriceHistory({
  question: "Combien ont augmenté les prix du carburant depuis 2023 ?",
  answer: "Les prix ont connu une hausse allant de 20 à 40 % en moyenne.",
})
assert.match(unsupportedFuelAnswer, /relevés officiels comparables/)
assert.doesNotMatch(unsupportedFuelAnswer, /20 à 40 %/)
assert.equal(reviewUnsupportedFuelPriceHistory({
  question: "Combien de lunes possède Jupiter ?", answer: "95 lunes",
}), "95 lunes", "Never distort unrelated questions")
assert.equal(reviewUnsupportedFuelPriceHistory({
  question: "Combien coûte un plein de 40 litres ?", answer: "Le coût dépend du prix au litre.",
}), "Le coût dépend du prix au litre.", "Do not interfere with ordinary cost questions")
assert.match(advisorEdgeSource, /getVerifiedReunionFuelPriceComparison\(/)
assert.match(advisorEdgeSource, /reviewUnsupportedFuelPriceHistory\(\{/)
assert.ok(
  advisorEdgeSource.indexOf("getVerifiedReunionFuelPriceComparison(") <
  advisorEdgeSource.indexOf("const openAiResult = await callOpenAi"),
  "Use trusted official fuel prices before making a billable provider call",
)


// Language parity: the same zero-cost BudgetKazPeï capabilities must work
// when KR is selected, including authentic Kreol wording (not merely French
// input with a Kreol output flag).
const kreolObservation = getLocalAdvisorBudgetObservation(
  "Mi trouv mazout lé tro ser", "kreol", "general",
)
assert.match(kreolObservation || "", /Carburant i pé peser/i)
assert.equal(classifyAdvisorSpendScope({
  question: "Mi trouv mazout lé tro ser", mode: "general",
}), "useful")
assert.equal(advisorTopicGroupForQuestion("Mi trouv mazout lé ser"), "carburant")
const kreolHistory = [{
  question: "Mi trouv mazout lé tro ser",
  answer: kreolObservation || "",
  source: "local_budget_observation",
}]
const kreolYes = resolveAdvisorBudgetConfirmation({
  question: "Wi", recentHistory: kreolHistory,
  insights: { budgetAdvisorContext: { spendingByCategory: [] } },
  language: "kreol",
})
assert.equal(kreolYes?.source, "local_budget_followup")
assert.match(kreolYes?.answer || "", /Mi trouv/i)
assert.doesNotMatch(kreolYes?.answer || "", /^Je ne trouve/i)
const kreolSolutionsQuestion = "Donn a moin lezot lide pou mazout"
const kreolAdvice = resolveAdvisorBudgetNoDataAdvice({
  question: kreolSolutionsQuestion, recentHistory: kreolHistory, language: "kreol",
})
assert.equal(kreolAdvice?.source, "local_budget_advice")
assert.match(kreolAdvice?.answer || "", /bann|out|mi/i)
const kreolServerAdvice = getLocalAdvisorBudgetNoDataAdvice(
  kreolSolutionsQuestion, kreolHistory, "kreol",
)
assert.match(kreolServerAdvice || "", /bann|out|mi/i)
assert.doesNotMatch(kreolServerAdvice || "", /^Voici des pistes/i)
assert.equal(isContextualAdvisorFollowUp("Sa i va ankor ogmanté ?"), true)
assert.equal(isContextualAdvisorFollowUp("Konbien sa i kout ?"), true)
assert.equal(isContextualAdvisorFollowUp("Kosa la arrivé su Jupiter ?"), false)
assert.match(getLocalAdvisorSmallTalk("Bonzour", "kreol") || "", /Bonzour/i)
assert.match(getLocalAdvisorSmallTalk("Merci beaucoup", "kreol") || "", /Mi|aou|out|Avèk/i)

// The official dated snapshot also works with natural Kreol questions.
// The output must not fall back to a full French sentence.
const kreolFuel = getVerifiedReunionFuelPriceComparison(
  "Komien pri mazout la ogmanté depi dé zan ?", "kreol", asOfNovember2026,
)
assert.match(kreolFuel || "", /36,3 %/)
assert.match(kreolFuel || "", /Préfekti|Rényon|bann/i)
assert.doesNotMatch(kreolFuel || "", /^À La Réunion, la comparaison/i)
const kreolReview = reviewUnsupportedFuelPriceHistory({
  question: "Komien pri mazout la ogmanté depi 2023 ?",
  answer: "La hausse moyenne est de 20 à 40 %.",
  language: "kreol",
})
assert.match(kreolReview, /Mi pé pa donne/i)
assert.match(kreolReview, /Di a moin/i)
assert.doesNotMatch(kreolReview, /Précisez les deux mois/i)
assert.doesNotMatch(kreolReview, /20 à 40 %/)

console.log("OK: 40+ diverse/farfelues, context-switch, aid, fiction, and budget routes tested; general answers bypass CAF reviews.")


import { buildShoppingHabitSummary, buildLocalShoppingHabitAnswer } from "../src/services/ai/shoppingHabitSummary.js"
const habitRows = [
  {id:"a",receipt_id:"r1",product_name:"Lait de chèvre 1 L",price:3,created_at:"2026-11-01T12:00:00Z"},
  {id:"b",receipt_id:"r1",product_name:"Lait de chèvre 1 L",price:3,created_at:"2026-11-01T12:00:00Z"},
  {id:"c",receipt_id:"r2",product_name:"Lait de chèvre 1 L",price:3,created_at:"2026-11-10T12:00:00Z"},
  {id:"d",receipt_id:"r3",product_name:"Lait de chèvre 500 ml",price:2,created_at:"2026-11-12T12:00:00Z"},
  {id:"e",receipt_id:"r4",product_name:"Lait de chèvre 1 L",price:3,created_at:"2026-11-14T12:00:00Z",needs_review:true},
]
const habitSummary = buildShoppingHabitSummary(habitRows,{now:new Date("2026-11-24T12:00:00Z")})
assert.equal(habitSummary.products.length,1)
assert.equal(habitSummary.products[0].purchaseVisits,2)
assert.equal(habitSummary.products[0].purchaseDays,2)
assert.match(buildLocalShoppingHabitAnswer({question:"Quels produits j'achète régulièrement ?",insights:{shoppingHabits:habitSummary}}).answer,/Lait de chèvre/)
assert.equal(buildLocalShoppingHabitAnswer({question:"Quels produits j'achète régulièrement ? Et combien je dépense ?",insights:{shoppingHabits:habitSummary}}),null)
assert.equal(buildShoppingHabitSummary(habitRows,{available:false}).products.length,0)
assert.equal(afterAid("Finalement, je suis au chômage").turnType,ADVISOR_TURN_TYPES.CORRECTION)
assert.equal(afterAid("J'habite maintenant à Saint-Paul").turnType,ADVISOR_TURN_TYPES.CORRECTION)
assert.match(afterAid("J'habite maintenant à Saint-Paul").rankingQuery,/Saint-Paul/)
assert.equal(afterAid("J'ai déjà essayé cette solution").turnType,ADVISOR_TURN_TYPES.REQUEST_ALTERNATIVE)


import { isPersonalPurchaseAnalysisQuestion } from "../src/services/ai/shoppingHabitSummary.js"
for (const q of [
  "Je peux améliorer mon alimentation ?",
  "Par rapport à ce que j'achète",
  "Ok mais regarde dans mes achats",
  "Analyse mes courses",
  "Que penses-tu de mes achats ?",
]) {
  assert.equal(isPersonalPurchaseAnalysisQuestion(q),true,q)
  assert.equal(classifyAdvisorSpendScope({question:q}),"useful",q)
  assert.equal(isProtectedAdvisorQuestion({question:q}),true,q)
  assert.equal(buildLocalShoppingHabitAnswer({question:q,insights:{shoppingHabits:habitSummary}}),null,q)
}
assert.equal(isPersonalPurchaseAnalysisQuestion("Qu'est-ce qu'une alimentation équilibrée ?"),false)
assert.equal(isPersonalPurchaseAnalysisQuestion("Où voir mes achats ?"),false)
assert.ok(habitSummary.recentProducts.some(p=>p.label==="Lait de chèvre 500 ml"&&p.purchaseVisits===1))
const chatSource = await readFile(new URL("../src/components/conseiller/AssistantConseiller.jsx",import.meta.url),"utf8")
assert.match(chatSource,/purchaseAnalysis \? "budget_grocery" : detectedIntent/)
assert.match(chatSource,/!isPersonalPurchaseAnalysisQuestion\(sentQuestion\) && !multipleQuestions/)


import { personalPurchaseIntent, summarizeRecordedPurchases, recordedPurchaseEvidence, identifyPurchaseAdviceFamily } from "../supabase/functions/assistant-aisupabase/engine/purchases/recordedPurchases.mjs"
assert.equal(personalPurchaseIntent("Ok et par rapport à mes derniers achats tu peux regarder ?"),"latest")
assert.equal(personalPurchaseIntent("Je peux améliorer mon alimentation ?"),"analysis")
assert.equal(personalPurchaseIntent("Par rapport à ce que j'achète"),"analysis")
assert.equal(personalPurchaseIntent("Ok mais regarde dans mes achats"),"analysis")
assert.equal(personalPurchaseIntent("Où voir mes achats ?"),null)
assert.equal(personalPurchaseIntent("Qu'est-ce qu'une alimentation équilibrée ?"),null)
const recorded = summarizeRecordedPurchases([
  {product_name:"Lait de chèvre 1 L",created_at:"2026-11-23T12:00:00Z",receipt_id:"1"},
  {product_name:"Lait de chèvre 1 L",created_at:"2026-11-15T12:00:00Z",receipt_id:"2"},
  {product_name:"Riz 1 kg",created_at:"2026-11-23T12:00:00Z",receipt_id:"1"},
  {product_name:"Produit incertain",created_at:"2026-11-23T12:00:00Z",receipt_id:"1",confidence_score:20},
],new Date("2026-11-24T12:00:00Z"))
assert.equal(recorded.observedVisits,2)
assert.equal(recorded.products[0].purchaseVisits,2)
assert.match(recordedPurchaseEvidence(recorded),/23\/11\/2026/)
assert.match(recordedPurchaseEvidence(recorded),/Riz 1 kg/)
assert.doesNotMatch(recordedPurchaseEvidence(recorded),/Produit incertain/)
assert.match(recordedPurchaseEvidence(summarizeRecordedPurchases([],new Date(),false)),/indisponible/)

assert.equal(identifyPurchaseAdviceFamily("Bière blonde 6x33 cl"),"alcohol")
assert.equal(identifyPurchaseAdviceFamily("Bière sans alcool 0.0"),null)
assert.equal(identifyPurchaseAdviceFamily("Vinaigre de vin"),null)
assert.equal(identifyPurchaseAdviceFamily("Gâteaux fourrés chocolat"),"cakes")
assert.equal(identifyPurchaseAdviceFamily("Farine pour gâteau"),null)
assert.equal(identifyPurchaseAdviceFamily("Cola sans sucre"),null)
assert.equal(identifyPurchaseAdviceFamily("Conserve de lentilles"),"plain_preserves")
assert.equal(identifyPurchaseAdviceFamily("Cassoulet en conserve"),"prepared_meals")
const adviceSummary = summarizeRecordedPurchases([
  {product_name:"Bière blonde",price:6,created_at:"2026-11-23",receipt_id:"x"},
  {product_name:"Vin rouge",price:8,created_at:"2026-11-15",receipt_id:"y"},
  {product_name:"Bière sans alcool",price:4,created_at:"2026-11-15",receipt_id:"y"},
],new Date("2026-11-24T12:00:00Z"))
assert.equal(adviceSummary.adviceFamilies[0].observedSpend,14)
assert.equal(adviceSummary.adviceFamilies[0].purchaseVisits,2)


import { buildPurchaseAdviceCases, renderPurchaseAdviceCases } from "../supabase/functions/assistant-aisupabase/engine/purchases/purchaseAdviceCases.mjs"
assert.equal(personalPurchaseIntent("Ok et par rapport à mes derniers achats tu peux regarder ?",[{question:"Je peux améliorer mon alimentation ?"}]),"analysis")
assert.equal(personalPurchaseIntent("Je n'ai plus d'argent pour mes courses"),null)
assert.equal(personalPurchaseIntent("Je cherche une aide alimentaire pour mes courses"),null)
assert.equal(identifyPurchaseAdviceFamily("Chips nature"),"salty_snacks")
assert.equal(identifyPurchaseAdviceFamily("Biscuits apéritifs"),"salty_snacks")
assert.equal(identifyPurchaseAdviceFamily("Eau minérale 1,5 L"),"bottled_water")
const cases = buildPurchaseAdviceCases(adviceSummary)
assert.equal(cases[0].key,"alcohol")
assert.equal(cases[0].scenario25,3.5)
assert.match(renderPurchaseAdviceCases(adviceSummary),/avant le coût d'éventuels remplacements/)
assert.equal(buildPurchaseAdviceCases({available:false,adviceFamilies:adviceSummary.adviceFamilies}).length,0)
assert.equal(buildPurchaseAdviceCases({available:true,adviceFamilies:[{key:"cakes",purchaseDays:1,purchaseVisits:3,observedSpend:20}]}).length,0)
assert.equal(buildPurchaseAdviceCases({available:true,adviceFamilies:[{key:"plain_preserves",purchaseDays:2,purchaseVisits:2,observedSpend:20} ]})[0].scenario25,null)


import { buildPurchaseTrends } from "../supabase/functions/assistant-aisupabase/engine/purchases/purchaseTrends.mjs"
const trendNow = new Date("2026-11-24T12:00:00Z")
const trendRows = [0,7,14,21,28,35,42,49].map((age,i)=>({product_name:"Lait de chèvre 1 L",created_at:new Date(trendNow.getTime()-age*86400000).toISOString(),receipt_id:"trend"+i,unit:"l",quantity:i%2?2:1,price:(i<2?3.5:2.8)*(i%2?2:1)}))
const trend = buildPurchaseTrends(trendRows,trendNow)
assert.equal(trend.priceChanges[0].changePercent,25)
assert.equal(trend.priceChanges[0].previousObservedUnitPrice,2.8)
assert.equal(trend.priceChanges[0].recentObservedUnitPrice,3.5)
assert.equal(trend.comparison.recent30.days,4)
assert.equal(trend.comparison.prior30.days,3)
assert.equal(buildPurchaseTrends(trendRows,trendNow,true).priceChanges.length,0)
assert.equal(buildPurchaseTrends(trendRows,trendNow,true).comparison,null)
assert.equal(buildPurchaseTrends(trendRows.filter(r=>r.receipt_id!=="trend0"),trendNow).replenishment[0].typicalGapDays,7)
assert.equal(buildPurchaseTrends(trendRows.map(r=>({...r,price:2.8*r.quantity})),trendNow).priceChanges.length,0)
assert.equal(buildPurchaseTrends(trendRows.slice(0,2),trendNow).priceChanges.length,0)


import { identifyPurchaseAction, buildPurchaseActionPlan } from "../supabase/functions/assistant-aisupabase/engine/purchases/purchaseActionPlan.mjs"
const monthlyGoal = identifyPurchaseAction("Je veux économiser 50 € par mois sur mes courses")
assert.deepEqual(monthlyGoal,{kind:"goal",monthlyTarget:50})
assert.deepEqual(identifyPurchaseAction("Comment économiser 12,50 euros chaque mois sur mes achats ?"),{kind:"goal",monthlyTarget:12.5})
assert.equal(identifyPurchaseAction("Je veux économiser 50 € sur mes courses"),null)
assert.equal(identifyPurchaseAction("Je demande une aide alimentaire pour mes courses"),null)
assert.equal(identifyPurchaseAction("Je veux économiser 50 € par mois sur mon loyer"),null)
assert.equal(identifyPurchaseAction("Prépare une liste de courses selon mes habitudes d'achat").kind,"shopping_checklist")
assert.equal(identifyPurchaseAction("Est-ce que j'ai fait des économies sur mes courses ?").kind,"progress")
assert.equal(personalPurchaseIntent("Je veux économiser 50 € par mois sur mes courses"),"analysis")
assert.equal(isPersonalPurchaseAnalysisQuestion("Je veux économiser 50 € par mois sur mes courses"),true)
const planSummary={available:true,trends:{comparison:{recent30:{spend:300},prior30:{spend:350},observedDifference:-50},replenishment:[{label:"Riz 1 kg",typicalGapDays:14,daysSinceLast:13}]},adviceFamilies:[{key:"cakes",label:"Biscuits",recent30Spend:40,recent30PurchaseDays:4},{key:"alcohol",label:"Alcool",recent30Spend:80,recent30PurchaseDays:3},{key:"plain_preserves",label:"Conserves",recent30Spend:120,recent30PurchaseDays:5},{key:"sweet_drinks",label:"Sodas",recent30Spend:20,recent30PurchaseDays:1}]}
const actionPlan=buildPurchaseActionPlan(planSummary,monthlyGoal)
assert.equal(actionPlan.goal.modeledGrossReduction,30)
assert.equal(actionPlan.goal.remainingTarget,20)
assert.equal(actionPlan.goal.netSavingsVerified,false)
assert.equal(actionPlan.progress.actualSavingsVerified,false)
assert.equal(actionPlan.checklist[0].checkStockFirst,true)
assert.equal(buildPurchaseActionPlan(planSummary,{kind:"goal",monthlyTarget:5}).goal.modeledGrossReduction,5)
assert.equal(buildPurchaseActionPlan({...planSummary,truncated:true},monthlyGoal).goal.modeledGrossReduction,0)
assert.equal(buildPurchaseActionPlan({...planSummary,trends:{}},monthlyGoal).goal.insufficientHistory,true)
assert.equal(buildPurchaseActionPlan({available:false},monthlyGoal).available,false)


import { extractPurchasePreferences, isPurchaseConstraintFollowUp } from "../supabase/functions/assistant-aisupabase/engine/purchases/purchasePreferences.mjs"
const priorGoal=[{question:"Je veux économiser 50 € par mois sur mes courses"}]
const prefs=extractPurchasePreferences("Je veux garder les biscuits. Je n'ai pas le temps de cuisiner. Sans faire plusieurs magasins.",priorGoal)
assert.deepEqual(prefs,{excludedFamilies:["cakes"],noCooking:true,noExtraTrips:true})
assert.equal(isPurchaseConstraintFollowUp("Je veux garder les biscuits",priorGoal),true)
assert.equal(personalPurchaseIntent("Je veux garder les biscuits",priorGoal),"analysis")
assert.equal(isPurchaseConstraintFollowUp("Je veux garder les biscuits",[{question:"Quelle est la capitale de la France ?"}]),false)
assert.equal(isPurchaseConstraintFollowUp("Je veux garder les biscuits pour une aide alimentaire",priorGoal),false)
assert.equal(extractPurchasePreferences("Finalement je peux réduire les biscuits",[{question:"Je veux garder les biscuits"}]).excludedFamilies.length,0)
assert.equal(extractPurchasePreferences("Je peux cuisiner maintenant",[{question:"Je ne peux pas cuisiner"}]).noCooking,false)
assert.equal(buildPurchaseActionPlan(planSummary,monthlyGoal,prefs).goal.modeledGrossReduction,20)
assert.equal(buildPurchaseActionPlan(planSummary,monthlyGoal,prefs).goal.remainingTarget,30)
assert.equal(buildPurchaseAdviceCases(adviceSummary,{excludedFamilies:["alcohol"]}).length,0)
const noCookSummary={available:true,adviceFamilies:[{key:"cakes",label:"Biscuits",purchaseDays:4,purchaseVisits:4,observedSpend:40}]}
assert.doesNotMatch(renderPurchaseAdviceCases(noCookSummary,"fr",{preferences:{noCooking:true}}),/préparations maison/)
assert.equal(extractPurchasePreferences("J'aime les biscuits").excludedFamilies.length,0)


import { buildProactiveAdvisorNotice, buildProactiveAdvisorNotices, shouldShowAdvisorNotice, NOTICE_COOLDOWN, NOTICE_CACHE_TTL, noticeFingerprint, createNoticeLoader } from "../src/services/ai/proactiveAdvisor.js"
import { isDirectPurchaseAction, renderLocalPurchaseAction } from "../supabase/functions/assistant-aisupabase/engine/purchases/localPurchaseActions.mjs"
const noticeNow = new Date("2026-11-24T12:00:00Z")
const noticeSummary={available:true,observedVisits:5,trends:{priceChanges:[{label:"Lait 1 L",unit:"l",observations:4,changePercent:25,previousObservedUnitPrice:2.8,recentObservedUnitPrice:3.5,lastDate:"2026-11-23"}]}}
const notice=buildProactiveAdvisorNotice(noticeSummary,"fr",noticeNow)
assert.equal(notice.kind,"price")
assert.match(notice.detail,/25 %/)
assert.equal(buildProactiveAdvisorNotice({...noticeSummary,truncated:true},"fr",noticeNow),null)
assert.equal(buildProactiveAdvisorNotice({...noticeSummary,observedVisits:2},"fr",noticeNow),null)
assert.equal(buildProactiveAdvisorNotice({...noticeSummary,trends:{priceChanges:[{...noticeSummary.trends.priceChanges[0],lastDate:"2026-10-01"}]}},"fr",noticeNow),null)
assert.equal(buildProactiveAdvisorNotice({...noticeSummary,trends:{priceChanges:[{...noticeSummary.trends.priceChanges[0],lastDate:"invalid"}]}},"fr",noticeNow),null)
assert.equal(buildProactiveAdvisorNotice({...noticeSummary,trends:{priceChanges:[{...noticeSummary.trends.priceChanges[0],changePercent:-20,recentObservedUnitPrice:2.24}]}},"fr",noticeNow).kind,"price_down")
const opportunitySummary={available:true,observedVisits:5,adviceFamilies:[{key:"cakes",label:"Biscuits",recent30PurchaseDays:3,recent30Spend:40}]}
assert.equal(buildProactiveAdvisorNotice(opportunitySummary,"fr",noticeNow).kind,"opportunity")
assert.match(buildProactiveAdvisorNotice(opportunitySummary,"fr",noticeNow).action,/10,00/)
assert.equal(buildProactiveAdvisorNotice({...opportunitySummary,adviceFamilies:[{key:"plain_preserves",label:"Conserves",recent30PurchaseDays:4,recent30Spend:50}]},"fr",noticeNow),null)
assert.equal(buildProactiveAdvisorNotice({...noticeSummary,...{adviceFamilies:opportunitySummary.adviceFamilies}},"fr",noticeNow,[noticeFingerprint(notice)]).kind,"opportunity")
assert.equal(shouldShowAdvisorNotice(notice,1000,1000+NOTICE_COOLDOWN-1),false)
assert.equal(shouldShowAdvisorNotice(notice,1000,1000+NOTICE_COOLDOWN,noticeFingerprint(notice)),false)
assert.equal(shouldShowAdvisorNotice(notice,1000,1000+NOTICE_COOLDOWN),true)
let noticeReads=0
const cacheLoader=createNoticeLoader(async id=>({available:true,id,calls:++noticeReads}))
const [cacheA,cacheB]=await Promise.all([cacheLoader.get("test-a",1000),cacheLoader.get("test-a",1000)])
assert.equal(noticeReads,1)
assert.deepEqual(cacheA,cacheB)
assert.equal((await cacheLoader.get("test-b",1001)).id,"test-b")
assert.equal(noticeReads,2)
await cacheLoader.get("test-b",1001+NOTICE_CACHE_TTL)
assert.equal(noticeReads,3)
cacheLoader.clear()
await cacheLoader.get("test-b",1002+NOTICE_CACHE_TTL)
assert.equal(noticeReads,4)
assert.equal(isDirectPurchaseAction("Je veux économiser 50 € par mois sur mes courses",monthlyGoal),true)
assert.equal(isDirectPurchaseAction("Je veux économiser 50 € par mois sur mes courses et comment demander le RSA ?",monthlyGoal),false)
assert.equal(isDirectPurchaseAction("Je veux économiser 50 € par mois sur mes courses sans changer de magasin",monthlyGoal),false)
assert.match(renderLocalPurchaseAction(actionPlan,monthlyGoal),/30,00/)
assert.match(renderLocalPurchaseAction(actionPlan,monthlyGoal),/20,00/)
assert.match(renderLocalPurchaseAction(actionPlan,monthlyGoal),/ne garantit pas/)
assert.match(renderLocalPurchaseAction(actionPlan,{kind:"shopping_checklist"}),/Riz 1 kg/)
assert.match(renderLocalPurchaseAction({...actionPlan,progress:{...actionPlan.progress,recent30:{spend:300,visits:5},prior30:{spend:350,visits:6}}},{kind:"progress"}),/ne prouve pas une économie réalisée/)

import { buildPurchaseDrivers, renderPurchaseDrivers } from "../supabase/functions/assistant-aisupabase/engine/purchases/purchaseDrivers.mjs"
const driverRows=[]
for(let i=0;i<3;i++){
  driverRows.push({product_name:"Produit "+i+" 1 kg",unit:"kg",quantity:2,price:6,created_at:"2026-11-"+(10+i),receipt_id:"recent-"+i})
  driverRows.push({product_name:"Produit "+i+" 1 kg",unit:"kg",quantity:1,price:2,created_at:"2026-10-"+(10+i),receipt_id:"prior-"+i})
}
driverRows.push({product_name:"Produit seulement récent",unit:"piece",quantity:1,price:5,created_at:"2026-11-10",receipt_id:"recent-0"})
driverRows.push({product_name:"Produit seulement ancien",unit:"piece",quantity:1,price:4,created_at:"2026-10-10",receipt_id:"prior-0"})
const driverComparison={recent30:{spend:23},prior30:{spend:10},observedDifference:13}
const drivers=buildPurchaseDrivers(driverRows,new Date("2026-11-24T12:00:00Z"),driverComparison)
assert.equal(drivers.priceEffect,4.5)
assert.equal(drivers.quantityEffect,7.5)
assert.equal(drivers.onlyRecent,5)
assert.equal(drivers.onlyPrior,-4)
assert.equal(drivers.canExplainPriceQuantity,true)
assert.equal(drivers.roundingResidual,0)
assert.match(renderPurchaseDrivers(drivers),/quantités achetées/)
assert.equal(buildPurchaseDrivers(driverRows,new Date("2026-11-24T12:00:00Z"),driverComparison,true),null)
assert.equal(buildPurchaseDrivers(driverRows,new Date("2026-11-24T12:00:00Z"),{...driverComparison,recent30:{spend:99}}),null)
assert.equal(identifyPurchaseAction("Pourquoi mes courses me coûtent plus cher ?").kind,"drivers")
assert.equal(isDirectPurchaseAction("Pourquoi mes courses me coûtent plus cher ?",{kind:"drivers"}),true)
assert.equal(isDirectPurchaseAction("Pourquoi mes courses me coûtent plus cher et comment obtenir une aide ?",{kind:"drivers"}),false)
assert.equal(isPersonalPurchaseAnalysisQuestion("Pourquoi mes courses me coûtent plus cher ?"),true)
assert.match(renderLocalPurchaseAction({available:true,drivers},{kind:"drivers"}),/Effet estimé/)
