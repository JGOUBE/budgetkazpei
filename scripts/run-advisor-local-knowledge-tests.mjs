import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { findPrimaryAidTopicIds } from "../src/services/aidTopics.js"
import { rankAidesForAdvisor, selectAidCandidatesForAdvisor } from "../src/services/aidesRanking.js"
import { pickRelevantAidKnowledge, prepareAdvisorAideContext } from "../src/services/advisorAideContext.js"
import { isLocalSupportRequest, shouldLookupAdvisorAids, shouldUseLocalBudgetAnswer, resolveAdvisorModeForQuestion } from "../src/services/advisorQuestionRouter.js"
import { buildAdvisorRequestBody } from "../src/services/advisorRequestPayload.js"
import { REUNION_ORIENTATION } from "../src/data/reunionOrientation.js"
import { classifyAdvisorSpendScope } from "../supabase/functions/assistant-aisupabase/engine/routing/offTopicPolicy.ts"
import { isProtectedAdvisorQuestion } from "../supabase/functions/assistant-aisupabase/engine/routing/questionScope.ts"

const needs = [
  "Je cherche une épicerie solidaire à Saint-Leu",
  "Où trouver une association qui peut m'aider à manger ?",
  "J'ai besoin d'un collectif d'entraide",
  "Je n'ai plus de quoi manger",
  "Kot mi trouve in épicerie solidaire ?",
]
for (const question of needs) {
  assert.equal(isLocalSupportRequest(question),true,question)
  assert.equal(shouldLookupAdvisorAids({question,mode:"general"}),true,question)
  assert.equal(classifyAdvisorSpendScope({question,mode:"general"}),"useful",question)
  assert.equal(isProtectedAdvisorQuestion({question,mode:"general"}),true,question)
}
assert.equal(shouldLookupAdvisorAids({
  question:"Je cherche une épicerie solidaire",mode:"trouver_aide",
}),true)
assert.equal(resolveAdvisorModeForQuestion({
  question:"Je cherche une épicerie solidaire",mode:"trouver_aide",
}),"trouver_aide")
for (const question of ["Pourquoi les associations existent-elles ?", "Imagine une association sur Jupiter"]) {
  assert.equal(isLocalSupportRequest(question),false,question)
}
assert.equal(classifyAdvisorSpendScope({question:"Pourquoi les associations existent-elles ?"}),"offtopic")

for (const question of [
  "Je suis victime de violences conjugales",
  "Mon enfant a des difficultés scolaires",
  "Je cherche du soutien scolaire",
]) {
  assert.equal(isLocalSupportRequest(question),true,question)
  assert.equal(shouldLookupAdvisorAids({question,mode:"general"}),true,question)
  assert.equal(classifyAdvisorSpendScope({question,mode:"general"}),"useful",question)
  assert.equal(isProtectedAdvisorQuestion({question,mode:"general"}),true,question)
}
// Regressions reproduced from user screenshots after the 22 Nov release.
const realFoodQuestions = [
  "J'habite à Saint-Leu, j'ai du mal à payer mes courses. Quelles associations ou épiceries solidaires peuvent m'aider près de chez moi ?",
  "Je n'ai plus assez d'argent pour acheter à manger cette semaine. À qui dois-je m'adresser rapidement ?",
  "Je ne peux plus payer mes courses alimentaires, qui peut m'aider ?",
  "Mi nana pu de quoi manzé, mi cherche in association.",
]
for (const question of realFoodQuestions) {
  assert.equal(isLocalSupportRequest(question), true, "Food support was missed: "+question)
  assert.equal(shouldLookupAdvisorAids({question,mode:"general"}), true,
    "Aid directory should be consulted: "+question)
  assert.equal(shouldUseLocalBudgetAnswer({question,mode:"general",intent:"budget_grocery"}), false,
    "Food aid request must never answer with unrelated grocery statistics: "+question)
  assert.equal(classifyAdvisorSpendScope({question,mode:"general"}), "useful",
    "Food hardship must not cost an off-topic quota: "+question)
  assert.equal(isProtectedAdvisorQuestion({question,mode:"general"}), true,
    "Food assistance must retain source safeguards: "+question)
}
for (const question of [
  "Je cherche des associations à Saint-Paul qui accompagnent gratuitement les familles en difficulté.",
  "Mi cherche in association pou aide mon famille à Saint-Paul.",
  "Je cherche des épiceries solidaires à Saint-Leu.",
]) {
  assert.equal(shouldLookupAdvisorAids({question,mode:"general"}), true,
    "Local support should use the indexed directory")
  assert.equal(classifyAdvisorSpendScope({question,mode:"general"}), "useful")
}
assert.equal(shouldUseLocalBudgetAnswer({
 question:"Combien ai-je dépensé en courses ce mois-ci ?",mode:"general",intent:"budget_grocery"
}),true,"Explicit analysis of saved shopping expenses must still use its local answer")

