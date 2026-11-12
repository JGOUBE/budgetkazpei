import { evaluateSavingsProductEligibility, extractComparablePackage } from "../../../services/savings/savingsEngine.ts"
import { normalizeMerchantName } from "./priceHistory.ts"
import { formatSharedPriceRetailer } from "../../../services/shoppingList/sharedPricePresentation.js"

const DEFAULT_MAX_AGE_DAYS = 150
const MIN_SAVING = 0.10

function clean(value = "") {
  return String(value ?? "").trim()
}

function normalize(value = "") {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/œ/gi, "oe")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function positive(value) {
  const amount = Number(String(value ?? "").replace(",", "."))
  return Number.isFinite(amount) && amount > 0 ? amount : 0
}

function cents(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function dateTime(value, now) {
  if (!value) return 0
  const time = new Date(value).getTime()
  return Number.isFinite(time) && time > 0 && time <= now ? time : 0
}

function purchaseLabel(item) {
  return clean(item.product_name || item.corrected_name || item.normalized_name)
}

function groupingKey(item) {
  const id = clean(item.market_product_id)
  const barcode = clean(item.barcode)
  const shoppingId = clean(item.shopping_product_id || item.product_id)
  if (id) return "market:" + id
  if (shoppingId) return "shopping:" + shoppingId
  if (/^\d{8,14}$/.test(barcode)) return "ean:" + barcode
  const label = normalize(purchaseLabel(item))
  return label ? "name:" + label : ""
}

function receiptVisit(item) {
  return clean(item.receipt_id || item.transaction_id || item.created_at?.slice(0, 10))
}

function knownPackage(item = {}) {
  const base = extractComparablePackage(item)
  if (base.family !== "unknown") return base
  // The usual parser recognises "lot de 10", while many receipts simply
  // identify the pack as "x10". Treat it as a count only, never as mass.
  const name = clean(item.product_name || item.corrected_name || item.name)
  const xPack = name.match(/(?:^|\s)[x×]\s*(\d{1,2})(?=\s|$)/i)
  const count = Number(xPack?.[1] || 0)
  if (count >= 2 && count <= 48) {
    return { family: "count", baseAmount: count, signature: "count:" + count, unitLabel: "€/unité" }
  }
  return base
}

function purchaseFormat(item) {
  return knownPackage(item)
}

function equivalentFormat(a, b) {
  return a?.family !== "unknown" &&
    b?.family !== "unknown" &&
    a.family === b.family &&
    Number.isFinite(a.baseAmount) &&
    Number.isFinite(b.baseAmount) &&
    Math.abs(a.baseAmount - b.baseAmount) < 0.0001
}

function safelyParseFormat(productName, formatLabel = "", fallback = {}) {
  const fromName = knownPackage({ product_name: productName })
  // Existing catalogue size labels can contain "1. kg". Normalize this
  // typography, without altering the product's source description.
  const cleanedSize = clean(formatLabel).replace(/(\d)\.\s*(kg|g|l|cl|ml)\b/gi, "$1 $2")
  const fromFormat = knownPackage({
    product_name: cleanedSize,
    ...fallback,
  })
  const knownName = fromName.family !== "unknown"
  const knownFormat = fromFormat.family !== "unknown"
  if (knownName && knownFormat && !equivalentFormat(fromName, fromFormat)) {
    return { family: "unknown", signature: "conflicting_format", baseAmount: 0, unitLabel: "" }
  }
  return knownName ? fromName : fromFormat
}

function publishedFormat(product) {
  return safelyParseFormat(product.display_name, product.size_label)
}

function retailerName(value) {
  const label = normalizeMerchantName(value)
  return label === "Magasin non renseigne" ? "" : label
}

function brandMatches(purchase, offerBrand) {
  const a = normalize(purchase.market_brand || purchase.brand)
  const b = normalize(offerBrand)
  return !a || !b || a === b
}

function identityMatches(purchase, candidate) {
  const purchaseMarketId = clean(purchase.market_product_id)
  const purchaseShoppingId = clean(purchase.shopping_product_id || purchase.product_id)
  const purchaseEAN = clean(purchase.barcode)
  const candidateMarketId = clean(candidate.marketProductId)
  const candidateShoppingId = clean(candidate.shoppingProductId)
  const candidateEAN = clean(candidate.barcode)
  if (purchaseMarketId && candidateMarketId && purchaseMarketId !== candidateMarketId) return false
  if (purchaseShoppingId && candidateShoppingId && purchaseShoppingId !== candidateShoppingId) return false
  if (/^\d{8,14}$/.test(purchaseEAN) && /^\d{8,14}$/.test(candidateEAN) && purchaseEAN !== candidateEAN) return false
  if (!brandMatches(purchase, candidate.brand)) return false

  const sameStrongId =
    Boolean(purchaseMarketId && candidateMarketId && purchaseMarketId === candidateMarketId) ||
    Boolean(purchaseShoppingId && candidateShoppingId && purchaseShoppingId === candidateShoppingId) ||
    Boolean(/^\d{8,14}$/.test(purchaseEAN) && purchaseEAN === candidateEAN)
  if (sameStrongId) return true

  // No approximate matching: the whole corrected name must be identical.
  // Generic product families (e.g. "farine" or "lait") are not an identity.
  const purchaseName = normalize(purchaseLabel(purchase))
  const candidateName = normalize(candidate.productName)
  return purchaseName.split(" ").length >= 2 && purchaseName === candidateName
}

function sameVerifiedFormat(purchase, candidate) {
  return equivalentFormat(purchaseFormat(purchase), candidate.packageInfo)
}

function safeReferencePurchase(rows, now) {
  return rows
    .filter(row => dateTime(row.purchase_date || row.created_at, now))
    .sort((a, b) =>
      dateTime(b.purchase_date || b.created_at, now) - dateTime(a.purchase_date || a.created_at, now),
    )[0] || null
}

function sharedOfferForObservation(row, product) {
  const retailer = retailerName(row.retailer_slug)
  return {
    price: positive(row.price),
    observedAt: row.observed_at,
    retailer,
    retailerLabel: formatSharedPriceRetailer(row),
    productName: product.display_name,
    brand: product.brand,
    barcode: product.barcode,
    shoppingProductId: product.id,
    packageInfo: publishedFormat(product),
    source: "regional_shared",
  }
}

function retailOffer(row) {
  const retailer = retailerName(row.retailerSlug || row.retailerName)
  const city = clean(row.storeCity)
  const name = clean(row.storeName || row.retailerName || row.retailerSlug)
  return {
    price: positive(row.price),
    observedAt: row.observedAt,
    retailer,
    retailerLabel: [name, city].filter(Boolean).join(" · ") || retailer,
    productName: row.productName,
    brand: row.brand,
    barcode: row.barcode,
    marketProductId: row.marketProductId,
    shoppingProductId: row.productId,
    packageInfo: safelyParseFormat(row.productName, row.packageFormat, {
      package_quantity: row.totalQuantityValue ?? row.quantityValue,
      unit: row.totalQuantityUnit ?? row.quantityUnit,
    }),
    source: "regional_retail",
  }
}

/**
 * Observed lower regional prices for products bought on at least two separate
 * receipts. Comparisons use the last PERSONAL pack price, not a projected
 * annual spend nor an unrelated product/pack. All dates are historical.
 */
export function buildRegionalHabitPriceSuggestions({
  shoppingItems = [],
  sharedProducts = [],
  sharedPrices = [],
  retailPrices = [],
  now = Date.now(),
  maxAgeDays = DEFAULT_MAX_AGE_DAYS,
} = {}) {
  const referenceNow = typeof now === "number" ? now : new Date(now).getTime()
  if (!Number.isFinite(referenceNow)) return []
  const cutoff = referenceNow - Math.max(0, maxAgeDays) * 86400000
  const productById = new Map(
    (Array.isArray(sharedProducts) ? sharedProducts : [])
      .filter(product => product?.id && product?.display_name)
      .map(product => [product.id, product]),
  )
  const offers = [
    ...(Array.isArray(sharedPrices) ? sharedPrices : [])
      .filter(row => row?.product_id && productById.has(row.product_id))
      .map(row => sharedOfferForObservation(row, productById.get(row.product_id))),
    ...(Array.isArray(retailPrices) ? retailPrices : []).map(retailOffer),
  ].filter(offer =>
    offer.price > 0 &&
    offer.retailer &&
    dateTime(offer.observedAt, referenceNow) >= cutoff &&
    offer.packageInfo.family !== "unknown",
  )
  if (!offers.length) return []

  const groups = new Map()
  for (const row of Array.isArray(shoppingItems) ? shoppingItems : []) {
    if (!evaluateSavingsProductEligibility(row).eligible || !positive(row.price)) continue
    if (!purchaseLabel(row) || !receiptVisit(row)) continue
    if (purchaseFormat(row).family === "unknown") continue
    const key = groupingKey(row)
    if (!key) continue
    const members = groups.get(key) || []
    members.push(row)
    groups.set(key, members)
  }

  const suggestions = []
  for (const rows of groups.values()) {
    if (new Set(rows.map(receiptVisit)).size < 2) continue
    const reference = safeReferencePurchase(rows, referenceNow)
    if (!reference || !positive(reference.price)) continue
    const sourceStore = retailerName(reference.store)
    if (!sourceStore) continue
    // A multi-pack purchase line is sometimes the sum of several packages.
    // Without a distinct pack price it cannot be compared to one catalogue pack.
    const quantity = Number(reference.quantity || 1)
    const unit = normalize(reference.unit)
    if (quantity > 1 && ["piece", "pieces", "unite", "unites"].includes(unit)) continue

    // Compare only the newest known price at each retailer/outlet, never the
    // cheapest price from an arbitrary year-old observation.
    const byOutlet = new Map()
    for (const offer of offers) {
      if (offer.retailer === sourceStore) continue
      if (!identityMatches(reference, offer) || !sameVerifiedFormat(reference, offer)) continue
      const key = offer.retailer + "|" + normalize(offer.retailerLabel)
      const current = byOutlet.get(key)
      const candidateTime = dateTime(offer.observedAt, referenceNow)
      const previousTime = dateTime(current?.observedAt, referenceNow)
      if (!current || candidateTime > previousTime) {
        byOutlet.set(key, offer)
      } else if (candidateTime === previousTime && Math.abs(offer.price - current.price) > 0.01) {
        // A single outlet with contradictory prices for the same date is not
        // dependable enough to advertise as a cheaper alternative.
        byOutlet.set(key, { ...current, ambiguousPrice: true })
      }
    }

    const options = [...byOutlet.values()]
      .filter(offer => !offer.ambiguousPrice)
      .filter(offer => positive(reference.price) - offer.price >= MIN_SAVING)
      .sort((a, b) => a.price - b.price || dateTime(b.observedAt, referenceNow) - dateTime(a.observedAt, referenceNow))
    const best = options[0]
    if (!best) continue

    suggestions.push({
      type: "regionalPrice",
      key: "regional:" + groupingKey(reference),
      product: purchaseLabel(reference),
      purchaseCount: rows.length,
      receiptCount: new Set(rows.map(receiptVisit)).size,
      referenceStore: sourceStore,
      referencePrice: cents(positive(reference.price)),
      referenceDate: reference.purchase_date || reference.created_at,
      alternativeStore: best.retailerLabel || best.retailer,
      alternativePrice: cents(best.price),
      observedAt: best.observedAt,
      saving: cents(positive(reference.price) - best.price),
      source: best.source,
    })
  }

  return suggestions.sort((a, b) =>
    b.saving - a.saving || b.receiptCount - a.receiptCount || a.product.localeCompare(b.product, "fr"),
  ).slice(0, 3)
}
