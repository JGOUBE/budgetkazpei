import { buildTopProducts } from "../../features/shopping/services/priceHistory.ts"
import { normalizeProductName } from "../../features/shopping/services/normalizer.ts"
import {
  evaluatePromotionPackageCompatibility,
  resolvePromotionIdentityMatch,
} from "../retail/shoppingPromotionMatching.js"

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

function uniqueHistoryValue(history: any[] = [], keys: string[] = []) {
  const values = new Set(
    history
      .map(row => keys.map(key => row?.[key]).find(value => value !== null && value !== undefined && value !== ""))
      .filter(Boolean)
      .map(String),
  )
  return values.size === 1 ? [...values][0] : null
}

function formatMoneyFr(value: unknown) {
  return `${money(value).toFixed(2).replace(".", ",")} €`
}

const PACKAGE_QUANTITY_PATTERN = /\b(?:\d+(?:[,.]\d+)?\s*(?:kg|kgs?|kilogrammes?|g|gr|grammes?|l|litres?|cl|ml|cm|mm|m)\b|\d+\s*x\s*\d+(?:[,.]\d+)?\s*(?:kg|g|gr|l|cl|ml)?\b|\d+\s*(?:tranches?|pieces?|pi[eè]ces?|unit[eé]s?)\b)/i

function normalizeMeasureUnit(value = "") {
  const clean = normalizeRetailObservedSearchText(value)
  if (["kg", "kgs", "kilogramme", "kilogrammes"].includes(clean)) return "kg"
  if (["g", "gr", "gramme", "grammes"].includes(clean)) return "g"
  if (["l", "litre", "litres"].includes(clean)) return "l"
  if (clean === "cl") return "cl"
  if (clean === "ml") return "ml"
  return ""
}

function unitReferenceLabel(unit = "") {
  if (["kg", "g"].includes(unit)) return "€/kg"
  if (["l", "cl", "ml"].includes(unit)) return "€/l"
  return ""
}

function hasExplicitPackageQuantity(value = "") {
  return PACKAGE_QUANTITY_PATTERN.test(String(value || ""))
}

function hasNamedUnitPriceContext(value = "") {
  const clean = normalizeRetailObservedSearchText(value)
  if (!clean) return ""
  if (/(?:^|\s)(?:au |le )?kg(?:\s|$)/.test(clean) || clean.includes(" prix kg ")) return "kg"
  if (/(?:^|\s)(?:au |le )?litre(?:\s|$)/.test(clean) || /(?:^|\s)(?:au |le )?l(?:\s|$)/.test(clean)) return "l"
  return ""
}

function measuredReferenceFromLine({ price, quantity, unit, fallbackUnitPrice }: any = {}) {
  const amount = money(price)
  const qty = money(quantity)
  const cleanUnit = normalizeMeasureUnit(unit)
  const storedUnitPrice = money(fallbackUnitPrice)
  if (!cleanUnit) return null

  let value = 0
  if (amount > 0 && qty > 0) {
    if (cleanUnit === "kg" || cleanUnit === "l") value = amount / qty
    if (cleanUnit === "g" || cleanUnit === "ml") value = amount / (qty / 1000)
    if (cleanUnit === "cl") value = amount / (qty / 100)
  } else if (storedUnitPrice > 0) {
    value = storedUnitPrice
  }

  if (!Number.isFinite(value) || value <= 0) return null
  return {
    value: Number(value.toFixed(2)),
    unitLabel: unitReferenceLabel(cleanUnit),
    kind: "unit",
  }
}

function historyPriceReference(row: any = {}) {
  const productText = [
    row.product_name,
    row.corrected_name,
    row.canonical_name,
    row.market_canonical_name,
    row.package_format,
    row.market_package_format,
  ].filter(Boolean).join(" ")
  const hasPackage = hasExplicitPackageQuantity(productText)

  if (!hasPackage) {
    const measured = measuredReferenceFromLine({
      price: row.price,
      quantity: row.quantity,
      unit: row.unit,
      fallbackUnitPrice: row.price_per_unit,
    })
    if (measured) return measured
  }

  const rawPrice = money(row.price)
  if (rawPrice > 0 && hasPackage) {
    return { value: rawPrice, unitLabel: "", kind: "package" }
  }

  return null
}

