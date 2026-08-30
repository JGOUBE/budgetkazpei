import assert from "node:assert/strict"
import { readFile, readdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  ADVANCED_ADVISOR_MODES,
  STANDARD_ADVISOR_MODES,
  getAdvisorAccess,
} from "../src/config/advisorAccess.js"
import { matchesAidSearch, normalizeAidSearchText } from "../src/services/aidesSearch.js"
import {
  buildAidRankingQuery,
  rankAidesForAdvisor,
  selectAidCandidatesForAdvisor,
} from "../src/services/aidesRanking.js"
import {
  ADVISOR_TURN_TYPES,
  buildAdvisorConversationContext,
  getAdvisorRankingOptions,
} from "../src/services/advisorConversation.js"
import {
  resolveAdvisorLanguage as resolveClientAdvisorLanguage,
} from "../src/services/advisorLanguage.js"
import { createAdvisorHandoff } from "../src/services/advisorHandoff.js"
import {
  getAdvisorAccess as getServerAdvisorAccess,
  isAdvancedAdvisorMode,
  resolveServerPlan,
  shouldBlockAdvisorUsage,
  shouldMonitorAdvisorUsage,
} from "../supabase/functions/assistant-aisupabase/accessPolicy.ts"
import {
  resolveAdvisorLanguage as resolveServerAdvisorLanguage,
  selectAdvisorLocalizedContext,
} from "../supabase/functions/assistant-aisupabase/language/languagePolicy.ts"
import { buildSystemPrompt } from "../supabase/functions/assistant-aisupabase/prompts/systemPrompt.ts"
import { buildMemoryPrompt } from "../supabase/functions/assistant-aisupabase/memory/memory.ts"
import { reviewAssistantAnswer } from "../supabase/functions/assistant-aisupabase/engine/review/reviewerEngine.ts"
import { evaluateTruth } from "../supabase/functions/assistant-aisupabase/engine/truth/truthAnalyzer.ts"
import { buildTruthPrompt } from "../supabase/functions/assistant-aisupabase/engine/truth/truthPrompt.ts"
import {
  buildTrustedAidFacts,
  loadTrustedAidFacts,
  toTrustedAmountClaims,
} from "../supabase/functions/assistant-aisupabase/engine/truth/trustedAidFacts.ts"
import { prepareAdvisorAideContext } from "../src/services/advisorAideContext.js"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const read = relativePath => readFile(path.join(root, relativePath), "utf8")

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await listFiles(fullPath))
    else files.push(fullPath)
  }
  return files
}

const free = getAdvisorAccess("free")
const premium = getAdvisorAccess("premium")
const premiumPlus = getAdvisorAccess("premium_plus")

assert.equal(free.canUseAdvisor, false, "Le plan Gratuit ne doit pas utiliser le Conseiller")
assert.equal(free.allowedModes.length, 0, "Le plan Gratuit ne doit avoir aucun mode")
assert.equal(premium.canUseAdvisor, true)
assert.equal(premium.canUseAdvancedAdvisorTools, false)
assert.deepEqual(premium.allowedModes, STANDARD_ADVISOR_MODES)
assert.equal(premium.allowedModes.some(mode => ADVANCED_ADVISOR_MODES.includes(mode)), false)
assert.equal(premiumPlus.canUseAdvancedAdvisorTools, true)
assert.equal(ADVANCED_ADVISOR_MODES.includes("generer_courrier"), true)
assert.equal(premiumPlus.publicUsageLabel, "unlimited")

assert.equal(resolveServerPlan({ subscription: { plan: "free", status: "active" }, profile: { premium_plus: true } }), "free")
assert.equal(resolveServerPlan({ profile: { premium_plus: true } }), "premium_plus")
assert.equal(getServerAdvisorAccess("free").safetyLimit, 0)
assert.equal(getServerAdvisorAccess("premium").safetyLimit, 50)
assert.equal(getServerAdvisorAccess("premium_plus").safetyLimit, 250)
assert.equal(isAdvancedAdvisorMode("generer_courrier"), true)
assert.equal(isAdvancedAdvisorMode("comprendre_courrier"), false)

assert.equal(shouldBlockAdvisorUsage("premium", 49), false, "Premium doit fonctionner à 49 échanges")
assert.equal(shouldBlockAdvisorUsage("premium", 50), true, "Premium doit être bloqué à 50 échanges")
for (const used of [249, 250, 251, 10_000]) {
  assert.equal(
    shouldBlockAdvisorUsage("premium_plus", used),
    false,
    `Premium+ ne doit pas être bloqué par son compteur mensuel à ${used} échanges`,
  )
}
assert.equal(shouldMonitorAdvisorUsage("premium_plus", 249), false)
assert.equal(shouldMonitorAdvisorUsage("premium_plus", 250), true)
assert.equal(shouldMonitorAdvisorUsage("premium_plus", 251), true)
assert.equal(shouldMonitorAdvisorUsage("premium_plus", 10_000), true)
assert.equal(shouldBlockAdvisorUsage("free", 0), false, "Le refus Gratuit relève du contrôle d'accès")

