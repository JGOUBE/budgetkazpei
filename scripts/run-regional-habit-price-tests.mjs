import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { buildRegionalHabitPriceSuggestions } from "../src/features/shopping/services/catalogHabitPriceAdvice.js"
import { buildHabitSuggestions } from "../src/features/shopping/services/habitAdvice.js"

const now = new Date("2026-11-12T22:00:00Z").getTime()
const purchase = (receiptId, productName = "Farine de blé T65 1 kg", overrides = {}) => ({
  receipt_id: receiptId,
  product_name: productName,
  store: "E.Leclerc",
  price: receiptId === "r2" ? 1.89 : 1.75,
  quantity: 1,
  unit: "kg",
  created_at: receiptId === "r2" ? "2026-11-10T12:00:00Z" : "2026-10-02T12:00:00Z",
  confidence_score: 99,
  ...overrides,
})
const items = [purchase("r1"), purchase("r2")]
const product = { id: "farine-1kg", display_name: "Farine de blé T65 1 kg", size_label: "1 kg", brand: "" }
const sharedPrice = (store, price, date = "2026-10-20T12:00:00Z", overrides = {}) => ({
  product_id: product.id,
  price,
  retailer_slug: store,
  observed_at: date,
  commune: "Saint-Leu",
  ...overrides,
})
const priceData = {
  shoppingItems: items,
  sharedProducts: [product],
  sharedPrices: [
    sharedPrice("leader-price", 1.49),
    sharedPrice("leader-price", 1.19, "2026-09-15T12:00:00Z"),
    sharedPrice("e-leclerc", 1.30),
  ],
  retailPrices: [],
  now,
}
const suggestions = buildRegionalHabitPriceSuggestions(priceData)
assert.equal(suggestions.length, 1)
assert.equal(suggestions[0].product, "Farine de blé T65 1 kg")
assert.equal(suggestions[0].alternativePrice, 1.49)
assert.equal(suggestions[0].referencePrice, 1.89)
assert.equal(suggestions[0].saving, 0.40)
assert.equal(suggestions[0].receiptCount, 2)
assert.match(suggestions[0].alternativeStore, /Leader Price/)
assert.match(suggestions[0].alternativeStore, /Saint-Leu/)
assert.equal(suggestions[0].observedAt.slice(0, 10), "2026-10-20")
assert.equal(suggestions[0].type, "regionalPrice")

const mergedAdvice = buildHabitSuggestions(items, { regionalSavings: suggestions })
assert.equal(mergedAdvice[0].type, "regionalPrice")
assert.equal(mergedAdvice.length, 1)

const compare = overrides => buildRegionalHabitPriceSuggestions({ ...priceData, ...overrides })
assert.equal(compare({ shoppingItems: [items[0]] }).length, 0, "Single purchase is not a habit")
assert.equal(compare({ shoppingItems: items.map(x => ({ ...x, receipt_id: "one" })) }).length, 0, "One ticket cannot prove frequency")
assert.equal(compare({ sharedProducts: [{ ...product, display_name: "Farine de blé T45 1 kg" }] }).length, 0, "Other flour type must not be confused")
assert.equal(compare({ sharedProducts: [{ ...product, size_label: "500 g" }] }).length, 0, "Conflicting size evidence must block a false price")
assert.equal(compare({ sharedPrices: [sharedPrice("e-leclerc", 1.1)] }).length, 0, "A lower price in the same retail chain is not another store")
assert.equal(compare({ sharedPrices: [sharedPrice("leader-price", 1.39, "2026-01-05T12:00:00Z")] }).length, 0, "Old price must not be shown as a relevant regional opportunity")
assert.equal(compare({ sharedPrices: [sharedPrice("leader-price", 1.39, "2026-11-13T12:00:00Z")] }).length, 0, "Future price is invalid")
assert.equal(compare({ sharedPrices: [sharedPrice("leader-price", 1.87)] }).length, 0, "Very small differences are not actionable")
assert.equal(compare({ sharedPrices: [sharedPrice("leader-price", 1.49), sharedPrice("leader-price", 1.20)] }).length, 0, "Contradictory same-day outlet prices must not create a false deal")
assert.equal(compare({ shoppingItems: items.map(x => ({ ...x, brand: "Mon Moulin" })), sharedProducts: [{ ...product, brand: "Autre moulin" }] }).length, 0, "Brand mismatch blocks comparison")
assert.equal(compare({ shoppingItems: items.map(x => ({ ...x, product_name: "Farine de blé T65 500 g" })) }).length, 0, "Different pack size must not be matched")
assert.equal(compare({ shoppingItems: items.map(x => ({ ...x, quantity: 2, unit: "piece", price: 3.78 })) }).length, 0, "A multiple-pack receipt total is not a package price")
assert.equal(compare({ sharedPrices: [sharedPrice("leader-price", -1)] }).length, 0, "Missing prices are not opportunities")

const linkedItems = items.map(x => ({
  ...x, product_name: "Farine T65 1 kg", market_product_id: "market-farine",
}))
const viaPublishedRetail = buildRegionalHabitPriceSuggestions({
  shoppingItems: linkedItems,
  sharedProducts: [],
  sharedPrices: [],
  retailPrices: [{
    productName: "Farine de blé T65 1 kg",
    marketProductId: "market-farine",
    packageFormat: "1 kg",
    retailerName: "Leader Price Réunion",
    storeCity: "Saint-Leu",
    price: 1.29,
    observedAt: "2026-11-01T12:00:00Z",
  }],
  now,
})
assert.equal(viaPublishedRetail.length, 1)
assert.equal(viaPublishedRetail[0].saving, 0.60)
assert.equal(viaPublishedRetail[0].source, "regional_retail")

const pastries = [
  purchase("r1", "Pains au chocolat x10", { price: 4.90, unit: "piece" }),
  purchase("r2", "Pains au chocolat x10", { price: 4.90, unit: "piece" }),
]
const multipackPrice = buildRegionalHabitPriceSuggestions({
  shoppingItems: pastries,
  sharedProducts: [{ id: "pastry10", display_name: "Pains au chocolat x10", size_label: "" }],
  sharedPrices: [{ product_id: "pastry10", retailer_slug: "leader-price", price: 3.99, observed_at: "2026-10-20" }],
  now,
})
assert.equal(multipackPrice.length, 1)
assert.equal(multipackPrice[0].saving, 0.91)

const overview = readFileSync(new URL("../src/features/shopping/pages/ShoppingInsightsPage.jsx", import.meta.url), "utf8")
const savings = readFileSync(new URL("../src/pages/SavingsPage.jsx", import.meta.url), "utf8")
const card = readFileSync(new URL("../src/features/shopping/components/HabitAdviceCard.jsx", import.meta.url), "utf8")
assert.match(overview, /buildRegionalHabitPriceSuggestions/)
assert.match(savings, /buildRegionalHabitPriceSuggestions/)
assert.match(card, /suggestion\.type === "regionalPrice"/)
assert.match(card, /formatShortDate\(suggestion\.observedAt\)/)
console.log("Regional shopping habit price comparison tests passed")
