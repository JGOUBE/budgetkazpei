import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { buildLocalAidSourceAnswer, isLocalAidSourceRequest } from "../src/services/advisorLocalAidAnswer.js"

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
assert.match(backend, /const memoryEnrichmentAllowed = Deno\.env\.get\("ADVISOR_AI_MEMORY_ENRICHMENT"\) === "enabled"/)
assert.match(backend, /if \(protectedTopic && memoryEnrichmentAllowed && intent\?\.complexity === "complex"\)/)
assert.ok(backend.indexOf("const savedMemory = protectedTopic") < backend.indexOf("const memoryEnrichmentAllowed"))
assert.match(frontend, /buildLocalAidSourceAnswer\(\{ question: sentQuestion, aides, language: responseLanguage \}\)/)
assert.match(frontend, /if \(localAid\)/)
console.log("OK: source-only aid requests have zero model calls; complex memory enrichment opt-in only.")
