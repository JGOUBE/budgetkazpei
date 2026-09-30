import { normalizeProductName } from "../../features/shopping/services/normalizer.ts"
import {
  evaluatePromotionPackageCompatibility,
  findActivePromotionsForShoppingItems,
  resolvePromotionIdentityMatch,
} from "../retail/shoppingPromotionMatching.js"
import { getShoppingListQuantity } from "./shoppingListItemModel.js"
import { areShoppingProductSemanticsCompatible } from "./shoppingProductCompatibility.js"

function moneyOrNull(value) {
  if (value === null || value === undefined || value === "") return null
  const number = Number(String(value).replace(",", "."))
  return Number.isFinite(number) ? number : null
}

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
}

function normalized(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function retailerKey(offer = {}) {
  return normalized(offer.retailerSlug || offer.retailerName || offer.storeName || "retailer")
}

function retailerLabel(offer = {}) {
  return String(offer.retailerName || offer.storeName || offer.retailerSlug || "Enseigne").trim()
}

function observedPriceReference(observed = {}) {
  const rawPrice = moneyOrNull(observed.price)
  const unitPrice = moneyOrNull(observed.unitPrice)
  const packageFormat = String(observed.packageFormat || "").trim()
  const quantityValue = moneyOrNull(observed.quantityValue)
  const quantityUnit = String(observed.quantityUnit || "").trim()
  const unitPriceUnit = String(observed.unitPriceUnit || "").trim().toLowerCase()

  if (packageFormat || (quantityValue !== null && quantityValue > 0 && quantityUnit)) {
    return rawPrice !== null && rawPrice > 0
      ? { value: rawPrice, unitLabel: "", kind: "package" }
      : null
  }

  if (unitPrice !== null && unitPrice > 0 && unitPriceUnit) {
    const unitLabel = ["kg", "g"].includes(unitPriceUnit) ? "€/kg"
      : ["l", "cl", "ml"].includes(unitPriceUnit) ? "€/l"
        : ""
    return unitLabel ? { value: unitPrice, unitLabel, kind: "unit" } : null
  }

  return null
}

function structuredIdentity(item = {}) {
  return String(
    item.shopping_product_id || item.shoppingProductId || item.product_id ||
    item.market_product_id || item.marketProductId || item.barcode || "",
  ).trim()
}

function brandsCompatible(item = {}, observed = {}) {
  const itemBrand = normalized(item.brand || item.market_brand)
  const observedBrand = normalized(observed.brand)
  return !(itemBrand && observedBrand && itemBrand !== observedBrand)
}

function observedMatchesItem(item = {}, observed = {}) {
  if (!areShoppingProductSemanticsCompatible(item, observed)) return false

  const comparableObserved = {
    ...observed,
    controlledNormalization: Boolean(
      observed.productId || observed.marketProductId || observed.barcode,
    ),
  }

  const identity = resolvePromotionIdentityMatch(item, comparableObserved)
  if (identity.conflict) return false

  const packageCompatibility = evaluatePromotionPackageCompatibility(item, comparableObserved)
  const strongIdentity = identity.matched &&
    ["shopping_product_id", "market_product_id", "barcode"].includes(identity.method)

  if (identity.matched && brandsCompatible(item, observed)) {
    return packageCompatibility.compatible ||
      (strongIdentity && packageCompatibility.reason === "package_identity_missing")
  }

  if (structuredIdentity(item)) return false
  if (!brandsCompatible(item, observed)) return false

  const itemName = normalizeProductName(item.name || item.product_name || "")
  const observedName = normalizeProductName(
    observed.normalizedProductName || observed.productName || "",
  )

  return Boolean(
    itemName &&
    observedName &&
    itemName === observedName &&
    packageCompatibility.compatible
  )
}

function observedCandidatesForItem(item, observedPrices = []) {
  return (Array.isArray(observedPrices) ? observedPrices : [])
    .filter(observed => observed?.isFresh === true)
    .filter(observed => observedMatchesItem(item, observed))
    .map(observed => {
      const reference = observedPriceReference(observed)
      if (!reference?.value) return null
      return {
        source: "observed",
        price: roundMoney(reference.value),
        unitLabel: reference.unitLabel || "",
        retailerSlug: observed.retailerSlug || "",
        retailerName: observed.retailerName || "",
        storeName: observed.storeName || "",
        storeCity: observed.storeCity || "",
        sourceUrl: observed.sourceUrl || "",
        observedAt: observed.lastSeenAt || observed.observedAt || null,
        observed,
      }
    })
    .filter(Boolean)
}

function promotionCandidatesForItem(item, promotions = []) {
  const match = findActivePromotionsForShoppingItems([item], promotions)[0]
  return (match?.promotions || [])
    .map(promotion => {
      const price = moneyOrNull(
        promotion.smartPriceValue ?? promotion.promoPrice ?? promotion.rawPromoPrice,
      )
      if (!(price > 0)) return null
      return {
        source: "promotion",
        price: roundMoney(price),
        unitLabel: String(promotion.smartPriceUnitLabel || promotion.promoPriceUnitLabel || ""),
        retailerSlug: promotion.retailerSlug || "",
        retailerName: promotion.retailerName || "",
        storeName: promotion.storeName || "",
        storeCity: promotion.storeCity || "",
        sourceUrl: promotion.sourceUrl || "",
        observedAt: promotion.observedAt || promotion.startsAt || null,
        promotion,
      }
    })
    .filter(Boolean)
}

function offerOrder(left, right) {
  return left.price - right.price ||
    Number(left.source !== "promotion") - Number(right.source !== "promotion") ||
    String(right.observedAt || "").localeCompare(String(left.observedAt || ""))
}

export function buildMultiRetailBasketOptimization({
  items = [],
  observedPrices = [],
  promotions = [],
} = {}) {
  const rows = (Array.isArray(items) ? items : []).map(item => {
    const listQuantity = getShoppingListQuantity(item)
    const baseline = moneyOrNull(item.estimatedLineCost ?? item.estimatedPrice)
    const baselineSource = String(item.estimatedPriceSource || item.priceSource || "").trim()

    const offers = [
      ...observedCandidatesForItem(item, observedPrices),
      ...promotionCandidatesForItem(item, promotions),
    ].map(offer => ({
      ...offer,
      unitPrice: offer.price,
      price: roundMoney(offer.price * listQuantity),
    })).sort(offerOrder)

    const bestRetailOffer = offers[0] || null
    const sameAsRetailBaseline = Boolean(
      bestRetailOffer &&
      baseline !== null &&
      roundMoney(bestRetailOffer.price) === roundMoney(baseline) &&
      ["retail_observed", "promotion"].includes(baselineSource)
    )

    const shouldUseRetailOffer = Boolean(
      bestRetailOffer &&
      (
        baseline === null ||
        baseline <= 0 ||
        bestRetailOffer.price < baseline ||
        sameAsRetailBaseline
      )
    )

    const selectedCost = shouldUseRetailOffer
      ? bestRetailOffer.price
      : baseline !== null && baseline > 0
        ? roundMoney(baseline)
        : bestRetailOffer?.price ?? null

    return {
      id: item.id || null,
      name: item.name || item.product_name || "",
      listQuantity,
      baselineCost: baseline !== null && baseline > 0 ? roundMoney(baseline) : null,
      selectedCost,
      bestRetailOffer,
      retailOfferCount: offers.length,
      hasReliableRetailOffer: Boolean(bestRetailOffer),
      selectedRetailOffer: shouldUseRetailOffer ? bestRetailOffer : null,
      missingPrice: selectedCost === null,
    }
  })

  const currentEstimate = roundMoney(rows.reduce(
    (sum, row) => sum + Math.max(0, row.baselineCost || 0),
    0,
  ))
  const optimizedTotal = roundMoney(rows.reduce(
    (sum, row) => sum + Math.max(0, row.selectedCost || 0),
    0,
  ))
  const potentialSaving = roundMoney(Math.max(0, currentEstimate - optimizedTotal))

  const retailerMap = new Map()
  for (const row of rows) {
    const offer = row.selectedRetailOffer
    if (!offer) continue

    const key = retailerKey(offer)
    const current = retailerMap.get(key) || {
      retailerKey: key,
      retailerName: retailerLabel(offer),
      itemCount: 0,
      subtotal: 0,
      items: [],
    }

    current.itemCount += 1
    current.subtotal = roundMoney(current.subtotal + offer.price)
    current.items.push({
      id: row.id,
      name: row.name,
      price: offer.price,
      unitPrice: offer.unitPrice,
      listQuantity: row.listQuantity,
      source: offer.source,
      storeName: offer.storeName || "",
      storeCity: offer.storeCity || "",
    })
    retailerMap.set(key, current)
  }

  const retailerBreakdown = [...retailerMap.values()]
    .sort((left, right) =>
      right.itemCount - left.itemCount ||
      left.subtotal - right.subtotal ||
      left.retailerName.localeCompare(right.retailerName, "fr"),
    )

  const retailOfferMatchedCount = rows.filter(row => row.hasReliableRetailOffer).length
  const selectedRetailOfferCount = rows.filter(row => row.selectedRetailOffer).length
  const missingPriceCount = rows.filter(row => row.missingPrice).length
  const pricedItemCount = rows.length - missingPriceCount

  return {
    items: rows,
    currentEstimate,
    optimizedTotal,
    potentialSaving,
    totalItems: rows.length,
    retailOfferMatchedCount,
    selectedRetailOfferCount,
    missingPriceCount,
    pricedItemCount,
    completePriceCoverage: rows.length > 0 && missingPriceCount === 0,
    retailerBreakdown,
    retailerCount: retailerBreakdown.length,
    splitAcrossRetailers: retailerBreakdown.length > 1,
  }
}