function smartHistoricalProduct(product: any = {}) {
  const history = Array.isArray(product.history) ? product.history : []
  const references = history
    .map(row => ({ row, reference: historyPriceReference(row) }))
    .filter(entry => entry.reference?.value > 0)
  const preferredUnitLabel = references[0]?.reference?.unitLabel ?? ""
  const comparable = references.filter(entry => (entry.reference?.unitLabel ?? "") === preferredUnitLabel)
  const prices = comparable.map(entry => money(entry.reference?.value)).filter(value => value > 0)
  const packageFormat = uniqueHistoryValue(history, ["market_package_format", "package_format"]) || ""
  let label = String(product.label || "").trim()

  if (packageFormat) {
    const normalizedLabel = normalizeRetailObservedSearchText(label)
    const normalizedFormat = normalizeRetailObservedSearchText(packageFormat)
    if (normalizedFormat && !normalizedLabel.includes(normalizedFormat)) {
      label = `${label} ${packageFormat}`.trim()
    }
  }

  return {
    ...product,
    label,
    averagePrice: prices.length ? prices.reduce((sum, value) => sum + value, 0) / prices.length : 0,
    lastPrice: prices[0] || 0,
    lowestPrice: prices.length ? Math.min(...prices) : 0,
    highestPrice: prices.length ? Math.max(...prices) : 0,
    priceUnitLabel: preferredUnitLabel,
    smartSuggestionEligible: prices.length > 0 || hasExplicitPackageQuantity(label),
  }
}

function buildSmartShoppingProducts(shoppingItems: any[] = []) {
  return buildTopProducts(shoppingItems, Number.MAX_SAFE_INTEGER).map(smartHistoricalProduct)
}

function retailObservedPriceReference(observed: any = {}) {
  const productText = [observed.productName, observed.packageFormat].filter(Boolean).join(" ")
  if (hasExplicitPackageQuantity(productText)) {
    const rawPrice = money(observed.price)
    return rawPrice > 0 ? { value: rawPrice, unitLabel: "", kind: "package" } : null
  }

  const unitPriceUnit = normalizeMeasureUnit(observed.unitPriceUnit)
  const unitPrice = money(observed.unitPrice)
  if (unitPrice > 0 && unitPriceUnit) {
    return { value: unitPrice, unitLabel: unitReferenceLabel(unitPriceUnit), kind: "unit" }
  }

  const namedUnit = hasNamedUnitPriceContext(productText)
  const rawPrice = money(observed.price)
  if (namedUnit && rawPrice > 0) {
    return { value: rawPrice, unitLabel: unitReferenceLabel(namedUnit), kind: "unit" }
  }

  return null
}

export function getSmartPromotionPriceReference(promotion: any = {}) {
  const productText = [promotion.productName, promotion.packageFormat, promotion.conditions].filter(Boolean).join(" ")
  if (hasExplicitPackageQuantity(productText)) {
    const promoPrice = money(promotion.promoPrice)
    return promoPrice > 0 ? { value: promoPrice, unitLabel: "", kind: "package" } : null
  }

  const unitPriceUnit = normalizeMeasureUnit(promotion.unitLabel || promotion.unitPriceUnit)
  const unitPrice = money(promotion.unitPrice)
  if (unitPrice > 0 && unitPriceUnit) {
    return { value: unitPrice, unitLabel: unitReferenceLabel(unitPriceUnit), kind: "unit" }
  }

  const namedUnit = hasNamedUnitPriceContext(productText)
  const promoPrice = money(promotion.promoPrice)
  if (namedUnit && promoPrice > 0) {
    return { value: promoPrice, unitLabel: unitReferenceLabel(namedUnit), kind: "unit" }
  }

  return null
}

export function isRetailPromotionUsableForSmartShopping(promotion: any = {}) {
  return promotion?.isActive === true &&
    promotion?.promotionProven === true &&
    Boolean(getSmartPromotionPriceReference(promotion)?.value)
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

  return buildSmartShoppingProducts(shoppingItems)
    .map(product => ({
      ...product,
      suggestionScore: getProductSuggestionScore(product.label, clean),
    }))
    .filter(product => product.suggestionScore >= 0 && product.smartSuggestionEligible)
    .sort((a, b) =>
      b.suggestionScore - a.suggestionScore ||
      Number(b.purchaseCount || 0) - Number(a.purchaseCount || 0) ||
      latestTimestamp(b) - latestTimestamp(a) ||
      String(a.label || "").localeCompare(String(b.label || ""), "fr"),
    )
    .slice(0, 6)
}

