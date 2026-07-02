import {
  extractDeclaredItemsCount,
  extractReliableDateCandidates,
  extractTrustedTotal,
  isPhoneLine,
  normalizeReceiptRuleDate,
  normalizeStoreName as normalizeStoreFromRules,
  shouldRejectLineAsProduct,
} from "./receiptRules.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const MODEL = Deno.env.get("OPENAI_SCAN_MODEL") || "gpt-4o-mini"
const MAX_BASE64_LENGTH = 7_500_000
const OPENAI_TIMEOUT_MS = 15_000
const PREMIUM_PLUS_DAILY_AI_LIMIT = Number(Deno.env.get("OPENAI_SCAN_DAILY_LIMIT_PREMIUM_PLUS") || 200)
const ENABLE_SPLIT_RETRY = Deno.env.get("OPENAI_SCAN_ENABLE_SPLIT_RETRY") !== "false"
const SPLIT_RETRY_DAILY_LIMIT_PREMIUM_PLUS = Number(Deno.env.get("OPENAI_SCAN_SPLIT_RETRY_DAILY_LIMIT_PREMIUM_PLUS") || 50)

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

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = OPENAI_TIMEOUT_MS) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort("openai_timeout"), timeoutMs)

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

function numericTotal(value: unknown) {
  const match = String(value ?? "").match(/(-?\d+(?:\s?\d{3})*[,.]\d{1,2})/)
  return match ? Number(match[1].replace(/\s/g, "").replace(",", ".")) || 0 : 0
}

function normalizeText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

const GENERIC_HALLUCINATION_NAMES = new Set([
  "pomme",
  "carotte",
  "tomate",
  "salade",
  "pain",
  "produit",
  "article",
  "aliment",
  "divers",
  "courses",
  "achat",
])

function isGenericHallucinationName(value = "") {
  const clean = normalizeText(value).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim()
  return GENERIC_HALLUCINATION_NAMES.has(clean)
}

function normalizeOpenAiItems(rawItems: unknown[] = []) {
  return normalizeItems((rawItems || []).map((raw) => {
    const item = (raw || {}) as Record<string, unknown>
    const price = numericTotal(item.total_price) || numericTotal(item.price) || numericTotal(item.unit_price)
    const rawText = String(item.raw_text || item.source_line || item.ocr_name || "").trim()
    const confidence = Math.round(Number(item.confidence_score ?? item.confidence ?? 0.68) * (Number(item.confidence_score ?? item.confidence ?? 0.68) <= 1 ? 100 : 1))
    return {
      name: String(item.name || item.ocr_name || item.label || "").trim(),
      ocr_name: String(item.ocr_name || item.name || item.label || "").trim(),
      raw_text: rawText,
      source_line: rawText,
      quantity: Number(item.quantity || 1) || 1,
      unit: String(item.unit || "piece"),
      unit_price: numericTotal(item.unit_price) || price,
      total_price: price,
      category: String(item.category || "alimentaire"),
      confidence_score: rawText ? confidence : Math.min(confidence, 45),
      item_status: item.needs_review === false && rawText ? "detected" : "a_verifier",
      review_status: item.needs_review === false && rawText ? "trusted" : "needs_review",
      source: "openai_vision",
    }
  }))
}

function isIgnoredItemLine(value = "") {
  const clean = normalizeText(value).replace(/[^a-z0-9% ]/g, " ").replace(/\s+/g, " ").trim()
  if (!clean) return true
  if (shouldRejectLineAsProduct(value)) return true
  if (clean.includes("total") || clean.includes("carte bleue") || clean === "cb") return true
  if (clean.includes("tva") || clean.includes("ttc") || clean.includes("ventilation") || clean.includes("merci")) return true
  if (clean.includes("bienvenue") || clean.includes("operation") || clean.includes("vente") || clean.includes("duplicata")) return true
  if (clean.includes("caisse") || clean.includes("ticket") || clean.includes("code")) return true
  if (clean.includes("fidelite") || clean.includes("point") || clean.includes("cagnotte") || clean.includes("publicite")) return true
  if (clean.includes("jeudi") || clean.includes("remise") || clean.includes("prix promotion")) return true
  if (/^(boissons|epicerie|epicerie salee|epicerie sucree|surgeles|charcuterie|cremerie|hygiene|higiene|fleurs|fruits legumes|ppi)\b/.test(clean)) return true
  return false
}

function isPhoneOrContactLine(value = "") {
  return isPhoneLine(value)
}

function cleanItemName(value = "") {
  return String(value || "")
    .replace(/^\(\d+\)\s*\d{4,}\s*/, "")
    .replace(/^\(?\d+\)?\d{4,}\s*/, "")
    .replace(/^\(pm\)\s*/i, "")
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

function isArticleCountTotalLine(value = "") {
  return /\btotal\s+\d{1,3}\s+articles?\b/i.test(normalizeText(value))
}

function extractDueTotalFromText(text = "") {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]
    const clean = normalizeText(line)
    const isDueLine = clean.includes("reste a payer") || clean.includes("net a payer") || clean.includes("a payer")
    if (!isDueLine) continue

    const sameLineTotal = lastMoney(line)
    if (sameLineTotal) return sameLineTotal

    const nearbyTotal = lastMoney([lines[index + 1], lines[index - 1]].filter(Boolean).join(" "))
    if (nearbyTotal) return nearbyTotal
  }

  return 0
}

function extractTotalFromText(text = "") {
  const trusted = extractTrustedTotal(text)
  if (trusted.amount) return trusted.amount

  const dueTotal = extractDueTotalFromText(text)
  if (dueTotal) return dueTotal

  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]
    const clean = normalizeText(line)
    if (isArticleCountTotalLine(line)) {
      continue
    }
    const isTotalLine = clean.includes("reste a payer") || clean.includes("net a payer") || clean.includes("a payer") || clean.includes("total")
    if (!isTotalLine) continue

    const sameLineTotal = lastMoney(line)
    if (sameLineTotal) return sameLineTotal

    const nearbyTotal = lastMoney([lines[index + 1], lines[index - 1]].filter(Boolean).join(" "))
    if (nearbyTotal) return nearbyTotal
  }

  return 0
}

function isTrustedTotalLabel(line = "") {
  const clean = normalizeText(line)
  return clean.includes("reste a payer")
    || clean.includes("net a payer")
    || /\ba payer\b/.test(clean)
    || /\btotal\b/.test(clean)
}

function extractTrustedTotalEvidence(text = "", expectedAmount = 0) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]
    if (!isTrustedTotalLabel(line) || isArticleCountTotalLine(line)) continue

    const candidates = [line, [line, lines[index + 1]].filter(Boolean).join(" "), [lines[index - 1], line].filter(Boolean).join(" ")]
    for (const candidate of candidates) {
      const amount = lastMoney(candidate)
      if (!amount) continue
      if (expectedAmount > 0 && Math.abs(amount - expectedAmount) > 0.05) continue
      return {
        amount,
        rawText: candidate.trim(),
        confidence: normalizeText(candidate).includes("reste a payer") || normalizeText(candidate).includes("net a payer") ? 0.95 : 0.82,
        source: "trusted_total_line",
      }
    }
  }

  return {
    amount: 0,
    rawText: "",
    confidence: 0,
    source: "missing_or_unreliable",
  }
}

function confidence01(value: unknown) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return 0
  return number > 1 ? Math.min(1, number / 100) : Math.min(1, number)
}

function amountAppearsInLine(line = "", amount = 0) {
  if (amount <= 0) return false
  const amountFixed = amount.toFixed(2)
  const normalizedLine = String(line || "").replace(/\s/g, "")
  return normalizedLine.includes(amountFixed)
    || normalizedLine.includes(amountFixed.replace(".", ","))
}

