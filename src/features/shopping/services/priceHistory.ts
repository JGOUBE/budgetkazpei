type ShoppingItem = {
  id?: string
  store?: string
  product_name?: string
  normalized_name?: string
  category?: string
  price?: number | string | null
  price_per_unit?: number | string | null
  created_at?: string
}

function money(value: number | string | null | undefined) {
  return Number(String(value ?? 0).replace(",", ".")) || 0
}

export function buildProductStats(items: ShoppingItem[] = [], normalizedName = "") {
  const rows = items
    .filter(item => item.normalized_name === normalizedName)
    .map(item => ({
      ...item,
      priceValue: money(item.price),
      unitPriceValue: money(item.price_per_unit),
    }))
    .filter(item => item.priceValue > 0)
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))

  const prices = rows.map(item => item.priceValue)
  const total = prices.reduce((sum, value) => sum + value, 0)
  const yearlySpend = rows.length > 0 ? total * (365 / Math.max(1, getObservedDays(rows))) : 0

  return {
    normalizedName,
    label: rows[0]?.product_name || normalizedName,
    averagePrice: prices.length ? total / prices.length : 0,
    lastPrice: rows[0]?.priceValue || 0,
    lowestPrice: prices.length ? Math.min(...prices) : 0,
    highestPrice: prices.length ? Math.max(...prices) : 0,
    purchaseCount: rows.length,
    yearlyFrequency: rows.length > 0 ? Math.round(rows.length * (365 / Math.max(30, getObservedDays(rows)))) : 0,
    yearlySpend,
    history: rows,
  }
}

export function buildTopProducts(items: ShoppingItem[] = [], limit = 20) {
  const groups = new Map<string, ShoppingItem[]>()

  items.forEach(item => {
    if (!item.normalized_name) return
    const group = groups.get(item.normalized_name) || []
    group.push(item)
    groups.set(item.normalized_name, group)
  })

  return Array.from(groups.entries())
    .map(([normalizedName, rows]) => ({
      ...buildProductStats(rows, normalizedName),
      totalSpend: rows.reduce((sum, item) => sum + money(item.price), 0),
    }))
    .sort((a, b) => b.purchaseCount - a.purchaseCount || b.totalSpend - a.totalSpend)
    .slice(0, limit)
}

export function buildStoreHabits(items: ShoppingItem[] = []) {
  const groups = new Map<string, number>()
  const total = items.length || 1

  items.forEach(item => {
    const store = item.store || "Magasin non renseigné"
    groups.set(store, (groups.get(store) || 0) + 1)
  })

  return Array.from(groups.entries())
    .map(([store, count]) => ({
      store,
      count,
      percent: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count)
}

function getObservedDays(rows: ShoppingItem[]) {
  const dates = rows
    .map(item => item.created_at ? new Date(item.created_at).getTime() : 0)
    .filter(Boolean)

  if (dates.length < 2) return 30

  const diff = Math.max(...dates) - Math.min(...dates)
  return Math.max(1, Math.round(diff / 86400000))
}
