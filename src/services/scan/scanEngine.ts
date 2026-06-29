import { optimizeReceiptImage } from "./imageOptimizer"
import { getDefaultOCRProvider, type OCRProvider } from "./ocrProvider"
import { mergeReceiptItems, normalizeReceiptDate, parseReceipt } from "./receiptParser"
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
}

function emit(onProgress: ScanEngineOptions["onProgress"], step: ScanStep, label: string, progress: number) {
  onProgress?.({ step, label, progress })
}

export async function runSmartScan(file: File, options: ScanEngineOptions = {}) {
  const provider = options.provider || getDefaultOCRProvider()
  const scanStartedAt = performance.now()

  try {
    emit(options.onProgress, "optimizing", "Optimisation de l'image...", 12)
    const optimized = await optimizeReceiptImage(file)

    emit(options.onProgress, "reading", "Lecture du ticket...", 30)
    const ocrStartedAt = performance.now()
    const ocr = await provider.extractText(optimized.file)
    const ocrDurationMs = Math.round(performance.now() - ocrStartedAt)

    emit(options.onProgress, "store", "Identification du magasin...", 48)
    const parsingStartedAt = performance.now()
    const parsed = parseReceipt({
      text: ocr.text,
      ocrStatus: ocr.status,
      ocrConfidence: ocr.confidence,
    })
    console.info("[scanner] OCR termine", { ok: ocr.status === "success", provider: ocr.provider })

    const structured = ocr.structured || {}
    if (structured && typeof structured === "object") {
      parsed.store_name = structured.store_name || parsed.store_name
      const structuredDate = normalizeReceiptDate(structured.purchase_date || "")
      parsed.purchase_date = parsed.purchase_date || structuredDate
      parsed.total_amount = Number(structured.total_amount || parsed.total_amount || 0)
      const structuredItems = Array.isArray(structured.items) ? structured.items : []
      parsed.items = parsed.items.length
        ? mergeReceiptItems(parsed.items, [])
        : structuredItems.length
          ? mergeReceiptItems(structuredItems, [])
          : parsed.items
      parsed.ai_used = ocr.provider.includes("openai")
    }
    console.info("[scanner] Date detectee", parsed.purchase_date || "")
    console.info("[scanner] Magasin detecte", parsed.store_name || "")
    console.info("[scanner] Total detecte", parsed.total_amount || 0)
    console.info("[scanner] Nombre d'articles detectes", parsed.items.length)
    ;(parsed as any).ocr_provider = ocr.provider
    const parsingDurationMs = Math.round(performance.now() - parsingStartedAt)

    emit(options.onProgress, "products", "Extraction des produits...", 66)
    await Promise.resolve()

    emit(options.onProgress, "total", "Calcul du total...", 82)
    const validation = validateParsedReceipt(parsed)

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
        ocrDurationMs: ocr.metrics?.ocrDurationMs ?? ocrDurationMs,
        openaiDurationMs: ocr.metrics?.openaiDurationMs ?? null,
        parsingDurationMs,
        inputTokens: ocr.metrics?.inputTokens ?? null,
        outputTokens: ocr.metrics?.outputTokens ?? null,
        estimatedCostEur: ocr.metrics?.estimatedCostEur ?? null,
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