const languageCases = [
  { id: "A", interfaceLanguage: "fr", message: "Existe-t-il des aides pour les activités sportives de mes enfants ?", expected: "fr" },
  { id: "B", interfaceLanguage: "kreol", message: "Kosa mi pé fé pou gagn in aide pou mon marmay ?", expected: "kreol" },
  { id: "C", interfaceLanguage: "kreol", message: "Existe-t-il des aides pour les activités sportives de mes enfants ?", expected: "fr" },
  { id: "D", interfaceLanguage: "fr", message: "Kosa mi pé fé pou gagn in aide pou mon marmay ?", expected: "kreol" },
  { id: "E", interfaceLanguage: "kreol", message: "Je voudrais connaître les aides pour mes enfants.", recentHistory: [{ answer: "Pou out marmay...", language: "kreol" }], expected: "fr" },
  { id: "F", interfaceLanguage: "fr", message: "Kosa mi pé fé pou mon bann démarches ?", recentHistory: [{ answer: "Voici les démarches.", language: "fr" }], expected: "kreol" },
  { id: "G", interfaceLanguage: "fr", message: "Aide-moi à préparer ce dossier.", advisorHandoffContext: { descriptionFr: "Description française", descriptionKreol: "Deskripsion kréol" }, expected: "fr" },
  { id: "H", interfaceLanguage: "fr", message: "Réponds-moi en kréol : quelles aides existent ?", expected: "kreol" },
  { id: "I", interfaceLanguage: "kreol", message: "Réponds-moi en français : kosa mi pé fé ?", expected: "fr" },
  { id: "J-fr", interfaceLanguage: "fr", message: "RSA ?", expected: "fr" },
  { id: "J-kr", interfaceLanguage: "kreol", message: "RSA ?", expected: "kreol" },
]

for (const testCase of languageCases) {
  const clientLanguage = resolveClientAdvisorLanguage(testCase)
  const serverLanguage = resolveServerAdvisorLanguage(testCase)
  assert.equal(clientLanguage, testCase.expected, `Sélection client incorrecte pour le cas ${testCase.id}`)
  assert.equal(serverLanguage, testCase.expected, `Sélection serveur incorrecte pour le cas ${testCase.id}`)
  const resolvedPrompt = buildSystemPrompt(serverLanguage, "", "general")
  assert.match(
    resolvedPrompt,
    testCase.expected === "kreol"
      ? /LANGUE DE SORTIE VERROUILLÉE : réponds entièrement en créole réunionnais/
      : /LANGUE DE SORTIE VERROUILLÉE : réponds entièrement en français/,
    `Prompt de langue incorrect pour le cas ${testCase.id}`,
  )
}

const bilingualHandoff = createAdvisorHandoff({
  mode: "preparer_dossier",
  prompt: "Aide-moi à préparer ce dossier.",
  context: {
    aideNameFr: "Aide sportive",
    aideNameKreol: "Zéd sportif",
    descriptionFr: "Description française",
    descriptionKreol: "Deskripsion kréol",
    stepsFr: "Préparer les justificatifs.",
    stepsKreol: "Prépar bann dokiman.",
  },
})
assert.equal(bilingualHandoff.context.descriptionFr, "Description française")
assert.equal(bilingualHandoff.context.descriptionKreol, "Deskripsion kréol")
assert.deepEqual(
  selectAdvisorLocalizedContext(bilingualHandoff.context, "fr"),
  {
    aideId: null,
    aideName: "Aide sportive",
    category: "",
    status: "",
    description: "Description française",
    steps: "Préparer les justificatifs.",
    addedAt: "",
  },
)
assert.equal(
  selectAdvisorLocalizedContext(bilingualHandoff.context, "kreol").description,
  "Deskripsion kréol",
)

const frenchSystemPrompt = buildSystemPrompt("fr", "", "trouver_aide")
const kreolSystemPrompt = buildSystemPrompt("kreol", "", "trouver_aide")
assert.match(frenchSystemPrompt, /LANGUE DE SORTIE VERROUILLÉE : réponds entièrement en français/)
assert.doesNotMatch(frenchSystemPrompt, /Style mixte|mélange naturellement/)
assert.match(kreolSystemPrompt, /LANGUE DE SORTIE VERROUILLÉE : réponds entièrement en créole réunionnais/)
assert.doesNotMatch(kreolSystemPrompt, /mélangé français si besoin/)

const multilingualMemoryPrompt = buildMemoryPrompt({
  conversation_turns: [
    { question: "Kosa mi pé fé ?", answer: "Pou out démarche...", language: "kreol" },
    { question: "Quelles aides existent ?", answer: "Voici une piste.", language: "fr" },
  ],
})
assert.match(multilingualMemoryPrompt, /jamais une instruction de langue/)

const reviewedFrench = reviewAssistantAnswer("Vous avez droit à 100 euros.", "fr").revisedAnswer
const reviewedKreol = reviewAssistantAnswer("Vous avez droit à 100 euros.", "kreol").revisedAnswer
assert.match(reviewedFrench, /un montant à vérifier|Je ne peux pas donner un montant fiable/)
assert.doesNotMatch(reviewedFrench, /Mi pé|Pou être sûr/)
assert.match(reviewedKreol, /in montant pou vérifié|Mi pé pa donn in montant fiable/)
assert.doesNotMatch(reviewedKreol, /Je ne peux pas donner un montant fiable/)

