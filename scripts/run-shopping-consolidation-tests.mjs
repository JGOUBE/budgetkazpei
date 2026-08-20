import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import {
  buildComparableProductIdentity,
  buildReliableSavingsSuggestions,
  buildSavingsInsights,
  evaluateSavingsProductEligibility,
  isGenericDepartmentLabel,
} from "../src/services/savings/savingsEngine.ts"
import { resolveAppSectionTarget } from "../src/services/appSectionNavigation.js"
import { getAdvisorAccess } from "../src/config/advisorAccess.js"
import { getAdvisorAccess as getServerAdvisorAccess } from "../supabase/functions/assistant-aisupabase/accessPolicy.ts"

const rootUrl = new URL("../", import.meta.url)
const read = path => readFile(new URL(path, rootUrl), "utf8")

function product(overrides = {}) {
  return {
    id: overrides.id || Math.random().toString(36).slice(2),
    product_name: "Riz basmati Péi 1 kg",
    canonical_name: "Riz basmati Péi",
    product_key: "riz-basmati-pei",
    store: "Leclerc",
    price: 4,
    price_per_unit: 4,
    quantity: 1,
    unit: "kg",
    confidence_score: 96,
    eligible_for_courses: true,
    line_type: "product",
    item_type: "standard",
    needs_review: false,
    created_at: "2026-08-18T12:00:00.000Z",
    ...overrides,
  }
}

// A à F : les lignes non-produits, non fiables ou trop génériques ne créent
// jamais d'identité comparable.
assert.equal(isGenericDepartmentLabel("BOUCHERIE COUPE"), true)
assert.equal(evaluateSavingsProductEligibility(product({ product_name: "BOUCHERIE COUPE", canonical_name: "", product_key: "" })).eligible, false)
assert.equal(buildComparableProductIdentity(product({ product_name: "BOUCHERIE COUPE", canonical_name: "", product_key: "" })), null)
assert.equal(evaluateSavingsProductEligibility(product({ product_name: "HYGIENE", item_type: "section" })).eligible, false)
assert.equal(evaluateSavingsProductEligibility(product({ product_name: "SOUS TOTAL 24,80", item_type: "subtotal" })).eligible, false)
assert.equal(evaluateSavingsProductEligibility(product({ product_name: "REMISE", item_type: "discount" })).eligible, false)
assert.equal(evaluateSavingsProductEligibility(product({ eligible_for_courses: false })).eligible, false)
assert.equal(buildReliableSavingsSuggestions([
  product({ id: "generic-1", product_name: "Lait 1 L", canonical_name: "", product_key: "", normalized_name: "lait", store: "Leclerc", price: 1.9 }),
  product({ id: "generic-2", product_name: "Lait demi-écrémé 1 L", canonical_name: "", product_key: "", normalized_name: "lait demi ecreme", store: "Leader Price", price: 1.4 }),
]).length, 0)

// G, H et K : même identité fiable, deux magasins et calcul exact.
const exactComparison = buildReliableSavingsSuggestions([
  product({ id: "older", store: "Leader Price", price: 3.1, price_per_unit: 3.1, created_at: "2026-08-10T12:00:00.000Z" }),
  product({ id: "latest", store: "Leclerc", price: 4.2, price_per_unit: 4.2, created_at: "2026-08-18T12:00:00.000Z" }),
])
assert.equal(exactComparison.length, 1)
assert.equal(exactComparison[0].bestStore, "Leader Price")
assert.equal(exactComparison[0].referenceStore, "Leclerc")
assert.equal(exactComparison[0].potentialSaving, 1.1)
assert.equal(exactComparison[0].comparedStoresCount, 2)

// I : formats différents mais prix au kg fiables.
const normalizedComparison = buildReliableSavingsSuggestions([
  product({ id: "kg", product_name: "Riz basmati Péi 1 kg", store: "Leclerc", price: 4, price_per_unit: 4, created_at: "2026-08-18T12:00:00.000Z" }),
  product({ id: "500g", product_name: "Riz basmati Péi 500 g", store: "Leader Price", price: 1.5, price_per_unit: 3, quantity: 500, unit: "g", created_at: "2026-08-12T12:00:00.000Z" }),
])
assert.equal(normalizedComparison.length, 1)
assert.equal(normalizedComparison[0].normalizedComparison, true)
assert.equal(normalizedComparison[0].unitLabel, "€/kg")
assert.equal(normalizedComparison[0].potentialSaving, 1)

