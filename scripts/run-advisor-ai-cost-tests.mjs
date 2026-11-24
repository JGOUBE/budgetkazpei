import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { buildLocalAidSourceAnswer, isLocalAidSourceRequest } from "../src/services/advisorLocalAidAnswer.js"
import { isSimpleLocalSolidarityQuestion, buildFocusedLocalAidPrompts } from "../supabase/functions/assistant-aisupabase/prompts/localAidPrompt.mjs"
import { classifyLocalAidSource, clarifyLocalAidLinks } from "../supabase/functions/assistant-aisupabase/prompts/localAidSources.mjs"

const aides = [
  { id: 1, nom: "APL", lien_officiel: "https://www.caf.fr/allocataires", actif: true },
  { id: 2, nom: "Pass'Sport", lien_officiel: "https://www.pass.sports.gouv.fr/", actif: true },
  { id: 3, nom: "Fonds solidarité logement", lien: "https://www.departement974.fr/aide/fsl", actif: true },
  { id: 4, nom: "Fonds solidarité logement", lien: "https://www.departement974.fr/aide/fsl", actif: true },
  { id: 5, nom: "Aide périmée", lien_officiel: "https://example.org/", actif: false },
  { id: 6, nom: "Aide factice", lien_officiel: "javascript:alert(1)", actif: true },
]

const exact = buildLocalAidSourceAnswer({
  question: "Donne-moi le lien officiel de l'APL", aides, language: "fr",
})
assert.ok(exact)
assert.equal(exact.recommendedAidIds[0], 1)
assert.match(exact.answer, /https:\/\/www.caf.fr\/allocataires/)
assert.match(exact.answer, /ne confirme pas votre éligibilité/)

const sport = buildLocalAidSourceAnswer({
  question: "Quel est le site officiel du Pass’Sport ?", aides, language: "fr",
})
assert.equal(sport?.recommendedAidNames[0], "Pass'Sport")
assert.equal(buildLocalAidSourceAnswer({
  question: "Où déposer ma demande de Fonds solidarité logement ?", aides,
})?.recommendedAidIds.length, 1, "Identical titles must be deduplicated")

const kreol = buildLocalAidSourceAnswer({
  question: "Lien APL ?", aides, language: "kreol",
})
assert.match(kreol?.answer || "", /Vérifie bann conditions/)
for (const question of [
  "Quel est le montant de l'APL ?",
  "Peux-je avoir le lien de l'APL pour savoir si je suis éligible ?",
  "Lien du RSA et de l'APL",
  "Donne-moi le lien de la mission locale",
  "Pourquoi le ciel est-il bleu ?",
  "Quelles aides pour le loyer ?",
  "J'ai besoin d'un recours et d'un lien pour l'APL",
]) {
  assert.equal(buildLocalAidSourceAnswer({ question, aides }), null, question)
}
assert.equal(isLocalAidSourceRequest("Où faire ma demande d'APL ?"), true)
assert.equal(buildLocalAidSourceAnswer({ question: "Lien aide périmée", aides }), null)
assert.equal(buildLocalAidSourceAnswer({ question: "Lien aide factice", aides }), null)

// End-to-end build guard: if the server code regresses to a second paid model
// call as default, fail the preview build before it can be released.
const backend = await readFile(new URL("../supabase/functions/assistant-aisupabase/index.ts", import.meta.url), "utf8")
const frontend = await readFile(new URL("../src/components/conseiller/AssistantConseiller.jsx", import.meta.url), "utf8")
assert.match(backend, /const memoryEnrichmentAllowed = (?:false|Deno\.env\.get\("ADVISOR_AI_MEMORY_ENRICHMENT"\) === "enabled")/)
assert.match(backend, /if \(protectedTopic && memoryEnrichmentAllowed && intent\?\.complexity === "complex"\)/)
assert.ok(backend.indexOf("const savedMemory = protectedTopic") < backend.indexOf("const memoryEnrichmentAllowed"))
assert.match(backend, /ADVISOR_API_METER/)
assert.match(backend, /openAiCallCount: memoryApiAttempted \? 2 : 1/)
assert.doesNotMatch(backend, /ADVISOR_API_METER[^\n]*question|ADVISOR_API_METER[^\n]*userId/)
assert.match(frontend, /buildLocalAidSourceAnswer\(\{ question: sentQuestion, aides, language: responseLanguage \}\)/)
assert.match(frontend, /if \(localAid\)/)