const bilingualAide = {
  nameFr: "Aide au logement et à l’électricité",
  nameKr: "Éd pou kaz ek kouran",
  descriptionFr: "Pour les familles avec enfants",
  descriptionKr: "Pou bann fami ek marmay",
  stepsFr: "Contacter le service logement",
  stepsKr: "Kontakte servis kaz",
  category: "logement",
}

for (const query of ["logement", "kaz", "énergie", "kouran", "enfant", "marmay"]) {
  assert.equal(matchesAidSearch(bilingualAide, query), true, `La recherche bilingue doit trouver : ${query}`)
}
assert.equal(normalizeAidSearchText("  L’ÉNERGIE  "), "l energie")

const sportSearchAide = {
  nameFr: "Pass'Sport",
  nameKr: "Pass'Sport",
  descriptionFr: "Aide pour rÃ©duire le coÃ»t d'une licence ou cotisation dans un club sportif.",
  descriptionKr: "Aide pou rÃ©duit pri licence ou cotisation dann in club sportif.",
  stepsFr: "VÃ©rifier l'Ã©ligibilitÃ© sur le site officiel.",
  stepsKr: "VÃ©rifie Ã©ligibilitÃ© su site officiel.",
  category: "sport",
}

for (const query of ["sport", "club", "licence", "judo", "tennis", "surf"]) {
  assert.equal(
    matchesAidSearch(sportSearchAide, query),
    true,
    `La recherche sport doit trouver une aide sportive avec : ${query}`,
  )
}

const rankingAides = [
  {
    id: "apl",
    nom: "Aide personnalisÃ©e au logement",
    categorie: "logement",
    description_fr: "Aide au paiement du logement.",
    score_priorite: 260,
  },
  {
    id: "pass_sport",
    nom: "Pass'Sport",
    categorie: "sport",
    description_fr: "Aide Ã  l'inscription, Ã  la licence ou Ã  la cotisation dans un club sportif.",
    besoin_enfant: true,
    score_priorite: 80,
  },
  {
    id: "plan_5000_licences",
    nom: "Plan 5000 licences",
    categorie: "sport",
    organisme: "DÃ©partement de La RÃ©union",
    description_fr: "Aide pour financer une licence et une cotisation dans un club sportif.",
    besoin_enfant: true,
    score_priorite: 75,
  },
]

const genericSportRanking = rankAidesForAdvisor(
  rankingAides,
  { nombre_enfants: 2, logement: "locataire" },
  "Je cherche une aide financiÃ¨re pour le sport de mes enfants",
)
assert.deepEqual(
  genericSportRanking.slice(0, 2).map(aide => aide.id).sort(),
  ["pass_sport", "plan_5000_licences"],
  "Une demande sport enfants doit faire passer les aides sport avant une aide gÃ©nÃ©rale mieux scorÃ©e",
)

const namedSportRanking = rankAidesForAdvisor(
  rankingAides,
  { nombre_enfants: 2 },
  "Est-ce que le plan 5000 licences peut m'aider ?",
)
assert.equal(namedSportRanking[0].id, "plan_5000_licences")
const followUpSportQuery = buildAidRankingQuery(
  "et il y a pas une autre aide",
  [
    {
      question: "Je cherche une aide pour inscrire mes enfants au sport",
      answer: "Le Plan 5 000 licences mÃ©rite d'Ãªtre regardÃ©.",
    },
  ],
)
assert.match(followUpSportQuery, /sport/i)
assert.match(followUpSportQuery, /autre aide/i)

const followUpSportRanking = rankAidesForAdvisor(
  rankingAides,
  { nombre_enfants: 2, logement: "locataire" },
  followUpSportQuery,
)
assert.deepEqual(
  followUpSportRanking.slice(0, 2).map(aide => aide.id).sort(),
  ["pass_sport", "plan_5000_licences"],
  "La relance 'une autre aide' doit rester sur le theme sport",
)

const newTopicQuery = buildAidRankingQuery(
  "Je cherche maintenant une aide pour mon loyer",
  [{ question: "Je cherche une aide pour le sport de mes enfants" }],
)
assert.equal(
  newTopicQuery,
  "Je cherche maintenant une aide pour mon loyer",
  "Une nouvelle demande explicite ne doit pas heriter du theme precedent",
)
const trustedOfficialAmount = reviewAssistantAnswer(
  "Le Plan 5 000 licences peut financer jusqu'a 100 \u20ac pour l'inscription sportive.",
  "fr",
  [{ name: "Plan 5 000 licences", amounts: [100] }],
)
assert.match(trustedOfficialAmount.revisedAnswer, /100\s*\u20ac/)
assert.doesNotMatch(
  trustedOfficialAmount.revisedAnswer,
  /montant . v.rifier par simulation officielle/,
)
assert.equal(
  trustedOfficialAmount.issues.some(issue => issue.type === "amount"),
  false,
)