const oversizedFiches = Array.from({length:8},(_,i)=>({
  id:i+1, nom:"Épicerie solidaire "+i,nom_kreol:"Epicerie solider "+i,
  description:"Accompagnement social et colis alimentaires. ".repeat(120),
  demarches:"Contacter une assistante sociale. ".repeat(90),
  organisme:"Association de proximité",categorie:"alimentaire",
  type_dispositif:"aide_alimentaire",commune:"Saint-Leu",
  verification_status:"operateur_reference_2026",
  periode_validite:"Permanences à reconfirmer. ".repeat(40),
  lien_officiel:"https://reunion.deets.gouv.fr/",
  source_verification:"https://reunion.deets.gouv.fr/",
}))
const oversizedFinancial = {intent:"budget_grocery",budgetAdvisorContext:{
  period:{current:"2026-11",comparison:"2026-10"},
  spendingByCategory:Array.from({length:150},(_,i)=>({name:"poste "+i,amount:i})),
  grocery:{historicalBasketEstimate:400,reliableSavingsTotal:null},
},dataUsed:{sources:["recorded_data"]}}
const leanRequest = buildAdvisorRequestBody({
  originalQuestion:realFoodQuestions[0],assistantMode:"general",language:"fr",
  localContext:{commune:"Saint-Leu",financial:oversizedFinancial},
  recommendedAides:oversizedFiches,
  recommended_aides:oversizedFiches,
  reunionOrientation:REUNION_ORIENTATION,
  reunion_orientation:REUNION_ORIENTATION,
  recentHistory:Array.from({length:6},()=>({
    question:"Une ancienne question longue ".repeat(30),
    answer:"Une ancienne réponse longue ".repeat(90),
    recommendedAidIds:[1,2,3],
  })),
})
assert.equal(leanRequest.recommendedAides.length,8)
assert.equal(leanRequest.recommended_aides,undefined)
assert.equal(leanRequest.reunion_orientation,undefined)
assert.equal(leanRequest.profile,undefined)
assert.equal(leanRequest.localContext.commune,"Saint-Leu")
assert.equal(leanRequest.recommendedAides[0].eligibilite_confirmee,false)
assert.equal(leanRequest.recommendedAides[0].source_verification,"https://reunion.deets.gouv.fr/")
assert.equal(leanRequest.recentHistory.length,4)
assert.ok(JSON.stringify(leanRequest).length < 22000,
  "Oversized advisor data must be reduced below safe Edge Function request bounds")

assert.ok(findPrimaryAidTopicIds("Je suis victime de violences").includes("victimes"))
assert.ok(findPrimaryAidTopicIds("Mon enfant a des difficultés scolaires").includes("scolarite"))
const nonCashFixtures = [
  {nom:"Pass Culture",type_dispositif:"credit_culturel",montant_max:150,
   statut_verification:"source_confirmee",actif:true},
  {nom:"Pass'Sport",type_dispositif:"reduction_tarifaire",montant_max:100,
   statut_verification:"source_confirmee",actif:true},
]
const noCash = prepareAdvisorAideContext(nonCashFixtures,false)
assert.ok(noCash.every(aide=>aide.aide_en_especes===false))
assert.ok(noCash.every(aide=>aide.montant_max===null))
assert.match(noCash[0].montant,/Crédit culturel/)
assert.match(noCash[1].montant,/Réduction/)


const supportCases = [
  {id:"legal",nom:"ARAJUFA France Victimes Réunion",categorie:"social",
    description_fr:"Accompagnement de victimes de violences et soutien juridique",actif:true},
  {id:"homework",nom:"CLAS — accompagnement à la scolarité",categorie:"scolarite",
    description_fr:"Soutien scolaire et aide aux devoirs des enfants",actif:true},
  {id:"food",nom:"Épicerie solidaire Saint-Leu",categorie:"alimentaire",
    description_fr:"Colis alimentaires et entraide",actif:true},
]
assert.equal(selectAidCandidatesForAdvisor(supportCases,{},"Je suis victime de violences")[0]?.id,"legal")
assert.equal(selectAidCandidatesForAdvisor(supportCases,{},"Mon enfant a des difficultés scolaires")[0]?.id,"homework")
assert.equal(selectAidCandidatesForAdvisor(supportCases,{},"Je ne peux plus payer mes courses alimentaires")[0]?.id,"food")

