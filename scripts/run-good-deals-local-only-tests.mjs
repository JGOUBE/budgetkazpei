import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { loadPublishedGoodDeals } from "../src/services/retail/retailPromotionService.js"
import { resolveAppSectionTarget } from "../src/services/appSectionNavigation.js"

const read = path => readFileSync(new URL(path, import.meta.url), "utf8")
const page = read("../src/pages/GoodDealsPage.jsx")
const landing = read("../src/components/landing/AdvisorAndLocalDeals.jsx")
const catalog = read("../src/services/shoppingList/sharedCatalogLoader.js")
const shopping = read("../src/pages/ShoppingListPage.jsx")

assert.doesNotMatch(page, /id: "shopping", fr: "Promos & bons prix"/,
  "No supermarkets/catalogs filter in Mes bons plans")
assert.match(page, /normalizeCategory\(deal.category\) === "shopping"/,
  "All-category must exclude grocery/catalog rows")
assert.match(page, /getDealContentKind\(deal\) === "observed_price"/,
  "Observed prices must not leak into local deals")
assert.match(page, /includeRetailPromotions: false/,
  "Mes bons plans must not load supermarket promotion projection")
assert.doesNotMatch(landing, /<PromotionsSection content=\{localDeals.promotions\}/,
  "Public landing should not promote supermarket catalogues")
assert.match(landing, /id="bons-plans"/,
  "Local deals must own the original public landing anchor")
assert.match(catalog, /\.from\("shopping_price_observations"\)/,
  "Courses intelligentes still uses verified price observations")
assert.match(shopping, /loadActiveRetailPromotions\(\{ client: supabase \}\)/,
  "Shopping promo-price lookup must stay operational independently")
assert.equal(resolveAppSectionTarget("promotions").section, "shopping")
assert.equal(resolveAppSectionTarget("promotions").shoppingTab, "savings")

const calls = []
const fixtures = {
  published_good_deals: { data: [
    { id: "restaurant", title: "Restaurant du coin", category: "food" },
    { id: "catalog", title: "Catalogue supermarché", category: "shopping" },
  ], error: null },
  good_deal_territories: { data: [], error: null },
}
const client = { from(table) {
  calls.push(table)
  if (table === "published_retail_promotions") {
    throw new Error("Retail projection must not be queried by local deals")
  }
  const response = fixtures[table]
  if (!response) throw new Error("Unexpected query to "+table)
  return {
    select() { return this },
    order() { return this },
    in() { return Promise.resolve(response) },
    then(resolve, reject) { return Promise.resolve(response).then(resolve, reject) },
  }
}}
const items = await loadPublishedGoodDeals({ client, includeRetailPromotions: false })
assert.equal(items.length,2)
assert.ok(calls.includes("published_good_deals"))
assert.ok(!calls.includes("published_retail_promotions"))
assert.equal(items[0].title,"Restaurant du coin")
console.log("OK: local Bons plans is separate from shared shopping catalogs and promotions.")