// Production regression: 7177 input tokens were recorded on simple Saint-Leu
// local aid searches. The full case-rights prompt is not needed here.
const sampleTrustedAids = Array.from({length:6},(_,i)=>({
  id:String(900+i), name:i===0?"K’DI LE CŒUR":i===1?"Croix-Rouge sur Roues":"Association test "+i,
  organisme:i===1?"Croix-Rouge française":"Association locale",commune:"Saint-Leu",
  zoneCouverte:"Saint-Leu et environs",typeDispositif:"aide_alimentaire",
  verificationStatus:"operateur_reference_2026",periodeValidite:"Opérateur référencé 2025–2026 ; horaires à vérifier.",
  description:"Épicerie solidaire et soutien alimentaire pour des ménages en difficulté. ".repeat(10),
  descriptionKreol:"Bann demoun i gagne aide alimentaire sou condition.",
  steps:["Passer par un travailleur social ou CCAS pour une prescription, contacter la structure avant le déplacement.",
    "Demande in prescription sosyal kot CCAS avan ou déplac aou."],
  officialSource:"https://reunion.deets.gouv.fr/L-aide-alimentaire",
}))
const simpleLocal = [
  "J'habite à Saint-Leu, j'ai du mal à payer mes courses. Quelles associations ou épiceries solidaires peuvent m'aider près de chez moi ?",
  "Je n'ai plus assez d'argent pour acheter à manger cette semaine. À qui dois-je m'adresser rapidement ?",
  "Je cherche des associations à Saint-Paul pour m'aider à manger.",
  "Mi cherche in association pou aide mon famille à Saint-Paul.",
  "Quelles épiceries solidaires existent près de Saint-Leu ?",
]
for (const question of simpleLocal) {
  assert.equal(isSimpleLocalSolidarityQuestion({
    question, mode:"general",protectedTopic:true,trustedAidFacts:sampleTrustedAids,
  }),true,"Simple Réunion solidarity request should use a focused prompt: "+question)
}
for (const question of [
  "Je suis au chômage avec 2 enfants, 900 euros de revenus : calcule toutes mes aides.",
  "À combien d'euros de RSA ai-je droit à Saint-Leu ?",
  "J'ai 20 euros pour nourrir 4 personnes, analyse mes achats et mon budget.",
  "Comment faire un recours après un refus du FSL ?",
  "Je cherche des aides pour le logement et l'emploi à Saint-Leu.",
  "Et cette association, est-ce que je suis éligible ?",
]) {
  assert.equal(isSimpleLocalSolidarityQuestion({
    question,mode:"general",protectedTopic:true,trustedAidFacts:sampleTrustedAids,
  }),false,"Complex/entitlement/follow-up case must keep full safeguarded prompt: "+question)
}
assert.equal(isSimpleLocalSolidarityQuestion({
  question:simpleLocal[0], mode:"general",protectedTopic:true,trustedAidFacts:[],
}),false,"Without trusted DB sources, retain the regular fact-finding workflow")
assert.equal(isSimpleLocalSolidarityQuestion({
  question:simpleLocal[0], mode:"general",protectedTopic:false,trustedAidFacts:sampleTrustedAids,
}),false,"Only protected financial/aid topics use the focused prompt")
assert.equal(isSimpleLocalSolidarityQuestion({
  question:simpleLocal[0], mode:"general",protectedTopic:true,trustedAidFacts:sampleTrustedAids,
  conversationContext:{turnType:"REQUEST_ALTERNATIVE"},
}),false,"Alternative asks should retain recommendation and conversation safeguards")
const focusedPrompts=buildFocusedLocalAidPrompts({
  question:simpleLocal[0],language:"fr",
  profile:{commune:"Saint-Leu",email:"secret@example.com",nom:"Ne pas afficher"},
  recommendedAides:sampleTrustedAids.map(a=>({id:a.id,description:"untrusted fake payout €9000"})),
  trustedAidFacts:sampleTrustedAids,dateReunion:"24/11/2026",
})
assert.ok(focusedPrompts.systemPrompt.length+focusedPrompts.userPrompt.length<9000,
  "Local solidarity prompt must stay below 9000 characters while retaining four sources")