function totalRawTextVerifiedAgainstOcr(rawText = "", amount = 0, fallbackText = "") {
  if (!rawText || amount <= 0) return false
  if (!isTrustedTotalLabel(rawText) || isArticleCountTotalLine(rawText)) return false

  const lines = String(fallbackText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  return lines.some((line, index) => {
    const candidates = [
      line,
      [line, lines[index + 1]].filter(Boolean).join(" "),
      [lines[index - 1], line].filter(Boolean).join(" "),
    ]

    return candidates.some((candidate) => {
      if (!isTrustedTotalLabel(candidate) || isArticleCountTotalLine(candidate)) return false
      const candidateAmount = lastMoney(candidate)
      return candidateAmount > 0
        && Math.abs(candidateAmount - amount) <= 0.05
        && amountAppearsInLine(candidate, amount)
    })
  })
}

function resolveTrustedTotal(parsed: Record<string, unknown>, fallbackText = "") {
  const candidateTotal = numericTotal(parsed.reste_a_payer)
    || numericTotal(parsed.rest_to_pay)
    || numericTotal(parsed.amount_due)
    || numericTotal(parsed.total_final)
    || numericTotal(parsed.net_a_payer)
    || numericTotal(parsed.total_amount)
    || numericTotal(parsed.total)
  const rawText = String(parsed.total_raw_text || parsed.total_source_line || parsed.raw_total_text || "").trim()
  const openAiConfidence = confidence01(parsed.total_confidence)
  const hasOpenAiTotalConfidence = Object.prototype.hasOwnProperty.call(parsed, "total_confidence")
  const base = {
    openaiTotalValue: candidateTotal || null,
    openaiTotalRawText: rawText,
    openaiTotalConfidence: openAiConfidence,
    totalRawTextVerifiedAgainstOcr: false,
    rejectedReason: "",
  }

  if (candidateTotal > 0) {
    if (hasOpenAiTotalConfidence && openAiConfidence < 0.7) {
      return {
        ...base,
        amount: 0,
        rawText: "",
        confidence: 0,
        source: "openai_low_confidence",
        rejectedReason: "openai_total_confidence_below_threshold",
      }
    }

    if (!rawText || !isTrustedTotalLabel(rawText) || isArticleCountTotalLine(rawText)) {
      return {
        ...base,
        amount: 0,
        rawText: "",
        confidence: 0,
        source: "openai_unverified",
        rejectedReason: "openai_total_raw_text_missing_or_invalid",
      }
    }

    const verified = totalRawTextVerifiedAgainstOcr(rawText, candidateTotal, fallbackText)
    if (!verified) {
      return {
        ...base,
        amount: 0,
        rawText: "",
        confidence: 0,
        source: "openai_unverified",
        rejectedReason: "openai_total_raw_text_not_confirmed",
      }
    }

    return {
      ...base,
      amount: candidateTotal,
      rawText,
      confidence: openAiConfidence || 0.82,
      source: "openai_total_raw_text_verified",
      totalRawTextVerifiedAgainstOcr: true,
    }
  }

  const textEvidence = extractTrustedTotalEvidence(fallbackText, candidateTotal)
  if (textEvidence.amount > 0) {
    return {
      ...base,
      ...textEvidence,
      totalRawTextVerifiedAgainstOcr: true,
      source: "local_trusted_total_line",
    }
  }

  return {
    ...base,
    amount: 0,
    rawText: rawText && isTrustedTotalLabel(rawText) ? rawText : "",
    confidence: 0,
    source: "missing_or_unreliable",
    rejectedReason: rawText ? "total_raw_text_not_confirmed" : "total_missing",
  }
}

function extractFinalTotalFromStructured(parsed: Record<string, unknown>, fallbackText = "") {
  return resolveTrustedTotal(parsed, fallbackText).amount
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
  let inVatSection = false

  for (const line of lines) {
    const price = lastMoney(line)
    const clean = normalizeText(line)
    const hasNegativePrice = /-\s*\d+[,.]\d{2}/.test(line)
    const promotionLine = clean.includes("prix promotion") || clean.includes("promotion")
    const vatSectionLine = clean.includes("ventilation") || clean.includes("code tot") || clean.includes("tva") || clean.includes("t v a") || clean.includes("ttc") || clean.includes("t t c")

    if (vatSectionLine) {
      inVatSection = true
      pendingName = ""
      continue
    }

    if (inVatSection) {
      continue
    }

    if (isIgnoredItemLine(line) && !(promotionLine && price > 0 && pendingName)) {
      pendingName = ""
      continue
    }

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

    const candidate = cleanItemName(line)
    if (candidate.length >= 3 && /[a-zA-Z]/.test(candidate)) {
      pendingName = candidate
    }
  }

  return normalizeItems(items)
}

function detectLocalMerchant(text = "") {
  const ruleStore = normalizeStoreFromRules(text)
  if (ruleStore.store_name) return ruleStore.store_name

  const clean = normalizeText(text).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ")
  const stores = [
    { pattern: "e leclerc le portail", label: "E.Leclerc Le Portail" },
    { pattern: "e lecierc le portail", label: "E.Leclerc Le Portail" },
    { pattern: "eleclerc le portail", label: "E.Leclerc Le Portail" },
    { pattern: "elecierc le portail", label: "E.Leclerc Le Portail" },
    { pattern: "leclerc le portail", label: "E.Leclerc Le Portail" },
    { pattern: "lecierc le portail", label: "E.Leclerc Le Portail" },
    { pattern: "le portail", label: "E.Leclerc Le Portail" },
    { pattern: "e leclerc", label: "E.Leclerc" },
    { pattern: "e lecierc", label: "E.Leclerc" },
    { pattern: "eleclerc", label: "E.Leclerc" },
    { pattern: "elecierc", label: "E.Leclerc" },
    { pattern: "leader price", label: "Leader Price" },
    { pattern: "leaderprice", label: "Leader Price" },
    { pattern: "leader prix", label: "Leader Price" },
    { pattern: "leader pr1ce", label: "Leader Price" },
    { pattern: "leaoer price", label: "Leader Price" },
    { pattern: "leaoer pr1ce", label: "Leader Price" },
    { pattern: "leader price saint leu", label: "Leader Price" },
    { pattern: "leader price express", label: "Leader Price" },
    { pattern: "leclerc", label: "Leclerc" },
    { pattern: "carrefour market", label: "Carrefour Market" },
    { pattern: "carrefour", label: "Carrefour" },
    { pattern: "super u", label: "Super U" },
    { pattern: "hyper u", label: "Hyper U" },
    { pattern: "u express", label: "U Express" },
    { pattern: "lidl", label: "Lidl" },
    { pattern: "jumbo score", label: "Jumbo Score" },
    { pattern: "score", label: "Score" },
    { pattern: "run market", label: "Run Market" },
    { pattern: "jumbo", label: "Jumbo" },
    { pattern: "intermarche", label: "Intermarche" },
    { pattern: "casino", label: "Casino" },
    { pattern: "spar", label: "Spar" },
    { pattern: "vival", label: "Vival" },
    { pattern: "auchan", label: "Auchan" },
  ]
  return stores.find((store) => clean.includes(store.pattern))?.label || ""
}

function isUiStoreName(value = "") {
  const clean = normalizeText(value).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim()
  if (!clean) return true
  return [
    "budgetkazpei",
    "budget kaz pei",
    "scanner ticket",
    "scanner tiket",
    "mes tickets",
    "mon bann tike",
    "analyse du ticket",
    "analyse du tiket",
    "choisissez une methode",
    "prendre une photo",
    "importer une image",
    "remplir manuellement",
  ].some((blocked) => clean.includes(blocked))
}

function cleanStoreCandidate(value = "", fallback = "") {
  const candidate = String(value || "").trim()
  if (candidate && !isUiStoreName(candidate)) return candidate
  const fallbackCandidate = String(fallback || "").trim()
  if (fallbackCandidate && !isUiStoreName(fallbackCandidate)) return fallbackCandidate
  return ""
}

function normalizeLocalMerchantName(storeName = "") {
  const ruleStore = normalizeStoreFromRules(storeName)
  if (ruleStore.normalized_store_name) return ruleStore.normalized_store_name

  const clean = normalizeText(storeName)
  if (clean.includes("leclerc")) return "e.leclerc"
  if (clean.includes("leader price")) return "leader price"
  if (clean.includes("carrefour")) return "carrefour"
  if (clean.includes("super u")) return "super u"
  if (clean.includes("hyper u")) return "hyper u"
  return clean || ""
}

function detectLocalStoreLocation(text = "", storeName = "") {
  const ruleStore = normalizeStoreFromRules([text, storeName].join(" "))
  if (ruleStore.store_location) return ruleStore.store_location

  const clean = normalizeText([text, storeName].join(" "))
  if (clean.includes("le portail")) return "Le Portail"
  if (clean.includes("saint leu") || clean.includes("saint-leu")) return "Saint-Leu"
  return ""
}

function detectLocalDate(text = "") {
  const candidate = extractReliableDateCandidates(text)[0]
  if (!candidate) return ""
  const normalized = normalizeReceiptRuleDate(candidate.normalized)
  console.info("[scan-receipt-ocr] date_normalization", {
    raw_date_detected: candidate.raw,
    normalized_date: normalized,
    date_status: "detected",
    date_fallback_used: false,
  })
  return normalized
}

function buildFastLocalExtraction(text = "") {
  const total = extractTotalFromText(text)
  const storeName = detectLocalMerchant(text)
  const expectedItemsCount = getDeclaredItemsCount(text)
  const rawItems = parseFallbackItemsFromText(text)
  const finalItems = expectedItemsCount > 0 && rawItems.length > expectedItemsCount
    ? rawItems.slice(0, expectedItemsCount)
    : rawItems
  const exactDeclaredCount = expectedItemsCount > 0 && finalItems.length === expectedItemsCount
  const items = finalItems.map((item) => ({
    ...item,
    price: numericTotal(item.price) || numericTotal(item.total_price) || numericTotal(item.unit_price),
    status: exactDeclaredCount ? "detected" : "a_verifier",
    item_status: exactDeclaredCount ? "detected" : "a_verifier",
    review_status: exactDeclaredCount ? "trusted" : "needs_review",
    confidence_score: exactDeclaredCount ? 88 : Number(item.confidence_score || 62),
    source: "ocr_fallback",
  }))

  return {
    store_name: storeName,
    normalized_store_name: normalizeLocalMerchantName(storeName),
    store_location: detectLocalStoreLocation(text, storeName),
    purchase_date: detectLocalDate(text),
    total_amount: total,
    expected_items_count: expectedItemsCount || null,
    items,
  }
}

async function runOpenAiTextFallback(text: string, imageSize: Record<string, unknown>) {
  const apiKey = Deno.env.get("OPENAI_API_KEY") || ""
  if (!apiKey) {
    console.warn("[scan-receipt-ocr] openai_text_fallback_skipped", {
      reason: "OPENAI_API_KEY_missing",
      model: MODEL,
      image_size: imageSize,
    })
    return null
  }

  const startedAt = performance.now()
  const prompt = [
    "Tu es un extracteur OCR de tickets de caisse reunionnais.",
    "Reconstruis uniquement les donnees visibles depuis le texte OCR brut.",
    "Accepte les tickets horizontaux, Leclerc, Leader Price, Carrefour, Hyper U, Super U, Lidl, Run Market, Jumbo, Score, Casino, Spar, Vival, Auchan.",
    "Retourne un JSON strict avec: merchant, date JJ/MM/AAAA ou YYYY-MM-DD, time, total, items.",
    "Chaque item doit avoir name, quantity, unit_price si visible, total_price.",
    "Ne devine pas un prix absent. Ignore remises, totaux de rayon, TVA, carte bleue.",
    "Si le ticket affiche Reste a payer, utilise ce montant comme total final.",
    "Si le ticket affiche Total 32 articles, extrais environ 32 lignes produits visibles.",
    "Texte OCR:",
    text.slice(0, 18000),
  ].join("\n")

  const response = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Tu retournes uniquement du JSON valide." },
        { role: "user", content: prompt },
      ],
    }),
  })

  const bodyText = await response.text()
  console.info("[scan-receipt-ocr] openai_text_fallback_response", {
    http_status: response.status,
    model: MODEL,
    durationMs: Math.round(performance.now() - startedAt),
    body: bodyText,
    image_size: imageSize,
  })

  if (!response.ok) {
    return {
      error: true,
      status: response.status,
      message: bodyText,
      durationMs: Math.round(performance.now() - startedAt),
    }
  }

  let json: Record<string, unknown> = {}
  let content = ""
  let parsed: Record<string, unknown>
  try {
    json = JSON.parse(bodyText)
    const choices = Array.isArray(json?.choices) ? json.choices : []
    const firstChoice = (choices[0] || {}) as Record<string, unknown>
    const message = (firstChoice.message || {}) as Record<string, unknown>
    content = String(message.content || "{}")
  } catch (parseError) {
    return {
      error: true,
      status: 200,
      code: "OPENAI_TEXT_BODY_PARSE_FAILED",
      message: errorMessage(parseError),
      rawResponseBody: bodyText,
      rawContent: content,
      durationMs: Math.round(performance.now() - startedAt),
    }
  }

  try {
    parsed = JSON.parse(content)
  } catch (parseError) {
    return {
      error: true,
      status: 200,
      code: "OPENAI_TEXT_JSON_PARSE_FAILED",
      message: errorMessage(parseError),
      rawResponseBody: bodyText,
      rawContent: content,
      durationMs: Math.round(performance.now() - startedAt),
    }
  }

  let receipt
  try {
    receipt = {
      store_name: String(parsed.merchant || parsed.store_name || detectLocalMerchant(text) || "").trim(),
      purchase_date: detectLocalDate(String(parsed.date || "")) || detectLocalDate(text),
      total_amount: extractFinalTotalFromStructured(parsed, text),
      items: normalizeOpenAiItems(Array.isArray(parsed.items) ? parsed.items : []),
    }
  } catch (mappingError) {
    return {
      error: true,
      status: 200,
      code: "OPENAI_TEXT_MAPPING_FAILED",
      message: errorMessage(mappingError),
      rawResponseBody: bodyText,
      rawContent: content,
      durationMs: Math.round(performance.now() - startedAt),
    }
  }

  return {
    receipt,
    durationMs: Math.round(performance.now() - startedAt),
    inputTokens: json?.usage?.prompt_tokens ?? null,
    outputTokens: json?.usage?.completion_tokens ?? null,
  }
}

