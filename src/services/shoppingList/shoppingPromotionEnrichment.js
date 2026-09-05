import {
  findActivePromotionsForShoppingItems,
  SHOPPING_PROMOTION_MATCH_STATUS,
} from "../retail/shoppingPromotionMatching.js"
import { normalizeProductName } from "../../features/shopping/services/normalizer.ts"
import { extractComparablePackage } from "../savings/savingsEngine.ts"

function moneyOrNull(value) {
  if (value === null || value === undefined || value === "") return null
  const number = Number(String(value).replace(",", "."))
  return Number.isFinite(number) ? number : null
}

function roundedMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
}

function promotionSnapshot(promotion) {
  if (!promotion) return null
  return {
    id: promotion.id || null,
    productId: promotion.productId || null,
    productName: promotion.productName || "",
    retailerName: promotion.retailerName || "",
    storeName: promotion.storeName || "",
    storeCity: promotion.storeCity || "",
    promoPrice: moneyOrNull(promotion.promoPrice),
    originalPrice: moneyOrNull(promotion.originalPrice),
    unitPrice: moneyOrNull(promotion.unitPrice),
    unitLabel: promotion.unitLabel || "",
    packageFormat: promotion.packageFormat || "",
    startsAt: promotion.startsAt || null,
    endsAt: promotion.endsAt || null,
    observedAt: promotion.observedAt || null,
    freshUntil: promotion.freshUntil || null,
    sourceUrl: promotion.sourceUrl || "",
    catalogId: promotion.catalogId || null,
    retailerSlug: promotion.retailerSlug || "",
    sourceType: promotion.sourceType || "",
  }
}

function structuredIdentity(item = {}) {
  return item.shopping_product_id || item.shoppingProductId || item.product_id ||
    item.market_product_id || item.marketProductId || item.barcode
}

function promotionIdentityKey(promotion = {}) {
  const productId = String(promotion.productId || "").trim()
  const marketProductId = String(promotion.marketProductId || "").trim()
  const barcode = String(promotion.barcode || "").trim()
  return productId || marketProductId || barcode
    ? `${productId}|${marketProductId}|${barcode}`
    : ""
}

function hasKnownFormat(promotion = {}) {
  return Boolean(
    String(promotion.packageFormat || "").trim() ||
    Number(promotion.quantityValue || 0) > 0 && String(promotion.quantityUnit || "").trim(),
  )
}

function hasExplicitPackageConflict(item = {}, promotion = {}) {
  const itemPackage = extractComparablePackage({
    product_name: [item.name || item.product_name, item.package_format || item.packageFormat].filter(Boolean).join(" "),
    quantity: item.quantity_value ?? item.quantityValue ?? item.quantity,
    unit: item.quantity_unit ?? item.quantityUnit ?? item.unit,
  })
  if (itemPackage.family === "unknown") return false

  const promotionPackage = extractComparablePackage({
    product_name: [promotion.productName, promotion.packageFormat].filter(Boolean).join(" "),
    quantity: promotion.quantityValue,
    unit: promotion.quantityUnit,
  })
  return promotionPackage.family === "unknown" || itemPackage.signature !== promotionPackage.signature
}

export function resolveActiveRetailPromotionIdentity(item = {}, promotions = []) {
  if (structuredIdentity(item)) return item

  const itemName = normalizeProductName(item.name || item.product_name || "")
  if (!itemName) return item

  const exactPromotions = (Array.isArray(promotions) ? promotions : []).filter(promotion =>
    promotion?.isActive === true &&
    promotion?.promotionProven === true &&
    hasKnownFormat(promotion) &&
    !hasExplicitPackageConflict(item, promotion) &&
    normalizeProductName(promotion.productName || "") === itemName,
  )
  const identities = new Set(exactPromotions.map(promotionIdentityKey).filter(Boolean))
  if (identities.size !== 1) return item

  const promotion = exactPromotions[0]
  return {
    ...item,
    shopping_product_id: promotion.productId || null,
    market_product_id: promotion.marketProductId || null,
    barcode: promotion.barcode || null,
    canonical_name: promotion.productName || item.name || "",
    brand: promotion.brand || item.brand || null,
    package_format: promotion.packageFormat || null,
    quantity_value: promotion.quantityValue ?? null,
    quantity_unit: promotion.quantityUnit || null,
    pack_count: promotion.packCount ?? null,
    normalized_product_name: itemName,
    controlled_normalization: true,
  }
}

