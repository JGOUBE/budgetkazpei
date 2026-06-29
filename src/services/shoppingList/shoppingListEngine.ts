import { buildTopProducts } from "../../features/shopping/services/priceHistory"
import { normalizeProductName } from "../../features/shopping/services/normalizer"

function money(value: unknown) {
  return Number(String(value ?? 0).replace(",", ".")) || 0
}

export function getAutocompleteSuggestions(query = "", shoppingItems: any[] = []) {
  const clean = normalizeProductName(query)
  if (!clean) return []

  return buildTopProducts(shoppingItems, 30)
    .filter(product => normalizeProductName(product.label).includes(clean))
    .slice(0, 5)
}

export function estimateShoppingList(items: any[] = [], shoppingItems: any[] = []) {
  const products = buildTopProducts(shoppingItems, 80)

  const rows = items.map(item => {
    const normalized = normalizeProductName(item.name)
    const match = products.find(product => product.normalizedName === normalized)
    const average = money(match?.averagePrice)

    return {
      ...item,
      estimatedPrice: average,
    }
  })

  const total = rows.reduce((sum, item) => sum + money(item.estimatedPrice), 0)

  return {
    items: rows,
    total,
    min: total * 0.92,
    max: total * 1.08,
  }
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
