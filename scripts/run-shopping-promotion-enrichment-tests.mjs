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
  buildShoppingPromotionDiagnostics,
  enrichShoppingBasketWithPromotions,
  resolveActiveRetailPromotionIdentity,
} from "../src/services/shoppingList/shoppingPromotionEnrichment.js"
import {
  buildShoppingListItemFromSuggestion,
  estimateShoppingList,
  getAutocompleteSuggestions,
} from "../src/services/shoppingList/shoppingListEngine.ts"

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

// A. Un produit historique valide ne disparaît plus parce qu'il est classé
// après les 80 produits les plus fréquents.
const largeHistory = Array.from({ length: 100 }, (_, index) => ({
  id: `frequent-${index}`,
  product_name: `Produit fréquent ${index}`,
  normalized_name: `produit frequent ${index}`,
  price: 100 - index / 10,
  created_at: "2026-09-01T12:00:00.000Z",
}))
largeHistory.push(
  {
    id: "emmental-history",
    product_name: "Emmental râpé 45 % MG, 200 g",
    normalized_name: "emmental rape 45 mg",
    price: 2.45,
    created_at: "2026-08-06T12:00:00.000Z",
  },
  {
    id: "extraterrestres-history",
    product_name: "EXTRATERRESTRES Goût Jambon Fromage 80G",
    normalized_name: "extraterrestres gout jambon fromage",
    price: 1.5,
    created_at: "2026-08-28T12:00:00.000Z",
  },
  {
    id: "flageolet-history",
    product_name: "Flageolet Vert 265gr",
    normalized_name: "flageolet vert",
    price: 3,
    created_at: "2026-08-28T12:00:00.000Z",
  },
)
const restoredPrices = estimateShoppingList([
  { id: "emmental", name: "Emmental râpé 45 % MG, 200 g" },
  { id: "extraterrestres", name: "EXTRATERRESTRES Goût Jambon Fromage 80G" },
  { id: "flageolet", name: "Flageolet Vert 265gr" },
], largeHistory)
assert.deepEqual(restoredPrices.items.map(item => item.lastKnownPrice), [2.45, 1.5, 3])
assert.deepEqual(restoredPrices.items.map(item => item.estimatedPrice), [2.45, 1.5, 3])

// B. La sélection d'une suggestion historique garde l'identité disponible.
const knownHistory = [{
  id: "known-history",
  product_name: "Produit historique connu 200 g",
  normalized_name: "produit historique connu",
  price: 2.4,
  price_per_unit: 12,
  market_product_id: "market-known",
  market_canonical_name: "Produit historique connu 200 g",
  market_brand: "Marque connue",
  market_package_format: "200 g",
  barcode: "3250390000018",
  quantity: 1,
  unit: "g",
  created_at: "2026-09-01T12:00:00.000Z",
}]
const knownSuggestion = getAutocompleteSuggestions("Produit historique", knownHistory)[0]
const preservedSuggestion = buildShoppingListItemFromSuggestion(knownSuggestion)
assert.equal(preservedSuggestion.market_product_id, "market-known")
assert.equal(preservedSuggestion.barcode, "3250390000018")
assert.equal(preservedSuggestion.brand, "Marque connue")
assert.equal(preservedSuggestion.package_format, "200 g")

const noodlePromotion = promotion({
  id: "leader-noodles",
  productId: "shopping-noodles-vegetables",
  marketProductId: "market-noodles-vegetables",
  productName: "Nouilles instantanées saveur légumes",
  normalizedProductName: "nouilles instantanees saveur legumes",
  barcode: null,
  brand: "KEE ZEN",
  packageFormat: "70 g",
  quantityValue: 70,
  quantityUnit: "g",
  retailerName: "Leader Price Réunion",
  promoPrice: 0.49,
  originalPrice: 0.74,
  unitPrice: 7,
})

// C/G. Un libellé retail exact et non ambigu reçoit l'identité publiée. Avec
// un prix utilisateur à 0,74 €, la promotion est fiable et l'économie vaut 0,25 €.
const identifiedNoodles = resolveActiveRetailPromotionIdentity(
  { id: "noodles", name: "Nouilles instantanées saveur légumes" },
  [noodlePromotion],
)
assert.equal(identifiedNoodles.shopping_product_id, "shopping-noodles-vegetables")
assert.equal(identifiedNoodles.market_product_id, "market-noodles-vegetables")
assert.equal(identifiedNoodles.package_format, "70 g")
const noodleHistory = [{
  product_name: "Nouilles instantanées saveur légumes",
  normalized_name: "nouilles instantanees saveur legumes",
  price: 0.74,
  price_per_unit: 10.57,
  market_product_id: "market-noodles-vegetables",
  market_package_format: "70 g",
  created_at: "2026-09-01T12:00:00.000Z",
}]
const noodleEstimate = estimateShoppingList([identifiedNoodles], noodleHistory)
const noodleBasket = enrichShoppingBasketWithPromotions({ estimate: noodleEstimate, promotions: [noodlePromotion] })
assert.equal(noodleBasket.items[0].promotionMatchStatus, SHOPPING_PROMOTION_MATCH_STATUS.RELIABLE)
assert.equal(noodleBasket.items[0].historicalPrice, 0.74)
assert.equal(noodleBasket.items[0].promotionPrice, 0.49)
assert.equal(noodleBasket.items[0].reliableSaving, 0.25)