const wrongAidForTrustedAmount = reviewAssistantAnswer(
  "Le Pass'Sport peut financer jusqu'a 100 \u20ac.",
  "fr",
  [{ name: "Plan 5 000 licences", amounts: [100] }],
)
assert.doesNotMatch(wrongAidForTrustedAmount.revisedAnswer, /100\s*\u20ac/)
assert.equal(
  wrongAidForTrustedAmount.issues.some(issue => issue.type === "amount"),
  true,
)

const inventedAmount = reviewAssistantAnswer(
  "Le Plan 5 000 licences peut financer jusqu'a 137 \u20ac.",
  "fr",
  [{ name: "Plan 5 000 licences", amounts: [100] }],
)
assert.doesNotMatch(inventedAmount.revisedAnswer, /137\s*\u20ac/)
assert.equal(
  inventedAmount.issues.some(issue => issue.type === "amount"),
  true,
)
const chainedFollowUpSportQuery = buildAidRankingQuery(
  "il y a pas une autre aide ?",
  [
    { question: "rien d'autres ?", answer: "Je regarde d'autres pistes." },
    { question: "je cherche une aide pour mes enfants pour les inscrire au sport", answer: "Plan 5 000 licences." },
  ],
)
assert.match(chainedFollowUpSportQuery, /sport/i)

const rienDautresQuery = buildAidRankingQuery(
  "rien d'autres ?",
  [
    { question: "je cherche une aide pour mes enfants pour les inscrire au sport", answer: "Plan 5 000 licences." },
  ],
)
assert.match(rienDautresQuery, /sport/i)

const trustedEurAmount = reviewAssistantAnswer(
  "Le Plan 5 000 licences peut financer jusqu'a 100 EUR.",
  "fr",
  [{ name: "Plan 5 000 licences", amounts: [100] }],
)
assert.match(trustedEurAmount.revisedAnswer, /100\s*EUR/i)
assert.equal(trustedEurAmount.issues.some(issue => issue.type === "amount"), false)

const unsafeEurAmount = reviewAssistantAnswer(
  "Aide garde d'enfants reprise emploi : 1000 EUR.",
  "fr",
  [],
)
assert.doesNotMatch(unsafeEurAmount.revisedAnswer, /1000\s*EUR/i)
assert.equal(unsafeEurAmount.issues.some(issue => issue.type === "amount"), true)

const conversationAides = [
  {
    id: 76,
    nom: "Plan 5 000 licences",
    categorie: "sport",
    description_fr: "Aide pour financer une licence et une cotisation dans un club sportif pour un jeune.",
    condition_famille: "Jeune de moins de 21 ans dont les parents bénéficient du RSA.",
    besoin_enfant: true,
    montant_max: 100,
    lien_officiel: "https://www.departement974.fr/aide/aide-plan-5000-licences",
    score_priorite: 85,
  },
  {
    id: 41,
    nom: "Pass'Sport",
    categorie: "sport",
    description_fr: "Aide nationale pour réduire les frais d'inscription dans une structure sportive partenaire.",
    besoin_enfant: false,
    montant_max: null,
    lien_officiel: "https://www.pass.sports.gouv.fr/",
    score_priorite: 90,
  },
  {
    id: 29,
    nom: "Pass'Sport",
    categorie: "sport",
    description_fr: "Doublon de référentiel à dédupliquer par nom.",
    montant_max: null,
    lien_officiel: "https://www.pass.sports.gouv.fr/",
    score_priorite: 90,
  },
  {
    id: "apl",
    nom: "Aide personnalisée au logement",
    categorie: "logement",
    description_fr: "Aide pour payer une partie du loyer.",
    besoin_locataire: true,
    score_priorite: 260,
  },
  {
    id: "fsl",
    nom: "Fonds de solidarité logement",
    categorie: "logement",
    description_fr: "Aide liée au logement et aux impayés de loyer.",
    besoin_locataire: true,
    score_priorite: 150,
  },
  {
    id: "garde_emploi",
    nom: "Aide garde d'enfants reprise emploi",
    categorie: "emploi",
    description_fr: "Aide de garde lors d'une reprise d'emploi.",
    besoin_demandeur_emploi: true,
    score_priorite: 300,
  },
]
const advisorProfile = {
  nombre_enfants: 2,
  logement: "locataire",
  situation_professionnelle: "demandeur d'emploi",
}

function getConversationSelection(question, recentHistory = []) {
  const conversationContext = buildAdvisorConversationContext({
    question,
    recentHistory,
    aides: conversationAides,
  })
  const candidates = selectAidCandidatesForAdvisor(
    conversationAides,
    advisorProfile,
    conversationContext.rankingQuery,
    getAdvisorRankingOptions(conversationContext),
  )
  return { conversationContext, candidates }
}

