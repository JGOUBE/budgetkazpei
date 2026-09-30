import assert from "node:assert/strict"

import {
  deduplicateRetailObservedPriceOffers,
} from "../src/services/retail/retailObservedPriceService.js"
import {
  buildMultiRetailBasketOptimization,
} from "../src/services/shoppingList/shoppingBasketOptimizer.js"

function observed(overrides = {}) {
  return {
    id: "obs-bin-carrefour",
    productId: "shopping-bin",
    marketProductId: "market-bin",
    productName: "Poubelle",
    normalizedProductName: "poubelle",
    brand: "",
    packageFormat: "55 L",
    quantityValue: 55,
    quantityUnit: "l",
    retailerSlug: "carrefour-reunion",
    retailerName: "Carrefour Réunion",
    storeSlug: "carrefour-reunion",
    storeName: "Carrefour Réunion",
    price: 9.95,
    observedAt: "2026-09-28T05:00:00Z",
    lastSeenAt: "2026-09-28T05:00:00Z",
    isFresh: true,
    ...overrides,
  }
}

const offers = deduplicateRetailObservedPriceOffers([
  observed({
    id: "c-old",
    price: 10.5,
    observedAt: "2026-09-27T05:00:00Z",
    lastSeenAt: "2026-09-27T05:00:00Z",
  }),
  observed({ id: "c-new", price: 9.95 }),
  observed({
    id: "lp",
    retailerSlug: "leader-price-reunion",
    retailerName: "Leader Price Réunion",
    storeSlug: "lp-ermitage",
    storeName: "LP Ermitage",
    price: 10.2,
  }),
])

assert.equal(offers.length, 2)
assert.ok(offers.some(row => row.id === "c-new"))
assert.ok(offers.some(row => row.id === "lp"))

const basketItems = [
  {
    id: "line-bin",
    name: "Poubelle 55 L",
    shopping_product_id: "shopping-bin",
    market_product_id: "market-bin",
    package_format: "55 L",
    quantity_value: 55,
    quantity_unit: "l",
    estimatedLineCost: 12.5,
    estimatedPrice: 12.5,
    estimatedPriceSource: "history",
  },
  {
    id: "line-choco",
    name: "Tablette de chocolat NESTLÉ 170 gr",
    shopping_product_id: "shopping-choco",
    market_product_id: "market-choco",
    brand: "NESTLÉ",
    package_format: "170 gr",
    quantity_value: 170,
    quantity_unit: "g",
    estimatedLineCost: 4.5,
    estimatedPrice: 4.5,
    estimatedPriceSource: "history",
  },
]

const observedPrices = [
  ...offers,
  observed({
    id: "choco-carrefour",
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
    storeSlug: "carrefour-market",
    storeName: "Carrefour Market Réunion",
    price: 3.85,
  }),
]

const promotions = [{
  id: "promo-choco-lp",
  productId: "shopping-choco",
  marketProductId: "market-choco",
  productName: "Tablette de chocolat",
  normalizedProductName: "tablette de chocolat",
  controlledNormalization: true,
  brand: "NESTLÉ",
  packageFormat: "170 gr",
  quantityValue: 170,
  quantityUnit: "g",
  retailerSlug: "leader-price-reunion",
  retailerName: "Leader Price Réunion",
  storeName: "LP Ermitage",
  promoPrice: 3.49,
  originalPrice: 4.2,
  promotionProven: true,
  isActive: true,
}]

const optimization = buildMultiRetailBasketOptimization({
  items: basketItems,
  observedPrices,
  promotions,
})

assert.equal(optimization.currentEstimate, 17)
assert.equal(optimization.optimizedTotal, 13.44)
assert.equal(optimization.potentialSaving, 3.56)
assert.equal(optimization.retailOfferMatchedCount, 2)
assert.equal(optimization.selectedRetailOfferCount, 2)
assert.equal(optimization.retailerCount, 2)
assert.equal(optimization.splitAcrossRetailers, true)

const bin = optimization.items.find(item => item.id === "line-bin")
assert.equal(bin.selectedRetailOffer.source, "observed")
assert.equal(bin.selectedRetailOffer.retailerName, "Carrefour Réunion")
assert.equal(bin.selectedCost, 9.95)

const choco = optimization.items.find(item => item.id === "line-choco")
assert.equal(choco.selectedRetailOffer.source, "promotion")
assert.equal(choco.selectedRetailOffer.retailerName, "Leader Price Réunion")
assert.equal(choco.selectedCost, 3.49)

const equalRetailBaseline = buildMultiRetailBasketOptimization({
  items: [{
    ...basketItems[0],
    estimatedLineCost: 9.95,
    estimatedPrice: 9.95,
    estimatedPriceSource: "retail_observed",
  }],
  observedPrices: [observed({ price: 9.95 })],
  promotions: [],
})
assert.equal(equalRetailBaseline.selectedRetailOfferCount, 1)
assert.equal(equalRetailBaseline.retailerBreakdown[0].retailerName, "Carrefour Réunion")
assert.equal(equalRetailBaseline.potentialSaving, 0)

const staleIgnored = buildMultiRetailBasketOptimization({
  items: [basketItems[0]],
  observedPrices: [observed({ isFresh: false, price: 5.0 })],
  promotions: [],
})
assert.equal(staleIgnored.retailOfferMatchedCount, 0)
assert.equal(staleIgnored.optimizedTotal, 12.5)

const incompatibleFormat = buildMultiRetailBasketOptimization({
  items: [basketItems[0]],
  observedPrices: [observed({
    id: "wrong-bin",
    productId: "different-shopping-bin",
    marketProductId: "different-market-bin",
    packageFormat: "20 L",
    quantityValue: 20,
    quantityUnit: "l",
    price: 1.44,
  })],
  promotions: [],
})
assert.equal(incompatibleFormat.retailOfferMatchedCount, 0)
assert.equal(incompatibleFormat.optimizedTotal, 12.5)

console.log("[OK] Plusieurs enseignes conservees pour un meme produit")
console.log("[OK] Meilleure offre fiable choisie par ligne")
console.log("[OK] Une promo fiable peut battre un prix observe")
console.log("[OK] Prix retail deja integre reste attribue a son enseigne")
console.log("[OK] Sous-totaux regroupes par enseigne")
console.log("[OK] Prix observes perimes ignores")
console.log("[OK] Conflits identite/format ignores")