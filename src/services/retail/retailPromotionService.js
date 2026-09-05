import { formatMontant } from "../../utils/format.js"

export const RETAIL_OBSERVED_FRESHNESS_HOURS = 36

export const RETAIL_PROMOTION_DATE_BASIS = Object.freeze({
  OFFICIAL: "official",
  OBSERVED_FRESHNESS: "observed_freshness",
})

const ALLOWED_NON_BLOCKING_WARNING = "matching_backend_unavailable_in_local_session"
const INTERNAL_LABELS = new Set([
  "promotion structuree",
  "promotion retail structuree",
  "prix promo",
  "direct discount",
  "observed freshness",
  "retail publication",
  "collector source slug",
])

function normalizedLabel(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null
  const number = Number(String(value).replace(",", "."))
  return Number.isFinite(number) ? number : null
}

function validDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
}

function arrayValue(value) {
  if (Array.isArray(value)) return value
  return value === null || value === undefined || value === "" ? [] : [value]
}

function hasEvidence(value) {
  if (value === null || value === undefined || value === false || value === "") return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === "object") return Object.keys(value).length > 0
  return true
}

function normalizeUnitLabel(value = "") {
  const clean = normalizedLabel(value).replace(/^eur\s*\/?\s*/, "")
  if (["kg", "kilogramme", "kilogrammes"].includes(clean)) return "kg"
  if (["l", "litre", "litres"].includes(clean)) return "l"
  if (["piece", "pieces", "unite", "unites"].includes(clean)) return "pièce"
  return clean
}

function isRetailPromotionDeal(deal = {}) {
  const tags = arrayValue(deal.tags).map(tag => normalizedLabel(tag).replace(/ /g, "_"))
  return tags.includes("product_promo") || Boolean(deal.retailPromotion)
}

function isLegacyLeaderObservedPromotion(deal = {}) {
  if (!isRetailPromotionDeal(deal) || deal.starts_at || deal.ends_at) return false
  const retailer = normalizedLabel(
    deal.business_name || deal.businessName || deal.store_name || deal.retailer_name || deal.retailer_slug,
  )
  return retailer.includes("leader price")
}

function isMissingViewError(error) {
  const message = String(error?.message || error?.details || "").toLowerCase()
  return ["42P01", "PGRST205"].includes(error?.code) ||
    (message.includes("published_retail_promotions") && message.includes("not"))
}

export function sanitizeRetailMarketingText(value) {
  const text = String(value || "").trim()
  if (!text) return ""
  return INTERNAL_LABELS.has(normalizedLabel(text)) ? "" : text
}

export function formatRetailPrice(value, unitLabel = "") {
  const amount = numberOrNull(value)
  if (amount === null) return ""

  const formatted = formatMontant(amount)
  const unit = normalizeUnitLabel(unitLabel)
  return unit ? `${formatted}/${unit}` : formatted
}

export function buildRetailPriceNote(promotion = {}) {
  const promoPrice = numberOrNull(promotion.promoPrice ?? promotion.promo_price)
  const originalPrice = numberOrNull(promotion.originalPrice ?? promotion.original_price)
  const unitPrice = numberOrNull(promotion.unitPrice ?? promotion.unit_price)
  const unitLabel = promotion.unitLabel ?? promotion.unit_label
  const parts = []

  if (promoPrice !== null) parts.push(formatRetailPrice(promoPrice))
  if (originalPrice !== null && promoPrice !== null && originalPrice > promoPrice) {
    parts.push(`Au lieu de ${formatRetailPrice(originalPrice)}`)
  }
  if (unitPrice !== null && unitLabel) parts.push(formatRetailPrice(unitPrice, unitLabel))

  return parts.join(" · ")
}

export function isRetailPromotionEligible(raw = {}, now = new Date()) {
  const currentTime = validDate(now)
  const startsAt = validDate(raw.startsAt ?? raw.starts_at)
  const endsAt = validDate(raw.endsAt ?? raw.ends_at)
  const observedAt = validDate(raw.observedAt ?? raw.observed_at)
  const freshUntil = validDate(raw.freshUntil ?? raw.fresh_until)
  const dateBasis = raw.dateBasis ?? raw.date_basis
  const promoPrice = numberOrNull(raw.promoPrice ?? raw.promo_price ?? raw.current_price)
  const originalPrice = numberOrNull(raw.originalPrice ?? raw.original_price)
  const validationErrors = arrayValue(raw.validationErrors ?? raw.validation_errors)
  const warnings = arrayValue(raw.matchWarnings ?? raw.match_warnings)
  const evidence = raw.promotionEvidence ?? raw.promotion_evidence ?? raw.evidenceExists
  const promotionProven = raw.promotionProven ?? raw.promotion_proven

  if (!currentTime || raw.isActive === false || raw.is_active === false) return false
  if (promotionProven !== true || !hasEvidence(evidence)) return false
  if (promoPrice === null || promoPrice <= 0 || originalPrice === null || originalPrice <= promoPrice) return false
  if (validationErrors.length > 0) return false
  if (warnings.some(warning => warning !== ALLOWED_NON_BLOCKING_WARNING)) return false
  if (raw.brandMismatch === true || raw.brand_mismatch === true) return false
  if (raw.packageMismatch === true || raw.package_mismatch === true) return false

  if (dateBasis === RETAIL_PROMOTION_DATE_BASIS.OFFICIAL) {
    return Boolean(startsAt && endsAt && startsAt <= currentTime && endsAt >= currentTime)
  }

  if (dateBasis !== RETAIL_PROMOTION_DATE_BASIS.OBSERVED_FRESHNESS) return false
  if (startsAt || endsAt || !observedAt || !freshUntil || freshUntil <= observedAt || freshUntil <= currentTime) return false

  return (raw.retailerSlug ?? raw.retailer_slug) === "leader-price-reunion" &&
    (raw.sourceType ?? raw.source_type) === "leader_drive_html" &&
    (raw.collectorSourceSlug ?? raw.collector_source_slug) === "leader-price-reunion-retail"
}

