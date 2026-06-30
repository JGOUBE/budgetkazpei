import { supabase } from "../supabase"
import { extractReceiptTotal, mergeReceiptItems, parseReceipt } from "./receiptParser"
import { ScanError, type ScanErrorCode } from "./scanErrors"

const OCR_TIMEOUT_MS = 15000
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
  extractText(file: File): Promise<OCRResult>
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
  return Number(String(value ?? "").replace(",", ".")) || 0
}

function firstText(...values: unknown[]) {
  return String(values.find(value => String(value ?? "").trim()) ?? "").trim()
}

function normalizeFunctionItems(items: any[] = []) {
  return (items || [])
    .filter(item => String(item?.name || item?.ocr_name || "").trim())
    .map(item => {
      const price = money(item.total_price) || money(item.price) || money(item.unit_price)
      const name = firstText(item.name, item.corrected_name, item.ocr_name, "Produit a verifier")

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
        item_status: item.item_status || item.status || "a_verifier",
        status: item.status || item.item_status || "a_verifier",
        confidence_score: item.confidence_score == null ? 65 : Number(item.confidence_score),
        line_type: item.line_type || "product",
        category: item.category || "alimentaire",
      }
    })
    .filter(item => item.total_price > 0)
}

function normalizeFunctionReceiptPayload(data: any = {}) {
  data = data && typeof data === "object" ? data : {}
  const receipt = data.receipt && typeof data.receipt === "object" ? data.receipt : {}
  const items = normalizeFunctionItems(Array.isArray(receipt.items) ? receipt.items : Array.isArray(data.items) ? data.items : [])
  const totalAmount = money(receipt.total_amount) || money(receipt.total) || money(receipt.totalAmount) || money(data.total_amount) || money(data.total) || money(data.totalAmount)
  const storeName = firstText(receipt.store_name, receipt.merchant_name, receipt.merchant, data.store_name, data.merchant_name, data.merchant)
  const purchaseDate = firstText(receipt.purchase_date, receipt.date, data.purchase_date, data.date)

  return {
    ...receipt,
    store_name: storeName,
    merchant_name: firstText(receipt.merchant_name, storeName),
    purchase_date: purchaseDate,
    total_amount: totalAmount,
    items,
  }
}

function hasUsableLocalFallback(data: any = {}) {
  data = data && typeof data === "object" ? data : {}
  const receipt = normalizeFunctionReceiptPayload(data)
  return Boolean(data?.ok !== false && receipt.total_amount > 0) || Boolean(receipt.total_amount > 0 && (data?.provider === "local_fallback" || data?.source === "local_fallback"))
}

function resolveScanStatus(data: any, structured: any) {
  if (data?.scanStatus || data?.scan_status) return data.scanStatus || data.scan_status
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
  if (total <= 0) return "failed"
  return isGroceryText(text) && itemCount < 3 ? "partial_low_items" : "partial"
}

async function runTesseractLocalOCR(file: File): Promise<OCRResult> {
  const startedAt = performance.now()
  let worker: any = null

  try {
    const tesseract = await import("tesseract.js")
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

    const result = await worker.recognize(file)
    const text = String(result?.data?.text || "")
    const confidence = Math.max(0, Math.min(100, Number(result?.data?.confidence || 0)))
    const parsed = text.trim().length >= MIN_LOCAL_OCR_TEXT_LENGTH
      ? parseReceipt({ text, ocrStatus: "success", ocrConfidence: confidence })
      : null

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
      },
      error: text.trim() ? "" : "empty_local_ocr",
    }
  } catch (error) {
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
      },
      error: error instanceof Error ? error.message : "local_ocr_failed",
    }
  } finally {
    try {
      await worker?.terminate?.()
    } catch {
      // Worker cleanup failure should not block the scanner.
    }
  }
}

export class SupabaseReceiptOCRProvider implements OCRProvider {
  name = "supabase-openai-vision"

  async extractText(file: File, browserText = ""): Promise<OCRResult> {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      throw new ScanError("SCAN_NETWORK_OFFLINE")
    }

    const imageBase64 = await fileToBase64(file)
    const startedAt = performance.now()
    const { data, error } = await withTimeout(
      supabase.functions.invoke("scan-receipt-ocr", {
        body: {
          imageBase64,
          mimeType: file.type || "image/jpeg",
          browserText,
        },
      })
    )
    console.log("OCR_PROVIDER_RAW_RESPONSE", data)
    console.info("[scanner] OCR_PROVIDER_RAW_RESPONSE", {
      data,
      error,
      imageBytes: file.size,
      browserTextLength: browserText.length,
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
            visionUsed: Boolean(payload?.openai_called),
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
        timeoutReason: data.timeoutReason || null,
        totalDetectionDurationMs: data.totalDetectionDurationMs ?? null,
        stage: data.stage || null,
        source: data.source || data.provider || null,
        aiUsed: Boolean(data.openai_called),
        visionUsed: Boolean(data.openai_called),
        fastLocalExtractionUsed: Boolean(data.fast_local_extraction_used || isLocalFallback(data)),
        openaiCalled: Boolean(data.openai_called),
        itemsDetectedBeforeOpenAi: data.items_detected_before_openai ?? structured.items.length,
        totalDetectedBeforeOpenAi: data.total_detected_before_openai ?? hasStructuredTotal,
      },
      error: "",
    }
  }
}

export class HybridOCRProvider implements OCRProvider {
  name = "hybrid-browser-edge"

  async extractText(file: File): Promise<OCRResult> {
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
    const localParsed = localText.trim()
      ? parseReceipt({
        text: localText,
        ocrStatus: localOcr.status === "success" || browser.status === "success" ? "success" : "failed",
        ocrConfidence: Math.max(Number(localOcr.confidence || 0), Number(browser.confidence || 0)),
      })
      : null
    const localItems = Array.isArray(localParsed?.items) ? localParsed.items : []
    const localTotal = Number(localParsed?.total_amount || extractReceiptTotal(localText) || browserTotal || 0)

    if (localTotal > 0) {
      const items = mergeReceiptItems(localItems, browserItems)
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
        },
        error: "",
      }
    }

    let fallback: OCRResult
    try {
      fallback = await new SupabaseReceiptOCRProvider().extractText(file, localText || browser.text)
    } catch (error) {
      if (localText.trim() && localTotal > 0) {
        console.warn("[scanner] Erreur serveur ignoree, ticket conserve avec OCR local", error)
        return {
          text: localText,
          status: "success",
          provider: "local-ocr-regex-fallback",
          confidence: Math.max(Number(localOcr.confidence || 0), Number(browser.confidence || 0), localItems.length ? 68 : 55),
          structured: {
            ...(localParsed || {}),
            total_amount: localTotal,
            items: mergeReceiptItems(localItems, browserItems),
          },
          metrics: {
            ...(localOcr.metrics || {}),
            provider: "local-ocr-regex-fallback",
            ocrEngine: localOcr.provider,
            aiUsed: false,
            textAiUsed: false,
            visionUsed: false,
            fallbackUsed: true,
            scanStatus: localScanStatus(localText, localTotal, localItems.length),
            timeoutReason: error instanceof Error ? error.message : "server_ocr_fallback_failed",
            browserItemsDetected: browserItems.length,
            localOcrItemsDetected: localItems.length,
            itemsDetectedBeforeOpenAi: localItems.length,
            totalDetectedBeforeOpenAi: true,
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
