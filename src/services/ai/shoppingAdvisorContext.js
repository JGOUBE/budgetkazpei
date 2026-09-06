import { estimateShoppingList } from "../shoppingList/shoppingListEngine.ts"
import { enrichShoppingBasketWithPromotions } from "../shoppingList/shoppingPromotionEnrichment.js"

function money(value) {
  const number = Number(String(value ?? 0).replace(",", "."))
  return Number.isFinite(number) ? number : 0
}

function rounded(value) {
  return Math.round((money(value) + Number.EPSILON) * 100) / 100
}

function summarizeEstimate(estimate, source) {
  const items = Array.isArray(estimate?.items) ? estimate.items : []
  const hasHistoricalPrice = items.some(item => money(item.historicalPrice) > 0)
  const hasOptimizedPrice = items.some(item => money(item.estimatedLineCost ?? item.estimatedPrice) > 0)
  return {
    source,
    itemsCount: items.length,
    historicalBasketEstimate: hasHistoricalPrice ? rounded(estimate?.historicalBasketEstimate) : null,
    reliableSavingsTotal: rounded(estimate?.reliableSavingsTotal),
    optimizedBasketEstimate: hasOptimizedPrice ? rounded(estimate?.optimizedBasketEstimate ?? estimate?.total) : null,
    missingPriceCount: Number(estimate?.missingPriceCount || 0),
    reliablePromotionCount: items.filter(item => item.promotionMatchStatus === "reliable").length,
    suggestedPromotionCount: items.filter(item => item.promotionMatchStatus === "suggested").length,
    promotionWithoutHistoricalPriceCount: items.filter(item =>
      item.promotionMatchStatus === "reliable" && money(item.historicalPrice) <= 0,
    ).length,
  }
}

function summarizeSnapshot(snapshot) {
  const items = Array.isArray(snapshot?.items) ? snapshot.items : []
  const historicalBasketEstimate = rounded(items.reduce((sum, item) => sum + money(item.historicalPrice), 0))
  const reliableSavingsTotal = rounded(items.reduce((sum, item) => {
    if (item.promotionMatchStatus !== "reliable" || money(item.historicalPrice) <= 0) return sum
    return sum + Math.max(0, money(item.reliableSaving))
  }, 0))
  const optimizedBasketEstimate = money(snapshot?.totalEstimated) > 0
    ? rounded(snapshot.totalEstimated)
    : Math.max(0, rounded(historicalBasketEstimate - reliableSavingsTotal))

  return summarizeEstimate({
    items,
    historicalBasketEstimate,
    reliableSavingsTotal,
    optimizedBasketEstimate,
    missingPriceCount: snapshot?.missingPriceCount,
  }, "saved_snapshot")
}

export function buildShoppingAdvisorContext({
  draftItems = [],
  snapshot = null,
  shoppingItems = [],
  promotions = [],
} = {}) {
  if (Array.isArray(draftItems) && draftItems.length > 0) {
    const historical = estimateShoppingList(draftItems, shoppingItems)
    const enriched = enrichShoppingBasketWithPromotions({ estimate: historical, promotions })
    return summarizeEstimate(enriched, "current_draft")
  }

  if (snapshot && Array.isArray(snapshot.items) && snapshot.items.length > 0) {
    return summarizeSnapshot(snapshot)
  }

  return null
}
