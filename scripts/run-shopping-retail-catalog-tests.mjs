import assert from "node:assert/strict"

import {
  deduplicateRetailObservedPrices,
  toRetailObservedPriceViewModel,
} from "../src/services/retail/retailObservedPriceService.js"
import {
  buildShoppingListItemFromSuggestion,
  estimateShoppingList,
  getShoppingAutocompleteSuggestions,
  getSmartPromotionPriceReference,
  isRetailPromotionUsableForSmartShopping,
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


// Prix ticket vendus au poids : la référence intelligente est le prix au kg,
// recalculé depuis le montant réellement payé et le poids, même si une ancienne
// valeur price_per_unit était erronée.
const grannyHistory = [{
  id: "ticket-granny",
  product_name: "Pomme Granny Smith",
  normalized_name: "pomme granny smith",
  quantity: 0.428,
  unit: "kg",
  price: 1.86,
  price_per_unit: 1.86,
  created_at: "2026-09-19T08:00:00Z",
}]
const grannySuggestions = getShoppingAutocompleteSuggestions("pomme", grannyHistory, [], [])
assert.equal(grannySuggestions.historical.length, 1)
assert.equal(grannySuggestions.historical[0].lastPrice, 4.35)
assert.equal(grannySuggestions.historical[0].priceUnitLabel, "€/kg")
const grannyEstimate = estimateShoppingList([{ id: "apple", name: "Pomme Granny Smith" }], grannyHistory, [])
assert.equal(grannyEstimate.items[0].historicalPrice, 4.35)
assert.equal(grannyEstimate.items[0].priceUnitLabel, "€/kg")

// Un libellé emballé sans grammage/quantité n'est pas une référence de prix.
const genericMimolette = getShoppingAutocompleteSuggestions("mimo", [{
  id: "ticket-mimolette-generic",
  product_name: "MIMOLETTE",
  normalized_name: "mimolette",
  quantity: 1,
  unit: "piece",
  price: 3.24,
  created_at: "2026-09-19T08:00:00Z",
}], [], [])
assert.equal(genericMimolette.historical.length, 0)


const grannyWithoutReliablePrice = getShoppingAutocompleteSuggestions("pomme", [{
  id: "ticket-granny-no-reference-price",
  product_name: "Pomme Granny Smith",
  normalized_name: "pomme granny smith",
  quantity: 1,
  unit: "piece",
  price: 1.86,
  created_at: "2026-09-19T08:00:00Z",
}], [], [])
assert.equal(grannyWithoutReliablePrice.historical.length, 1)
assert.equal(grannyWithoutReliablePrice.historical[0].label, "Pomme Granny Smith")
assert.equal(grannyWithoutReliablePrice.historical[0].lastPrice, 0)

const grannyKgWithoutReliablePrice = getShoppingAutocompleteSuggestions("pomme", [{
  id: "ticket-granny-kg-no-reference-price",
  product_name: "POMME GRANNY AFS KG",
  normalized_name: "pomme granny afs kg",
  quantity: 1,
  unit: "piece",
  price: 1.01,
  created_at: "2026-09-19T08:00:00Z",
}], [], [])
assert.equal(grannyKgWithoutReliablePrice.historical.length, 1)
assert.equal(grannyKgWithoutReliablePrice.historical[0].lastPrice, 0)


const jambonBlancWithoutReliablePrice = getShoppingAutocompleteSuggestions("jambon", [{
  id: "ticket-jambon-blanc-no-reference-price",
  product_name: "Jambon blanc",
  normalized_name: "jambon blanc",
  quantity: 1,
  unit: "piece",
  price: 2.89,
  created_at: "2026-09-19T08:00:00Z",
}], [], [])
assert.equal(jambonBlancWithoutReliablePrice.historical.length, 1)
assert.equal(jambonBlancWithoutReliablePrice.historical[0].lastPrice, 0)

const rizBasmatiWithoutReliablePrice = getShoppingAutocompleteSuggestions("riz", [{
  id: "ticket-riz-basmati-no-reference-price",
  product_name: "Riz basmati",
  normalized_name: "riz basmati",
  quantity: 1,
  unit: "piece",
  price: 3.4,
  created_at: "2026-09-19T08:00:00Z",
}], [], [])
assert.equal(rizBasmatiWithoutReliablePrice.historical.length, 1)
assert.equal(rizBasmatiWithoutReliablePrice.historical[0].lastPrice, 0)

const packagedMimolette = getShoppingAutocompleteSuggestions("mimo", [{
  id: "ticket-mimolette-200",
  product_name: "Mimolette vieille 200 g",
  normalized_name: "mimolette vieille 200 g",
  quantity: 200,
  unit: "g",
  price: 3.84,
  price_per_unit: 19.2,
  created_at: "2026-09-19T08:00:00Z",
}], [], [])
assert.equal(packagedMimolette.historical.length, 1)
assert.equal(packagedMimolette.historical[0].lastPrice, 3.84)
assert.equal(packagedMimolette.historical[0].priceUnitLabel, "")

// Les prix retail/catalogue sans format ni unité exploitable ne sont pas
// proposés comme prix observés.
const ambiguousObserved = getShoppingAutocompleteSuggestions("mimo", [], [], [observed({
  id: "obs-mimolette",
  productId: "shopping-mimolette",
  marketProductId: "market-mimolette",
  productName: "Mimolette",
  normalizedProductName: "mimolette",
  packageFormat: "",
  quantityValue: null,
  quantityUnit: null,
  price: 3.24,
})])
assert.equal(ambiguousObserved.observed.length, 0)

const ambiguousPromotion = {
  id: "promo-mimolette",
  productId: "shopping-mimolette",
  marketProductId: "market-mimolette",
  productName: "Mimolette",
  promoPrice: 2.99,
  originalPrice: 3.49,
  promotionProven: true,
  isActive: true,
}
assert.equal(getSmartPromotionPriceReference(ambiguousPromotion), null)
assert.equal(isRetailPromotionUsableForSmartShopping(ambiguousPromotion), false)

const packagedPromotion = {
  ...ambiguousPromotion,
  productName: "Mimolette vieille 200 g",
  packageFormat: "200 g",
}
assert.deepEqual(getSmartPromotionPriceReference(packagedPromotion), {
  value: 2.99,
  unitLabel: "",
  kind: "package",
})
assert.equal(isRetailPromotionUsableForSmartShopping(packagedPromotion), true)


const structuredPackPromotion = {
  ...ambiguousPromotion,
  quantityValue: 200,
  quantityUnit: "g",
}
const structuredPackSuggestions = getShoppingAutocompleteSuggestions(
  "mimo",
  [],
  [structuredPackPromotion],
  [],
)
assert.equal(isRetailPromotionUsableForSmartShopping(structuredPackPromotion), true)
assert.equal(structuredPackSuggestions.retail.length, 1)
assert.equal(structuredPackSuggestions.retail[0].label, "Mimolette 200 g")
assert.equal(structuredPackSuggestions.retail[0].promoPrice, 2.99)

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
assert.ok(!suggestions.observed[0].label.includes("Maison"))
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
  assert.equal(result.observed[0].label, "Tablette de chocolat NESTLÉ 170 gr")
}

