const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const MODEL = Deno.env.get("OPENAI_SCAN_MODEL") || "gpt-4o-mini"
const MAX_BASE64_LENGTH = 7_500_000

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  })
}

function imageSizeInfo(imageBase64 = "") {
  const padding = imageBase64.endsWith("==") ? 2 : imageBase64.endsWith("=") ? 1 : 0
  return {
    base64Length: imageBase64.length,
    estimatedBytes: Math.max(0, Math.floor((imageBase64.length * 3) / 4) - padding),
    maxBase64Length: MAX_BASE64_LENGTH,
  }
}

function diagnosticErrorResponse({
  errorCode,
  errorMessage,
  status = 500,
  openaiStatus = null,
  providerMessage = "",
  stage = "",
  extra = {},
}: {
  errorCode: string
  errorMessage: string
  status?: number
  openaiStatus?: number | null
  providerMessage?: string
  stage?: string
  extra?: Record<string, unknown>
}) {
  const body = {
    ok: false,
    code: errorCode,
    error: errorMessage,
    error_code: errorCode,
    error_message: errorMessage,
    openai_status: openaiStatus,
    provider_message: providerMessage || errorMessage,
    model: MODEL,
    stage,
    ...extra,
  }

  console.error("[scan-receipt-ocr] diagnostic_error", {
    http_status: status,
    ...body,
  })

  return jsonResponse(body, status)
}

function numericTotal(value: unknown) {
  const match = String(value ?? "").match(/(\d+(?:\s?\d{3})*[,.]\d{2}|\d+(?:\.\d+)?)/)
  return match ? Number(match[1].replace(/\s/g, "").replace(",", ".")) || 0 : 0
}

function normalizeText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

function isIgnoredItemLine(value = "") {
  const clean = normalizeText(value).replace(/[^a-z0-9% ]/g, " ").replace(/\s+/g, " ").trim()
  if (!clean) return true
  if (clean.includes("total") || clean.includes("carte bleue") || clean === "cb") return true
  if (clean.includes("tva") || clean.includes("ventilation") || clean.includes("merci")) return true
  if (clean.includes("bienvenue") || clean.includes("operation") || clean.includes("vente") || clean.includes("duplicata")) return true
  if (clean.includes("jeudi") || clean.includes("remise") || clean.includes("prix promotion")) return true
  if (/^(boissons|epicerie|epicerie salee|epicerie sucree|surgeles|charcuterie|cremerie|hygiene|higiene|fleurs|fruits legumes|ppi)\b/.test(clean)) return true
  return false
}