assert.equal(focusedPrompts.keptAides,4)
const undocumented = buildFocusedLocalAidPrompts({
  question:simpleLocal[0],language:"fr",profile:{commune:"Saint-Leu"},
  trustedAidFacts:sampleTrustedAids.map(a=>({...a,verificationStatus:"a_verifier"})),
  dateReunion:"24/11/2026",
})
assert.equal(undocumented.keptAides,0,
  "Unconfirmed associations must fall back to the normal answer instead of being presented as validated")
assert.ok(focusedPrompts.userPrompt.includes("Croix-Rouge sur Roues"))
assert.ok(focusedPrompts.userPrompt.includes("https://reunion.deets.gouv.fr/L-aide-alimentaire"))
assert.ok(focusedPrompts.userPrompt.includes("operateur_reference_2026"))
assert.ok(focusedPrompts.systemPrompt.includes("prescription"))
assert.doesNotMatch(focusedPrompts.userPrompt,/secret@example|untrusted fake payout/)
const kreolPrompts=buildFocusedLocalAidPrompts({
  question:simpleLocal[3],language:"kreol",profile:{commune:"Saint-Paul"},
  trustedAidFacts:sampleTrustedAids,dateReunion:"24/11/2026",
})
assert.match(kreolPrompts.systemPrompt,/créole réunionnais simple/)
assert.match(kreolPrompts.userPrompt,/Bann demoun i gagne aide/)
assert.match(backend,/focusedAidPrompts/)
assert.match(backend,/ADVISOR_PROMPT_PROFILE/)
// Same live sources as the 24 November test in Saint-Leu: directories are
// evidence of referencing, never direct homepages or live booking details.
const deets = "https://reunion.deets.gouv.fr/L-aide-alimentaire"
const andes = "https://andes-france.com/structure/kdi-le-coeur/"
const deetsSource = classifyLocalAidSource(deets)
const andesSource = classifyLocalAidSource(andes)
assert.equal(deetsSource.label, "Référencement officiel DEETS")
assert.equal(deetsSource.type, "official_directory")
assert.equal(andesSource.label, "Fiche de l’organisme sur ANDES")
assert.equal(andesSource.type, "association_directory")
assert.equal(classifyLocalAidSource("javascript:alert(1)").url, "")
assert.equal(classifyLocalAidSource("https://example.org/reference").label, "Lien de référence")

const actualLocalAids = [
  {...sampleTrustedAids[0], id:"119",name:"K’DI LE CŒUR — épicerie solidaire de Saint-Leu",
    officialSource:andes, verificationStatus:"source_confirmee"},
  {...sampleTrustedAids[1], id:"127",name:"Croix-Rouge sur Roues — Saint-Leu (Case du Piton)",
    officialSource:deets, verificationStatus:"operateur_reference_2026"},
]
const localResponse = buildFocusedLocalAidPrompts({
  question:simpleLocal[0],language:"fr",profile:{commune:"Saint-Leu"},
  trustedAidFacts:actualLocalAids,dateReunion:"24/11/2026",
})
assert.equal(localResponse.keptAides,2)
assert.match(localResponse.userPrompt,/Fiche de l’organisme sur ANDES/)
assert.match(localResponse.userPrompt,/Référencement officiel DEETS/)
assert.match(localResponse.systemPrompt,/90 à 140 mots/)
assert.match(localResponse.systemPrompt,/pas le site de la Croix-Rouge/i)
assert.doesNotMatch(localResponse.systemPrompt,/fiche ici ».*autorise/i)
const modelDraft = [
  "1. **Croix-Rouge sur Roues** : distribution alimentaire. [fiche ici]("+deets+")",
  "2. **K’DI LE CŒUR** : épicerie solidaire. [leur site]("+andes+")",
].join("\n")
const improved = clarifyLocalAidLinks(modelDraft,actualLocalAids)
assert.ok(improved.includes("[Référencement officiel DEETS]("+deets+")"))
assert.ok(improved.includes("[Fiche de l’organisme sur ANDES]("+andes+")"))
assert.ok(!improved.includes("[fiche ici]"))
assert.ok(!improved.includes("[leur site]"))
assert.equal(clarifyLocalAidLinks("[Fiche directe]("+andes+")",actualLocalAids),
  "[Fiche directe]("+andes+")", "Specific accurate titles must remain untouched")
