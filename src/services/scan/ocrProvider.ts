import { supabase } from "../supabase"
import { classifyLocalOcrError, isTechnicalLocalOcrFailure } from "./ocrDiagnostics"
import { extractReceiptDueTotal, extractReceiptTotal, mergeReceiptItems, parseReceipt } from "./receiptParser"
import { normalizeItemQualityStatus } from "./receiptRules"
import { ScanError, type ScanErrorCode } from "./scanErrors"

const OCR_TIMEOUT_MS = 60000
const MIN_FAST_BROWSER_ITEMS = 8
const MIN_LOCAL_OCR_TEXT_LENGTH = 20

export type OCRResult = {
  text: string
  status: "success" | "failed" | "manual"
  provider: string
  confidence: number
  structured?: any
  metrics?: Record<string, any>
  error?: string
}

export interface OCRProvider {
  name: string
  extractText(file: File, browserText?: string, imageMeta?: Record<string, any>): Promise<OCRResult>
}

export class BrowserTextDetectorProvider implements OCRProvider {
  name = "browser-text-detector"

  async extractText(file: File): Promise<OCRResult> {
    if (typeof window === "undefined" || typeof (window as any).TextDetector !== "function") {
      return {
        text: "",
        status: "manual",
        provider: this.name,
        confidence: 0,
        error: "ocr_unavailable",
      }
    }

    try {
      const detector = new (window as any).TextDetector()
      const bitmap = await createImageBitmap(file)
      const blocks = await detector.detect(bitmap)
      const text = (blocks || [])
        .map((block: any) => block.rawValue || "")
        .filter(Boolean)
        .join("\n")

      return {
        text,
        status: text ? "success" : "failed",
        provider: this.name,
        confidence: text ? 72 : 0,
        error: text ? "" : "empty_ocr",
      }
    } catch (error) {
      return {
        text: "",
        status: "failed",
        provider: this.name,
        confidence: 0,
        error: error instanceof Error ? error.message : "ocr_failed",
      }
    }
  }
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || "")
      resolve(result.includes(",") ? result.split(",")[1] : result)
    }
    reader.onerror = () => reject(new ScanError("SCAN_IMAGE_UNREADABLE", "Unable to read receipt image as base64."))
    reader.readAsDataURL(file)
  })
}

async function encodeImageSegments(rawSegments: any[] = []) {
  const segments = Array.isArray(rawSegments) ? rawSegments : []
  return Promise.all(segments
    .filter(segment => segment?.file instanceof File)
    .map(async segment => ({
      segment: String(segment.segment || ""),
      imageBase64: await fileToBase64(segment.file),
      mimeType: segment.file.type || "image/jpeg",
      width: segment.width ?? null,
      height: segment.height ?? null,
      yStartPercent: segment.yStartPercent ?? null,
      yEndPercent: segment.yEndPercent ?? null,
      overlapPercent: segment.overlapPercent ?? null,
      estimatedBytes: segment.file.size,
    })))
}

function withTimeout<T>(promise: Promise<T>, timeoutMs = OCR_TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new ScanError("SCAN_OCR_TIMEOUT", `scan-receipt-ocr did not respond within ${timeoutMs}ms.`))
    }, timeoutMs)

    promise
      .then(value => {
        window.clearTimeout(timer)
        resolve(value)
      })
      .catch(error => {
        window.clearTimeout(timer)
        reject(error)
      })
  })
}

const FUNCTION_ERROR_CODES = new Set<ScanErrorCode>([
  "SCAN_IMAGE_TOO_LARGE",
  "SCAN_IMAGE_UNREADABLE",
  "SCAN_OCR_FAILED",
  "SCAN_OCR_TIMEOUT",
  "SCAN_OPENAI_KEY_MISSING",
  "SCAN_OPENAI_KEY_INVALID",
  "SCAN_OPENAI_REQUEST_INVALID",
  "SCAN_OPENAI_REQUEST_FAILED",
  "SCAN_OPENAI_QUOTA_EXCEEDED",
  "SCAN_AI_RESPONSE_INVALID",
  "SCAN_PARSE_FAILED",
  "SCAN_SUPABASE_INSERT_FAILED",
  "SCAN_DUPLICATE_RECEIPT",
  "SCAN_NETWORK_OFFLINE",
  "SCAN_UNKNOWN_ERROR",
])

function toScanErrorCode(value: unknown): ScanErrorCode {
  const code = String(value || "")
  return FUNCTION_ERROR_CODES.has(code as ScanErrorCode) ? code as ScanErrorCode : "SCAN_OPENAI_REQUEST_FAILED"
}

function diagnosticMessage(payload: any, fallback = "") {
  if (!payload || typeof payload !== "object") return fallback

  const parts = [
    payload.error_code ? `error_code=${payload.error_code}` : "",
    payload.error_message ? `error_message=${payload.error_message}` : "",
    payload.openai_status ? `openai_status=${payload.openai_status}` : "",
    payload.provider_message ? `provider_message=${payload.provider_message}` : "",
    payload.stage ? `stage=${payload.stage}` : "",
    payload.model ? `model=${payload.model}` : "",
  ].filter(Boolean)

  return parts.length ? parts.join(" | ") : fallback
}

async function readFunctionErrorPayload(error: any) {
  const response = error?.context
  if (!response) return null

  try {
    const clone = typeof response.clone === "function" ? response.clone() : response
    const text = typeof clone.text === "function" ? await clone.text() : ""
    if (!text) return null

    try {
      return JSON.parse(text)
    } catch {
      return {
        error_code: "SCAN_OPENAI_REQUEST_FAILED",
        error_message: text,
        provider_message: text,
        openai_status: response.status || null,
      }
    }
  } catch {
    return null
  }
}

function money(value: unknown) {
  const match = String(value ?? "").match(/(-?\d+(?:\s?\d{3})*[,.]\d{2})/)
  return match ? Number(match[1].replace(/\s/g, "").replace(",", ".")) || 0 : 0
}

function firstText(...values: unknown[]) {
  return String(values.find(value => String(value ?? "").trim()) ?? "").trim()
}

