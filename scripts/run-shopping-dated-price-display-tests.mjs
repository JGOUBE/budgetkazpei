import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { getDatedShoppingListPrice } from "../src/services/shoppingList/shoppingDatedPriceDisplay.js"

const products = [
  { id: "kokot-6", display_name: "Oeufs Kokot plein air x6" },
  { id: "kokot-12", display_name: "Œufs plein air Kokot x12" },
]
const prices = [
  { product_id: "kokot-12", price: 5.35, observed_at: "2026-06-19T00:00:00Z", retailer_slug:"e-leclerc", commune:"Saint-Leu" },
]
const now = new Date("2026-11-09T12:00:00Z").getTime()
const item = { name: "Œufs plein air Kokot x12", id: "old-saved", list_quantity: 1 }
const reference = getDatedShoppingListPrice({ item, products, observations: prices, now })
assert.equal(reference?.price, 5.35)
assert.equal(reference?.observedAt, "2026-06-19T00:00:00Z")
assert.equal(getDatedShoppingListPrice({ item: {...item, list_quantity: 2}, products, observations: prices, now })?.price, 10.70)
assert.equal(getDatedShoppingListPrice({ item: { name: "Oeufs Kokot plein air x6" }, products, observations: prices, now }), null)
assert.equal(getDatedShoppingListPrice({ item: { name: "Œufs plein air Kokot x18" }, products, observations: prices, now }), null)
assert.equal(getDatedShoppingListPrice({ item: {name: "Œufs plein air Kokot x12",selected_pack_price: 5.15,selected_price_observed_at: "2026-11-01T00:00:00Z" }, products, observations: prices, now })?.price, 5.15)
assert.equal(getDatedShoppingListPrice({ item: {name:"Œufs plein air Kokot x12", selected_pack_price:5.15,selected_price_observed_at:"2026-12-01T00:00:00Z"}, products, observations:prices, now})?.price, 5.35)
const ui = readFileSync(new URL("../src/pages/ShoppingListPage.jsx", import.meta.url), "utf8")
assert.match(ui, /getDatedShoppingListPrice\(\{/)
assert.match(ui, /observations: sharedUnitPrices/)
assert.match(ui, /datedReferencePrice > 0 \? formatMontant\(datedReferencePrice\)/)
console.log("OK: catalogue œufs Kokot x12 5,35 € remains visible on saved list row, quantities and 6/18-boxes safe")