const realPoubelleObserved = observed({
  id: "obs-real-bin",
  productId: "shopping-real-bin",
  marketProductId: "market-real-bin",
  productName: "Poubelle",
  normalizedProductName: "poubelle",
  brand: "",
  packageFormat: "55 L",
  quantityValue: 55,
  quantityUnit: "l",
  price: 9.95,
  retailerSlug: "carrefour-reunion",
  retailerName: "Carrefour Réunion",
  storeName: "Carrefour Réunion",
})

const realPoubelleSuggestions = getShoppingAutocompleteSuggestions(
  "poubelle",
  [],
  [],
  [realPoubelleObserved],
)
assert.equal(realPoubelleSuggestions.observed.length, 1)
assert.equal(realPoubelleSuggestions.observed[0].label, "Poubelle 55 L")

const realPoubelleSelected = buildShoppingListItemFromSuggestion(
  realPoubelleSuggestions.observed[0],
)
assert.equal(realPoubelleSelected.name, "Poubelle 55 L")

const poubelleWithUnrelatedHistory = estimateShoppingList(
  [{ id: "line-real-bin", ...realPoubelleSelected }],
  [{
    id: "old-bin-bags",
    product_name: "20 SACS POUBELLE 20 L EK",
    normalized_name: "20 sacs poubelle ek",
    price: 1.44,
    created_at: "2026-09-10T08:00:00Z",
    market_product_id: "market-bin-bags",
    shopping_product_id: "shopping-bin-bags",
  }],
  [realPoubelleObserved],
)
assert.equal(poubelleWithUnrelatedHistory.total, 9.95)
assert.equal(poubelleWithUnrelatedHistory.items[0].historicalPrice, null)
assert.equal(poubelleWithUnrelatedHistory.items[0].priceSource, "retail_observed")
assert.equal(poubelleWithUnrelatedHistory.items[0].retailObservedPrice, 9.95)

const preciseChocolateObserved = observed({
  id: "obs-real-choco",
  productId: "shopping-real-choco",
  marketProductId: "market-real-choco",
  productName: "Tablette de chocolat",
  normalizedProductName: "tablette de chocolat",
  brand: "NESTLÉ",
  packageFormat: "170 gr",
  quantityValue: 170,
  quantityUnit: "g",
  price: 3.85,
  retailerSlug: "carrefour-market-reunion",
  retailerName: "Carrefour Market Réunion",
  storeName: "Carrefour Market Réunion",
})

const preciseChocolateSuggestions = getShoppingAutocompleteSuggestions(
  "nestle",
  [],
  [],
  [preciseChocolateObserved],
)
assert.equal(preciseChocolateSuggestions.observed.length, 1)
assert.equal(
  preciseChocolateSuggestions.observed[0].label,
  "Tablette de chocolat NESTLÉ 170 gr",
)
const preciseChocolateSelected = buildShoppingListItemFromSuggestion(
  preciseChocolateSuggestions.observed[0],
)
assert.equal(
  preciseChocolateSelected.name,
  "Tablette de chocolat NESTLÉ 170 gr",
)

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

console.log("[OK] Weighted ticket prices use €/kg or €/l instead of the paid line total")
console.log("[OK] Ambiguous packaged labels do not expose an unqualified price")
console.log("[OK] Descriptive historical products remain visible when their price is unusable")
console.log("[OK] Two-word descriptive products also remain visible without exposing a doubtful price")
console.log("[OK] Catalog promotions require a usable format or unit-price context")
console.log("[OK] Retail observed-price projection model")
console.log("[OK] Poubelle 55 L appears in retail autocomplete")
console.log("[OK] Selected retail product keeps structured identity")
console.log("[OK] Fresh retail observed price estimates a line without inventing personal history")
console.log("[OK] Personal ticket history keeps priority")
console.log("[OK] Stale retail price stays searchable but is excluded from basket estimate")
console.log("[OK] Reliable promotion can override retail observed price without inventing personal savings")