function normalizeProviderReceiptDate(value: unknown) {
  const raw = String(value || "").trim()
  if (!raw) return ""

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

function extractOpenAiRawDate(data: any = {}) {
  const raw = firstText(
    data.openai_raw_content,
    data.openaiRawContent,
    data.openai_raw_response_body,
    data.openaiRawResponseBody,
  )

  if (!raw) return ""

  try {
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim()

    const parsed = JSON.parse(cleaned)
    return firstText(parsed.purchase_date, parsed.date)
  } catch {
    const match = raw.match(/"date"\s*:\s*"([^"]+)"/i) || raw.match(/"purchase_date"\s*:\s*"([^"]+)"/i)
    return match ? match[1] : ""
  }
}


function normalizeProviderItemText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[€£$]/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

const PROVIDER_PRODUCT_WORDS = [
  "chips", "rosette", "fuet", "tlj", "barre", "cereal", "cereale", "choco",
  "mimolette", "wimolette", "gouda", "camembert", "panenbert", "gouverneur",
  "crevette", "brocoli", "nugget", "nuggets", "huile", "lesieur", "kinder",
  "bueno", "joker", "salade", "pomme", "terre", "champignon", "echalote",
]

function hasProviderProductSignal(raw = "") {
  const clean = normalizeProviderItemText(raw)
  if (/\b\d{8,14}\b/.test(clean)) return true
  if (/\b\d+(?:[,.]\d+)?\s*(g|gr|kg|ml|cl|l)\b/.test(clean)) return true
  if (/\b\d+\s*(tranches?|tr|x)\b/.test(clean)) return true
  return PROVIDER_PRODUCT_WORDS.some(word => clean.includes(word))
}

function isBlockedProviderItem(item: any = {}) {
  const raw = normalizeProviderItemText(firstText(item.name, item.corrected_name, item.ocr_name, item.raw_text, item.source_line))
  if (!raw) return true

  if (/\b(carte|corte)\s+bleue\b/.test(raw)) return true
  if (/\b(cb|especes|cash|paiement|monnaie|rendu)\b/.test(raw)) return true
  if (/\b(total|reste a payer|net a payer|a payer|tva|ttc|ht|operation|vente|bienvenue|fidelite|client|points?)\b/.test(raw)) return true

  const sectionWord = /\b(charcuter(?:ie|te)?|epicer(?:ie|te)|cremerie|crererie|surgeles|sungeles|surgele|boissons|ultra frais|volaille|ppi)\b/.test(raw)
  const sectionOnly = /^(charcuter(?:ie|te)?|epicer(?:ie|te)(?: sucree| salee)?|cremerie|crererie|surgeles|sungeles|surgele|boissons(?: sans alcool)?|ultra frais|volaille|ppi)(?:\s+(?:1s|ls|l5|is))?$/.test(raw)
  if (sectionWord && sectionOnly && !hasProviderProductSignal(raw)) return true

  const tokens = raw.split(" ").filter(Boolean)
  const letters = raw.replace(/[^a-z]/g, "")
  if (!hasProviderProductSignal(raw) && tokens.length <= 3 && letters.length <= 8) return true
  if (!hasProviderProductSignal(raw) && tokens.every(token => token.length <= 3)) return true

  return false
}

function normalizeFunctionItems(items: any[] = []) {
  return (items || [])
    .filter(item => String(item?.name || item?.ocr_name || "").trim())
    .map(item => {
      const price = money(item.total_price) || money(item.price) || money(item.unit_price)
      const name = firstText(item.name, item.corrected_name, item.ocr_name, "Produit a verifier")
      const qualityStatus = normalizeItemQualityStatus(item)
      const needsReview = qualityStatus === "needs_review"

      return {
        ...item,
        name,
        ocr_name: firstText(item.ocr_name, name),
        corrected_name: firstText(item.corrected_name, name),
        price,
        total_price: price,
        unit_price: money(item.unit_price) || price,
        quantity: Number(item.quantity || 1) || 1,
        source: item.source || item.item_source || "ocr_fallback",
        item_status: qualityStatus === "needs_review" ? "a_verifier" : qualityStatus,
        status: qualityStatus === "needs_review" ? "a_verifier" : qualityStatus,
        review_status: qualityStatus,
        needs_review: needsReview,
        item_quality_score: item.item_quality_score ?? item.confidence_score ?? (needsReview ? 55 : 88),
        item_rejection_reason: item.item_rejection_reason || "",
        raw_text: firstText(item.raw_text, item.source_line),
        source_line: firstText(item.source_line, item.raw_text),
        confidence_score: item.confidence_score == null ? 65 : Number(item.confidence_score),
        line_type: item.line_type || "product",
        category: item.category || "alimentaire",
      }
    })
    .filter(item => item.total_price > 0 && !isBlockedProviderItem(item))
}

function isUiStoreName(value = "") {
  const clean = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (!clean) return true
  return [
    "budgetkazpei",
    "budget kaz pei",
    "scanner ticket",
    "mes tickets",
    "analyse du ticket",
    "choisissez une methode",
  ].some(blocked => clean.includes(blocked))
}

function normalizeFunctionReceiptPayload(data: any = {}) {
  data = data && typeof data === "object" ? data : {}
  const receipt = data.receipt && typeof data.receipt === "object" ? data.receipt : {}
  const items = normalizeFunctionItems(Array.isArray(receipt.items) ? receipt.items : Array.isArray(data.items) ? data.items : [])
  const ocrText = firstText(data.text, receipt.ocr_text, data.ocr_text)
  const dueTextTotal = extractReceiptDueTotal(ocrText)
  const textTotal = extractReceiptTotal(ocrText)
  const explicitTotal = money(receipt.reste_a_payer)
    || money(receipt.amount_due)
    || money(receipt.net_a_payer)
    || money(data.reste_a_payer)
    || money(data.amount_due)
    || money(data.net_a_payer)
    || dueTextTotal
    || money(receipt.total_final)
    || money(receipt.total_amount)
    || money(receipt.total)
    || money(receipt.totalAmount)
    || money(data.total_final)
    || money(data.total_amount)
    || money(data.total)
    || money(data.totalAmount)
    || textTotal
  const totalNeedsReview = Boolean(receipt.total_needs_review || data.total_needs_review)
  const totalAmount = totalNeedsReview ? explicitTotal : (explicitTotal || (items.length >= 3 ? itemsTotalAmount(items) : 0))
  const rawStoreName = firstText(receipt.store_name, receipt.merchant_name, receipt.merchant, data.store_name, data.merchant_name, data.merchant)
  const storeName = isUiStoreName(rawStoreName) ? "Enseigne à vérifier" : rawStoreName
  const rawPurchaseDate = firstText(
    receipt.purchase_date,
    receipt.date,
    data.purchase_date,
    data.date,
    extractOpenAiRawDate(data),
  )

  const purchaseDate = normalizeProviderReceiptDate(rawPurchaseDate) || rawPurchaseDate

  return {
    ...receipt,
    store_name: storeName,
    merchant_name: firstText(receipt.merchant_name, storeName),
    purchase_date: purchaseDate,
    total_amount: totalAmount,
    total_raw_text: firstText(receipt.total_raw_text, data.total_raw_text),
    total_confidence: Number(receipt.total_confidence ?? data.total_confidence ?? 0),
    total_needs_review: totalNeedsReview || totalAmount <= 0,
    total_source: firstText(receipt.total_source, data.total_source, totalAmount > 0 ? "detected" : "missing_or_unreliable"),
    total_rejected_reason: firstText(receipt.total_rejected_reason, data.total_rejected_reason),
    total_raw_text_verified_against_ocr: Boolean(receipt.total_raw_text_verified_against_ocr || data.total_raw_text_verified_against_ocr),
    openai_total_value: receipt.openai_total_value ?? data.openai_total_value ?? null,
    openai_total_raw_text: firstText(receipt.openai_total_raw_text, data.openai_total_raw_text),
    openai_total_confidence: Number(receipt.openai_total_confidence ?? data.openai_total_confidence ?? 0),
    estimated_items_sum: Number(receipt.estimated_items_sum ?? data.estimated_items_sum ?? 0) || null,
    items,
  }
}

function hasUsableLocalFallback(data: any = {}) {
  data = data && typeof data === "object" ? data : {}
  const receipt = normalizeFunctionReceiptPayload(data)
  return Boolean(data?.ok !== false && (receipt.total_amount > 0 || receipt.items?.length >= 3))
    || Boolean((receipt.total_amount > 0 || receipt.items?.length >= 3) && (data?.provider === "local_fallback" || data?.source === "local_fallback"))
}

function resolveScanStatus(data: any, structured: any) {
  if (data?.scanStatus || data?.scan_status) return data.scanStatus || data.scan_status
  if (Number(structured?.total_amount || 0) <= 0 && (structured?.items || []).length >= 3) return "partial_low_items"
  if (Number(structured?.total_amount || 0) <= 0) return "failed"
  return (structured?.items || []).length < 3 ? "partial_low_items" : "partial"
}

function isLocalFallback(data: any) {
  return data?.provider === "local_fallback" || data?.source === "local_fallback"
}

function isGroceryText(text = "") {
  const clean = String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()

  return [
    "leader price",
    "leclerc",
    "carrefour",
    "super u",
    "hyper u",
    "lidl",
    "score",
    "run market",
    "jumbo",
    "intermarche",
    "epicerie",
    "cremerie",
    "surgeles",
    "charcuterie",
    "hygiene",
    "fruits",
    "legumes",
  ].some(keyword => clean.includes(keyword))
}

function localScanStatus(text: string, total: number, itemCount: number) {
  if (total <= 0) return itemCount >= 3 ? "partial_low_items" : "failed"
  return isGroceryText(text) && itemCount < 3 ? "partial_low_items" : "partial"
}

function itemsTotalAmount(items: any[] = []) {
  const total = (items || []).reduce((sum, item) => {
    return sum + Number(item?.total_price ?? item?.price ?? item?.unit_price ?? 0)
  }, 0)
  return Number(total.toFixed(2))
}

function declaredReceiptItemCount(text = "") {
  const match = String(text || "").match(/\btotal\s+(\d{1,3})\s+articles?\b/i)
  return match ? Number(match[1]) || 0 : 0
}

function localOcrIsGoodEnough(text: string, total: number, itemCount: number) {
  if (total <= 0) return false
  const declaredCount = declaredReceiptItemCount(text)
  if (declaredCount > 0 && itemCount < Math.ceil(declaredCount * 0.6)) return false
  if (isGroceryText(text) && itemCount < 3) return false
  return true
}


function countSectionSubtotalLines(text = "") {
  const lines = String(text || "").split(/\r?\n/)
  return lines.filter(line => {
    const clean = normalizeProviderItemText(line)
    if (!clean) return false
    const hasSection = /\b(charcuter(?:ie|te)?|epicer(?:ie|te)(?: sucree| salee)?|cremerie|crererie|surgeles|sungeles|surgele|boissons(?: sans alcool)?|ultra frais|volaille|ppi)\b/.test(clean)
    const hasAmount = /\b\d{1,3}[,.]\d{2}\b/.test(clean)
    return hasSection && hasAmount && !hasProviderProductSignal(clean)
  }).length
}

function itemNameLooksTooNoisyForLocalLearning(item: any = {}) {
  const raw = firstText(item.name, item.corrected_name, item.ocr_name, item.raw_text, item.source_line)
  const clean = normalizeProviderItemText(raw)
  if (!clean) return true

  const barcodeMatch = clean.match(/\b\d{8,14}\b/)
  if (barcodeMatch?.index != null) {
    const beforeBarcodeLetters = clean.slice(0, barcodeMatch.index).replace(/[^a-z]/g, "")
    if (beforeBarcodeLetters.length >= 6) return true
  }

  if (/(.)\1{3,}/.test(clean)) return true

  const tokens = clean.split(" ").filter(Boolean)
  const suspiciousTokens = tokens.filter(token => {
    if (token.length < 8) return false
    if (/^\d+$/.test(token)) return false
    if (PROVIDER_PRODUCT_WORDS.some(word => token.includes(word) || word.includes(token))) return false
    const vowels = (token.match(/[aeiouy]/g) || []).length
    return vowels === 0 || /(.)\1{2,}/.test(token) || token.length >= 13
  })
  if (suspiciousTokens.length >= 1 && clean.length > 35) return true
  if (suspiciousTokens.length >= 2) return true

  return false
}

function getLocalOcrVisionEscalation(text: string, total: number, items: any[] = [], confidence = 0) {
  const reasons: string[] = []
  const grocery = isGroceryText(text)
  const declaredCount = declaredReceiptItemCount(text)
  const sectionSubtotalLines = countSectionSubtotalLines(text)
  const noisyItems = items.filter(item => itemNameLooksTooNoisyForLocalLearning(item)).length
  const noisyRatio = items.length > 0 ? noisyItems / items.length : 0
  const itemSum = itemsTotalAmount(items)
  const totalGap = total > 0 && itemSum > 0 ? Math.abs(total - itemSum) : 0

  if (!grocery || total <= 0 || items.length < 3) {
    return { required: false, reasons, noisyItems, noisyRatio, sectionSubtotalLines, itemSum, totalGap }
  }

  // Le local/Tesseract peut valider le budget, mais il ne doit pas court-circuiter
  // OpenAI Vision quand les articles semblent trop bruités pour Courses intelligentes.
  if (Number(confidence || 0) > 0 && Number(confidence || 0) < 75) reasons.push("local_confidence_below_learning_threshold")
  if (noisyItems >= 2 || noisyRatio >= 0.34) reasons.push("local_item_names_too_noisy")
  if (sectionSubtotalLines >= 2 && noisyItems >= 1) reasons.push("section_subtotals_with_noisy_items")
  if (declaredCount > 0 && items.length >= declaredCount && sectionSubtotalLines >= 2 && Number(confidence || 0) < 82) reasons.push("declared_count_found_but_learning_quality_uncertain")
  if (totalGap > 0.08 && declaredCount > 0) reasons.push("local_items_sum_mismatch")

  return {
    required: reasons.length > 0,
    reasons,
    noisyItems,
    noisyRatio,
    sectionSubtotalLines,
    itemSum,
    totalGap,
  }
}

type RotationCandidate = 0 | 90 | 180 | 270

async function createRotatedImageVariant(file: File, rotation: RotationCandidate) {
  if (rotation === 0) return file

  const bitmap = await createImageBitmap(file)
  const swap = rotation === 90 || rotation === 270
  const canvas = document.createElement("canvas")
  canvas.width = swap ? bitmap.height : bitmap.width
  canvas.height = swap ? bitmap.width : bitmap.height
  const ctx = canvas.getContext("2d")
  if (!ctx) return file

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"

  if (rotation === 90) {
    ctx.translate(canvas.width, 0)
    ctx.rotate(Math.PI / 2)
  } else if (rotation === 180) {
    ctx.translate(canvas.width, canvas.height)
    ctx.rotate(Math.PI)
  } else if (rotation === 270) {
    ctx.translate(0, canvas.height)
    ctx.rotate((3 * Math.PI) / 2)
  }

  ctx.drawImage(bitmap, 0, 0)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(result => result ? resolve(result) : reject(new Error("rotation_variant_failed")), "image/jpeg", 0.86)
  })

  return new File([blob], `receipt-rotation-${rotation}.jpg`, { type: "image/jpeg", lastModified: Date.now() })
}

