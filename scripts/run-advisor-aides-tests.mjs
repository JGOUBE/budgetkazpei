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

const backend = await read("supabase/functions/assistant-aisupabase/index.ts")
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
console.log("✓ Sélection de langue FR / kréol par message et mémoire multilingue vérifiées")
