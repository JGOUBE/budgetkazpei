import {
  findActivePromotionsForShoppingItems,
  SHOPPING_PROMOTION_MATCH_STATUS,
} from "../retail/shoppingPromotionMatching.js"

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
  }
}

export function enrichShoppingBasketWithPromotions({ estimate = {}, promotions = [] } = {}) {
  const estimateItems = Array.isArray(estimate.items) ? estimate.items : []
  const matches = findActivePromotionsForShoppingItems(estimateItems, promotions)
  const items = estimateItems.map((item, index) => {
    const match = matches[index]
    return {
      ...item,
      promotionMatchStatus: match?.matchStatus || SHOPPING_PROMOTION_MATCH_STATUS.NONE,
      promotion: match?.promotion || null,
      promotionPrice: moneyOrNull(match?.promotion?.promoPrice),
      promotionAlternatives: match?.alternatives || [],
      promotionSuggestions: match?.suggestions || [],
      possibleSaving: match?.possibleSaving ?? null,
      reliableSaving: match?.reliableSaving ?? null,
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
  const optimizedBasketEstimate = Math.max(
    0,
    roundedMoney(historicalBasketEstimate - reliableSavingsTotal),
  )

  return {
    ...estimate,
    items,
    enrichedItems: items,
    historicalBasketEstimate,
    reliableSavingsTotal,
    optimizedBasketEstimate,
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