// TEST A — le sujet demandé domine le profil et les doublons sont supprimés.
const sportTurn1 = getConversationSelection("Je cherche une aide financière pour inscrire mes enfants au sport")
assert.equal(sportTurn1.conversationContext.turnType, ADVISOR_TURN_TYPES.NEW_TOPIC)
assert.deepEqual(
  sportTurn1.candidates.slice(0, 2).map(aide => aide.nom),
  ["Plan 5 000 licences", "Pass'Sport"],
)
assert.equal(sportTurn1.candidates.some(aide => aide.id === "apl"), false)
assert.equal(sportTurn1.candidates.filter(aide => aide.nom === "Pass'Sport").length, 1)

const planHistory = [{
  question: "Je cherche une aide financière pour inscrire mes enfants au sport",
  answer: "Le Plan 5 000 licences est une première piste pertinente.",
  conversationContext: sportTurn1.conversationContext,
  recommendedAidIds: [76],
  recommendedAidNames: ["Plan 5 000 licences"],
}]

// TEST B + D — une alternative conserve le sport et exclut le Plan.
const sportTurn2 = getConversationSelection("Il n'y a pas une autre aide ?", planHistory)
assert.equal(sportTurn2.conversationContext.turnType, ADVISOR_TURN_TYPES.REQUEST_ALTERNATIVE)
assert.deepEqual(sportTurn2.conversationContext.activeTopic.domains, ["sport"])
assert.equal(sportTurn2.candidates[0].nom, "Pass'Sport")
assert.equal(sportTurn2.candidates.some(aide => aide.nom === "Plan 5 000 licences"), false)
const rienDautreTurn = getConversationSelection("Rien d'autres ?", planHistory)
assert.deepEqual(rienDautreTurn.conversationContext.activeTopic.domains, ["sport"])

// TEST C — une troisième relance n'invente pas une aide hors sujet.
const passSportHistory = [{
  question: "Il n'y a pas une autre aide ?",
  answer: "Une autre piste est Pass'Sport.",
  conversationContext: sportTurn2.conversationContext,
  recommendedAidIds: [41],
  recommendedAidNames: ["Pass'Sport"],
}, ...planHistory]
const sportTurn3 = getConversationSelection("Encore une autre ?", passSportHistory)
assert.equal(sportTurn3.conversationContext.turnType, ADVISOR_TURN_TYPES.REQUEST_ALTERNATIVE)
assert.equal(sportTurn3.candidates.length, 0)

// TEST E — un nouveau domaine abandonne le contexte sport.
const logementAfterSport = getConversationSelection(
  "Je cherche maintenant une aide pour mon loyer",
  passSportHistory,
)
assert.equal(logementAfterSport.conversationContext.turnType, ADVISOR_TURN_TYPES.NEW_TOPIC)
assert.deepEqual(logementAfterSport.conversationContext.activeTopic.domains, ["logement"])
assert.equal(logementAfterSport.candidates[0].id, "apl")
assert.equal(logementAfterSport.conversationContext.previouslyRecommendedAidNames.length, 0)

const trustedPlanFacts = buildTrustedAidFacts([conversationAides[0]])
assert.equal(trustedPlanFacts[0].amountMax, 100)
assert.deepEqual(trustedPlanFacts[0].amounts, [100])
const amountTruthReport = evaluateTruth(
  advisorProfile,
  {},
  null,
  "Combien ?",
  "",
  trustedPlanFacts,
)
const amountTruthPrompt = buildTruthPrompt(amountTruthReport)
assert.match(amountTruthPrompt, /Montant maximum officiel Plan 5 000 licences : 100 EUR/)
assert.match(amountTruthPrompt, /Ne remplace jamais un montant officiel autorisé/)
const trustedDraftReport = evaluateTruth(
  advisorProfile,
  {},
  null,
  "Combien ?",
  "Le Plan 5 000 licences peut prendre en charge jusqu'à 100 €.",
  trustedPlanFacts,
)
assert.equal(trustedDraftReport.inventedAmounts.length, 0)
assert.equal(trustedDraftReport.trustedOfficialAmounts.some(value => /100/.test(value)), true)
const unsupportedDraftReport = evaluateTruth(
  advisorProfile,
  {},
  null,
  "Combien ?",
  "Le Plan 5 000 licences peut prendre en charge jusqu'à 137 €.",
  trustedPlanFacts,
)
assert.equal(unsupportedDraftReport.inventedAmounts.some(value => /137/.test(value)), true)

// TEST F, G et H — le même fait fiable alimente le Truth Engine et le reviewer.
const officialAmountReviewed = reviewAssistantAnswer(
  "Le Plan 5 000 licences peut prendre en charge jusqu'à 100 € de la licence.",
  "fr",
  toTrustedAmountClaims(trustedPlanFacts),
)
assert.match(officialAmountReviewed.revisedAnswer, /100\s*€/)
assert.equal(officialAmountReviewed.issues.some(issue => issue.type === "amount"), false)
const invented137Reviewed = reviewAssistantAnswer(
  "Le Plan 5 000 licences peut prendre en charge jusqu'à 137 €.",
  "fr",
  toTrustedAmountClaims(trustedPlanFacts),
)
assert.doesNotMatch(invented137Reviewed.revisedAnswer, /137\s*€/)
const invented1000Reviewed = reviewAssistantAnswer("Une autre aide verse 1000 EUR.", "fr", [])
assert.doesNotMatch(invented1000Reviewed.revisedAnswer, /1000\s*EUR/i)