async function runOpenAiVisionFallback({
  imageBase64,
  mimeType,
  imageSize,
  hintText = "",
}: {
  imageBase64: string
  mimeType: string
  imageSize: Record<string, unknown>
  hintText?: string
}) {
  const apiKey = Deno.env.get("OPENAI_API_KEY") || ""
  if (!apiKey) {
    console.warn("[scan-receipt-ocr] openai_vision_fallback_skipped", {
      reason: "OPENAI_API_KEY_missing",
      model: MODEL,
      image_size: imageSize,
    })
    return null
  }

  const startedAt = performance.now()
  const prompt = [
    "Tu es le moteur OCR principal de BudgetKazPei pour tickets alimentaires a La Reunion.",
    "Analyse l'image directement. Le ticket peut etre horizontal, vertical, pivote ou partiellement froisse.",
    "Retourne uniquement du JSON strict avec cette forme :",
    '{"store_name":"","normalized_store_name":"","date":"","time":"","total":0,"items":[{"name":"","raw_text":"","quantity":1,"unit_price":null,"total_price":0,"category":"alimentaire","confidence":0.0,"needs_review":false}],"confidence":0.0,"needs_review":true,"warnings":[]}',
    'Ajoute aussi au niveau racine : "total_raw_text":"", "total_confidence":0.0, "total_source":"vision_total_line".',
    "Regles critiques :",
    "- Ne jamais inventer un article absent de l'image.",
    "- Ne jamais remplacer des lignes illisibles par des produits generiques comme pomme, pain, tomate, salade, carotte.",
    '- Si une ligne article est illisible, retourne un item avec name:"Article illisible", raw_text:"...", total_price:0 ou null si le prix n est pas visible, confidence faible et needs_review:true.',
    "- Pour chaque item, raw_text doit contenir la ligne visible du ticket qui justifie l'article.",
    "- Si raw_text est vide, l'article doit etre needs_review:true.",
    "- Si le ticket affiche un nombre d'articles, par exemple Total 32 articles, ce nombre sert seulement a evaluer si l'extraction est complete.",
    "- Ne prends jamais Total X articles comme montant.",
    "- Si le ticket affiche Reste a payer, Net a payer ou A payer, utilise ce montant comme total final.",
    "- total_raw_text doit contenir la ligne visible qui justifie le total final. Sans ligne visible, laisse total a 0 et total_raw_text vide.",
    "- Si tu ne peux lire que quelques articles alors que le ticket en contient beaucoup, retourne needs_review:true et ajoute un warning.",
    "- Ne donne jamais une confidence elevee si moins de la moitie des articles sont lisibles.",
    "- Ignore TVA, sous-totaux, remises generales, carte bleue, fidelite, caisse, merci, telephone, adresse, SIRET, horaires.",
    "- La date doit etre extraite uniquement si elle est visible. Sinon retourne une chaine vide.",
    "- Les montants doivent etre des nombres decimaux avec un point.",
    "- Texte OCR local incomplet a utiliser seulement comme indice secondaire, jamais comme source principale si incoherent.",
    hintText ? `Texte OCR local incomplet a utiliser comme indice :\n${hintText.slice(0, 6000)}` : "",
  ].filter(Boolean).join("\n")

  const response = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Tu retournes uniquement du JSON valide." },
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${imageBase64}`,
                detail: "high",
              },
            },
          ],
        },
      ],
    }),
  })

  const bodyText = await response.text()
  console.info("[scan-receipt-ocr] openai_vision_fallback_response", {
    http_status: response.status,
    model: MODEL,
    durationMs: Math.round(performance.now() - startedAt),
    body: bodyText,
    image_size: imageSize,
  })

  if (!response.ok) {
    return {
      error: true,
      status: response.status,
      message: bodyText,
      durationMs: Math.round(performance.now() - startedAt),
    }
  }

  let json: Record<string, unknown> = {}
  let content = ""
  let parsed: Record<string, unknown>
  try {
    json = JSON.parse(bodyText)
    const choices = Array.isArray(json?.choices) ? json.choices : []
    const firstChoice = (choices[0] || {}) as Record<string, unknown>
    const message = (firstChoice.message || {}) as Record<string, unknown>
    content = String(message.content || "{}")
  } catch (parseError) {
    return {
      error: true,
      status: 200,
      code: "OPENAI_VISION_BODY_PARSE_FAILED",
      message: errorMessage(parseError),
      durationMs: Math.round(performance.now() - startedAt),
      prompt,
      rawContent: content,
      rawResponseBody: bodyText,
      inputMode: hintText ? "image_plus_ocr_hint" : "image_only",
      imageSize,
    }
  }

  try {
    parsed = JSON.parse(content)
  } catch (parseError) {
    return {
      error: true,
      status: 200,
      code: "OPENAI_VISION_JSON_PARSE_FAILED",
      message: errorMessage(parseError),
      durationMs: Math.round(performance.now() - startedAt),
      prompt,
      rawContent: content,
      rawResponseBody: bodyText,
      inputMode: hintText ? "image_plus_ocr_hint" : "image_only",
      imageSize,
    }
  }

  let receipt
  try {
    const dateCandidate = String(parsed.date || parsed.purchase_date || "")
    const totalEvidence = resolveTrustedTotal(parsed, hintText)
    const localStore = detectLocalMerchant(hintText)
    const storeName = cleanStoreCandidate(
      String(parsed.store_name || parsed.merchant || parsed.normalized_store_name || ""),
      localStore,
    )
    receipt = {
      store_name: storeName || "Enseigne a verifier",
      normalized_store_name: normalizeLocalMerchantName(storeName),
      store_location: detectLocalStoreLocation(hintText, storeName),
      purchase_date: detectLocalDate(dateCandidate) || detectLocalDate(hintText),
      total_amount: totalEvidence.amount,
      openai_total_value: totalEvidence.openaiTotalValue,
      openai_total_raw_text: totalEvidence.openaiTotalRawText,
      openai_total_confidence: totalEvidence.openaiTotalConfidence,
      total_raw_text_verified_against_ocr: totalEvidence.totalRawTextVerifiedAgainstOcr,
      total_rejected_reason: totalEvidence.rejectedReason,
      total_raw_text: totalEvidence.rawText,
      total_confidence: totalEvidence.confidence,
      total_needs_review: totalEvidence.amount <= 0,
      total_source: totalEvidence.source,
      items: normalizeOpenAiItems(Array.isArray(parsed.items) ? parsed.items : []),
      needs_review: Boolean(parsed.needs_review),
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
    }
  } catch (mappingError) {
    return {
      error: true,
      status: 200,
      code: "OPENAI_VISION_MAPPING_FAILED",
      message: errorMessage(mappingError),
      durationMs: Math.round(performance.now() - startedAt),
      prompt,
      rawContent: content,
      rawResponseBody: bodyText,
      inputMode: hintText ? "image_plus_ocr_hint" : "image_only",
      imageSize,
    }
  }

  return {
    receipt,
    durationMs: Math.round(performance.now() - startedAt),
    inputTokens: json?.usage?.prompt_tokens ?? null,
    outputTokens: json?.usage?.completion_tokens ?? null,
    prompt,
    rawContent: content,
    rawResponseBody: bodyText,
    inputMode: hintText ? "image_plus_ocr_hint" : "image_only",
    imageSize,
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

function countOcrLines(text = "") {
  return String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).length
}

function expectedItemsForFoodTicket(text = "", itemCount = 0) {
  const lineCount = countOcrLines(text)
  const declaredCount = getDeclaredItemsCount(text)
  if (declaredCount) return declaredCount
  if (lineCount >= 35) return 32
  if (lineCount >= 25) return 16
  if (lineCount >= 15) return Math.max(8, itemCount)
  return 3
}

function getDeclaredItemsCount(text = "") {
  return extractDeclaredItemsCount(text)
}

function pickBestItems(...lists: Record<string, unknown>[][]) {
  return lists.reduce<Record<string, unknown>[]>((best, list) => {
    return list.length > best.length ? list : best
  }, [])
}

function reliableItemsCount(items: Record<string, unknown>[] = []) {
  return items.filter((item) => {
    const status = String(item.review_status || item.item_status || "")
    return status === "trusted" || status === "detected" || status === "user_validated"
  }).length
}

function sumReceiptItems(items: Record<string, unknown>[] = []) {
  const total = (items || []).reduce((sum, item) => {
    return sum + numericTotal(item.total_price) + (numericTotal(item.total_price) ? 0 : numericTotal(item.price) || numericTotal(item.unit_price))
  }, 0)
  return Number(total.toFixed(2))
}

function buildSegmentPrompt(segment = "") {
  const commonRules = [
    "Retourne uniquement du JSON strict.",
    "Ne devine rien.",
    "Chaque article doit avoir name, raw_text, quantity, unit_price, total_price, category, confidence, needs_review.",
    "raw_text doit contenir la ligne visible qui justifie l'article.",
    "Si raw_text est vide ou si le prix est incertain, mets needs_review:true.",
    "N'invente jamais pomme, pain, tomate, salade, carotte ou autre produit generique.",
    "Ignore TVA, CB, carte bleue, fidelite, caisse, telephone, adresse, SIRET, horaires, publicite.",
    "N'accepte jamais comme magasin: BudgetKazPei, Budget Kaz Pei, Scanner ticket, Mes tickets, Analyse du ticket ou un texte d'interface.",
  ].join("\n")

  if (segment === "top") {
    return [
      "Tu analyses uniquement la zone haute d'un ticket de caisse.",
      "Objectif: magasin, magasin normalise, localisation, date, heure et premieres lignes articles seulement si visibles.",
      '{"segment":"top","store_name":"","normalized_store_name":"","store_location":"","date":"","time":"","items":[],"warnings":[]}',
      commonRules,
      "Ne cherche pas le total final dans cette zone sauf s'il est clairement visible.",
    ].join("\n")
  }

  if (segment === "bottom") {
    return [
      "Tu analyses uniquement la zone basse d'un ticket de caisse.",
      "Objectif: derniers articles, nombre d'articles, total final fiable, reste a payer, net a payer, paiement.",
      '{"segment":"bottom","items":[],"printed_items_count":null,"total":null,"total_raw_text":"","total_confidence":0,"total_source":"","warnings":[]}',
      commonRules,
      "Le total final doit etre extrait uniquement si une ligne claire est visible.",
      "Priorite total: RESTE A PAYER, RESTE A PAYER, NET A PAYER, NET A PAYER, A PAYER, A PAYER, TOTAL.",
      "Ne jamais utiliser Total X articles comme montant.",
      "Ne jamais utiliser CB ou carte bleue comme preuve de total.",
      'Si la ligne total n est pas claire: total:null, total_confidence:0, total_source:"missing_or_unreliable".',
    ].join("\n")
  }

  return [
    "Tu analyses uniquement la zone centrale d'un ticket de caisse.",
    "Cette zone contient principalement des articles.",
    '{"segment":"middle","items":[],"warnings":[]}',
    commonRules,
    "Extrais les lignes articles visibles, meme imparfaites.",
  ].join("\n")
}

function resolveSegmentTotal(parsed: Record<string, unknown>) {
  const amount = numericTotal(parsed.total) || numericTotal(parsed.total_amount)
  const rawText = String(parsed.total_raw_text || parsed.total_source_line || "").trim()
  const confidence = confidence01(parsed.total_confidence)

  if (amount > 0 && rawText && isTrustedTotalLabel(rawText) && !isArticleCountTotalLine(rawText) && confidence >= 0.7) {
    return {
      amount,
      rawText,
      confidence,
      source: "split_bottom_total_line",
    }
  }

  return {
    amount: 0,
    rawText,
    confidence,
    source: "missing_or_unreliable",
  }
}

function segmentOcrHint(text = "", segment = "") {
  const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (lines.length === 0) return ""
  const maxLines = 18
  if (segment === "top") return lines.slice(0, maxLines).join("\n").slice(0, 1200)
  if (segment === "bottom") return lines.slice(-maxLines).join("\n").slice(0, 1200)
  const start = Math.max(0, Math.floor(lines.length / 2) - Math.floor(maxLines / 2))
  return lines.slice(start, start + maxLines).join("\n").slice(0, 1200)
}

async function runOpenAiVisionSegment({
  segment,
  imageBase64,
  mimeType,
  imageSize,
  hintText = "",
}: {
  segment: string
  imageBase64: string
  mimeType: string
  imageSize: Record<string, unknown>
  hintText?: string
}) {
  const apiKey = Deno.env.get("OPENAI_API_KEY") || ""
  if (!apiKey) return null

  const startedAt = performance.now()
  const prompt = [
    buildSegmentPrompt(segment),
    hintText ? `Indice OCR local limite a cette zone, secondaire:\n${hintText.slice(0, 1200)}` : "",
  ].filter(Boolean).join("\n")

  const response = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Tu retournes uniquement du JSON valide." },
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${imageBase64}`,
                detail: "high",
              },
            },
          ],
        },
      ],
    }),
  })

  const bodyText = await response.text()
  console.info("[scan-receipt-ocr] openai_split_segment_response", {
    segment,
    http_status: response.status,
    model: MODEL,
    durationMs: Math.round(performance.now() - startedAt),
    body: bodyText,
    image_size: imageSize,
  })

  if (!response.ok) {
    return {
      error: true,
      segment,
      status: response.status,
      message: bodyText,
      durationMs: Math.round(performance.now() - startedAt),
    }
  }

  let json: Record<string, unknown> = {}
  let content = ""
  let parsed: Record<string, unknown> = {}
  try {
    json = JSON.parse(bodyText)
    const choices = Array.isArray(json?.choices) ? json.choices : []
    const firstChoice = (choices[0] || {}) as Record<string, unknown>
    const message = (firstChoice.message || {}) as Record<string, unknown>
    content = String(message.content || "{}")
    parsed = JSON.parse(content)
  } catch (parseError) {
    return {
      error: true,
      segment,
      status: 200,
      code: "OPENAI_SPLIT_JSON_PARSE_FAILED",
      message: errorMessage(parseError),
      rawResponseBody: bodyText,
      rawContent: content,
      durationMs: Math.round(performance.now() - startedAt),
    }
  }

  const totalEvidence = segment === "bottom" ? resolveSegmentTotal(parsed) : { amount: 0, rawText: "", confidence: 0, source: "missing_or_unreliable" }
  const items = normalizeOpenAiItems(Array.isArray(parsed.items) ? parsed.items : [])
  const storeName = cleanStoreCandidate(String(parsed.store_name || parsed.normalized_store_name || ""))
  return {
    segment,
    parsed,
    receipt: {
      store_name: storeName,
      normalized_store_name: normalizeLocalMerchantName(storeName),
      store_location: String(parsed.store_location || "").trim(),
      purchase_date: detectLocalDate(String(parsed.date || "")),
      time: String(parsed.time || ""),
      total_amount: totalEvidence.amount || null,
      total_raw_text: totalEvidence.rawText,
      total_confidence: totalEvidence.confidence,
      total_source: totalEvidence.source,
      total_needs_review: totalEvidence.amount <= 0,
      items,
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String) : [],
    },
    durationMs: Math.round(performance.now() - startedAt),
    inputTokens: json?.usage?.prompt_tokens ?? null,
    outputTokens: json?.usage?.completion_tokens ?? null,
    prompt,
    rawContent: content,
    rawResponseBody: bodyText,
    imageSize,
    rawItemsCount: Array.isArray(parsed.items) ? parsed.items.length : 0,
    reliableItemsCount: reliableItemsCount(items),
  }
}