function scoreOcrCandidate({ text, confidence, parsed }: { text: string; confidence: number; parsed: any }) {
  const total = Number(parsed?.total_amount || extractReceiptTotal(text) || 0)
  const items = Array.isArray(parsed?.items) ? parsed.items.length : 0
  const lineCount = String(text || "").split(/\r?\n/).filter(Boolean).length
  return Math.round(Number(confidence || 0) + (total > 0 ? 80 : 0) + Math.min(items, 30) * 8 + Math.min(lineCount, 120) * 0.3)
}

async function runTesseractLocalOCR(file: File): Promise<OCRResult> {
  const startedAt = performance.now()
  let worker: any = null
  let importStatus = "not_started"
  let workerStatus = "not_started"

  try {
    importStatus = "loading"
    const tesseract = await import("tesseract.js")
    importStatus = "loaded"
    workerStatus = "creating"
    worker = await tesseract.createWorker("eng", 1, {
      langPath: "https://tessdata.projectnaptha.com/4.0.0_fast",
      logger: (message: any) => {
        if (message?.status) {
          console.info("[scanner] OCR local Tesseract", {
            status: message.status,
            progress: Math.round(Number(message.progress || 0) * 100),
          })
        }
      },
    })
    workerStatus = "ready"

    const rotations: RotationCandidate[] = [0, 90, 180, 270]
    const candidates = []

    for (const rotation of rotations) {
      const variant = await createRotatedImageVariant(file, rotation)
      const result = await worker.recognize(variant)
      const text = String(result?.data?.text || "")
      const confidence = Math.max(0, Math.min(100, Number(result?.data?.confidence || 0)))
      const parsed = text.trim().length >= MIN_LOCAL_OCR_TEXT_LENGTH
        ? parseReceipt({ text, ocrStatus: "success", ocrConfidence: confidence })
        : null
      const score = scoreOcrCandidate({ text, confidence, parsed })
      const total = Number(parsed?.total_amount || extractReceiptTotal(text) || 0)
      const items = Array.isArray(parsed?.items) ? parsed.items.length : 0

      candidates.push({ rotation, text, confidence, parsed, score, total, items })
      console.info("[scanner] OCR local rotation candidate", { rotation, score, confidence, total, items, textLength: text.length })

      const declaredCount = declaredReceiptItemCount(text)
      const enoughItems = declaredCount > 0
        ? items >= Math.ceil(declaredCount * 0.6)
        : items >= 20
      if (localOcrIsGoodEnough(text, total, items) && enoughItems) {
        console.info("[scanner] OCR local rotation suffisante", { rotation, total, items, declaredCount })
        break
      }

      if (performance.now() - startedAt > 30_000) {
        console.info("[scanner] OCR local rotations interrompues", { elapsedMs: Math.round(performance.now() - startedAt), candidates: candidates.length })
        break
      }
    }

    const best = candidates.sort((a, b) => b.score - a.score)[0] || { rotation: 0, text: "", confidence: 0, parsed: null, score: 0, total: 0, items: 0 }
    const text = best.text
    const confidence = best.confidence
    const parsed = best.parsed

    return {
      text,
      status: text.trim().length >= MIN_LOCAL_OCR_TEXT_LENGTH ? "success" : "failed",
      provider: "tesseract-browser-local",
      confidence,
      structured: parsed,
      metrics: {
        provider: "tesseract-browser-local",
        ocrEngine: "tesseract.js",
        ocrDurationMs: Math.round(performance.now() - startedAt),
        aiUsed: false,
        textAiUsed: false,
        visionUsed: false,
        fallbackUsed: true,
        rotationApplied: best.rotation,
        rotationCandidates: candidates.map(candidate => ({
          rotation: candidate.rotation,
          score: candidate.score,
          confidence: candidate.confidence,
          total: candidate.total,
          items: candidate.items,
        })),
        localOcrImportStatus: importStatus,
        localOcrWorkerStatus: workerStatus,
        localOcrErrorType: text.trim() ? "none" : "empty_result",
      },
      error: text.trim() ? "" : "empty_local_ocr",
    }
  } catch (error) {
    const errorType = classifyLocalOcrError(error)
    if (importStatus === "loading") importStatus = "failed"
    if (workerStatus === "creating") workerStatus = "failed"
    console.warn("[scanner] OCR local Tesseract indisponible", error)
    return {
      text: "",
      status: "failed",
      provider: "tesseract-browser-local",
      confidence: 0,
      metrics: {
        provider: "tesseract-browser-local",
        ocrEngine: "tesseract.js",
        ocrDurationMs: Math.round(performance.now() - startedAt),
        aiUsed: false,
        textAiUsed: false,
        visionUsed: false,
        fallbackUsed: true,
        localOcrImportStatus: importStatus,
        localOcrWorkerStatus: workerStatus,
        localOcrErrorType: errorType,
      },
      error: error instanceof Error ? error.message : "local_ocr_failed",
    }
  } finally {
    try {
      await worker?.terminate?.()
      if (workerStatus === "ready") workerStatus = "terminated"
    } catch {
      // Worker cleanup failure should not block the scanner.
    }
  }
}

