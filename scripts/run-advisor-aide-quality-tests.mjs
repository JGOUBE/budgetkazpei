import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import {
  safeAidSourceUrl, aidSourceStatus, rankAidDiscovery, aidProfileSignals,
} from "../src/services/aidesRecommendationQuality.js"
import { rankAidesForAdvisor } from "../src/services/aidesRanking.js"
import { prepareAdvisorAideContext } from "../src/services/advisorAideContext.js"
const read = path => readFile(new URL("../"+path, import.meta.url),"utf8")

const same = {nom:"Fonds solidarité logement",categorie:"logement",score_priorite:98,
  besoin_locataire:true,besoin_demandeur_emploi:true,besoin_allocataire_caf:true,actif:true}
const aids=[
  {id:1,...same,lien_officiel:""},
  {id:2,...same,score_priorite:85,lien_officiel:"https://www.departement974.fr/"},
  {id:3,nom:"APL",categorie:"logement",score_priorite:95,besoin_locataire:true,besoin_allocataire_caf:true,lien_officiel:"https://caf.fr",actif:true},
  {id:4,nom:"Aide familiale",categorie:"famille",score_priorite:92,besoin_enfant:true,actif:true},
  {id:5,nom:"Archive inactive",score_priorite:999,actif:false,lien:"https://example.org"},
  {id:6,nom:"Autre service",score_priorite:25,lien_officiel:"javascript:alert(1)",actif:true},
]
assert.equal(safeAidSourceUrl("javascript:alert(1)"),"")
assert.equal(safeAidSourceUrl("data:text/html,x"),"")
assert.equal(safeAidSourceUrl("https://www.caf.fr/"),"https://www.caf.fr/")
assert.equal(aidSourceStatus({lien_officiel:""}).label,"reference_a_confirmer")
assert.equal(aidSourceStatus({lien:"https://www.caf.fr/"}).available,true)
assert.equal(aidSourceStatus({lien_officiel:"javascript:alert(1)"}).available,false)
// A missing optional profile field is not negative eligibility evidence.
const unknown=rankAidDiscovery(aids,{},[],20)
assert.equal(unknown.some(a=>a.nom==="APL"),true)
assert.equal(unknown.some(a=>a.nom==="Aide familiale"),true)
assert.equal(unknown.some(a=>a.id===5),false)
assert.equal(unknown.filter(a=>a.nom===same.nom).length,1)
assert.equal(unknown.find(a=>a.nom===same.nom).id,2,"Prefer sourced duplicate")
const renter=rankAidDiscovery(aids,{logement:"locataire",nombre_enfants:2,allocataire_caf:true},[],20)
assert.ok(renter.find(a=>a.id===3).matchReasons.includes("logement"))
assert.ok(renter.find(a=>a.id===4).matchReasons.includes("famille"))
assert.equal(aidProfileSignals(aids[2],{}).reasons.length,0)
assert.equal(rankAidDiscovery(aids,{},new Set([1]),20).find(a=>a.nom===same.nom).id,1,"Tracked old identity must remain reachable")
// Audience booleans, including CAF/demandeur, are suggestions, not legal conditions.
const falseCaf=rankAidDiscovery(aids,{logement:"proprietaire",allocataire_caf:false,demandeur_emploi:false,nombre_enfants:0},[],20)
assert.ok(falseCaf.some(a=>a.nom==="APL"))
assert.ok(falseCaf.some(a=>a.nom==="Fonds solidarité logement"))
const advisor=rankAidesForAdvisor(aids,{}, "aide pour mon logement")
assert.equal(advisor.filter(a=>a.nom===same.nom).length,1)
assert.equal(advisor.some(a=>a.id===5),false)
const facts=prepareAdvisorAideContext(aids,true)
assert.equal(facts.some(row=>row.nom==="Archive inactive"),false)
assert.ok(facts.every(row=>row.eligibilite_confirmee===false))
assert.ok(facts.every(row=>row.regles_et_montants_a_confirmer===true))
assert.equal(facts.find(row=>row.nom==="Aide familiale").source_status,"reference_a_confirmer")
assert.equal(facts.find(row=>row.nom==="APL").source_status,"reference_disponible")
const aidePage=await read("src/components/aides/AidesPage.jsx")
const assistant=await read("src/components/conseiller/AssistantConseiller.jsx")
assert.match(aidePage,/rankAidDiscovery\(aides, profile \|\| \{\}, trackedIds, 12\)/)
assert.doesNotMatch(aidePage,/function matchesProfile\(/)
assert.match(aidePage,/\.eq\("actif", true\)/)
assert.match(assistant,/\.eq\("actif", true\)/)
assert.match(aidePage,/source-note/)
assert.equal((aidePage.match(/mode: "preparer_relance", Icon: Mail/g)||[]).length,2)
console.log("OK: aids personalize without false exclusions, preserve tracked IDs, show source caveats and route relances.")
