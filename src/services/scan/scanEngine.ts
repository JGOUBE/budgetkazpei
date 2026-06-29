import { optimizeReceiptImage } from "./imageOptimizer"
import { getDefaultOCRProvider, type OCRProvider } from "./ocrProvider"
import { classifyReceipt } from "./receiptClassifier"
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

function getEscalationReason(parsed: any, ocr: any) {
  const reasons = []
  if (!parsed.total_amount) reasons.push("total_absent")
  if (parsed.date_status === "estimated") reasons.push("date_absente")
  if ((parsed.items || []).length < 3) reasons.push("moins_de_3_articles")
  if (Number(ocr.confidence || 0) < 65) reasons.push("ocr_faible")
  if (String(ocr.text || "").split(/\r?\n/).length > 80) reasons.push("ticket_long")
  if (Number(parsed.confidence_score || 0) < 65) reasons.push("confiance_faible")
  return reasons.join(",")
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
      parsed.store_name = structured.store_name || parsed.store_name || "Enseigne non reconnue"
      parsed.merchant_name = parsed.store_name
      parsed.merchant_confidence = structured.store_name ? 90 : parsed.merchant_confidence || 0
      const structuredDate = normalizeReceiptDate(structured.purchase_date || "")
      if (structuredDate) {
        parsed.purchase_date = structuredDate
        parsed.date_status = "detected"
      }
      parsed.total_amount = Number(structured.total_amount || parsed.total_amount || 0)
      const structuredItems = Array.isArray(structured.items) ? structured.items : []
      parsed.items = parsed.items.length
        ? mergeReceiptItems(parsed.items, [])
        : structuredItems.length
          ? mergeReceiptItems(structuredItems, [])
          : parsed.items
      parsed.ai_used = ocr.provider.includes("openai")
    }
    const classification = classifyReceipt(parsed)
    parsed.ticket_type = classification.ticket_type
    parsed.budget_category = classification.budget_category
    parsed.is_food_ticket = classification.is_food_ticket
    parsed.confidence_score = Math.max(0, Math.min(100, Math.round(Number(parsed.confidence_score || 0) || Number(ocr.confidence || 0))))
    parsed.scan_level_used = ocr.metrics?.fallbackUsed ? 2 : 1
    parsed.escalation_reason = getEscalationReason(parsed, ocr)
    parsed.scan_status = ocr.metrics?.scanStatus || ((parsed.escalation_reason && parsed.total_amount) ? "partial" : "success")

    console.info("[scanner] Date detectee", parsed.purchase_date || "")
    console.info("[scanner] Magasin detecte", parsed.store_name || "")
    console.info("[scanner] Total detecte", parsed.total_amount || 0)
    console.info("[scanner] Nombre d'articles detectes", parsed.items.length)
    console.info("[scanner] Niveau utilise", parsed.scan_level_used)
    console.info("[scanner] Raison escalation", parsed.escalation_reason || "aucune")
    console.info("[scanner] Statut scan", parsed.scan_status)
    ;(parsed as any).ocr_provider = ocr.provider
    const parsingDurationMs = Math.round(performance.now() - parsingStartedAt)
    parsed.scan_duration_ms = Math.round(performance.now() - scanStartedAt)

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
