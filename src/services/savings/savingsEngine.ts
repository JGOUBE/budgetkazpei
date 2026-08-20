import { normalizeMerchantName } from "../../features/shopping/services/priceHistory.ts"
import { normalizeProductName } from "../../features/shopping/services/normalizer.ts"
import { classifyLineRejectionReason } from "../scan/receiptRules.ts"

const MIN_TRUSTED_CONFIDENCE = 85
const MIN_SAVING = 0.1

const NON_PRODUCT_TYPES = new Set([
  "category",
  "department",
  "discount",
  "header",
  "meta",
  "ocr_noise",
  "promotion",
  "receipt_meta",
  "section",
  "section_subtotal",
  "subtotal",
  "technical",
  "total",
])

// Lexique sémantique de rayons et de qualificatifs. Une ligne n'est rejetée
// que lorsque tous ses mots décrivent un rayon, et non un produit précis.
const DEPARTMENT_WORDS = new Set([
  "animalerie", "bazar", "boisson", "boissons", "boucherie", "boulangerie",
  "charcuterie", "coupe", "cremerie", "entretien", "epicerie", "fleurs",
  "frais", "fruits", "hygiene", "legume", "legumes", "liquide", "liquides",
  "plantes", "rayon", "sale", "salee", "sucre", "sucree", "surgeles",
  "traiteur", "ultra", "volaille",
])

const BROAD_PRODUCT_WORDS = new Set([
  "aliment", "article", "boisson", "fromage", "jus", "lait", "pain", "produit",
  "viande",
])

