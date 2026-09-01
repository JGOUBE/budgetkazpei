import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const root = process.cwd()
const migration = readFileSync(
  join(root, "supabase/migrations/20260901143040_retail_chain_scopes.sql"),
  "utf8",
)
const normalizedMigration = migration.toLowerCase().replace(/\s+/g, " ").trim()
const guardMigration = readFileSync(
  join(root, "supabase/migrations/20260901144726_retail_scope_resolution_guard.sql"),
  "utf8",
)

function resolveRetailMarketStore({ candidate, mappings, stores }) {
  const mappedStoreId = mappings.find(mapping => (
    mapping.retailer_slug === candidate.retailer_slug
    && mapping.store_slug === candidate.store_slug
  ))?.market_store_id

  if (mappedStoreId) return mappedStoreId

  const normalizedName = String(candidate.store_name || "").trim().toLowerCase()
  const normalizedCity = String(candidate.store_city || "").trim().toLowerCase()
  if (normalizedCity === "") {
    throw new Error(`market store unresolved for retail candidate ${candidate.id}`)
  }
  const exactMatches = stores.filter(store => (
    store.normalized_store_name === normalizedName
    && (normalizedCity === "" || store.normalized_city === normalizedCity)
  ))

  if (exactMatches.length === 1) return exactMatches[0].id

  const chainMatches = normalizedCity === ""
    ? []
    : stores.filter(store => (
      store.store_chain_key === normalizedName
      && store.normalized_city === normalizedCity
    ))

  if (chainMatches.length === 1) return chainMatches[0].id

  throw new Error(`market store unresolved for retail candidate ${candidate.id}`)
}

const mappingRows = [
  ["leader-price-reunion", "leaderprice-lp-ermitage", "physical-lp-ermitage"],
  ["carrefour-reunion", "carrefour-reunion", "scope-carrefour-reunion"],
  ["carrefour-market-reunion", "carrefour-market-reunion", "scope-carrefour-market-reunion"],
  ["carrefour-city-reunion", "carrefour-city-reunion", "scope-carrefour-city-reunion"],
].map(([retailer_slug, store_slug, market_store_id]) => ({
  retailer_slug,
  store_slug,
  market_store_id,
}))

const physicalStores = [{
  id: "physical-carrefour-saint-denis",
  normalized_store_name: "carrefour saint denis",
  normalized_city: "saint denis",
  store_chain_key: "carrefour saint denis",
}]

const resolve = candidate => resolveRetailMarketStore({
  candidate,
  mappings: mappingRows,
  stores: physicalStores,
})

assert.equal(resolve({
  id: "lp-ermitage",
  retailer_slug: "leader-price-reunion",
  store_slug: "leaderprice-lp-ermitage",
  store_name: "LP Ermitage",
  store_city: "Saint-Gilles Les Bains",
}), "physical-lp-ermitage", "A. LP Ermitage must keep its explicit physical-store mapping")

for (const [retailerSlug, name, expectedId] of [
  ["carrefour-reunion", "Carrefour Réunion", "scope-carrefour-reunion"],
  ["carrefour-market-reunion", "Carrefour Market Réunion", "scope-carrefour-market-reunion"],
  ["carrefour-city-reunion", "Carrefour City Réunion", "scope-carrefour-city-reunion"],
]) {
  assert.equal(resolve({
    id: retailerSlug,
    retailer_slug: retailerSlug,
    store_slug: retailerSlug,
    store_name: name,
    store_city: null,
  }), expectedId, `${name} must resolve through its declared retailer scope`)
}

assert.equal(resolve({
  id: "physical-carrefour",
  retailer_slug: "carrefour-physical",
  store_slug: "carrefour-saint-denis",
  store_name: "Carrefour Saint Denis",
  store_city: "Saint Denis",
}), "physical-carrefour-saint-denis", "F. A known physical store must keep exact name/city resolution")

assert.throws(() => resolve({
  id: "unknown-scope",
  retailer_slug: "unknown-reunion",
  store_slug: "unknown-reunion",
  store_name: "Unknown Réunion",
  store_city: null,
}), /market store unresolved/, "G. An unknown retailer scope must fail explicitly")

assert.throws(() => resolve({
  id: "physical-name-without-city",
  retailer_slug: "carrefour-physical",
  store_slug: "unmapped-carrefour-saint-denis",
  store_name: "Carrefour Saint Denis",
  store_city: null,
}), /market store unresolved/, "G. A missing city must never fall back to a uniquely named physical store")

assert.match(migration, /market_stores_retailer_scope_has_no_city/, "E. Retailer scopes must enforce city IS NULL")
assert.match(migration, /store_type is distinct from 'retailer_scope'/, "Scopes must be distinguishable from physical stores")
assert.match(migration, /'carrefour reunion\|\|la reunion'/, "Carrefour scope key must use the native market key with an empty city segment")
assert.match(migration, /'carrefour market reunion\|\|la reunion'/, "Carrefour Market scope key must use the native market key with an empty city segment")
assert.match(migration, /'carrefour city reunion\|\|la reunion'/, "Carrefour City scope key must use the native market key with an empty city segment")
assert.match(normalizedMigration, /when nullif\(trim\(coalesce\(v_candidate\.store_city, ''\)\), ''\) is null then 'island'/, "Promotions without a city must be island-scoped")
assert.match(normalizedMigration, /if v_catalog_scope_type = 'store' then select id into v_store_location_id from public\.shopping_store_locations/, "Only physical stores may create shopping locations")
assert.match(normalizedMigration, /retail_candidates\.store_city as commune/, "Promotions must expose only a real city")
assert.match(normalizedMigration, /coalesce\(observations\.store_city, retail_candidates\.store_city\) as commune/, "Observed prices must expose only a real city")
assert.match(normalizedMigration, /retail_candidates\.store_name as locality/, "Promotions must display their exact retailer-scope name")
assert.match(normalizedMigration, /observations\.store_name as locality/, "Observed prices must display their exact retailer-scope name")
assert.doesNotMatch(migration, /coalesce\(v_candidate\.store_city, v_candidate\.store_name\)/, "No store name may be invented as a commune")
assert.doesNotMatch(migration, /starts_at\s*:=\s*now\(\)|starts_at\s*=\s*now\(\)/i, "No promotion start date may be invented")
assert.match(guardMigration, /v_store_id is null and v_normalized_store_city = ''/, "A missing city must require an explicit scope mapping")
assert.match(guardMigration, /no explicit retailer\/store scope mapping exists/, "An unknown scope must fail explicitly")

console.log("Retail chain scope tests passed.")