function normalizeRetailObservedSearchText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function getRetailObservedSuggestionScore(observed: any = {}, query = "") {
  const cleanQuery = normalizeRetailObservedSearchText(query)
  const cleanText = normalizeRetailObservedSearchText([
    observed.productName,
    observed.brand,
    observed.packageFormat,
  ].filter(Boolean).join(" "))

  if (!cleanQuery || !cleanText) return -1

  const queryWords = cleanQuery.split(" ").filter(Boolean)
  const textWords = cleanText.split(" ").filter(Boolean)

  if (cleanText === cleanQuery) return 100
  if (cleanText.startsWith(cleanQuery)) return 80
  if (textWords.some(word => word.startsWith(cleanQuery))) return 60
  if (queryWords.every(word => cleanText.includes(word))) return 20

  return -1
}

function retailObservedIdentityKey(observed: any = {}) {
  const shoppingProductId = String(observed.productId || observed.product_id || "").trim()
  const marketProductId = String(observed.marketProductId || observed.market_product_id || "").trim()
  const barcode = String(observed.barcode || "").trim()
  if (shoppingProductId) return `shopping:${shoppingProductId}`
  if (marketProductId) return `market:${marketProductId}`
  if (/^\d{8,14}$/.test(barcode)) return `barcode:${barcode}`
  return ""
}

function isMeaningfulRetailBrand(value = "") {
  const normalized = normalizeRetailObservedSearchText(value)
  if (!normalized) return false

  return !new Set([
    "maison",
    "sans marque",
    "sans marque connue",
    "non renseigne",
    "non renseignee",
    "generique",
    "generic",
    "mdd",
  ]).has(normalized)
}

function buildRetailObservedDisplayLabel(observed: any = {}) {
  const name = String(observed.productName || "").trim()
  const brand = String(observed.brand || "").trim()
  const packageFormat = String(observed.packageFormat || "").trim()

  let label = name
  const normalizedLabel = () => normalizeRetailObservedSearchText(label)

  if (isMeaningfulRetailBrand(brand)) {
    const normalizedBrand = normalizeRetailObservedSearchText(brand)
    if (normalizedBrand && !normalizedLabel().includes(normalizedBrand)) {
      label = `${label} ${brand}`.trim()
    }
  }

  if (packageFormat) {
    const normalizedFormat = normalizeRetailObservedSearchText(packageFormat)
    if (normalizedFormat && !normalizedLabel().includes(normalizedFormat)) {
      label = `${label} ${packageFormat}`.trim()
    }
  }

  return label || name
}

function retailObservedSuggestion(observed: any, suggestionScore: number) {
  const reference = retailObservedPriceReference(observed)
  return {
    key: `observed:${retailObservedIdentityKey(observed) || observed.id || observed.normalizedProductName}`,
    source: "observed",
    sources: ["observed"],
    label: buildRetailObservedDisplayLabel(observed),
    normalizedName: observed.normalizedProductName || normalizeProductName(observed.productName),
    suggestionScore,
    productId: observed.productId || null,
    shoppingProductId: observed.productId || null,
    marketProductId: observed.marketProductId || null,
    barcode: observed.barcode || null,
    brand: observed.brand || null,
    packageFormat: observed.packageFormat || null,
    quantityValue: observed.quantityValue ?? null,
    quantityUnit: observed.quantityUnit || null,
    packCount: observed.packCount ?? null,
    retailerSlug: observed.retailerSlug || "",
    retailerName: observed.retailerName || "",
    storeName: observed.storeName || "",
    storeCity: observed.storeCity || "",
    observedPrice: money(reference?.value),
    observedPriceUnitLabel: reference?.unitLabel || "",
    observedAt: observed.observedAt || null,
    observedLastSeenAt: observed.lastSeenAt || null,
    observedPriceIsFresh: observed.isFresh === true,
    retailObservedPrice: observed,
  }
}

