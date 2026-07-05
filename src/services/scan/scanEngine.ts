import { optimizeReceiptImage } from "./imageOptimizer"
import { getDefaultOCRProvider, type OCRProvider } from "./ocrProvider"
import { classifyReceipt } from "./receiptClassifier"
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
    if (structured && typeof structured === "object") {
      parsed.store_name = structured.store_name || parsed.store_name || "Enseigne non reconnue"
      parsed.merchant_name = parsed.store_name
      parsed.merchant_confidence = structured.store_name ? 90 : parsed.merchant_confidence || 0
      const structuredDate = normalizeReceiptDate(structured.purchase_date || "")
      if (structuredDate) {
        parsed.purchase_date = structuredDate
        parsed.date_status = "detected"
      } else if (structured.purchase_date) {
        console.warn("[scanner] invalid_ocr_date", structured.purchase_date)
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
      const parserItems = parsed.items.length ? mergeReceiptItems(parsed.items, []) : []
      const normalizedStructuredItems = structuredItems.length ? mergeReceiptItems(structuredItems, []) : []
      parsed.items = bestItemList(
        mergeReceiptItems(normalizedStructuredItems, parserItems),
        normalizedStructuredItems,
        parserItems,
      )
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
    const rawDateDetected = String(structured?.purchase_date || parsed.purchase_date || "")
    const normalizedDate = normalizeReceiptDate(parsed.purchase_date || "")
    const dateFallbackUsed = !normalizedDate
    if (dateFallbackUsed) {
      parsed.purchase_date = null
      parsed.date_status = "needs_review"
    } else {
      parsed.purchase_date = normalizedDate
      parsed.date_status = parsed.date_status || "detected"
    }
    console.info("[scanner] date_normalization", {
      raw_date_detected: rawDateDetected || null,
      normalized_date: parsed.purchase_date,
      date_status: parsed.date_status,
      date_fallback_used: dateFallbackUsed,
      fallback_scan_date: null,
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
    const expectedItemsMin = Number(ocr.metrics?.expectedItemsMin || 0)
    ;(parsed as any).expected_items_min = expectedItemsMin || null
    ;(parsed as any).expected_items_source = ocr.metrics?.expectedItemsSource || "not_found"
    ;(parsed as any).declared_items_count = ocr.metrics?.declaredItemsCount ?? null
    ;(parsed as any).declared_items_raw_text = ocr.metrics?.declaredItemsRawText ?? ""
    ;(parsed as any).items_count_status = ocr.metrics?.itemsCountStatus || "unknown"
    ;(parsed as any).recovery_ratio = ocr.metrics?.recoveryRatio ?? null
    ;(parsed as any).recovery_ratio_status = ocr.metrics?.recoveryRatioStatus ?? null
    ;(parsed as any).split_cost_warning = ocr.metrics?.splitCostWarning ?? null
    if (expectedItemsMin && parsed.items.length < expectedItemsMin) {
      parsed.scan_status = "partial_low_items"
      parsed.escalation_reason = [parsed.escalation_reason, "articles_alimentaires_insuffisants"].filter(Boolean).join(",")
    }
    const parserDebug = ((parsed as any).parser_debug || {}) as Record<string, any>
    const budgetStatus = ocr.metrics?.budgetStatus || parserDebug.budget_status || (Number(parsed.total_amount || 0) > 0 && !(parsed as any).total_needs_review ? "reliable" : "needs_review")
    const itemsQualityStatus = ocr.metrics?.itemsQualityStatus || parserDebug.items_quality_status || (parsed.items.length >= 3 ? "trusted_enough" : "insufficient")
    const smartShoppingSafe = ocr.metrics?.smartShoppingSafe ?? parserDebug.smart_shopping_safe ?? false
    const finalScanStatus = ocr.metrics?.finalScanStatus || parserDebug.final_scan_status || parsed.scan_status
    ;(parsed as any).budget_status = budgetStatus
    ;(parsed as any).items_quality_status = itemsQualityStatus
    ;(parsed as any).smart_shopping_safe = smartShoppingSafe
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
      expected_items_source: ocr.metrics?.expectedItemsSource || "not_found",
      declared_items_count: ocr.metrics?.declaredItemsCount ?? null,
      items_count_status: ocr.metrics?.itemsCountStatus || "unknown",
      budget_status: budgetStatus,
      items_quality_status: itemsQualityStatus,
      smart_shopping_safe: smartShoppingSafe,
      scan_status: parsed.scan_status,
      provider: ocr.provider,
      items: parsed.items,
    }
    console.log("NORMALIZED_SCAN_RESULT", normalized)
    console.info("[scanner] NORMALIZED_SCAN_RESULT", normalized)
    ;(parsed as any).ocr_provider = ocr.provider
    const parsingDurationMs = Math.round(performance.now() - parsingStartedAt)
    parsed.scan_duration_ms = Math.round(performance.now() - scanStartedAt)

    emit(options.onProgress, "products", "Extraction des produits...", 66)
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
        itemsExcludedReasonsSummary: ocr.metrics?.itemsExcludedReasonsSummary ?? parserDebug.items_excluded_reasons_summary ?? null,
        sectionSubtotalsRejectedCount: ocr.metrics?.sectionSubtotalsRejectedCount ?? parserDebug.section_subtotals_rejected_count ?? null,
        sectionSubtotalsRejectedLines: ocr.metrics?.sectionSubtotalsRejectedLines ?? parserDebug.section_subtotals_rejected_lines ?? null,
        itemsKeptLines: ocr.metrics?.itemsKeptLines ?? parserDebug.items_kept_lines ?? null,
        itemsRejectedLines: ocr.metrics?.itemsRejectedLines ?? parserDebug.items_rejected_lines ?? null,
        itemQualitySummary: ocr.metrics?.itemQualitySummary ?? parserDebug.item_quality_summary ?? null,
        budgetReliable: ocr.metrics?.budgetReliable ?? parserDebug.budget_reliable ?? (budgetStatus === "reliable"),
        smartShoppingSafe,
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
