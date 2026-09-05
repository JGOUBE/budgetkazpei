import { normalizeProductName } from "../../features/shopping/services/normalizer.ts"
import { extractComparablePackage } from "../savings/savingsEngine.ts"

export const SHOPPING_PROMOTION_MATCH_STATUS = Object.freeze({
  RELIABLE: "reliable",
  SUGGESTED: "suggested",
  NONE: "none",
})

const IDENTITY_CONFIDENCE = Object.freeze({
  shopping_product_id: 1,
  market_product_id: 1,
  barcode: 0.98,
  validated_alias: 0.9,
  controlled_normalized_name: 0.75,
  fuzzy_name: 0.5,
})

const IDENTITY_PRIORITY = Object.freeze({
  shopping_product_id: 1,
  market_product_id: 2,
  barcode: 3,
  validated_alias: 4,
  controlled_normalized_name: 5,
  fuzzy_name: 6,
})

const STRONG_PACKAGE_IDENTITIES = new Set([
  "shopping_product_id",
  "market_product_id",
  "barcode",
])

function clean(value) {
  return String(value || "").trim()
}

function normalized(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function normalizedProduct(value) {
  return normalized(normalizeProductName(value))
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null
  const number = Number(String(value).replace(",", "."))
  return Number.isFinite(number) ? number : null
}

function itemProductName(item = {}) {
  return item.normalized_product_name || item.normalized_name || item.product_name || item.name || ""
}

function promotionProductName(promotion = {}) {
  return promotion.normalizedProductName || promotion.productName || ""
}

function comparablePackageInput(item = {}) {
  const label = [
    item.product_name || item.productName || item.name,
    item.package_format || item.packageFormat || item.market_package_format,
  ].filter(Boolean).join(" ")

  return {
    ...item,
    product_name: label,
    quantity: item.totalQuantityValue ?? item.quantityValue ?? item.quantity,
    unit: item.totalQuantityUnit ?? item.quantityUnit ?? item.unit,
    package_quantity: item.totalQuantityValue ?? item.quantityValue ?? item.package_quantity,
  }
}

function explicitPackCount(item = {}) {
  const direct = numberOrNull(item.packCount ?? item.pack_count)
  if (direct && direct > 0) return direct
  const label = [
    item.product_name || item.productName || item.name,
    item.package_format || item.packageFormat || item.market_package_format,
  ].filter(Boolean).join(" ")
  const match = label.match(/\b(?:lot|pack)\s*(?:de\s*)?(\d+)\b|\b(\d+)\s*(?:x|pcs?|pieces?|unit[eé]s?)\b/i)
  return match ? numberOrNull(match[1] || match[2]) : null
}

function brandCompatibility(item = {}, promotion = {}) {
  const itemBrand = normalized(item.market_brand || item.brand)
  const promotionBrand = normalized(promotion.brand)
  if (itemBrand && promotionBrand && itemBrand !== promotionBrand) {
    return { compatible: false, needsReview: true, reason: "brand_mismatch" }
  }
  return { compatible: true, needsReview: false }
}

export function evaluatePromotionPackageCompatibility(item = {}, promotion = {}) {
  const shoppingPackCount = explicitPackCount(item)
  const retailPackCount = explicitPackCount(promotion)
  if (shoppingPackCount && retailPackCount && shoppingPackCount !== retailPackCount) {
    return { compatible: false, needsReview: true, reason: "pack_count_mismatch" }
  }
  if (((shoppingPackCount || 1) > 1) !== ((retailPackCount || 1) > 1)) {
    return { compatible: false, needsReview: true, reason: "pack_count_unknown_or_mismatch" }
  }

  const shoppingPackage = extractComparablePackage(comparablePackageInput(item))
  const retailPackage = extractComparablePackage(comparablePackageInput(promotion))

  if (shoppingPackage.family === "unknown" || retailPackage.family === "unknown") {
    return { compatible: false, needsReview: true, reason: "package_identity_missing" }
  }

  if (shoppingPackage.family !== retailPackage.family) {
    return { compatible: false, needsReview: true, reason: "package_family_mismatch" }
  }

  if (shoppingPackage.signature === retailPackage.signature) {
    return {
      compatible: true,
      needsReview: false,
      normalizedComparison: false,
      shoppingPackage,
      retailPackage,
    }
  }

  const historicalUnitPrice = numberOrNull(item.price_per_unit ?? item.unit_price)
  const promotionUnitPrice = numberOrNull(promotion.unitPrice)
  if (
    historicalUnitPrice !== null && historicalUnitPrice > 0 &&
    promotionUnitPrice !== null && promotionUnitPrice > 0 &&
    shoppingPackage.baseAmount > 0
  ) {
    return {
      compatible: true,
      needsReview: false,
      normalizedComparison: true,
      shoppingPackage,
      retailPackage,
    }
  }

  return { compatible: false, needsReview: true, reason: "package_size_mismatch" }
}

export function resolvePromotionIdentityMatch(item = {}, promotion = {}) {
  const shoppingProductId = clean(item.shopping_product_id || item.shoppingProductId || item.product_id)
  const promotionProductId = clean(promotion.productId)
  if (shoppingProductId && promotionProductId) {
    if (shoppingProductId === promotionProductId) {
      return { matched: true, method: "shopping_product_id", confidence: IDENTITY_CONFIDENCE.shopping_product_id }
    }
    return { matched: false, conflict: true, method: "shopping_product_id", confidence: 0 }
  }

  const marketProductId = clean(item.market_product_id || item.marketProductId)
  const promotionMarketProductId = clean(promotion.marketProductId)
  if (marketProductId && promotionMarketProductId) {
    if (marketProductId === promotionMarketProductId) {
      return { matched: true, method: "market_product_id", confidence: IDENTITY_CONFIDENCE.market_product_id }
    }
    return { matched: false, conflict: true, method: "market_product_id", confidence: 0 }
  }

  const barcode = clean(item.barcode || item.ean || item.gtin)
  const promotionBarcode = clean(promotion.barcode)
  if (/^\d{8,14}$/.test(barcode) && /^\d{8,14}$/.test(promotionBarcode)) {
    if (barcode === promotionBarcode) {
      return { matched: true, method: "barcode", confidence: IDENTITY_CONFIDENCE.barcode }
    }
    return { matched: false, conflict: true, method: "barcode", confidence: 0 }
  }

  const alias = normalized(item.validated_product_alias || item.validatedAlias)
  const promotionAliases = (promotion.validatedAliases || []).map(normalized)
  if (item.alias_validated === true && alias && promotionAliases.includes(alias)) {
    return { matched: true, method: "validated_alias", confidence: IDENTITY_CONFIDENCE.validated_alias }
  }

  const itemName = normalizedProduct(itemProductName(item))
  const promotionName = normalizedProduct(promotionProductName(promotion))
  if (
    item.controlled_normalization === true &&
    promotion.controlledNormalization === true &&
    itemName &&
    itemName === promotionName
  ) {
    return {
      matched: true,
      method: "controlled_normalized_name",
      confidence: IDENTITY_CONFIDENCE.controlled_normalized_name,
    }
  }

  return { matched: false, conflict: false, method: "none", confidence: 0 }
}

function fuzzyNameScore(item = {}, promotion = {}) {
  const itemTokens = new Set(normalizedProduct(itemProductName(item)).split(" ").filter(Boolean))
  const promotionTokens = new Set(normalizedProduct(promotionProductName(promotion)).split(" ").filter(Boolean))
  if (itemTokens.size === 0 || promotionTokens.size === 0) return 0
  const common = [...itemTokens].filter(token => promotionTokens.has(token)).length
  if (common === 0) return 0
  return common / Math.max(itemTokens.size, promotionTokens.size)
}

function savingsFor(item, promotion, compatibility, reliable) {
  const historicalPrice = numberOrNull(
    item.historicalPrice ?? item.estimatedPrice ?? item.estimated_price ?? item.price,
  )
  const promotionPrice = numberOrNull(promotion.promoPrice)

  if (historicalPrice === null || historicalPrice <= 0 || promotionPrice === null || promotionPrice <= 0) {
    return { historicalPrice, promotionPrice, possibleSaving: null, reliableSaving: null }
  }

  if (!compatibility.compatible) {
    return { historicalPrice, promotionPrice, possibleSaving: null, reliableSaving: null }
  }

  let saving = historicalPrice - promotionPrice
  if (compatibility.normalizedComparison) {
    const historicalUnitPrice = numberOrNull(item.price_per_unit ?? item.unit_price)
    const promotionUnitPrice = numberOrNull(promotion.unitPrice)
    saving = (historicalUnitPrice - promotionUnitPrice) * compatibility.shoppingPackage.baseAmount
  }

  const rounded = Math.max(0, Math.round((saving + Number.EPSILON) * 100) / 100)
  return {
    historicalPrice,
    promotionPrice,
    possibleSaving: rounded,
    reliableSaving: reliable ? rounded : null,
  }
}

function candidateFrom(item, promotion, identity, compatibility, reliable) {
  return {
    ...promotion,
    matchMethod: identity.method,
    confidence: identity.confidence,
    identityPriority: IDENTITY_PRIORITY[identity.method] || 99,
    packageCompatibility: compatibility,
    ...savingsFor(item, promotion, compatibility, reliable),
  }
}

function sortCandidates(left, right) {
  return left.identityPriority - right.identityPriority ||
    Number(Boolean(left.packageCompatibility?.normalizedComparison)) - Number(Boolean(right.packageCompatibility?.normalizedComparison)) ||
    (right.reliableSaving ?? right.possibleSaving ?? -1) - (left.reliableSaving ?? left.possibleSaving ?? -1) ||
    (left.unitPrice ?? left.promoPrice ?? Number.POSITIVE_INFINITY) -
      (right.unitPrice ?? right.promoPrice ?? Number.POSITIVE_INFINITY)
}

export function findActivePromotionsForShoppingItems(shoppingItems = [], promotions = []) {
  return (Array.isArray(shoppingItems) ? shoppingItems : []).map(shoppingItem => {
    const reliable = []
    const suggested = []

    for (const promotion of Array.isArray(promotions) ? promotions : []) {
      if (!promotion?.isActive || !promotion?.promotionProven) continue

      const identity = resolvePromotionIdentityMatch(shoppingItem, promotion)
      if (identity.conflict) continue

      const brand = brandCompatibility(shoppingItem, promotion)
      const packageCompatibility = evaluatePromotionPackageCompatibility(shoppingItem, promotion)
      const strongIdentityCanProveUnknownPackage = identity.matched &&
        STRONG_PACKAGE_IDENTITIES.has(identity.method) &&
        packageCompatibility.reason === "package_identity_missing"
      const effectiveCompatibility = strongIdentityCanProveUnknownPackage
        ? { compatible: true, needsReview: false, normalizedComparison: false, guaranteedByIdentity: true }
        : packageCompatibility

      if (identity.matched && brand.compatible && effectiveCompatibility.compatible) {
        reliable.push(candidateFrom(shoppingItem, promotion, identity, effectiveCompatibility, true))
        continue
      }

      const fuzzyScore = identity.matched ? 1 : fuzzyNameScore(shoppingItem, promotion)
      if (fuzzyScore < 0.5) continue
      const suggestionIdentity = identity.matched
        ? identity
        : { matched: false, method: "fuzzy_name", confidence: IDENTITY_CONFIDENCE.fuzzy_name * fuzzyScore }
      suggested.push(candidateFrom(
        shoppingItem,
        promotion,
        suggestionIdentity,
        brand.compatible ? packageCompatibility : brand,
        false,
      ))
    }

    reliable.sort(sortCandidates)
    suggested.sort(sortCandidates)
    const bestPromotion = reliable[0] || null
    const suggestedPromotion = suggested[0] || null
    const matchStatus = bestPromotion
      ? SHOPPING_PROMOTION_MATCH_STATUS.RELIABLE
      : suggestedPromotion
        ? SHOPPING_PROMOTION_MATCH_STATUS.SUGGESTED
        : SHOPPING_PROMOTION_MATCH_STATUS.NONE
    const displayedPromotion = bestPromotion || suggestedPromotion

    return {
      shoppingItem,
      matchedProductId: bestPromotion?.productId || bestPromotion?.marketProductId || null,
      matchStatus,
      promotion: displayedPromotion,
      promotions: reliable,
      alternatives: reliable.slice(1),
      suggestions: suggested,
      bestPromotion,
      suggestedPromotion,
      possibleSaving: displayedPromotion?.possibleSaving ?? null,
      reliableSaving: bestPromotion?.reliableSaving ?? null,
      confidence: displayedPromotion?.confidence ?? 0,
      needsReview: suggested,
    }
  })
}