function observedCompatibleWithItem(item: any = {}, observed: any = {}) {
  const itemShoppingId = String(item.shopping_product_id || item.shoppingProductId || item.product_id || "").trim()
  const itemMarketId = String(item.market_product_id || item.marketProductId || "").trim()
  const itemBarcode = String(item.barcode || "").trim()
  const observedShoppingId = String(observed.productId || observed.product_id || "").trim()
  const observedMarketId = String(observed.marketProductId || observed.market_product_id || "").trim()
  const observedBarcode = String(observed.barcode || "").trim()

  if (itemShoppingId && observedShoppingId) return itemShoppingId === observedShoppingId
  if (itemMarketId && observedMarketId) return itemMarketId === observedMarketId
  if (itemBarcode && observedBarcode) return itemBarcode === observedBarcode

  const itemName = normalizeProductName(item.name || item.normalized_product_name || "")
  const observedName = normalizeProductName(observed.normalizedProductName || observed.productName || "")
  if (!itemName || itemName !== observedName) return false

  const itemBrand = normalizeProductName(item.brand || "")
  const observedBrand = normalizeProductName(observed.brand || "")
  if (itemBrand && observedBrand && itemBrand !== observedBrand) return false

  const packageCheck = evaluatePromotionPackageCompatibility(item, observed)
  return packageCheck.compatible || packageCheck.reason === "package_identity_missing"
}

function findReliableObservedPrice(item: any = {}, observedPrices: any[] = []) {
  const compatible = (Array.isArray(observedPrices) ? observedPrices : [])
    .filter(observed => observed?.isFresh === true && Boolean(retailObservedPriceReference(observed)?.value))
    .filter(observed => observedCompatibleWithItem(item, observed))

  if (compatible.length === 0) return null

  const identityKeys = new Set(
    compatible
      .map(retailObservedIdentityKey)
      .filter(Boolean),
  )
  if (identityKeys.size > 1) return null

  return compatible
    .sort((left, right) => {
      const leftTime = new Date(left.lastSeenAt || left.observedAt || 0).getTime() || 0
      const rightTime = new Date(right.lastSeenAt || right.observedAt || 0).getTime() || 0
      return rightTime - leftTime || String(right.id || "").localeCompare(String(left.id || ""))
    })[0] || null
}

function retailPromotionIdentityKey(promotion: any = {}) {
  const productId = String(promotion.productId || "").trim()
  const marketProductId = String(promotion.marketProductId || "").trim()
  const barcode = String(promotion.barcode || "").trim()
  if (productId) return `shopping:${productId}`
  if (marketProductId) return `market:${marketProductId}`
  if (/^\d{8,14}$/.test(barcode)) return `barcode:${barcode}`
  return ""
}

function retailPromotionOrder(left: any = {}, right: any = {}) {
  const leftPrice = money(left.promoPrice) || Number.POSITIVE_INFINITY
  const rightPrice = money(right.promoPrice) || Number.POSITIVE_INFINITY
  return leftPrice - rightPrice ||
    (money(left.unitPrice) || Number.POSITIVE_INFINITY) - (money(right.unitPrice) || Number.POSITIVE_INFINITY) ||
    Number(Boolean(right.isFeatured)) - Number(Boolean(left.isFeatured)) ||
    String(right.observedAt || right.startsAt || "").localeCompare(String(left.observedAt || left.startsAt || ""))
}

function hasExplicitQueryPackageConflict(query = "", promotion: any = {}) {
  const compatibility = evaluatePromotionPackageCompatibility(
    { name: query },
    promotion,
  )
  return compatibility.reason !== "package_identity_missing" && !compatibility.compatible
}

function historyPromotionCompatibility(suggestion: any = {}, promotion: any = {}) {
  const item = buildShoppingListItemFromSuggestion(suggestion)
  const identity = resolvePromotionIdentityMatch(item, promotion)
  if (identity.conflict) return false

  const itemBrand = normalizeProductName(item.brand || "")
  const promotionBrand = normalizeProductName(promotion.brand || "")
  if (itemBrand && promotionBrand && itemBrand !== promotionBrand) return false

  const packages = evaluatePromotionPackageCompatibility(item, promotion)
  if (!packages.compatible && packages.reason !== "package_identity_missing") return false
  if (identity.matched) return true

  return normalizeProductName(suggestion.label || "") === normalizeProductName(promotion.productName || "")
}