export class SupabaseReceiptOCRProvider implements OCRProvider {
  name = "supabase-openai-vision"

  async extractText(file: File, browserText = "", imageMeta: Record<string, any> = {}): Promise<OCRResult> {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      throw new ScanError("SCAN_NETWORK_OFFLINE")
    }

    const imageBase64 = await fileToBase64(file)
    const imageSegments = await encodeImageSegments(imageMeta.imageSegments)
    const { imageSegments: _rawImageSegments, ...safeImageMeta } = imageMeta
    const startedAt = performance.now()
    const { data, error } = await withTimeout(
      supabase.functions.invoke("scan-receipt-ocr", {
        body: {
          imageBase64,
          mimeType: file.type || "image/jpeg",
          browserText,
          imageMeta: safeImageMeta,
          imageSegments,
          userPlan: safeImageMeta.user_plan || "free",
        },
      })
    )
    console.log("OCR_PROVIDER_RAW_RESPONSE", data)
    console.info("[scanner] OCR_PROVIDER_RAW_RESPONSE", {
      data,
      error,
      imageBytes: file.size,
      browserTextLength: browserText.length,
      imageMeta: safeImageMeta,
      imageSegmentsCount: imageSegments.length,
    })

    if (error) {
      const payload = await readFunctionErrorPayload(error)
      if (hasUsableLocalFallback(payload)) {
        const structured = normalizeFunctionReceiptPayload(payload)
        const scanStatus = resolveScanStatus(payload, structured)
        return {
          text: String(payload?.text || ""),
          status: "success",
          provider: String(payload?.provider || payload?.source || "local_fallback"),
          confidence: Number(payload?.confidence || 70),
          structured,
          metrics: {
            provider: String(payload?.provider || payload?.source || "local_fallback"),
            model: payload?.model || null,
            ocrDurationMs: Math.round(performance.now() - startedAt),
            scanStatus,
            stage: payload?.stage || null,
            source: payload?.source || payload?.provider || null,
            aiUsed: Boolean(payload?.openai_called),
            textAiUsed: Boolean(payload?.text_ai_used || String(payload?.provider || "").includes("text")),
            visionUsed: Boolean(payload?.vision_used || String(payload?.provider || "").includes("vision")),
            fastLocalExtractionUsed: Boolean(payload?.fast_local_extraction_used || isLocalFallback(payload)),
            openaiCalled: Boolean(payload?.openai_called),
            itemsDetectedBeforeOpenAi: payload?.items_detected_before_openai ?? structured.items.length,
            totalDetectedBeforeOpenAi: payload?.total_detected_before_openai ?? true,
          },
          error: "",
        }
      }
      const fallbackMessage = String(error.message || "")
      const message = diagnosticMessage(payload, fallbackMessage)
      const code = toScanErrorCode(payload?.error_code || payload?.code)

      if (code === "SCAN_OPENAI_KEY_MISSING" || message.includes("OPENAI_API_KEY")) {
        throw new ScanError("SCAN_OPENAI_KEY_MISSING", message)
      }
      throw new ScanError(code, message)
    }