export function toRetailPromotionViewModel(raw = {}, { now = new Date(), trustedProjection = false } = {}) {
  const dateBasis = raw.dateBasis ?? raw.date_basis ?? RETAIL_PROMOTION_DATE_BASIS.OFFICIAL
  const startsAt = raw.startsAt ?? raw.starts_at ?? null
  const endsAt = raw.endsAt ?? raw.ends_at ?? null
  const observedAt = raw.observedAt ?? raw.observed_at ?? null
  const freshUntil = raw.freshUntil ?? raw.fresh_until ?? null
  const promoPrice = numberOrNull(raw.promoPrice ?? raw.promo_price ?? raw.current_price)
  const originalPrice = numberOrNull(raw.originalPrice ?? raw.original_price)
  const unitPrice = numberOrNull(raw.unitPrice ?? raw.unit_price)
  const promotionProven = raw.promotionProven ?? raw.promotion_proven ?? false
  const productName = String(raw.productName ?? raw.product_name ?? raw.title ?? "").trim()
  const isEligible = trustedProjection
    ? raw.is_active !== false && raw.is_fresh !== false && promotionProven === true
    : isRetailPromotionEligible(raw, now)

  return {
    id: raw.id ?? null,
    productId: raw.productId ?? raw.product_id ?? null,
    marketProductId: raw.marketProductId ?? raw.market_product_id ?? null,
    productName,
    normalizedProductName: normalizedLabel(raw.normalizedProductName ?? raw.normalized_product_name ?? productName),
    controlledNormalization: Boolean(
      raw.controlledNormalization ?? raw.controlled_normalization ?? raw.product_id ?? raw.market_product_id,
    ),
    validatedAliases: arrayValue(raw.validatedAliases ?? raw.validated_aliases)
      .map(value => String(value || "").trim())
      .filter(Boolean),
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
    storeLocationId: raw.storeLocationId ?? raw.store_location_id ?? null,
    storeName: raw.storeName ?? raw.store_name ?? "",
    storeCity: raw.storeCity ?? raw.store_city ?? "",
    promoPrice,
    originalPrice,
    discountAmount: numberOrNull(raw.discountAmount ?? raw.discount_amount) ??
      (originalPrice !== null && promoPrice !== null ? Math.max(0, originalPrice - promoPrice) : null),
    discountPercent: numberOrNull(raw.discountPercent ?? raw.discount_percent),
    unitPrice,
    unitLabel: normalizeUnitLabel(raw.unitLabel ?? raw.unit_label ?? ""),
    startsAt,
    endsAt,
    dateBasis,
    observedAt,
    freshUntil,
    isActive: isEligible,
    isFresh: isEligible,
    promotionProven: promotionProven === true,
    sourceUrl: raw.sourceUrl ?? raw.source_url ?? "",
    collectorSourceSlug: raw.collectorSourceSlug ?? raw.collector_source_slug ?? "",
    catalogId: raw.catalogId ?? raw.catalog_id ?? null,
    sourceType: raw.sourceType ?? raw.source_type ?? "",
    matchMethod: raw.matchMethod ?? raw.match_method ?? "",
    matchConfidence: numberOrNull(raw.matchConfidence ?? raw.match_confidence),
    conditions: sanitizeRetailMarketingText(raw.conditions),
    marketingText: sanitizeRetailMarketingText(raw.offerText ?? raw.offer_text ?? raw.description),
  }
}