function retailSuggestion(promotion: any, suggestionScore: number) {
  const reference = getSmartPromotionPriceReference(promotion)
  return {
    key: `retail:${retailPromotionIdentityKey(promotion)}`,
    source: "retail",
    sources: ["retail"],
    label: promotion.productName,
    normalizedName: normalizeProductName(promotion.productName),
    suggestionScore,
    productId: promotion.productId || null,
    shoppingProductId: promotion.productId || null,
    marketProductId: promotion.marketProductId || null,
    barcode: promotion.barcode || null,
    brand: promotion.brand || null,
    packageFormat: promotion.packageFormat || null,
    quantityValue: promotion.quantityValue ?? null,
    quantityUnit: promotion.quantityUnit || null,
    packCount: promotion.packCount ?? null,
    retailerSlug: promotion.retailerSlug || "",
    retailerName: promotion.retailerName || "",
    storeLocationId: promotion.storeLocationId || null,
    storeName: promotion.storeName || "",
    storeCity: promotion.storeCity || "",
    promoPrice: money(reference?.value),
    promoPriceUnitLabel: reference?.unitLabel || "",
    promotion,
  }
}

export function getShoppingAutocompleteSuggestions(
  query = "",
  shoppingItems: any[] = [],
  retailPromotions: any[] = [],
  retailObservedPrices: any[] = [],
) {
  const historical = getAutocompleteSuggestions(query, shoppingItems)
    .map(suggestion => ({ ...suggestion, key: `history:${suggestion.normalizedName}`, source: "history", sources: ["history"] }))
  const bestPromotionByIdentity = new Map<string, any>()

  for (const promotion of Array.isArray(retailPromotions) ? retailPromotions : []) {
    if (promotion?.isActive !== true || promotion?.promotionProven !== true) continue
    const identityKey = retailPromotionIdentityKey(promotion)
    const score = getProductSuggestionScore(promotion.productName || "", query)
    if (!identityKey || score < 0 || hasExplicitQueryPackageConflict(query, promotion)) continue
    const current = bestPromotionByIdentity.get(identityKey)
    if (!current || retailPromotionOrder(promotion, current.promotion) < 0) {
      bestPromotionByIdentity.set(identityKey, { promotion, score })
    }
  }

  const retail = [...bestPromotionByIdentity.values()]
    .map(({ promotion, score }) => retailSuggestion(promotion, score))
    .sort((left, right) =>
      right.suggestionScore - left.suggestionScore ||
      retailPromotionOrder(left.promotion, right.promotion) ||
      String(left.label || "").localeCompare(String(right.label || ""), "fr"),
    )

  const historicalNames = new Set(historical.map(item => normalizeProductName(item.label || "")))
  const promotionIdentityKeys = new Set(retail.map(item => retailPromotionIdentityKey(item.promotion)).filter(Boolean))

  const observed = (Array.isArray(retailObservedPrices) ? retailObservedPrices : [])
    .map(observedPrice => ({
      observedPrice,
      score: getRetailObservedSuggestionScore(observedPrice, query),
    }))
    .filter(({ observedPrice, score }) => {
      if (score < 0 || !retailObservedPriceReference(observedPrice)?.value) return false
      const name = normalizeProductName(observedPrice.productName || "")
      if (historicalNames.has(name)) return false
      const identity = retailObservedIdentityKey(observedPrice)
      if (identity && promotionIdentityKeys.has(identity)) return false
      return true
    })
    .map(({ observedPrice, score }) => retailObservedSuggestion(observedPrice, score))
    .sort((left, right) =>
      right.suggestionScore - left.suggestionScore ||
      Number(Boolean(right.observedPriceIsFresh)) - Number(Boolean(left.observedPriceIsFresh)) ||
      String(right.observedLastSeenAt || right.observedAt || "").localeCompare(String(left.observedLastSeenAt || left.observedAt || "")) ||
      String(left.label || "").localeCompare(String(right.label || ""), "fr"),
    )
    .slice(0, 6)

  const mergedRetailKeys = new Set<string>()
  const mergedHistorical = historical.map(suggestion => {
    const compatible = retail.filter(candidate =>
      historyPromotionCompatibility(suggestion, candidate.promotion),
    )
    const identityKeys = new Set(compatible.map(candidate => retailPromotionIdentityKey(candidate.promotion)))
    if (identityKeys.size !== 1) return suggestion

    const best = [...compatible].sort((left, right) => retailPromotionOrder(left.promotion, right.promotion))[0]
    if (!best) return suggestion
    mergedRetailKeys.add(retailPromotionIdentityKey(best.promotion))
    return {
      ...suggestion,
      sources: ["history", "retail"],
      activePromotion: best.promotion,
      productId: best.productId,
      shoppingProductId: best.shoppingProductId,
      marketProductId: best.marketProductId,
      barcode: suggestion.barcode || best.barcode,
      brand: suggestion.brand || best.brand,
      packageFormat: suggestion.packageFormat || best.packageFormat,
      quantityValue: best.quantityValue,
      quantityUnit: best.quantityUnit,
      packCount: best.packCount,
      retailerSlug: best.retailerSlug,
      retailerName: best.retailerName,
      storeLocationId: best.storeLocationId,
      storeName: best.storeName,
      storeCity: best.storeCity,
      promoPrice: best.promoPrice,
    }
  })

  return {
    historical: mergedHistorical,
    observed,
    retail: retail.filter(suggestion => !mergedRetailKeys.has(retailPromotionIdentityKey(suggestion.promotion))).slice(0, 6),
  }
}