    if (!data?.ok) {
      if (hasUsableLocalFallback(data)) {
        data.ok = true
      } else {
        const message = diagnosticMessage(data, data?.error || "scan-receipt-ocr returned ok=false.")
        const code = toScanErrorCode(data?.error_code || data?.code || data?.errorCode)

        if (code === "SCAN_OPENAI_KEY_MISSING") throw new ScanError("SCAN_OPENAI_KEY_MISSING", message)
        if (code === "SCAN_OPENAI_QUOTA_EXCEEDED") throw new ScanError("SCAN_OPENAI_QUOTA_EXCEEDED", message)
        if (code === "SCAN_OPENAI_KEY_INVALID") throw new ScanError("SCAN_OPENAI_KEY_INVALID", message)
        if (code === "SCAN_OPENAI_REQUEST_INVALID") throw new ScanError("SCAN_OPENAI_REQUEST_INVALID", message)
        if (code === "SCAN_AI_RESPONSE_INVALID") throw new ScanError("SCAN_AI_RESPONSE_INVALID", message)
        throw new ScanError(code === "SCAN_PARSE_FAILED" ? "SCAN_PARSE_FAILED" : "SCAN_OPENAI_REQUEST_FAILED", message)
      }
    }

    const structured = normalizeFunctionReceiptPayload(data)
    const hasStructuredTotal = structured.total_amount > 0
    const providerName = String(data.provider || data.source || this.name)
    const scanStatus = resolveScanStatus(data, structured)