assert.equal(clarifyLocalAidLinks("[fiche ici](https://fake.example/info)",actualLocalAids),
  "[fiche ici](https://fake.example/info)", "Never retitle a URL not in verified facts")
assert.equal(clarifyLocalAidLinks("[fiche ici]("+deets+")",[
  {...actualLocalAids[1],verificationStatus:"a_verifier"}
]),"[fiche ici]("+deets+")","Never certify an unverified source")
assert.match(backend,/clarifyLocalAidLinks\(checkedAnswer, trustedAidFacts\)/)
// Real Saint-Leu regression: two source cards have exactly the same social
// referral instructions; don't send those instructions twice to the model.
const saintLeuProcedure = "Pour demander l aide alimentaire habilitée DEETS, solliciter d abord un travailleur social (CCAS, mairie, Département ou service social spécialisé) : une prescription sociale est requise. Contacter ensuite la structure avant tout déplacement ; conditions et distributions à reconfirmer."
const sharedSources = actualLocalAids.map(a => ({...a,steps:[saintLeuProcedure,"Demande in prescription kot travayèr sosyal."]}))
const sharedPrompt = buildFocusedLocalAidPrompts({
  question:simpleLocal[0],language:"fr",profile:{commune:"Saint-Leu"},
  trustedAidFacts:sharedSources,dateReunion:"24/11/2026",
})
assert.equal(sharedPrompt.sharedProcedures,1)
assert.equal(sharedPrompt.userPrompt.split(saintLeuProcedure).length-1,1,
 "The same CCAS instruction must be sent only once for both organizations")
assert.match(sharedPrompt.userPrompt,/DEMARCHES COMMUNES, À EXPLIQUER UNE SEULE FOIS/)
assert.match(sharedPrompt.userPrompt,/Croix-Rouge sur Roues/)
assert.match(sharedPrompt.userPrompt,/K’DI LE CŒUR/)
assert.match(sharedPrompt.systemPrompt,/Ne répète ni prescription, ni orientation, ni CCAS deux fois/)
assert.match(sharedPrompt.systemPrompt,/N’invente pas horaires ou fréquence de distribution/)
const differentProcedures = buildFocusedLocalAidPrompts({
  question:simpleLocal[0],language:"fr",profile:{commune:"Saint-Leu"},
  trustedAidFacts:[
    {...sharedSources[0],steps:["Contacter directement l'organisme pour un rendez-vous"]},
    {...sharedSources[1],steps:[saintLeuProcedure]},
  ],
})
assert.equal(differentProcedures.sharedProcedures,0)
assert.match(differentProcedures.userPrompt,/Contacter directement l'organisme/)
assert.match(differentProcedures.userPrompt,/une prescription sociale est requise/)
assert.doesNotMatch(differentProcedures.userPrompt,/DEMARCHES COMMUNES/)
assert.match(sharedPrompt.systemPrompt,/80 à 125 mots/)
console.log("OK: real Saint-Leu duplicate CCAS/prescription guidance is transmitted once; different prerequisites remain separate.")

console.log("OK: local sources identified without claiming DEETS or ANDES is the association's own site.")

console.log("OK: focused FR/KR solidarity prompts preserve trusted sources at <9000 chars; complex rights keep safeguards.")

console.log("OK: source-only aid requests have zero model calls; complex memory enrichment opt-in only.")
