import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

import { enrichShoppingItemsWithReceiptIdentities } from "../src/features/shopping/services/shoppingProductIdentity.js"
import {
  formatRetailPrice,
  isRetailPromotionEligible,
  loadActiveRetailPromotions,
  toRetailPromotionViewModel,
} from "../src/services/retail/retailPromotionService.js"
import {
  findActivePromotionsForShoppingItems,
  SHOPPING_PROMOTION_MATCH_STATUS,
} from "../src/services/retail/shoppingPromotionMatching.js"
import {
  buildShoppingBasketSnapshotItems,
  enrichShoppingBasketWithPromotions,
} from "../src/services/shoppingList/shoppingPromotionEnrichment.js"

const rootUrl = new URL("../", import.meta.url)
const read = path => readFile(new URL(path, rootUrl), "utf8")

function shoppingItem(overrides = {}) {
  return {
    id: "line-1",
    name: "Riz basmati 1 kg",
    product_id: "shopping-rice",
    market_product_id: "market-rice",
    barcode: "3250390000001",
    brand: "Maison Péï",
    historicalPrice: 4.5,
    estimatedPrice: 4.5,
    ...overrides,
  }
}

function promotion(overrides = {}) {
  return {
    id: "promo-rice",
    productId: "shopping-rice",
    marketProductId: "market-rice",
    productName: "Riz basmati 1 kg",
    normalizedProductName: "riz basmati",
    controlledNormalization: true,
    barcode: "3250390000001",
    brand: "Maison Péï",
    packageFormat: "1 kg",
    quantityValue: 1,
    quantityUnit: "kg",
    retailerName: "Carrefour Réunion",
    storeName: "Carrefour Sainte-Clotilde",
    promoPrice: 3.2,
    originalPrice: 4.5,
    unitPrice: 3.2,
    unitLabel: "kg",
    promotionProven: true,
    isActive: true,
    ...overrides,
  }
}

function onlyMatch(itemOverrides = {}, promotionOverrides = {}) {
  return findActivePromotionsForShoppingItems(
    [shoppingItem(itemOverrides)],
    [promotion(promotionOverrides)],
  )[0]
}

// Les cinq preuves autorisées peuvent produire un rapprochement fiable.
assert.equal(onlyMatch().matchStatus, SHOPPING_PROMOTION_MATCH_STATUS.RELIABLE)
assert.equal(onlyMatch({ product_id: null }, { productId: null }).matchStatus, SHOPPING_PROMOTION_MATCH_STATUS.RELIABLE)
assert.equal(onlyMatch(
  { product_id: null, market_product_id: null },
  { productId: null, marketProductId: null },
).matchStatus, SHOPPING_PROMOTION_MATCH_STATUS.RELIABLE)
assert.equal(onlyMatch(
  {
    product_id: null,
    market_product_id: null,
    barcode: null,
    validated_product_alias: "Riz maison pei",
    alias_validated: true,
  },
  {
    productId: null,
    marketProductId: null,
    barcode: null,
    validatedAliases: ["Riz maison pei"],
  },
).matchStatus, SHOPPING_PROMOTION_MATCH_STATUS.RELIABLE)
assert.equal(onlyMatch(
  { product_id: null, market_product_id: null, barcode: null, controlled_normalization: true },
  { productId: null, marketProductId: null, barcode: null },
).matchStatus, SHOPPING_PROMOTION_MATCH_STATUS.RELIABLE)

// Une identité structurée contradictoire bloque tout repli nominal.
assert.equal(onlyMatch({ product_id: "other-product" }).matchStatus, SHOPPING_PROMOTION_MATCH_STATUS.NONE)

// Le fuzzy reste une suggestion et son économie n'est jamais fiable.
const fuzzy = onlyMatch(
  {
    product_id: null,
    market_product_id: null,
    barcode: null,
    controlled_normalization: false,
    name: "Riz basmati bio 1 kg",
    brand: null,
  },
  {
    productId: null,
    marketProductId: null,
    barcode: null,
    controlledNormalization: false,
    productName: "Riz basmati premium 1 kg",
    brand: null,
  },
)
assert.equal(fuzzy.matchStatus, SHOPPING_PROMOTION_MATCH_STATUS.SUGGESTED)
assert.equal(fuzzy.reliableSaving, null)