    return {
      text: String(data.text || ""),
      status: data.text || hasStructuredTotal ? "success" : "failed",
      provider: providerName,
      confidence: Number(data.confidence || 82),
      structured,
      metrics: {
        provider: providerName,
        model: data.model || null,
        openaiDurationMs: data.openaiDurationMs ?? null,
        inputTokens: data.inputTokens ?? null,
        outputTokens: data.outputTokens ?? null,
        estimatedCostEur: data.estimatedCostEur ?? null,
        ocrDurationMs: Math.round(performance.now() - startedAt),
        scanStatus,
        scanStrategyUsed: data.scan_strategy_used || null,
        scanAiCallsCount: data.scan_ai_calls_count ?? null,
        splitRetryEligible: data.split_retry_eligible ?? data.diagnostics?.split_retry_eligible ?? false,
        splitRetryUsed: data.split_retry_used ?? false,
        splitRetrySkippedReason: data.split_retry_skipped_reason || data.diagnostics?.split_retry_skipped_reason || null,
        splitSegmentsCount: data.split_segments_count ?? null,
        splitSegmentsStrategy: data.split_segments_strategy || null,
        splitSegmentsOverlapPercent: data.split_segments_overlap_percent ?? null,
        splitSegmentsResults: data.split_segments_results || null,
        splitSegmentsSuccessCount: data.split_segments_success_count ?? data.diagnostics?.split_segments_success_count ?? null,
        splitSegmentsTimeoutCount: data.split_segments_timeout_count ?? data.diagnostics?.split_segments_timeout_count ?? null,
        splitTotalInputTokens: data.split_total_input_tokens ?? data.diagnostics?.split_total_input_tokens ?? null,
        splitTotalOutputTokens: data.split_total_output_tokens ?? data.diagnostics?.split_total_output_tokens ?? null,
        splitTotalDurationMs: data.split_total_duration_ms ?? data.diagnostics?.split_total_duration_ms ?? null,
        recoveryRatio: data.recovery_ratio ?? data.diagnostics?.recovery_ratio ?? null,
        recoveryRatioRaw: data.recovery_ratio_raw ?? data.diagnostics?.recovery_ratio_raw ?? null,
        recoveryRatioCapped: data.recovery_ratio_capped ?? data.diagnostics?.recovery_ratio_capped ?? null,
        recoveryRatioStatus: data.recovery_ratio_status ?? data.diagnostics?.recovery_ratio_status ?? null,
        splitCostWarning: data.split_cost_warning ?? data.diagnostics?.split_cost_warning ?? null,
        splitFailureReason: data.split_failure_reason || data.diagnostics?.split_failure_reason || null,
        localOcrAvailable: data.local_ocr_available ?? data.diagnostics?.local_ocr_available ?? null,
        localOcrAttempted: data.local_ocr_attempted ?? data.diagnostics?.local_ocr_attempted ?? null,
        localOcrEngine: data.local_ocr_engine || data.diagnostics?.local_ocr_engine || null,
        localOcrImportStatus: data.local_ocr_import_status || data.diagnostics?.local_ocr_import_status || null,
        localOcrWorkerStatus: data.local_ocr_worker_status || data.diagnostics?.local_ocr_worker_status || null,
        localOcrErrorType: data.local_ocr_error_type || data.diagnostics?.local_ocr_error_type || null,
        localOcrDurationMs: data.local_ocr_duration_ms ?? data.diagnostics?.local_ocr_duration_ms ?? null,
        localOcrError: data.local_ocr_error || data.diagnostics?.local_ocr_error || null,
        localOcrSkippedReason: data.local_ocr_skipped_reason || data.diagnostics?.local_ocr_skipped_reason || null,
        browserTextLength: data.browserTextLength ?? data.diagnostics?.browserTextLength ?? null,
        browserTextLengthBeforePayload: data.browserTextLength_before_payload ?? data.diagnostics?.browserTextLength_before_payload ?? null,
        browserTextLengthSentToEdge: data.browserTextLength_sent_to_edge ?? data.diagnostics?.browserTextLength_sent_to_edge ?? null,
        edgeTextLength: data.edge_text_length ?? data.diagnostics?.edge_text_length ?? null,
        imagePreprocessingForOcr: data.image_preprocessing_for_ocr ?? data.diagnostics?.image_preprocessing_for_ocr ?? null,
        textEmptyReason: data.text_empty_reason || data.diagnostics?.text_empty_reason || null,
        expectedItemsMinIsProven: data.expected_items_min_is_proven ?? data.diagnostics?.expected_items_min_is_proven ?? null,
        recoveryRatioDenominatorSource: data.recovery_ratio_denominator_source || data.diagnostics?.recovery_ratio_denominator_source || null,
        recoveryRatioBlockedReason: data.recovery_ratio_blocked_reason || data.diagnostics?.recovery_ratio_blocked_reason || null,
        imageQualityWarning: data.image_quality_warning ?? data.diagnostics?.image_quality_warning ?? null,
        aiCalledAfterLocalOcrTechnicalFailure: data.ai_called_after_local_ocr_technical_failure ?? data.diagnostics?.ai_called_after_local_ocr_technical_failure ?? null,
        aiCallRiskReason: data.ai_call_risk_reason || data.diagnostics?.ai_call_risk_reason || null,
        shouldSkipAiDueToLocalOcrFailure: data.should_skip_ai_due_to_local_ocr_failure ?? data.diagnostics?.should_skip_ai_due_to_local_ocr_failure ?? null,
        scanReliabilityBlockedReason: data.scan_reliability_blocked_reason || data.diagnostics?.scan_reliability_blocked_reason || null,
        totalVerifiedAgainstLocalOcr: data.total_verified_against_local_ocr ?? data.diagnostics?.total_verified_against_local_ocr ?? null,
        totalVerifiedAgainstSegmentText: data.total_verified_against_segment_text ?? data.diagnostics?.total_verified_against_segment_text ?? null,
        primaryStage: data.primary_stage || data.diagnostics?.primary_stage || null,
        primaryError: data.primary_error || data.diagnostics?.primary_error || null,
        fallbackStage: data.fallback_stage || data.diagnostics?.fallback_stage || null,
        premiumPlusDetected: data.premium_plus_detected ?? data.diagnostics?.premium_plus_detected ?? false,
        segmentsReceivedByEdgeFunction: data.segments_received_by_edge_function ?? data.diagnostics?.segments_received_by_edge_function ?? null,
        timeoutReason: data.timeoutReason || null,
        totalDetectionDurationMs: data.totalDetectionDurationMs ?? null,
        stage: data.stage || null,
        source: data.source || data.provider || null,
        aiUsed: Boolean(data.openai_called),
        textAiUsed: Boolean(data.text_ai_used || providerName.includes("text")),
        visionUsed: Boolean(data.vision_used || providerName.includes("vision")),
        fastLocalExtractionUsed: Boolean(data.fast_local_extraction_used || isLocalFallback(data)),
        openaiCalled: Boolean(data.openai_called),
        itemsDetectedBeforeOpenAi: data.items_detected_before_openai ?? structured.items.length,
        totalDetectedBeforeOpenAi: data.total_detected_before_openai ?? hasStructuredTotal,
        totalNeedsReview: data.total_needs_review ?? structured.total_needs_review ?? false,
        totalRawText: data.total_raw_text || structured.total_raw_text || "",
        totalConfidence: data.total_confidence ?? structured.total_confidence ?? null,
        totalSource: data.total_source || structured.total_source || null,
        totalRejectedReason: data.total_rejected_reason || structured.total_rejected_reason || null,
        totalRawTextVerifiedAgainstOcr: data.total_raw_text_verified_against_ocr ?? structured.total_raw_text_verified_against_ocr ?? false,
        openaiTotalValue: data.openai_total_value ?? structured.openai_total_value ?? null,
        openaiTotalRawText: data.openai_total_raw_text || structured.openai_total_raw_text || "",
        openaiTotalConfidence: data.openai_total_confidence ?? structured.openai_total_confidence ?? null,
        estimatedItemsSum: data.estimated_items_sum ?? structured.estimated_items_sum ?? null,
        expectedItemsMin: data.expected_items_min ?? null,
        expectedItemsSource: data.expected_items_source ?? null,
        declaredItemsCount: data.declared_items_count ?? null,
        declaredItemsRawText: data.declared_items_raw_text || "",
        itemsCountStatus: data.items_count_status || null,
        trustedItemsCount: data.trusted_items_count ?? data.diagnostics?.trusted_items_count ?? null,
        needsReviewItemsCount: data.needs_review_items_count ?? data.diagnostics?.needs_review_items_count ?? null,
        rejectedItemsCount: data.rejected_items_count ?? data.diagnostics?.rejected_items_count ?? null,
        trustedItemsRatio: data.trusted_items_ratio ?? data.diagnostics?.trusted_items_ratio ?? null,
        itemsQualityStatus: data.items_quality_status || data.diagnostics?.items_quality_status || null,
        itemsSentToSmartShoppingCount: data.items_sent_to_smart_shopping_count ?? data.diagnostics?.items_sent_to_smart_shopping_count ?? null,
        itemsExcludedFromSmartShoppingCount: data.items_excluded_from_smart_shopping_count ?? data.diagnostics?.items_excluded_from_smart_shopping_count ?? null,
        displayedItemsCount: data.displayed_items_count ?? data.diagnostics?.displayed_items_count ?? null,
        displayedItemsCountSource: data.displayed_items_count_source || data.diagnostics?.displayed_items_count_source || null,
        realItemsCountIfKnown: data.real_items_count_if_known ?? data.diagnostics?.real_items_count_if_known ?? null,
        itemCountDisplayLabel: data.item_count_display_label || data.diagnostics?.item_count_display_label || null,
        itemsExcludedReasonsSummary: data.items_excluded_reasons_summary || data.diagnostics?.items_excluded_reasons_summary || null,
        sectionSubtotalsRejectedCount: data.section_subtotals_rejected_count ?? data.diagnostics?.section_subtotals_rejected_count ?? null,
        sectionSubtotalsRejectedLines: data.section_subtotals_rejected_lines || data.diagnostics?.section_subtotals_rejected_lines || null,
        rejectedSectionSubtotalExamples: data.rejected_section_subtotal_examples || data.diagnostics?.rejected_section_subtotal_examples || null,
        itemsKeptLines: data.items_kept_lines || data.diagnostics?.items_kept_lines || null,
        itemsRejectedLines: data.items_rejected_lines || data.diagnostics?.items_rejected_lines || null,
        itemQualitySummary: data.item_quality_summary || data.diagnostics?.item_quality_summary || null,
        budgetReliable: data.budget_reliable ?? data.diagnostics?.budget_reliable ?? null,
        smartShoppingSafe: data.smart_shopping_safe ?? data.diagnostics?.smart_shopping_safe ?? null,
        smartShoppingBlockedReasons: data.smart_shopping_blocked_reasons || data.diagnostics?.smart_shopping_blocked_reasons || [],
        budgetStatus: data.budget_status || data.diagnostics?.budget_status || null,
        finalScanStatus: data.final_scan_status || data.diagnostics?.final_scan_status || null,
        scanStatusLegacy: data.scan_status_legacy || data.diagnostics?.scan_status_legacy || null,
        openaiPrompt: data.openai_prompt || null,
        openaiRawContent: data.openai_raw_content || null,
        openaiRawResponseBody: data.openai_raw_response_body || null,
        visionInputMode: data.vision_input_mode || null,
        visionImageSize: data.vision_image_size || null,
        rawItemsDetectedByVision: data.raw_items_detected_by_vision ?? null,
        reliableItemsDetectedByVision: data.reliable_items_detected_by_vision ?? null,
        rawItemsDetectedBySplit: data.raw_items_detected_by_split ?? null,
        reliableItemsDetectedBySplit: data.reliable_items_detected_by_split ?? null,
        splitTotalValue: data.split_total_value ?? null,
        splitTotalRawText: data.split_total_raw_text || "",
        splitTotalConfidence: data.split_total_confidence ?? null,
        calculatedItemsSum: data.calculated_items_sum ?? null,
        totalDifference: data.total_difference ?? null,
        discardedHallucinatedItemsCount: data.discarded_hallucinated_items_count ?? null,
      },
      error: "",
    }
  }
}

