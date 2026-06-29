import { supabase } from "../supabase"
import { extractReceiptTotal } from "./receiptParser"
import { ScanError } from "./scanErrors"

const OCR_TIMEOUT_MS = 10000

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

export class SupabaseReceiptOCRProvider implements OCRProvider {
  name = "supabase-openai-vision"

  async extractText(file: File): Promise<OCRResult> {
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
        },
      })
    )

    if (error) {
      const message = String(error.message || "")
      if (message.includes("OPENAI_API_KEY")) throw new ScanError("SCAN_OPENAI_KEY_MISSING", message)
      throw new ScanError("SCAN_OPENAI_REQUEST_FAILED", message)
    }

    if (!data?.ok) {
      const code = data?.code || data?.errorCode
      if (code === "SCAN_OPENAI_KEY_MISSING") throw new ScanError("SCAN_OPENAI_KEY_MISSING", data?.error)
      if (code === "SCAN_OPENAI_QUOTA_EXCEEDED") throw new ScanError("SCAN_OPENAI_QUOTA_EXCEEDED", data?.error)
      if (code === "SCAN_AI_RESPONSE_INVALID") throw new ScanError("SCAN_AI_RESPONSE_INVALID", data?.error)
      throw new ScanError("SCAN_OPENAI_REQUEST_FAILED", data?.error || "scan-receipt-ocr returned ok=false.")
    }

    return {
      text: String(data.text || ""),
      status: data.text ? "success" : "failed",
      provider: this.name,
      confidence: Number(data.confidence || 82),
      structured: data.receipt || null,
      metrics: {
        provider: this.name,
        model: data.model || null,
        openaiDurationMs: data.openaiDurationMs ?? null,
        inputTokens: data.inputTokens ?? null,
        outputTokens: data.outputTokens ?? null,
        estimatedCostEur: data.estimatedCostEur ?? null,
        ocrDurationMs: Math.round(performance.now() - startedAt),
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

    if (browser.status === "success" && browser.text.trim() && browserTotal > 0) {
      console.info("[scanner] Total rapide detecte avant IA", { total: browserTotal, provider: browser.provider })
      return {
        ...browser,
        provider: "browser-text-detector-fast-total",
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
        },
      }
    }

    let fallback: OCRResult
    try {
      fallback = await new SupabaseReceiptOCRProvider().extractText(file)
    } catch (error) {
      if (browser.status === "success" && browser.text.trim() && browserTotal > 0) {
        console.warn("[scanner] Timeout IA ignore, ticket conserve avec OCR rapide", error)
        return {
          ...browser,
          provider: "browser-text-detector-partial-timeout",
          metrics: {
            ...(browser.metrics || {}),
            provider: browser.provider,
            ocrEngine: browser.provider,
            aiUsed: false,
            textAiUsed: false,
            visionUsed: false,
            fallbackUsed: true,
            scanStatus: "partial",
            timeoutReason: error instanceof Error ? error.message : "ai_timeout",
            fastTotalDetected: browserTotal,
          },
        }
      }
      throw error
    }

    return {
      ...fallback,
      metrics: {
        ...(fallback.metrics || {}),
        ocrEngine: browser.provider,
        aiUsed: true,
        textAiUsed: false,
        visionUsed: true,
        fallbackUsed: true,
      },
    }
  }
}

export function getDefaultOCRProvider(): OCRProvider {
  return new HybridOCRProvider()
}