// TEST I — « combien ? » cible la dernière aide réellement proposée.
const amountTurn = getConversationSelection("Combien ?", planHistory)
assert.equal(amountTurn.conversationContext.turnType, ADVISOR_TURN_TYPES.ASK_DETAILS)
assert.deepEqual(amountTurn.conversationContext.targetAidNames, ["Plan 5 000 licences"])
assert.equal(amountTurn.candidates[0].nom, "Plan 5 000 licences")
const followUpTurn = getConversationSelection("Et pour une licence en club ?", planHistory)
assert.equal(followUpTurn.conversationContext.turnType, ADVISOR_TURN_TYPES.FOLLOW_UP)
const nextStepTurn = getConversationSelection("Et ensuite ?", planHistory)
assert.equal(nextStepTurn.conversationContext.turnType, ADVISOR_TURN_TYPES.NEXT_STEP)
assert.deepEqual(nextStepTurn.conversationContext.targetAidNames, ["Plan 5 000 licences"])
const correctionTurn = getConversationSelection("En fait, je voulais dire une aide pour l'énergie", planHistory)
assert.equal(correctionTurn.conversationContext.turnType, ADVISOR_TURN_TYPES.CORRECTION)
assert.deepEqual(correctionTurn.conversationContext.activeTopic.domains, ["energie"])

// TEST J — le même mécanisme fonctionne sur le logement.
const logementTurn1 = getConversationSelection("Je cherche une aide pour payer mon loyer")
const logementHistory = [{
  question: "Je cherche une aide pour payer mon loyer",
  answer: "L'Aide personnalisée au logement est la première piste.",
  conversationContext: logementTurn1.conversationContext,
  recommendedAidIds: ["apl"],
  recommendedAidNames: ["Aide personnalisée au logement"],
}]
const logementTurn2 = getConversationSelection("Une autre aide ?", logementHistory)
assert.equal(logementTurn2.candidates[0].id, "fsl")
assert.equal(logementTurn2.candidates.some(aide => aide.id === "apl"), false)
assert.equal(logementTurn2.candidates.some(aide => aide.id === "garde_emploi"), false)

// TEST K — le bruit secondaire du référentiel ne vaut pas un thème principal.
const noisySportAides = [
  {
    id: 62,
    nom: "Aide vacances enfants",
    categorie: "famille",
    description_fr: "Aide pour les vacances et des activités sportives des enfants.",
    demarches_fr: "Vérifier les dispositifs sport/culture.",
    besoin_enfant: true,
    besoin_allocataire_caf: true,
    score_priorite: 88,
  },
  conversationAides[0],
  conversationAides[1],
]
const noisySportRanking = rankAidesForAdvisor(
  noisySportAides,
  { nombre_enfants: 2, allocataire_caf: true },
  "Je cherche une aide financière pour inscrire mes enfants au sport",
)
const noisyVacationIndex = noisySportRanking.findIndex(aide => aide.id === 62)
assert.equal(noisyVacationIndex > noisySportRanking.findIndex(aide => aide.id === 76), true)
assert.equal(noisyVacationIndex > noisySportRanking.findIndex(aide => aide.id === 41), true)

const realPlan5000Row = {
  id: 76,
  nom: "Plan 5 000 licences",
  nom_kreol: "Plan 5 000 licences",
  categorie: "sport",
  description: "Aide du Département de La Réunion pour les jeunes de moins de 21 ans dont les parents sont bénéficiaires du RSA. Elle peut financer jusqu'à 100 € du coût de l'inscription en club, licence et cotisation comprises.",
  description_fr: "Aide du Département de La Réunion pour les jeunes de moins de 21 ans dont les parents sont bénéficiaires du RSA. Elle peut financer jusqu'à 100 € du coût de l'inscription en club, licence et cotisation comprises.",
  description_kreol: "Aide Département La Rényon pou bann jeunes moins de 21 an.",
  demarches_fr: "Déposer le formulaire et les pièces auprès du club.",
  demarches_kreol: "Donne formulaire ek papye au club.",
  condition_logement: null,
  condition_profession: null,
  condition_famille: "Jeune de moins de 21 ans dont les parents sont bénéficiaires du RSA.",
  montant_min: null,
  montant_max: 100,
  lien: "https://www.departement974.fr/aide/aide-plan-5000-licences",
  lien_officiel: "https://www.departement974.fr/aide/aide-plan-5000-licences",
}

function fakeAidRepository(rows = []) {
  return {
    from(table) {
      assert.equal(table, "aides_reunion")
      return {
        select(columns) {
          assert.match(columns, /montant_max/)
          assert.match(columns, /lien_officiel/)
          return {
            async in(field, values) {
              const requested = new Set(values.map(String))
              return {
                data: rows.filter(row => requested.has(String(row[field]))),
                error: null,
              }
            },
          }
        },
      }
    },
  }
}

