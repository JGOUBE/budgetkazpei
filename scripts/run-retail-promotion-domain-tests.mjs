import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import {
  RETAIL_OBSERVED_FRESHNESS_HOURS,
  buildRetailPriceNote,
  deduplicateRetailPromotions,
  formatRetailPrice,
  isRetailPromotionEligible,
  loadPublishedGoodDeals,
  sanitizeRetailMarketingText,
  toRetailPromotionViewModel,
} from "../src/services/retail/retailPromotionService.js"
import {
  evaluatePromotionPackageCompatibility,
  findActivePromotionsForShoppingItems,
} from "../src/services/retail/shoppingPromotionMatching.js"
import { buildBudgetAdvisorContext } from "../src/services/ai/budgetAdvisorContext.js"
import {
  createAppSectionTarget,
  resolveAppSectionTarget,
} from "../src/services/appSectionNavigation.js"

const now = new Date("2026-09-04T12:00:00.000Z")

function officialPromotion(overrides = {}) {
  return {
    id: "official-1",
    product_id: "product-1",
    market_product_id: "market-1",
    product_name: "Riz basmati 1 kg",
    retailer_slug: "carrefour-reunion",
    retailer_name: "Carrefour Réunion",
    catalog_id: "catalog-1",
    promo_price: 3.5,
    original_price: 4.2,
    unit_price: 3.5,
    unit_label: "kg",
    starts_at: "2026-09-01T00:00:00.000Z",
    ends_at: "2026-09-08T23:59:59.000Z",
    date_basis: "official",
    promotion_proven: true,
    promotion_evidence: { kind: "catalog" },
    validation_errors: [],
    match_warnings: [],
    is_active: true,
    ...overrides,
  }
}

function observedPromotion(overrides = {}) {
  return {
    id: "observed-1",
    product_id: "product-1",
    market_product_id: "market-1",
    product_name: "Riz basmati 1 kg",
    retailer_slug: "leader-price-reunion",
    retailer_name: "Leader Price Réunion",
    collector_source_slug: "leader-price-reunion-retail",
    source_type: "leader_drive_html",
    promo_price: 3.2,
    original_price: 4.2,
    starts_at: null,
    ends_at: null,
    observed_at: "2026-09-04T06:00:00.000Z",
    fresh_until: "2026-09-05T18:00:00.000Z",
    date_basis: "observed_freshness",
    promotion_proven: true,
    promotion_evidence: { kind: "direct_discount" },
    validation_errors: [],
    match_warnings: [],
    is_active: true,
    ...overrides,
  }
}

// Promotions officielles Carrefour : vraies dates, activité et expiration.
assert.equal(isRetailPromotionEligible(officialPromotion(), now), true)
assert.equal(isRetailPromotionEligible(officialPromotion({ ends_at: "2026-09-03T23:59:59.000Z" }), now), false)
const carrefour = toRetailPromotionViewModel(officialPromotion(), { now })
assert.equal(carrefour.dateBasis, "official")
assert.equal(carrefour.catalogId, "catalog-1")
assert.equal(carrefour.startsAt, "2026-09-01T00:00:00.000Z")
assert.equal(carrefour.endsAt, "2026-09-08T23:59:59.000Z")

// Leader Price : fraîcheur stricte et aucune date commerciale inventée.
assert.equal(RETAIL_OBSERVED_FRESHNESS_HOURS, 36)
assert.equal(isRetailPromotionEligible(observedPromotion(), now), true)
assert.equal(isRetailPromotionEligible(observedPromotion({ fresh_until: "2026-09-04T11:59:59.000Z" }), now), false)
assert.equal(isRetailPromotionEligible(observedPromotion({ promotion_proven: false }), now), false)
assert.equal(isRetailPromotionEligible(observedPromotion({ promotion_evidence: null }), now), false)
assert.equal(isRetailPromotionEligible(observedPromotion({ original_price: 3.2 }), now), false)
assert.equal(isRetailPromotionEligible(observedPromotion({ validation_errors: ["invalid_price"] }), now), false)
assert.equal(isRetailPromotionEligible(observedPromotion({ match_warnings: ["brand_mismatch"] }), now), false)
assert.equal(isRetailPromotionEligible(observedPromotion({ match_warnings: ["package_mismatch"] }), now), false)
assert.equal(isRetailPromotionEligible(observedPromotion({ brand_mismatch: true }), now), false)
assert.equal(isRetailPromotionEligible(observedPromotion({ package_mismatch: true }), now), false)
const leader = toRetailPromotionViewModel(observedPromotion(), { now })
assert.equal(leader.startsAt, null)
assert.equal(leader.endsAt, null)
assert.equal(leader.isFresh, true)

// Formatage et étanchéité des libellés techniques.
assert.equal(formatRetailPrice(0.49), "0,49 €")
assert.equal(formatRetailPrice(1.1), "1,10 €")
assert.equal(formatRetailPrice(17.37, "EUR/kg"), "17,37 €/kg")
assert.equal(formatRetailPrice(3.67, "EUR/l"), "3,67 €/l")
assert.equal(sanitizeRetailMarketingText("Promotion structurée"), "")
assert.equal(sanitizeRetailMarketingText("direct_discount"), "")
assert.equal(sanitizeRetailMarketingText("observed_freshness"), "")
assert.doesNotMatch(buildRetailPriceNote(officialPromotion()), /Prix Promo|EUR/)

// Défense UI contre un doublon observed_freshness.
const deduplicated = deduplicateRetailPromotions([
  toRetailPromotionViewModel(observedPromotion({ id: "older", observed_at: "2026-09-04T05:00:00.000Z" }), { now }),
  toRetailPromotionViewModel(observedPromotion({ id: "newer", observed_at: "2026-09-04T06:00:00.000Z" }), { now }),
])
assert.equal(deduplicated.length, 1)
assert.equal(deduplicated[0].id, "newer")