function itemDedupKey(item: Record<string, unknown>) {
  return normalizeText(String(item.raw_text || item.source_line || item.name || ""))
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function mergeSplitReceiptResults(
  splitResults: Record<string, unknown>[],
  baseReceipt: Record<string, unknown> & { items?: Record<string, unknown>[]; warnings?: unknown[] },
  expectedItemsMin: number,
) {
  const validResults = splitResults.filter((result) => result && !("error" in result))
  const receipts = validResults.map((result) => (result.receipt || {}) as Record<string, unknown> & { items?: Record<string, unknown>[]; warnings?: unknown[] })
  const warnings = [
    ...(Array.isArray(baseReceipt.warnings) ? baseReceipt.warnings.map(String) : []),
    ...receipts.flatMap((receipt) => Array.isArray(receipt.warnings) ? receipt.warnings.map(String) : []),
  ]
  const byKey = new Map<string, Record<string, unknown>>()

  for (const item of receipts.flatMap((receipt) => Array.isArray(receipt.items) ? receipt.items : [])) {
    const key = itemDedupKey(item)
    if (!key) continue
    const current = byKey.get(key)
    if (!current || Number(item.confidence_score || 0) > Number(current.confidence_score || 0) || String(item.raw_text || "").length > String(current.raw_text || "").length) {
      byKey.set(key, item)
    }
  }

  const items = Array.from(byKey.values())
  const bottomReceipt = receipts.find((receipt) => Number(receipt.total_amount || 0) > 0 && String(receipt.total_source || "").includes("split_bottom"))
  const totalAmount = Number(bottomReceipt?.total_amount || 0)
  const rawItemsCount = items.length
  const reliableCount = reliableItemsCount(items)
  const improved = rawItemsCount > (Array.isArray(baseReceipt.items) ? baseReceipt.items.length : 0)
  const enoughItems = expectedItemsMin > 0 ? reliableCount >= Math.ceil(expectedItemsMin * 0.6) : reliableCount >= 3
  const scanStatus = totalAmount > 0 && enoughItems ? "usable_review" : (improved ? "usable_review" : "manual_review_required")
  const baseStore = cleanStoreCandidate(String(baseReceipt.store_name || ""))
  const splitStore = cleanStoreCandidate(String(receipts.find((receipt) => receipt.store_name)?.store_name || ""))
  const finalStore = baseStore || splitStore || "Enseigne a verifier"
  const finalNormalizedStore = normalizeLocalMerchantName(finalStore)
    || cleanStoreCandidate(String(baseReceipt.normalized_store_name || ""))
    || normalizeLocalMerchantName(splitStore)
  const finalStoreLocation = String(baseReceipt.store_location || "")
    || detectLocalStoreLocation("", finalStore)
    || String(receipts.find((receipt) => receipt.store_location)?.store_location || "")

  return {
    receipt: {
      ...baseReceipt,
      store_name: finalStore,
      normalized_store_name: finalNormalizedStore,
      store_location: finalStoreLocation,
      purchase_date: String(receipts.find((receipt) => receipt.purchase_date)?.purchase_date || baseReceipt.purchase_date || ""),
      total_amount: totalAmount || null,
      total_raw_text: totalAmount ? String(bottomReceipt?.total_raw_text || "") : "",
      total_confidence: totalAmount ? Number(bottomReceipt?.total_confidence || 0) : 0,
      total_needs_review: totalAmount <= 0,
      total_source: totalAmount ? "split_bottom_total_line" : "missing_or_unreliable",
      total_rejected_reason: totalAmount ? "" : "split_total_missing_or_unreliable",
      total_raw_text_verified_against_ocr: totalAmount > 0,
      estimated_items_sum: totalAmount ? null : sumReceiptItems(items),
      items,
      warnings: totalAmount ? warnings : [...warnings, "Total non lu avec certitude. Verification manuelle necessaire."],
      needs_review: scanStatus !== "trusted",
    },
    scanStatus,
    rawItemsCount,
    reliableItemsCount: reliableCount,
    splitTotalValue: totalAmount || null,
    splitTotalRawText: totalAmount ? String(bottomReceipt?.total_raw_text || "") : "",
    splitTotalConfidence: totalAmount ? Number(bottomReceipt?.total_confidence || 0) : 0,
    improved,
  }
}

function shouldRunSplitRetry({
  isPremiumPlus,
  scanStatus,
  totalNeedsReview,
  expectedItemsMin,
  reliableItemsDetected,
  confidence,
  imageSize,
}: {
  isPremiumPlus: boolean
  scanStatus: string
  totalNeedsReview: boolean
  expectedItemsMin: number
  reliableItemsDetected: number
  confidence: number
  imageSize: Record<string, unknown>
}) {
  if (!ENABLE_SPLIT_RETRY || !isPremiumPlus) return false
  if (["partial_low_items", "partial_unreliable", "manual_review_required", "low_confidence", "needs_review"].includes(scanStatus)) return true
  if (totalNeedsReview) return true
  if (expectedItemsMin >= 15 && reliableItemsDetected < expectedItemsMin * 0.6) return true
  if (reliableItemsDetected === 0) return true
  if (confidence < 60) return true
  const height = Number(imageSize.optimized_image_height || imageSize.height || 0)
  const width = Number(imageSize.optimized_image_width || imageSize.width || 0)
  return height > 1800 || (height > 0 && width > 0 && height / width > 2.8)
}

function splitRetrySkippedReason({
  isPremiumPlus,
  segmentsCount,
  scanAlreadyTrusted = false,
  technicalError = "",
}: {
  isPremiumPlus: boolean
  segmentsCount: number
  scanAlreadyTrusted?: boolean
  technicalError?: string
}) {
  if (!ENABLE_SPLIT_RETRY) return "split_disabled"
  if (!isPremiumPlus) return "not_premium_plus"
  if (segmentsCount < 3) return "segments_missing"
  if (scanAlreadyTrusted) return "scan_already_trusted"
  if (technicalError) return "technical_error"
  return ""
}

async function runSplitRetry({
  imageSegments,
  browserText,
  baseReceipt,
  expectedItemsMin,
}: {
  imageSegments: Record<string, unknown>[]
  browserText: string
  baseReceipt: Record<string, unknown> & { items?: Record<string, unknown>[]; warnings?: unknown[] }
  expectedItemsMin: number
}) {
  const usableSegments = (Array.isArray(imageSegments) ? imageSegments : [])
    .filter((segment) => segment?.imageBase64 && segment?.mimeType && segment?.segment)
    .slice(0, 3)

  if (usableSegments.length < 3) {
    return {
      error: true,
      message: "split_segments_missing",
      splitResults: [],
    }
  }

  const splitResults = []
  for (const segment of usableSegments) {
    const result = await runOpenAiVisionSegment({
      segment: String(segment.segment),
      imageBase64: String(segment.imageBase64),
      mimeType: String(segment.mimeType || "image/jpeg"),
      imageSize: {
        width: segment.width ?? null,
        height: segment.height ?? null,
        yStartPercent: segment.yStartPercent ?? null,
        yEndPercent: segment.yEndPercent ?? null,
        overlapPercent: segment.overlapPercent ?? null,
      },
      hintText: segmentOcrHint(browserText, String(segment.segment)),
    })
    if (result) splitResults.push(result as Record<string, unknown>)
  }

  const merged = mergeSplitReceiptResults(splitResults, baseReceipt, expectedItemsMin)
  return {
    error: false,
    splitResults,
    merged,
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "unknown_error")
}

function manualReviewResponse({
  stage,
  providerMessage,
  browserText,
  localReceipt,
  requestImageSize,
  localDurationMs,
  itemsDetectedBeforeOpenAi,
  totalDetectedBeforeOpenAi,
  expectedItemsMin,
  diagnostics = {},
  openaiCalled = true,
  visionUsed = true,
  textAiUsed = false,
  status = "manual_review_required",
}: {
  stage: string
  providerMessage: string
  browserText: string
  localReceipt: Record<string, unknown> & { items?: Record<string, unknown>[]; warnings?: unknown[] }
  requestImageSize: Record<string, unknown>
  localDurationMs: number
  itemsDetectedBeforeOpenAi: number
  totalDetectedBeforeOpenAi: boolean
  expectedItemsMin: number
  diagnostics?: Record<string, unknown>
  openaiCalled?: boolean
  visionUsed?: boolean
  textAiUsed?: boolean
  status?: string
}) {
  const localItems = Array.isArray(localReceipt.items) ? localReceipt.items : []
  const warnings = [
    "Analyse partielle, correction manuelle necessaire.",
    "Total non lu avec certitude. Verification manuelle necessaire.",
    providerMessage,
    ...(Array.isArray(localReceipt.warnings) ? localReceipt.warnings.map(String) : []),
  ].filter(Boolean)

  const reviewItems = localItems.map((item) => ({
    ...item,
    item_status: "a_verifier",
    review_status: "needs_review",
    needs_review: true,
    confidence_score: Math.min(Number(item.confidence_score || 45), 45),
  }))

  const receipt = {
    store_name: String(localReceipt.store_name || ""),
    normalized_store_name: String(localReceipt.normalized_store_name || localReceipt.store_name || ""),
    store_location: String(localReceipt.store_location || ""),
    purchase_date: null,
    date_status: "estimated",
    total_amount: null,
    total_status: "missing_or_unreliable",
    total_raw_text: "",
    total_confidence: 0,
    total_needs_review: true,
    total_source: "missing_or_unreliable",
    total_rejected_reason: providerMessage || "manual_review_required",
    total_raw_text_verified_against_ocr: false,
    openai_total_value: null,
    openai_total_raw_text: "",
    openai_total_confidence: 0,
    total_estimated_from_items: false,
    estimated_items_sum: reviewItems.length ? sumReceiptItems(reviewItems) : null,
    items: reviewItems,
    needs_review: true,
    warnings,
  }

  console.warn("[scan-receipt-ocr] manual_review_response", {
    stage,
    provider_message: providerMessage,
    scan_status: status,
    image_size: requestImageSize,
    diagnostics,
  })

  return jsonResponse({
    ok: true,
    pipeline_version: "scanner_v2_ai_first",
    provider: "manual_review_required",
    model: MODEL,
    stage,
    scan_strategy_used: String(diagnostics.scan_strategy_used || "manual_review_guard"),
    scanStatus: status,
    scan_status: status,
    source: "manual_review_required",
    text: browserText,
    confidence: 25,
    receipt,
    total_needs_review: true,
    total_source: "missing_or_unreliable",
    total_confidence: 0,
    total_raw_text: "",
    total_estimated_from_items: false,
    warnings,
    diagnostics,
    openaiDurationMs: 0,
    totalDetectionDurationMs: localDurationMs,
    inputTokens: null,
    outputTokens: null,
    estimatedCostEur: null,
    fast_local_extraction_used: true,
    openai_called: openaiCalled,
    text_ai_used: textAiUsed,
    vision_used: visionUsed,
    items_detected_before_openai: itemsDetectedBeforeOpenAi,
    total_detected_before_openai: totalDetectedBeforeOpenAi,
    expected_items_min: expectedItemsMin,
    premium_plus_daily_ai_limit: PREMIUM_PLUS_DAILY_AI_LIMIT,
    split_retry_eligible: Boolean(diagnostics.split_retry_eligible),
    split_retry_used: Boolean(diagnostics.split_retry_used),
    split_retry_skipped_reason: String(diagnostics.split_retry_skipped_reason || ""),
    split_segments_count: Number(diagnostics.split_segments_count || 0),
    split_segments_results: Array.isArray(diagnostics.split_segments_results) ? diagnostics.split_segments_results : [],
    primary_stage: String(diagnostics.primary_stage || stage),
    primary_error: diagnostics.primary_error || diagnostics.error_message || "",
    fallback_stage: String(diagnostics.fallback_stage || "manual_review_required"),
    premium_plus_detected: Boolean(diagnostics.premium_plus_detected),
    segments_received_by_edge_function: Number(diagnostics.segments_received_by_edge_function || 0),
  })
}

function dateEvidenceVariants(value = "") {
  const raw = String(value || "").trim()
  const variants = new Set<string>()
  if (!raw) return variants
  variants.add(normalizeText(raw))

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) {
    variants.add(normalizeText(`${iso[3]}/${iso[2]}/${iso[1]}`))
    variants.add(normalizeText(`${iso[3]}-${iso[2]}-${iso[1]}`))
    variants.add(normalizeText(`${iso[3]}.${iso[2]}.${iso[1]}`))
  }

  return variants
}

function dateAppearsInEvidence(value = "", hintText = "", items: Record<string, unknown>[] = []) {
  const variants = dateEvidenceVariants(value)
  if (!variants.size) return false
  const evidence = normalizeText([
    hintText,
    ...items.map((item) => `${item.raw_text || ""} ${item.source_line || ""}`),
  ].join("\n"))
  return Array.from(variants).some((variant) => variant && evidence.includes(variant))
}