// TEST L — ligne réelle -> contexte frontend -> faits Edge -> Truth -> reviewer.
const preparedRealPlan = prepareAdvisorAideContext([realPlan5000Row], false)
const trustedFactsEndToEnd = await loadTrustedAidFacts(
  fakeAidRepository([realPlan5000Row]),
  { recommendedAides: preparedRealPlan },
)
const trustedClaimsEndToEnd = toTrustedAmountClaims(trustedFactsEndToEnd)
const truthBeforeDraft = evaluateTruth(
  advisorProfile,
  {},
  null,
  "Quel montant pour cette aide ?",
  "",
  trustedFactsEndToEnd,
)
const truthPromptEndToEnd = buildTruthPrompt(truthBeforeDraft)
const realisticOpenAiDraft = [
  "### Plan 5 000 licences",
  "",
  "Cette aide peut prendre en charge une partie de l'inscription.",
  "",
  "- Montant : jusqu'à 100 €",
  "- Public : jeunes de moins de 21 ans dont les parents sont bénéficiaires du RSA.",
].join("\n")
const truthAfterDraft = evaluateTruth(
  advisorProfile,
  {},
  null,
  "Quel montant pour cette aide ?",
  realisticOpenAiDraft,
  trustedFactsEndToEnd,
)
const reviewedEndToEnd = reviewAssistantAnswer(
  realisticOpenAiDraft,
  "fr",
  trustedClaimsEndToEnd,
)
assert.equal(preparedRealPlan[0].id, 76)
assert.equal(preparedRealPlan[0].montant_min, null)
assert.equal(preparedRealPlan[0].montant_max, 100)
assert.equal(preparedRealPlan[0].lien, realPlan5000Row.lien)
assert.equal(preparedRealPlan[0].lien_officiel, realPlan5000Row.lien_officiel)
assert.equal(trustedFactsEndToEnd[0].amountMax, 100)
assert.deepEqual(trustedClaimsEndToEnd, [{ name: "Plan 5 000 licences", amounts: [100] }])
assert.match(truthPromptEndToEnd, /Montant maximum officiel Plan 5 000 licences : 100 EUR/)
assert.equal(truthAfterDraft.inventedAmounts.length, 0)
assert.equal(truthAfterDraft.trustedOfficialAmounts.some(value => /100/.test(value)), true)
assert.match(reviewedEndToEnd.revisedAnswer, /100\s*€/)
assert.doesNotMatch(reviewedEndToEnd.revisedAnswer, /montant à vérifier par simulation officielle/i)
assert.doesNotMatch(reviewedEndToEnd.revisedAnswer, /Je ne peux pas donner un montant fiable/i)
assert.equal(reviewedEndToEnd.issues.some(issue => issue.type === "amount"), false)

for (const officialAmountLabel of ["100 €", "100 euros", "100 EUR"]) {
  const formattedDraft = [
    "### Plan 5 000 licences",
    "",
    "Cette aide peut prendre en charge une partie de l'inscription.",
    "",
    `- Montant : jusqu'à ${officialAmountLabel}`,
    "- Public : jeunes de moins de 21 ans.",
  ].join("\n")
  const formattedTruth = evaluateTruth(
    advisorProfile,
    {},
    null,
    "Quel montant pour cette aide ?",
    formattedDraft,
    trustedFactsEndToEnd,
  )
  const formattedReview = reviewAssistantAnswer(formattedDraft, "fr", trustedClaimsEndToEnd)

  assert.equal(formattedTruth.inventedAmounts.length, 0, `${officialAmountLabel} doit être officiel`)
  assert.equal(formattedReview.issues.filter(issue => issue.type === "amount").length, 0)
  assert.match(formattedReview.revisedAnswer, new RegExp(officialAmountLabel.replace("€", "\\s*€"), "i"))
  assert.doesNotMatch(formattedReview.revisedAnswer, /Je ne peux pas donner un montant fiable/i)
}

// TEST M — un montant absent du référentiel reste bloqué de bout en bout.
const unsupportedOpenAiDraft = "### Plan 5 000 licences\n\n- Jusqu'à 137 € peuvent couvrir la licence."
const unsupportedTruthEndToEnd = evaluateTruth(
  advisorProfile,
  {},
  null,
  "Quel montant pour cette aide ?",
  unsupportedOpenAiDraft,
  trustedFactsEndToEnd,
)
const unsupportedReviewEndToEnd = reviewAssistantAnswer(
  unsupportedOpenAiDraft,
  "fr",
  trustedClaimsEndToEnd,
)
assert.equal(unsupportedTruthEndToEnd.inventedAmounts.some(value => /137/.test(value)), true)
assert.doesNotMatch(unsupportedReviewEndToEnd.revisedAnswer, /137\s*€/)
assert.equal(unsupportedReviewEndToEnd.issues.some(issue => issue.type === "amount"), true)