export class HybridOCRProvider implements OCRProvider {
  name = "hybrid-browser-edge"

  async extractText(file: File, _browserText = "", imageMeta: Record<string, any> = {}): Promise<OCRResult> {
    const browser = await new BrowserTextDetectorProvider().extractText(file)
    const browserTotal = extractReceiptTotal(browser.text)
    const browserParsed = browser.status === "success" && browser.text.trim()
      ? parseReceipt({ text: browser.text, ocrStatus: browser.status, ocrConfidence: browser.confidence })
      : null
    const browserItems = browserParsed?.items || []

    if (browser.status === "success" && browser.text.trim() && browserTotal > 0 && browserItems.length >= MIN_FAST_BROWSER_ITEMS) {
      console.info("[scanner] OCR navigateur suffisant", { total: browserTotal, items: browserItems.length, provider: browser.provider })
      return {
        ...browser,
        provider: "browser-text-detector-fast-total",
        structured: browserParsed,
        metrics: {
          ...(browser.metrics || {}),
          provider: browser.provider,
          ocrEngine: browser.provider,
          aiUsed: false,
          textAiUsed: false,
          visionUsed: false,
          fallbackUsed: false,
          scanStatus: "partial",
          fastTotalDetected: browserTotal,
          browserItemsDetected: browserItems.length,
        },
      }
    }

    const localOcr = await runTesseractLocalOCR(file)
    const localText = [browser.text, localOcr.text].filter(text => String(text || "").trim()).join("\n")
    const localOcrPayloadDiagnostics = {
      local_ocr_attempted: true,
      local_ocr_engine: localOcr.provider || "tesseract-browser-local",
      local_ocr_status: localOcr.status,
      local_ocr_import_status: localOcr.metrics?.localOcrImportStatus || "unknown",
      local_ocr_worker_status: localOcr.metrics?.localOcrWorkerStatus || "unknown",
      local_ocr_duration_ms: localOcr.metrics?.ocrDurationMs ?? null,
      local_ocr_error: localOcr.error || "",
      local_ocr_error_type: localOcr.metrics?.localOcrErrorType || classifyLocalOcrError(localOcr.error),
      local_ocr_skipped_reason: "",
      browser_ocr_status: browser.status,
      browser_ocr_error: browser.error || "",
      browser_ocr_text_length: browser.text.length,
      tesseract_text_length: localOcr.text.length,
      browserTextLength_before_payload: localText.length,
      browser_text_length_before_payload: localText.length,
      browserTextLength_sent_to_edge: localText.length,
      ai_called_after_local_ocr_technical_failure: false,
      ai_call_risk_reason: "",
      should_skip_ai_due_to_local_ocr_failure: isTechnicalLocalOcrFailure(localOcr.metrics?.localOcrErrorType || classifyLocalOcrError(localOcr.error)),
    }
    const localParsed = localText.trim()
      ? parseReceipt({
        text: localText,
        ocrStatus: localOcr.status === "success" || browser.status === "success" ? "success" : "failed",
        ocrConfidence: Math.max(Number(localOcr.confidence || 0), Number(browser.confidence || 0)),
      })
      : null
    const localItems = Array.isArray(localParsed?.items) ? localParsed.items : []
    const localTotal = Number(localParsed?.total_amount || extractReceiptTotal(localText) || browserTotal || 0)

    const mergedLocalItems = mergeReceiptItems(localItems, browserItems)
    const localLearningEscalation = getLocalOcrVisionEscalation(
      localText,
      localTotal,
      mergedLocalItems,
      Math.max(Number(localOcr.confidence || 0), Number(browser.confidence || 0)),
    )

    if (localOcrIsGoodEnough(localText, localTotal, localItems.length) && !localLearningEscalation.required) {
      const items = mergedLocalItems
      const scanStatus = localScanStatus(localText, localTotal, items.length)

      console.info("[scanner] OCR local suffisant", {
        total: localTotal,
        items: items.length,
        provider: localOcr.provider,
        scanStatus,
      })

      return {
        text: localText,
        status: "success",
        provider: "local-ocr-regex-fallback",
        confidence: Math.max(Number(localOcr.confidence || 0), Number(browser.confidence || 0), items.length ? 68 : 55),
        structured: {
          ...(localParsed || {}),
          store_name: localParsed?.store_name || browserParsed?.store_name || "",
          purchase_date: localParsed?.purchase_date || browserParsed?.purchase_date || "",
          total_amount: localTotal,
          items,
        },
        metrics: {
          ...(localOcr.metrics || {}),
          provider: "local-ocr-regex-fallback",
          ocrEngine: localOcr.provider,
          aiUsed: false,
          textAiUsed: false,
          visionUsed: false,
          fallbackUsed: true,
          scanStatus,
          fastLocalExtractionUsed: true,
          openaiCalled: false,
          browserItemsDetected: browserItems.length,
          localOcrItemsDetected: items.length,
          itemsDetectedBeforeOpenAi: items.length,
          totalDetectedBeforeOpenAi: true,
          localOcrQualityEscalationRequired: false,
          localOcrQualityEscalationReasons: [],
        },
        error: "",
      }
    }

    if (localLearningEscalation.required) {
      console.info("[scanner] OCR local budget OK mais articles trop incertains, appel Vision requis", {
        total: localTotal,
        items: mergedLocalItems.length,
        reasons: localLearningEscalation.reasons,
        noisyItems: localLearningEscalation.noisyItems,
        sectionSubtotalLines: localLearningEscalation.sectionSubtotalLines,
      })
    }

    let fallback: OCRResult
    try {
      fallback = await new SupabaseReceiptOCRProvider().extractText(file, localText || browser.text, {
        ...imageMeta,
        ...localOcrPayloadDiagnostics,
        local_ocr_quality_escalation_required: localLearningEscalation.required,
        local_ocr_quality_escalation_reasons: localLearningEscalation.reasons,
        local_ocr_noisy_items_count: localLearningEscalation.noisyItems,
        local_ocr_noisy_items_ratio: Number(localLearningEscalation.noisyRatio.toFixed(2)),
        local_ocr_section_subtotal_lines_count: localLearningEscalation.sectionSubtotalLines,
        local_ocr_items_sum: localLearningEscalation.itemSum,
        local_ocr_total_gap: Number(localLearningEscalation.totalGap.toFixed(2)),
      })
    } catch (error) {
      const preservedItems = mergeReceiptItems(localItems, browserItems)
      const provisionalTotal = localTotal || (preservedItems.length >= 3 ? itemsTotalAmount(preservedItems) : 0)
      if (localText.trim() && (localTotal > 0 || preservedItems.length >= 3)) {
        console.warn("[scanner] Erreur serveur ignoree, ticket conserve avec OCR local", error)
        return {
          text: localText,
          status: "success",
          provider: localTotal > 0 ? "local-ocr-regex-fallback" : "local-ocr-items-preserved",
          confidence: Math.max(Number(localOcr.confidence || 0), Number(browser.confidence || 0), preservedItems.length ? 68 : 55),
          structured: {
            ...(localParsed || {}),
            total_amount: provisionalTotal,
            items: preservedItems,
          },
          metrics: {
            ...(localOcr.metrics || {}),
            provider: localTotal > 0 ? "local-ocr-regex-fallback" : "local-ocr-items-preserved",
            ocrEngine: localOcr.provider,
            aiUsed: false,
            textAiUsed: false,
            visionUsed: false,
            fallbackUsed: true,
            scanStatus: localTotal > 0 ? localScanStatus(localText, localTotal, preservedItems.length) : "partial_low_items",
            timeoutReason: error instanceof Error ? error.message : "server_ocr_fallback_failed",
            localOcrQualityEscalationRequired: localLearningEscalation.required,
            localOcrQualityEscalationReasons: localLearningEscalation.reasons,
            browserItemsDetected: browserItems.length,
            localOcrItemsDetected: preservedItems.length,
            itemsDetectedBeforeOpenAi: preservedItems.length,
            totalDetectedBeforeOpenAi: localTotal > 0,
            totalEstimatedFromItems: localTotal <= 0 && provisionalTotal > 0,
          },
        }
      }
      throw error
    }

    const fallbackItems = Array.isArray(fallback.structured?.items) ? fallback.structured.items : []
    const mergedItems = mergeReceiptItems(fallbackItems, browserItems)
    const structured = {
      ...(fallback.structured || {}),
      store_name: fallback.structured?.store_name || browserParsed?.store_name || "",
      purchase_date: fallback.structured?.purchase_date || browserParsed?.purchase_date || "",
      total_amount: Number(fallback.structured?.total_amount || browserParsed?.total_amount || browserTotal || 0),
      items: mergedItems.length >= fallbackItems.length ? mergedItems : fallbackItems,
    }

    return {
      ...fallback,
      text: fallback.text || browser.text,
      structured,
      metrics: {
        ...(fallback.metrics || {}),
        ocrEngine: browser.provider,
        aiUsed: Boolean(fallback.metrics?.aiUsed),
        textAiUsed: false,
        visionUsed: Boolean(fallback.metrics?.visionUsed),
        fallbackUsed: true,
        browserItemsDetected: browserItems.length,
        serverItemsDetected: fallbackItems.length,
        mergedItemsDetected: structured.items.length,
      },
    }
  }
}

export function getDefaultOCRProvider(): OCRProvider {
  return new HybridOCRProvider()
}
