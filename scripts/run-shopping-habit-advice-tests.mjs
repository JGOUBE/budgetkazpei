import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { buildHabitSuggestions } from "../src/features/shopping/services/habitAdvice.js"
import { buildProductStats } from "../src/features/shopping/services/priceHistory.ts"

const item = (name, receiptId, createdAt, overrides = {}) => ({
  id: receiptId + ":" + name,
  receipt_id: receiptId,
  product_name: name,
  normalized_name: name.toLowerCase(),
  created_at: createdAt,
  store: "Leclerc",
  price: 2.5,
  ...overrides,
})

const snacks = [
  item("Goûters fourrés au chocolat 225 g", "r1", "2026-10-10T12:00:00Z"),
  item("Biscuits sablés 200 g", "r2", "2026-10-15T12:00:00Z"),
  item("Cookies 200 g", "r3", "2026-10-20T12:00:00Z"),
]
assert.ok(buildHabitSuggestions(snacks).some(suggestion => suggestion.type === "habit"))

// Reproduction de libellés réels abrégés et corrigés d'anciens tickets.
// Les conseils doivent fonctionner même sans EAN, mais sans fabriquer de prix.
const fromReceipts = [
  item("Goûters fourrés au chocolat 225 g", "historical-r1", "2026-08-13T12:00:00Z", {
    original_name: "225G GOUTER FOURRES CHOCO", confidence_score: 98, store: "Leader Price",
  }),
  item("MADELEINE PP X15 340G", "historical-r2", "2026-10-01T12:00:00Z", {
    original_name: "MADELEINE PP X15 340G", confidence_score: 100, store: "E.Leclerc",
  }),
  item("GOUTERS FOURRES CACAO X12 225G", "historical-r3", "2026-09-20T12:00:00Z", {
    original_name: "GOUTERS FOURRES CACAO X12 225G", confidence_score: 99, store: "E.Leclerc",
  }),
]
assert.equal(buildHabitSuggestions(fromReceipts).some(advice => advice.type === "habit"), true)

const sameReceipt = snacks.map((row, index) => ({
  ...row,
  id: "one:" + index,
  receipt_id: "only-one",
  created_at: "2026-10-10T12:00:00Z",
}))
assert.equal(buildHabitSuggestions(sameReceipt).some(suggestion => suggestion.type === "habit"), false)

const farine = [
  item("Farine T55 1 kg", "farine-old", "2026-10-10T12:00:00Z", {
    barcode: "3270190020952", store: "Leader Price", price: 1.35,
  }),
  item("Farine T55 1 kg", "farine-new", "2026-11-10T12:00:00Z", {
    barcode: "3270190020952", store: "Leclerc", price: 1.85,
  }),
]
const priceAdvice = buildHabitSuggestions(farine).find(suggestion => suggestion.type === "price")
assert.equal(priceAdvice?.store, "Leader Price")
assert.equal(priceAdvice?.saving, 0.5)
assert.equal(priceAdvice?.observedAt.slice(0, 10), "2026-10-10")
assert.equal(priceAdvice?.product, "Farine T55 1 kg")

const mixedAdvice = buildHabitSuggestions([...snacks, ...farine])
assert.deepEqual(mixedAdvice.map(suggestion => suggestion.type), ["price", "habit"])
assert.equal(mixedAdvice.length, 2)

const sameStore = farine.map(row => ({ ...row, store: "Leclerc" }))
assert.equal(buildHabitSuggestions(sameStore).some(suggestion => suggestion.type === "price"), false)

const untrusted = snacks.map(row => ({ ...row, needs_review: true }))
assert.equal(buildHabitSuggestions(untrusted).length, 0)

const empty = buildHabitSuggestions([])
assert.deepEqual(empty, [])

console.log("Shopping habit advice tests passed")

const overview = await readFile(new URL("../src/features/shopping/pages/ShoppingInsightsPage.jsx", import.meta.url), "utf8")
const savings = await readFile(new URL("../src/pages/SavingsPage.jsx", import.meta.url), "utf8")
const card = await readFile(new URL("../src/features/shopping/components/HabitAdviceCard.jsx", import.meta.url), "utf8")
assert.match(overview, /<HabitAdviceCard suggestions=\{habitSuggestions\}/)
assert.match(savings, /<HabitAdviceCard suggestions=\{habitSuggestions\}/)
assert.match(card, /suggestions\.length === 0/)

const repeatPurchases = [
  "2026-07-02", "2026-07-18", "2026-08-02",
  "2026-08-18", "2026-09-04", "2026-09-26",
].map((date, index) => ({
  id: "repeat:" + index,
  receipt_id: "receipt:" + index,
  product_name: "Pains au chocolat x10",
  normalized_name: "pains au chocolat x10",
  price: 4.9,
  created_at: date + "T12:00:00Z",
}))
const repeatStats = buildProductStats(repeatPurchases, "pains au chocolat x10")
assert.equal(repeatStats.totalSpent, 29.4)
assert.ok(repeatStats.monthlySpendEstimate > 0)
assert.match(overview, /shouldShowMonthlyProjection/)
assert.match(overview, /purchaseCount >= 5 && daysSpan >= 60/)
assert.match(overview, /stats\.totalSpent/)
assert.match(overview, /ce produit pourrait représenter environ/)
assert.doesNotMatch(overview, /stats\.yearlySpend|stats\.yearlyFrequency|Vous achetez ce produit.*fois par an/)
console.log("Shopping observed spend and monthly copy tests passed")
