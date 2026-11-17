import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import {
  ADVISOR_TURN_TYPES,
  buildAdvisorConversationContext,
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
import { buildSystemPrompt } from "../supabase/functions/assistant-aisupabase/prompts/systemPrompt.ts"

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

console.log("OK: 40+ diverse/farfelues, context-switch, aid, fiction, and budget routes tested; general answers bypass CAF reviews.")
