// Comparaisons personnelles fondées sur une même identité de produit vérifiée.
// Les prix catalogue sont indicatifs : ils ne prouvent jamais une économie réalisée.

const MIN_DIFFERENCE = 0.1
const MAX_ACTIONABLE_AGE_DAYS = 180

function amount(value) {
  const number = Number(String(value ?? "").replace(",", "."))
  return Number.isFinite(number) && number > 0 ? number : 0
}

function money(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100
}

function clean(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

export function identifyRetailChain(value) {
  const text = clean(value)
  if (!text) return ""
  if (/(^| )e leclerc( |$)|(^| )leclerc( |$)/.test(text)) return "e-leclerc"
  if (/(^| )leader price( |$)/.test(text)) return "leader-price"
  if (/(^| )(super u|hyper u|u express)( |$)/.test(text)) return "systeme-u"
  if (/(^| )carrefour( |$)/.test(text)) return "carrefour"
  if (/(^| )intermarche( |$)/.test(text)) return "intermarche"
  if (/(^| )(jumbo|score)( |$)/.test(text)) return "jumbo-score"
  return ""
}

function asDate(value) {
  const parsed = value ? new Date(value) : null
  return parsed && Number.isFinite(parsed.getTime()) ? parsed : null
}

function ageDays(value, asOf) {
  const date = asDate(value)
  if (!date) return Infinity
  return Math.floor((asOf.getTime() - date.getTime()) / 86400000)
}

// Sur un ticket, quantity peut être un poids (500 g) et non le nombre de
// paquets. On ne divise le prix de la ligne que pour les multipacks comptés.
export function receiptPackPrice(item = {}) {
  const total = amount(item.total_price)
  const unitPrice = amount(item.unit_price)
  const quantity = Number(item.quantity ?? 1)
  if (quantity === 1) return total || unitPrice
  const unit = clean(item.unit)
  if (!Number.isInteger(quantity) || quantity < 2 || quantity > 24) return 0
  if (unit && !["piece", "pieces", "unite", "unites"].includes(unit)) return 0
  if (!total || !unitPrice || Math.abs(unitPrice * quantity - total) > 0.06) return 0
  return unitPrice
}

function isReliableMatchedLine(item) {
  if (!item || item.market_matched !== true || !item.market_product_id) return false
  if (clean(item.line_type) !== "product") return false
  const status = clean(item.item_status)
  if (!["user validated", "trusted", "detected"].includes(status)) return false
  const confidence = Number(item.market_match_confidence)
  const normalizedConfidence = confidence > 1 ? confidence / 100 : confidence
  if (!Number.isFinite(normalizedConfidence)) return false
  const minimum = status === "user validated" ? 0.85 : 0.9
  return normalizedConfidence >= minimum && receiptPackPrice(item) > 0
}

function catalogueLocation(price, store) {
  const label = String(store?.store_name || "").trim()
  if (label) return label
  const retailer = String(store?.retailer_name || price.retailer_slug || "").trim()
  const commune = String(store?.commune || price.commune || "").trim()
  return [retailer, commune].filter(Boolean).join(" · ") || "Magasin non précisé"
}

export function buildCatalogSavingsInsights({
  receipts = [],
  receiptItems = [],
  links = [],
  products = [],
  prices = [],
  stores = [],
  asOf = new Date(),
} = {}) {
  const now = asDate(asOf) || new Date()
  const receiptsById = new Map(
    (receipts || [])
      .filter(row => clean(row.validation_status) === "validated"
        && !row.removed_from_history_at && !row.hidden_at)
      .map(row => [row.id, row]),
  )
  const productsById = new Map((products || []).map(row => [row.id, row]))
  const storesById = new Map((stores || []).map(row => [row.id, row]))
  const linksByMarketId = new Map(
    (links || [])
      .filter(row => row.market_product_id && row.shopping_product_id
        && ["manual_verified", "barcode_verified", "exact_name_brand_size"].includes(row.match_method))
      .map(row => [row.market_product_id, row.shopping_product_id]),
  )
  const pricesByProductId = new Map()
  for (const price of prices || []) {
    if (!price?.product_id || price.is_publishable !== true || amount(price.price) <= 0) continue
    if (Number(price.quantity || 1) !== 1 || Number(price.confidence_score ?? 0) < 0.7) continue
    const dateAge = ageDays(price.observed_at, now)
    if (dateAge < -1 || dateAge > 365) continue
    const list = pricesByProductId.get(price.product_id) || []
    list.push(price)
    pricesByProductId.set(price.product_id, list)
  }

  const matchedLines = (receiptItems || []).filter(item =>
    isReliableMatchedLine(item) && receiptsById.has(item.receipt_id))
  const latestByMarketId = new Map()
  const allProductIdsWithCatalogue = new Set()
  let comparableReceiptLines = 0
  for (const item of matchedLines) {
    const productId = linksByMarketId.get(item.market_product_id)
    if (!productId || !productsById.has(productId)) continue
    if (!(pricesByProductId.get(productId) || []).length) continue
    comparableReceiptLines++
    allProductIdsWithCatalogue.add(item.market_product_id)
    const receipt = receiptsById.get(item.receipt_id)
    const purchasedAt = receipt.purchase_date || item.created_at || ""
    const old = latestByMarketId.get(item.market_product_id)
    if (!old || String(purchasedAt) > String(old.purchasedAt)) {
      latestByMarketId.set(item.market_product_id, {
        item, productId, receipt, purchasedAt,
        packPrice: receiptPackPrice(item),
      })
    }
  }

  const comparisons = []
  for (const [marketProductId, purchase] of latestByMarketId) {
    const candidatePrices = pricesByProductId.get(purchase.productId) || []
    const purchaseChain = identifyRetailChain(purchase.receipt.store_name)
    const options = candidatePrices.map(price => {
      const store = storesById.get(price.store_location_id)
      const referenceChain = identifyRetailChain(price.retailer_slug || store?.retailer_slug || store?.retailer_name)
      const diff = money(purchase.packPrice - amount(price.price))
      const daysOld = ageDays(price.observed_at, now)
      const differentRetailer = Boolean(purchaseChain && referenceChain && purchaseChain !== referenceChain)
      // En l'absence de magasin d'achat précis, un autre point de vente de
      // la même enseigne ne prouve pas une économie accessible.
      const actionable = differentRetailer && diff >= MIN_DIFFERENCE
        && daysOld <= MAX_ACTIONABLE_AGE_DAYS
        && ageDays(purchase.purchasedAt, now) <= 365
      return {
        price,
        catalogStore: catalogueLocation(price, store),
        difference: diff,
        differentRetailer,
        actionable,
        age: daysOld,
      }
    }).filter(row => row.age >= -1 && row.age <= 365)
    if (!options.length) continue
    // Priorité aux réelles comparaisons entre enseignes, puis à la fraîcheur.
    options.sort((a, b) => Number(b.actionable) - Number(a.actionable)
      || Number(b.differentRetailer) - Number(a.differentRetailer)
      || (b.actionable ? b.difference - a.difference : 0)
      || String(b.price.observed_at).localeCompare(String(a.price.observed_at))
      || a.price.price - b.price.price)
    const best = options[0]
    const product = productsById.get(purchase.productId)
    comparisons.push({
      productKey: marketProductId,
      product: product?.display_name || purchase.item.market_canonical_name || purchase.item.corrected_name || purchase.item.name,
      purchasePrice: money(purchase.packPrice),
      purchaseStore: purchase.receipt.store_name || "Magasin non précisé",
      purchaseDate: purchase.purchasedAt,
      catalogPrice: money(best.price.price),
      catalogStore: best.catalogStore,
      catalogDate: best.price.observed_at,
      difference: best.difference,
      differentRetailer: best.differentRetailer,
      actionable: best.actionable,
      potentialSaving: best.actionable ? best.difference : 0,
      isIndicative: true,
    })
  }

  comparisons.sort((a, b) =>
    Number(b.actionable) - Number(a.actionable)
    || Number(b.difference > 0) - Number(a.difference > 0)
    || Math.abs(b.difference) - Math.abs(a.difference)
    || String(b.catalogDate).localeCompare(String(a.catalogDate)),
  )
  const actionable = comparisons.filter(row => row.actionable)
  return {
    comparisons,
    actionable,
    totalPotential: money(actionable.reduce((sum, row) => sum + row.potentialSaving, 0)),
    receiptCount: receiptsById.size,
    matchedReceiptLines: matchedLines.length,
    comparableReceiptLines,
    comparableProductCount: allProductIdsWithCatalogue.size,
  }
}
