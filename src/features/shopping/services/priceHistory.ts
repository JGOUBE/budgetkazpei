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

function normalizeText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

const MERCHANT_ALIASES = [
  { label: "Leader Price", matches: ["leader price", "leaderprice"] },
  { label: "Carrefour Market", matches: ["carrefour market"] },
  { label: "Carrefour Express", matches: ["carrefour express", "carrefour city", "carrefour contact"] },
  { label: "Carrefour", matches: ["carrefour"] },
  { label: "Leclerc", matches: ["e leclerc", "eleclerc", "leclerc"] },
  { label: "Super U", matches: ["super u", "superu", "marche u", "marcheu"] },
  { label: "Hyper U", matches: ["hyper u", "hyperu"] },
  { label: "U Express", matches: ["u express", "uexpress"] },
  { label: "Utile", matches: ["utile"] },
  { label: "Lidl", matches: ["lidl"] },
  { label: "Run Market", matches: ["run market", "runmarket"] },
  { label: "Jumbo Score", matches: ["jumbo score", "jumboscore"] },
  { label: "Jumbo", matches: ["jumbo"] },
  { label: "Intermarche", matches: ["intermarche", "inter marche"] },
  { label: "Score", matches: ["score"] },
  { label: "Geant Casino", matches: ["geant casino", "geantcasino"] },
  { label: "Casino", matches: ["casino"] },
  { label: "Spar", matches: ["spar"] },
  { label: "Vival", matches: ["vival"] },
  { label: "Auchan", matches: ["auchan"] },
  { label: "Decathlon", matches: ["decathlon"] },
]

export function normalizeMerchantName(name = "") {
  const clean = normalizeText(name)
  const compact = clean.replace(/\s+/g, "")
  if (!clean) return "Magasin non renseigne"

  const alias = MERCHANT_ALIASES.find(entry =>
    entry.matches.some(match => clean.includes(match) || compact.includes(match.replace(/\s+/g, ""))),
  )

  if (alias) return alias.label

  return clean
    .split(" ")
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
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
  const groups = new Map<string, { store: string; count: number }>()
  const total = items.length || 1

  items.forEach(item => {
    const store = normalizeMerchantName(item.store || "")
    const current = groups.get(store) || { store, count: 0 }
    current.count += 1
    groups.set(store, current)
  })

  return Array.from(groups.values())
    .map(({ store, count }) => ({
      store,
      merchant_normalized_name: store,
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