function applyVisionServerValidation({
  receipt,
  hintText,
  expectedItemsMin,
}: {
  receipt: Record<string, unknown> & { items?: Record<string, unknown>[]; warnings?: unknown[] }
  hintText: string
  expectedItemsMin: number
}) {
  const originalItems = Array.isArray(receipt.items) ? receipt.items : []
  const warnings = Array.isArray(receipt.warnings) ? [...receipt.warnings.map(String)] : []
  const total = Number(receipt.total_amount || 0)
  const rawItemsCount = originalItems.length
  const partialLowItems = expectedItemsMin > 0 && rawItemsCount < Math.ceil(expectedItemsMin * 0.6)
  const calculatedItemsSum = sumReceiptItems(originalItems)
  const totalDifference = total > 0 && calculatedItemsSum > 0
    ? Number(Math.abs(total - calculatedItemsSum).toFixed(2))
    : null
  let discardedHallucinatedItems = 0

  const items = originalItems.flatMap((item) => {
    const name = String(item.name || item.ocr_name || "").trim()
    const rawText = String(item.raw_text || item.source_line || "").trim()
    const genericWithoutEvidence = partialLowItems && isGenericHallucinationName(name) && !rawText
    if (genericWithoutEvidence) {
      discardedHallucinatedItems += 1
      return []
    }

    const confidence = Number(item.confidence_score || 0)
    const forcedReview = partialLowItems || !rawText || Boolean(item.needs_review)
    return [{
      ...item,
      raw_text: rawText,
      source_line: rawText,
      confidence_score: forcedReview ? Math.min(confidence || 45, 45) : confidence,
      item_status: forcedReview ? "a_verifier" : (item.item_status || "detected"),
      review_status: forcedReview ? "needs_review" : (item.review_status || "trusted"),
      needs_review: forcedReview,
    }]
  })

  if (partialLowItems) {
    warnings.push(`Ticket partiellement lu : seulement ${rawItemsCount} article(s) detecte(s) sur environ ${expectedItemsMin} attendu(s). Verification manuelle necessaire.`)
  }
  if (discardedHallucinatedItems > 0) {
    warnings.push(`${discardedHallucinatedItems} article(s) generique(s) sans preuve ont ete retires du brouillon.`)
  }

  const purchaseDate = String(receipt.purchase_date || "")
  const dateTrusted = purchaseDate ? dateAppearsInEvidence(purchaseDate, hintText, originalItems) : false
  if (purchaseDate && !dateTrusted) {
    warnings.push("Date non lue avec certitude.")
  }

  const totalRawText = String(receipt.total_raw_text || "").trim()
  const reliableItemsCount = items.filter((item) => item.item_status !== "a_verifier").length
  let totalTrusted = total > 0
    && !partialLowItems
    && totalRawText
    && isTrustedTotalLabel(totalRawText)
    && receipt.total_raw_text_verified_against_ocr === true
    && Number(receipt.total_confidence || 0) >= 0.7
  let totalRejectedReason = String(receipt.total_rejected_reason || "")
  if (partialLowItems && reliableItemsCount === 0) {
    totalTrusted = false
    totalRejectedReason = "partial_low_items_without_reliable_items"
  } else if (partialLowItems) {
    totalTrusted = false
    totalRejectedReason = "partial_low_items_sensitive_data_requires_review"
  } else if (!totalTrusted && !totalRejectedReason) {
    totalRejectedReason = "total_not_trusted_by_server"
  }

  if (!totalTrusted) {
    warnings.push("Total non lu avec certitude. Verification manuelle necessaire.")
  }

  const scanStatus = partialLowItems ? "partial_low_items" : "partial"
  return {
    receipt: {
      ...receipt,
      purchase_date: dateTrusted ? purchaseDate : "",
      date_status: dateTrusted ? "detected" : "estimated",
      total_amount: totalTrusted ? total : null,
      total_raw_text: totalTrusted ? totalRawText : "",
      total_confidence: totalTrusted
        ? (Number(receipt.openai_total_confidence || 0) > 0
            ? Math.min(Number(receipt.total_confidence || 0), Number(receipt.openai_total_confidence || 0))
            : Number(receipt.total_confidence || 0))
        : 0,
      total_needs_review: !totalTrusted,
      total_source: totalTrusted ? (receipt.total_source || "trusted_total_line") : "missing_or_unreliable",
      total_rejected_reason: totalTrusted ? "" : totalRejectedReason,
      total_raw_text_verified_against_ocr: totalTrusted,
      openai_total_value: receipt.openai_total_value ?? null,
      openai_total_raw_text: receipt.openai_total_raw_text || "",
      openai_total_confidence: receipt.openai_total_confidence ?? 0,
      items,
      needs_review: partialLowItems || Boolean(receipt.needs_review),
      warnings,
    },
    scanStatus,
    confidence: partialLowItems ? 45 : Number(receipt.confidence_score || 88),
    rawItemsCount,
    reliableItemsCount,
    calculatedItemsSum,
    totalDifference,
    discardedHallucinatedItems,
    warnings,
  }
}