export function buildShoppingListItemFromSuggestion(suggestion: any = {}) {
  const history = Array.isArray(suggestion.history) ? suggestion.history : []
  const latest = history[0] || {}
  const promotion = suggestion.activePromotion || suggestion.promotion || {}
  const marketProductId = uniqueHistoryValue(history, ["market_product_id", "marketProductId"]) ||
    suggestion.marketProductId || promotion.marketProductId || null
  const shoppingProductId = uniqueHistoryValue(history, ["shopping_product_id", "shoppingProductId", "product_id"]) ||
    suggestion.shoppingProductId || suggestion.productId || promotion.productId || null
  const barcode = uniqueHistoryValue(history, ["barcode"]) || suggestion.barcode || promotion.barcode || null

  return {
    name: String(suggestion.label || promotion.productName || latest.product_name || "").trim(),
    normalized_product_name: suggestion.normalizedName || promotion.normalizedProductName || latest.normalized_name || null,
    shopping_product_id: shoppingProductId,
    market_product_id: marketProductId,
    barcode,
    canonical_name: uniqueHistoryValue(history, ["market_canonical_name", "canonical_name"]) || promotion.productName || null,
    brand: uniqueHistoryValue(history, ["market_brand", "brand"]) || suggestion.brand || promotion.brand || null,
    package_format: uniqueHistoryValue(history, ["market_package_format", "package_format"]) || suggestion.packageFormat || promotion.packageFormat || null,
    quantity: latest.quantity ?? null,
    unit: latest.unit ?? null,
    price_per_unit: latest.price_per_unit ?? null,
    quantity_value: suggestion.quantityValue ?? promotion.quantityValue ?? null,
    quantity_unit: suggestion.quantityUnit || promotion.quantityUnit || null,
    pack_count: suggestion.packCount ?? promotion.packCount ?? null,
    retailer_slug: suggestion.retailerSlug || promotion.retailerSlug || "",
    retailer_name: suggestion.retailerName || promotion.retailerName || "",
    store_location_id: suggestion.storeLocationId || promotion.storeLocationId || null,
    store_name: suggestion.storeName || promotion.storeName || "",
    store_city: suggestion.storeCity || promotion.storeCity || "",
    retail_observed_price: money(suggestion.observedPrice ?? suggestion.retailObservedPrice?.price) || null,
    retail_observed_at: suggestion.observedAt || suggestion.retailObservedPrice?.observedAt || null,
    retail_observed_last_seen_at: suggestion.observedLastSeenAt || suggestion.retailObservedPrice?.lastSeenAt || null,
    retail_observed_price_is_fresh: suggestion.observedPriceIsFresh === true || suggestion.retailObservedPrice?.isFresh === true,
    retail_observed_retailer_name: suggestion.retailerName || suggestion.retailObservedPrice?.retailerName || "",
    retail_observed_store_name: suggestion.storeName || suggestion.retailObservedPrice?.storeName || "",
    controlled_normalization: Boolean(shoppingProductId || marketProductId),
  }
}