// Marque, famille, taille et nombre de lots empêchent une fausse économie.
for (const mismatch of [
  onlyMatch({}, { brand: "Autre marque" }),
  onlyMatch({}, { productName: "Riz basmati 1 l", packageFormat: "1 l", quantityUnit: "l" }),
  onlyMatch({ price_per_unit: null }, { productName: "Riz basmati 500 g", packageFormat: "500 g", quantityValue: 500, quantityUnit: "g", unitPrice: null }),
  onlyMatch({}, { productName: "Pack de 2 riz basmati 1 kg", packageFormat: "pack de 2 · 1 kg", packCount: 2 }),
]) {
  assert.notEqual(mismatch.matchStatus, SHOPPING_PROMOTION_MATCH_STATUS.RELIABLE)
  assert.equal(mismatch.reliableSaving, null)
}

// Une autre taille n'est fiable que via deux prix unitaires comparables.
const normalizedSize = onlyMatch(
  { price_per_unit: 4.5 },
  { productName: "Riz basmati 500 g", packageFormat: "500 g", quantityValue: 500, quantityUnit: "g", unitPrice: 3.2 },
)
assert.equal(normalizedSize.matchStatus, SHOPPING_PROMOTION_MATCH_STATUS.RELIABLE)
assert.equal(normalizedSize.reliableSaving, 1.3)

// Plusieurs enseignes/magasins restent des alternatives ; la meilleure offre
// de même niveau de preuve est sélectionnée sans dupliquer l'économie de ligne.
const multiStore = findActivePromotionsForShoppingItems([shoppingItem()], [
  promotion({ id: "carrefour", promoPrice: 3.5, retailerName: "Carrefour Réunion" }),
  promotion({ id: "leader", promoPrice: 3.1, retailerName: "Leader Price Réunion", storeName: "Leader Price Chaudron" }),
])[0]
assert.equal(multiStore.promotions.length, 2)
assert.equal(multiStore.bestPromotion.id, "leader")
assert.equal(multiStore.alternatives.length, 1)
assert.equal(multiStore.reliableSaving, 1.4)

// Prix historique absent ou promo plus chère : aucune économie inventée/négative.
assert.equal(onlyMatch({ historicalPrice: null, estimatedPrice: null }).reliableSaving, null)
assert.equal(onlyMatch({}, { promoPrice: 5 }).reliableSaving, 0)
assert.equal(formatRetailPrice(1.1), "1,10 €")

const enriched = enrichShoppingBasketWithPromotions({
  estimate: {
    items: [shoppingItem(), shoppingItem({
      id: "line-2",
      name: "Pain complet 500 g",
      product_id: "shopping-bread",
      market_product_id: "market-bread",
      barcode: "3250390000002",
      historicalPrice: 2,
      estimatedPrice: 2,
    })],
    total: 6.5,
    min: 5.98,
    max: 7.02,
    missingPriceCount: 0,
    totalItems: 2,
  },
  promotions: [promotion()],
})
assert.equal(enriched.historicalBasketEstimate, 6.5)
assert.equal(enriched.enrichedItems, enriched.items)
assert.equal(enriched.items[0].promotionPrice, 3.2)
assert.equal(enriched.reliableSavingsTotal, 1.3, "Les alternatives d'une ligne ne doivent pas être cumulées")
assert.equal(enriched.optimizedBasketEstimate, 5.2)
assert.ok(enriched.optimizedBasketEstimate >= 0)
const boundedBasket = enrichShoppingBasketWithPromotions({
  estimate: { items: [shoppingItem()], total: 0.5 },
  promotions: [promotion()],
})
assert.equal(boundedBasket.reliableSavingsTotal, 0.5)
assert.equal(boundedBasket.optimizedBasketEstimate, 0)

// Une capture sauvegarde l'information visible et demeure valable après
// expiration/disparition de la promotion active.
const snapshotItems = buildShoppingBasketSnapshotItems(enriched.items)
assert.equal(snapshotItems[0].promotionSnapshot.retailerName, "Carrefour Réunion")
assert.equal(snapshotItems[0].promotionSnapshot.promoPrice, 3.2)
assert.equal("promotion" in snapshotItems[0], false)
assert.equal("promotionAlternatives" in snapshotItems[0], false)
const afterExpiry = enrichShoppingBasketWithPromotions({ estimate: { items: snapshotItems, total: 6.5 }, promotions: [] })
assert.equal(afterExpiry.items[0].promotion, null)
assert.equal(snapshotItems[0].promotionSnapshot.promoPrice, 3.2)