function cleanItemName(value = "") {
  return String(value || "")
    .replace(/^\(?\d+\)?\d{4,}\s*/, "")
    .replace(/^\*+/, "")
    .replace(/^\d+\s*(kg|g|gr|l|cl|ml)\s+/i, "")
    .replace(/\b\d+(?:\s?\d{3})*[,.]\d{2}\s*(eur|euro|euros)?\b/gi, "")
    .replace(/\bprix promotion\b/gi, "")
    .replace(/\beur\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
}

function lastMoney(value = "") {
  const matches = Array.from(String(value || "").matchAll(/(-?\d+[,.]\d{2})\s*(eur|euro|euros)?/gi))
  if (!matches.length) return 0
  return Number(matches[matches.length - 1][1].replace(",", ".")) || 0
}

function extractTotalFromText(text = "") {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const totalLine = [...lines].reverse().find((line) => {
    const clean = normalizeText(line)
    return clean.includes("total") || clean.includes("carte bleue") || /\bcb\b/.test(clean)
  })

  return totalLine ? lastMoney(totalLine) : 0
}

function makeFallbackItem({
  name,
  rawLine,
  price,
  quantity = 1,
  unit = "piece",
  unitPrice = null,
  promotion = false,
}: {
  name: string
  rawLine: string
  price: number
  quantity?: number
  unit?: string
  unitPrice?: number | null
  promotion?: boolean
}) {
  const finalName = cleanItemName(name)
  if (!finalName || price <= 0 || isIgnoredItemLine(finalName)) return null
  const rawOcrName = isIgnoredItemLine(rawLine) ? finalName : String(rawLine || finalName).trim()

  return {
    name: finalName,
    ocr_name: rawOcrName,
    corrected_name: finalName,
    quantity,
    unit,
    price,
    unit_price: unitPrice || price,
    total_price: price,
    category: "alimentaire",
    promotion,
    confidence_score: 62,
    status: "a_verifier",
    item_status: "a_verifier",
    line_type: "product",
    source: "ocr_fallback",
  }
}

function parseFallbackItemsFromText(text = "") {
  const lines = String(text || "")
    .replace(/\\n/g, "\n")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const items: Record<string, unknown>[] = []
  let pendingName = ""

  for (const line of lines) {
    const price = lastMoney(line)
    const clean = normalizeText(line)
    const hasNegativePrice = /-\s*\d+[,.]\d{2}/.test(line)
    const promotionLine = clean.includes("prix promotion") || clean.includes("promotion")

    if (price > 0 && !hasNegativePrice) {
      const withoutPrices = line.replace(/-?\d+[,.]\d{2}\s*(eur|euro|euros)?/gi, " ")
      const candidate = cleanItemName(withoutPrices)
      const quantityMatch = line.match(/\b(\d+)\s*x\s*(\d+[,.]\d{2})/i)
      const weightMatch = line.match(/(\d+[,.]\d{1,3})\s*kg\s*x\s*(\d+[,.]\d{2})/i)
      const quantityOnlyText = normalizeText(candidate).replace(/[^a-z0-9x,. ]/g, "").trim()
      const quantityOnly = Boolean(quantityOnlyText) && /^[0-9x,. ]+$/.test(quantityOnlyText) && quantityOnlyText.includes("x")
      const name = (weightMatch || promotionLine || quantityOnly || candidate.length < 3) && pendingName ? pendingName : candidate
      const item = makeFallbackItem({
        name,
        rawLine: line,
        price,
        quantity: weightMatch ? Number(weightMatch[1].replace(",", ".")) || 1 : quantityMatch ? Number(quantityMatch[1]) || 1 : 1,
        unit: weightMatch ? "kg" : "piece",
        unitPrice: weightMatch ? Number(weightMatch[2].replace(",", ".")) || null : quantityMatch ? Number(quantityMatch[2].replace(",", ".")) || null : price,
        promotion: promotionLine,
      })

      if (item) items.push(item)
      pendingName = ""
      continue
    }

    if (isIgnoredItemLine(line)) continue

    const candidate = cleanItemName(line)
    if (candidate.length >= 3 && /[a-zA-Z]/.test(candidate)) {
      pendingName = candidate
    }
  }

  return normalizeItems(items)
}

function detectLocalMerchant(text = "") {
  const clean = normalizeText(text).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ")
  const stores = [
    { pattern: "leader price", label: "Leader Price" },
    { pattern: "leaderprice", label: "Leader Price" },
    { pattern: "leclerc", label: "Leclerc" },
    { pattern: "carrefour", label: "Carrefour" },
    { pattern: "super u", label: "Super U" },
    { pattern: "hyper u", label: "Hyper U" },
    { pattern: "lidl", label: "Lidl" },
    { pattern: "score", label: "Score" },
    { pattern: "run market", label: "Run Market" },
    { pattern: "jumbo", label: "Jumbo" },
    { pattern: "intermarche", label: "Intermarche" },
  ]
  return stores.find((store) => clean.includes(store.pattern))?.label || ""
}

function detectLocalDate(text = "") {
  const match = String(text || "").match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/)
  if (!match) return ""

  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    console.warn("[scan-receipt-ocr] invalid_ocr_date", {
      raw_date_detected: match[0],
      fallback_scan_date: new Date().toISOString().slice(0, 10),
    })
    return ""
  }

  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    console.warn("[scan-receipt-ocr] invalid_ocr_date", {
      raw_date_detected: match[0],
      fallback_scan_date: new Date().toISOString().slice(0, 10),
    })
    return ""
  }

  const normalized = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  console.info("[scan-receipt-ocr] date_normalization", {
    raw_date_detected: match[0],
    normalized_date: normalized,
    date_status: "detected",
    date_fallback_used: false,
  })
  return normalized
}