function hasStructuredShoppingIdentity(item: any = {}) {
  const shoppingProductId = String(item.shopping_product_id || item.shoppingProductId || item.product_id || "").trim()
  const marketProductId = String(item.market_product_id || item.marketProductId || "").trim()
  const barcode = String(item.barcode || "").trim()
  return Boolean(shoppingProductId || marketProductId || /^\d{8,14}$/.test(barcode))
}

function historyRowMatchesStructuredIdentity(item: any = {}, row: any = {}) {
  const itemShoppingProductId = String(item.shopping_product_id || item.shoppingProductId || item.product_id || "").trim()
  const itemMarketProductId = String(item.market_product_id || item.marketProductId || "").trim()
  const itemBarcode = String(item.barcode || "").trim()

  const rowShoppingProductId = String(row.shopping_product_id || row.shoppingProductId || row.product_id || "").trim()
  const rowMarketProductId = String(row.market_product_id || row.marketProductId || "").trim()
  const rowBarcode = String(row.barcode || "").trim()

  const comparable = []

  if (itemShoppingProductId && rowShoppingProductId) {
    comparable.push(itemShoppingProductId === rowShoppingProductId)
  }
  if (itemMarketProductId && rowMarketProductId) {
    comparable.push(itemMarketProductId === rowMarketProductId)
  }
  if (/^\d{8,14}$/.test(itemBarcode) && /^\d{8,14}$/.test(rowBarcode)) {
    comparable.push(itemBarcode === rowBarcode)
  }

  return comparable.some(Boolean)
}

function findStructuredHistoryProduct(products: any[] = [], item: any = {}) {
  if (!hasStructuredShoppingIdentity(item)) return null

  return (Array.isArray(products) ? products : []).find(product =>
    (Array.isArray(product?.history) ? product.history : [])
      .some(row => historyRowMatchesStructuredIdentity(item, row)),
  ) || null
}

