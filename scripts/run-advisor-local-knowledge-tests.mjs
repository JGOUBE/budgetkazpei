import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { findPrimaryAidTopicIds } from "../src/services/aidTopics.js"
import { rankAidesForAdvisor, selectAidCandidatesForAdvisor } from "../src/services/aidesRanking.js"
import { pickRelevantAidKnowledge, prepareAdvisorAideContext } from "../src/services/advisorAideContext.js"
import { isLocalSupportRequest, shouldLookupAdvisorAids, resolveAdvisorModeForQuestion } from "../src/services/advisorQuestionRouter.js"
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
assert.equal(localContext.source_status,"a_verifier")
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
console.log("OK: real solidarity needs, local associations, request-area priority, multi-need diversity, bounded contextual aid recall.")