export function retailPromotionToGoodDeal(promotion) {
  return {
    id: promotion.id,
    title: promotion.productName,
    description: promotion.marketingText,
    display_description: promotion.marketingText,
    conditions: promotion.conditions,
    category: "shopping",
    scope_type: promotion.storeCity ? "commune" : "island",
    commune: promotion.storeCity,
    starts_at: promotion.startsAt,
    ends_at: promotion.endsAt,
    source_url: promotion.sourceUrl,
    is_sponsored: false,
    is_featured: false,
    business_name: promotion.retailerName,
    business_commune: promotion.storeCity,
    tags: ["product_promo"],
    is_free: false,
    content_kind: "promotion",
    locality: promotion.storeName,
    availability_status: "active",
    last_verified_at: promotion.observedAt || promotion.startsAt,
    price_note: buildRetailPriceNote(promotion),
    display_price_note: buildRetailPriceNote(promotion),
    show_fresh_observed_label:
      promotion.dateBasis === RETAIL_PROMOTION_DATE_BASIS.OBSERVED_FRESHNESS && promotion.isFresh,
    retailPromotion: promotion,
  }
}

export function deduplicateRetailPromotions(promotions = []) {
  const newestObservedByIdentity = new Map()
  const official = []

  for (const promotion of Array.isArray(promotions) ? promotions : []) {
    if (promotion.dateBasis !== RETAIL_PROMOTION_DATE_BASIS.OBSERVED_FRESHNESS) {
      official.push(promotion)
      continue
    }

    const key = [
      promotion.retailerSlug,
      promotion.productId,
      promotion.storeLocationId || "all-stores",
    ].join("|")
    const current = newestObservedByIdentity.get(key)
    const promotionTime = validDate(promotion.observedAt)?.getTime() ?? 0
    const currentTime = validDate(current?.observedAt)?.getTime() ?? 0

    if (!current || promotionTime > currentTime ||
        (promotionTime === currentTime && String(promotion.id) > String(current.id))) {
      newestObservedByIdentity.set(key, promotion)
    }
  }

  return [...official, ...newestObservedByIdentity.values()]
}

export function normalizePublishedGoodDeal(deal = {}) {
  const retail = isRetailPromotionDeal(deal)
  return {
    ...deal,
    display_description: retail
      ? sanitizeRetailMarketingText(deal.description)
      : String(deal.description || "").trim(),
    display_price_note: retail
      ? String(deal.price_note || "")
          .replace(/^prix promo\s+/i, "")
          .replace(/\b(\d+)\.(\d{2})\b/g, "$1,$2")
          .replace(/\s+EUR\//gi, " €/")
          .replace(/\s+EUR\b/gi, " €")
          .replace(/\s+-\s+/g, " · ")
      : String(deal.price_note || "").trim(),
    show_fresh_observed_label: isLegacyLeaderObservedPromotion(deal),
  }
}

export async function loadActiveRetailPromotions({ client } = {}) {
  if (!client) throw new Error("retail_promotion_client_required")

  const result = await client
    .from("published_retail_promotions")
    .select("*")
    .order("is_featured", { ascending: false })
    .order("starts_at", { ascending: true, nullsFirst: false })

  if (result.error && isMissingViewError(result.error)) return []
  if (result.error) throw result.error

  return deduplicateRetailPromotions((result.data || [])
    .map(row => toRetailPromotionViewModel(row, { trustedProjection: true }))
    .filter(promotion => promotion.isActive))
}

export async function loadPublishedGoodDeals({ client } = {}) {
  if (!client) throw new Error("retail_promotion_client_required")
  const { data: legacyDeals, error: dealsError } = await client
    .from("published_good_deals")
    .select("*")
    .order("is_featured", { ascending: false })
    .order("starts_at", { ascending: true, nullsFirst: false })

  if (dealsError) throw dealsError

  const retailResult = await client
    .from("published_retail_promotions")
    .select("*")
    .order("is_featured", { ascending: false })
    .order("starts_at", { ascending: true, nullsFirst: false })

  if (retailResult.error && !isMissingViewError(retailResult.error)) throw retailResult.error

  const hasRetailProjection = !retailResult.error
  const baseDeals = hasRetailProjection
    ? (legacyDeals || []).filter(deal => !isRetailPromotionDeal(deal))
    : (legacyDeals || [])
  const retailDeals = hasRetailProjection
    ? deduplicateRetailPromotions((retailResult.data || [])
        .map(row => toRetailPromotionViewModel(row, { trustedProjection: true }))
        .filter(promotion => promotion.isActive))
        .map(retailPromotionToGoodDeal)
    : []
  const deals = [...baseDeals.map(normalizePublishedGoodDeal), ...retailDeals]
  const dealIds = deals.map(item => item.id).filter(Boolean)
  let territories = []

  if (dealIds.length > 0) {
    const territoriesResult = await client
      .from("good_deal_territories")
      .select("good_deal_id, commune")
      .in("good_deal_id", dealIds)

    if (territoriesResult.error) throw territoriesResult.error
    territories = territoriesResult.data || []
  }

  const territoriesByDeal = territories.reduce((byDeal, item) => {
    if (!byDeal[item.good_deal_id]) byDeal[item.good_deal_id] = []
    byDeal[item.good_deal_id].push(item.commune)
    return byDeal
  }, {})

  return deals.map(item => ({
    ...item,
    targeted_communes: territoriesByDeal[item.id] || [],
  }))
}