// Le rattachement ticket -> market_product est batchable et refuse l'ambiguïté.
const history = [{ id: "history-1", receipt_id: "receipt-1", normalized_name: "riz basmati" }]
const identity = row => ({
  receipt_id: "receipt-1",
  normalized_name: "riz basmati",
  market_matched: true,
  market_product_id: row,
  market_canonical_name: "Riz basmati",
})
assert.equal(enrichShoppingItemsWithReceiptIdentities(history, [identity("market-rice")])[0].market_product_id, "market-rice")
assert.equal(enrichShoppingItemsWithReceiptIdentities(history, [identity("one"), identity("two")])[0].market_product_id, undefined)

// Chargement public en une seule requête, avec compatibilité ancien schéma.
function promotionClient(result) {
  let calls = 0
  const builder = {
    select() { return builder },
    order() { return builder },
    then(resolve, reject) { return Promise.resolve(result).then(resolve, reject) },
  }
  return {
    get calls() { return calls },
    from(table) {
      calls += 1
      assert.equal(table, "published_retail_promotions")
      return builder
    },
  }
}

const activeRaw = {
  id: "official",
  product_id: "shopping-rice",
  product_name: "Riz basmati 1 kg",
  retailer_name: "Carrefour Réunion",
  promo_price: 3.2,
  original_price: 4.5,
  promotion_proven: true,
  is_active: true,
  is_fresh: true,
}

const retailNow = new Date("2026-09-05T12:00:00.000Z")
const carrefourRaw = {
  ...activeRaw,
  date_basis: "official",
  starts_at: "2026-09-01T00:00:00.000Z",
  ends_at: "2026-09-08T23:59:59.000Z",
  promotion_evidence: { kind: "catalog" },
}
const leaderRaw = {
  ...activeRaw,
  retailer_slug: "leader-price-reunion",
  collector_source_slug: "leader-price-reunion-retail",
  source_type: "leader_drive_html",
  date_basis: "observed_freshness",
  observed_at: "2026-09-05T06:00:00.000Z",
  fresh_until: "2026-09-06T18:00:00.000Z",
  promotion_evidence: { kind: "direct_discount" },
}
assert.equal(isRetailPromotionEligible(carrefourRaw, retailNow), true)
assert.equal(isRetailPromotionEligible({ ...carrefourRaw, ends_at: "2026-09-04T23:59:59.000Z" }, retailNow), false)
assert.equal(isRetailPromotionEligible(leaderRaw, retailNow), true)
assert.equal(isRetailPromotionEligible({ ...leaderRaw, fresh_until: "2026-09-05T11:59:59.000Z" }, retailNow), false)

const activeClient = promotionClient({ data: [activeRaw], error: null })
assert.equal((await loadActiveRetailPromotions({ client: activeClient })).length, 1)
assert.equal(activeClient.calls, 1)
const oldSchemaClient = promotionClient({ data: null, error: { code: "PGRST205" } })
assert.deepEqual(await loadActiveRetailPromotions({ client: oldSchemaClient }), [])
assert.equal(oldSchemaClient.calls, 1)

// L'éligibilité temporelle reste l'autorité avant le matching hors vue fiable.
const expired = toRetailPromotionViewModel({
  ...activeRaw,
  starts_at: "2026-08-01T00:00:00.000Z",
  ends_at: "2026-08-31T23:59:59.000Z",
  date_basis: "official",
  promotion_evidence: { kind: "catalog" },
}, { now: new Date("2026-09-05T12:00:00.000Z") })
assert.equal(expired.isActive, false)
assert.equal(findActivePromotionsForShoppingItems([shoppingItem()], [expired])[0].matchStatus, SHOPPING_PROMOTION_MATCH_STATUS.NONE)

const [page, hub, app, engine] = await Promise.all([
  read("src/pages/ShoppingListPage.jsx"),
  read("src/features/shopping/pages/ShoppingHubPage.jsx"),
  read("src/App.jsx"),
  read("src/features/shopping/services/shoppingEngine.ts"),
])
assert.match(page, /loadActiveRetailPromotions\(\{ client: supabase \}\)/)
assert.match(page, /includeProductIdentity: true/)
assert.match(page, /createAppSectionTarget\("goodDeals"/)
assert.match(page, /Voir le bon plan/)
assert.doesNotMatch(page, />\s*(?:confidence|matchMethod|fuzzy_name|observed_freshness)\s*</i)
assert.match(hub, /onNavigate=\{onNavigate\}/)
assert.match(app, /<ShoppingHubPage[\s\S]*onNavigate=\{handleNavChange\}/)
assert.equal((engine.match(/\.from\("receipt_items"\)/g) || []).length, 1, "Les identités doivent être chargées par lot")

console.log("Shopping promotion enrichment tests passed")