export function estimateShoppingList(
  items: any[] = [],
  shoppingItems: any[] = [],
  retailObservedPrices: any[] = [],
) {
  // Toute l'historique est déjà chargé en mémoire. Le limiter aux 80 produits
  // les plus fréquents supprimait silencieusement les prix valides plus rares.
  const products = buildSmartShoppingProducts(shoppingItems)

  const rows = items.map(item => {
    const normalized = normalizeProductName(item.name)
    const structuredIdentity = hasStructuredShoppingIdentity(item)
    const structuredMatch = structuredIdentity
      ? findStructuredHistoryProduct(products, item)
      : null
    const match = structuredMatch || (!structuredIdentity
      ? products.find(product => {
          if (product.normalizedName === normalized) return true
          if (normalized.length >= 4 && product.normalizedName.includes(normalized)) return true
          if (product.normalizedName.length >= 4 && normalized.includes(product.normalizedName)) return true
          return false
        })
      : null)
    const average = money(match?.averagePrice)
    const lastPrice = money(match?.lastPrice)
    const historicalEstimatedPrice = average || lastPrice
    const exactHistoricalIdentity = Boolean(match && match.normalizedName === normalized)
    const history = exactHistoricalIdentity ? match?.history || [] : []
    const latest = history[0] || {}
    const marketProductId = item.market_product_id || item.marketProductId ||
      uniqueHistoryValue(history, ["market_product_id", "marketProductId"])
    const shoppingProductId = item.shopping_product_id || item.shoppingProductId || item.product_id ||
      uniqueHistoryValue(history, ["shopping_product_id", "shoppingProductId", "product_id"])
    const barcode = item.barcode || uniqueHistoryValue(history, ["barcode"])
    const identityItem = {
      ...item,
      market_product_id: marketProductId || null,
      shopping_product_id: shoppingProductId || null,
      barcode: barcode || null,
      normalized_product_name: exactHistoricalIdentity ? match.normalizedName : item.normalized_product_name || null,
      brand: item.brand || latest.market_brand || latest.brand || null,
      package_format: item.package_format || latest.market_package_format || null,
    }
    const observed = historicalEstimatedPrice > 0
      ? null
      : findReliableObservedPrice(identityItem, retailObservedPrices)
    const observedReference = observed ? retailObservedPriceReference(observed) : null
    const retailObservedPrice = money(observedReference?.value)
    const estimatedPrice = historicalEstimatedPrice || retailObservedPrice

    return {
      ...item,
      estimatedPrice,
      historicalPrice: historicalEstimatedPrice || null,
      retailObservedPrice: retailObservedPrice || null,
      retailObservedAt: observed?.observedAt || item.retail_observed_at || null,
      retailObservedLastSeenAt: observed?.lastSeenAt || item.retail_observed_last_seen_at || null,
      retailObservedRetailerName: observed?.retailerName || item.retail_observed_retailer_name || "",
      retailObservedStoreName: observed?.storeName || item.retail_observed_store_name || "",
      lastKnownPrice: lastPrice,
      averagePrice: average,
      lowestPrice: money(match?.lowestPrice),
      highestPrice: money(match?.highestPrice),
      priceSource: historicalEstimatedPrice > 0 ? "known" : retailObservedPrice > 0 ? "retail_observed" : "missing",
      priceUnitLabel: historicalEstimatedPrice > 0 ? (match?.priceUnitLabel || "") : (observedReference?.unitLabel || ""),
      priceLabel: historicalEstimatedPrice > 0
        ? (Number(match?.purchaseCount || 0) > 1 ? "prix estimé" : "dernier prix connu")
        : retailObservedPrice > 0
          ? "prix observé"
          : "prix à estimer",
      knownStore: match?.history?.[0]?.store || observed?.storeName || "",
      purchaseCount: match?.purchaseCount || 0,
      market_product_id: marketProductId || null,
      shopping_product_id: shoppingProductId || null,
      barcode: barcode || null,
      brand: item.brand || latest.market_brand || latest.brand || null,
      package_format: item.package_format || latest.market_package_format || null,
      quantity: item.quantity || latest.quantity || null,
      unit: item.unit || latest.unit || null,
      price_per_unit: item.price_per_unit || latest.price_per_unit || null,
      normalized_product_name: exactHistoricalIdentity ? match.normalizedName : null,
      controlled_normalization: Boolean(
        item.controlled_normalization === true || exactHistoricalIdentity && (marketProductId || shoppingProductId),
      ),
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
  const lines = rows.flatMap((item: any, index: number) => {
    const price = money(item.estimatedPrice)
    const priceText = price > 0 ? formatMoneyFr(price) : "prix à estimer"
    const promotion = item.promotionSnapshot || item.promotion
    const promotionPrice = money(promotion?.promoPrice ?? promotion?.promotionPrice)
    const retailer = String(promotion?.retailerName || "").trim()
    const promotionLabel = item.promotionMatchStatus === "suggested"
      ? "Offre proche à vérifier"
      : "Promo repérée"
    const productLine = `${index + 1}. ${item.name} - ${priceText}`
    if (!promotion || promotionPrice <= 0) return [productLine]
    return [
      productLine,
      `   ${promotionLabel} : ${formatMoneyFr(promotionPrice)}${retailer ? ` chez ${retailer}` : ""}`,
    ]
  })

  const total = money(estimate?.total)
  const missing = Number(estimate?.missingPriceCount || 0)
  const reliableSavings = money(estimate?.reliableSavingsTotal)
  const optimized = money(estimate?.optimizedBasketEstimate)
  const usesReliablePromotionPrice = rows.some((item: any) =>
    item.estimatedPriceSource === "promotion" && money(item.estimatedLineCost ?? item.estimatedPrice) > 0,
  )
  const promotionSummary = reliableSavings > 0
    ? [
        `Promos fiables repérées : -${formatMoneyFr(reliableSavings)}`,
        `Budget optimisé estimé : ${formatMoneyFr(optimized)}`,
      ]
    : []

  return [
    title,
    "",
    ...lines,
    "",
    `Total estimé : ${formatMoneyFr(total)}`,
    ...promotionSummary,
    `Produits : ${rows.length}`,
    `Prix manquants : ${missing}`,
    "",
    usesReliablePromotionPrice
      ? "Estimation basée sur mes tickets BudgetKazPéi et les promos fiables actuellement repérées."
      : "Prix basés sur mes tickets BudgetKazPéi déjà scannés.",
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