// D. Même texte mais format explicitement différent : aucune économie fiable.
const wrongNoodleIdentity = resolveActiveRetailPromotionIdentity(
  { id: "wrong-noodles", name: "Nouilles instantanées saveur légumes 80 g", historicalPrice: 0.74 },
  [noodlePromotion],
)
assert.equal(wrongNoodleIdentity.market_product_id, undefined)
const wrongNoodleFormat = findActivePromotionsForShoppingItems([wrongNoodleIdentity], [noodlePromotion])[0]
assert.notEqual(wrongNoodleFormat.matchStatus, SHOPPING_PROMOTION_MATCH_STATUS.RELIABLE)
assert.equal(wrongNoodleFormat.reliableSaving, null)

// E. Une saisie libre inconnue ne reçoit aucune identité ni faux reliable.
const unknownItem = resolveActiveRetailPromotionIdentity({ name: "Savon totalement inconnu" }, [noodlePromotion])
assert.equal(unknownItem.market_product_id, undefined)
assert.equal(findActivePromotionsForShoppingItems([unknownItem], [noodlePromotion])[0].matchStatus, SHOPPING_PROMOTION_MATCH_STATUS.NONE)

// H. L'identité retail exacte suffit à afficher la promo, mais pas à inventer
// une économie lorsque l'utilisateur n'a aucun historique correspondant.
const noodleWithoutHistory = enrichShoppingBasketWithPromotions({
  estimate: estimateShoppingList([identifiedNoodles], []),
  promotions: [noodlePromotion],
})
assert.equal(noodleWithoutHistory.items[0].promotionMatchStatus, SHOPPING_PROMOTION_MATCH_STATUS.RELIABLE)
assert.equal(noodleWithoutHistory.items[0].historicalPrice, null)
assert.equal(noodleWithoutHistory.items[0].reliableSaving, null)

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
const batchClient = promotionClient({ data: [activeRaw, {
  ...activeRaw,
  id: "noodles-batch",
  product_id: "shopping-noodles-vegetables",
  market_product_id: "market-noodles-vegetables",
  product_name: "Nouilles instantanées saveur légumes",
}], error: null })
const batchPromotions = await loadActiveRetailPromotions({ client: batchClient })
enrichShoppingBasketWithPromotions({
  estimate: { items: [shoppingItem(), identifiedNoodles, unknownItem], total: 4.5 },
  promotions: batchPromotions,
})
assert.equal(batchClient.calls, 1, "Plusieurs lignes utilisent un seul chargement batch des promotions")
const oldSchemaClient = promotionClient({ data: null, error: { code: "PGRST205" } })
assert.deepEqual(await loadActiveRetailPromotions({ client: oldSchemaClient }), [])
assert.equal(oldSchemaClient.calls, 1)

const diagnostics = buildShoppingPromotionDiagnostics({ items: noodleBasket.items, promotions: [noodlePromotion] })
assert.deepEqual(diagnostics, {
  items: 1,
  historicalIdentities: 1,
  activePromotions: 1,
  reliableMatches: 1,
  suggestedMatches: 0,
  noMatches: 0,
  reliableSavings: 0.25,
})

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
assert.match(page, /onClick=\{\(\) => addItem\(s\)\}/)
assert.doesNotMatch(page, /addItem\(s\.label\)/)
assert.match(page, /console\.debug\("\[Shopping promotions\]"/)
assert.match(page, /createAppSectionTarget\("goodDeals"/)
assert.match(page, /Voir le bon plan/)
assert.doesNotMatch(page, />\s*(?:confidence|matchMethod|fuzzy_name|observed_freshness)\s*</i)
assert.match(hub, /onNavigate=\{onNavigate\}/)
assert.match(app, /<ShoppingHubPage[\s\S]*onNavigate=\{handleNavChange\}/)
assert.equal((engine.match(/\.from\("receipt_items"\)/g) || []).length, 1, "Les identités doivent être chargées par lot")

const shoppingListEngine = await read("src/services/shoppingList/shoppingListEngine.ts")
assert.doesNotMatch(shoppingListEngine, /buildTopProducts\(shoppingItems, 80\)/)

console.log("Shopping promotion enrichment tests passed")
