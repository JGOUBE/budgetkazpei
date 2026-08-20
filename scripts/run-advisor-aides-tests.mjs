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
  getAdvisorAccess as getServerAdvisorAccess,
  isAdvancedAdvisorMode,
  resolveServerPlan,
} from "../supabase/functions/assistant-aisupabase/accessPolicy.ts"

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
