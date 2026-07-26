export function countItemsNeedingReview(items = []) {
  return (Array.isArray(items) ? items : []).filter(item => (
    item?.needs_review === true
    || String(item?.review_status || "").toLowerCase() === "needs_review"
    || String(item?.item_status || item?.status || "").toLowerCase() === "a_verifier"
  )).length
}

export function getReceiptScanValidationView({
  isPendingSave = false,
  reviewItemsCount = 0,
  totalNeedsReview = false,
  hasDuplicateReceipt = false,
  requiresManualCorrection = false,
  requiresQuickReview = false,
  hasValidationError = false,
} = {}) {
  if (!isPendingSave) return "editor"
  if (reviewItemsCount > 0) return "editor"
  if (totalNeedsReview) return "editor"
  if (hasDuplicateReceipt || requiresManualCorrection || requiresQuickReview || hasValidationError) return "editor"
  return "preview"
}

export function buildScanPreviewSummary({
  detectedItemsCount = 0,
  reviewItemsCount = 0,
  txt = {},
} = {}) {
  const detectedLabel = typeof txt.detectedItemsCount === "function"
    ? txt.detectedItemsCount(detectedItemsCount)
    : `${detectedItemsCount} item(s)`

  if (reviewItemsCount > 0) {
    const reviewLabel = typeof txt.reviewItemsCount === "function"
      ? txt.reviewItemsCount(reviewItemsCount)
      : `${reviewItemsCount} review item(s)`
    return `${detectedLabel} — ${reviewLabel}`
  }

  return `${detectedLabel} — ${txt.noMandatoryCorrection || ""}`.trim()
}

export function buildAnalysisSteps(txt = {}) {
  return [
    ["optimizing", txt.progressOptimizing || "Optimisation"],
    ["reading", txt.progressReading || "Lecture"],
    ["store", txt.progressStore || "Magasin"],
    ["products", txt.progressProducts || "Articles"],
    ["total", txt.progressTotal || "Total"],
    ["finalizing", txt.progressFinalizing || "Finalisation"],
    ["ready", txt.ticketReady || "Pret"],
  ]
}

function normalizeAnalysisStep(step = "") {
  const raw = String(step || "").toLowerCase()
  if (raw === "done" || raw === "post_ocr") return "finalizing"
  return raw
}

export function resolveAnalysisProgressContent(progress = {}, txt = {}) {
  const step = normalizeAnalysisStep(progress.step)

  if (step === "finalizing") {
    return {
      title: txt.analysisPreparing || progress.label || "",
      subtitle: txt.finalizingTicket || txt.analysisFootnote || "",
      step,
    }
  }

  if (step === "ready") {
    return {
      title: txt.ticketReady || progress.label || "",
      subtitle: txt.loaded || txt.analysisFootnote || "",
      step,
    }
  }

  const stepLabels = Object.fromEntries(buildAnalysisSteps(txt))
  return {
    title: stepLabels[step] || progress.label || txt.scanTitle || "",
    subtitle: txt.analysisFootnote || "",
    step,
  }
}
