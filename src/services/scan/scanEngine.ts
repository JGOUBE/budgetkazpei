import { optimizeReceiptImage } from "./imageOptimizer"
import { getDefaultOCRProvider, type OCRProvider } from "./ocrProvider"
import { classifyReceipt } from "./receiptClassifier"
import { resolveMarketProducts } from "./marketProductResolver"
import { extractReceiptDueTotal, extractReceiptTotal, mergeReceiptItems, normalizeReceiptDate, parseReceipt } from "./receiptParser"
import { validateParsedReceipt } from "./receiptValidator"
import { ScanError } from "./scanErrors"

export type ScanStep =
  | "optimizing"
  | "reading"
  | "store"
  | "products"
  | "total"
  | "checking"
  | "done"
  | "failed"

export type ScanProgress = {
  step: ScanStep
  label: string
  progress: number
}

export type ScanEngineOptions = {
  provider?: OCRProvider
  onProgress?: (progress: ScanProgress) => void
  plan?: "free" | "premium" | "premium_plus" | string
}

function emit(onProgress: ScanEngineOptions["onProgress"], step: ScanStep, label: string, progress: number) {
  onProgress?.({ step, label, progress })
}

function getEscalationReason(parsed: any, ocr: any) {
  const reasons = []
  if (!parsed.total_amount) reasons.push("total_absent")
  if (parsed.date_status !== "detected") reasons.push("date_absente")
  if ((parsed.items || []).length < 3) reasons.push("moins_de_3_articles")
  if (Number(ocr.confidence || 0) < 65) reasons.push("ocr_faible")
  if (String(ocr.text || "").split(/\r?\n/).length > 80) reasons.push("ticket_long")
  if (Number(parsed.confidence_score || 0) < 65) reasons.push("confiance_faible")
  return reasons.join(",")
}

function bestItemList(...lists: any[][]) {
  return lists.reduce<any[]>((best, list) => {
    return (list || []).length > best.length ? list || [] : best
  }, [])
}

function declaredReceiptItemCount(text = "") {
  const match = String(text || "").match(/\btotal\s+(\d{1,3})\s+articles?\b/i)
  return match ? Number(match[1]) || 0 : 0
}

function repairReceiptTotal(total: unknown, text = "") {
  const current = Number(total || 0)
  const dueTotal = extractReceiptDueTotal(text)
  if (dueTotal > 0) return dueTotal

  const textTotal = extractReceiptTotal(text)
  const declaredCount = declaredReceiptItemCount(text)
  if (declaredCount > 0 && Math.abs(current - declaredCount) < 0.01 && textTotal > 0) return textTotal

  return current
}

function estimateTotalFromItems(items: any[] = []) {
  const total = (items || []).reduce((sum, item) => {
    return sum + Number(item?.total_price ?? item?.price ?? item?.unit_price ?? 0)
  }, 0)
  return Number(total.toFixed(2))
}

function resolveFinalScanStatus({
  budgetStatus,
  itemsQualityStatus,
  smartShoppingSafe,
}: {
  budgetStatus: string
  itemsQualityStatus: string
  smartShoppingSafe: boolean
}) {
  if (budgetStatus === "rejected") return "rejected"
  if (budgetStatus !== "reliable") return "budget_needs_review"
  if (smartShoppingSafe && itemsQualityStatus === "trusted") return "budget_ok_articles_ok"
  if (itemsQualityStatus === "partial") return "budget_ok_articles_partial"
  return "budget_ok_articles_blocked"
}


function normalizeFinalItemText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[€£$]/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function roundMoney(value: unknown) {
  return Math.round((Number(value) || 0) * 100) / 100
}

function normalizeScanReceiptDate(value: unknown) {
  const raw = String(value || "").trim()
  if (!raw) return ""

  const direct = normalizeReceiptDate(raw)
  if (direct) return direct

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) {
    const year = iso[1]
    const month = String(Number(iso[2])).padStart(2, "0")
    const day = String(Number(iso[3])).padStart(2, "0")
    return `${year}-${month}-${day}`
  }

  const fr = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/)
  if (fr) {
    const dayNumber = Number(fr[1])
    const monthNumber = Number(fr[2])
    if (dayNumber < 1 || dayNumber > 31 || monthNumber < 1 || monthNumber > 12) return ""

    const day = String(dayNumber).padStart(2, "0")
    const month = String(monthNumber).padStart(2, "0")
    const year = fr[3].length === 2 ? `20${fr[3]}` : fr[3]

    return `${year}-${month}-${day}`
  }

  return ""
}

function positiveMoney(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? roundMoney(number) : 0
}

function rawForItemMath(item: any = {}) {
  return String(item?.raw_text || item?.source_line || item?.ocr_name || item?.name || "").trim()
}

function moneyTokenPattern(amount = 0) {
  return amount.toFixed(2).replace(".", "[,.]")
}

function quantityTokenPattern(quantity = 1) {
  return String(quantity).replace(".", "[,.]")
}

function rawShowsExplicitQuantity(raw = "", unitPrice = 0, quantity = 1) {
  if (unitPrice <= 0 || quantity <= 1) return false

  const text = String(raw || "")
    .replace(/[€£$]/g, "€")
    .replace(/×/g, "x")
    .replace(/\s+/g, " ")
    .trim()

  if (!text) return false

  const unitPattern = moneyTokenPattern(unitPrice)
  const quantityPattern = quantityTokenPattern(quantity)

  // Seules les formes explicites prouvent une quantité.
  // Sur les tickets E.Leclerc, la colonne après le prix est souvent le code TVA,
  // pas une quantité. Exemple : "POULET LE JAUNE 7.69 2" = 7,69 € / TVA 2.
  return [
    new RegExp(`(?:^|\\s)${quantityPattern}\\s*(?:kg|g|gr|l|cl|ml)?\\s*[x*]\\s*${unitPattern}(?:\\s*€|\\s*/\\s*(?:kg|g|gr|l|cl|ml))?`, "i"),
    new RegExp(`(?:^|\\s)${unitPattern}\\s*(?:€)?\\s*[x*]\\s*${quantityPattern}(?:\\s|$)`, "i"),
    new RegExp(`\\b(qte|quantite|quantité|lot)\\s*[:=]?\\s*${quantityPattern}\\b.*\\b${unitPattern}\\b`, "i"),
  ].some(pattern => pattern.test(text))
}

