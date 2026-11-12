const MIN_CONFIDENCE = 0.8
const MAX_OBSERVATION_AGE_DAYS = 90
const MIN_DIFFERENCE = 0.1

function amount(value) {
  const number = Number(String(value ?? "").replace(",", "."))
  return Number.isFinite(number) ? number : 0
}

function euro(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function normalizeSavingsCatalogName(value = "") {
  return String(value || "")
    .replace(/œ/gi, "oe")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
}

function packInfo(value = "") {
  const text = String(value || "").toLowerCase().replace(/×/g, "x").replace(/,/g, ".")
  const multi = text.match(/(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*(kg|g|l|cl|ml)\b/)
  const single = text.match(/(\d+(?:\.\d+)?)\s*(kg|g|l|cl|ml)\b/)
  const found = multi || single
  if (found) {
    const count = multi ? Number(multi[1]) : 1
    const quantity = Number(multi ? multi[2] : single[1])
    const unit = multi ? multi[3] : single[2]
    const factor = { kg: 1000, g: 1, l: 1000, cl: 10, ml: 1 }[unit]
    const family = ["kg", "g"].includes(unit) ? "mass" : "volume"
    if (count > 0 && quantity > 0 && factor) return { family, amount: count * quantity * factor, count }
  }
  if (/\b(?:a la piece|à la pièce|piece|pièce|unite|unité)\b/.test(text)) {
    return { family: "piece", amount: 1, count: 1 }
  }
  const pieces = text.match(/(\d+)\s*(?:pieces|pi[eè]ces|unites|unités)\b/)
  if (pieces) return { family: "piece", amount: Number(pieces[1]), count: Number(pieces[1]) }
  return null
}

function purchasePackPrice(item, product) {
  const price = amount(item.price)
  if (!(price > 0)) return null
  // Matching an exact labelled product is necessary, but not enough when
  // receipt quantity represents a different size or multiple packs.
  const pack = packInfo(product.size_label || product.display_name)
    || packInfo(product.display_name)
  if (!pack) return null
  const quantity = amount(item.quantity)
  const unit = String(item.unit || "").toLowerCase().trim()
  const mass = ["g", "gr", "gramme", "grammes", "kg"].includes(unit)
  const volume = ["l", "litre", "litres", "cl", "ml"].includes(unit)
  if (mass || volume) {
    if ((mass && pack.family !== "mass") || (volume && pack.family !== "volume")) return null
    const gramsOrMillilitres = quantity * ({ kg: 1000, l: 1000, cl: 10 }[unit] || 1)
    if (Math.abs(gramsOrMillilitres - pack.amount) > Math.max(1, pack.amount * 0.02)) return null
    return price
  }
  if (["piece", "pièce", "unite", "unité", "count"].includes(unit) || !unit) {
    // A countable item can be repeated on the receipt. The catalogue quotes
    // the price for one whole product/pack, not one component of that pack.
    if (quantity > 1 && pack.family === "piece" && pack.count > 1) return null
    return quantity > 1 ? price / quantity : price
  }
  return null
}

function retailerOfPurchase(value) {
  const store = normalizeSavingsCatalogName(value)
  if (!store) return ""
  if (store.includes("leclerc")) return "e-leclerc"
  if (store.includes("leaderprice")) return "leader-price"
  if (store.includes("superu")) return "super-u"
  if (store.includes("hyperu")) return "hyper-u"
  if (store.includes("carrefour")) return "carrefour"
  if (store.includes("runmarket")) return "run-market"
  if (store.includes("intermarche")) return "intermarche"
  return ""
}

function validDate(value, now) {
  const date = new Date(value || "")
  if (!Number.isFinite(date.getTime())) return null
  const ageDays = (now - date.getTime()) / 86400000
  return ageDays >= -1 && ageDays <= MAX_OBSERVATION_AGE_DAYS ? date : null
}

export function buildCatalogSavingsInsights({
  shoppingItems = [],
  products = [],
  observations = [],
  now = new Date(),
} = {}) {
  const nowMillis = new Date(now).getTime()
  const catalog = new Map()
  const ambiguous = new Set()
  for (const product of products) {
    if (product?.is_active === false) continue
    const key = normalizeSavingsCatalogName(product?.display_name)
    if (key.length < 7) continue
    if (catalog.has(key) && catalog.get(key).id !== product.id) ambiguous.add(key)
    else catalog.set(key, product)
  }
  for (const key of ambiguous) catalog.delete(key)

  const latestPurchases = new Map()
  let matchedPurchaseLines = 0
  for (const item of shoppingItems) {
    const key = normalizeSavingsCatalogName(item?.product_name || item?.corrected_name || item?.name)
    const product = catalog.get(key)
    if (!product) continue
    matchedPurchaseLines += 1
    const packPrice = purchasePackPrice(item, product)
    if (!(packPrice > 0)) continue
    const boughtAt = new Date(item.created_at || item.purchase_date || "")
    if (!Number.isFinite(boughtAt.getTime())) continue
    const old = latestPurchases.get(product.id)
    if (!old || boughtAt > old.boughtAt) {
      latestPurchases.set(product.id, { product, item, packPrice, boughtAt })
    }
  }

  const observationsByProduct = new Map()
  for (const obs of observations) {
    if (!latestPurchases.has(obs?.product_id)) continue
    if (obs?.is_publishable === false || amount(obs.price) <= 0) continue
    if (amount(obs.confidence_score) < MIN_CONFIDENCE) continue
    const observedDate = validDate(obs.observed_at, nowMillis)
    if (!observedDate) continue
    const group = observationsByProduct.get(obs.product_id) || []
    group.push({ ...obs, observedDate })
    observationsByProduct.set(obs.product_id, group)
  }

  const opportunities = []
  const references = []
  let pricedProducts = 0
  for (const { item, product, packPrice, boughtAt } of latestPurchases.values()) {
    const rows = observationsByProduct.get(product.id) || []
    if (!rows.length) continue
    pricedProducts += 1
    const purchaseRetailer = retailerOfPurchase(item.store)
    const eligibleRows = rows.filter(row => row.retailer_slug && row.observedDate && row.price > 0)
    if (!eligibleRows.length) continue
    // Do not count an observation at the same chain as a confirmed
    // alternative store. The scanned receipt rarely identifies its branch.
    const alternatives = eligibleRows.filter(row => purchaseRetailer && row.retailer_slug !== purchaseRetailer)
    const lowerAlternatives = alternatives.filter(row => packPrice - amount(row.price) >= MIN_DIFFERENCE)
    const sourceRows = lowerAlternatives.length ? lowerAlternatives : eligibleRows
    sourceRows.sort((a, b) => {
      const aBelow = packPrice - amount(a.price) >= MIN_DIFFERENCE ? 1 : 0
      const bBelow = packPrice - amount(b.price) >= MIN_DIFFERENCE ? 1 : 0
      return bBelow - aBelow || amount(a.price) - amount(b.price)
        || b.observedDate.getTime() - a.observedDate.getTime()
    })
    const reference = sourceRows[0]
    const saving = euro(packPrice - amount(reference.price))
    const row = {
      productKey: product.id,
      product: product.display_name,
      referencePrice: euro(packPrice),
      alternativePrice: euro(amount(reference.price)),
      priceDifference: saving,
      potentialSaving: Math.max(0, saving),
      referenceStore: item.store || "Magasin du ticket",
      bestStore: reference.store_name || reference.retailer_slug || "Enseigne non précisée",
      commune: reference.commune || "",
      lastObservedAt: reference.observed_at,
      purchaseDate: boughtAt.toISOString(),
      observationsCount: eligibleRows.length,
      unitLabel: reference.unit_label || "",
      normalizedComparison: false,
      differentRetailer: !!(purchaseRetailer && reference.retailer_slug !== purchaseRetailer),
      wording: "catalogue_reference",
    }
    if (lowerAlternatives.length && saving >= MIN_DIFFERENCE && row.differentRetailer) {
      opportunities.push(row)
    } else {
      references.push(row)
    }
  }

  opportunities.sort((a, b) => b.potentialSaving - a.potentialSaving)
  references.sort((a, b) =>
    Number(b.priceDifference > 0) - Number(a.priceDifference > 0)
    || b.lastObservedAt.localeCompare(a.lastObservedAt)
  )

  return {
    opportunities,
    references,
    matchedPurchaseLines,
    matchedProducts: latestPurchases.size,
    pricedProducts,
    totalPotential: euro(opportunities.reduce((sum, row) => sum + row.potentialSaving, 0)),
    referenceCount: references.length,
  }
}
