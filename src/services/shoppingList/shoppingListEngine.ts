import { buildTopProducts } from "../../features/shopping/services/priceHistory"
import { normalizeProductName } from "../../features/shopping/services/normalizer"

const UNIT_WORDS = new Set(["g", "gr", "kg", "kgs", "ml", "cl", "l", "litre", "litres", "x", "xkg"])

function money(value: unknown) {
  return Number(String(value ?? 0).replace(",", ".")) || 0
}

function words(value = "") {
  return normalizeProductName(value)
    .split(" ")
    .map(word => word.trim())
    .filter(Boolean)
}

function latestTimestamp(product: any) {
  const value = product?.history?.[0]?.created_at
  return value ? new Date(value).getTime() || 0 : 0
}

export function getProductSuggestionScore(productName = "", query = "") {
  const cleanName = normalizeProductName(productName)
  const cleanQuery = normalizeProductName(query)
  if (!cleanName || !cleanQuery) return -1

  const queryWords = words(cleanQuery)
  const nameWords = words(cleanName)
  const significantWords = nameWords.filter(word => !UNIT_WORDS.has(word))

  if (cleanQuery.length === 1) {
    if (cleanName.startsWith(cleanQuery)) return 80
    return significantWords.some(word => word.startsWith(cleanQuery)) ? 60 : -1
  }

  if (cleanName === cleanQuery) return 100
  if (cleanName.startsWith(cleanQuery)) return 80
  if (significantWords.some(word => word.startsWith(cleanQuery))) return 60
  if (queryWords.every(queryWord => cleanName.includes(queryWord))) return 20

  return -1
}

export function getAutocompleteSuggestions(query = "", shoppingItems: any[] = []) {
  const clean = normalizeProductName(query)
  if (!clean) return []

  return buildTopProducts(shoppingItems, 80)
    .map(product => ({
      ...product,
      suggestionScore: getProductSuggestionScore(product.label, clean),
    }))
    .filter(product => product.suggestionScore >= 0)
    .sort((a, b) =>
      b.suggestionScore - a.suggestionScore ||
      Number(b.purchaseCount || 0) - Number(a.purchaseCount || 0) ||
      latestTimestamp(b) - latestTimestamp(a) ||
      String(a.label || "").localeCompare(String(b.label || ""), "fr"),
    )
    .slice(0, 6)
}

export function estimateShoppingList(items: any[] = [], shoppingItems: any[] = []) {
  const products = buildTopProducts(shoppingItems, 80)

  const rows = items.map(item => {
    const normalized = normalizeProductName(item.name)
    const match = products.find(product => {
      if (product.normalizedName === normalized) return true
      if (normalized.length >= 4 && product.normalizedName.includes(normalized)) return true
      if (product.normalizedName.length >= 4 && normalized.includes(product.normalizedName)) return true
      return false
    })
    const average = money(match?.averagePrice)
    const lastPrice = money(match?.lastPrice)
    const estimatedPrice = average || lastPrice

    return {
      ...item,
      estimatedPrice,
      lastKnownPrice: lastPrice,
      averagePrice: average,
      lowestPrice: money(match?.lowestPrice),
      highestPrice: money(match?.highestPrice),
      priceSource: estimatedPrice ? "known" : "missing",
      priceLabel: estimatedPrice ? (Number(match?.purchaseCount || 0) > 1 ? "prix estimé" : "dernier prix connu") : "prix à estimer",
      knownStore: match?.history?.[0]?.store || "",
      purchaseCount: match?.purchaseCount || 0,
    }
  })

  const total = rows.reduce((sum, item) => sum + money(item.estimatedPrice), 0)
  const missingPriceCount = rows.filter(item => !money(item.estimatedPrice)).length

  return {
    items: rows,
    total,
    min: total * 0.92,
    max: total * 1.08,
    missingPriceCount,
    totalItems: rows.length,
  }
}

export function buildShoppingListShareText({ title = "Liste de courses BudgetKazPéi", estimate }: { title?: string; estimate: any }) {
  const rows = Array.isArray(estimate?.items) ? estimate.items : []
  const lines = rows.map((item: any, index: number) => {
    const price = money(item.estimatedPrice)
    const priceText = price > 0 ? `${price.toFixed(2).replace(".", ",")} EUR` : "prix à estimer"
    return `${index + 1}. ${item.name} - ${priceText}`
  })

  const total = money(estimate?.total)
  const missing = Number(estimate?.missingPriceCount || 0)

  return [
    title,
    "",
    ...lines,
    "",
    `Total estimé : ${total.toFixed(2).replace(".", ",")} EUR`,
    `Produits : ${rows.length}`,
    `Prix manquants : ${missing}`,
    "",
    "Prix basés sur mes tickets BudgetKazPéi déjà scannés.",
  ].join("\n")
}

export function getPairingSuggestion(items: any[] = [], shoppingItems: any[] = []) {
  const names = items.map(item => normalizeProductName(item.name))
  const hasChicken = names.some(name => name.includes("poulet"))
  const hasRice = names.some(name => name.includes("riz"))

  if (hasChicken && !hasRice) {
    return "Tu achètes souvent du riz avec le poulet. L'ajouter ?"
  }

  const frequent = buildTopProducts(shoppingItems, 1)[0]
  if (frequent && !names.includes(frequent.normalizedName)) {
    return `Tu achètes souvent ${frequent.label}. L'ajouter ?`
  }

  return ""
}