function buildFastLocalExtraction(text = "") {
  const total = extractTotalFromText(text)
  const items = parseFallbackItemsFromText(text).map((item) => ({
    ...item,
    price: numericTotal(item.price) || numericTotal(item.total_price) || numericTotal(item.unit_price),
    status: "a_verifier",
    item_status: "a_verifier",
    source: "ocr_fallback",
  }))

  return {
    store_name: detectLocalMerchant(text),
    purchase_date: detectLocalDate(text),
    total_amount: total,
    items,
  }
}

function isLikelyFoodTicket(receipt: { store_name?: string; items?: Record<string, unknown>[] }, text = "") {
  const clean = normalizeText([
    receipt.store_name || "",
    text,
    ...(receipt.items || []).flatMap((item) => [item.name, item.ocr_name, item.category]),
  ].join(" "))

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
    "boulangerie",
    "alimentaire",
  ].some((keyword) => clean.includes(keyword))
}

function pickBestItems(...lists: Record<string, unknown>[][]) {
  return lists.reduce<Record<string, unknown>[]>((best, list) => {
    return list.length > best.length ? list : best
  }, [])
}

function normalizeItems(rawItems: unknown[] = []) {
  const byName = new Map<string, Record<string, unknown>>()

  for (const raw of rawItems) {
    const item = (raw || {}) as Record<string, unknown>
    const sourceLine = String(item.ocr_name || item.name || item.corrected_name || "").trim()
    const price = numericTotal(item.total_price) || numericTotal(item.unit_price) || numericTotal(sourceLine)
    const name = cleanItemName(String(item.name || item.corrected_name || item.ocr_name || ""))
    const ocrName = String(item.ocr_name || sourceLine || name).trim()
    const finalName = cleanItemName(name || ocrName)

    const ocrLooksIgnored = isIgnoredItemLine(ocrName)
    const ocrCleanName = cleanItemName(ocrName)
    if (!finalName || !price || isIgnoredItemLine(finalName)) continue
    if (ocrLooksIgnored && normalizeText(ocrCleanName) === normalizeText(finalName)) continue

    const key = normalizeText(finalName).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim()
    if (!key) continue

    byName.set(key, {
      name: finalName,
      ocr_name: ocrName || finalName,
      corrected_name: finalName,
      quantity: Number(item.quantity || 1) || 1,
      unit: String(item.unit || "piece"),
      unit_price: numericTotal(item.unit_price) || price,
      total_price: price,
      category: String(item.category || "alimentaire"),
      confidence_score: Number(item.confidence_score || 65),
      item_status: String(item.item_status || "a_verifier"),
      line_type: "product",
      source: String(item.source || "ocr_fallback"),
    })
  }

  return Array.from(byName.values())
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    if (req.method !== "POST") {
      return diagnosticErrorResponse({
        errorCode: "SCAN_REQUEST_METHOD_INVALID",
        errorMessage: "Method not allowed.",
        status: 405,
        stage: "request_validation",
      })
    }

    const authorization = req.headers.get("authorization") || ""
    if (!authorization.toLowerCase().startsWith("bearer ")) {
      return diagnosticErrorResponse({
        errorCode: "SCAN_AUTH_MISSING",
        errorMessage: "Missing user authorization.",
        status: 401,
        stage: "request_validation",
      })
    }

    const body = await req.json().catch(() => ({}))
    const imageBase64 = String(body.imageBase64 || "")
    const mimeType = String(body.mimeType || "image/jpeg")
    const browserText = String(body.browserText || "")
    const browserItems = parseFallbackItemsFromText(browserText)
    const browserTotal = extractTotalFromText(browserText)
    const requestImageSize = imageSizeInfo(imageBase64)

    console.info("[scan-receipt-ocr] request_received", {
      model: MODEL,
      mimeType,
      image_size: requestImageSize,
      browserTextLength: browserText.length,
      browserItemsDetected: browserItems.length,
      browserTotal,
    })

    if (!imageBase64 || !mimeType.startsWith("image/")) {
      console.error("[scan-receipt-ocr] image_invalid", {
        model: MODEL,
        mimeType,
        image_size: requestImageSize,
      })

      return diagnosticErrorResponse({
        errorCode: "SCAN_IMAGE_UNREADABLE",
        errorMessage: "Missing or invalid image.",
        status: 400,
        stage: "request_validation",
        extra: { image_size: requestImageSize },
      })
    }

    if (imageBase64.length > MAX_BASE64_LENGTH) {
      console.error("[scan-receipt-ocr] image_too_large", {
        model: MODEL,
        mimeType,
        image_size: requestImageSize,
      })

      return diagnosticErrorResponse({
        errorCode: "SCAN_IMAGE_TOO_LARGE",
        errorMessage: "Image too large after compression.",
        status: 413,
        providerMessage: `Image base64 length ${imageBase64.length} exceeds max ${MAX_BASE64_LENGTH}.`,
        stage: "request_validation",
        extra: { image_size: requestImageSize },
      })
    }

    const localStartedAt = performance.now()
    const localReceipt = buildFastLocalExtraction(browserText)
    const localDurationMs = Math.round(performance.now() - localStartedAt)
    const itemsDetectedBeforeOpenAi = localReceipt.items.length
    const totalDetectedBeforeOpenAi = localReceipt.total_amount > 0
    const isFoodTicket = isLikelyFoodTicket(localReceipt, browserText)
    const expectedItemsMin = isFoodTicket ? 3 : 0
    const scanStatus = isFoodTicket && totalDetectedBeforeOpenAi && itemsDetectedBeforeOpenAi < expectedItemsMin
      ? "partial_low_items"
      : "partial"

    console.info("[scan-receipt-ocr] fast_local_extraction", {
      fast_local_extraction_used: true,
      openai_called: false,
      items_detected_before_openai: itemsDetectedBeforeOpenAi,
      total_detected_before_openai: totalDetectedBeforeOpenAi,
      expected_items_min: expectedItemsMin,
      scan_status: scanStatus,
      total_amount: localReceipt.total_amount,
      store_name: localReceipt.store_name,
      purchase_date: localReceipt.purchase_date,
      durationMs: localDurationMs,
      image_size: requestImageSize,
    })

    if (!totalDetectedBeforeOpenAi) {
      console.info("[scan-receipt-ocr] server_ocr_fallback", {
        used: false,
        reason: "no_server_ocr_engine_available",
        openai_called: false,
        browserTextLength: browserText.length,
        items_detected_before_openai: itemsDetectedBeforeOpenAi,
        total_detected_before_openai: false,
      })

      return diagnosticErrorResponse({
        errorCode: "SCAN_PARSE_FAILED",
        errorMessage: "Montant total non detecte par extraction locale.",
        status: 422,
        providerMessage: "Total absent apres OCR local/regex. OpenAI not called before acceptance.",
        stage: "server_ocr_fallback",
        extra: {
          scanStatus: "failed",
          scan_status: "failed",
          text: browserText,
          receipt: localReceipt,
          totalDetectionDurationMs: localDurationMs,
          image_size: requestImageSize,
          fast_local_extraction_used: true,
          openai_called: false,
          items_detected_before_openai: itemsDetectedBeforeOpenAi,
          total_detected_before_openai: false,
        },
      })
    }

    console.info("[scan-receipt-ocr] openai_enrichment", {
      scheduled: false,
      openai_called: false,
      reason: "ticket_acceptance_is_local_only",
      items_detected_before_openai: itemsDetectedBeforeOpenAi,
      total_detected_before_openai: true,
      expected_items_min: expectedItemsMin,
    })

    return jsonResponse({
      ok: true,
      provider: "local_fallback",
      model: MODEL,
      stage: "fast_local_extraction",
      scanStatus,
      scan_status: scanStatus,
      source: "local_fallback",
      text: browserText,
      confidence: itemsDetectedBeforeOpenAi > 0 ? 70 : 55,
      receipt: localReceipt,
      openaiDurationMs: 0,
      totalDetectionDurationMs: localDurationMs,
      inputTokens: null,
      outputTokens: null,
      estimatedCostEur: null,
      fast_local_extraction_used: true,
      openai_called: false,
      items_detected_before_openai: itemsDetectedBeforeOpenAi,
      total_detected_before_openai: true,
      expected_items_min: expectedItemsMin,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown scanner error."

    return diagnosticErrorResponse({
      errorCode: "SCAN_UNKNOWN_ERROR",
      errorMessage: message,
      status: 500,
      providerMessage: message,
      stage: "edge_function",
    })
  }
})