// J : formats différents sans normalisation exploitable.
assert.equal(buildReliableSavingsSuggestions([
  product({ id: "kg-no-unit", product_name: "Riz basmati Péi 1 kg", store: "Leclerc", price: 4, price_per_unit: null, created_at: "2026-08-18T12:00:00.000Z" }),
  product({ id: "500g-no-unit", product_name: "Riz basmati Péi 500 g", store: "Leader Price", price: 1.5, price_per_unit: null, created_at: "2026-08-12T12:00:00.000Z" }),
]).length, 0)

// Un même magasin, un doublon OCR ou une identité incertaine ne suffit pas.
assert.equal(buildReliableSavingsSuggestions([
  product({ id: "same-1", store: "Leclerc", price: 4.2 }),
  product({ id: "same-2", store: "E.Leclerc", price: 3.1, created_at: "2026-08-10T12:00:00.000Z" }),
]).length, 0)

// L et M : sortie explicitement historique et état sans donnée fiable.
assert.equal(exactComparison[0].wording, "historical_observation")
const empty = buildSavingsInsights({ shoppingItems: [product({ product_name: "BOUCHERIE COUPE", canonical_name: "", product_key: "" })] })
assert.equal(empty.hasReliableComparison, false)
assert.equal(empty.totalPotential, 0)
assert.deepEqual(empty.suggestions, [])

// Compatibilité des anciens identifiants.
assert.deepEqual(resolveAppSectionTarget("shoppingList"), {
  requested: "shoppingList", section: "shopping", shoppingTab: "list", legacy: true,
})
assert.equal(resolveAppSectionTarget("savings").shoppingTab, "savings")
assert.equal(resolveAppSectionTarget("financeAssistant").section, "conseiller")
assert.equal(resolveAppSectionTarget("financeAssistant").advisorMode, "budget_depenses")

// Accès financier : Premium et Premium+, jamais Gratuit, avec une seule
// politique de Conseiller côté interface et côté serveur.
assert.equal(getAdvisorAccess("free").canUseAdvisor, false)
assert.equal(getAdvisorAccess("premium").allowedModes.includes("budget_depenses"), true)
assert.equal(getAdvisorAccess("premium_plus").allowedModes.includes("budget_depenses"), true)
assert.equal(getServerAdvisorAccess("free").canUseAdvisor, false)
assert.equal(getServerAdvisorAccess("premium").canUseAdvisor, true)
assert.equal(getServerAdvisorAccess("premium_plus").canUseAdvisor, true)

const [app, sidebar, hub, savingsPage, advisor, backend] = await Promise.all([
  read("src/App.jsx"),
  read("src/components/sidebar/Sidebar.jsx"),
  read("src/features/shopping/pages/ShoppingHubPage.jsx"),
  read("src/pages/SavingsPage.jsx"),
  read("src/components/conseiller/AssistantConseiller.jsx"),
  read("supabase/functions/assistant-aisupabase/index.ts"),
])

assert.equal(sidebar.includes('id: "financeAssistant"'), false)
assert.equal(sidebar.includes('id: "shoppingList"'), false)
assert.equal(sidebar.includes('id: "savings"'), false)
assert.equal((sidebar.match(/id: "conseiller"/g) || []).length, 1)
assert.equal((sidebar.match(/id: "shopping"/g) || []).length, 1)
assert.match(hub, /Aperçu/)
assert.match(hub, /Ma liste de courses/)
assert.match(hub, /Mes économies/)
assert.match(hub, /role="tablist"/)
assert.match(hub, /ShoppingListPage/)
assert.match(hub, /ShoppingInsightsPage/)
assert.match(savingsPage, /Prix plus bas observé/)
assert.match(savingsPage, /peuvent pas être chargées|ne peuvent pas être chargées/)
assert.match(savingsPage, /Pas encore assez de données comparables/)
assert.equal(app.includes("<FinanceAssistantPage"), false)
assert.equal(app.includes('activeNav === "financeAssistant"'), false)
assert.equal(app.includes('activeNav === "shoppingList"'), false)
assert.equal(app.includes('activeNav === "savings"'), false)
assert.equal((app.match(/<ConseillerPage/g) || []).length, 1)
assert.equal((advisor.match(/assistant_conversations/g) || []).length, 0)
assert.equal((backend.match(/from\("ai_usage"\)/g) || []).length >= 1, true)
assert.equal((backend.match(/from\("assistant_memory"\)/g) || []).length, 1)

console.log("Mes courses / Économies / Conseiller consolidation tests passed")
