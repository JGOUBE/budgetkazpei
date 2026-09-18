const VIEW_NAME = "published_retail_observed_prices"

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null
  const number = Number(String(value).replace(",", "."))
  return Number.isFinite(number) ? number : null
}

function normalizedText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function validTime(value) {
  const time = value ? new Date(value).getTime() : NaN
  return Number.isFinite(time) ? time : 0
}

function isMissingViewError(error) {
  const message = String(error?.message || error?.details || "").toLowerCase()
  return ["42P01", "PGRST205"].includes(error?.code) ||
    (message.includes(VIEW_NAME) && message.includes("not"))
}

function identityKey(item = {}) {
  const shoppingProductId = String(item.productId || item.product_id || "").trim()
  const marketProductId = String(item.marketProductId || item.market_product_id || "").trim()
  const barcode = String(item.barcode || "").trim()
  if (shoppingProductId) return `shopping:${shoppingProductId}`
  if (marketProductId) return `market:${marketProductId}`
  if (/^\d{8,14}$/.test(barcode)) return `barcode:${barcode}`
  const name = normalizedText(item.normalizedProductName || item.normalized_product_name || item.productName || item.product_name)
  const brand = normalizedText(item.brand)
  const format = normalizedText(item.packageFormat || item.package_format)
  return name ? `text:${name}|${brand}|${format}` : ""
}

export function toRetailObservedPriceViewModel(raw = {}) {
  const productName = String(raw.productName ?? raw.product_name ?? "").trim()
  return {
    id: raw.id ?? null,
    productId: raw.productId ?? raw.product_id ?? null,
    marketProductId: raw.marketProductId ?? raw.market_product_id ?? null,
    productName,
    normalizedProductName: normalizedText(
      raw.normalizedProductName ?? raw.normalized_product_name ?? productName,
    ),
    brand: String(raw.brand || "").trim(),
    packageFormat: String(raw.packageFormat ?? raw.package_format ?? "").trim(),
    quantityValue: numberOrNull(raw.quantityValue ?? raw.quantity_value),
    quantityUnit: raw.quantityUnit ?? raw.quantity_unit ?? null,
    packCount: numberOrNull(raw.packCount ?? raw.pack_count),
    totalQuantityValue: numberOrNull(raw.totalQuantityValue ?? raw.total_quantity_value),
    totalQuantityUnit: raw.totalQuantityUnit ?? raw.total_quantity_unit ?? null,
    barcode: String(raw.barcode || "").trim(),
    retailerSlug: raw.retailerSlug ?? raw.retailer_slug ?? "",
    retailerName: raw.retailerName ?? raw.retailer_name ?? "",
    storeSlug: raw.storeSlug ?? raw.store_slug ?? "",
    storeName: raw.storeName ?? raw.store_name ?? "",
    storeCity: raw.storeCity ?? raw.store_city ?? "",
    price: numberOrNull(raw.price),
    unitPrice: numberOrNull(raw.unitPrice ?? raw.unit_price),
    unitPriceUnit: raw.unitPriceUnit ?? raw.unit_price_unit ?? "",
    currency: raw.currency || "EUR",
    observedAt: raw.observedAt ?? raw.observed_at ?? null,
    lastSeenAt: raw.lastSeenAt ?? raw.last_seen_at ?? null,
    sourceUrl: raw.sourceUrl ?? raw.source_url ?? "",
    sourceType: raw.sourceType ?? raw.source_type ?? "",
    matchMethod: raw.matchMethod ?? raw.match_method ?? "",
    matchConfidence: numberOrNull(raw.matchConfidence ?? raw.match_confidence),
    isFresh: raw.isFresh ?? raw.is_fresh ?? false,
  }
}

export function deduplicateRetailObservedPrices(rows = []) {
  const byIdentity = new Map()

  for (const row of Array.isArray(rows) ? rows : []) {
    const key = identityKey(row)
    if (!key || !row?.productName || !(Number(row?.price) > 0)) continue
    const current = byIdentity.get(key)
    const rowTime = Math.max(validTime(row.lastSeenAt), validTime(row.observedAt))
    const currentTime = Math.max(validTime(current?.lastSeenAt), validTime(current?.observedAt))

    if (!current ||
        Number(Boolean(row.isFresh)) > Number(Boolean(current.isFresh)) ||
        (Boolean(row.isFresh) === Boolean(current.isFresh) && rowTime > currentTime) ||
        (Boolean(row.isFresh) === Boolean(current.isFresh) && rowTime === currentTime && String(row.id) > String(current.id))) {
      byIdentity.set(key, row)
    }
  }

  return [...byIdentity.values()]
}

export async function loadPublishedRetailObservedPrices({ client } = {}) {
  if (!client) throw new Error("retail_observed_price_client_required")

  const result = await client
    .from(VIEW_NAME)
    .select("*")
    .order("is_fresh", { ascending: false })
    .order("last_seen_at", { ascending: false, nullsFirst: false })
    .order("observed_at", { ascending: false })

  if (result.error && isMissingViewError(result.error)) return []
  if (result.error) throw result.error

  return deduplicateRetailObservedPrices(
    (result.data || []).map(toRetailObservedPriceViewModel),
  )
}