// Contrat Shopping futur : identité structurée d'abord, jamais texte naïf.
const shoppingItem = {
  id: "shopping-item-1",
  product_id: "product-1",
  product_name: "Riz basmati 1 kg",
  historicalPrice: 4.2,
}
const activePromotion = {
  ...leader,
  productId: "product-1",
  productName: "Riz basmati 1 kg",
  quantityValue: 1,
  quantityUnit: "kg",
  promoPrice: 3.2,
  promotionProven: true,
  isActive: true,
}
const exactMatches = findActivePromotionsForShoppingItems([shoppingItem], [activePromotion])
assert.equal(exactMatches[0].promotions.length, 1)
assert.equal(exactMatches[0].matchedProductId, "product-1")
assert.equal(exactMatches[0].reliableSaving, 1)
assert.equal(findActivePromotionsForShoppingItems(
  [{ ...shoppingItem, product_id: "different-product" }],
  [activePromotion],
)[0].promotions.length, 0)

const incompatiblePromotion = {
  ...activePromotion,
  productName: "Riz liquide 1 l",
  quantityUnit: "l",
}
const incompatibility = evaluatePromotionPackageCompatibility(shoppingItem, incompatiblePromotion)
assert.equal(incompatibility.compatible, false)
assert.equal(incompatibility.needsReview, true)
const rejectedFormat = findActivePromotionsForShoppingItems([shoppingItem], [incompatiblePromotion])[0]
assert.equal(rejectedFormat.promotions.length, 0)
assert.equal(rejectedFormat.needsReview.length, 1)

// Contexte budget futur : valeurs absentes conservées comme absentes.
const budgetContext = buildBudgetAdvisorContext({
  ranges: {
    current: { start: new Date("2026-09-01T00:00:00.000Z"), end: new Date("2026-10-01T00:00:00.000Z") },
  },
  currentMonth: {
    expenses: 900,
    incomes: 1600,
    foodExpenses: 300,
    categories: [{ id: "alimentaire", amount: 300, budget: 350 }],
  },
  previousMonth: { expenses: 800 },
  budgetInputs: { income: 1600, fixedExpenses: 600, variableExpenses: 300, availableBalance: 700 },
  dataUsed: { transactionsCount: 8, previousTransactionsCount: 6 },
  savings: { suggestions: [], totalPotential: 0 },
})
assert.equal(budgetContext.fixedExpenses, 600)
assert.equal(budgetContext.availableBalance, 700)
assert.equal(budgetContext.recurringCharges, null)
assert.equal(budgetContext.dataCompleteness.currentShoppingPromotions, false)

// Navigation : un même contrat porte la section, l'onglet et le contexte.
assert.deepEqual(createAppSectionTarget("shopping", { shoppingTab: "list", context: { source: "promotions" } }), {
  requested: "shopping",
  section: "shopping",
  shoppingTab: "list",
  context: { source: "promotions" },
  legacy: false,
})
assert.equal(resolveAppSectionTarget("promotions").section, "goodDeals")

// Contrat SQL : fraîcheur publique, sérialisation et unicité active.
const migration = readFileSync(join(
  process.cwd(),
  "supabase/migrations/20260904220000_consolidate_retail_promotion_domain.sql",
), "utf8")
assert.match(migration, /retail_observed_freshness_window\(\)/)
assert.match(migration, /interval '36 hours'/)
assert.match(migration, /pg_advisory_xact_lock/)
assert.match(migration, /shopping_promotions_one_active_observed_offer_uk/)
assert.match(migration, /if new\.is_active is true then\s+update public\.shopping_promotions as older/s)
assert.match(migration, /create or replace view public\.published_retail_promotions/)
assert.doesNotMatch(migration, /drop\s+(table|view|function|schema)/i)
assert.match(migration, /promotions\.fresh_until > now\(\)/)
assert.match(migration, /promotions\.starts_at <= now\(\)/)
assert.doesNotMatch(migration, /starts_at\s*:?=\s*now\(\)/i)

function mockClient(results) {
  return {
    from(table) {
      const result = results[table]
      const builder = {
        select() { return builder },
        order() { return builder },
        in() { return builder },
        then(resolve, reject) { return Promise.resolve(result).then(resolve, reject) },
      }
      return builder
    },
  }
}

// Ancien schéma : l'absence de la nouvelle vue est tolérée sans casser la page.
const legacyOnly = await loadPublishedGoodDeals({
  client: mockClient({
    published_good_deals: { data: [{ id: "legacy", title: "Historique", tags: [] }], error: null },
    published_retail_promotions: { data: null, error: { code: "PGRST205" } },
    good_deal_territories: { data: [], error: null },
  }),
})
assert.deepEqual(legacyOnly.map(deal => deal.id), ["legacy"])

// Nouveau schéma : la projection stricte devient l'unique source retail ; une
// ligne product_promo stale du contrat historique ne doit plus ressurgir.
const projected = await loadPublishedGoodDeals({
  client: mockClient({
    published_good_deals: {
      data: [
        { id: "base", title: "Bon plan", tags: [] },
        { id: "stale-retail", title: "Ancienne promo", tags: ["product_promo"] },
        { id: "official-1", title: "Doublon historique", tags: ["product_promo"] },
      ],
      error: null,
    },
    published_retail_promotions: { data: [officialPromotion()], error: null },
    good_deal_territories: { data: [], error: null },
  }),
})
assert.deepEqual(projected.map(deal => deal.id).sort(), ["base", "official-1"])

console.log("Retail promotion domain tests passed.")