console.log("TRACE TEST L trusted amount pipeline", JSON.stringify({
  databaseRow: {
    id: realPlan5000Row.id,
    nom: realPlan5000Row.nom,
    montant_min: realPlan5000Row.montant_min,
    montant_max: realPlan5000Row.montant_max,
    lien: realPlan5000Row.lien,
    lien_officiel: realPlan5000Row.lien_officiel,
  },
  preparedAide: preparedRealPlan[0],
  trustedAidFacts: trustedFactsEndToEnd,
  truthEngineAmounts: {
    trusted: truthAfterDraft.trustedOfficialAmounts,
    invented: truthAfterDraft.inventedAmounts,
  },
  reviewerTrustedAmounts: trustedClaimsEndToEnd,
  reviewerIssues: reviewedEndToEnd.issues,
  finalAnswer: reviewedEndToEnd.revisedAnswer,
}, null, 2))
const backend = await read("supabase/functions/assistant-aisupabase/index.ts")
const rankingSource = await read("src/services/aidesRanking.js")
const policy = await read("supabase/functions/assistant-aisupabase/accessPolicy.ts")
const advisorPage = await read("src/components/conseiller/ConseillerPage.jsx")
const aidesPage = await read("src/components/aides/AidesPage.jsx")
const app = await read("src/App.jsx")
const sidebar = await read("src/components/sidebar/Sidebar.jsx")

assert.match(policy, /free:\s*0/)
assert.match(policy, /premium:\s*50/)
assert.match(policy, /premium_plus:\s*250/)
assert.match(backend, /auth\.getUser\(token\)/)
assert.match(backend, /from\("user_subscriptions"\)/)
assert.match(backend, /if \(!access\.canUseAdvisor\)/)
assert.match(backend, /isAdvancedAdvisorMode\(mode\)/)
assert.doesNotMatch(backend, /function getAiPlan/)
assert.doesNotMatch(backend, /limit:\s*context\./)
assert.doesNotMatch(backend, /remaining:\s*Math\.max/)
assert.doesNotMatch(backend, /safetyLimit\s*:/, "L'API ne doit jamais exposer safetyLimit")
assert.doesNotMatch(backend, /advisor_safety_limit_reached/, "Premium+ ne doit plus produire d'erreur de quota à 250")
assert.doesNotMatch(backend, /\b(?:50|250)\b/, "Les seuils internes ne doivent pas apparaître dans les réponses de l'API")
assert.doesNotMatch(backend, /function detectAssistantLanguage|function looksLikeKreolText/)
assert.match(backend, /message:\s*lastUserMessage[\s\S]{0,120}interfaceLanguage/)
assert.doesNotMatch(rankingSource, /SPORT_QUERY_TERMS|SPORT_AIDE_TERMS/)
assert.match(backend, /conversationContext/)
assert.equal(
  backend.indexOf("await loadTrustedAidFacts") < backend.indexOf("const openAiResult = await callOpenAi"),
  true,
  "Les faits officiels doivent être chargés avant la génération OpenAI",
)

assert.match(advisorPage, /if \(!access\.canUseAdvisor\)/)
assert.match(advisorPage, /LockedAdvisor/)
assert.match(advisorPage, /Utilisation limitée/)
assert.match(advisorPage, /Utilisation illimitée/)
assert.match(aidesPage, /role="tablist"/)
assert.match(aidesPage, /Pour moi/)
assert.match(aidesPage, /Rechercher/)
assert.match(aidesPage, /Mes démarches/)
assert.match(aidesPage, /handoffToAdvisor/)
assert.match(aidesPage, /STATUS_ACTIONS/)
assert.doesNotMatch(sidebar, /id:\s*"demarches"/)
assert.doesNotMatch(app, /import DemarchesPage/)

const sourceFiles = (await listFiles(path.join(root, "src"))).filter(file => /\.(js|jsx|ts|tsx)$/.test(file))
const activeImports = []
for (const file of sourceFiles) {
  if (file.endsWith(path.join("aides", "AssistantAides.jsx"))) continue
  const source = await readFile(file, "utf8")
  if (/import[\s\S]{0,180}AssistantAides|from\s+["'][^"']*AssistantAides/.test(source)) activeImports.push(path.relative(root, file))
  assert.doesNotMatch(source, /(?:50|250)\s+(?:échanges|echanges)/i, `Limite publique trouvée dans ${path.relative(root, file)}`)
}
assert.deepEqual(activeImports, [], "AssistantAides ne doit plus constituer un parcours actif")

console.log("✓ Droits Gratuit / Premium / Premium+ vérifiés")
console.log("✓ Modes standard et avancés vérifiés")
console.log("✓ Autorité serveur et absence de limites publiques vérifiées")
console.log("✓ Recherche FR / kréol vérifiée")
console.log("✓ Onglets Aides et handoff vers l’unique Conseiller vérifiés")
console.log("OK trusted official aid amounts verified")
console.log("✓ Conversations NEW_TOPIC / FOLLOW_UP / ALTERNATIVE / DETAILS / NEXT_STEP / CORRECTION vérifiées")
console.log("✓ Alternatives sport et logement sans répétition ni hors-sujet vérifiées")
console.log("✓ Tests K–M : bruit sémantique et montants fiables end-to-end vérifiés")
console.log("✓ Sélection de langue FR / kréol par message et mémoire multilingue vérifiées")
