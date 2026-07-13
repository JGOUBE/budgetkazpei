function normalizeDisplayText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function hasUserCorrectedName(item: Record<string, unknown> = {}) {
  const correctedName = String(item.corrected_name || "").trim()
  if (!correctedName) return false

  const ocrName = String(item.ocr_name || "").trim()
  const scannerName = String(item.name || "").trim()
  const corrected = normalizeDisplayText(correctedName)
  const ocr = normalizeDisplayText(ocrName)
  const name = normalizeDisplayText(scannerName)

  if (!corrected) return false
  if (ocr && corrected !== ocr) return true
  return Boolean(name && corrected !== name)
}

export function resolveMarketDisplayName(item: Record<string, unknown> = {}) {
  const scannerName = String(item.name || item.corrected_name || item.ocr_name || "").trim()
  const correctedName = String(item.corrected_name || "").trim()
  const canonicalName = item.market_matched === true
    ? String(item.market_canonical_name || "").trim()
    : ""

  if (hasUserCorrectedName(item)) {
    return {
      label: correctedName,
      source: "user_corrected",
      marketRecognized: false,
      canonicalName,
    }
  }

  if (canonicalName) {
    return {
      label: canonicalName,
      source: "market",
      marketRecognized: true,
      canonicalName,
    }
  }

  return {
    label: scannerName,
    source: "scanner",
    marketRecognized: false,
    canonicalName: "",
  }
}