function numberValue(value: unknown) {
  const parsed = Number(String(value ?? "").replace(",", "."))
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizedText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function itemLabel(item: Record<string, any> = {}) {
  return String(
    item.canonical_name
      || item.market_canonical_name
      || item.product_name
      || item.corrected_name
      || item.raw_name
      || item.name
      || item.normalized_name
      || "",
  ).trim()
}

function itemSourceText(item: Record<string, any> = {}) {
  return String(
    item.source_line
      || item.raw_text
      || item.ocr_name
      || item.original_name
      || itemLabel(item),
  ).trim()
}

function normalizeStatus(item: Record<string, any> = {}) {
  return normalizedText(item.item_status || item.review_status || item.status || "").replace(/ /g, "_")
}

function isUserValidated(item: Record<string, any> = {}) {
  const status = normalizeStatus(item)
  return item.user_validated === true || status === "user_validated" || status === "validated"
}

export function isGenericDepartmentLabel(value = "") {
  const tokens = normalizedText(value).split(" ").filter(Boolean)
  return tokens.length > 0 && tokens.every(token => DEPARTMENT_WORDS.has(token))
}

function isStandaloneAdjustment(value = "") {
  const clean = normalizedText(value)
  return /^(?:bon|coupon|promo|promotion|remise|reduction|avantage)(?: (?:carte|fidelite|immediate|prix))?$/.test(clean)
}

export function evaluateSavingsProductEligibility(item: Record<string, any> = {}) {
  const label = itemLabel(item)
  const source = itemSourceText(item)
  const explicitTypes = [item.line_type, item.item_type, item.type]
    .map(value => normalizedText(value || "").replace(/ /g, "_"))
    .filter(Boolean)
  const status = normalizeStatus(item)
  const confidenceRaw = item.confidence_score ?? item.item_quality_score ?? item.confidence ?? null
  const confidence = confidenceRaw == null || confidenceRaw === "" ? null : numberValue(confidenceRaw)

  if (!label) return { eligible: false, reason: "missing_product_name" }
  if (item.eligible_for_courses === false) return { eligible: false, reason: "not_eligible_for_courses" }
  if (explicitTypes.some(type => NON_PRODUCT_TYPES.has(type))) return { eligible: false, reason: "non_product_type" }
  if (item.needs_review === true) return { eligible: false, reason: "needs_review" }
  if (["needs_review", "a_verifier", "rejected"].includes(status)) return { eligible: false, reason: "unvalidated_identity" }
  if (confidence !== null && confidence < MIN_TRUSTED_CONFIDENCE && !isUserValidated(item)) {
    return { eligible: false, reason: "low_confidence" }
  }
  if (classifyLineRejectionReason(source) || classifyLineRejectionReason(label)) {
    return { eligible: false, reason: "receipt_non_product_line" }
  }
  if (isStandaloneAdjustment(label)) return { eligible: false, reason: "standalone_adjustment" }
  if (isGenericDepartmentLabel(label)) return { eligible: false, reason: "generic_department" }

  return { eligible: true, reason: "trusted_product" }
}

type PackageInfo = {
  family: "mass" | "volume" | "count" | "unknown"
  baseAmount: number
  signature: string
  unitLabel: string
}

function normalizeUnit(unit = "") {
  const clean = normalizedText(unit)
  if (["kg", "kgs", "kilogramme", "kilogrammes"].includes(clean)) return { family: "mass", factor: 1, unitLabel: "€/kg" }
  if (["g", "gr", "gramme", "grammes"].includes(clean)) return { family: "mass", factor: 0.001, unitLabel: "€/kg" }
  if (["l", "litre", "litres"].includes(clean)) return { family: "volume", factor: 1, unitLabel: "€/L" }
  if (clean === "cl") return { family: "volume", factor: 0.01, unitLabel: "€/L" }
  if (clean === "ml") return { family: "volume", factor: 0.001, unitLabel: "€/L" }
  if (["piece", "pieces", "unite", "unites", "x", "lot", "pack"].includes(clean)) return { family: "count", factor: 1, unitLabel: "€/unité" }
  return null
}

export function extractComparablePackage(item: Record<string, any> = {}): PackageInfo {
  const rawLabel = String(item.product_name || item.corrected_name || item.canonical_name || item.name || "")
  const formatMatch = rawLabel.match(/\b(\d+(?:[,.]\d+)?)\s*(kg|kgs|kilogrammes?|g|gr|grammes?|l|litres?|cl|ml)\b/i)
  const lotMatch = rawLabel.match(/\b(?:lot|pack)\s*(?:de\s*)?(\d+)\b|\b(\d+)\s*(?:x|pcs?|pieces?|unit[eé]s?)\b/i)

  if (formatMatch) {
    const normalized = normalizeUnit(formatMatch[2])
    const quantity = numberValue(formatMatch[1])
    if (normalized && quantity > 0) {
      const baseAmount = quantity * normalized.factor
      return {
        family: normalized.family as PackageInfo["family"],
        baseAmount,
        signature: `${normalized.family}:${baseAmount.toFixed(4)}`,
        unitLabel: normalized.unitLabel,
      }
    }
  }

  if (lotMatch) {
    const count = numberValue(lotMatch[1] || lotMatch[2])
    if (count > 0) return { family: "count", baseAmount: count, signature: `count:${count}`, unitLabel: "€/unité" }
  }

  const explicitUnit = normalizeUnit(item.unit || item.format_unit || "")
  const explicitQuantity = numberValue(item.weight || item.volume || item.package_quantity || item.quantity)
  // "1 pièce" est la valeur historique par défaut de shopping_items. Sans
  // autre indice, elle ne prouve pas le format du produit.
  const defaultPieceOnly = explicitUnit?.family === "count" && explicitQuantity === 1 && !item.package_quantity
  if (explicitUnit && explicitQuantity > 0 && !defaultPieceOnly) {
    const baseAmount = explicitQuantity * explicitUnit.factor
    return {
      family: explicitUnit.family as PackageInfo["family"],
      baseAmount,
      signature: `${explicitUnit.family}:${baseAmount.toFixed(4)}`,
      unitLabel: explicitUnit.unitLabel,
    }
  }

  return { family: "unknown", baseAmount: 0, signature: "unknown", unitLabel: "" }
}

function isSpecificName(value = "") {
  const tokens = normalizedText(value).split(" ").filter(Boolean)
  if (tokens.length === 0) return false
  if (tokens.every(token => DEPARTMENT_WORDS.has(token))) return false
  if (tokens.length === 1 && BROAD_PRODUCT_WORDS.has(tokens[0])) return false
  return true
}

export function buildComparableProductIdentity(item: Record<string, any> = {}) {
  const eligibility = evaluateSavingsProductEligibility(item)
  if (!eligibility.eligible) return null

  const packageInfo = extractComparablePackage(item)
  const barcode = normalizedText(item.barcode || item.ean || item.gtin || "")
  if (/^\d{8,14}$/.test(barcode)) {
    return { key: `barcode:${barcode}`, kind: "structured", label: itemLabel(item), packageInfo }
  }

  const structuredId = normalizedText(item.product_id || item.product_key || item.known_product_id || "")
  if (structuredId) {
    return { key: `product:${structuredId}`, kind: "structured", label: itemLabel(item), packageInfo }
  }

  const canonical = String(item.canonical_name || item.market_canonical_name || "").trim()
  if (canonical && isSpecificName(canonical)) {
    return { key: `canonical:${normalizeProductName(canonical)}`, kind: "canonical", label: canonical, packageInfo }
  }

  const normalizedName = normalizeProductName(item.normalized_name || itemLabel(item))
  const hasReliableFallback = isSpecificName(normalizedName)
    && packageInfo.family !== "unknown"
    && (normalizedText(item.brand || "") || normalizedName.split(" ").length >= 2)

  if (!hasReliableFallback) return null
  return { key: `name:${normalizedName}`, kind: "normalized_with_format", label: itemLabel(item), packageInfo }
}

function observationDate(item: Record<string, any> = {}) {
  const raw = item.purchase_date || item.created_at || item.date || item.scanned_at || ""
  const parsed = raw ? new Date(raw) : null
  return parsed && Number.isFinite(parsed.getTime()) ? parsed.toISOString() : ""
}

function comparablePrice(item: Record<string, any>, packageInfo: PackageInfo) {
  const rawPrice = numberValue(item.price ?? item.total_price ?? item.unit_price)
  const unitPrice = numberValue(item.price_per_unit ?? item.price_per_kg ?? item.price_per_liter)
  return { rawPrice, unitPrice, packageInfo }
}

function compareObservations(reference: any, alternative: any) {
  const referencePackage = reference.packageInfo as PackageInfo
  const alternativePackage = alternative.packageInfo as PackageInfo

  if (referencePackage.signature === alternativePackage.signature) {
    if (reference.rawPrice <= 0 || alternative.rawPrice <= 0) return null
    return {
      referencePrice: reference.rawPrice,
      alternativePrice: alternative.rawPrice,
      potentialSaving: reference.rawPrice - alternative.rawPrice,
      normalized: false,
      unitLabel: "",
    }
  }

  const sameKnownFamily = referencePackage.family !== "unknown"
    && referencePackage.family === alternativePackage.family
  if (!sameKnownFamily || reference.unitPrice <= 0 || alternative.unitPrice <= 0 || referencePackage.baseAmount <= 0) return null

  return {
    referencePrice: reference.unitPrice,
    alternativePrice: alternative.unitPrice,
    potentialSaving: (reference.unitPrice - alternative.unitPrice) * referencePackage.baseAmount,
    normalized: true,
    unitLabel: referencePackage.unitLabel,
  }
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function deduplicateObservations(observations: any[]) {
  const seen = new Set<string>()
  return observations.filter(observation => {
    const sourceId = observation.item.receipt_id || observation.item.transaction_id || observation.item.id || ""
    const key = [sourceId, observation.store, observation.date.slice(0, 10), observation.rawPrice, observation.packageInfo.signature].join("|")
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function buildReliableSavingsSuggestions(shoppingItems: any[] = []) {
  const groups = new Map<string, any[]>()

  for (const item of Array.isArray(shoppingItems) ? shoppingItems : []) {
    const identity = buildComparableProductIdentity(item)
    const store = normalizeMerchantName(item.store || item.store_name || item.merchant_name || "")
    const date = observationDate(item)
    if (!identity || !store || store === "Magasin non renseigne" || !date) continue

    const prices = comparablePrice(item, identity.packageInfo)
    if (prices.rawPrice <= 0) continue

    const observation = { item, identity, store, date, ...prices }
    const rows = groups.get(identity.key) || []
    rows.push(observation)
    groups.set(identity.key, rows)
  }

  const suggestions: any[] = []

  for (const observations of groups.values()) {
    const rows = deduplicateObservations(observations)
      .sort((a, b) => b.date.localeCompare(a.date))
    const stores = new Set(rows.map(row => row.store))
    if (rows.length < 2 || stores.size < 2) continue

    const reference = rows[0]
    const alternatives = rows
      .filter(row => row.store !== reference.store)
      .map(row => ({ row, comparison: compareObservations(reference, row) }))
      .filter(entry => entry.comparison && entry.comparison.potentialSaving >= MIN_SAVING)
      .sort((a, b) => b.comparison.potentialSaving - a.comparison.potentialSaving)

    const best = alternatives[0]
    if (!best) continue

    suggestions.push({
      productKey: reference.identity.key,
      product: reference.identity.label,
      identityKind: reference.identity.kind,
      referenceStore: reference.store,
      bestStore: best.row.store,
      referencePrice: roundMoney(best.comparison.referencePrice),
      alternativePrice: roundMoney(best.comparison.alternativePrice),
      potentialSaving: roundMoney(best.comparison.potentialSaving),
      normalizedComparison: best.comparison.normalized,
      unitLabel: best.comparison.unitLabel,
      referenceDate: reference.date,
      lastObservedAt: best.row.date,
      observationsCount: rows.length,
      comparedStoresCount: stores.size,
      wording: "historical_observation",
    })
  }

  return suggestions
    .filter(item => Number.isFinite(item.potentialSaving) && item.potentialSaving > 0)
    .sort((a, b) => b.potentialSaving - a.potentialSaving)
}

export function buildSavingsInsights({
  shoppingItems = [],
}: {
  shoppingItems?: any[]
  transactions?: any[]
  language?: string
} = {}) {
  const suggestions = buildReliableSavingsSuggestions(shoppingItems)
  const totalPotential = roundMoney(suggestions.reduce((sum, item) => sum + item.potentialSaving, 0))

  return {
    totalPotential,
    // Compatibilité interne temporaire avec l'ancien écran. Le total n'est
    // plus présenté comme une estimation hebdomadaire.
    weeklyPotential: totalPotential,
    suggestions,
    comparableProductsCount: suggestions.length,
    hasReliableComparison: suggestions.length > 0,
  }
}
