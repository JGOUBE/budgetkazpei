import { extractComparablePackage } from "../savings/savingsEngine.ts"

const IDENTITY_CONFIDENCE = Object.freeze({
  shopping_product_id: 1,
  market_product_id: 1,
  barcode: 0.98,
  validated_alias: 0.9,
  controlled_normalized_name: 0.75,
})

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

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null
  const number = Number(String(value).replace(",", "."))
  return Number.isFinite(number) ? number : null
}

function promotionPackageInput(promotion = {}) {
  return {
    product_name: promotion.productName,
    quantity: promotion.totalQuantityValue ?? promotion.quantityValue,
    unit: promotion.totalQuantityUnit ?? promotion.quantityUnit,
    package_quantity: promotion.totalQuantityValue ?? promotion.quantityValue,
  }
}

function resolveIdentityMatch(item = {}, promotion = {}) {
  const shoppingProductId = clean(item.shopping_product_id || item.shoppingProductId || item.product_id)
  if (shoppingProductId && shoppingProductId === clean(promotion.productId)) {
    return { matched: true, method: "shopping_product_id", confidence: IDENTITY_CONFIDENCE.shopping_product_id }
  }

  const marketProductId = clean(item.market_product_id || item.marketProductId)
  if (marketProductId && marketProductId === clean(promotion.marketProductId)) {
    return { matched: true, method: "market_product_id", confidence: IDENTITY_CONFIDENCE.market_product_id }
  }

  const barcode = clean(item.barcode || item.ean || item.gtin)
  if (/^\d{8,14}$/.test(barcode) && barcode === clean(promotion.barcode)) {
    return { matched: true, method: "barcode", confidence: IDENTITY_CONFIDENCE.barcode }
  }

  const alias = normalized(item.validated_product_alias || item.validatedAlias)
  const promotionAliases = (promotion.validatedAliases || []).map(normalized)
  if (item.alias_validated === true && alias && promotionAliases.includes(alias)) {
    return { matched: true, method: "validated_alias", confidence: IDENTITY_CONFIDENCE.validated_alias }
  }

  const itemName = normalized(item.normalized_product_name || item.normalized_name)
  const promotionName = normalized(promotion.normalizedProductName)
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

  return { matched: false, method: "none", confidence: 0 }
}

export function evaluatePromotionPackageCompatibility(item = {}, promotion = {}) {
  const shoppingPackage = extractComparablePackage(item)
  const retailPackage = extractComparablePackage(promotionPackageInput(promotion))

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
  if (historicalUnitPrice && promotionUnitPrice && shoppingPackage.baseAmount > 0) {
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

function savingsFor(item, promotion, compatibility) {
  const historicalPrice = numberOrNull(
    item.historicalPrice ?? item.estimatedPrice ?? item.estimated_price ?? item.price,
  )
  const currentPromotionPrice = numberOrNull(promotion.promoPrice)

  if (historicalPrice === null || currentPromotionPrice === null) {
    return { historicalPrice, currentPromotionPrice, possibleSaving: null, reliableSaving: null }
  }

  let possibleSaving = historicalPrice - currentPromotionPrice
  if (compatibility.normalizedComparison) {
    const historicalUnitPrice = numberOrNull(item.price_per_unit ?? item.unit_price)
    const promotionUnitPrice = numberOrNull(promotion.unitPrice)
    possibleSaving = (historicalUnitPrice - promotionUnitPrice) * compatibility.shoppingPackage.baseAmount
  }

  const rounded = Math.max(0, Math.round((possibleSaving + Number.EPSILON) * 100) / 100)
  return {
    historicalPrice,
    currentPromotionPrice,
    possibleSaving: rounded,
    reliableSaving: rounded,
  }
}

export function findActivePromotionsForShoppingItems(
  shoppingItems = [],
  promotions = [],
) {
  return (Array.isArray(shoppingItems) ? shoppingItems : []).map(shoppingItem => {
    const matches = []
    const needsReview = []

    for (const promotion of Array.isArray(promotions) ? promotions : []) {
      if (!promotion?.isActive || !promotion?.promotionProven) continue

      const identity = resolveIdentityMatch(shoppingItem, promotion)
      if (!identity.matched) continue

      const packageCompatibility = evaluatePromotionPackageCompatibility(shoppingItem, promotion)
      if (!packageCompatibility.compatible) {
        needsReview.push({ promotion, identity, packageCompatibility })
        continue
      }

      matches.push({
        ...promotion,
        matchMethod: identity.method,
        confidence: identity.confidence,
        packageCompatibility,
        ...savingsFor(shoppingItem, promotion, packageCompatibility),
      })
    }

    matches.sort((left, right) =>
      (right.reliableSaving ?? -1) - (left.reliableSaving ?? -1) ||
      (left.promoPrice ?? Number.POSITIVE_INFINITY) - (right.promoPrice ?? Number.POSITIVE_INFINITY),
    )

    const bestPromotion = matches[0] || null
    return {
      shoppingItem,
      matchedProductId: bestPromotion?.productId || bestPromotion?.marketProductId || null,
      promotions: matches,
      bestPromotion,
      possibleSaving: bestPromotion?.possibleSaving ?? null,
      reliableSaving: bestPromotion?.reliableSaving ?? null,
      confidence: bestPromotion?.confidence ?? 0,
      needsReview,
    }
  })
}