const localAides = [
  { id:1, nom:"Épicerie solidaire Saint-Pierre",commune:"Saint-Pierre",categorie:"alimentaire",
    description_fr:"Distribution alimentaire solidaire",score_priorite:200,actif:true },
  { id:2, nom:"Épicerie solidaire Saint-Leu",commune:"Saint-Leu",categorie:"alimentaire",
    description_fr:"Distribution alimentaire solidaire",score_priorite:90,actif:true },
  { id:3, nom:"Aide alimentaire régionale",commune:null,categorie:"alimentaire",
    description_fr:"Orientation sociale",score_priorite:90,actif:true },
]
const requested=rankAidesForAdvisor(localAides,{commune:"Saint-Pierre"},
  "Je cherche une épicerie solidaire à Saint-Leu")
assert.equal(requested[0].id,2,"Requested commune must beat the saved commune")
const evidenceCandidates=[
  {id:"outdated",nom:"Aide au dépôt de garantie",categorie:"logement",commune:"Saint-Leu",
    description_fr:"Accompagnement pour le dépôt de garantie",
    statut_verification:"a_reconfirmer",score_priorite:135,actif:true},
  {id:"verified",nom:"Avance aide dépôt de garantie",categorie:"logement",commune:"Saint-Leu",
    description_fr:"Accompagnement pour le dépôt de garantie",
    statut_verification:"source_confirmee",score_priorite:98,actif:true},
]
assert.equal(rankAidesForAdvisor(evidenceCandidates,{commune:"Saint-Leu"},
  "Comment financer un dépôt de garantie ?")[0]?.id,"verified",
  "A documented source should win against a similarly relevant stale aid")
assert.ok(prepareAdvisorAideContext(evidenceCandidates)[0].eligibilite_confirmee===false,
  "Source verification is never a legal eligibility decision")
const home=rankAidesForAdvisor(localAides,{commune:"Saint-Pierre"},"Je cherche une épicerie solidaire")
assert.equal(home[0].id,1,"Home commune should win without a requested alternative")
assert.ok(selectAidCandidatesForAdvisor(localAides,{commune:"Saint-Leu"},
  "Où trouver une épicerie solidaire ?").some(item => item.id===2))

const housing=Array.from({length:9},(_,i)=>({
  id:"log"+i,nom:"Soutien logement "+i,categorie:"logement",
  description_fr:"Accompagnement locataires",score_priorite:150-i,actif:true
}))
const job={id:"emploi1",nom:"Accompagnement vers l'emploi",categorie:"emploi",
  description_fr:"Insertion professionnelle",score_priorite:1,actif:true}
const query="Je cherche des solutions pour mon logement et mon emploi"
assert.ok(findPrimaryAidTopicIds(query).includes("logement"))
assert.ok(findPrimaryAidTopicIds(query).includes("emploi"))
const diversified=pickRelevantAidKnowledge([...housing,job],query)
assert.equal(diversified.length,8)
assert.ok(diversified.some(item=>item.id==="emploi1"),
  "Employment assistance should not be crowded out by housing records")
const prepared=prepareAdvisorAideContext([...housing,job],false,query)
assert.equal(prepared.length,8)
assert.ok(prepared.some(item=>item.nom==="Accompagnement vers l'emploi"))
assert.ok(prepared.every(item=>item.eligibilite_confirmee===false))
assert.ok(prepared.every(item=>item.regles_et_montants_a_confirmer===true))

const localContext=prepareAdvisorAideContext([localAides[1]],true,"Épicerie solidaire")[0]
assert.equal(localContext.commune,"Saint-Leu")
assert.equal(localContext.date_verification_source,null)
assert.equal(localContext.source_status,"reference_a_confirmer")
assert.equal(localContext.source_availability,"reference_a_confirmer")
assert.equal(localContext.verification_status,"a_verifier")
assert.equal(localContext.type_dispositif,"non_classe")
assert.equal(localContext.eligibilite_confirmee,false)
assert.equal(localContext.regles_et_montants_a_confirmer,true)

const front=await readFile(new URL("../src/components/conseiller/AssistantConseiller.jsx",import.meta.url),"utf8")
const backend=await readFile(new URL("../supabase/functions/assistant-aisupabase/index.ts",import.meta.url),"utf8")
assert.match(front,/advisorAidCache/)
assert.match(front,/\.range\(offset, offset \+ pageSize - 1\)/)
assert.match(front,/conversationContext\.rankingQuery,/)
assert.match(backend,/CONNAISSANCE DES AIDES ET SOLIDARITÉS À LA RÉUNION/)
assert.match(backend,/N'invente ni association, adresse, horaires/)
assert.match(backend,/rpc\("reserve_advisor_ai_request"/)
assert.ok(backend.indexOf('rpc("reserve_advisor_ai_request"') <
  backend.indexOf("const openAiResult = await callOpenAi"))
assert.match(backend,/ADVISOR_CONTEXT_COMPACTED/)
assert.match(backend,/if \(userPrompt.length > 32000 && protectedTopic/)
console.log("OK: real solidarity needs, local associations, request-area priority, multi-need diversity, bounded contextual aid recall.")
