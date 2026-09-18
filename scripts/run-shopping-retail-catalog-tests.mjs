import assert from "node:assert/strict"

import {
  deduplicateRetailObservedPrices,
  toRetailObservedPriceViewModel,
} from "../src/services/retail/retailObservedPriceService.js"
import {
  buildShoppingListItemFromSuggestion,
  estimateShoppingList,
  getShoppingAutocompleteSuggestions,
} from "../src/services/shoppingList/shoppingListEngine.ts"
import {
  enrichShoppingBasketWithPromotions,
} from "../src/services/shoppingList/shoppingPromotionEnrichment.js"

function observed(overrides = {}) {
  return {
    id: "obs-bin",
    productId: "shopping-bin",
    marketProductId: "market-bin",
    productName: "Poubelle 55 L",
    normalizedProductName: "poubelle 55 l",
    brand: "Maison",
    packageFormat: "55 L",
    quantityValue: 55,
    quantityUnit: "l",
    packCount: 1,
    retailerSlug: "leader-price-reunion",
    retailerName: "Leader Price Réunion",
    storeName: "Leader Price Ermitage",
    storeCity: "Saint-Paul",
    price: 12.9,
    observedAt: "2026-09-18T05:00:00.000Z",
    lastSeenAt: "2026-09-18T05:00:00.000Z",
    isFresh: true,
    ...overrides,
  }
}

const normalized = toRetailObservedPriceViewModel({
  market_product_id: "market-choco",
  product_id: "shopping-choco",
  product_name: "Tablette chocolat Nestlé 170 g",
  normalized_product_name: "tablette chocolat nestle 170 g",
  brand: "Nestlé",
  package_format: "170 g",
  quantity_value: "170",
  quantity_unit: "g",
  price: "2.49",
  retailer_name: "E.Leclerc Réunion",
  store_name: "E.Leclerc Portail",
  observed_at: "2026-09-18T04:00:00Z",
  last_seen_at: "2026-09-18T04:00:00Z",
  is_fresh: true,
})
assert.equal(normalized.price, 2.49)
assert.equal(normalized.marketProductId, "market-choco")
assert.equal(normalized.isFresh, true)

const deduped = deduplicateRetailObservedPrices([
  observed({ id: "old", price: 13.5, observedAt: "2026-09-17T05:00:00Z", lastSeenAt: "2026-09-17T05:00:00Z" }),
  observed({ id: "new", price: 12.9 }),
])
assert.equal(deduped.length, 1)
assert.equal(deduped[0].id, "new")

const suggestions = getShoppingAutocompleteSuggestions(
  "poubelle",
  [],
  [],
  [observed()],
)
assert.equal(suggestions.historical.length, 0)
assert.equal(suggestions.observed.length, 1)
assert.equal(suggestions.observed[0].label, "Poubelle 55 L")
assert.equal(suggestions.observed[0].observedPrice, 12.9)

const searchByFormat = getShoppingAutocompleteSuggestions(
  "55 l",
  [],
  [],
  [observed()],
)
assert.equal(searchByFormat.observed.length, 1)
assert.equal(searchByFormat.observed[0].label, "Poubelle 55 L")

const chocolateObserved = observed({
  id: "obs-choco",
  productId: "shopping-choco",
  marketProductId: "market-choco",
  productName: "Tablette de chocolat",
  normalizedProductName: "tablette de chocolat",
  brand: "NESTLÉ",
  packageFormat: "170 gr",
  quantityValue: 170,
  quantityUnit: "g",
  retailerSlug: "carrefour-market-reunion",
  retailerName: "Carrefour Market Réunion",
  storeName: "Carrefour Market Réunion",
  price: 3.85,
})

for (const query of ["tablette", "chocolat", "nestlé", "nestle", "170", "170 gr"]) {
  const result = getShoppingAutocompleteSuggestions(query, [], [], [chocolateObserved])
  assert.equal(result.observed.length, 1, `Retail observed search should match "${query}"`)
  assert.equal(result.observed[0].label, "Tablette de chocolat")
}

const selected = buildShoppingListItemFromSuggestion(suggestions.observed[0])
assert.equal(selected.market_product_id, "market-bin")
assert.equal(selected.shopping_product_id, "shopping-bin")
assert.equal(selected.retail_observed_price, 12.9)

const estimateFromRetail = estimateShoppingList(
  [{ id: "line-bin", ...selected }],
  [],
  [observed()],
)
assert.equal(estimateFromRetail.total, 12.9)
assert.equal(estimateFromRetail.items[0].historicalPrice, null)
assert.equal(estimateFromRetail.items[0].priceSource, "retail_observed")
assert.equal(estimateFromRetail.items[0].retailObservedPrice, 12.9)

const historicalWins = estimateShoppingList(
  [{ id: "line-bin", ...selected }],
  [{
    id: "ticket-bin",
    product_name: "Poubelle 55 L",
    normalized_name: "poubelle 55 l",
    price: 11.5,
    created_at: "2026-09-18T07:00:00Z",
    market_product_id: "market-bin",
    shopping_product_id: "shopping-bin",
  }],
  [observed({ price: 12.9 })],
)
assert.equal(historicalWins.total, 11.5)
assert.equal(historicalWins.items[0].historicalPrice, 11.5)
assert.equal(historicalWins.items[0].priceSource, "known")

const staleStillSearchable = getShoppingAutocompleteSuggestions(
  "poubelle",
  [],
  [],
  [observed({ id: "stale", isFresh: false, price: 10.9 })],
)
assert.equal(staleStillSearchable.observed.length, 1)

const staleSelected = buildShoppingListItemFromSuggestion(staleStillSearchable.observed[0])
const staleNotEstimated = estimateShoppingList(
  [{ id: "stale-line", ...staleSelected }],
  [],
  [observed({ id: "stale", isFresh: false, price: 10.9 })],
)
assert.equal(staleNotEstimated.total, 0)
assert.equal(staleNotEstimated.items[0].priceSource, "missing")

const promotion = {
  id: "promo-bin",
  productId: "shopping-bin",
  marketProductId: "market-bin",
  productName: "Poubelle 55 L",
  brand: "Maison",
  packageFormat: "55 L",
  quantityValue: 55,
  quantityUnit: "l",
  packCount: 1,
  promoPrice: 9.9,
  originalPrice: 12.9,
  promotionProven: true,
  isActive: true,
  retailerName: "Leader Price Réunion",
}

const promoEstimate = enrichShoppingBasketWithPromotions({
  estimate: estimateFromRetail,
  promotions: [promotion],
})
assert.equal(promoEstimate.total, 9.9)
assert.equal(promoEstimate.items[0].estimatedPriceSource, "promotion")
assert.equal(promoEstimate.items[0].historicalPrice, null)
assert.equal(promoEstimate.reliableSavingsTotal, 0)

const unknown = estimateShoppingList([{ id: "unknown", name: "Produit inconnu" }], [], [observed()])
assert.equal(unknown.total, 0)
assert.equal(unknown.items[0].priceSource, "missing")

console.log("[OK] Retail observed-price projection model")
console.log("[OK] Poubelle 55 L appears in retail autocomplete")
console.log("[OK] Selected retail product keeps structured identity")
console.log("[OK] Fresh retail observed price estimates a line without inventing personal history")
console.log("[OK] Personal ticket history keeps priority")
console.log("[OK] Stale retail price stays searchable but is excluded from basket estimate")
console.log("[OK] Reliable promotion can override retail observed price without inventing personal savings")