export function buildShoppingPromotionDiagnostics({ items = [], promotions = [] } = {}) {
  const rows = Array.isArray(items) ? items : []
  const activePromotions = (Array.isArray(promotions) ? promotions : []).filter(promotion => promotion?.isActive)
  return {
    items: rows.length,
    historicalIdentities: rows.filter(structuredIdentity).length,
    activePromotions: activePromotions.length,
    reliableMatches: rows.filter(item => item.promotionMatchStatus === SHOPPING_PROMOTION_MATCH_STATUS.RELIABLE).length,
    suggestedMatches: rows.filter(item => item.promotionMatchStatus === SHOPPING_PROMOTION_MATCH_STATUS.SUGGESTED).length,
    noMatches: rows.filter(item => item.promotionMatchStatus === SHOPPING_PROMOTION_MATCH_STATUS.NONE).length,
    reliableSavings: roundedMoney(rows.reduce((sum, item) => sum + Math.max(0, moneyOrNull(item.reliableSaving) || 0), 0)),
  }
}

export function enrichShoppingBasketWithPromotions({ estimate = {}, promotions = [] } = {}) {
  const estimateItems = Array.isArray(estimate.items) ? estimate.items : []
  const matches = findActivePromotionsForShoppingItems(estimateItems, promotions)
  const items = estimateItems.map((item, index) => {
    const match = matches[index]
    const historicalPrice = moneyOrNull(item.historicalPrice)
    const promotionPrice = moneyOrNull(match?.promotion?.promoPrice)
    const reliablePromotion = match?.matchStatus === SHOPPING_PROMOTION_MATCH_STATUS.RELIABLE && promotionPrice !== null && promotionPrice > 0
    const reliableSaving = match?.reliableSaving ?? null
    const estimatedLineCost = reliablePromotion
      ? historicalPrice !== null && historicalPrice > 0
        ? Math.max(0, roundedMoney(historicalPrice - Math.max(0, moneyOrNull(reliableSaving) || 0)))
        : promotionPrice
      : historicalPrice !== null && historicalPrice > 0
        ? historicalPrice
        : null

    return {
      ...item,
      historicalPrice,
      promotionMatchStatus: match?.matchStatus || SHOPPING_PROMOTION_MATCH_STATUS.NONE,
      promotion: match?.promotion || null,
      promotionPrice,
      promotionAlternatives: match?.alternatives || [],
      promotionSuggestions: match?.suggestions || [],
      possibleSaving: match?.possibleSaving ?? null,
      reliableSaving,
      currentKnownPrice: estimatedLineCost,
      estimatedLineCost,
      estimatedPrice: estimatedLineCost,
      estimatedPriceSource: reliablePromotion && (historicalPrice === null || Number(reliableSaving || 0) > 0)
        ? "promotion"
        : estimatedLineCost !== null
          ? "historical"
          : "missing",
    }
  })

  const historicalBasketEstimate = Math.max(0, roundedMoney(estimate.total))
  const reliableSavingsTotal = Math.min(
    historicalBasketEstimate,
    roundedMoney(items.reduce((total, item) => {
      const saving = moneyOrNull(item.reliableSaving)
      return total + (saving !== null && saving > 0 ? saving : 0)
    }, 0)),
  )
  const reliablePromotionOnlyTotal = roundedMoney(items.reduce((total, item) => {
    if (item.historicalPrice !== null || item.promotionMatchStatus !== SHOPPING_PROMOTION_MATCH_STATUS.RELIABLE) return total
    return total + Math.max(0, moneyOrNull(item.promotionPrice) || 0)
  }, 0))
  const currentBasketEstimate = Math.max(
    0,
    roundedMoney(historicalBasketEstimate - reliableSavingsTotal + reliablePromotionOnlyTotal),
  )
  const missingPriceCount = items.filter(item => item.estimatedLineCost === null).length

  return {
    ...estimate,
    items,
    enrichedItems: items,
    total: currentBasketEstimate,
    min: currentBasketEstimate * 0.92,
    max: currentBasketEstimate * 1.08,
    missingPriceCount,
    historicalPriceMissingCount: items.filter(item => item.historicalPrice === null).length,
    promotionPricedItemCount: items.filter(item => item.estimatedPriceSource === "promotion").length,
    historicalBasketEstimate,
    reliableSavingsTotal,
    optimizedBasketEstimate: currentBasketEstimate,
  }
}

export function buildShoppingBasketSnapshotItems(items = []) {
  return (Array.isArray(items) ? items : []).map(item => {
    const historicalItem = { ...item }
    delete historicalItem.promotion
    delete historicalItem.promotionAlternatives
    delete historicalItem.promotionSuggestions

    return {
      ...historicalItem,
      promotionMatchStatus: item.promotionMatchStatus || SHOPPING_PROMOTION_MATCH_STATUS.NONE,
      possibleSaving: moneyOrNull(item.possibleSaving),
      reliableSaving: moneyOrNull(item.reliableSaving),
      promotionSnapshot: promotionSnapshot(item.promotion),
    }
  })
}