function extractTrailingVatCodePrice(raw = "") {
  const text = String(raw || "")
    .replace(/[€£$]/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  const match = text.match(/(\d+(?:[,.]\d{2}))\s+([123])\s*$/)
  if (!match) return { price: 0, vatCode: 0 }

  return {
    price: roundMoney(String(match[1]).replace(",", ".")),
    vatCode: Number(match[2]) || 0,
  }
}

function rawLooksLikeTrailingVatCode(raw = "", unitPrice = 0, quantity = 1) {
  const qty = Number(quantity)
  if (![1, 2, 3].includes(qty)) return false
  if (rawShowsExplicitQuantity(raw, unitPrice, qty)) return false

  const evidence = extractTrailingVatCodePrice(raw)
  if (!evidence.price || evidence.vatCode !== qty) return false

  if (unitPrice > 0 && !totalsAlmostEqual(evidence.price, unitPrice, 0.03)) {
    return false
  }

  return true
}

function normalizedItemQuantity(item: any = {}) {
  const quantity = Number(item?.quantity ?? 1)
  const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 1
  const unitPrice = positiveMoney(item?.unit_price)
  const raw = rawForItemMath(item)

  if (rawLooksLikeTrailingVatCode(raw, unitPrice, safeQuantity)) {
    return 1
  }

  return safeQuantity
}

function rawShowsUnitPriceAndQuantity(raw = "", unitPrice = 0, quantity = 1) {
  return rawShowsExplicitQuantity(raw, unitPrice, quantity)
}

function finalItemQuantity(item: any = {}) {
  return normalizedItemQuantity(item)
}

function resolveQuantityAwareItemPrice(item: any = {}) {
  const raw = rawForItemMath(item)
  const rawQuantity = Number(item?.quantity ?? 1) || 1
  const unitPrice = positiveMoney(item?.unit_price)
  const explicitTotal = positiveMoney(item?.total_price)
  const explicitPrice = positiveMoney(item?.price)
  const trailingVat = extractTrailingVatCodePrice(raw)

  // Cas clé E.Leclerc : "prix + 1/2/3" = prix TTC + code TVA.
  // On garde le prix visible et on annule la multiplication inventée par Vision.
  if (rawLooksLikeTrailingVatCode(raw, unitPrice, rawQuantity)) {
    return trailingVat.price || unitPrice || explicitPrice || explicitTotal
  }

  const quantity = normalizedItemQuantity(item)
  const computedTotal = quantity > 1 && unitPrice > 0
    ? roundMoney(quantity * unitPrice)
    : 0

  if (computedTotal > 0 && rawShowsExplicitQuantity(raw, unitPrice, quantity)) {
    return computedTotal
  }

  if (explicitTotal > 0) return explicitTotal
  if (explicitPrice > 0) return explicitPrice
  return unitPrice || trailingVat.price || 0
}

function finalItemUnitPrice(item: any = {}, finalPrice = 0) {
  const raw = rawForItemMath(item)
  const rawQuantity = Number(item?.quantity ?? 1) || 1
  const unitPrice = positiveMoney(item?.unit_price)
  const trailingVat = extractTrailingVatCodePrice(raw)

  if (rawLooksLikeTrailingVatCode(raw, unitPrice, rawQuantity)) {
    return trailingVat.price || unitPrice || finalPrice
  }

  const quantity = finalItemQuantity(item)
  if (quantity > 1 && unitPrice > 0 && rawShowsExplicitQuantity(raw, unitPrice, quantity)) {
    return unitPrice
  }

  return unitPrice || (quantity > 1 ? roundMoney(finalPrice / quantity) : finalPrice)
}

function isPlausibleItemAmount(value = 0, receiptTotal = 0) {
  if (value <= 0) return false
  if (receiptTotal > 0) return value <= Math.max(30, receiptTotal * 1.15)
  return value <= 100
}

function finalItemAmount(item: any = {}, receiptTotal = 0) {
  const total = Number(receiptTotal || 0)
  const resolved = resolveQuantityAwareItemPrice(item)

  if (isPlausibleItemAmount(resolved, total)) {
    return roundMoney(resolved)
  }

  const raw = finalItemRawText(item)
  const first = resolved || 0

  if (first > 0 && hasFinalProductSignal(raw)) {
    const candidates = [
      first % 10,
      first % 100,
      first / 10,
      first / 100,
    ]
      .map(roundMoney)
      .filter(value => value >= 0.20 && value <= 30 && (!total || value <= total))

    if (candidates.length > 0) return candidates[0]
  }

  return roundMoney(first)
}

function finalItemRawText(item: any = {}) {
  return String(item?.name || item?.corrected_name || item?.ocr_name || item?.raw_text || item?.source_line || "").trim()
}

const FINAL_ITEM_PRODUCT_WORDS = [
  "chips",
  "rosette",
  "fuet",
  "jambon",
  "saucisson",
  "saucisses",
  "tlj",
  "barre",
  "cereal",
  "cereale",
  "choco",
  "mimolette",
  "wimolette",
  "gouda",
  "camembert",
  "panenbert",
  "gouverneur",
  "crevette",
  "crevetti",
  "brocoli",
  "nugget",
  "nuggets",
  "veggie",
  "huile",
  "lesieur",
  "tournesol",
  "pomme",
  "terre",
  "salade",
  "echalote",
  "champignon",
  "dolce",
  "mousse",
  "kinder",
  "bueno",
  "joker",
  "jus",
  "riz",
  "pates",
  "thon",
  "oeuf",
  "oeufs",
  "matines",
]

const FINAL_SECTION_WORDS = [
  "charcuterie",
  "charcuterte",
  "charcuter",
  "epicerie",
  "epicerte",
  "cremerie",
  "crererie",
  "surgeles",
  "sungeles",
  "surgele",
  "ultra frais",
  "boissons",
  "boisson",
  "alcool",
  "volaille",
  "fleurs",
  "plantes",
  "fruits",
  "legumes",
  "ppi",
]

function hasFinalProductSignal(raw = "") {
  const clean = normalizeFinalItemText(raw)
  if (!clean) return false
  if (/\b\d{8,14}\b/.test(clean)) return true
  if (/\b\d+(?:[,.]\d+)?\s*(g|gr|kg|ml|cl|l)\b/.test(clean)) return true
  if (/\b\d+\s*(tranches?|tr|x)\b/.test(clean)) return true
  return FINAL_ITEM_PRODUCT_WORDS.some(word => clean.includes(word))
}

function isFinalSectionSubtotal(raw = "") {
  const clean = normalizeFinalItemText(raw)
  if (!clean) return false
  if (hasFinalProductSignal(clean)) return false

  const hasSectionWord = FINAL_SECTION_WORDS.some(word => clean.includes(word))
  if (!hasSectionWord) return false

  const tokens = clean.split(" ").filter(Boolean)
  const shortLine = tokens.length <= 5
  const departmentSuffix = /\b(1s|ls|l5|is)\b/.test(clean)
  const sectionOnly = /^(charcuter(?:ie|te)?|epicer(?:ie|te)(?: sucree| salee)?|cremerie|crererie|surgeles|sungeles|ultra frais|boissons(?: sans alcool)?|volaille|ppi)(?:\s+(?:1s|ls|l5|is))?$/.test(clean)

  return sectionOnly || departmentSuffix || shortLine
}

function isFinalNonProductLine(raw = "") {
  const clean = normalizeFinalItemText(raw)
  if (!clean) return true

  if (/\b(carte|corte)\s+bleue\b/.test(clean)) return true
  if (/\b(cb|especes|cash|monnaie|rendu|paiement)\b/.test(clean)) return true
  if (/\b(total|tui?al|reste a payer|net a payer|a payer)\b/.test(clean)) return true
  if (/\b(tva|ttc|ht|ventilation|duplicata|operation|vente|bienvenue|merci|ticket|caisse|caissier|tel|telephone|client|fidelite|points?)\b/.test(clean)) return true
  if (isFinalSectionSubtotal(clean)) return true

  const tokens = clean.split(" ").filter(Boolean)
  const letters = clean.replace(/[^a-z]/g, "")
  const hasProductSignal = hasFinalProductSignal(clean)

  if (!hasProductSignal && tokens.length <= 3 && letters.length <= 8) return true
  if (!hasProductSignal && tokens.every(token => token.length <= 3)) return true
  if (!hasProductSignal && letters.length < 5) return true

  return false
}

function cleanFinalItemName(raw = "") {
  return String(raw || "")
    .replace(/\bPRIX\s+PROMOTION\b/gi, " ")
    .replace(/\bEUR\b/gi, " ")
    .replace(/[=;:]+$/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function canonicalFinalProductKey(raw = "") {
  const clean = normalizeFinalItemText(cleanFinalItemName(raw))
  const known = FINAL_ITEM_PRODUCT_WORDS.find(word => clean.includes(word))
  if (known) return known

  return clean
    .split(" ")
    .filter(token => token.length >= 4)
    .filter(token => !/^\d+$/.test(token))
    .filter(token => !["prix", "promotion", "eur", "euro", "euros", "150g", "150gr", "160g", "80g"].includes(token))
    .slice(0, 3)
    .join(" ")
}

export function sanitizeFinalReceiptItems(items: any[] = [], receiptTotal = 0) {
  const rejected: any[] = []
  const kept: any[] = []
  const seen = new Set<string>()

  for (const item of items || []) {
    const raw = finalItemRawText(item)
    const price = finalItemAmount(item, receiptTotal)
    const cleanName = cleanFinalItemName(raw)
    const normalizedName = normalizeFinalItemText(cleanName)

    let reason = ""
    if (!cleanName || price <= 0) reason = "empty_or_priceless_item"
    else if (isFinalNonProductLine(cleanName)) reason = isFinalSectionSubtotal(cleanName) ? "section_subtotal_final_filter" : "non_product_final_filter"

    const canonicalProductKey = canonicalFinalProductKey(cleanName)
    const key = `${canonicalProductKey || normalizedName}|${price.toFixed(2)}`
    if (!reason && seen.has(key)) reason = "duplicate_final_item"

    if (reason) {
      rejected.push({
        line: raw,
        name: cleanName,
        amount: price,
        reason,
        item_status: "rejected",
      })
      continue
    }

    seen.add(key)

    const confidence = Number(item?.confidence_score ?? item?.item_quality_score ?? 0)
    const keepNeedsReview = Boolean(item?.needs_review)
      || confidence < 70
      || String(item?.item_status || item?.status || "").includes("review")
      || String(item?.item_status || item?.status || "").includes("verifier")

    kept.push({
      ...item,
      name: cleanName,
      corrected_name: String(item?.corrected_name || cleanName).trim() || cleanName,
      ocr_name: String(item?.ocr_name || raw || cleanName).trim(),
      total_price: price,
      price,
      unit_price: finalItemUnitPrice(item, price),
      quantity: finalItemQuantity(item),
      item_status: keepNeedsReview ? "a_verifier" : (item?.item_status || item?.status || "detected"),
      status: keepNeedsReview ? "a_verifier" : (item?.status || item?.item_status || "detected"),
      review_status: keepNeedsReview ? "needs_review" : (item?.review_status || "trusted"),
      needs_review: keepNeedsReview,
      item_quality_score: item?.item_quality_score ?? item?.confidence_score ?? (keepNeedsReview ? 55 : 88),
    })
  }

  const suspiciousRatio = items.length > 0 ? rejected.length / items.length : 0
  const blocksSmartShopping = rejected.length > 0 || suspiciousRatio > 0.15

  return {
    items: kept,
    rejected,
    rejected_count: rejected.length,
    rejected_lines: rejected.map(item => item.line),
    rejected_reasons: rejected.reduce<Record<string, number>>((acc, item) => {
      acc[item.reason] = (acc[item.reason] || 0) + 1
      return acc
    }, {}),
    blocksSmartShopping,
  }
}


function readOcrMetric(ocr: any, ...keys: string[]) {
  for (const key of keys) {
    const fromMetrics = ocr?.metrics?.[key]
    if (fromMetrics !== undefined && fromMetrics !== null && fromMetrics !== "") return fromMetrics
    const fromRoot = ocr?.[key]
    if (fromRoot !== undefined && fromRoot !== null && fromRoot !== "") return fromRoot
  }
  return null
}

function readOcrNumber(ocr: any, ...keys: string[]) {
  const value = readOcrMetric(ocr, ...keys)
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function readOcrBoolean(ocr: any, ...keys: string[]) {
  const value = readOcrMetric(ocr, ...keys)
  return value === true || value === "true"
}

function totalsAlmostEqual(a: unknown, b: unknown, tolerance = 0.03) {
  const left = Number(a || 0)
  const right = Number(b || 0)
  if (left <= 0 || right <= 0) return false
  return Math.abs(left - right) <= tolerance
}


function amountCandidatesFromText(value = "") {
  return Array.from(String(value || "").matchAll(/(\d+(?:[,.]\d{2}))/g))
    .map(match => roundMoney(String(match[1]).replace(",", ".")))
    .filter(value => Number.isFinite(value) && value > 0)
}

function hasVisiblePriceMismatch(item: any = {}, finalPrice = 0, receiptTotal = 0) {
  const evidence = [item?.raw_text, item?.source_line]
    .map(value => String(value || ""))
    .find(Boolean) || ""

  if (!evidence.trim()) return false

  const candidates = amountCandidatesFromText(evidence)
    .filter(value => value >= 0.2 && (!receiptTotal || value <= Math.max(receiptTotal, 40)))

  if (candidates.length === 0) return false

  if (candidates.some(value => totalsAlmostEqual(value, finalPrice, 0.03))) {
    return false
  }

  const quantity = normalizedItemQuantity(item)
  const unitPrice = positiveMoney(item?.unit_price)
  const computedTotal = quantity > 1 && unitPrice > 0
    ? roundMoney(quantity * unitPrice)
    : 0

  if (
    computedTotal > 0 &&
    totalsAlmostEqual(computedTotal, finalPrice, 0.03) &&
    rawShowsUnitPriceAndQuantity(evidence, unitPrice, quantity)
  ) {
    return false
  }

  return true
}

function markReceiptItemsForPartialLearning(items: any[] = [], receiptTotal = 0) {
  return (items || []).map(item => {
    const price = finalItemAmount(item, receiptTotal)
    const finalQuantity = finalItemQuantity(item)
    const finalUnitPrice = finalItemUnitPrice(item, price)
    const confidence = Number(item?.confidence_score ?? item?.item_quality_score ?? item?.confidence ?? 0)
    const status = normalizeFinalItemText(String(item?.item_status || item?.status || item?.review_status || ""))
    const alreadyValidated = status.includes("user validated") || status.includes("user_validated")
    const alreadyRejected = status.includes("rejected")
    const alreadyReview = Boolean(item?.needs_review) || status.includes("review") || status.includes("verifier")
    const visibleMismatch = hasVisiblePriceMismatch(item, price, receiptTotal)
    const missingEvidence = !String(item?.raw_text || item?.source_line || item?.ocr_name || item?.name || "").trim()
    const mustReview = alreadyRejected || alreadyReview || visibleMismatch || missingEvidence || (confidence > 0 && confidence < 70)

    if (alreadyRejected) {
      return {
        ...item,
        total_price: price,
        price,
        unit_price: finalUnitPrice,
        quantity: finalQuantity,
        item_status: "rejected",
        status: "rejected",
        review_status: "rejected",
        needs_review: true,
        item_quality_score: item?.item_quality_score ?? confidence ?? 40,
      }
    }

    if (mustReview) {
      return {
        ...item,
        total_price: price,
        price,
        unit_price: finalUnitPrice,
        quantity: finalQuantity,
        item_status: "a_verifier",
        status: "a_verifier",
        review_status: "needs_review",
        needs_review: true,
        item_quality_score: item?.item_quality_score ?? (confidence || 55),
        smart_shopping_excluded_reason: visibleMismatch ? "visible_price_mismatch" : "needs_review",
      }
    }

    return {
      ...item,
      total_price: price,
      price,
      unit_price: finalUnitPrice,
      quantity: finalQuantity,
      item_status: alreadyValidated ? "user_validated" : "trusted",
      status: alreadyValidated ? "user_validated" : "trusted",
      review_status: "trusted",
      needs_review: false,
      item_quality_score: item?.item_quality_score ?? (confidence || 88),
    }
  })
}

function countTrustedLearningItems(items: any[] = []) {
  return (items || []).filter(item => {
    const status = normalizeFinalItemText(String(item?.item_status || item?.status || item?.review_status || ""))
    if (item?.needs_review === true) return false
    return status.includes("trusted") || status.includes("user validated") || status.includes("user_validated")
  }).length
}

function forceTrustedVisionItems(items: any[] = []) {
  return (items || []).map(item => {
    const confidence = Math.max(88, Number(item?.confidence_score ?? item?.item_quality_score ?? 0) || 88)
    return {
      ...item,
      item_status: "trusted",
      status: "trusted",
      review_status: "trusted",
      needs_review: false,
      confidence_score: confidence,
      item_quality_score: Math.max(confidence, Number(item?.item_quality_score || 0) || confidence),
      line_type: item?.line_type || "product",
    }
  })
}

function normalizeVisionStructuredItemsForTrust(items: any[] = [], receiptTotal = 0) {
  return (items || [])
    .map(item => {
      const name = cleanFinalItemName(String(item?.name || item?.corrected_name || item?.ocr_name || item?.raw_text || item?.source_line || "").trim())
      const rawText = String(item?.raw_text || item?.source_line || item?.ocr_name || name || "").trim()
      const itemForMath = {
        ...item,
        name,
        raw_text: rawText || name,
        source_line: String(item?.source_line || rawText || name).trim() || rawText || name,
      }
      const price = finalItemAmount(itemForMath, receiptTotal)
      const quantity = finalItemQuantity(itemForMath)
      const unitPrice = finalItemUnitPrice(itemForMath, price)
      const rawConfidence = Number(item?.confidence_score ?? item?.confidence ?? item?.item_quality_score ?? 0)
      const confidenceScore = rawConfidence > 0 && rawConfidence <= 1 ? Math.round(rawConfidence * 100) : Math.round(rawConfidence || 88)

      if (!name || price <= 0) return null

      return {
        ...item,
        name,
        corrected_name: String(item?.corrected_name || name).trim() || name,
        ocr_name: String(item?.ocr_name || rawText || name).trim() || name,
        raw_text: rawText || name,
        source_line: String(item?.source_line || rawText || name).trim() || rawText || name,
        quantity,
        unit: String(item?.unit || "piece"),
        unit_price: unitPrice,
        total_price: price,
        price,
        category: String(item?.category || "alimentaire"),
        confidence_score: Math.max(88, confidenceScore),
        item_quality_score: Math.max(88, confidenceScore),
        line_type: "product",
        source: item?.source || "openai_vision",
      }
    })
    .filter(Boolean) as any[]
}

function parseJsonObjectFromText(value: unknown) {
  const raw = String(value || "").trim()
  if (!raw) return null

  const withoutFence = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim()

  try {
    return JSON.parse(withoutFence)
  } catch {
    const firstBrace = withoutFence.indexOf("{")
    const lastBrace = withoutFence.lastIndexOf("}")
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(withoutFence.slice(firstBrace, lastBrace + 1))
      } catch {
        return null
      }
    }
    return null
  }
}

function extractPrimaryVisionRawItemsForTrust(ocr: any, receiptTotal = 0) {
  const rawContent = readOcrMetric(
    ocr,
    "openaiRawContent",
    "openai_raw_content",
    "openaiRawResponseContent",
    "openai_raw_response_content",
    "openai_raw_response_body",
  )

  const parsedRaw = parseJsonObjectFromText(rawContent)
  const rawItems = Array.isArray(parsedRaw?.items) ? parsedRaw.items : []

  if (!rawItems.length) return []

  return normalizeVisionStructuredItemsForTrust(rawItems, receiptTotal)
}



export async function runSmartScan(file: File, options: ScanEngineOptions = {}) {
  const provider = options.provider || getDefaultOCRProvider()
  const scanStartedAt = performance.now()

  try {
    emit(options.onProgress, "optimizing", "Optimisation de l'image...", 12)
    const optimized = await optimizeReceiptImage(file)

    emit(options.onProgress, "reading", options.plan === "premium_plus" ? "Lecture renforcee Premium+ en cours." : "Lecture du ticket...", 30)
    const ocrStartedAt = performance.now()
    const imageMeta = {
      original_image_width: optimized.originalWidth,
      original_image_height: optimized.originalHeight,
      optimized_image_width: optimized.width,
      optimized_image_height: optimized.height,
      compression_quality: optimized.compressionQuality,
      rotation_applied: optimized.rotationApplied,
      split_segments_strategy: "vertical_3_overlap",
      split_segments_count: optimized.segments.length,
      split_segments_overlap_percent: 8,
      imageSegments: optimized.segments,
      user_plan: options.plan || "free",
    }
    const ocr = await provider.extractText(optimized.file, "", imageMeta)
    const ocrDurationMs = Math.round(performance.now() - ocrStartedAt)
    console.info("[scanner] OCR_PROVIDER_RAW_RESPONSE", {
      provider: ocr.provider,
      status: ocr.status,
      confidence: ocr.confidence,
      metrics: ocr.metrics || null,
      structured: ocr.structured || null,
      textLength: String(ocr.text || "").length,
    })

    emit(options.onProgress, "store", "Identification du magasin...", 48)
    const parsingStartedAt = performance.now()
    const parsed = parseReceipt({
      text: ocr.text,
      ocrStatus: ocr.status,
      ocrConfidence: ocr.confidence,
    })
    console.info("[scanner] OCR termine", { ok: ocr.status === "success", provider: ocr.provider })

    const structured = ocr.structured || {}
    const serverTotalNeedsReview = Boolean(structured?.total_needs_review || ocr.metrics?.totalNeedsReview)
    const serverScanStatus = String(ocr.metrics?.scanStatus || "")
    let primaryVisionItemsBeforeFinalSanitization: any[] = []
    let rawVisionStructuredItemsBeforeFinalSanitization: any[] = []
    if (structured && typeof structured === "object") {
      parsed.store_name = structured.store_name || parsed.store_name || "Enseigne non reconnue"
      parsed.merchant_name = parsed.store_name
      parsed.merchant_confidence = structured.store_name ? 90 : parsed.merchant_confidence || 0
      const structuredRawDate = structured.purchase_date || structured.date || ""
      const structuredDate = normalizeScanReceiptDate(structuredRawDate)

      if (structuredDate) {
        parsed.purchase_date = structuredDate
        parsed.date_status = "detected"
      } else if (structuredRawDate) {
        console.warn("[scanner] invalid_ocr_date", structuredRawDate)
      }
      parsed.total_amount = serverTotalNeedsReview ? 0 : repairReceiptTotal(structured.total_amount || parsed.total_amount || 0, ocr.text)
      ;(parsed as any).total_raw_text = structured.total_raw_text || ""
      ;(parsed as any).total_confidence = Number(structured.total_confidence || 0)
      ;(parsed as any).total_needs_review = serverTotalNeedsReview || Number(parsed.total_amount || 0) <= 0
      ;(parsed as any).total_source = structured.total_source || (parsed.total_amount ? "detected" : "missing_or_unreliable")
      ;(parsed as any).total_rejected_reason = structured.total_rejected_reason || ""
      ;(parsed as any).total_raw_text_verified_against_ocr = Boolean(structured.total_raw_text_verified_against_ocr)
      ;(parsed as any).openai_total_value = structured.openai_total_value ?? null
      ;(parsed as any).openai_total_raw_text = structured.openai_total_raw_text || ""
      ;(parsed as any).openai_total_confidence = structured.openai_total_confidence ?? null
      ;(parsed as any).estimated_items_sum = structured.estimated_items_sum || null
      const structuredItems = Array.isArray(structured.items) ? structured.items : []

      // V4.3 — Source de vérité Vision primary.
      // L'Edge Function peut exposer 6 articles dans openai_raw_content alors que
      // ocr.structured.items a déjà été réduit à 3 par une couche intermédiaire.
      // Pour un primary fiable, on repart donc du JSON brut OpenAI quand il existe.
      const primaryVisionRawItems = String(ocr.provider || "") === "openai_vision_primary"
        ? extractPrimaryVisionRawItemsForTrust(ocr, Number(structured.total_amount || parsed.total_amount || 0))
        : []

      const visionSourceItems = primaryVisionRawItems.length
        ? primaryVisionRawItems
        : structuredItems

      const rawVisionStructuredItems = visionSourceItems.length
        ? normalizeVisionStructuredItemsForTrust(visionSourceItems, Number(structured.total_amount || parsed.total_amount || 0))
        : []
      const parserItems = parsed.items.length ? mergeReceiptItems(parsed.items, []) : []
      const normalizedStructuredItems = visionSourceItems.length ? mergeReceiptItems(visionSourceItems, []) : []
      if (rawVisionStructuredItems.length) {
        rawVisionStructuredItemsBeforeFinalSanitization = rawVisionStructuredItems
      }
      const primaryVisionStructuredOnly = (rawVisionStructuredItems.length > 0 || normalizedStructuredItems.length > 0)
        && String(ocr.provider || "") === "openai_vision_primary"
        && (
          readOcrBoolean(ocr, "primaryVisionSufficientWithoutSplit", "primary_vision_sufficient_without_split")
          || String(readOcrMetric(ocr, "splitRetrySkippedReason", "split_retry_skipped_reason") || "") === "primary_vision_sufficient_short_ticket"
          || readOcrMetric(ocr, "splitRetryUsed", "split_retry_used") === false
        )

      if (primaryVisionStructuredOnly) {
        primaryVisionItemsBeforeFinalSanitization = rawVisionStructuredItems.length
          ? rawVisionStructuredItems
          : normalizedStructuredItems
      }

      ;(parsed as any).primary_vision_raw_items_count = primaryVisionRawItems.length
      ;(parsed as any).primary_vision_source_items_count = visionSourceItems.length

      // Quand l'Edge Function indique que la Vision primaire suffit, on ne mélange plus
      // les lignes OCR locales avec les articles Vision. Le mélange était la cause des
      // doublons et des lignes à 55 % affichées après les articles propres à 98 %.
      parsed.items = primaryVisionStructuredOnly
        ? (rawVisionStructuredItems.length ? rawVisionStructuredItems : normalizedStructuredItems)
        : bestItemList(
            mergeReceiptItems(normalizedStructuredItems, parserItems),
            normalizedStructuredItems,
            parserItems,
          )
      ;(parsed as any).primary_vision_structured_only = primaryVisionStructuredOnly
      parsed.ai_used = Boolean(ocr.metrics?.aiUsed || ocr.metrics?.openaiCalled || ocr.provider.includes("openai"))
    }
    parsed.total_amount = serverTotalNeedsReview ? 0 : repairReceiptTotal(parsed.total_amount, ocr.text)
    const scanIsUnreliableForTotal = serverTotalNeedsReview
      || ["partial_low_items", "partial_unreliable", "low_confidence", "needs_review", "manual_review_required", "long_manual_review", "long_usable_review"].some(status => serverScanStatus.includes(status))
    if (Number(parsed.total_amount || 0) <= 0 && parsed.items.length >= 3 && !scanIsUnreliableForTotal) {
      parsed.total_amount = estimateTotalFromItems(parsed.items)
      ;(parsed as any).total_status = "estimated_from_items"
      parsed.escalation_reason = [parsed.escalation_reason, "total_estime_depuis_articles"].filter(Boolean).join(",")
    } else if (scanIsUnreliableForTotal && Number(parsed.total_amount || 0) <= 0) {
      ;(parsed as any).total_status = "missing_or_unreliable"
      ;(parsed as any).total_needs_review = true
      ;(parsed as any).total_source = "missing_or_unreliable"
      ;(parsed as any).estimated_items_sum = estimateTotalFromItems(parsed.items)
      parsed.escalation_reason = [parsed.escalation_reason, "total_a_verifier"].filter(Boolean).join(",")
    }
    const rawDateDetected = String(
      structured?.purchase_date
      || structured?.date
      || parsed.purchase_date
      || ""
    )

    const normalizedDate = normalizeScanReceiptDate(rawDateDetected || parsed.purchase_date || "")
    const dateFallbackUsed = !normalizedDate

    if (dateFallbackUsed) {
      parsed.purchase_date = null
      parsed.date_status = "needs_review"
    } else {
      parsed.purchase_date = normalizedDate
      parsed.date_status = "detected"
    }
    console.info("[scanner] date_normalization", {
      raw_date_detected: rawDateDetected || null,
      normalized_date: parsed.purchase_date,
      date_status: parsed.date_status,
      date_fallback_used: dateFallbackUsed,
      fallback_scan_date: null,
    })
    const finalItemSanitization = sanitizeFinalReceiptItems(parsed.items, Number(parsed.total_amount || 0))
    const originalFinalItemsCount = parsed.items.length
    parsed.items = finalItemSanitization.items
    ;(parsed as any).parser_debug = {
      ...((parsed as any).parser_debug || {}),
      final_items_before_sanitization_count: originalFinalItemsCount,
      final_items_after_sanitization_count: finalItemSanitization.items.length,
      final_items_rejected_count: finalItemSanitization.rejected_count,
      final_items_rejected_lines: finalItemSanitization.rejected_lines,
      final_items_rejected_reasons: finalItemSanitization.rejected_reasons,
      items_rejected_lines: [
        ...(((parsed as any).parser_debug || {}).items_rejected_lines || []),
        ...finalItemSanitization.rejected,
      ],
      rejected_lines: [
        ...(((parsed as any).parser_debug || {}).rejected_lines || []),
        ...finalItemSanitization.rejected,
      ],
    }
    const visionReferenceCount = Number(
      readOcrMetric(ocr, "reliableItemsDetectedByVision", "reliable_items_detected_by_vision")
      ?? readOcrMetric(ocr, "rawItemsDetectedByVision", "raw_items_detected_by_vision", "itemsDetectedByVision", "items_detected_by_vision")
      ?? (structured?.items?.length || 0)
      ?? 0
    )
    let finalItemsSum = estimateTotalFromItems(parsed.items)
    let finalItemsRecoveryRatio = visionReferenceCount > 0 ? parsed.items.length / visionReferenceCount : 1
    const primaryVisionProviderReliable = String(ocr.provider || "") === "openai_vision_primary"
      && Number(parsed.total_amount || 0) > 0
      && (parsed as any).total_needs_review !== true
      && (parsed.items.length >= 3 || primaryVisionItemsBeforeFinalSanitization.length >= 3 || rawVisionStructuredItemsBeforeFinalSanitization.length >= 3)

    const primaryVisionBudgetReliable = primaryVisionProviderReliable
      && (
        Boolean((parsed as any).primary_vision_structured_only)
        || readOcrBoolean(ocr, "primaryVisionSufficientWithoutSplit", "primary_vision_sufficient_without_split")
        || String(readOcrMetric(ocr, "splitRetrySkippedReason", "split_retry_skipped_reason") || "") === "primary_vision_sufficient_short_ticket"
      )

    const declaredItemsCountForVisionTrust = Number(
      readOcrMetric(ocr, "declaredItemsCount", "declared_items_count")
      ?? (structured as any)?.declared_items_count
      ?? (parsed as any).declared_items_count
      ?? 0
    )
    const rawVisionItemsCount = Number(
      readOcrMetric(ocr, "rawItemsDetectedByVision", "raw_items_detected_by_vision", "itemsDetectedByVision", "items_detected_by_vision")
      ?? (structured as any)?.items?.length
      ?? rawVisionStructuredItemsBeforeFinalSanitization.length
      ?? 0
    )
    const reliableVisionItemsCount = Number(
      readOcrMetric(ocr, "reliableItemsDetectedByVision", "reliable_items_detected_by_vision")
      ?? rawVisionItemsCount
      ?? 0
    )
    const visionStructuredTrustItems = rawVisionStructuredItemsBeforeFinalSanitization.length
      ? rawVisionStructuredItemsBeforeFinalSanitization
      : primaryVisionItemsBeforeFinalSanitization
    const visionStructuredItemsSum = estimateTotalFromItems(visionStructuredTrustItems)
    const visionCalculatedItemsSum = Number(
      readOcrMetric(ocr, "calculatedItemsSum", "calculated_items_sum")
      ?? visionStructuredItemsSum
      ?? finalItemsSum
      ?? 0
    )
    const primaryVisionShortTicketReady = primaryVisionProviderReliable
      && (
        readOcrBoolean(ocr, "primaryVisionSufficientWithoutSplit", "primary_vision_sufficient_without_split")
        || String(readOcrMetric(ocr, "splitRetrySkippedReason", "split_retry_skipped_reason") || "") === "primary_vision_sufficient_short_ticket"
        || String(readOcrMetric(ocr, "scanStrategyUsed", "scan_strategy_used") || "") === "mini_single"
      )
    const visionCountsConsistent = rawVisionItemsCount <= 0
      || visionStructuredTrustItems.length === rawVisionItemsCount
      || reliableVisionItemsCount >= rawVisionItemsCount
    const declaredCountConsistent = declaredItemsCountForVisionTrust <= 0
      || rawVisionItemsCount === declaredItemsCountForVisionTrust
      || visionStructuredTrustItems.length === declaredItemsCountForVisionTrust
    const visionSumExact = totalsAlmostEqual(visionCalculatedItemsSum, parsed.total_amount, 0.05)
      || totalsAlmostEqual(visionStructuredItemsSum, parsed.total_amount, 0.05)

    // V3.8: règle forte et placée APRÈS la sanitation finale, mais basée sur les items Vision originaux.
    // Si Vision primary a lu un ticket court avec total fiable + somme articles exacte,
    // on restaure les items Vision complets au lieu de conserver seulement les 3 items survivants
    // des filtres front trop prudents.
    const primaryVisionExactShortTicket = primaryVisionShortTicketReady
      && visionStructuredTrustItems.length >= 3
      && reliableVisionItemsCount >= Math.max(visionStructuredTrustItems.length, rawVisionItemsCount || 0)
      && visionCountsConsistent
      && declaredCountConsistent
      && visionSumExact

    if (primaryVisionExactShortTicket) {
      parsed.items = forceTrustedVisionItems(visionStructuredTrustItems)
      finalItemsSum = estimateTotalFromItems(parsed.items)
      finalItemsRecoveryRatio = visionReferenceCount > 0 ? parsed.items.length / visionReferenceCount : 1
      ;(parsed as any).primary_vision_exact_short_ticket_trusted = true
      ;(parsed as any).smart_shopping_safe = true
      ;(parsed as any).items_quality_status = "trusted"
      ;(parsed as any).item_count_display_label = `${parsed.items.length} article(s)`
      ;(parsed as any).parser_debug = {
        ...((parsed as any).parser_debug || {}),
        primary_vision_exact_short_ticket_trusted: true,
        primary_vision_raw_items_count: (parsed as any).primary_vision_raw_items_count || null,
        primary_vision_source_items_count: (parsed as any).primary_vision_source_items_count || null,
        raw_vision_items_count: rawVisionItemsCount,
        reliable_vision_items_count: reliableVisionItemsCount,
        declared_items_count_for_vision_trust: declaredItemsCountForVisionTrust || null,
        vision_calculated_items_sum: visionCalculatedItemsSum || finalItemsSum,
        vision_structured_items_sum: visionStructuredItemsSum,
        restored_primary_vision_items_after_sanitization: true,
        restored_primary_vision_items_count: parsed.items.length,
        final_sanitization_survivors_before_restore: finalItemSanitization.items.length,
        final_sanitization_rejected_before_restore: finalItemSanitization.rejected_count,
        vision_trust_rule: "v4_3_raw_openai_primary_items_when_count_and_sum_exact",
      }
    } else if (primaryVisionBudgetReliable) {
      parsed.items = markReceiptItemsForPartialLearning(parsed.items, Number(parsed.total_amount || 0))
      ;(parsed as any).primary_vision_exact_short_ticket_trusted = false
      ;(parsed as any).parser_debug = {
        ...((parsed as any).parser_debug || {}),
        primary_vision_exact_short_ticket_trusted: false,
        primary_vision_trust_blocked_reason: [
          primaryVisionShortTicketReady ? "" : "primary_vision_not_marked_sufficient",
          visionStructuredTrustItems.length >= 3 ? "" : "not_enough_vision_structured_items",
          reliableVisionItemsCount >= Math.max(visionStructuredTrustItems.length, rawVisionItemsCount || 0) ? "" : "reliable_vision_count_too_low",
          visionCountsConsistent ? "" : "vision_count_inconsistent",
          declaredCountConsistent ? "" : "declared_count_inconsistent",
          visionSumExact ? "" : "vision_items_sum_not_equal_total",
        ].filter(Boolean).join(","),
        raw_vision_items_count: rawVisionItemsCount,
        reliable_vision_items_count: reliableVisionItemsCount,
        vision_structured_items_count: visionStructuredTrustItems.length,
        vision_calculated_items_sum: visionCalculatedItemsSum || finalItemsSum,
        vision_structured_items_sum: visionStructuredItemsSum,
      }
    }


    const learningTrustedItemsCount = countTrustedLearningItems(parsed.items)
    const learningNeedsReviewItemsCount = Math.max(0, parsed.items.length - learningTrustedItemsCount)
    const learningReferenceCount = visionReferenceCount || parsed.items.length || 0
    const learningTrustedRatio = learningReferenceCount > 0 ? learningTrustedItemsCount / learningReferenceCount : 0
    const primaryVisionTrustedForSmartShopping = primaryVisionBudgetReliable
      && learningTrustedItemsCount > 0
      && learningNeedsReviewItemsCount === 0
      && learningTrustedRatio >= 0.85
      && totalsAlmostEqual(finalItemsSum, parsed.total_amount)
    const primaryVisionPartialForSmartShopping = primaryVisionBudgetReliable
      && learningTrustedItemsCount > 0
      && !primaryVisionTrustedForSmartShopping

    ;(parsed as any).primary_vision_trusted_for_smart_shopping = primaryVisionTrustedForSmartShopping
    ;(parsed as any).primary_vision_partial_for_smart_shopping = primaryVisionPartialForSmartShopping
    ;(parsed as any).vision_items_recovery_ratio = Number(finalItemsRecoveryRatio.toFixed(2))
    ;(parsed as any).trusted_items_ratio = Number(learningTrustedRatio.toFixed(2))
    ;(parsed as any).items_sum_after_sanitization = finalItemsSum

    if (primaryVisionTrustedForSmartShopping || primaryVisionPartialForSmartShopping) {
      const itemCountLabel = primaryVisionTrustedForSmartShopping
        ? `${learningTrustedItemsCount} article(s)`
        : `${learningTrustedItemsCount} article(s) exploitables / ${learningReferenceCount || parsed.items.length}`
      ;(parsed as any).smart_shopping_safe = true
      ;(parsed as any).items_quality_status = primaryVisionTrustedForSmartShopping ? "trusted" : "partial"
      ;(parsed as any).item_count_display_label = itemCountLabel
      ;(parsed as any).parser_debug = {
        ...((parsed as any).parser_debug || {}),
        smart_shopping_safe: true,
        items_quality_status: primaryVisionTrustedForSmartShopping ? "trusted" : "partial",
        trusted_items_count: learningTrustedItemsCount,
        needs_review_items_count: learningNeedsReviewItemsCount,
        items_sent_to_smart_shopping_count: learningTrustedItemsCount,
        items_excluded_from_smart_shopping_count: learningNeedsReviewItemsCount,
        displayed_items_count: learningTrustedItemsCount,
        displayed_items_count_source: primaryVisionTrustedForSmartShopping ? "primary_vision_trusted_items" : "primary_vision_partial_items",
        item_count_display_label: itemCountLabel,
        primary_vision_trusted_for_smart_shopping: primaryVisionTrustedForSmartShopping,
        primary_vision_partial_for_smart_shopping: primaryVisionPartialForSmartShopping,
        vision_items_recovery_ratio: Number(finalItemsRecoveryRatio.toFixed(2)),
        trusted_items_ratio: Number(learningTrustedRatio.toFixed(2)),
        items_sum_after_sanitization: finalItemsSum,
      }
    } else if (finalItemSanitization.blocksSmartShopping) {
      ;(parsed as any).smart_shopping_safe = false
      ;(parsed as any).items_quality_status = "blocked"
      ;(parsed as any).smart_shopping_blocked_reasons = [
        ...(((parsed as any).smart_shopping_blocked_reasons || [])),
        "final_item_sanitization_rejected_non_products",
      ]
    }
    console.info("[scanner] final_item_sanitization", {
      before: originalFinalItemsCount,
      after: finalItemSanitization.items.length,
      rejected: finalItemSanitization.rejected_count,
      rejected_lines: finalItemSanitization.rejected_lines.slice(0, 12),
      blocksSmartShopping: finalItemSanitization.blocksSmartShopping,
    })
    const classification = classifyReceipt(parsed)
    parsed.ticket_type = classification.ticket_type
    parsed.budget_category = classification.budget_category
    parsed.is_food_ticket = classification.is_food_ticket
    parsed.confidence_score = Math.max(0, Math.min(100, Math.round(Number(parsed.confidence_score || 0) || Number(ocr.confidence || 0))))
    parsed.scan_level_used = ocr.metrics?.fallbackUsed ? 2 : 1
    parsed.escalation_reason = getEscalationReason(parsed, ocr)
    if ((parsed as any).total_status === "estimated_from_items") {
      parsed.escalation_reason = [parsed.escalation_reason, "total_estime_depuis_articles"].filter(Boolean).join(",")
    }
    parsed.scan_status = ocr.metrics?.scanStatus || ((parsed.escalation_reason && parsed.total_amount) ? "partial" : "success")
    if ((parsed as any).total_status === "estimated_from_items") {
      parsed.scan_status = "partial_low_items"
    }
    const probableProductLines = Number((parsed as any).parser_debug?.article_candidate_lines_count || ocr.metrics?.articleCandidateLinesCount || 0)
    const extractionRatio = probableProductLines > 0 ? parsed.items.length / probableProductLines : 1
    if (probableProductLines >= 5 && extractionRatio < 0.6) {
      parsed.scan_status = "partial_low_items"
      parsed.escalation_reason = [parsed.escalation_reason, "moins_de_60_pourcent_articles_probables"].filter(Boolean).join(",")
    }
    const expectedItemsMin = Number(readOcrMetric(ocr, "expectedItemsMin", "expected_items_min") || 0)
    ;(parsed as any).expected_items_min = expectedItemsMin || null
    ;(parsed as any).expected_items_source = String(readOcrMetric(ocr, "expectedItemsSource", "expected_items_source") || "not_found")
    ;(parsed as any).declared_items_count = readOcrMetric(ocr, "declaredItemsCount", "declared_items_count") ?? null
    ;(parsed as any).declared_items_raw_text = String(readOcrMetric(ocr, "declaredItemsRawText", "declared_items_raw_text") ?? "")
    ;(parsed as any).items_count_status = String(readOcrMetric(ocr, "itemsCountStatus", "items_count_status") || "unknown")
    ;(parsed as any).recovery_ratio = ocr.metrics?.recoveryRatio ?? null
    ;(parsed as any).recovery_ratio_status = ocr.metrics?.recoveryRatioStatus ?? null
    ;(parsed as any).split_cost_warning = ocr.metrics?.splitCostWarning ?? null
    if (expectedItemsMin && parsed.items.length < expectedItemsMin) {
      parsed.scan_status = "partial_low_items"
      parsed.escalation_reason = [parsed.escalation_reason, "articles_alimentaires_insuffisants"].filter(Boolean).join(",")
    }
    const parserDebug = ((parsed as any).parser_debug || {}) as Record<string, any>
    const budgetStatus = String(readOcrMetric(ocr, "budgetStatus", "budget_status") || parserDebug.budget_status || (Number(parsed.total_amount || 0) > 0 && !(parsed as any).total_needs_review ? "reliable" : "needs_review"))
    let itemsQualityStatus = primaryVisionTrustedForSmartShopping
      ? "trusted"
      : String(readOcrMetric(ocr, "itemsQualityStatus", "items_quality_status") || parserDebug.items_quality_status || (parsed.items.length >= 3 ? "partial" : "blocked"))
    let smartShoppingSafe = primaryVisionTrustedForSmartShopping
      ? true
      : (readOcrMetric(ocr, "smartShoppingSafe", "smart_shopping_safe") ?? parserDebug.smart_shopping_safe ?? false)
    if (primaryVisionTrustedForSmartShopping) {
      itemsQualityStatus = "trusted"
      smartShoppingSafe = true
    } else if ((parsed as any).primary_vision_partial_for_smart_shopping) {
      itemsQualityStatus = "partial"
      smartShoppingSafe = true
    } else if (finalItemSanitization.blocksSmartShopping) {
      itemsQualityStatus = "blocked"
      smartShoppingSafe = false
    }
    const scanStatusLegacy = readOcrMetric(ocr, "scanStatusLegacy", "scan_status_legacy") || parserDebug.scan_status_legacy || parsed.scan_status
    let finalScanStatus = primaryVisionTrustedForSmartShopping
      ? "budget_ok_articles_ok"
      : (readOcrMetric(ocr, "finalScanStatus", "final_scan_status") || parserDebug.final_scan_status || resolveFinalScanStatus({
      budgetStatus,
      itemsQualityStatus,
      smartShoppingSafe,
    }))
    if (primaryVisionTrustedForSmartShopping && budgetStatus === "reliable") {
      finalScanStatus = "budget_ok_articles_ok"
    } else if ((parsed as any).primary_vision_partial_for_smart_shopping && budgetStatus === "reliable") {
      finalScanStatus = "budget_ok_articles_partial"
    } else if (
      (budgetStatus === "reliable" && smartShoppingSafe === false)
      || (budgetStatus === "reliable" && itemsQualityStatus === "blocked")
    ) {
      finalScanStatus = "budget_ok_articles_blocked"
    }
    ;(parsed as any).budget_status = budgetStatus
    ;(parsed as any).items_quality_status = itemsQualityStatus
    ;(parsed as any).smart_shopping_safe = smartShoppingSafe
    ;(parsed as any).scan_status_legacy = scanStatusLegacy
    if (finalScanStatus) parsed.scan_status = finalScanStatus

    console.info("[scanner] Date detectee", parsed.purchase_date || "")
    console.info("[scanner] Magasin detecte", parsed.store_name || "")
    console.info("[scanner] Total detecte", parsed.total_amount || 0)
    console.info("[scanner] Nombre d'articles detectes", parsed.items.length)
    console.info("[scanner] Niveau utilise", parsed.scan_level_used)
    console.info("[scanner] Raison escalation", parsed.escalation_reason || "aucune")
    console.info("[scanner] Statut scan", parsed.scan_status)
    const normalized = {
      store_name: parsed.store_name,
      ticket_type: parsed.ticket_type,
      is_food_ticket: parsed.is_food_ticket,
      total_amount: parsed.total_amount,
      total_needs_review: (parsed as any).total_needs_review || false,
      total_source: (parsed as any).total_source || null,
      estimated_items_sum: (parsed as any).estimated_items_sum || null,
      items_count: parsed.items.length,
      probable_product_lines: probableProductLines,
      extraction_ratio: Number(extractionRatio.toFixed(2)),
      expected_items_min: expectedItemsMin || null,
      expected_items_source: readOcrMetric(ocr, "expectedItemsSource", "expected_items_source") || "not_found",
      declared_items_count: readOcrMetric(ocr, "declaredItemsCount", "declared_items_count") ?? null,
      items_count_status: readOcrMetric(ocr, "itemsCountStatus", "items_count_status") || "unknown",
      budget_status: budgetStatus,
      items_quality_status: itemsQualityStatus,
      smart_shopping_safe: smartShoppingSafe,
      item_count_display_label: (parsed as any).item_count_display_label || (parsed as any).parser_debug?.item_count_display_label || null,
      primary_vision_trusted_for_smart_shopping: primaryVisionTrustedForSmartShopping,
      primary_vision_partial_for_smart_shopping: (parsed as any).primary_vision_partial_for_smart_shopping || false,
      scan_status: parsed.scan_status,
      scan_status_legacy: scanStatusLegacy,
      provider: ocr.provider,
      items: parsed.items,
    }
    console.log("NORMALIZED_SCAN_RESULT", normalized)
    console.info("[scanner] NORMALIZED_SCAN_RESULT", normalized)
    ;(parsed as any).ocr_provider = ocr.provider
    const parsingDurationMs = Math.round(performance.now() - parsingStartedAt)
    parsed.scan_duration_ms = Math.round(performance.now() - scanStartedAt)

    emit(options.onProgress, "products", "Extraction des produits...", 66)
    const marketResolution = await resolveMarketProducts(parsed.items)
    parsed.items = marketResolution.items
    ;(parsed as any).parser_debug = {
      ...((parsed as any).parser_debug || {}),
      market_resolution: marketResolution.diagnostics,
    }
    await Promise.resolve()

    emit(options.onProgress, "total", "Calcul du total...", 82)
    const validation = validateParsedReceipt(parsed)
    console.info("[scanner] validation_v2", validation)

    emit(options.onProgress, "checking", "Vérification...", 94)
    const result = {
      optimizedFile: optimized.file,
      ocr,
      receipt: parsed,
      validation,
      canResume: true,
      metrics: {
        provider: ocr.provider,
        model: ocr.metrics?.model || null,
        ocrEngine: ocr.metrics?.ocrEngine || ocr.provider,
        aiUsed: Boolean(parsed.ai_used || ocr.metrics?.aiUsed),
        textAiUsed: Boolean(ocr.metrics?.textAiUsed),
        visionUsed: Boolean(ocr.metrics?.visionUsed || ocr.provider.includes("vision")),
        fallbackUsed: Boolean(ocr.metrics?.fallbackUsed),
        imageInitialBytes: file.size,
        imageCompressedBytes: optimized.file.size,
        imageOriginalWidth: optimized.originalWidth,
        imageOriginalHeight: optimized.originalHeight,
        imageOptimizedWidth: optimized.width,
        imageOptimizedHeight: optimized.height,
        imageOrientation: optimized.orientation,
        imageRotationApplied: optimized.rotationApplied,
        imageCompressionQuality: optimized.compressionQuality,
        imagePreProcessing: optimized.preProcessing,
        totalComparisonStatus: validation.total_comparison_status,
        itemsTotalAmount: validation.items_total_amount,
        totalGapAmount: validation.total_gap_amount,
        totalGapRatio: validation.total_gap_ratio,
        totalNeedsReview: (parsed as any).total_needs_review || false,
        totalSource: (parsed as any).total_source || null,
        totalRawText: (parsed as any).total_raw_text || "",
        totalConfidence: (parsed as any).total_confidence ?? null,
        totalRejectedReason: (parsed as any).total_rejected_reason || ocr.metrics?.totalRejectedReason || null,
        totalRawTextVerifiedAgainstOcr: (parsed as any).total_raw_text_verified_against_ocr ?? ocr.metrics?.totalRawTextVerifiedAgainstOcr ?? false,
        openaiTotalValue: (parsed as any).openai_total_value ?? ocr.metrics?.openaiTotalValue ?? null,
        openaiTotalRawText: (parsed as any).openai_total_raw_text || ocr.metrics?.openaiTotalRawText || "",
        openaiTotalConfidence: (parsed as any).openai_total_confidence ?? ocr.metrics?.openaiTotalConfidence ?? null,
        estimatedItemsSum: (parsed as any).estimated_items_sum ?? null,
        rawOcrLinesCount: (parsed as any).parser_debug?.raw_lines_count ?? null,
        articleCandidateLinesCount: probableProductLines,
        articleExtractionRatio: Number(extractionRatio.toFixed(2)),
        rejectedOcrLinesCount: (parsed as any).parser_debug?.rejected_lines_count ?? null,
        trustedItemsCount: ocr.metrics?.trustedItemsCount ?? parserDebug.trusted_items_count ?? null,
        needsReviewItemsCount: ocr.metrics?.needsReviewItemsCount ?? parserDebug.needs_review_items_count ?? null,
        rejectedItemsCount: ocr.metrics?.rejectedItemsCount ?? parserDebug.rejected_items_count ?? null,
        trustedItemsRatio: ocr.metrics?.trustedItemsRatio ?? parserDebug.trusted_items_ratio ?? null,
        itemsQualityStatus,
        itemsSentToSmartShoppingCount: ocr.metrics?.itemsSentToSmartShoppingCount ?? parserDebug.items_sent_to_smart_shopping_count ?? null,
        itemsExcludedFromSmartShoppingCount: ocr.metrics?.itemsExcludedFromSmartShoppingCount ?? parserDebug.items_excluded_from_smart_shopping_count ?? null,
        displayedItemsCount: ocr.metrics?.displayedItemsCount ?? parserDebug.displayed_items_count ?? null,
        displayedItemsCountSource: ocr.metrics?.displayedItemsCountSource ?? parserDebug.displayed_items_count_source ?? null,
        realItemsCountIfKnown: ocr.metrics?.realItemsCountIfKnown ?? parserDebug.real_items_count_if_known ?? null,
        itemCountDisplayLabel: ocr.metrics?.itemCountDisplayLabel ?? parserDebug.item_count_display_label ?? null,
        itemsExcludedReasonsSummary: ocr.metrics?.itemsExcludedReasonsSummary ?? parserDebug.items_excluded_reasons_summary ?? null,
        sectionSubtotalsRejectedCount: ocr.metrics?.sectionSubtotalsRejectedCount ?? parserDebug.section_subtotals_rejected_count ?? null,
        sectionSubtotalsRejectedLines: ocr.metrics?.sectionSubtotalsRejectedLines ?? parserDebug.section_subtotals_rejected_lines ?? null,
        rejectedSectionSubtotalExamples: ocr.metrics?.rejectedSectionSubtotalExamples ?? parserDebug.rejected_section_subtotal_examples ?? null,
        itemsKeptLines: ocr.metrics?.itemsKeptLines ?? parserDebug.items_kept_lines ?? null,
        itemsRejectedLines: ocr.metrics?.itemsRejectedLines ?? parserDebug.items_rejected_lines ?? null,
        finalItemsBeforeSanitizationCount: parserDebug.final_items_before_sanitization_count ?? null,
        finalItemsAfterSanitizationCount: parserDebug.final_items_after_sanitization_count ?? null,
        finalItemsRejectedCount: parserDebug.final_items_rejected_count ?? null,
        finalItemsRejectedLines: parserDebug.final_items_rejected_lines ?? null,
        finalItemsRejectedReasons: parserDebug.final_items_rejected_reasons ?? null,
        itemQualitySummary: ocr.metrics?.itemQualitySummary ?? parserDebug.item_quality_summary ?? null,
        budgetReliable: ocr.metrics?.budgetReliable ?? parserDebug.budget_reliable ?? (budgetStatus === "reliable"),
        smartShoppingSafe,
        primaryVisionTrustedForSmartShopping,
        primaryVisionPartialForSmartShopping: (parsed as any).primary_vision_partial_for_smart_shopping || false,
        budgetStatus,
        finalScanStatus: parsed.scan_status,
        ocrDurationMs: ocr.metrics?.ocrDurationMs ?? ocrDurationMs,
        openaiDurationMs: ocr.metrics?.openaiDurationMs ?? null,
        parsingDurationMs,
        inputTokens: ocr.metrics?.inputTokens ?? null,
        outputTokens: ocr.metrics?.outputTokens ?? null,
        estimatedCostEur: ocr.metrics?.estimatedCostEur ?? null,
        scanAiCallsCount: ocr.metrics?.scanAiCallsCount ?? null,
        scanStrategyUsed: ocr.metrics?.scanStrategyUsed ?? null,
        splitRetryEligible: ocr.metrics?.splitRetryEligible ?? false,
        splitRetryUsed: ocr.metrics?.splitRetryUsed ?? false,
        splitRetrySkippedReason: ocr.metrics?.splitRetrySkippedReason ?? null,
        splitSegmentsCount: ocr.metrics?.splitSegmentsCount ?? null,
        splitSegmentsStrategy: ocr.metrics?.splitSegmentsStrategy ?? null,
        splitSegmentsOverlapPercent: ocr.metrics?.splitSegmentsOverlapPercent ?? null,
        splitSegmentsResults: ocr.metrics?.splitSegmentsResults ?? null,
        splitSegmentsSuccessCount: ocr.metrics?.splitSegmentsSuccessCount ?? null,
        splitSegmentsTimeoutCount: ocr.metrics?.splitSegmentsTimeoutCount ?? null,
        splitTotalInputTokens: ocr.metrics?.splitTotalInputTokens ?? null,
        splitTotalOutputTokens: ocr.metrics?.splitTotalOutputTokens ?? null,
        splitTotalDurationMs: ocr.metrics?.splitTotalDurationMs ?? null,
        recoveryRatio: ocr.metrics?.recoveryRatio ?? null,
        recoveryRatioRaw: ocr.metrics?.recoveryRatioRaw ?? null,
        recoveryRatioCapped: ocr.metrics?.recoveryRatioCapped ?? null,
        recoveryRatioStatus: ocr.metrics?.recoveryRatioStatus ?? null,
        splitCostWarning: ocr.metrics?.splitCostWarning ?? null,
        splitFailureReason: ocr.metrics?.splitFailureReason ?? null,
        localOcrAvailable: ocr.metrics?.localOcrAvailable ?? null,
        localOcrAttempted: ocr.metrics?.localOcrAttempted ?? null,
        localOcrEngine: ocr.metrics?.localOcrEngine ?? null,
        localOcrImportStatus: ocr.metrics?.localOcrImportStatus ?? null,
        localOcrWorkerStatus: ocr.metrics?.localOcrWorkerStatus ?? null,
        localOcrErrorType: ocr.metrics?.localOcrErrorType ?? null,
        localOcrDurationMs: ocr.metrics?.localOcrDurationMs ?? null,
        localOcrError: ocr.metrics?.localOcrError ?? null,
        localOcrSkippedReason: ocr.metrics?.localOcrSkippedReason ?? null,
        browserTextLength: ocr.metrics?.browserTextLength ?? null,
        browserTextLengthBeforePayload: ocr.metrics?.browserTextLengthBeforePayload ?? null,
        browserTextLengthSentToEdge: ocr.metrics?.browserTextLengthSentToEdge ?? null,
        edgeTextLength: ocr.metrics?.edgeTextLength ?? null,
        imagePreprocessingForOcr: ocr.metrics?.imagePreprocessingForOcr ?? null,
        textEmptyReason: ocr.metrics?.textEmptyReason ?? null,
        expectedItemsMinIsProven: ocr.metrics?.expectedItemsMinIsProven ?? null,
        recoveryRatioDenominatorSource: ocr.metrics?.recoveryRatioDenominatorSource ?? null,
        recoveryRatioBlockedReason: ocr.metrics?.recoveryRatioBlockedReason ?? null,
        imageQualityWarning: ocr.metrics?.imageQualityWarning ?? null,
        aiCalledAfterLocalOcrTechnicalFailure: ocr.metrics?.aiCalledAfterLocalOcrTechnicalFailure ?? null,
        aiCallRiskReason: ocr.metrics?.aiCallRiskReason ?? null,
        shouldSkipAiDueToLocalOcrFailure: ocr.metrics?.shouldSkipAiDueToLocalOcrFailure ?? null,
        scanReliabilityBlockedReason: ocr.metrics?.scanReliabilityBlockedReason ?? null,
        totalVerifiedAgainstLocalOcr: ocr.metrics?.totalVerifiedAgainstLocalOcr ?? null,
        totalVerifiedAgainstSegmentText: ocr.metrics?.totalVerifiedAgainstSegmentText ?? null,
        expectedItemsSource: ocr.metrics?.expectedItemsSource ?? null,
        declaredItemsCount: ocr.metrics?.declaredItemsCount ?? null,
        declaredItemsRawText: ocr.metrics?.declaredItemsRawText ?? "",
        itemsCountStatus: ocr.metrics?.itemsCountStatus ?? null,
        primaryStage: ocr.metrics?.primaryStage ?? null,
        primaryError: ocr.metrics?.primaryError ?? null,
        fallbackStage: ocr.metrics?.fallbackStage ?? null,
        premiumPlusDetected: ocr.metrics?.premiumPlusDetected ?? false,
        segmentsReceivedByEdgeFunction: ocr.metrics?.segmentsReceivedByEdgeFunction ?? null,
        rawItemsDetectedByVision: ocr.metrics?.rawItemsDetectedByVision ?? null,
        reliableItemsDetectedByVision: ocr.metrics?.reliableItemsDetectedByVision ?? null,
        rawItemsDetectedBySplit: ocr.metrics?.rawItemsDetectedBySplit ?? null,
        reliableItemsDetectedBySplit: ocr.metrics?.reliableItemsDetectedBySplit ?? null,
        splitTotalValue: ocr.metrics?.splitTotalValue ?? null,
        splitTotalRawText: ocr.metrics?.splitTotalRawText ?? "",
        splitTotalConfidence: ocr.metrics?.splitTotalConfidence ?? null,
        calculatedItemsSum: ocr.metrics?.calculatedItemsSum ?? null,
        totalDifference: ocr.metrics?.totalDifference ?? null,
        discardedHallucinatedItemsCount: ocr.metrics?.discardedHallucinatedItemsCount ?? null,
        scanLevelUsed: parsed.scan_level_used,
        confidenceScore: parsed.confidence_score,
        escalationReason: parsed.escalation_reason || null,
        scanStatus: parsed.scan_status,
        timeoutReason: ocr.metrics?.timeoutReason || null,
        totalScanDurationMs: Math.round(performance.now() - scanStartedAt),
      },
    }

    try {
      sessionStorage.setItem("budgetkazpei:last-scan", JSON.stringify({
        receipt: parsed,
        created_at: new Date().toISOString(),
      }))
    } catch {
      // Session restore is helpful, not critical.
    }

    emit(options.onProgress, "done", "Analyse terminée.", 100)
    return result
  } catch (error) {
    emit(options.onProgress, "failed", "Analyse impossible.", 100)
    if (error instanceof ScanError) throw error
    if (String((error as Error)?.message || "").includes("invalid_image")) {
      throw new ScanError("SCAN_IMAGE_UNREADABLE", (error as Error).message)
    }
    throw error
  }
}

export function getLastScanDraft() {
  try {
    const raw = sessionStorage.getItem("budgetkazpei:last-scan")
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function clearLastScanDraft() {
  try {
    sessionStorage.removeItem("budgetkazpei:last-scan")
  } catch {
    // Ignore storage errors.
  }
}