function localExtractionIsHighConfidence({
  totalDetected,
  itemCount,
  expectedItemsMin,
}: {
  totalDetected: boolean
  itemCount: number
  expectedItemsMin: number
}) {
  if (!totalDetected || itemCount < 3) return false
  if (expectedItemsMin > 0) return itemCount >= Math.ceil(expectedItemsMin * 0.9)
  return itemCount >= 12
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
    if (isPhoneOrContactLine(sourceLine) || isPhoneOrContactLine(finalName)) continue
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
    const imageMeta = body.imageMeta && typeof body.imageMeta === "object" ? body.imageMeta : {}
    const imageSegments = Array.isArray(body.imageSegments) ? body.imageSegments : []
    const userPlan = String(body.userPlan || body.plan || imageMeta.user_plan || "free")
    const isPremiumPlus = userPlan === "premium_plus" || body.isPremiumPlus === true
    const browserItems = parseFallbackItemsFromText(browserText)
    const browserTotal = extractTotalFromText(browserText)
    const requestImageSize = {
      ...imageSizeInfo(imageBase64),
      ...imageMeta,
    }

    console.info("[scan-receipt-ocr] request_received", {
      model: MODEL,
      mimeType,
      image_size: requestImageSize,
      browserTextLength: browserText.length,
      browserItemsDetected: browserItems.length,
      browserTotal,
      userPlan,
      isPremiumPlus,
      splitSegmentsReceived: imageSegments.length,
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
    const expectedItemsMin = isFoodTicket ? expectedItemsForFoodTicket(browserText, itemsDetectedBeforeOpenAi) : 0
    const declaredItemsCount = Number(localReceipt.expected_items_count || 0)
    const localExactDeclaredCount = declaredItemsCount > 0 && itemsDetectedBeforeOpenAi === declaredItemsCount
    const scanStatus = totalDetectedBeforeOpenAi && localReceipt.store_name && localReceipt.purchase_date && localExactDeclaredCount
      ? "trusted"
      : isFoodTicket && totalDetectedBeforeOpenAi && itemsDetectedBeforeOpenAi < expectedItemsMin
        ? "partial_low_items"
        : "partial"

    console.info("[scan-receipt-ocr] fast_local_extraction", {
      fast_local_extraction_used: true,
      openai_called: false,
      items_detected_before_openai: itemsDetectedBeforeOpenAi,
      total_detected_before_openai: totalDetectedBeforeOpenAi,
        expected_items_min: expectedItemsMin,
        expected_items_count: declaredItemsCount || null,
        scan_status: scanStatus,
      total_amount: localReceipt.total_amount,
      store_name: localReceipt.store_name,
      purchase_date: localReceipt.purchase_date,
      durationMs: localDurationMs,
      image_size: requestImageSize,
    })

    const runPremiumPlusSplitOrNull = async ({
      primaryStage,
      primaryError = "",
      providerMessage,
      baseReceipt = localReceipt,
      primaryDurationMs = 0,
      primaryInputTokens = 0,
      primaryOutputTokens = 0,
      primaryReliableItemsDetected = 0,
      primaryRawItemsDetected = 0,
      primaryTotalDetected = false,
      primaryConfidence = 25,
    }: {
      primaryStage: string
      primaryError?: string
      providerMessage: string
      baseReceipt?: Record<string, unknown> & { items?: Record<string, unknown>[]; warnings?: unknown[] }
      primaryDurationMs?: number
      primaryInputTokens?: number
      primaryOutputTokens?: number
      primaryReliableItemsDetected?: number
      primaryRawItemsDetected?: number
      primaryTotalDetected?: boolean
      primaryConfidence?: number
    }) => {
      const splitRetryEligible = shouldRunSplitRetry({
        isPremiumPlus,
        scanStatus: "manual_review_required",
        totalNeedsReview: true,
        expectedItemsMin,
        reliableItemsDetected: primaryReliableItemsDetected,
        confidence: primaryConfidence,
        imageSize: requestImageSize,
      })
      const skippedReason = splitRetryEligible
        ? splitRetrySkippedReason({
            isPremiumPlus,
            segmentsCount: imageSegments.length,
          })
        : splitRetrySkippedReason({
            isPremiumPlus,
            segmentsCount: imageSegments.length,
            scanAlreadyTrusted: true,
          })

      if (!splitRetryEligible || skippedReason) {
        return {
          response: null,
          diagnostics: {
            scan_strategy_used: "manual_review_guard",
            split_retry_eligible: splitRetryEligible,
            split_retry_used: false,
            split_retry_skipped_reason: skippedReason || "scan_already_trusted",
            split_segments_count: imageSegments.length,
            split_segments_results: [],
            primary_stage: primaryStage,
            primary_error: primaryError,
            fallback_stage: "manual_review_required",
            premium_plus_detected: isPremiumPlus,
            segments_received_by_edge_function: imageSegments.length,
          },
        }
      }

      console.info("[scan-receipt-ocr] premium_plus_split_retry", {
        scheduled: true,
        scan_strategy_used: "mini_split_3",
        reason: primaryStage,
        expected_items_min: expectedItemsMin,
        reliable_items_detected_by_vision: primaryReliableItemsDetected,
        split_segments_count: imageSegments.length,
      })

      try {
        const splitRetry = await runSplitRetry({
          imageSegments,
          browserText,
          baseReceipt,
          expectedItemsMin,
        })

        const splitSegmentsResults = (splitRetry.splitResults || []).map((result: Record<string, unknown>) => {
          const receipt = (result.receipt || {}) as Record<string, unknown> & { items?: Record<string, unknown>[]; warnings?: unknown[] }
          const items = Array.isArray(receipt.items) ? receipt.items : []
          const imageSize = (result.imageSize || {}) as Record<string, unknown>
          const reliableCount = reliableItemsCount(items)
          return {
            segment: result.segment,
            segment_name: result.segment,
            image_width: Number(imageSize.width || 0) || null,
            image_height: Number(imageSize.height || 0) || null,
            input_tokens: result.inputTokens ?? null,
            items_count: items.length,
            raw_items_count: Number(result.rawItemsCount || items.length),
            reliable_items_count: reliableCount,
            rejected_items_count: Math.max(0, Number(result.rawItemsCount || items.length) - reliableCount),
            first_items_names: items.slice(0, 5).map((item) => String(item.name || item.ocr_name || "")).filter(Boolean),
            total_found: Number(receipt.total_amount || 0) > 0,
            error: result.error || "",
            warnings: Array.isArray(receipt.warnings) ? receipt.warnings : [],
            segment_quality_score: Math.min(100, Math.round((Number(imageSize.width || 0) * Number(imageSize.height || 0)) / 18000)),
          }
        })

        if (!splitRetry.error && splitRetry.merged) {
          const merged = splitRetry.merged
          const splitReceipt = merged.receipt

          return {
            response: jsonResponse({
              ok: true,
              pipeline_version: "scanner_premium_plus_v3",
              provider: "openai_vision_split",
              model: MODEL,
              stage: "openai_vision_split_retry",
              scan_strategy_used: "mini_split_3",
              scanStatus: merged.scanStatus,
              scan_status: merged.scanStatus,
              source: "openai_vision_split",
              text: browserText,
              confidence: merged.scanStatus === "usable_review" ? 68 : 42,
              receipt: splitReceipt,
              openaiDurationMs: Number(primaryDurationMs || 0) + (splitRetry.splitResults || []).reduce((sum: number, result: Record<string, unknown>) => sum + Number(result.durationMs || 0), 0),
              totalDetectionDurationMs: localDurationMs,
              inputTokens: Number(primaryInputTokens || 0) + (splitRetry.splitResults || []).reduce((sum: number, result: Record<string, unknown>) => sum + Number(result.inputTokens || 0), 0),
              outputTokens: Number(primaryOutputTokens || 0) + (splitRetry.splitResults || []).reduce((sum: number, result: Record<string, unknown>) => sum + Number(result.outputTokens || 0), 0),
              estimatedCostEur: null,
              fast_local_extraction_used: true,
              openai_called: true,
              text_ai_used: false,
              vision_used: true,
              scan_ai_calls_count: Number(primaryStage === "openai_vision_primary_exception" ? 0 : 1) + (splitRetry.splitResults || []).length,
              split_retry_eligible: true,
              split_retry_used: true,
              split_retry_skipped_reason: "",
              split_segments_count: (splitRetry.splitResults || []).length,
              split_segments_strategy: "vertical_3_overlap",
              split_segments_overlap_percent: 8,
              split_segments_results: splitSegmentsResults,
              rotation_applied: requestImageSize.rotationApplied ?? requestImageSize.rotation_applied ?? null,
              orientation_confidence: requestImageSize.orientation ? 85 : 45,
              deskew_applied: Array.isArray(requestImageSize.preProcessing) ? requestImageSize.preProcessing.includes("soft_deskew_orientation") : false,
              segment_quality_score: Math.min(100, Math.round((Number(requestImageSize.optimized_image_width || requestImageSize.width || 0) * Number(requestImageSize.optimized_image_height || requestImageSize.height || 0)) / 65000)),
              scan_strategy_used_detail: "primary_failed_then_mini_split_3",
              primary_stage: primaryStage,
              primary_error: primaryError,
              fallback_stage: "openai_vision_split_retry",
              premium_plus_detected: isPremiumPlus,
              segments_received_by_edge_function: imageSegments.length,
              premium_plus_daily_ai_limit: PREMIUM_PLUS_DAILY_AI_LIMIT,
              premium_plus_split_retry_daily_limit: SPLIT_RETRY_DAILY_LIMIT_PREMIUM_PLUS,
              strong_fallback_used: false,
              items_detected_before_openai: itemsDetectedBeforeOpenAi,
              total_detected_before_openai: totalDetectedBeforeOpenAi,
              items_detected_by_vision: primaryRawItemsDetected,
              raw_items_detected_by_vision: primaryRawItemsDetected,
              reliable_items_detected_by_vision: primaryReliableItemsDetected,
              raw_items_detected_by_split: Array.isArray(splitReceipt.items) ? splitReceipt.items.length : 0,
              reliable_items_detected_by_split: merged.reliableItemsCount,
              calculated_items_sum: sumReceiptItems(splitReceipt.items || []),
              total_detected_by_vision: primaryTotalDetected,
              total_estimated_from_items: false,
              total_needs_review: Boolean(splitReceipt.total_needs_review),
              split_total_value: merged.splitTotalValue,
              split_total_raw_text: merged.splitTotalRawText,
              split_total_confidence: merged.splitTotalConfidence,
              total_raw_text_verified_against_ocr: splitReceipt.total_raw_text_verified_against_ocr === true,
              total_rejected_reason: splitReceipt.total_rejected_reason || "",
              total_raw_text: splitReceipt.total_raw_text || "",
              total_confidence: splitReceipt.total_confidence || 0,
              total_source: splitReceipt.total_source || "missing_or_unreliable",
              estimated_items_sum: splitReceipt.estimated_items_sum ?? null,
              expected_items_min: expectedItemsMin,
              diagnostics: {
                split_retry_eligible: true,
                split_retry_used: true,
                split_retry_skipped_reason: "",
                split_segments_count: (splitRetry.splitResults || []).length,
                split_segments_results: splitSegmentsResults,
                rotation_applied: requestImageSize.rotationApplied ?? requestImageSize.rotation_applied ?? null,
                orientation_confidence: requestImageSize.orientation ? 85 : 45,
                deskew_applied: Array.isArray(requestImageSize.preProcessing) ? requestImageSize.preProcessing.includes("soft_deskew_orientation") : false,
                segment_quality_score: Math.min(100, Math.round((Number(requestImageSize.optimized_image_width || requestImageSize.width || 0) * Number(requestImageSize.optimized_image_height || requestImageSize.height || 0)) / 65000)),
                primary_stage: primaryStage,
                primary_error: primaryError,
                fallback_stage: "openai_vision_split_retry",
                premium_plus_detected: isPremiumPlus,
                segments_received_by_edge_function: imageSegments.length,
              },
            }),
            diagnostics: null,
          }
        }

        return {
          response: null,
          diagnostics: {
            scan_strategy_used: "mini_split_3",
            split_retry_eligible: true,
            split_retry_used: true,
            split_retry_skipped_reason: "technical_error",
            split_segments_count: (splitRetry.splitResults || []).length,
            split_segments_results: splitSegmentsResults,
            primary_stage: primaryStage,
            primary_error: primaryError,
            fallback_stage: "manual_review_required",
            premium_plus_detected: isPremiumPlus,
            segments_received_by_edge_function: imageSegments.length,
          },
        }
      } catch (splitError) {
        return {
          response: null,
          diagnostics: {
            scan_strategy_used: "mini_split_3",
            split_retry_eligible: true,
            split_retry_used: true,
            split_retry_skipped_reason: "technical_error",
            split_segments_count: imageSegments.length,
            split_segments_results: [],
            primary_stage: primaryStage,
            primary_error: primaryError,
            fallback_stage: "manual_review_required",
            premium_plus_detected: isPremiumPlus,
            segments_received_by_edge_function: imageSegments.length,
            split_error: errorMessage(splitError),
          },
        }
      }
    }

    if (localExtractionIsHighConfidence({
      totalDetected: totalDetectedBeforeOpenAi,
      itemCount: itemsDetectedBeforeOpenAi,
      expectedItemsMin,
    })) {
      console.info("[scan-receipt-ocr] openai_vision_primary", {
        scheduled: false,
        reason: "local_high_confidence_skip_openai",
        items_detected_before_openai: itemsDetectedBeforeOpenAi,
        total_detected_before_openai: totalDetectedBeforeOpenAi,
        expected_items_min: expectedItemsMin,
      })

      return jsonResponse({
        ok: true,
        pipeline_version: "scanner_v2_ai_first_cost_guard",
        provider: "local_high_confidence",
        model: MODEL,
        stage: "fast_local_extraction",
        scan_strategy_used: localExactDeclaredCount ? "local_fast" : "local_ocr_regex",
        scanStatus: scanStatus,
        scan_status: scanStatus,
        source: "local_high_confidence",
        text: browserText,
        confidence: 88,
        receipt: localReceipt,
        openaiDurationMs: 0,
        totalDetectionDurationMs: localDurationMs,
        inputTokens: null,
        outputTokens: null,
        estimatedCostEur: null,
        fast_local_extraction_used: true,
        openai_called: false,
        text_ai_used: false,
        vision_used: false,
        scan_ai_calls_count: 0,
        split_retry_used: false,
        items_detected_before_openai: itemsDetectedBeforeOpenAi,
        total_detected_before_openai: totalDetectedBeforeOpenAi,
        expected_items_min: expectedItemsMin,
        expected_items_count: declaredItemsCount || null,
        premium_plus_daily_ai_limit: PREMIUM_PLUS_DAILY_AI_LIMIT,
      })
    }

    console.info("[scan-receipt-ocr] openai_vision_primary", {
      scheduled: true,
      reason: "ai_first_food_receipt_pipeline",
      image_size: requestImageSize,
      browserTextLength: browserText.length,
      local_items_detected: itemsDetectedBeforeOpenAi,
      local_total_detected: totalDetectedBeforeOpenAi,
    })

    try {
      const visionPrimary = await runOpenAiVisionFallback({
        imageBase64,
        mimeType,
        imageSize: requestImageSize,
        hintText: browserText,
      })

      if (visionPrimary && !("error" in visionPrimary)) {
        let visionExpectedMinBeforeMerge = 0
        let visionValidation
        try {
          visionExpectedMinBeforeMerge = isLikelyFoodTicket(visionPrimary.receipt, browserText)
            ? expectedItemsForFoodTicket(browserText, Array.isArray(visionPrimary.receipt.items) ? visionPrimary.receipt.items.length : 0)
            : 0
          visionValidation = applyVisionServerValidation({
            receipt: visionPrimary.receipt,
            hintText: browserText,
            expectedItemsMin: visionExpectedMinBeforeMerge,
          })
        } catch (validationError) {
          const splitAttempt = await runPremiumPlusSplitOrNull({
            primaryStage: "openai_vision_validation",
            primaryError: errorMessage(validationError),
            providerMessage: `Validation serveur du scan impossible: ${errorMessage(validationError)}`,
            baseReceipt: {
              ...localReceipt,
              ...visionPrimary.receipt,
              store_name: String(visionPrimary.receipt?.store_name || localReceipt.store_name || ""),
              normalized_store_name: String(visionPrimary.receipt?.normalized_store_name || localReceipt.normalized_store_name || localReceipt.store_name || ""),
              store_location: String(visionPrimary.receipt?.store_location || localReceipt.store_location || ""),
            },
            primaryDurationMs: Number(visionPrimary.durationMs || 0),
            primaryInputTokens: Number(visionPrimary.inputTokens || 0),
            primaryOutputTokens: Number(visionPrimary.outputTokens || 0),
            primaryReliableItemsDetected: 0,
            primaryRawItemsDetected: Array.isArray(visionPrimary.receipt?.items) ? visionPrimary.receipt.items.length : 0,
            primaryTotalDetected: Number(visionPrimary.receipt?.total_amount || 0) > 0,
            primaryConfidence: 25,
          })
          if (splitAttempt.response) return splitAttempt.response
          return manualReviewResponse({
            stage: "openai_vision_validation",
            providerMessage: `Validation serveur du scan impossible: ${errorMessage(validationError)}`,
            browserText,
            localReceipt,
            requestImageSize,
            localDurationMs,
            itemsDetectedBeforeOpenAi,
            totalDetectedBeforeOpenAi,
            expectedItemsMin,
            diagnostics: {
              error_code: "VISION_VALIDATION_FAILED",
              error_message: errorMessage(validationError),
              openai_prompt: visionPrimary.prompt,
              openai_raw_content: visionPrimary.rawContent,
              openai_raw_response_body: visionPrimary.rawResponseBody,
              ...(splitAttempt.diagnostics || {}),
            },
          })
        }
        const validatedVisionReceipt = visionValidation.receipt
        const mergedItems = pickBestItems(validatedVisionReceipt.items || [], localReceipt.items)
          .map((item) => visionValidation.scanStatus === "partial_low_items"
            ? {
                ...item,
                item_status: "a_verifier",
                review_status: "needs_review",
                needs_review: true,
                confidence_score: Math.min(Number(item.confidence_score || 45), 45),
              }
            : item)
        const visionTotal = Number(validatedVisionReceipt.total_amount || 0)
        const canUseEstimatedTotal = visionValidation.scanStatus !== "partial_low_items" && visionTotal <= 0 && mergedItems.length >= 3
        const provisionalTotal = visionTotal || (canUseEstimatedTotal ? sumReceiptItems(mergedItems) : 0)
        const visionReceipt = {
          ...localReceipt,
          ...validatedVisionReceipt,
          store_name: String(validatedVisionReceipt.store_name || localReceipt.store_name || ""),
          purchase_date: String(validatedVisionReceipt.purchase_date || localReceipt.purchase_date || ""),
          total_amount: visionTotal || null,
          total_status: visionTotal ? "detected" : "missing_or_unreliable",
          total_needs_review: !visionTotal,
          total_source: visionTotal ? validatedVisionReceipt.total_source : "missing_or_unreliable",
          total_raw_text: visionTotal ? validatedVisionReceipt.total_raw_text : "",
          total_confidence: visionTotal ? validatedVisionReceipt.total_confidence : 0,
          estimated_items_sum: !visionTotal ? sumReceiptItems(mergedItems) : null,
          items: mergedItems,
          warnings: visionValidation.warnings,
        }
        const visionItemsCount = mergedItems.length
        const visionFoodTicket = isLikelyFoodTicket(visionReceipt, browserText)
        const visionExpectedMin = visionFoodTicket ? expectedItemsForFoodTicket(browserText, visionItemsCount) : 0
        const needsReview = !visionTotal
          || Boolean(visionReceipt.needs_review)
          || (visionExpectedMin > 0 && visionItemsCount < Math.ceil(visionExpectedMin * 0.6))
        const visionScanStatus = visionValidation.scanStatus === "partial_low_items" || needsReview ? "partial_low_items" : "partial"
        const shouldSplit = shouldRunSplitRetry({
          isPremiumPlus,
          scanStatus: visionScanStatus,
          totalNeedsReview: !visionTotal,
          expectedItemsMin: visionExpectedMin,
          reliableItemsDetected: visionValidation.reliableItemsCount,
          confidence: visionScanStatus === "partial_low_items" ? 45 : 88,
          imageSize: requestImageSize,
        })

        if (shouldSplit) {
          console.info("[scan-receipt-ocr] premium_plus_split_retry", {
            scheduled: true,
            scan_strategy_used: "mini_split_3",
            expected_items_min: visionExpectedMin,
            reliable_items_detected_by_vision: visionValidation.reliableItemsCount,
            split_segments_count: imageSegments.length,
          })

          const splitRetry = await runSplitRetry({
            imageSegments,
            browserText,
            baseReceipt: visionReceipt,
            expectedItemsMin: visionExpectedMin,
          })

          if (!splitRetry.error && splitRetry.merged) {
            const merged = splitRetry.merged
            const splitReceipt = merged.receipt
            const splitSegmentsResults = (splitRetry.splitResults || []).map((result: Record<string, unknown>) => {
              const receipt = (result.receipt || {}) as Record<string, unknown> & { items?: Record<string, unknown>[]; warnings?: unknown[] }
              const items = Array.isArray(receipt.items) ? receipt.items : []
              const imageSize = (result.imageSize || {}) as Record<string, unknown>
              const reliableCount = reliableItemsCount(items)
              return {
                segment: result.segment,
                segment_name: result.segment,
                image_width: Number(imageSize.width || 0) || null,
                image_height: Number(imageSize.height || 0) || null,
                input_tokens: result.inputTokens ?? null,
                items_count: items.length,
                raw_items_count: Number(result.rawItemsCount || items.length),
                reliable_items_count: reliableCount,
                rejected_items_count: Math.max(0, Number(result.rawItemsCount || items.length) - reliableCount),
                first_items_names: items.slice(0, 5).map((item) => String(item.name || item.ocr_name || "")).filter(Boolean),
                total_found: Number(receipt.total_amount || 0) > 0,
                warnings: Array.isArray(receipt.warnings) ? receipt.warnings : [],
                segment_quality_score: Math.min(100, Math.round((Number(imageSize.width || 0) * Number(imageSize.height || 0)) / 18000)),
              }
            })

            return jsonResponse({
              ok: true,
              pipeline_version: "scanner_premium_plus_v3",
              provider: "openai_vision_split",
              model: MODEL,
              stage: "openai_vision_split_retry",
              scan_strategy_used: "mini_split_3",
              scanStatus: merged.scanStatus,
              scan_status: merged.scanStatus,
              source: "openai_vision_split",
              text: browserText,
              confidence: merged.scanStatus === "usable_review" ? 68 : 42,
              receipt: splitReceipt,
              openaiDurationMs: Number(visionPrimary.durationMs || 0) + (splitRetry.splitResults || []).reduce((sum: number, result: Record<string, unknown>) => sum + Number(result.durationMs || 0), 0),
              totalDetectionDurationMs: localDurationMs,
              inputTokens: Number(visionPrimary.inputTokens || 0) + (splitRetry.splitResults || []).reduce((sum: number, result: Record<string, unknown>) => sum + Number(result.inputTokens || 0), 0),
              outputTokens: Number(visionPrimary.outputTokens || 0) + (splitRetry.splitResults || []).reduce((sum: number, result: Record<string, unknown>) => sum + Number(result.outputTokens || 0), 0),
              estimatedCostEur: null,
              fast_local_extraction_used: true,
              openai_called: true,
              text_ai_used: false,
              vision_used: true,
              scan_ai_calls_count: 1 + (splitRetry.splitResults || []).length,
              split_retry_eligible: true,
              split_retry_skipped_reason: "",
              primary_stage: "openai_vision_primary",
              primary_error: "",
              fallback_stage: "openai_vision_split_retry",
              premium_plus_detected: isPremiumPlus,
              segments_received_by_edge_function: imageSegments.length,
              premium_plus_daily_ai_limit: PREMIUM_PLUS_DAILY_AI_LIMIT,
              premium_plus_split_retry_daily_limit: SPLIT_RETRY_DAILY_LIMIT_PREMIUM_PLUS,
              split_retry_used: true,
              strong_fallback_used: false,
              items_detected_before_openai: itemsDetectedBeforeOpenAi,
              total_detected_before_openai: totalDetectedBeforeOpenAi,
              items_detected_by_vision: visionItemsCount,
              raw_items_detected_by_vision: visionValidation.rawItemsCount,
              reliable_items_detected_by_vision: visionValidation.reliableItemsCount,
              raw_items_detected_by_split: Array.isArray(splitReceipt.items) ? splitReceipt.items.length : 0,
              reliable_items_detected_by_split: merged.reliableItemsCount,
              calculated_items_sum: sumReceiptItems(splitReceipt.items || []),
              total_detected_by_vision: visionTotal > 0,
              total_estimated_from_items: false,
              total_needs_review: Boolean(splitReceipt.total_needs_review),
              openai_total_value: visionReceipt.openai_total_value ?? null,
              openai_total_raw_text: visionReceipt.openai_total_raw_text || "",
              openai_total_confidence: visionReceipt.openai_total_confidence ?? 0,
              split_total_value: merged.splitTotalValue,
              split_total_raw_text: merged.splitTotalRawText,
              split_total_confidence: merged.splitTotalConfidence,
              total_raw_text_verified_against_ocr: splitReceipt.total_raw_text_verified_against_ocr === true,
              total_rejected_reason: splitReceipt.total_rejected_reason || "",
              total_raw_text: splitReceipt.total_raw_text || "",
              total_confidence: splitReceipt.total_confidence || 0,
              total_source: splitReceipt.total_source || "missing_or_unreliable",
              estimated_items_sum: splitReceipt.estimated_items_sum ?? null,
              expected_items_min: visionExpectedMin,
              split_segments_count: (splitRetry.splitResults || []).length,
              split_segments_strategy: "vertical_3_overlap",
              split_segments_overlap_percent: 8,
              split_segments_results: splitSegmentsResults,
              rotation_applied: requestImageSize.rotationApplied ?? requestImageSize.rotation_applied ?? null,
              orientation_confidence: requestImageSize.orientation ? 85 : 45,
              deskew_applied: Array.isArray(requestImageSize.preProcessing) ? requestImageSize.preProcessing.includes("soft_deskew_orientation") : false,
              segment_quality_score: Math.min(100, Math.round((Number(requestImageSize.optimized_image_width || requestImageSize.width || 0) * Number(requestImageSize.optimized_image_height || requestImageSize.height || 0)) / 65000)),
              diagnostics: {
                split_retry_eligible: true,
                split_retry_used: true,
                split_retry_skipped_reason: "",
                split_segments_count: (splitRetry.splitResults || []).length,
                split_segments_results: splitSegmentsResults,
                split_improved_items: merged.improved,
                rotation_applied: requestImageSize.rotationApplied ?? requestImageSize.rotation_applied ?? null,
                orientation_confidence: requestImageSize.orientation ? 85 : 45,
                deskew_applied: Array.isArray(requestImageSize.preProcessing) ? requestImageSize.preProcessing.includes("soft_deskew_orientation") : false,
                segment_quality_score: Math.min(100, Math.round((Number(requestImageSize.optimized_image_width || requestImageSize.width || 0) * Number(requestImageSize.optimized_image_height || requestImageSize.height || 0)) / 65000)),
                primary_stage: "openai_vision_primary",
                primary_error: "",
                fallback_stage: "openai_vision_split_retry",
                premium_plus_detected: isPremiumPlus,
                segments_received_by_edge_function: imageSegments.length,
                user_plan: userPlan,
              },
            })
          }
        }

        if (provisionalTotal > 0 || visionItemsCount >= 3) {
          return jsonResponse({
            ok: true,
            pipeline_version: "scanner_premium_plus_v3",
            provider: "openai_vision_primary",
            model: MODEL,
            stage: "openai_vision_primary",
            scan_strategy_used: "mini_single",
            scanStatus: visionScanStatus,
            scan_status: visionScanStatus,
            source: "openai_vision_primary",
            text: browserText,
            confidence: visionScanStatus === "partial_low_items" ? 45 : 88,
            receipt: visionReceipt,
            openaiDurationMs: visionPrimary.durationMs,
            totalDetectionDurationMs: localDurationMs,
            inputTokens: visionPrimary.inputTokens,
            outputTokens: visionPrimary.outputTokens,
            openai_prompt: visionPrimary.prompt,
            openai_raw_content: visionPrimary.rawContent,
            openai_raw_response_body: visionPrimary.rawResponseBody,
            vision_input_mode: visionPrimary.inputMode,
            vision_image_size: visionPrimary.imageSize,
            estimatedCostEur: null,
            fast_local_extraction_used: true,
            openai_called: true,
            text_ai_used: false,
            vision_used: true,
            scan_ai_calls_count: 1,
            split_retry_used: false,
            strong_fallback_used: false,
            items_detected_before_openai: itemsDetectedBeforeOpenAi,
            total_detected_before_openai: totalDetectedBeforeOpenAi,
            items_detected_by_vision: visionItemsCount,
            raw_items_detected_by_vision: visionValidation.rawItemsCount,
            reliable_items_detected_by_vision: visionValidation.reliableItemsCount,
            calculated_items_sum: visionValidation.calculatedItemsSum,
            total_difference: visionValidation.totalDifference,
            discarded_hallucinated_items_count: visionValidation.discardedHallucinatedItems,
            total_detected_by_vision: visionTotal > 0,
            total_estimated_from_items: false,
            total_needs_review: !visionTotal,
            openai_total_value: visionReceipt.openai_total_value ?? null,
            openai_total_raw_text: visionReceipt.openai_total_raw_text || "",
            openai_total_confidence: visionReceipt.openai_total_confidence ?? 0,
            total_raw_text_verified_against_ocr: visionReceipt.total_raw_text_verified_against_ocr === true,
            total_rejected_reason: visionReceipt.total_rejected_reason || "",
            total_raw_text: visionReceipt.total_raw_text,
            total_confidence: visionReceipt.total_confidence,
            total_source: visionReceipt.total_source,
            expected_items_min: visionExpectedMin,
            premium_plus_daily_ai_limit: PREMIUM_PLUS_DAILY_AI_LIMIT,
          })
        }
      }

      if (visionPrimary && "error" in visionPrimary) {
        console.warn("[scan-receipt-ocr] openai_vision_primary_failed", visionPrimary)
        const splitAttempt = await runPremiumPlusSplitOrNull({
          primaryStage: "openai_vision_primary_failed",
          primaryError: String(visionPrimary.message || visionPrimary.code || "Analyse IA partielle ou invalide."),
          providerMessage: String(visionPrimary.message || visionPrimary.code || "Analyse IA partielle ou invalide."),
          baseReceipt: localReceipt,
          primaryDurationMs: Number(visionPrimary.durationMs || 0),
          primaryInputTokens: Number(visionPrimary.inputTokens || 0),
          primaryOutputTokens: Number(visionPrimary.outputTokens || 0),
          primaryReliableItemsDetected: 0,
          primaryRawItemsDetected: 0,
          primaryTotalDetected: false,
          primaryConfidence: 25,
        })
        if (splitAttempt.response) return splitAttempt.response
        return manualReviewResponse({
          stage: "openai_vision_primary",
          providerMessage: String(visionPrimary.message || visionPrimary.code || "Analyse IA partielle ou invalide."),
          browserText,
          localReceipt,
          requestImageSize,
          localDurationMs,
          itemsDetectedBeforeOpenAi,
          totalDetectedBeforeOpenAi,
          expectedItemsMin,
          diagnostics: {
            error_code: visionPrimary.code || "OPENAI_VISION_FAILED",
            openai_status: visionPrimary.status ?? null,
            openai_prompt: visionPrimary.prompt || "",
            openai_raw_content: visionPrimary.rawContent || "",
            openai_raw_response_body: visionPrimary.rawResponseBody || "",
            ...(splitAttempt.diagnostics || {}),
          },
        })
      }
    } catch (visionPrimaryError) {
      console.warn("[scan-receipt-ocr] openai_vision_primary_exception", {
        message: visionPrimaryError instanceof Error ? visionPrimaryError.message : String(visionPrimaryError),
        model: MODEL,
      })
      const splitAttempt = await runPremiumPlusSplitOrNull({
        primaryStage: "openai_vision_primary_exception",
        primaryError: errorMessage(visionPrimaryError),
        providerMessage: `Exception scanner recuperee: ${errorMessage(visionPrimaryError)}`,
        baseReceipt: localReceipt,
        primaryConfidence: 25,
      })
      if (splitAttempt.response) return splitAttempt.response
      return manualReviewResponse({
        stage: "openai_vision_primary_exception",
        providerMessage: `Exception scanner recuperee: ${errorMessage(visionPrimaryError)}`,
        browserText,
        localReceipt,
        requestImageSize,
        localDurationMs,
        itemsDetectedBeforeOpenAi,
        totalDetectedBeforeOpenAi,
        expectedItemsMin,
        diagnostics: {
          error_code: "VISION_PRIMARY_EXCEPTION",
          error_message: errorMessage(visionPrimaryError),
          ...(splitAttempt.diagnostics || {}),
        },
      })
    }

    if (totalDetectedBeforeOpenAi || itemsDetectedBeforeOpenAi >= 3) {
      const splitAttempt = await runPremiumPlusSplitOrNull({
        primaryStage: "openai_vision_primary_local_fallback",
        primaryError: "Primary vision did not return usable data before local fallback.",
        providerMessage: "OpenAI Vision tried once; local fallback available but Premium+ split should run first.",
        baseReceipt: localReceipt,
        primaryConfidence: 25,
      })
      if (splitAttempt.response) return splitAttempt.response

      const trustedLocalTotal = localReceipt.total_amount > 0 ? localReceipt.total_amount : 0
      const partialReceipt = {
        ...localReceipt,
        total_amount: trustedLocalTotal || null,
        total_status: trustedLocalTotal > 0 ? "detected" : "missing_or_unreliable",
        total_needs_review: trustedLocalTotal <= 0,
        total_source: trustedLocalTotal > 0 ? "trusted_total_line" : "missing_or_unreliable",
        total_raw_text: "",
        total_confidence: trustedLocalTotal > 0 ? 0.78 : 0,
        estimated_items_sum: trustedLocalTotal > 0 ? null : sumReceiptItems(localReceipt.items),
        warnings: [
          ...(Array.isArray(localReceipt.warnings) ? localReceipt.warnings : []),
          ...(trustedLocalTotal > 0 ? [] : ["Total non lu avec certitude. Verification manuelle necessaire."]),
        ],
      }

      return jsonResponse({
        ok: true,
        pipeline_version: "scanner_v2_ai_first_single_call",
        provider: "local_after_single_vision_attempt",
        model: MODEL,
        stage: "local_fallback_after_vision",
        scan_strategy_used: "local_fallback_after_single_vision_attempt",
        scanStatus: "partial_low_items",
        scan_status: "partial_low_items",
        source: "local_after_single_vision_attempt",
        text: browserText,
        confidence: 62,
        receipt: partialReceipt,
        openaiDurationMs: 0,
        totalDetectionDurationMs: localDurationMs,
        inputTokens: null,
        outputTokens: null,
        estimatedCostEur: null,
        fast_local_extraction_used: true,
        openai_called: true,
        text_ai_used: false,
        vision_used: true,
        items_detected_before_openai: itemsDetectedBeforeOpenAi,
        total_detected_before_openai: totalDetectedBeforeOpenAi,
        total_estimated_from_items: false,
        total_needs_review: trustedLocalTotal <= 0,
        openai_total_value: null,
        openai_total_raw_text: "",
        openai_total_confidence: 0,
        total_raw_text_verified_against_ocr: trustedLocalTotal > 0,
        total_rejected_reason: trustedLocalTotal > 0 ? "" : "total_missing",
        total_raw_text: partialReceipt.total_raw_text,
        total_confidence: partialReceipt.total_confidence,
        total_source: partialReceipt.total_source,
        expected_items_min: expectedItemsMin,
        premium_plus_daily_ai_limit: PREMIUM_PLUS_DAILY_AI_LIMIT,
        split_retry_eligible: Boolean(splitAttempt.diagnostics?.split_retry_eligible),
        split_retry_used: Boolean(splitAttempt.diagnostics?.split_retry_used),
        split_retry_skipped_reason: String(splitAttempt.diagnostics?.split_retry_skipped_reason || ""),
        split_segments_count: Number(splitAttempt.diagnostics?.split_segments_count || 0),
        split_segments_results: Array.isArray(splitAttempt.diagnostics?.split_segments_results) ? splitAttempt.diagnostics.split_segments_results : [],
        primary_stage: String(splitAttempt.diagnostics?.primary_stage || "openai_vision_primary_local_fallback"),
        primary_error: splitAttempt.diagnostics?.primary_error || "",
        fallback_stage: "local_fallback_after_vision",
        premium_plus_detected: Boolean(splitAttempt.diagnostics?.premium_plus_detected),
        segments_received_by_edge_function: Number(splitAttempt.diagnostics?.segments_received_by_edge_function || 0),
      })
    }

    const splitAttempt = await runPremiumPlusSplitOrNull({
      primaryStage: "openai_vision_primary_no_usable_data",
      primaryError: "OpenAI Vision tried once; no usable receipt data was returned.",
      providerMessage: "OpenAI Vision tried once; no usable receipt data was returned.",
      baseReceipt: localReceipt,
      primaryConfidence: 25,
    })
    if (splitAttempt.response) return splitAttempt.response

    return manualReviewResponse({
      stage: "openai_vision_primary",
      providerMessage: "OpenAI Vision tried once; no usable receipt data was returned.",
      browserText,
      localReceipt,
      requestImageSize,
      localDurationMs,
      itemsDetectedBeforeOpenAi,
      totalDetectedBeforeOpenAi,
      expectedItemsMin,
      diagnostics: {
        error_code: "SCAN_AI_RESPONSE_INVALID",
        image_size: requestImageSize,
        reason: "no_usable_receipt_data_after_single_ai_call",
        ...(splitAttempt.diagnostics || {}),
      },
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

      if (browserText.trim().length >= 30) {
        console.info("[scan-receipt-ocr] openai_enrichment", {
          scheduled: true,
          openai_called: true,
          reason: "local_parser_failed_but_ocr_text_available",
          textLength: browserText.length,
          image_size: requestImageSize,
        })

        try {
          const aiFallback = await runOpenAiTextFallback(browserText, requestImageSize)
          if (aiFallback && !("error" in aiFallback) && aiFallback.receipt.total_amount > 0) {
            const aiReceipt = {
              ...localReceipt,
              ...aiFallback.receipt,
              store_name: aiFallback.receipt.store_name || localReceipt.store_name,
              purchase_date: aiFallback.receipt.purchase_date || localReceipt.purchase_date,
              items: pickBestItems(aiFallback.receipt.items, localReceipt.items),
            }
            const aiItemsCount = aiReceipt.items.length
            const aiFoodTicket = isLikelyFoodTicket(aiReceipt, browserText)
            const aiExpectedMin = aiFoodTicket ? 3 : 0
            const aiScanStatus = aiFoodTicket && aiItemsCount < aiExpectedMin ? "partial_low_items" : "partial"

            return jsonResponse({
              ok: true,
              pipeline_version: "scanner_v2_phase2_sprint2",
              provider: "openai_text_fallback",
              model: MODEL,
              stage: "openai_enrichment",
              scanStatus: aiScanStatus,
              scan_status: aiScanStatus,
              source: "openai_text_fallback",
              text: browserText,
              confidence: aiItemsCount > 0 ? 74 : 58,
              receipt: aiReceipt,
              openaiDurationMs: aiFallback.durationMs,
              totalDetectionDurationMs: localDurationMs,
              inputTokens: aiFallback.inputTokens,
              outputTokens: aiFallback.outputTokens,
              estimatedCostEur: null,
              fast_local_extraction_used: true,
              openai_called: true,
              text_ai_used: true,
              vision_used: false,
              items_detected_before_openai: itemsDetectedBeforeOpenAi,
              total_detected_before_openai: false,
              expected_items_min: aiExpectedMin,
            })
          }

          if (aiFallback && "error" in aiFallback) {
            console.warn("[scan-receipt-ocr] openai_text_fallback_failed", aiFallback)
          }
        } catch (openAiError) {
          console.warn("[scan-receipt-ocr] openai_text_fallback_exception", {
            message: openAiError instanceof Error ? openAiError.message : String(openAiError),
            model: MODEL,
          })
        }
      }

      console.info("[scan-receipt-ocr] openai_enrichment", {
        scheduled: true,
        openai_called: true,
        reason: "local_parser_failed_total_absent_vision_fallback",
        textLength: browserText.length,
        image_size: requestImageSize,
      })

      try {
        const visionFallback = await runOpenAiVisionFallback({
          imageBase64,
          mimeType,
          imageSize: requestImageSize,
          hintText: browserText,
        })

        if (visionFallback && !("error" in visionFallback) && visionFallback.receipt.total_amount > 0) {
          const visionReceipt = {
            ...localReceipt,
            ...visionFallback.receipt,
            store_name: visionFallback.receipt.store_name || localReceipt.store_name,
            purchase_date: visionFallback.receipt.purchase_date || localReceipt.purchase_date,
            items: pickBestItems(visionFallback.receipt.items, localReceipt.items),
          }
          const visionItemsCount = visionReceipt.items.length
          const visionFoodTicket = isLikelyFoodTicket(visionReceipt, browserText)
          const visionExpectedMin = visionFoodTicket ? 3 : 0
          const visionScanStatus = visionFoodTicket && visionItemsCount < visionExpectedMin ? "partial_low_items" : "partial"

          return jsonResponse({
            ok: true,
            pipeline_version: "scanner_v2_phase2_sprint2",
            provider: "openai_vision_fallback",
            model: MODEL,
            stage: "openai_enrichment",
            scanStatus: visionScanStatus,
            scan_status: visionScanStatus,
            source: "openai_vision_fallback",
            text: browserText,
            confidence: visionItemsCount > 0 ? 76 : 60,
            receipt: visionReceipt,
            openaiDurationMs: visionFallback.durationMs,
            totalDetectionDurationMs: localDurationMs,
            inputTokens: visionFallback.inputTokens,
            outputTokens: visionFallback.outputTokens,
            estimatedCostEur: null,
            fast_local_extraction_used: true,
            openai_called: true,
            vision_used: true,
            text_ai_used: false,
            items_detected_before_openai: itemsDetectedBeforeOpenAi,
            total_detected_before_openai: false,
            expected_items_min: visionExpectedMin,
          })
        }

        if (visionFallback && "error" in visionFallback) {
          console.warn("[scan-receipt-ocr] openai_vision_fallback_failed", visionFallback)
        }
      } catch (openAiVisionError) {
        console.warn("[scan-receipt-ocr] openai_vision_fallback_exception", {
          message: openAiVisionError instanceof Error ? openAiVisionError.message : String(openAiVisionError),
          model: MODEL,
        })
      }

      if (itemsDetectedBeforeOpenAi >= 3) {
        const provisionalTotal = sumReceiptItems(localReceipt.items)
        const partialReceipt = {
          ...localReceipt,
          total_amount: provisionalTotal,
          total_status: "estimated_from_items",
        }

        return jsonResponse({
          ok: true,
          pipeline_version: "scanner_v2_phase2_sprint3",
          provider: "local_fallback_items_preserved",
          model: MODEL,
          stage: "server_ocr_fallback",
          scanStatus: "partial_low_items",
          scan_status: "partial_low_items",
          source: "local_fallback_items_preserved",
          text: browserText,
          confidence: 62,
          receipt: partialReceipt,
          openaiDurationMs: 0,
          totalDetectionDurationMs: localDurationMs,
          inputTokens: null,
          outputTokens: null,
          estimatedCostEur: null,
          fast_local_extraction_used: true,
          openai_called: false,
          text_ai_used: false,
          vision_used: false,
          items_detected_before_openai: itemsDetectedBeforeOpenAi,
          total_detected_before_openai: false,
          total_estimated_from_items: provisionalTotal > 0,
          expected_items_min: expectedItemsMin,
        })
      }

      return manualReviewResponse({
        stage: "server_ocr_fallback",
        providerMessage: "Total absent apres OCR local/regex et apres fallback IA.",
        browserText,
        localReceipt,
        requestImageSize,
        localDurationMs,
        itemsDetectedBeforeOpenAi,
        totalDetectedBeforeOpenAi: false,
        expectedItemsMin,
        openaiCalled: false,
        visionUsed: false,
        diagnostics: {
          error_code: "SCAN_PARSE_FAILED",
          reason: "total_missing_after_all_fallbacks",
        },
      })
    }

    if (isFoodTicket && expectedItemsMin > 0 && itemsDetectedBeforeOpenAi < Math.ceil(expectedItemsMin * 0.6)) {
      console.info("[scan-receipt-ocr] openai_enrichment", {
        scheduled: true,
        openai_called: true,
        reason: "local_items_below_quality_threshold",
        textLength: browserText.length,
        items_detected_before_openai: itemsDetectedBeforeOpenAi,
        expected_items_min: expectedItemsMin,
        image_size: requestImageSize,
      })

      try {
        const aiFallback = browserText.trim().length >= 30
          ? await runOpenAiTextFallback(browserText, requestImageSize)
          : await runOpenAiVisionFallback({ imageBase64, mimeType, imageSize: requestImageSize, hintText: browserText })

        if (aiFallback && !("error" in aiFallback) && aiFallback.receipt.total_amount > 0) {
          const aiReceipt = {
            ...localReceipt,
            ...aiFallback.receipt,
            store_name: aiFallback.receipt.store_name || localReceipt.store_name,
            purchase_date: aiFallback.receipt.purchase_date || localReceipt.purchase_date,
            total_amount: aiFallback.receipt.total_amount || localReceipt.total_amount,
            items: pickBestItems(aiFallback.receipt.items, localReceipt.items),
          }
          const aiItemsCount = aiReceipt.items.length
          const aiScanStatus = aiItemsCount < Math.ceil(expectedItemsMin * 0.6) ? "partial_low_items" : "partial"
          const usedVision = browserText.trim().length < 30

          return jsonResponse({
            ok: true,
            pipeline_version: "scanner_v2_phase2_sprint3",
            provider: usedVision ? "openai_vision_fallback" : "openai_text_fallback",
            model: MODEL,
            stage: "openai_enrichment",
            scanStatus: aiScanStatus,
            scan_status: aiScanStatus,
            source: usedVision ? "openai_vision_fallback" : "openai_text_fallback",
            text: browserText,
            confidence: aiItemsCount >= Math.ceil(expectedItemsMin * 0.6) ? 76 : 60,
            receipt: aiReceipt,
            openaiDurationMs: aiFallback.durationMs,
            totalDetectionDurationMs: localDurationMs,
            inputTokens: aiFallback.inputTokens,
            outputTokens: aiFallback.outputTokens,
            estimatedCostEur: null,
            fast_local_extraction_used: true,
            openai_called: true,
            text_ai_used: !usedVision,
            vision_used: usedVision,
            items_detected_before_openai: itemsDetectedBeforeOpenAi,
            total_detected_before_openai: true,
            expected_items_min: expectedItemsMin,
          })
        }

        if (aiFallback && "error" in aiFallback) {
          console.warn("[scan-receipt-ocr] openai_quality_fallback_failed", aiFallback)
        }
      } catch (openAiQualityError) {
        console.warn("[scan-receipt-ocr] openai_quality_fallback_exception", {
          message: openAiQualityError instanceof Error ? openAiQualityError.message : String(openAiQualityError),
          model: MODEL,
        })
      }
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
      pipeline_version: "scanner_v2_phase2_sprint2",
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
      text_ai_used: false,
      vision_used: false,
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
