import {
  classifyLineRejectionReason,
  classifySectionSubtotalLine,
  extractDeclaredItemsCount,
  extractDeclaredItemsEvidence,
  extractReliableDateCandidates,
  extractTrustedTotal,
  isItemEligibleForSmartShopping,
  isPhoneLine,
  isSectionSubtotalLine,
  normalizeItemQualityStatus,
  normalizeReceiptRuleDate,
  normalizeStoreName as normalizeStoreFromRules,
  shouldRejectLineAsProduct,
} from "./receiptRules.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODEL = Deno.env.get("OPENAI_SCAN_MODEL") || "gpt-4o-mini";
const MAX_BASE64_LENGTH = 7_500_000;
const OPENAI_TIMEOUT_MS = 45_000;
const PREMIUM_PLUS_DAILY_AI_LIMIT = Number(
  Deno.env.get("OPENAI_SCAN_DAILY_LIMIT_PREMIUM_PLUS") || 200,
);
const ENABLE_SPLIT_RETRY =
  Deno.env.get("OPENAI_SCAN_ENABLE_SPLIT_RETRY") !== "false";
const SPLIT_RETRY_DAILY_LIMIT_PREMIUM_PLUS = Number(
  Deno.env.get("OPENAI_SCAN_SPLIT_RETRY_DAILY_LIMIT_PREMIUM_PLUS") || 50,
);

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function imageSizeInfo(imageBase64 = "") {
  const padding = imageBase64.endsWith("==")
    ? 2
    : imageBase64.endsWith("=")
      ? 1
      : 0;
  return {
    base64Length: imageBase64.length,
    estimatedBytes: Math.max(
      0,
      Math.floor((imageBase64.length * 3) / 4) - padding,
    ),
    maxBase64Length: MAX_BASE64_LENGTH,
  };
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
  errorCode: string;
  errorMessage: string;
  status?: number;
  openaiStatus?: number | null;
  providerMessage?: string;
  stage?: string;
  extra?: Record<string, unknown>;
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
  };

  console.error("[scan-receipt-ocr] diagnostic_error", {
    http_status: status,
    ...body,
  });

  return jsonResponse(body, status);
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = OPENAI_TIMEOUT_MS,
) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort("openai_timeout"),
    timeoutMs,
  );

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function numericTotal(value: unknown) {
  const match = String(value ?? "").match(/(-?\d+(?:\s?\d{3})*[,.]\d{1,2})/);
  return match ? Number(match[1].replace(/\s/g, "").replace(",", ".")) || 0 : 0;
}

function normalizeText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function localOcrTechnicalFailure(errorType = "") {
  return (
    errorType === "module_load_failed" ||
    errorType === "worker_load_failed" ||
    errorType === "language_data_load_failed" ||
    errorType === "timeout"
  );
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
]);

function isGenericHallucinationName(value = "") {
  const clean = normalizeText(value)
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return GENERIC_HALLUCINATION_NAMES.has(clean);
}

function normalizeOpenAiItems(rawItems: unknown[] = []) {
  return normalizeItems(
    (rawItems || []).map((raw) => {
      const item = (raw || {}) as Record<string, unknown>;
      const price =
        numericTotal(item.total_price) ||
        numericTotal(item.price) ||
        numericTotal(item.unit_price);
      const rawText = String(
        item.raw_text || item.source_line || item.ocr_name || "",
      ).trim();
      const confidence = Math.round(
        Number(item.confidence_score ?? item.confidence ?? 0.68) *
          (Number(item.confidence_score ?? item.confidence ?? 0.68) <= 1
            ? 100
            : 1),
      );
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
        item_status:
          item.needs_review === false && rawText ? "detected" : "a_verifier",
        review_status:
          item.needs_review === false && rawText ? "trusted" : "needs_review",
        source: "openai_vision",
      };
    }),
  );
}

function isIgnoredItemLine(value = "") {
  const clean = normalizeText(value)
    .replace(/[^a-z0-9% ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return true;
  if (shouldRejectLineAsProduct(value)) return true;
  if (
    clean.includes("total") ||
    clean.includes("carte bleue") ||
    clean === "cb"
  )
    return true;
  if (
    clean.includes("tva") ||
    clean.includes("ttc") ||
    clean.includes("ventilation") ||
    clean.includes("merci")
  )
    return true;
  if (
    clean.includes("bienvenue") ||
    clean.includes("operation") ||
    clean.includes("vente") ||
    clean.includes("duplicata")
  )
    return true;
  if (
    clean.includes("caisse") ||
    clean.includes("ticket") ||
    clean.includes("code")
  )
    return true;
  if (
    clean.includes("fidelite") ||
    clean.includes("point") ||
    clean.includes("cagnotte") ||
    clean.includes("publicite")
  )
    return true;
  if (
    clean.includes("jeudi") ||
    clean.includes("remise") ||
    clean.includes("prix promotion")
  )
    return true;
  if (
    /^(boissons|epicerie|epicerie salee|epicerie sucree|surgeles|charcuterie|cremerie|hygiene|higiene|fleurs|fruits legumes|ppi)\b/.test(
      clean,
    )
  )
    return true;
  return false;
}

function isPhoneOrContactLine(value = "") {
  return isPhoneLine(value);
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
    .trim();
}

function lastMoney(value = "") {
  const matches = Array.from(
    String(value || "").matchAll(/(-?\d+[,.]\d{2})\s*(eur|euro|euros)?/gi),
  );
  if (!matches.length) return 0;
  return Number(matches[matches.length - 1][1].replace(",", ".")) || 0;
}

function isArticleCountTotalLine(value = "") {
  return /\btotal\s+\d{1,3}\s+articles?\b/i.test(normalizeText(value));
}

function extractDueTotalFromText(text = "") {
  const lines = String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    const clean = normalizeText(line);
    const isDueLine =
      clean.includes("reste a payer") ||
      clean.includes("net a payer") ||
      clean.includes("a payer");
    if (!isDueLine) continue;

    const sameLineTotal = lastMoney(line);
    if (sameLineTotal) return sameLineTotal;

    const nearbyTotal = lastMoney(
      [lines[index + 1], lines[index - 1]].filter(Boolean).join(" "),
    );
    if (nearbyTotal) return nearbyTotal;
  }

  return 0;
}

function extractTotalFromText(text = "") {
  const trusted = extractTrustedTotal(text);
  if (trusted.amount) return trusted.amount;

  const dueTotal = extractDueTotalFromText(text);
  if (dueTotal) return dueTotal;

  const lines = String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    const clean = normalizeText(line);
    if (isArticleCountTotalLine(line)) {
      continue;
    }
    const isTotalLine =
      clean.includes("reste a payer") ||
      clean.includes("net a payer") ||
      clean.includes("a payer") ||
      clean.includes("total");
    if (!isTotalLine) continue;

    const sameLineTotal = lastMoney(line);
    if (sameLineTotal) return sameLineTotal;

    const nearbyTotal = lastMoney(
      [lines[index + 1], lines[index - 1]].filter(Boolean).join(" "),
    );
    if (nearbyTotal) return nearbyTotal;
  }

  return 0;
}

function isTrustedTotalLabel(line = "") {
  const clean = normalizeText(line);
  return (
    clean.includes("reste a payer") ||
    clean.includes("net a payer") ||
    /\ba payer\b/.test(clean) ||
    /\btotal\b/.test(clean)
  );
}

function extractTrustedTotalEvidence(text = "", expectedAmount = 0) {
  const lines = String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!isTrustedTotalLabel(line) || isArticleCountTotalLine(line)) continue;

    const candidates = [
      line,
      [line, lines[index + 1]].filter(Boolean).join(" "),
      [lines[index - 1], line].filter(Boolean).join(" "),
    ];
    for (const candidate of candidates) {
      const amount = lastMoney(candidate);
      if (!amount) continue;
      if (expectedAmount > 0 && Math.abs(amount - expectedAmount) > 0.05)
        continue;
      return {
        amount,
        rawText: candidate.trim(),
        confidence:
          normalizeText(candidate).includes("reste a payer") ||
          normalizeText(candidate).includes("net a payer")
            ? 0.95
            : 0.82,
        source: "trusted_total_line",
      };
    }
  }

  return {
    amount: 0,
    rawText: "",
    confidence: 0,
    source: "missing_or_unreliable",
  };
}

function confidence01(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return number > 1 ? Math.min(1, number / 100) : Math.min(1, number);
}

function amountAppearsInLine(line = "", amount = 0) {
  if (amount <= 0) return false;
  const amountFixed = amount.toFixed(2);
  const normalizedLine = String(line || "").replace(/\s/g, "");
  return (
    normalizedLine.includes(amountFixed) ||
    normalizedLine.includes(amountFixed.replace(".", ","))
  );
}

function totalRawTextVerifiedAgainstOcr(
  rawText = "",
  amount = 0,
  fallbackText = "",
) {
  if (!rawText || amount <= 0) return false;
  if (!isTrustedTotalLabel(rawText) || isArticleCountTotalLine(rawText))
    return false;

  const lines = String(fallbackText || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.some((line, index) => {
    const candidates = [
      line,
      [line, lines[index + 1]].filter(Boolean).join(" "),
      [lines[index - 1], line].filter(Boolean).join(" "),
    ];

    return candidates.some((candidate) => {
      if (!isTrustedTotalLabel(candidate) || isArticleCountTotalLine(candidate))
        return false;
      const candidateAmount = lastMoney(candidate);
      return (
        candidateAmount > 0 &&
        Math.abs(candidateAmount - amount) <= 0.05 &&
        amountAppearsInLine(candidate, amount)
      );
    });
  });
}

function resolveTrustedTotal(
  parsed: Record<string, unknown>,
  fallbackText = "",
) {
  const candidateTotal =
    numericTotal(parsed.reste_a_payer) ||
    numericTotal(parsed.rest_to_pay) ||
    numericTotal(parsed.amount_due) ||
    numericTotal(parsed.total_final) ||
    numericTotal(parsed.net_a_payer) ||
    numericTotal(parsed.total_amount) ||
    numericTotal(parsed.total);
  const rawText = String(
    parsed.total_raw_text ||
      parsed.total_source_line ||
      parsed.raw_total_text ||
      "",
  ).trim();
  const openAiConfidence = confidence01(parsed.total_confidence);
  const hasOpenAiTotalConfidence = Object.prototype.hasOwnProperty.call(
    parsed,
    "total_confidence",
  );
  const base = {
    openaiTotalValue: candidateTotal || null,
    openaiTotalRawText: rawText,
    openaiTotalConfidence: openAiConfidence,
    totalRawTextVerifiedAgainstOcr: false,
    rejectedReason: "",
  };

  if (candidateTotal > 0) {
    if (hasOpenAiTotalConfidence && openAiConfidence < 0.7) {
      return {
        ...base,
        amount: 0,
        rawText: "",
        confidence: 0,
        source: "openai_low_confidence",
        rejectedReason: "openai_total_confidence_below_threshold",
      };
    }

    if (
      !rawText ||
      !isTrustedTotalLabel(rawText) ||
      isArticleCountTotalLine(rawText)
    ) {
      return {
        ...base,
        amount: 0,
        rawText: "",
        confidence: 0,
        source: "openai_unverified",
        rejectedReason: "openai_total_raw_text_missing_or_invalid",
      };
    }

    const verified = totalRawTextVerifiedAgainstOcr(
      rawText,
      candidateTotal,
      fallbackText,
    );
    if (!verified) {
      return {
        ...base,
        amount: 0,
        rawText: "",
        confidence: 0,
        source: "openai_unverified",
        rejectedReason: "openai_total_raw_text_not_confirmed",
      };
    }

    return {
      ...base,
      amount: candidateTotal,
      rawText,
      confidence: openAiConfidence || 0.82,
      source: "openai_total_raw_text_verified",
      totalRawTextVerifiedAgainstOcr: true,
    };
  }

  const textEvidence = extractTrustedTotalEvidence(
    fallbackText,
    candidateTotal,
  );
  if (textEvidence.amount > 0) {
    return {
      ...base,
      ...textEvidence,
      totalRawTextVerifiedAgainstOcr: true,
      source: "local_trusted_total_line",
    };
  }

  return {
    ...base,
    amount: 0,
    rawText: rawText && isTrustedTotalLabel(rawText) ? rawText : "",
    confidence: 0,
    source: "missing_or_unreliable",
    rejectedReason: rawText ? "total_raw_text_not_confirmed" : "total_missing",
  };
}

function extractFinalTotalFromStructured(
  parsed: Record<string, unknown>,
  fallbackText = "",
) {
  return resolveTrustedTotal(parsed, fallbackText).amount;
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
  name: string;
  rawLine: string;
  price: number;
  quantity?: number;
  unit?: string;
  unitPrice?: number | null;
  promotion?: boolean;
}) {
  const finalName = cleanItemName(name);
  if (!finalName || price <= 0 || isIgnoredItemLine(finalName)) return null;
  const rawOcrName = isIgnoredItemLine(rawLine)
    ? finalName
    : String(rawLine || finalName).trim();

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
  };
}

function parseFallbackItemsFromText(text = "") {
  const lines = String(text || "")
    .replace(/\\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const items: Record<string, unknown>[] = [];
  let pendingName = "";
  let inVatSection = false;

  for (const line of lines) {
    const price = lastMoney(line);
    const clean = normalizeText(line);
    const hasNegativePrice = /-\s*\d+[,.]\d{2}/.test(line);
    const promotionLine =
      clean.includes("prix promotion") || clean.includes("promotion");
    const vatSectionLine =
      clean.includes("ventilation") ||
      clean.includes("code tot") ||
      clean.includes("tva") ||
      clean.includes("t v a") ||
      clean.includes("ttc") ||
      clean.includes("t t c");

    if (vatSectionLine) {
      inVatSection = true;
      pendingName = "";
      continue;
    }

    if (inVatSection) {
      continue;
    }

    if (
      isIgnoredItemLine(line) &&
      !(promotionLine && price > 0 && pendingName)
    ) {
      pendingName = "";
      continue;
    }

    if (price > 0 && !hasNegativePrice) {
      const withoutPrices = line.replace(
        /-?\d+[,.]\d{2}\s*(eur|euro|euros)?/gi,
        " ",
      );
      const candidate = cleanItemName(withoutPrices);
      const quantityMatch = line.match(/\b(\d+)\s*x\s*(\d+[,.]\d{2})/i);
      const weightMatch = line.match(
        /(\d+[,.]\d{1,3})\s*kg\s*x\s*(\d+[,.]\d{2})/i,
      );
      const quantityOnlyText = normalizeText(candidate)
        .replace(/[^a-z0-9x,. ]/g, "")
        .trim();
      const quantityOnly =
        Boolean(quantityOnlyText) &&
        /^[0-9x,. ]+$/.test(quantityOnlyText) &&
        quantityOnlyText.includes("x");
      const name =
        (weightMatch ||
          promotionLine ||
          quantityOnly ||
          candidate.length < 3) &&
        pendingName
          ? pendingName
          : candidate;
      const item = makeFallbackItem({
        name,
        rawLine: line,
        price,
        quantity: weightMatch
          ? Number(weightMatch[1].replace(",", ".")) || 1
          : quantityMatch
            ? Number(quantityMatch[1]) || 1
            : 1,
        unit: weightMatch ? "kg" : "piece",
        unitPrice: weightMatch
          ? Number(weightMatch[2].replace(",", ".")) || null
          : quantityMatch
            ? Number(quantityMatch[2].replace(",", ".")) || null
            : price,
        promotion: promotionLine,
      });

      if (item) items.push(item);
      pendingName = "";
      continue;
    }

    const candidate = cleanItemName(line);
    if (candidate.length >= 3 && /[a-zA-Z]/.test(candidate)) {
      pendingName = candidate;
    }
  }

  return normalizeItems(items);
}

function detectLocalMerchant(text = "") {
  const ruleStore = normalizeStoreFromRules(text);
  if (ruleStore.store_name) return ruleStore.store_name;

  const clean = normalizeText(text)
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ");
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
  ];
  return stores.find((store) => clean.includes(store.pattern))?.label || "";
}

function isUiStoreName(value = "") {
  const clean = normalizeText(value)
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return true;
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
  ].some((blocked) => clean.includes(blocked));
}

function cleanStoreCandidate(value = "", fallback = "") {
  const candidate = String(value || "").trim();
  if (candidate && !isUiStoreName(candidate)) return candidate;
  const fallbackCandidate = String(fallback || "").trim();
  if (fallbackCandidate && !isUiStoreName(fallbackCandidate))
    return fallbackCandidate;
  return "";
}

function normalizeLocalMerchantName(storeName = "") {
  const ruleStore = normalizeStoreFromRules(storeName);
  if (ruleStore.normalized_store_name) return ruleStore.normalized_store_name;

  const clean = normalizeText(storeName);
  if (clean.includes("leclerc")) return "e.leclerc";
  if (clean.includes("leader price")) return "leader price";
  if (clean.includes("carrefour")) return "carrefour";
  if (clean.includes("super u")) return "super u";
  if (clean.includes("hyper u")) return "hyper u";
  return clean || "";
}

function detectLocalStoreLocation(text = "", storeName = "") {
  const ruleStore = normalizeStoreFromRules([text, storeName].join(" "));
  if (ruleStore.store_location) return ruleStore.store_location;

  const clean = normalizeText([text, storeName].join(" "));
  if (clean.includes("le portail")) return "Le Portail";
  if (clean.includes("saint leu") || clean.includes("saint-leu"))
    return "Saint-Leu";
  return "";
}

function detectLocalDate(text = "") {
  const candidate = extractReliableDateCandidates(text)[0];
  if (!candidate) return "";
  const normalized = normalizeReceiptRuleDate(candidate.normalized);
  console.info("[scan-receipt-ocr] date_normalization", {
    raw_date_detected: candidate.raw,
    normalized_date: normalized,
    date_status: "detected",
    date_fallback_used: false,
  });
  return normalized;
}

function detectPaymentMethod(line = "") {
  const clean = normalizeText(line);
  if (
    clean.includes("especes") ||
    clean.includes("espece") ||
    clean.includes("cash")
  )
    return "especes";
  if (
    clean.includes("carte bleue") ||
    clean === "cb" ||
    clean.includes("visa") ||
    clean.includes("mastercard")
  )
    return "carte";
  return null;
}

function sectionSubtotalDiagnostics(text = "") {
  const classified = String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({
      line,
      amount: lastMoney(line),
      classification: classifySectionSubtotalLine(line),
    }))
    .filter((row) => row.classification.kind !== "none");

  const rejected = classified
    .filter((row) => row.classification.kind === "confirmed")
    .map((row) => ({
      line: row.line,
      amount: row.amount,
      reason: row.classification.reason,
      matched_heading: row.classification.matchedHeading,
    }));

  const probable = classified
    .filter((row) => row.classification.kind === "probable")
    .map((row) => ({
      line: row.line,
      amount: row.amount,
      reason: row.classification.reason,
      matched_heading: row.classification.matchedHeading,
    }));

  const rejectedAmount = rejected.reduce(
    (sum, row) => sum + Number(row.amount || 0),
    0,
  );
  const probableAmount = probable.reduce(
    (sum, row) => sum + Number(row.amount || 0),
    0,
  );
  return {
    rejected,
    probable,
    rejectedCount: rejected.length,
    probableCount: probable.length,
    rejectedAmount: Number(rejectedAmount.toFixed(2)),
    probableAmount: Number(probableAmount.toFixed(2)),
  };
}

const LOCAL_PRODUCT_PRICE_WORDS = [
  "chips",
  "rosette",
  "fuet",
  "olot",
  "jambon",
  "saucisson",
  "charcut",
  "tlj",
  "barre",
  "cereal",
  "cereale",
  "choco",
  "mimolette",
  "wimolette",
  "gouda",
  "camembert",
  "panenbert",
  "gouverneur",
  "nugget",
  "crevette",
  "crevetti",
  "brocoli",
  "emmental",
  "cocciole",
  "riscossa",
  "pistache",
];

const PRODUCT_MATCH_STOP_WORDS = new Set([
  "prix",
  "promotion",
  "eur",
  "euro",
  "euros",
  "cur",
  "bur",
  "piece",
  "unite",
  "barcode",
  "article",
  "produit",
  "avec",
  "sans",
  "les",
  "des",
  "une",
  "pour",
  "150",
  "150g",
  "150gr",
  "160",
  "160g",
  "80g",
  "808",
  "1508r",
]);

function localPriceEvidenceTokens(value = "") {
  const clean = normalizeText(value)
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return clean
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => token.length >= 3)
    .filter((token) => !/^\d{5,}$/.test(token))
    .filter((token) => !/^\d+(g|gr|kg|ml|cl|l|tr|x)?$/.test(token))
    .filter((token) => !PRODUCT_MATCH_STOP_WORDS.has(token));
}

function localPriceEvidenceScore(a = "", b = "") {
  const aTokens = localPriceEvidenceTokens(a);
  const bTokens = localPriceEvidenceTokens(b);
  if (!aTokens.length || !bTokens.length) return 0;

  const bSet = new Set(bTokens);
  const overlap = aTokens.filter((token) => bSet.has(token)).length;
  const directKnownProductMatch = LOCAL_PRODUCT_PRICE_WORDS.some((word) => {
    return (
      aTokens.some((token) => token.includes(word) || word.includes(token)) &&
      bTokens.some((token) => token.includes(word) || word.includes(token))
    );
  });

  return (
    overlap / Math.max(1, Math.min(aTokens.length, bTokens.length)) +
    (directKnownProductMatch ? 0.35 : 0)
  );
}

function isLocalProductPriceLine(value = "") {
  const clean = normalizeText(value)
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!clean) return false;
  if (clean.includes("prix promotion")) return false;
  if (isTrustedPaymentTotalLabel(value)) return false;
  if (classifySectionSubtotalLine(value).kind !== "none") return false;
  if (
    /\b(total|tva|ttc|fidelite|client|operation|vente|bienvenue|telephone|tel)\b/.test(
      clean,
    )
  )
    return false;
  if (/\b\d{8,14}\b/.test(clean)) return true;
  return LOCAL_PRODUCT_PRICE_WORDS.some((word) => clean.includes(word));
}

function repairLocalPriceEvidenceAmount(amount = 0, receiptTotal = 0) {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (receiptTotal > 0 && amount > receiptTotal) {
    const moduloTen = Number((amount % 10).toFixed(2));
    if (moduloTen >= 0.1 && moduloTen <= receiptTotal && moduloTen < amount) {
      return moduloTen;
    }
  }
  return Number(amount.toFixed(2));
}

function extractLocalProductPriceEvidence(text = "", receiptTotal = 0) {
  const lines = String(text || "")
    .replace(/\\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const evidence: Array<Record<string, unknown>> = [];
  let lastProductEvidenceIndex = -1;
  let lastProductLineIndex = -99;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const clean = normalizeText(line);
    const amount = repairLocalPriceEvidenceAmount(
      lastMoney(line),
      receiptTotal,
    );
    const isPromotionPriceLine =
      clean.includes("prix promotion") ||
      clean.includes("prix pronotion") ||
      clean.includes("prix prowotion");

    if (
      isPromotionPriceLine &&
      amount > 0 &&
      lastProductEvidenceIndex >= 0 &&
      index - lastProductLineIndex <= 3
    ) {
      const current = evidence[lastProductEvidenceIndex];
      current.price = amount;
      current.total_price = amount;
      current.promotion_price = amount;
      current.price_source = "local_promotion_line";
      current.raw_line = [String(current.raw_line || ""), line]
        .filter(Boolean)
        .join(" | ");
      continue;
    }

    if (!isLocalProductPriceLine(line)) continue;

    const name = cleanItemName(line);
    if (!name || isIgnoredItemLine(name)) continue;

    evidence.push({
      raw_line: line,
      name,
      price: amount || null,
      total_price: amount || null,
      price_source:
        amount > 0 ? "local_product_line" : "local_product_pending_price",
      line_index: index,
    });
    lastProductEvidenceIndex = evidence.length - 1;
    lastProductLineIndex = index;
  }

  return evidence.filter(
    (row) => Number(row.price || row.total_price || 0) > 0,
  );
}

function correctVisionItemsWithLocalPriceEvidence(
  items: Record<string, unknown>[] = [],
  hintText = "",
  receiptTotal = 0,
) {
  const evidence = extractLocalProductPriceEvidence(hintText, receiptTotal);
  if (!items.length || !evidence.length) return items;

  return items.map((item) => {
    const itemText = [item.name, item.ocr_name, item.raw_text, item.source_line]
      .filter(Boolean)
      .join(" ");
    const currentAmount =
      numericTotal(item.total_price) ||
      numericTotal(item.price) ||
      numericTotal(item.unit_price);
    let bestEvidence: Record<string, unknown> | null = null;
    let bestScore = 0;

    for (const row of evidence) {
      const rowText = [row.name, row.raw_line].filter(Boolean).join(" ");
      const score = localPriceEvidenceScore(itemText, rowText);
      if (score > bestScore) {
        bestScore = score;
        bestEvidence = row;
      }
    }

    if (!bestEvidence || bestScore < 0.35) {
      const repaired = repairLocalPriceEvidenceAmount(
        currentAmount,
        receiptTotal,
      );
      if (repaired > 0 && Math.abs(repaired - currentAmount) > 0.05) {
        return {
          ...item,
          total_price: repaired,
          price: repaired,
          unit_price:
            Number(item.quantity || 1) === 1 ? repaired : item.unit_price,
          price_correction_source: "oversized_ocr_amount_repaired",
          price_correction_raw_text: String(
            item.raw_text ||
              item.source_line ||
              item.ocr_name ||
              item.name ||
              "",
          ),
          needs_review: true,
          review_status: "needs_review",
          item_status: "needs_review",
          confidence_score: Math.min(Number(item.confidence_score || 65), 65),
        };
      }
      return item;
    }

    const evidenceAmount = Number(
      bestEvidence.price || bestEvidence.total_price || 0,
    );
    if (evidenceAmount <= 0) return item;

    const priceSource = String(bestEvidence.price_source || "");
    const shouldCorrect =
      Math.abs(evidenceAmount - currentAmount) > 0.05 &&
      (priceSource === "local_promotion_line" ||
        currentAmount <= 0 ||
        (receiptTotal > 0 && currentAmount > receiptTotal) ||
        evidenceAmount < currentAmount);

    if (!shouldCorrect) return item;

    return {
      ...item,
      total_price: evidenceAmount,
      price: evidenceAmount,
      unit_price:
        Number(item.quantity || 1) === 1 ? evidenceAmount : item.unit_price,
      price_correction_source: priceSource || "local_price_evidence",
      price_correction_raw_text: String(bestEvidence.raw_line || ""),
      price_correction_previous_amount: currentAmount || null,
      confidence_score: Math.max(
        Number(item.confidence_score || 0),
        priceSource === "local_promotion_line" ? 98 : 88,
      ),
    };
  });
}

const SECTION_SUBTOTAL_KEYWORDS = [
  "surgeles",
  "sungeles",
  "surgele",
  "epicerie sucree",
  "epicerie sucr",
  "epicerte sucree",
  "epicer1e sucree",
  "epicerie salee",
  "epicerte salee",
  "epicer1e salee",
  "cremerie",
  "crererie",
  "charcuterie",
  "charcuter1e",
  "charcuterte",
  "charcuterie ls",
  "boissons sans alcool",
  "ultra frais",
  "fleurs plantes fruits legumes",
  "fruits legumes",
  "volaille",
  "ppi",
];

function containsSectionSubtotalKeyword(value = "") {
  const clean = normalizeText(value)
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return SECTION_SUBTOTAL_KEYWORDS.some((keyword) => clean.includes(keyword));
}

function hasKnownLocalProductSignal(value = "") {
  const clean = normalizeText(value);
  return [
    "huile",
    "nugget",
    "crevette",
    "brocoli",
    "barre",
    "cereale",
    "choco",
    "cocciole",
    "riscossa",
    "emmental",
    "pomme de terre",
    "salade",
    "champignon",
    "echalote",
    "dolce",
    "mousse",
    "fido",
    "pedigree",
    "kinder",
    "joker",
    "saucisse",
  ].some((keyword) => clean.includes(keyword));
}

function hasDominantOcrNoise(value = "") {
  const clean = normalizeText(value)
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const letters = clean.replace(/[^a-z]/g, "");
  if (!letters) return true;
  if (/([a-z])\1{5,}/.test(letters)) return true;
  if (/\b(e{4,}|h{4,}|o{4,}|r{4,})\b/.test(clean)) return true;
  if (/\b(ecooree|eters|heeeee|sungeles)\b/.test(clean)) return true;
  if (letters.length >= 10) {
    const uniqueLetters = new Set(letters.split("")).size;
    if (uniqueLetters <= 4) return true;
  }
  return false;
}

function smartShoppingBlockReasons({
  totalDelta,
  lostPossibleProductLines,
  sectionSubtotal,
  text,
  items,
}: {
  totalDelta: number | null;
  lostPossibleProductLines: string[];
  sectionSubtotal: ReturnType<typeof sectionSubtotalDiagnostics>;
  text: string;
  items: Record<string, unknown>[];
}) {
  const reasons = new Set<string>();
  if (Number(totalDelta || 0) > 0.05) reasons.add("items_total_mismatch");
  if (lostPossibleProductLines.length > 0)
    reasons.add("lost_possible_product_lines");
  if (
    items.some(
      (item) =>
        classifySectionSubtotalLine(
          String(
            item.source_line ||
              item.raw_text ||
              item.ocr_name ||
              item.name ||
              "",
          ),
        ).kind === "confirmed",
    )
  ) {
    reasons.add("section_subtotal_kept_as_item");
  }
  if (
    items.some(
      (item) =>
        classifySectionSubtotalLine(
          String(
            item.source_line ||
              item.raw_text ||
              item.ocr_name ||
              item.name ||
              "",
          ),
        ).kind === "probable",
    )
  ) {
    reasons.add("section_subtotal_probable_kept_as_item");
  }
  if (
    items.some(
      (item) =>
        containsSectionSubtotalKeyword(
          String(item.ocr_name || item.name || ""),
        ) &&
        !hasKnownLocalProductSignal(String(item.ocr_name || item.name || "")),
    )
  ) {
    reasons.add("section_heading_kept_as_item");
  }
  if (
    items.some((item) =>
      hasDominantOcrNoise(
        String(item.raw_text || item.ocr_name || item.name || ""),
      ),
    )
  ) {
    reasons.add("dominant_ocr_noise");
  }
  if (
    Number(totalDelta || 0) > 0.05 &&
    sectionSubtotal.rejectedCount === 0 &&
    String(text || "")
      .split("\n")
      .some((line) => containsSectionSubtotalKeyword(line))
  ) {
    reasons.add("section_subtotals_present_but_not_rejected");
  }
  if (
    items.some(
      (item) =>
        Number(item.item_quality_score || item.confidence_score || 0) < 70 &&
        normalizeItemQualityStatus(item) === "trusted",
    )
  ) {
    reasons.add("low_quality_item_marked_trusted");
  }
  return Array.from(reasons);
}

function applySmartShoppingGuard(
  items: Record<string, unknown>[],
  blockedReasons: string[],
) {
  if (blockedReasons.length === 0) return items;
  const reason = blockedReasons[0] || "smart_shopping_quality_guard";
  return items.map((item) => ({
    ...item,
    item_status: "needs_review",
    status: "needs_review",
    review_status: "needs_review",
    needs_review: true,
    item_quality_score: Math.min(
      Number(item.item_quality_score || item.confidence_score || 55),
      55,
    ),
    confidence_score: Math.min(
      Number(item.confidence_score || item.item_quality_score || 55),
      55,
    ),
    item_rejection_reason: String(item.item_rejection_reason || reason),
  }));
}

function localOcrTextPresenceDiagnostics(
  text = "",
  total = 0,
  declaredCount = 0,
) {
  const lines = String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const totalLikeLine =
    lines.find((line) => {
      const clean = normalizeText(line);
      return /\b(total|tuial|t0tal|totai|t0ial|toial|tutal|reste a payer|net a payer|a payer)\b/.test(
        clean,
      );
    }) || "";
  const paymentLine =
    lines.find((line) => detectPaymentMethod(line) && lastMoney(line) > 0) ||
    "";
  const hasDeclaredLine = declaredCount > 0;
  const localTotalMissingReason =
    total > 0
      ? ""
      : totalLikeLine
        ? paymentLine
          ? "total_like_present_but_not_trusted"
          : "total_like_without_matching_payment"
        : "bottom_total_not_present_in_ocr_text";

  return {
    ocr_text_has_total: Boolean(totalLikeLine || (total > 0 && paymentLine)),
    ocr_text_has_payment: Boolean(paymentLine),
    ocr_text_has_declared_items_count: hasDeclaredLine,
    ocr_text_last_lines: lines.slice(-8),
    local_total_missing_reason: localTotalMissingReason,
  };
}

function buildFastLocalExtraction(text = "") {
  const total = extractTotalFromText(text);
  const trustedTotal = extractTrustedTotal(text);
  const storeName = detectLocalMerchant(text);
  const purchaseDate = detectLocalDate(text);
  const declaredEvidence = getDeclaredItemsEvidence(text);
  const expectedItemsCount = declaredEvidence.count;
  const rawItems = parseFallbackItemsFromText(text);
  const finalItems =
    expectedItemsCount > 0 && rawItems.length > expectedItemsCount
      ? rawItems.slice(0, expectedItemsCount)
      : rawItems;
  const exactDeclaredCount =
    expectedItemsCount > 0 && finalItems.length === expectedItemsCount;
  const initialItems = finalItems.map((item) => ({
    ...item,
    price:
      numericTotal(item.price) ||
      numericTotal(item.total_price) ||
      numericTotal(item.unit_price),
    status: exactDeclaredCount ? "trusted" : "needs_review",
    item_status: exactDeclaredCount ? "trusted" : "needs_review",
    review_status: exactDeclaredCount ? "trusted" : "needs_review",
    needs_review: !exactDeclaredCount,
    item_quality_score: exactDeclaredCount
      ? 88
      : Number(item.confidence_score || 62),
    item_rejection_reason: "",
    raw_text: String(
      item.raw_text || item.source_line || item.ocr_name || item.name || "",
    ),
    source_line: String(
      item.source_line || item.raw_text || item.ocr_name || item.name || "",
    ),
    confidence_score: exactDeclaredCount
      ? 88
      : Number(item.confidence_score || 62),
    source: "local_ocr",
  }));
  const sectionSubtotal = sectionSubtotalDiagnostics(text);
  const rejectedBeforeItemLimitLines = [
    ...sectionSubtotal.rejected.map((row) => ({
      line: row.line,
      reason: row.reason || "section_subtotal_confirmed",
    })),
    ...sectionSubtotal.probable.map((row) => ({
      line: row.line,
      reason: row.reason || "section_subtotal_probable",
    })),
  ];
  const textPresence = localOcrTextPresenceDiagnostics(
    text,
    total,
    expectedItemsCount,
  );
  const itemLimitAppliedAfterFiltering =
    expectedItemsCount > 0 && rawItems.length > expectedItemsCount;
  const lostPossibleProductLines = itemLimitAppliedAfterFiltering
    ? rawItems
        .slice(expectedItemsCount)
        .map((item) =>
          String(
            item.raw_text ||
              item.source_line ||
              item.ocr_name ||
              item.name ||
              "",
          ),
        )
    : [];
  const initialCalculatedItemsSum = Number(
    initialItems
      .reduce(
        (sum, item) =>
          sum + Number(item.total_price || item.price || item.unit_price || 0),
        0,
      )
      .toFixed(2),
  );
  const itemsTotalVsReceiptTotalDelta = total
    ? Number(Math.abs(initialCalculatedItemsSum - total).toFixed(2))
    : null;
  const smartShoppingBlockedReasons = smartShoppingBlockReasons({
    totalDelta: itemsTotalVsReceiptTotalDelta,
    lostPossibleProductLines,
    sectionSubtotal,
    text,
    items: initialItems,
  });
  const items = applySmartShoppingGuard(
    initialItems,
    smartShoppingBlockedReasons,
  );
  const calculatedItemsSum = Number(
    items
      .reduce(
        (sum, item) =>
          sum + Number(item.total_price || item.price || item.unit_price || 0),
        0,
      )
      .toFixed(2),
  );
  const calculatedItemsSumBeforeFilter = Number(
    (calculatedItemsSum + sectionSubtotal.rejectedAmount).toFixed(2),
  );
  const qualitySummaryRaw = summarizeItemQuality(
    items,
    rejectedBeforeItemLimitLines,
  );
  const itemsQualityStatus = resolveItemsQualityStatus({
    items,
    qualitySummary: qualitySummaryRaw,
    smartShoppingBlockedReasons,
  });
  const qualitySummary = {
    ...qualitySummaryRaw,
    items_quality_status: itemsQualityStatus,
  };
  const budgetReliable = Boolean(storeName && purchaseDate && total);
  const budgetStatus = budgetReliable ? "reliable" : "needs_review";
  const smartShoppingSafe = Boolean(
    budgetReliable &&
    smartShoppingBlockedReasons.length === 0 &&
    qualitySummary.items_sent_to_smart_shopping_count > 0,
  );
  const scanStatusLegacy =
    exactDeclaredCount && storeName && total && purchaseDate
      ? "trusted"
      : "usable_review";
  const finalScanStatus = resolveFinalScanStatus({
    budgetStatus,
    itemsQualityStatus,
    smartShoppingSafe,
  });
  const displayedItemsDiagnostics = resolveDisplayedItemsDiagnostics({
    items,
    expectedItemsCount,
    expectedItemsSource: declaredEvidence.source,
    qualitySummary,
    itemsQualityStatus,
    smartShoppingSafe,
    finalScanStatus,
  });

  return {
    store_name: storeName,
    normalized_store_name: normalizeLocalMerchantName(storeName),
    store_location: detectLocalStoreLocation(text, storeName),
    purchase_date: purchaseDate,
    total_amount: total,
    total_needs_review: !total,
    total_source:
      trustedTotal.source ||
      (total ? "explicit_total_line" : "missing_or_unreliable"),
    total_raw_text: trustedTotal.raw || "",
    total_confidence: trustedTotal.confidence || (total ? 0.82 : 0),
    payment_method: detectPaymentMethod(trustedTotal.paymentRaw || ""),
    payment_total_value: trustedTotal.paymentAmount || null,
    payment_total_raw_text: trustedTotal.paymentRaw || "",
    total_payment_consistent: Boolean(trustedTotal.paymentConsistent),
    expected_items_count: expectedItemsCount || null,
    expected_items_min: expectedItemsCount || null,
    expected_items_source: expectedItemsCount
      ? declaredEvidence.source
      : "not_found",
    declared_items_count: expectedItemsCount || null,
    declared_items_raw_text: declaredEvidence.raw,
    items_count_status: expectedItemsCount ? "declared" : "unknown",
    calculated_items_sum_before_section_filter: calculatedItemsSumBeforeFilter,
    calculated_items_sum_after_section_filter: calculatedItemsSum,
    candidate_items_before_rejection:
      rawItems.length + sectionSubtotal.rejectedCount,
    rejected_before_item_limit_count: rejectedBeforeItemLimitLines.length,
    rejected_before_item_limit_lines: rejectedBeforeItemLimitLines,
    final_items_after_rejection: items.length,
    item_limit_applied_after_filtering: itemLimitAppliedAfterFiltering,
    lost_possible_product_lines: lostPossibleProductLines,
    section_subtotals_rejected_count: sectionSubtotal.rejectedCount,
    section_subtotals_rejected_amount: sectionSubtotal.rejectedAmount,
    section_subtotals_rejected: sectionSubtotal.rejected,
    section_subtotals_rejected_lines: sectionSubtotal.rejected.map(
      (row) => row.line,
    ),
    section_subtotals_probable_count: sectionSubtotal.probableCount,
    section_subtotals_probable_amount: sectionSubtotal.probableAmount,
    section_subtotals_probable: sectionSubtotal.probable,
    section_subtotals_probable_lines: sectionSubtotal.probable.map(
      (row) => row.line,
    ),
    rejected_section_subtotal_examples: [
      ...sectionSubtotal.rejected.map((row) => row.line),
      ...sectionSubtotal.probable.map((row) => row.line),
    ].slice(0, 8),
    items_kept_lines: items.map((item) =>
      String(item.ocr_name || item.name || ""),
    ),
    items_rejected_lines: rejectedBeforeItemLimitLines,
    items_total_vs_receipt_total_delta: itemsTotalVsReceiptTotalDelta,
    ...qualitySummary,
    ...displayedItemsDiagnostics,
    budget_reliable: budgetReliable,
    budget_status: budgetStatus,
    smart_shopping_safe: smartShoppingSafe,
    smart_shopping_blocked_reasons: smartShoppingBlockedReasons,
    final_scan_status: finalScanStatus,
    scan_status_legacy: scanStatusLegacy,
    ...textPresence,
    items,
  };
}

async function runOpenAiTextFallback(
  text: string,
  imageSize: Record<string, unknown>,
) {
  const apiKey = Deno.env.get("OPENAI_API_KEY") || "";
  if (!apiKey) {
    console.warn("[scan-receipt-ocr] openai_text_fallback_skipped", {
      reason: "OPENAI_API_KEY_missing",
      model: MODEL,
      image_size: imageSize,
    });
    return null;
  }

  const startedAt = performance.now();
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
  ].join("\n");

  const response = await fetchWithTimeout(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "Tu retournes uniquement du JSON valide.",
          },
          { role: "user", content: prompt },
        ],
      }),
    },
  );

  const bodyText = await response.text();
  console.info("[scan-receipt-ocr] openai_text_fallback_response", {
    http_status: response.status,
    model: MODEL,
    durationMs: Math.round(performance.now() - startedAt),
    body: bodyText,
    image_size: imageSize,
  });

  if (!response.ok) {
    return {
      error: true,
      status: response.status,
      message: bodyText,
      durationMs: Math.round(performance.now() - startedAt),
    };
  }

  let json: Record<string, unknown> = {};
  let content = "";
  let parsed: Record<string, unknown>;
  try {
    json = JSON.parse(bodyText);
    const choices = Array.isArray(json?.choices) ? json.choices : [];
    const firstChoice = (choices[0] || {}) as Record<string, unknown>;
    const message = (firstChoice.message || {}) as Record<string, unknown>;
    content = String(message.content || "{}");
  } catch (parseError) {
    return {
      error: true,
      status: 200,
      code: "OPENAI_TEXT_BODY_PARSE_FAILED",
      message: errorMessage(parseError),
      rawResponseBody: bodyText,
      rawContent: content,
      durationMs: Math.round(performance.now() - startedAt),
    };
  }

  try {
    parsed = JSON.parse(content);
  } catch (parseError) {
    return {
      error: true,
      status: 200,
      code: "OPENAI_TEXT_JSON_PARSE_FAILED",
      message: errorMessage(parseError),
      rawResponseBody: bodyText,
      rawContent: content,
      durationMs: Math.round(performance.now() - startedAt),
    };
  }

  let receipt;
  try {
    const textFallbackTotal = extractFinalTotalFromStructured(parsed, text);
    receipt = {
      store_name: String(
        parsed.merchant || parsed.store_name || detectLocalMerchant(text) || "",
      ).trim(),
      purchase_date:
        detectLocalDate(String(parsed.date || "")) || detectLocalDate(text),
      total_amount: textFallbackTotal,
      items: correctVisionItemsWithLocalPriceEvidence(
        normalizeOpenAiItems(Array.isArray(parsed.items) ? parsed.items : []),
        text,
        textFallbackTotal,
      ),
    };
  } catch (mappingError) {
    return {
      error: true,
      status: 200,
      code: "OPENAI_TEXT_MAPPING_FAILED",
      message: errorMessage(mappingError),
      rawResponseBody: bodyText,
      rawContent: content,
      durationMs: Math.round(performance.now() - startedAt),
    };
  }

  return {
    receipt,
    durationMs: Math.round(performance.now() - startedAt),
    inputTokens: json?.usage?.prompt_tokens ?? null,
    outputTokens: json?.usage?.completion_tokens ?? null,
  };
}


function compactReceiptOcrHint(text = "") {
  const lines = String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const important = lines.filter((line) => {
    const clean = normalizeText(line);
    const hasAmount = /\d+[,.]\d{2}/.test(line);
    const hasBarcode = /\b\d{8,14}\b/.test(line);
    const hasProductUnit = /\b\d+(?:[,.]\d+)?\s*(g|gr|kg|ml|cl|l)\b/i.test(line);
    const hasReceiptMarker = /(total|tui?al|carte bleue|reste a payer|net a payer|a payer|articles?|leader price|leclerc|carrefour|hyper u|super u|lidl|score|run market|jumbo|surgeles|epicerie|cremerie)/i.test(clean);
    return hasAmount || hasBarcode || hasProductUnit || hasReceiptMarker;
  });

  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const line of important) {
    const key = normalizeText(line).replace(/[^a-z0-9,. ]/g, " ").replace(/\s+/g, " ").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(line);
    if (deduped.length >= 35) break;
  }

  return deduped.join("\n").slice(0, 2600);
}

async function runOpenAiVisionFallback({
  imageBase64,
  mimeType,
  imageSize,
  hintText = "",
}: {
  imageBase64: string;
  mimeType: string;
  imageSize: Record<string, unknown>;
  hintText?: string;
}) {
  const apiKey = Deno.env.get("OPENAI_API_KEY") || "";
  if (!apiKey) {
    console.warn("[scan-receipt-ocr] openai_vision_fallback_skipped", {
      reason: "OPENAI_API_KEY_missing",
      model: MODEL,
      image_size: imageSize,
    });
    return null;
  }

  const startedAt = performance.now();
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
    hintText
      ? `Indice OCR local nettoye et reduit, a utiliser seulement pour confirmer les lignes visibles :
${compactReceiptOcrHint(hintText)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const response = await fetchWithTimeout(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "Tu retournes uniquement du JSON valide.",
          },
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
    },
  );

  const bodyText = await response.text();
  console.info("[scan-receipt-ocr] openai_vision_fallback_response", {
    http_status: response.status,
    model: MODEL,
    durationMs: Math.round(performance.now() - startedAt),
    body: bodyText,
    image_size: imageSize,
  });

  if (!response.ok) {
    return {
      error: true,
      status: response.status,
      message: bodyText,
      durationMs: Math.round(performance.now() - startedAt),
    };
  }

  let json: Record<string, unknown> = {};
  let content = "";
  let parsed: Record<string, unknown>;
  try {
    json = JSON.parse(bodyText);
    const choices = Array.isArray(json?.choices) ? json.choices : [];
    const firstChoice = (choices[0] || {}) as Record<string, unknown>;
    const message = (firstChoice.message || {}) as Record<string, unknown>;
    content = String(message.content || "{}");
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
    };
  }

  try {
    parsed = JSON.parse(content);
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
    };
  }

  let receipt;
  try {
    const dateCandidate = String(parsed.date || parsed.purchase_date || "");
    const totalEvidence = resolveTrustedTotal(parsed, hintText);
    const localStore = detectLocalMerchant(hintText);
    const storeName = cleanStoreCandidate(
      String(
        parsed.store_name ||
          parsed.merchant ||
          parsed.normalized_store_name ||
          "",
      ),
      localStore,
    );
    receipt = {
      store_name: storeName || "Enseigne a verifier",
      normalized_store_name: normalizeLocalMerchantName(storeName),
      store_location: detectLocalStoreLocation(hintText, storeName),
      purchase_date:
        detectLocalDate(dateCandidate) || detectLocalDate(hintText),
      total_amount: totalEvidence.amount,
      openai_total_value: totalEvidence.openaiTotalValue,
      openai_total_raw_text: totalEvidence.openaiTotalRawText,
      openai_total_confidence: totalEvidence.openaiTotalConfidence,
      total_raw_text_verified_against_ocr:
        totalEvidence.totalRawTextVerifiedAgainstOcr,
      total_rejected_reason: totalEvidence.rejectedReason,
      total_raw_text: totalEvidence.rawText,
      total_confidence: totalEvidence.confidence,
      total_needs_review: totalEvidence.amount <= 0,
      total_source: totalEvidence.source,
      items: correctVisionItemsWithLocalPriceEvidence(
        normalizeOpenAiItems(Array.isArray(parsed.items) ? parsed.items : []),
        hintText,
        totalEvidence.amount,
      ),
      needs_review: Boolean(parsed.needs_review),
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
    };
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
    };
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
  };
}

function isLikelyFoodTicket(
  receipt: { store_name?: string; items?: Record<string, unknown>[] },
  text = "",
) {
  const clean = normalizeText(
    [
      receipt.store_name || "",
      text,
      ...(receipt.items || []).flatMap((item) => [
        item.name,
        item.ocr_name,
        item.category,
      ]),
    ].join(" "),
  );

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
  ].some((keyword) => clean.includes(keyword));
}

function countOcrLines(text = "") {
  return String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean).length;
}

function expectedItemsForFoodTicket(text = "") {
  const declaredCount = getDeclaredItemsCount(text);
  if (declaredCount) return declaredCount;
  return 0;
}

function getDeclaredItemsCount(text = "") {
  return extractDeclaredItemsCount(text);
}

function getDeclaredItemsEvidence(text = "") {
  return extractDeclaredItemsEvidence(text);
}

function normalizeDeclaredItemsEvidence(candidate: {
  count?: unknown;
  raw?: unknown;
  source?: unknown;
}) {
  const raw = String(candidate.raw || "").trim();
  if (!raw) return { count: 0, raw: "", source: "missing" };

  const evidence = extractDeclaredItemsEvidence(raw);
  const count = Number(candidate.count || evidence.count || 0);
  if (!evidence.count || (count > 0 && evidence.count !== count)) {
    return { count: 0, raw: "", source: "missing" };
  }

  return {
    count: evidence.count,
    raw: evidence.raw || raw,
    source: evidence.source,
  };
}

function pickBestItems(...lists: Record<string, unknown>[][]) {
  return lists.reduce<Record<string, unknown>[]>((best, list) => {
    return list.length > best.length ? list : best;
  }, []);
}

function reliableItemsCount(items: Record<string, unknown>[] = []) {
  return items.filter((item) => {
    const status = String(item.review_status || item.item_status || "");
    return (
      status === "trusted" ||
      status === "detected" ||
      status === "user_validated"
    );
  }).length;
}

function needsReviewItemsCount(items: Record<string, unknown>[] = []) {
  return items.filter((item) => {
    const status = String(item.review_status || item.item_status || "");
    return (
      Boolean(item.needs_review) ||
      status === "needs_review" ||
      status === "a_verifier"
    );
  }).length;
}

function sumReceiptItems(items: Record<string, unknown>[] = []) {
  const total = (items || []).reduce((sum, item) => {
    return (
      sum +
      numericTotal(item.total_price) +
      (numericTotal(item.total_price)
        ? 0
        : numericTotal(item.price) || numericTotal(item.unit_price))
    );
  }, 0);
  return Number(total.toFixed(2));
}

function classifyLongTicketScanStatus({
  totalAmount,
  reliableCount,
  expectedItemsMin,
  improved,
}: {
  totalAmount: number;
  reliableCount: number;
  expectedItemsMin: number;
  improved: boolean;
}) {
  if (expectedItemsMin <= 0) {
    return "long_manual_review";
  }

  if (expectedItemsMin < 15) {
    return totalAmount > 0 && reliableCount >= 3
      ? "usable_review"
      : improved
        ? "usable_review"
        : "manual_review_required";
  }

  const recoveryRatio =
    expectedItemsMin > 0 ? reliableCount / expectedItemsMin : 0;
  if (totalAmount > 0 && recoveryRatio >= 0.85) return "long_trusted";
  if (recoveryRatio >= 0.4) return "long_usable_review";
  return "long_manual_review";
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
  ].join("\n");

  if (segment === "top") {
    return [
      "Tu analyses uniquement la zone haute d'un ticket de caisse.",
      "Objectif: magasin, magasin normalise, localisation, date, heure et premieres lignes articles seulement si visibles.",
      '{"segment":"top","store_name":"","normalized_store_name":"","store_location":"","date":"","time":"","items":[],"warnings":[]}',
      commonRules,
      "Ne cherche pas le total final dans cette zone sauf s'il est clairement visible.",
    ].join("\n");
  }

  if (segment === "bottom") {
    return [
      "Tu analyses uniquement la zone basse d'un ticket de caisse.",
      "Objectif: derniers articles, nombre d'articles, total final fiable, reste a payer, net a payer, paiement.",
      '{"segment":"bottom","items":[],"printed_items_count":null,"total":null,"total_raw_text":"","total_confidence":0,"total_source":"","payment_method":"","payment_total":null,"payment_raw_text":"","payment_confidence":0,"warnings":[]}',
      commonRules,
      "Le total final doit etre extrait uniquement si une ligne claire est visible.",
      "Priorite total: RESTE A PAYER, NET A PAYER, A PAYER, TOTAL.",
      "Ne jamais utiliser Total X articles comme montant.",
      "Si aucune ligne TOTAL/RESTE A PAYER lisible n'est visible, la ligne paiement final CARTE BLEUE/CB/ESPECES peut confirmer le total uniquement si elle est claire, en bas du ticket, et si le montant est lisible.",
      'Si tu utilises la ligne paiement final comme preuve, renseigne aussi payment_total, payment_raw_text et total_source:"payment_total_line".',
      "Ne jamais utiliser une ligne CB/carte bleue illisible, tronquee ou sans montant complet comme preuve de total.",
      'Si aucune preuve de total ou paiement final clair n est visible: total:null, total_confidence:0, total_source:"missing_or_unreliable".',
    ].join("\n");
  }

  return [
    "Tu analyses uniquement la zone centrale d'un ticket de caisse.",
    "Cette zone contient principalement des articles.",
    '{"segment":"middle","items":[],"warnings":[]}',
    commonRules,
    "Extrais les lignes articles visibles, meme imparfaites.",
  ].join("\n");
}

function declaredItemsEvidenceFromParsed(parsed: Record<string, unknown>) {
  const fromRawText = extractDeclaredItemsEvidence(
    [
      parsed.printed_items_raw_text,
      parsed.declared_items_raw_text,
      parsed.items_count_raw_text,
      parsed.total_raw_text,
      parsed.total_source_line,
      parsed.raw_total_text,
    ]
      .filter(Boolean)
      .join("\n"),
  );
  return fromRawText.count
    ? fromRawText
    : { count: 0, raw: "", source: "missing" };
}

function isDueTotalLabel(line = "") {
  const clean = normalizeText(line);
  return (
    clean.includes("reste a payer") ||
    clean.includes("net a payer") ||
    /\ba payer\b/.test(clean) ||
    clean.includes("solde a payer")
  );
}

function isTrustedPaymentTotalLabel(line = "") {
  const clean = normalizeText(line)
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return (
    clean.includes("carte bleue") ||
    clean.includes("corte bleue") ||
    clean.includes("carte bancaire") ||
    /\bcb\b/.test(clean) ||
    clean.includes("visa") ||
    clean.includes("mastercard") ||
    clean.includes("especes") ||
    clean.includes("espece") ||
    clean.includes("cash")
  );
}

function resolveSegmentTotal(parsed: Record<string, unknown>) {
  const amount =
    numericTotal(parsed.total) || numericTotal(parsed.total_amount);
  const rawText = String(
    parsed.total_raw_text || parsed.total_source_line || "",
  ).trim();
  const confidence = confidence01(parsed.total_confidence);
  const paymentAmount =
    numericTotal(parsed.payment_total) || numericTotal(parsed.payment_amount);
  const paymentRawText = String(
    parsed.payment_raw_text || parsed.payment_source_line || "",
  ).trim();
  const paymentConfidence = confidence01(
    parsed.payment_confidence ?? parsed.total_confidence ?? 0,
  );
  const dueLine = isDueTotalLabel(rawText);
  const totalLine =
    /\btotal\b/i.test(normalizeText(rawText)) &&
    !isArticleCountTotalLine(rawText);
  const paymentLine = isTrustedPaymentTotalLabel(rawText);

  if (
    amount > 0 &&
    rawText &&
    isTrustedTotalLabel(rawText) &&
    !isArticleCountTotalLine(rawText)
  ) {
    if (dueLine && confidence >= 0.7) {
      return {
        amount,
        rawText,
        confidence,
        source: "split_bottom_due_total_line",
        rejectedReason: "",
      };
    }

    if (totalLine && confidence >= 0.85) {
      return {
        amount,
        rawText,
        confidence,
        source: "split_bottom_total_line",
        rejectedReason: "",
      };
    }

    return {
      amount: 0,
      rawText,
      confidence,
      source: "missing_or_unreliable",
      rejectedReason: "total_line_not_proven",
    };
  }

  if (amount > 0 && rawText && paymentLine && confidence >= 0.85) {
    return {
      amount,
      rawText,
      confidence,
      source: "split_bottom_payment_total_line",
      rejectedReason: "",
    };
  }

  if (
    paymentAmount > 0 &&
    paymentRawText &&
    isTrustedPaymentTotalLabel(paymentRawText) &&
    paymentConfidence >= 0.85
  ) {
    return {
      amount: paymentAmount,
      rawText: paymentRawText,
      confidence: paymentConfidence,
      source: "split_bottom_payment_total_line",
      rejectedReason: "",
    };
  }

  return {
    amount: 0,
    rawText: rawText || paymentRawText,
    confidence: Math.max(confidence, paymentConfidence),
    source: "missing_or_unreliable",
    rejectedReason:
      rawText || paymentRawText ? "total_line_not_proven" : "total_missing",
  };
}

function segmentOcrHint(text = "", segment = "") {
  const lines = String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return "";
  const maxLines = 18;
  if (segment === "top")
    return lines.slice(0, maxLines).join("\n").slice(0, 1200);
  if (segment === "bottom")
    return lines.slice(-maxLines).join("\n").slice(0, 1200);
  const start = Math.max(
    0,
    Math.floor(lines.length / 2) - Math.floor(maxLines / 2),
  );
  return lines
    .slice(start, start + maxLines)
    .join("\n")
    .slice(0, 1200);
}

async function runOpenAiVisionSegment({
  segment,
  imageBase64,
  mimeType,
  imageSize,
  hintText = "",
  expectedItemsMin = 0,
}: {
  segment: string;
  imageBase64: string;
  mimeType: string;
  imageSize: Record<string, unknown>;
  hintText?: string;
  expectedItemsMin?: number;
}) {
  const apiKey = Deno.env.get("OPENAI_API_KEY") || "";
  if (!apiKey) return null;

  const startedAt = performance.now();
  const prompt = [
    buildSegmentPrompt(segment),
    hintText
      ? `Indice OCR local limite a cette zone, secondaire:\n${hintText.slice(0, 1200)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const response = await fetchWithTimeout(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "Tu retournes uniquement du JSON valide.",
          },
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
    },
  );

  const bodyText = await response.text();
  console.info("[scan-receipt-ocr] openai_split_segment_response", {
    segment,
    http_status: response.status,
    model: MODEL,
    durationMs: Math.round(performance.now() - startedAt),
    body: bodyText,
    image_size: imageSize,
  });

  if (!response.ok) {
    return {
      error: true,
      segment,
      status: response.status,
      message: bodyText,
      durationMs: Math.round(performance.now() - startedAt),
    };
  }

  let json: Record<string, unknown> = {};
  let content = "";
  let parsed: Record<string, unknown> = {};
  try {
    json = JSON.parse(bodyText);
    const choices = Array.isArray(json?.choices) ? json.choices : [];
    const firstChoice = (choices[0] || {}) as Record<string, unknown>;
    const message = (firstChoice.message || {}) as Record<string, unknown>;
    content = String(message.content || "{}");
    parsed = JSON.parse(content);
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
    };
  }

  const declaredEvidence = declaredItemsEvidenceFromParsed(parsed);
  const segmentExpectedItemsMin = Math.max(
    Number(expectedItemsMin || 0),
    Number(declaredEvidence.count || 0),
  );
  const totalEvidence =
    segment === "bottom"
      ? resolveSegmentTotal(parsed)
      : {
          amount: 0,
          rawText: "",
          confidence: 0,
          source: "missing_or_unreliable",
          rejectedReason: "",
        };
  const items = normalizeOpenAiItems(
    Array.isArray(parsed.items) ? parsed.items : [],
  ).map((item) => ({
    ...item,
    segment_source: segment,
    raw_text: String(item.raw_text || item.source_line || item.name || ""),
    review_status:
      item.review_status ||
      (item.needs_review ? "needs_review" : item.item_status || "detected"),
    rejection_reason: "",
  }));
  const storeName = cleanStoreCandidate(
    String(parsed.store_name || parsed.normalized_store_name || ""),
  );
  const reliableCount = reliableItemsCount(items);
  const reviewCount = needsReviewItemsCount(items);
  const rawItemsCount = Array.isArray(parsed.items) ? parsed.items.length : 0;
  return {
    segment,
    parsed,
    segment_status: items.length ? "success" : "empty",
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
      total_rejected_reason: totalEvidence.rejectedReason || "",
      total_raw_text_verified_against_ocr: false,
      expected_items_count: declaredEvidence.count || null,
      expected_items_min: segmentExpectedItemsMin || null,
      expected_items_source: declaredEvidence.count
        ? declaredEvidence.source
        : "not_found",
      declared_items_count: declaredEvidence.count || null,
      declared_items_raw_text: declaredEvidence.raw,
      items,
      warnings: Array.isArray(parsed.warnings)
        ? parsed.warnings.map(String)
        : [],
    },
    durationMs: Math.round(performance.now() - startedAt),
    inputTokens: json?.usage?.prompt_tokens ?? null,
    outputTokens: json?.usage?.completion_tokens ?? null,
    prompt,
    rawContent: content,
    rawResponseBody: bodyText,
    imageSize,
    rawItemsCount,
    reliableItemsCount: reliableCount,
    needsReviewItemsCount: reviewCount,
    rejectedItemsCount: Math.max(0, rawItemsCount - items.length),
    declaredItemsCount: declaredEvidence.count || null,
    declaredItemsRawText: declaredEvidence.raw,
    expectedItemsMin: segmentExpectedItemsMin || null,
  };
}

function itemDedupKey(item: Record<string, unknown>) {
  return normalizeText(
    String(item.raw_text || item.source_line || item.name || ""),
  )
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractMoneyCandidates(value = "") {
  return Array.from(
    String(value || "").matchAll(/(-?\d+(?:\s?\d{3})*[,.]\d{2})/g),
  )
    .map((match) =>
      Number(
        String(match[1] || "")
          .replace(/\s/g, "")
          .replace(",", "."),
      ),
    )
    .filter((amount) => Number.isFinite(amount) && amount > 0);
}

function isPrimaryOpenAiAmountOnlyTotal(rawText = "", amount = 0) {
  const compact = String(rawText || "").trim();
  if (!compact || amount <= 0) return false;
  if (isArticleCountTotalLine(compact)) return false;

  const values = extractMoneyCandidates(compact);
  const hasSameAmount = values.some(
    (value) => Math.abs(value - amount) <= 0.05,
  );
  if (!hasSameAmount) return false;

  const normalized = normalizeText(compact)
    .replace(/[^a-z0-9., ]/g, " ")
    .replace(/\b(eur|euro|euros)\b/g, " ")
    .replace(/\b(cur|bur)\b/g, " ")
    .replace(/[0-9]+[,.][0-9]{2}/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized.length === 0;
}

function isReliablePrimaryOpenAiTotal(receipt: Record<string, unknown>) {
  const openAiAmount = numericTotal(receipt.openai_total_value);
  const amount = openAiAmount || numericTotal(receipt.total_amount);
  if (amount <= 0) return false;

  const confidence = confidence01(
    receipt.openai_total_confidence ?? receipt.total_confidence ?? 0,
  );
  const rawText = String(
    receipt.openai_total_raw_text || receipt.total_raw_text || "",
  ).trim();
  if (confidence < 0.85) return false;
  if (!rawText || isArticleCountTotalLine(rawText)) return false;

  // IMPORTANT: openai_total_value is already an explicit structured field from the
  // primary Vision pass. Sometimes OpenAI returns raw text as only "18.39 EUR"
  // instead of "TOTAL 18.39 EUR". The split retry must not erase that reliable
  // primary total just because the label word is absent from raw_text.
  if (
    openAiAmount > 0 &&
    isPrimaryOpenAiAmountOnlyTotal(rawText, openAiAmount)
  ) {
    return true;
  }

  return isTrustedTotalLabel(rawText);
}

function primaryOpenAiTotalEvidence(receipt: Record<string, unknown>) {
  if (!isReliablePrimaryOpenAiTotal(receipt)) {
    return { amount: 0, rawText: "", confidence: 0, source: "" };
  }

  return {
    amount:
      numericTotal(receipt.openai_total_value) ||
      numericTotal(receipt.total_amount),
    rawText: String(
      receipt.openai_total_raw_text || receipt.total_raw_text || "",
    ).trim(),
    confidence: confidence01(
      receipt.openai_total_confidence ?? receipt.total_confidence ?? 0,
    ),
    source: "openai_primary_total_preserved",
  };
}

function primaryVisionCanStopBeforeSplit({
  receipt,
  visionItemsCount,
  reliableItemsCount,
  expectedItemsMin,
}: {
  receipt: Record<string, unknown>;
  visionItemsCount: number;
  reliableItemsCount: number;
  expectedItemsMin: number;
}) {
  const totalEvidence = primaryOpenAiTotalEvidence(receipt);
  if (totalEvidence.amount <= 0) return false;
  if (!String(receipt.store_name || "").trim()) return false;
  if (!String(receipt.purchase_date || "").trim()) return false;

  // Split is expensive and can reintroduce duplicated/noisy lines on short tickets.
  // For long tickets, keep split because item coverage matters more.
  if (expectedItemsMin >= 15) return false;

  // Short grocery ticket: a reliable primary total + several reliable items is enough
  // for budget registration. Articles may still remain review-only for smart shopping.
  return reliableItemsCount >= 5 || visionItemsCount >= 5;
}

function mergeSplitReceiptResults(
  splitResults: Record<string, unknown>[],
  baseReceipt: Record<string, unknown> & {
    items?: Record<string, unknown>[];
    warnings?: unknown[];
  },
  expectedItemsMin: number,
  options: { imageQualityWarning?: boolean } = {},
) {
  const validResults = splitResults.filter(
    (result) => result && !("error" in result),
  );
  const receipts = validResults.map(
    (result) =>
      (result.receipt || {}) as Record<string, unknown> & {
        items?: Record<string, unknown>[];
        warnings?: unknown[];
      },
  );
  const warnings = [
    ...(Array.isArray(baseReceipt.warnings)
      ? baseReceipt.warnings.map(String)
      : []),
    ...receipts.flatMap((receipt) =>
      Array.isArray(receipt.warnings) ? receipt.warnings.map(String) : [],
    ),
  ];
  const byKey = new Map<string, Record<string, unknown>>();

  for (const item of receipts.flatMap((receipt) =>
    Array.isArray(receipt.items) ? receipt.items : [],
  )) {
    const key = itemDedupKey(item);
    if (!key) continue;
    const current = byKey.get(key);
    if (
      !current ||
      Number(item.confidence_score || 0) >
        Number(current.confidence_score || 0) ||
      String(item.raw_text || "").length > String(current.raw_text || "").length
    ) {
      byKey.set(key, item);
    }
  }

  const items = Array.from(byKey.values());
  const declaredEvidenceCandidates = [
    {
      count: Number(
        baseReceipt.expected_items_count ||
          baseReceipt.declared_items_count ||
          0,
      ),
      raw: String(baseReceipt.declared_items_raw_text || ""),
      source: String(baseReceipt.expected_items_source || ""),
    },
    ...validResults.map((result) => ({
      count: Number(
        result.declaredItemsCount ||
          ((result.receipt || {}) as Record<string, unknown>)
            .declared_items_count ||
          0,
      ),
      raw: String(
        result.declaredItemsRawText ||
          ((result.receipt || {}) as Record<string, unknown>)
            .declared_items_raw_text ||
          "",
      ),
      source: String(
        ((result.receipt || {}) as Record<string, unknown>)
          .expected_items_source || "",
      ),
    })),
  ]
    .map(normalizeDeclaredItemsEvidence)
    .filter((candidate) => candidate.count > 0);
  const bestDeclaredEvidence = declaredEvidenceCandidates.sort(
    (a, b) => b.count - a.count,
  )[0] || { count: 0, raw: "", source: "missing" };
  const effectiveExpectedItemsMin =
    bestDeclaredEvidence.count || Number(expectedItemsMin || 0);
  const bottomReceipt = receipts.find(
    (receipt) =>
      Number(receipt.total_amount || 0) > 0 &&
      String(receipt.total_source || "").includes("split_bottom"),
  );
  const detectedTotalAmount = Number(bottomReceipt?.total_amount || 0);
  const primaryTotal = primaryOpenAiTotalEvidence(baseReceipt);
  const splitTotalContradictsPrimary =
    detectedTotalAmount > 0 &&
    primaryTotal.amount > 0 &&
    Math.abs(detectedTotalAmount - primaryTotal.amount) > 0.05;
  const preservedPrimaryTotalAmount =
    detectedTotalAmount <= 0 && !splitTotalContradictsPrimary
      ? primaryTotal.amount
      : 0;
  const rawItemsCount = items.length;
  const reliableCount = reliableItemsCount(items);
  const improved =
    rawItemsCount >
    (Array.isArray(baseReceipt.items) ? baseReceipt.items.length : 0);
  const totalBlockedByQuality = Boolean(
    options.imageQualityWarning &&
    effectiveExpectedItemsMin >= 20 &&
    (detectedTotalAmount > 0 || preservedPrimaryTotalAmount > 0),
  );
  const totalAmount = totalBlockedByQuality
    ? 0
    : detectedTotalAmount || preservedPrimaryTotalAmount;
  const totalSource = totalAmount
    ? detectedTotalAmount > 0
      ? "split_bottom_total_line"
      : "openai_primary_total_preserved"
    : "missing_or_unreliable";
  const totalRawText = totalAmount
    ? detectedTotalAmount > 0
      ? String(bottomReceipt?.total_raw_text || "")
      : primaryTotal.rawText
    : "";
  const totalConfidence = totalAmount
    ? detectedTotalAmount > 0
      ? Number(bottomReceipt?.total_confidence || 0)
      : primaryTotal.confidence
    : 0;
  const scanStatus = classifyLongTicketScanStatus({
    totalAmount,
    reliableCount,
    expectedItemsMin: effectiveExpectedItemsMin,
    improved,
  });
  const baseStore = cleanStoreCandidate(String(baseReceipt.store_name || ""));
  const splitStore = cleanStoreCandidate(
    String(receipts.find((receipt) => receipt.store_name)?.store_name || ""),
  );
  const finalStore = baseStore || splitStore || "Enseigne a verifier";
  const finalNormalizedStore =
    normalizeLocalMerchantName(finalStore) ||
    cleanStoreCandidate(String(baseReceipt.normalized_store_name || "")) ||
    normalizeLocalMerchantName(splitStore);
  const finalStoreLocation =
    String(baseReceipt.store_location || "") ||
    detectLocalStoreLocation("", finalStore) ||
    String(
      receipts.find((receipt) => receipt.store_location)?.store_location || "",
    );

  return {
    receipt: {
      ...baseReceipt,
      store_name: finalStore,
      normalized_store_name: finalNormalizedStore,
      store_location: finalStoreLocation,
      purchase_date: String(
        receipts.find((receipt) => receipt.purchase_date)?.purchase_date ||
          baseReceipt.purchase_date ||
          "",
      ),
      total_amount: totalAmount || null,
      total_raw_text: totalRawText,
      total_confidence: totalConfidence,
      total_needs_review: totalAmount <= 0,
      total_source: totalSource,
      total_rejected_reason: totalAmount
        ? ""
        : totalBlockedByQuality
          ? "low_image_quality_total_not_auto_trusted"
          : "split_total_missing_or_unreliable",
      total_raw_text_verified_against_ocr: false,
      total_verified_against_segment_text: detectedTotalAmount > 0,
      total_preserved_from_openai_primary: preservedPrimaryTotalAmount > 0,
      expected_items_count:
        bestDeclaredEvidence.count || baseReceipt.expected_items_count || null,
      expected_items_min: effectiveExpectedItemsMin || null,
      expected_items_source: bestDeclaredEvidence.count
        ? bestDeclaredEvidence.source
        : "not_found",
      declared_items_count: bestDeclaredEvidence.count || null,
      declared_items_raw_text: bestDeclaredEvidence.raw || "",
      items_count_status: bestDeclaredEvidence.count ? "declared" : "unknown",
      estimated_items_sum: totalAmount ? null : sumReceiptItems(items),
      items,
      warnings: totalAmount
        ? warnings
        : [
            ...warnings,
            "Total non lu avec certitude. Verification manuelle necessaire.",
          ],
      needs_review: scanStatus !== "trusted",
    },
    scanStatus,
    rawItemsCount,
    reliableItemsCount: reliableCount,
    expectedItemsMin: effectiveExpectedItemsMin,
    declaredItemsCount: bestDeclaredEvidence.count || null,
    declaredItemsRawText: bestDeclaredEvidence.raw || "",
    expectedItemsSource: bestDeclaredEvidence.count
      ? bestDeclaredEvidence.source
      : "not_found",
    splitTotalValue: detectedTotalAmount || null,
    splitTotalRawText: detectedTotalAmount
      ? String(bottomReceipt?.total_raw_text || "")
      : "",
    splitTotalConfidence: detectedTotalAmount
      ? Number(bottomReceipt?.total_confidence || 0)
      : 0,
    preservedPrimaryTotalValue: preservedPrimaryTotalAmount || null,
    preservedPrimaryTotalRawText: preservedPrimaryTotalAmount
      ? primaryTotal.rawText
      : "",
    preservedPrimaryTotalConfidence: preservedPrimaryTotalAmount
      ? primaryTotal.confidence
      : 0,
    improved,
  };
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
  isPremiumPlus: boolean;
  scanStatus: string;
  totalNeedsReview: boolean;
  expectedItemsMin: number;
  reliableItemsDetected: number;
  confidence: number;
  imageSize: Record<string, unknown>;
}) {
  // V4.1 — règle scanner stricte :
  // sur un petit ticket alimentaire avec un nombre d'articles imprimé,
  // on ne lance jamais le split automatique.
  // Le split 3 segments coûte cher et peut mélanger les lignes articles.
  // La stratégie devient : Vision primary seule ; si timeout/échec,
  // budget conservé si fiable, articles à vérifier, puis relance utilisateur.
  if (expectedItemsMin > 0 && expectedItemsMin <= 10) return false;
  if (!ENABLE_SPLIT_RETRY || !isPremiumPlus) return false;
  if (
    [
      "partial_low_items",
      "partial_unreliable",
      "manual_review_required",
      "low_confidence",
      "needs_review",
    ].includes(scanStatus)
  )
    return true;
  if (totalNeedsReview) return true;
  if (expectedItemsMin >= 15 && reliableItemsDetected < expectedItemsMin * 0.6)
    return true;
  if (reliableItemsDetected === 0) return true;
  if (confidence < 60) return true;
  const height = Number(
    imageSize.optimized_image_height || imageSize.height || 0,
  );
  const width = Number(imageSize.optimized_image_width || imageSize.width || 0);
  return height > 1800 || (height > 0 && width > 0 && height / width > 2.8);
}

function splitRetrySkippedReason({
  isPremiumPlus,
  segmentsCount,
  scanAlreadyTrusted = false,
  technicalError = "",
}: {
  isPremiumPlus: boolean;
  segmentsCount: number;
  scanAlreadyTrusted?: boolean;
  technicalError?: string;
}) {
  if (!ENABLE_SPLIT_RETRY) return "split_disabled";
  if (!isPremiumPlus) return "not_premium_plus";
  if (segmentsCount < 3) return "segments_missing";
  if (scanAlreadyTrusted) return "scan_already_trusted";
  if (technicalError) return "technical_error";
  return "";
}

async function runSplitRetry({
  imageSegments,
  browserText,
  baseReceipt,
  expectedItemsMin,
  imageQualityWarning = false,
}: {
  imageSegments: Record<string, unknown>[];
  browserText: string;
  baseReceipt: Record<string, unknown> & {
    items?: Record<string, unknown>[];
    warnings?: unknown[];
  };
  expectedItemsMin: number;
  imageQualityWarning?: boolean;
}) {
  const usableSegments = (Array.isArray(imageSegments) ? imageSegments : [])
    .filter(
      (segment) =>
        segment?.imageBase64 && segment?.mimeType && segment?.segment,
    )
    .slice(0, 3);

  if (usableSegments.length < 3) {
    return {
      error: true,
      message: "split_segments_missing",
      splitResults: [],
    };
  }

  const splitResults = [];
  for (const segment of usableSegments) {
    const segmentStartedAt = performance.now();
    const segmentName = String(segment.segment);
    const segmentImageSize = {
      width: segment.width ?? null,
      height: segment.height ?? null,
      yStartPercent: segment.yStartPercent ?? null,
      yEndPercent: segment.yEndPercent ?? null,
      overlapPercent: segment.overlapPercent ?? null,
      base64Size: String(segment.imageBase64 || "").length,
      estimatedBytes: segment.estimatedBytes ?? null,
    };

    try {
      const result = await runOpenAiVisionSegment({
        segment: segmentName,
        imageBase64: String(segment.imageBase64),
        mimeType: String(segment.mimeType || "image/jpeg"),
        imageSize: segmentImageSize,
        hintText: segmentOcrHint(browserText, segmentName),
        expectedItemsMin,
      });
      if (result) splitResults.push(result as Record<string, unknown>);
    } catch (segmentError) {
      const message = errorMessage(segmentError);
      splitResults.push({
        error: true,
        segment: segmentName,
        segment_status: message.toLowerCase().includes("timeout")
          ? "timeout"
          : "technical_error",
        message,
        durationMs: Math.round(performance.now() - segmentStartedAt),
        imageSize: segmentImageSize,
        rawItemsCount: 0,
        reliableItemsCount: 0,
        needsReviewItemsCount: 0,
        rejectedItemsCount: 0,
        warnings: ["Segment non exploitable."],
      });
    }
  }

  const merged = mergeSplitReceiptResults(
    splitResults,
    baseReceipt,
    expectedItemsMin,
    { imageQualityWarning },
  );
  return {
    error: false,
    splitResults,
    merged,
  };
}

function summarizeSplitSegmentResult(
  result: Record<string, unknown>,
  index = 0,
) {
  const receipt = (result.receipt || {}) as Record<string, unknown> & {
    items?: Record<string, unknown>[];
    warnings?: unknown[];
  };
  const items = Array.isArray(receipt.items) ? receipt.items : [];
  const imageSize = (result.imageSize || {}) as Record<string, unknown>;
  const rawItemsCount = Number(result.rawItemsCount || items.length || 0);
  const reliableCount = Number(
    result.reliableItemsCount ?? reliableItemsCount(items),
  );
  const reviewCount = Number(
    result.needsReviewItemsCount ?? needsReviewItemsCount(items),
  );
  const segmentStatus = String(
    result.segment_status ||
      (result.error ? "parse_error" : items.length ? "success" : "empty"),
  );
  const errorMessageText = String(result.message || result.error_message || "");

  return {
    segment_index: index,
    segment: result.segment,
    segment_name: result.segment,
    image_width: Number(imageSize.width || 0) || null,
    image_height: Number(imageSize.height || 0) || null,
    base64_size: Number(imageSize.base64Size || 0) || null,
    estimated_bytes: Number(imageSize.estimatedBytes || 0) || null,
    input_tokens: result.inputTokens ?? null,
    output_tokens: result.outputTokens ?? null,
    duration_ms: Number(result.durationMs || 0) || null,
    status: segmentStatus,
    raw_items_count: rawItemsCount,
    reliable_items_count: reliableCount,
    declared_items_count:
      Number(result.declaredItemsCount || receipt.declared_items_count || 0) ||
      null,
    declared_items_raw_text: String(
      result.declaredItemsRawText || receipt.declared_items_raw_text || "",
    ),
    needs_review_items_count: reviewCount,
    rejected_items_count:
      Number(
        result.rejectedItemsCount ??
          Math.max(0, rawItemsCount - reliableCount - reviewCount),
      ) || 0,
    first_items_names: items
      .slice(0, 5)
      .map((item) => String(item.name || item.ocr_name || ""))
      .filter(Boolean),
    total_found: Number(receipt.total_amount || 0) > 0,
    warnings: Array.isArray(receipt.warnings)
      ? receipt.warnings
      : Array.isArray(result.warnings)
        ? result.warnings
        : [],
    error_message: errorMessageText,
    segment_quality_score: Math.min(
      100,
      Math.round(
        (Number(imageSize.width || 0) * Number(imageSize.height || 0)) / 18000,
      ),
    ),
  };
}

function buildSplitDiagnostics({
  splitResults,
  expectedItemsMin,
  reliableItemsDetectedBySplit,
}: {
  splitResults: Record<string, unknown>[];
  expectedItemsMin: number;
  reliableItemsDetectedBySplit: number;
}) {
  const segmentDiagnostics = (splitResults || []).map((result, index) =>
    summarizeSplitSegmentResult(result, index),
  );
  const successCount = segmentDiagnostics.filter(
    (segment) => segment.status === "success",
  ).length;
  const timeoutCount = segmentDiagnostics.filter(
    (segment) => segment.status === "timeout",
  ).length;
  const rawItems = segmentDiagnostics.reduce(
    (sum, segment) => sum + Number(segment.raw_items_count || 0),
    0,
  );
  const inputTokens = (splitResults || []).reduce(
    (sum, result) => sum + Number(result.inputTokens || 0),
    0,
  );
  const outputTokens = (splitResults || []).reduce(
    (sum, result) => sum + Number(result.outputTokens || 0),
    0,
  );
  const durationMs = (splitResults || []).reduce(
    (sum, result) => sum + Number(result.durationMs || 0),
    0,
  );
  const recoveryRatioRaw =
    expectedItemsMin > 0
      ? reliableItemsDetectedBySplit / expectedItemsMin
      : null;
  const recoveryRatio =
    recoveryRatioRaw === null
      ? null
      : Number(Math.min(1, recoveryRatioRaw).toFixed(2));
  const recoveryRatioStatus =
    expectedItemsMin > 0 ? "computed" : "unknown_expected_items";
  const expectedItemsMinIsProven = expectedItemsMin > 0;
  const splitFailureReason =
    timeoutCount === segmentDiagnostics.length && segmentDiagnostics.length > 0
      ? "all_segments_timeout"
      : expectedItemsMin > 0 &&
          reliableItemsDetectedBySplit < Math.ceil(expectedItemsMin * 0.4)
        ? "low_recovery_ratio"
        : "";

  return {
    split_segments_results: segmentDiagnostics,
    split_segments_success_count: successCount,
    split_segments_timeout_count: timeoutCount,
    split_total_input_tokens: inputTokens || null,
    split_total_output_tokens: outputTokens || null,
    split_total_duration_ms: durationMs || null,
    raw_items_detected_by_split: rawItems,
    reliable_items_detected_by_split: reliableItemsDetectedBySplit,
    expected_items_min: expectedItemsMin || null,
    expected_items_min_is_proven: expectedItemsMinIsProven,
    recovery_ratio_denominator_source: expectedItemsMinIsProven
      ? "declared_total_articles"
      : "not_found",
    recovery_ratio_blocked_reason: expectedItemsMinIsProven
      ? ""
      : "expected_items_min_not_proven",
    recovery_ratio_raw:
      recoveryRatioRaw === null ? null : Number(recoveryRatioRaw.toFixed(2)),
    recovery_ratio: recoveryRatio,
    recovery_ratio_capped: recoveryRatioRaw !== null && recoveryRatioRaw > 1,
    recovery_ratio_status: recoveryRatioStatus,
    estimated_cost_eur: null,
    split_cost_warning: inputTokens > 100000,
    split_failure_reason: splitFailureReason,
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : String(error || "unknown_error");
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
  stage: string;
  providerMessage: string;
  browserText: string;
  localReceipt: Record<string, unknown> & {
    items?: Record<string, unknown>[];
    warnings?: unknown[];
  };
  requestImageSize: Record<string, unknown>;
  localDurationMs: number;
  itemsDetectedBeforeOpenAi: number;
  totalDetectedBeforeOpenAi: boolean;
  expectedItemsMin: number;
  diagnostics?: Record<string, unknown>;
  openaiCalled?: boolean;
  visionUsed?: boolean;
  textAiUsed?: boolean;
  status?: string;
}) {
  const localItems = Array.isArray(localReceipt.items)
    ? localReceipt.items
    : [];
  const warnings = [
    "Analyse partielle, correction manuelle necessaire.",
    "Total non lu avec certitude. Verification manuelle necessaire.",
    providerMessage,
    ...(Array.isArray(localReceipt.warnings)
      ? localReceipt.warnings.map(String)
      : []),
  ].filter(Boolean);

  const reviewItems = localItems.map((item) => ({
    ...item,
    item_status: "a_verifier",
    review_status: "needs_review",
    needs_review: true,
    confidence_score: Math.min(Number(item.confidence_score || 45), 45),
  }));

  const receipt = {
    store_name: String(localReceipt.store_name || ""),
    normalized_store_name: String(
      localReceipt.normalized_store_name || localReceipt.store_name || "",
    ),
    store_location: String(localReceipt.store_location || ""),
    purchase_date: null,
    date_status: "missing",
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
    estimated_items_sum: reviewItems.length
      ? sumReceiptItems(reviewItems)
      : null,
    expected_items_count:
      Number(localReceipt.expected_items_count || 0) || null,
    expected_items_min: expectedItemsMin || null,
    expected_items_source: String(
      localReceipt.expected_items_source ||
        (expectedItemsMin > 0 ? "declared_total_articles" : "not_found"),
    ),
    declared_items_count:
      Number(localReceipt.declared_items_count || 0) || null,
    declared_items_raw_text: String(localReceipt.declared_items_raw_text || ""),
    items_count_status: String(localReceipt.items_count_status || "unknown"),
    items: reviewItems,
    needs_review: true,
    warnings,
  };

  console.warn("[scan-receipt-ocr] manual_review_response", {
    stage,
    provider_message: providerMessage,
    scan_status: status,
    image_size: requestImageSize,
    diagnostics,
  });

  return jsonResponse({
    ok: true,
    pipeline_version: "scanner_v2_ai_first",
    provider: "manual_review_required",
    model: MODEL,
    stage,
    scan_strategy_used: String(
      diagnostics.scan_strategy_used || "manual_review_guard",
    ),
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
    expected_items_min: expectedItemsMin || null,
    expected_items_source: String(
      diagnostics.expected_items_source ||
        localReceipt.expected_items_source ||
        "not_found",
    ),
    declared_items_count:
      Number(
        diagnostics.declared_items_count ||
          localReceipt.declared_items_count ||
          0,
      ) || null,
    declared_items_raw_text: String(
      diagnostics.declared_items_raw_text ||
        localReceipt.declared_items_raw_text ||
        "",
    ),
    items_count_status: String(
      diagnostics.items_count_status ||
        localReceipt.items_count_status ||
        "unknown",
    ),
    expected_items_min_is_proven: Boolean(
      diagnostics.expected_items_min_is_proven || expectedItemsMin > 0,
    ),
    recovery_ratio_raw: diagnostics.recovery_ratio_raw ?? null,
    recovery_ratio: diagnostics.recovery_ratio ?? null,
    recovery_ratio_capped: Boolean(diagnostics.recovery_ratio_capped || false),
    recovery_ratio_status: String(
      diagnostics.recovery_ratio_status ||
        (expectedItemsMin > 0 ? "computed" : "unknown_expected_items"),
    ),
    recovery_ratio_denominator_source: String(
      diagnostics.recovery_ratio_denominator_source ||
        (expectedItemsMin > 0 ? "declared_total_articles" : "not_found"),
    ),
    recovery_ratio_blocked_reason: String(
      diagnostics.recovery_ratio_blocked_reason ||
        (expectedItemsMin > 0 ? "" : "expected_items_min_not_proven"),
    ),
    premium_plus_daily_ai_limit: PREMIUM_PLUS_DAILY_AI_LIMIT,
    split_retry_eligible: Boolean(diagnostics.split_retry_eligible),
    split_retry_used: Boolean(diagnostics.split_retry_used),
    split_retry_skipped_reason: String(
      diagnostics.split_retry_skipped_reason || "",
    ),
    split_segments_count: Number(diagnostics.split_segments_count || 0),
    split_segments_results: Array.isArray(diagnostics.split_segments_results)
      ? diagnostics.split_segments_results
      : [],
    primary_stage: String(diagnostics.primary_stage || stage),
    primary_error: diagnostics.primary_error || diagnostics.error_message || "",
    fallback_stage: String(
      diagnostics.fallback_stage || "manual_review_required",
    ),
    premium_plus_detected: Boolean(diagnostics.premium_plus_detected),
    segments_received_by_edge_function: Number(
      diagnostics.segments_received_by_edge_function || 0,
    ),
  });
}

function dateEvidenceVariants(value = "") {
  const raw = String(value || "").trim();
  const variants = new Set<string>();
  if (!raw) return variants;
  variants.add(normalizeText(raw));

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    variants.add(normalizeText(`${iso[3]}/${iso[2]}/${iso[1]}`));
    variants.add(normalizeText(`${iso[3]}-${iso[2]}-${iso[1]}`));
    variants.add(normalizeText(`${iso[3]}.${iso[2]}.${iso[1]}`));
  }

  return variants;
}

function dateAppearsInEvidence(
  value = "",
  hintText = "",
  items: Record<string, unknown>[] = [],
) {
  const variants = dateEvidenceVariants(value);
  if (!variants.size) return false;
  const evidence = normalizeText(
    [
      hintText,
      ...items.map(
        (item) => `${item.raw_text || ""} ${item.source_line || ""}`,
      ),
    ].join("\n"),
  );
  return Array.from(variants).some(
    (variant) => variant && evidence.includes(variant),
  );
}

function applyVisionServerValidation({
  receipt,
  hintText,
  expectedItemsMin,
}: {
  receipt: Record<string, unknown> & {
    items?: Record<string, unknown>[];
    warnings?: unknown[];
  };
  hintText: string;
  expectedItemsMin: number;
}) {
  const originalItems = Array.isArray(receipt.items) ? receipt.items : [];
  const warnings = Array.isArray(receipt.warnings)
    ? [...receipt.warnings.map(String)]
    : [];
  const total = Number(receipt.total_amount || 0);
  const rawItemsCount = originalItems.length;
  const partialLowItems =
    expectedItemsMin > 0 && rawItemsCount < Math.ceil(expectedItemsMin * 0.6);
  const calculatedItemsSum = sumReceiptItems(originalItems);
  const totalDifference =
    total > 0 && calculatedItemsSum > 0
      ? Number(Math.abs(total - calculatedItemsSum).toFixed(2))
      : null;
  let discardedHallucinatedItems = 0;

  const items = originalItems.flatMap((item) => {
    const name = String(item.name || item.ocr_name || "").trim();
    const rawText = String(item.raw_text || item.source_line || "").trim();
    const genericWithoutEvidence =
      partialLowItems && isGenericHallucinationName(name) && !rawText;
    if (genericWithoutEvidence) {
      discardedHallucinatedItems += 1;
      return [];
    }

    const confidence = Number(item.confidence_score || 0);
    const forcedReview =
      partialLowItems || !rawText || Boolean(item.needs_review);
    return [
      {
        ...item,
        raw_text: rawText,
        source_line: rawText,
        confidence_score: forcedReview
          ? Math.min(confidence || 45, 45)
          : confidence,
        item_status: forcedReview
          ? "a_verifier"
          : item.item_status || "detected",
        review_status: forcedReview
          ? "needs_review"
          : item.review_status || "trusted",
        needs_review: forcedReview,
      },
    ];
  });

  if (partialLowItems) {
    warnings.push(
      `Ticket partiellement lu : seulement ${rawItemsCount} article(s) detecte(s) sur environ ${expectedItemsMin} attendu(s). Verification manuelle necessaire.`,
    );
  }
  if (discardedHallucinatedItems > 0) {
    warnings.push(
      `${discardedHallucinatedItems} article(s) generique(s) sans preuve ont ete retires du brouillon.`,
    );
  }

  const purchaseDate = String(receipt.purchase_date || "");
  const dateTrusted = purchaseDate
    ? dateAppearsInEvidence(purchaseDate, hintText, originalItems)
    : false;
  if (purchaseDate && !dateTrusted) {
    warnings.push("Date non lue avec certitude.");
  }

  const totalRawText = String(receipt.total_raw_text || "").trim();
  const reliableItemsCount = items.filter(
    (item) => item.item_status !== "a_verifier",
  ).length;
  let totalTrusted =
    total > 0 &&
    !partialLowItems &&
    totalRawText &&
    isTrustedTotalLabel(totalRawText) &&
    receipt.total_raw_text_verified_against_ocr === true &&
    Number(receipt.total_confidence || 0) >= 0.7;
  let totalRejectedReason = String(receipt.total_rejected_reason || "");
  if (partialLowItems && reliableItemsCount === 0) {
    totalTrusted = false;
    totalRejectedReason = "partial_low_items_without_reliable_items";
  } else if (partialLowItems) {
    totalTrusted = false;
    totalRejectedReason = "partial_low_items_sensitive_data_requires_review";
  } else if (!totalTrusted && !totalRejectedReason) {
    totalRejectedReason = "total_not_trusted_by_server";
  }

  if (!totalTrusted) {
    warnings.push(
      "Total non lu avec certitude. Verification manuelle necessaire.",
    );
  }

  const scanStatus = partialLowItems ? "partial_low_items" : "partial";
  return {
    receipt: {
      ...receipt,
      purchase_date: dateTrusted ? purchaseDate : "",
      date_status: dateTrusted ? "detected" : "estimated",
      total_amount: totalTrusted ? total : null,
      total_raw_text: totalTrusted ? totalRawText : "",
      total_confidence: totalTrusted
        ? Number(receipt.openai_total_confidence || 0) > 0
          ? Math.min(
              Number(receipt.total_confidence || 0),
              Number(receipt.openai_total_confidence || 0),
            )
          : Number(receipt.total_confidence || 0)
        : 0,
      total_needs_review: !totalTrusted,
      total_source: totalTrusted
        ? receipt.total_source || "trusted_total_line"
        : "missing_or_unreliable",
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
  };
}

function localExtractionIsHighConfidence({
  totalDetected,
  itemCount,
  expectedItemsMin,
}: {
  totalDetected: boolean;
  itemCount: number;
  expectedItemsMin: number;
}) {
  if (!totalDetected || itemCount < 3) return false;
  if (expectedItemsMin > 0)
    return itemCount >= Math.ceil(expectedItemsMin * 0.9);
  return itemCount >= 12;
}

function normalizeItems(rawItems: unknown[] = []) {
  const byName = new Map<string, Record<string, unknown>>();

  for (const raw of rawItems) {
    const item = (raw || {}) as Record<string, unknown>;
    const sourceLine = String(
      item.ocr_name || item.name || item.corrected_name || "",
    ).trim();
    const price =
      numericTotal(item.total_price) ||
      numericTotal(item.unit_price) ||
      numericTotal(sourceLine);
    const name = cleanItemName(
      String(item.name || item.corrected_name || item.ocr_name || ""),
    );
    const ocrName = String(item.ocr_name || sourceLine || name).trim();
    const finalName = cleanItemName(name || ocrName);

    const sectionSubtotal = classifySectionSubtotalLine(
      String(item.raw_text || item.source_line || ocrName || finalName),
    );
    if (sectionSubtotal.kind !== "none") continue;

    const ocrLooksIgnored = isIgnoredItemLine(ocrName);
    const ocrCleanName = cleanItemName(ocrName);
    if (isPhoneOrContactLine(sourceLine) || isPhoneOrContactLine(finalName))
      continue;
    if (!finalName || !price || isIgnoredItemLine(finalName)) continue;
    if (
      ocrLooksIgnored &&
      normalizeText(ocrCleanName) === normalizeText(finalName)
    )
      continue;

    const key = normalizeText(finalName)
      .replace(/[^a-z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!key) continue;
    const incomingStatus = normalizeItemQualityStatus(item);
    const itemStatus =
      incomingStatus === "trusted" || incomingStatus === "user_validated"
        ? incomingStatus
        : incomingStatus === "rejected"
          ? "rejected"
          : "needs_review";
    const confidenceScore = Number(item.confidence_score || 65);

    byName.set(key, {
      name: finalName,
      ocr_name: ocrName || finalName,
      corrected_name: finalName,
      raw_text: String(
        item.raw_text || item.source_line || ocrName || finalName,
      ),
      source_line: String(
        item.source_line || item.raw_text || ocrName || finalName,
      ),
      quantity: Number(item.quantity || 1) || 1,
      unit: String(item.unit || "piece"),
      unit_price: numericTotal(item.unit_price) || price,
      total_price: price,
      category: String(item.category || "alimentaire"),
      confidence_score: confidenceScore,
      item_status: itemStatus,
      status: itemStatus,
      review_status: itemStatus,
      needs_review: itemStatus === "needs_review",
      item_quality_score: confidenceScore,
      item_rejection_reason:
        itemStatus === "rejected"
          ? String(item.item_rejection_reason || "rejected")
          : "",
      line_type: "product",
      source: String(item.source || "ocr_fallback"),
    });
  }

  return Array.from(byName.values());
}

function summarizeItemQuality(
  items: Record<string, unknown>[] = [],
  rejectedLines: Array<{ line: string; reason?: string }> = [],
) {
  const trustedItems = items.filter(
    (item) => normalizeItemQualityStatus(item) === "trusted",
  );
  const reviewItems = items.filter(
    (item) => normalizeItemQualityStatus(item) === "needs_review",
  );
  const rejectedReasonCounts = rejectedLines.reduce(
    (acc, row) => {
      const reason =
        row.reason || classifyLineRejectionReason(row.line) || "unknown";
      acc[reason] = (acc[reason] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  const smartShoppingItems = items.filter((item) =>
    isItemEligibleForSmartShopping(item),
  );
  const trustedRatio = items.length ? trustedItems.length / items.length : 0;

  return {
    trusted_items_count: trustedItems.length,
    needs_review_items_count: reviewItems.length,
    rejected_items_count: rejectedLines.length,
    trusted_items_ratio: Number(trustedRatio.toFixed(2)),
    items_quality_status:
      items.length === 0
        ? "no_items"
        : trustedRatio >= 0.8
          ? "trusted_enough"
          : "needs_review",
    items_sent_to_smart_shopping_count: smartShoppingItems.length,
    items_excluded_from_smart_shopping_count: Math.max(
      0,
      items.length - smartShoppingItems.length,
    ),
    items_excluded_reasons_summary: {
      ...rejectedReasonCounts,
      needs_review: reviewItems.length,
    },
    item_quality_summary: items.map((item) => ({
      name: item.name,
      raw_text: item.raw_text || item.ocr_name || item.name,
      item_status: item.item_status,
      review_status: item.review_status,
      item_quality_score: item.item_quality_score || item.confidence_score,
      smart_shopping_allowed: isItemEligibleForSmartShopping(item),
    })),
  };
}

function resolveItemsQualityStatus({
  items,
  qualitySummary,
  smartShoppingBlockedReasons,
}: {
  items: Record<string, unknown>[];
  qualitySummary: ReturnType<typeof summarizeItemQuality>;
  smartShoppingBlockedReasons: string[];
}) {
  if (items.length === 0) return "blocked";
  if (smartShoppingBlockedReasons.length > 0) return "blocked";
  if (qualitySummary.items_sent_to_smart_shopping_count === 0)
    return "needs_review";
  if (qualitySummary.trusted_items_ratio >= 0.8) return "trusted";
  return "partial";
}

function resolveFinalScanStatus({
  budgetStatus,
  itemsQualityStatus,
  smartShoppingSafe,
}: {
  budgetStatus: string;
  itemsQualityStatus: string;
  smartShoppingSafe: boolean;
}) {
  if (budgetStatus === "rejected") return "rejected";
  if (budgetStatus !== "reliable") return "budget_needs_review";
  if (smartShoppingSafe && itemsQualityStatus === "trusted")
    return "budget_ok_articles_ok";
  if (itemsQualityStatus === "partial") return "budget_ok_articles_partial";
  return "budget_ok_articles_blocked";
}

function resolveDisplayedItemsDiagnostics({
  items,
  expectedItemsCount,
  expectedItemsSource,
  qualitySummary,
  itemsQualityStatus,
  smartShoppingSafe,
  finalScanStatus,
}: {
  items: Record<string, unknown>[];
  expectedItemsCount: number;
  expectedItemsSource: string;
  qualitySummary: ReturnType<typeof summarizeItemQuality>;
  itemsQualityStatus: string;
  smartShoppingSafe: boolean;
  finalScanStatus: string;
}) {
  const declaredCountKnown =
    expectedItemsCount > 0 &&
    String(expectedItemsSource || "").includes("declared");
  const blocked =
    finalScanStatus === "budget_ok_articles_blocked" ||
    smartShoppingSafe === false ||
    itemsQualityStatus === "blocked" ||
    itemsQualityStatus === "needs_review" ||
    qualitySummary.needs_review_items_count > 0;

  if (blocked) {
    return {
      displayed_items_count: null,
      displayed_items_count_source: "blocked_unreliable",
      real_items_count_if_known: declaredCountKnown ? expectedItemsCount : null,
      item_count_display_label: "Articles a verifier",
    };
  }

  if (
    declaredCountKnown &&
    qualitySummary.trusted_items_count === expectedItemsCount
  ) {
    return {
      displayed_items_count: expectedItemsCount,
      displayed_items_count_source: "declared_trusted_count",
      real_items_count_if_known: expectedItemsCount,
      item_count_display_label: `${expectedItemsCount} article(s)`,
    };
  }

  if (
    smartShoppingSafe &&
    qualitySummary.trusted_items_count > 0 &&
    qualitySummary.trusted_items_count === items.length
  ) {
    return {
      displayed_items_count: qualitySummary.trusted_items_count,
      displayed_items_count_source: "trusted_items_count",
      real_items_count_if_known: declaredCountKnown ? expectedItemsCount : null,
      item_count_display_label: `${qualitySummary.trusted_items_count} article(s)`,
    };
  }

  return {
    displayed_items_count: null,
    displayed_items_count_source: "unknown_or_unreliable",
    real_items_count_if_known: declaredCountKnown ? expectedItemsCount : null,
    item_count_display_label: "Articles a verifier",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return diagnosticErrorResponse({
        errorCode: "SCAN_REQUEST_METHOD_INVALID",
        errorMessage: "Method not allowed.",
        status: 405,
        stage: "request_validation",
      });
    }

    const authorization = req.headers.get("authorization") || "";
    if (!authorization.toLowerCase().startsWith("bearer ")) {
      return diagnosticErrorResponse({
        errorCode: "SCAN_AUTH_MISSING",
        errorMessage: "Missing user authorization.",
        status: 401,
        stage: "request_validation",
      });
    }

    const body = await req.json().catch(() => ({}));
    const imageBase64 = String(body.imageBase64 || "");
    const mimeType = String(body.mimeType || "image/jpeg");
    const browserText = String(body.browserText || "");
    const imageMeta =
      body.imageMeta && typeof body.imageMeta === "object"
        ? body.imageMeta
        : {};
    const imageSegments = Array.isArray(body.imageSegments)
      ? body.imageSegments
      : [];
    const userPlan = String(
      body.userPlan || body.plan || imageMeta.user_plan || "free",
    );
    const isPremiumPlus =
      userPlan === "premium_plus" || body.isPremiumPlus === true;
    const browserItems = parseFallbackItemsFromText(browserText);
    const browserTotal = extractTotalFromText(browserText);
    const requestImageSize = {
      ...imageSizeInfo(imageBase64),
      ...imageMeta,
    };
    const segmentQualityScore = Math.min(
      100,
      Math.round(
        (Number(
          requestImageSize.optimized_image_width || requestImageSize.width || 0,
        ) *
          Number(
            requestImageSize.optimized_image_height ||
              requestImageSize.height ||
              0,
          )) /
          65000,
      ),
    );
    const imageQualityWarning =
      segmentQualityScore > 0 && segmentQualityScore < 50;
    const localOcrAttempted = Boolean(
      imageMeta.local_ocr_attempted ?? imageMeta.localOcrAttempted ?? false,
    );
    const localOcrEngine = String(
      imageMeta.local_ocr_engine || imageMeta.localOcrEngine || "",
    );
    const localOcrDurationMs =
      Number(
        imageMeta.local_ocr_duration_ms ?? imageMeta.localOcrDurationMs ?? 0,
      ) || null;
    const localOcrError = String(
      imageMeta.local_ocr_error || imageMeta.localOcrError || "",
    );
    const localOcrStatus = String(
      imageMeta.local_ocr_status || imageMeta.localOcrStatus || "",
    );
    const localOcrImportStatus = String(
      imageMeta.local_ocr_import_status || imageMeta.localOcrImportStatus || "",
    );
    const localOcrWorkerStatus = String(
      imageMeta.local_ocr_worker_status || imageMeta.localOcrWorkerStatus || "",
    );
    const localOcrErrorType = String(
      imageMeta.local_ocr_error_type || imageMeta.localOcrErrorType || "",
    );
    const browserTextLengthBeforePayload = Number(
      imageMeta.browserTextLength_before_payload ??
        imageMeta.browser_text_length_before_payload ??
        imageMeta.browserTextLengthBeforePayload ??
        browserText.length,
    );
    const browserTextLengthSentToEdge = browserText.length;
    const localOcrAvailable = browserText.trim().length > 0;
    const hasLocalOcrTechnicalFailure =
      localOcrTechnicalFailure(localOcrErrorType);
    const shouldSkipAiDueToLocalOcrFailure = Boolean(
      imageMeta.should_skip_ai_due_to_local_ocr_failure ??
      imageMeta.shouldSkipAiDueToLocalOcrFailure ??
      false,
    );
    const textEmptyReason = localOcrAvailable
      ? ""
      : !localOcrAttempted
        ? "local_ocr_not_attempted"
        : browserTextLengthBeforePayload > 0 &&
            browserTextLengthSentToEdge === 0
          ? "browser_text_not_sent"
          : browserTextLengthSentToEdge > 0 && browserText.length === 0
            ? "edge_text_missing"
            : localOcrStatus === "failed" &&
                localOcrError &&
                localOcrError !== "empty_local_ocr"
              ? "local_ocr_failed"
              : imageQualityWarning
                ? "image_quality_too_low_for_local_ocr"
                : "local_ocr_empty";
    const localOcrSkippedReason = localOcrAttempted
      ? ""
      : "local_ocr_not_attempted";
    const localOcrAiRiskReason = hasLocalOcrTechnicalFailure
      ? `local_ocr_${localOcrErrorType}`
      : "";
    const imagePreprocessingForOcr = {
      rotation_applied:
        requestImageSize.rotationApplied ??
        requestImageSize.rotation_applied ??
        null,
      optimized_image_width:
        requestImageSize.optimized_image_width ??
        requestImageSize.width ??
        null,
      optimized_image_height:
        requestImageSize.optimized_image_height ??
        requestImageSize.height ??
        null,
      compression_quality:
        requestImageSize.compressionQuality ??
        requestImageSize.compression_quality ??
        null,
      segment_quality_score: segmentQualityScore,
    };
    const localOcrDiagnostics = {
      local_ocr_attempted: localOcrAttempted,
      local_ocr_engine: localOcrEngine,
      local_ocr_import_status: localOcrImportStatus,
      local_ocr_worker_status: localOcrWorkerStatus,
      local_ocr_duration_ms: localOcrDurationMs,
      local_ocr_error: localOcrError,
      local_ocr_error_type: localOcrErrorType,
      local_ocr_skipped_reason: localOcrSkippedReason,
      browserTextLength_before_payload: browserTextLengthBeforePayload,
      browserTextLength_sent_to_edge: browserTextLengthSentToEdge,
      edge_text_length: browserText.length,
      image_preprocessing_for_ocr: imagePreprocessingForOcr,
      local_ocr_available: localOcrAvailable,
      text_empty_reason: textEmptyReason,
      ai_called_after_local_ocr_technical_failure: false,
      ai_call_risk_reason: localOcrAiRiskReason,
      should_skip_ai_due_to_local_ocr_failure: shouldSkipAiDueToLocalOcrFailure,
    };
    const markAiCalledAfterLocalOcrFailure = () => {
      if (hasLocalOcrTechnicalFailure) {
        localOcrDiagnostics.ai_called_after_local_ocr_technical_failure = true;
        localOcrDiagnostics.ai_call_risk_reason =
          localOcrAiRiskReason || "local_ocr_technical_failure";
      }
    };

    console.info("[scan-receipt-ocr] request_received", {
      model: MODEL,
      mimeType,
      image_size: requestImageSize,
      browserTextLength: browserText.length,
      ...localOcrDiagnostics,
      browserItemsDetected: browserItems.length,
      browserTotal,
      userPlan,
      isPremiumPlus,
      splitSegmentsReceived: imageSegments.length,
    });

    if (!imageBase64 || !mimeType.startsWith("image/")) {
      console.error("[scan-receipt-ocr] image_invalid", {
        model: MODEL,
        mimeType,
        image_size: requestImageSize,
      });

      return diagnosticErrorResponse({
        errorCode: "SCAN_IMAGE_UNREADABLE",
        errorMessage: "Missing or invalid image.",
        status: 400,
        stage: "request_validation",
        extra: { image_size: requestImageSize },
      });
    }

    if (imageBase64.length > MAX_BASE64_LENGTH) {
      console.error("[scan-receipt-ocr] image_too_large", {
        model: MODEL,
        mimeType,
        image_size: requestImageSize,
      });

      return diagnosticErrorResponse({
        errorCode: "SCAN_IMAGE_TOO_LARGE",
        errorMessage: "Image too large after compression.",
        status: 413,
        providerMessage: `Image base64 length ${imageBase64.length} exceeds max ${MAX_BASE64_LENGTH}.`,
        stage: "request_validation",
        extra: { image_size: requestImageSize },
      });
    }

    const localStartedAt = performance.now();
    const localReceipt = buildFastLocalExtraction(browserText);
    const localDurationMs = Math.round(performance.now() - localStartedAt);
    const itemsDetectedBeforeOpenAi = localReceipt.items.length;
    const totalDetectedBeforeOpenAi = localReceipt.total_amount > 0;
    const isFoodTicket = isLikelyFoodTicket(localReceipt, browserText);
    const expectedItemsMin = isFoodTicket
      ? expectedItemsForFoodTicket(browserText)
      : 0;
    const declaredItemsCount = Number(localReceipt.expected_items_count || 0);
    const declaredEvidence = getDeclaredItemsEvidence(browserText);
    const localExactDeclaredCount =
      declaredItemsCount > 0 &&
      itemsDetectedBeforeOpenAi === declaredItemsCount;
    const scanStatusLegacy =
      totalDetectedBeforeOpenAi &&
      localReceipt.store_name &&
      localReceipt.purchase_date &&
      localExactDeclaredCount
        ? "trusted"
        : isFoodTicket &&
            totalDetectedBeforeOpenAi &&
            itemsDetectedBeforeOpenAi < expectedItemsMin
          ? "partial_low_items"
          : "partial";
    const scanStatus = String(
      localReceipt.final_scan_status || scanStatusLegacy,
    );
    const localArticlesBlockedForLearning = Boolean(
      String(localReceipt.final_scan_status || "") ===
        "budget_ok_articles_blocked" ||
      String(localReceipt.items_quality_status || "") === "blocked" ||
      String(localReceipt.items_quality_status || "") === "needs_review" ||
      localReceipt.smart_shopping_safe === false ||
      (Array.isArray(localReceipt.smart_shopping_blocked_reasons) &&
        localReceipt.smart_shopping_blocked_reasons.length > 0),
    );

    console.info("[scan-receipt-ocr] fast_local_extraction", {
      fast_local_extraction_used: true,
      openai_called: false,
      items_detected_before_openai: itemsDetectedBeforeOpenAi,
      total_detected_before_openai: totalDetectedBeforeOpenAi,
      expected_items_min: expectedItemsMin || null,
      expected_items_source: declaredEvidence.count
        ? declaredEvidence.source
        : "not_found",
      declared_items_raw_text: declaredEvidence.raw,
      expected_items_count: declaredItemsCount || null,
      items_count_status: declaredItemsCount ? "declared" : "unknown",
      ...localOcrDiagnostics,
      image_quality_warning: imageQualityWarning,
      segment_quality_score: segmentQualityScore,
      scan_status: scanStatus,
      total_amount: localReceipt.total_amount,
      total_raw_text: localReceipt.total_raw_text,
      total_source: localReceipt.total_source,
      payment_total_value: localReceipt.payment_total_value,
      payment_total_raw_text: localReceipt.payment_total_raw_text,
      total_payment_consistent: localReceipt.total_payment_consistent,
      calculated_items_sum_before_section_filter:
        localReceipt.calculated_items_sum_before_section_filter,
      calculated_items_sum_after_section_filter:
        localReceipt.calculated_items_sum_after_section_filter,
      section_subtotals_rejected_count:
        localReceipt.section_subtotals_rejected_count,
      section_subtotals_rejected_amount:
        localReceipt.section_subtotals_rejected_amount,
      section_subtotals_rejected_lines:
        localReceipt.section_subtotals_rejected_lines,
      section_subtotals_probable_count:
        localReceipt.section_subtotals_probable_count,
      section_subtotals_probable_amount:
        localReceipt.section_subtotals_probable_amount,
      section_subtotals_probable_lines:
        localReceipt.section_subtotals_probable_lines,
      items_kept_lines: localReceipt.items_kept_lines,
      items_total_vs_receipt_total_delta:
        localReceipt.items_total_vs_receipt_total_delta,
      ocr_text_has_total: localReceipt.ocr_text_has_total,
      ocr_text_has_payment: localReceipt.ocr_text_has_payment,
      ocr_text_has_declared_items_count:
        localReceipt.ocr_text_has_declared_items_count,
      ocr_text_last_lines: localReceipt.ocr_text_last_lines,
      local_total_missing_reason: localReceipt.local_total_missing_reason,
      store_name: localReceipt.store_name,
      purchase_date: localReceipt.purchase_date,
      durationMs: localDurationMs,
      image_size: requestImageSize,
      budget_status: localReceipt.budget_status,
      items_quality_status: localReceipt.items_quality_status,
      smart_shopping_safe: localReceipt.smart_shopping_safe,
      smart_shopping_blocked_reasons:
        localReceipt.smart_shopping_blocked_reasons,
      final_scan_status: localReceipt.final_scan_status,
      scan_status_legacy: localReceipt.scan_status_legacy || scanStatusLegacy,
    });

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
      primaryStage: string;
      primaryError?: string;
      providerMessage: string;
      baseReceipt?: Record<string, unknown> & {
        items?: Record<string, unknown>[];
        warnings?: unknown[];
      };
      primaryDurationMs?: number;
      primaryInputTokens?: number;
      primaryOutputTokens?: number;
      primaryReliableItemsDetected?: number;
      primaryRawItemsDetected?: number;
      primaryTotalDetected?: boolean;
      primaryConfidence?: number;
    }) => {
      // V3.9 — Garde-fou coût/qualité : sur un ticket court avec budget déjà fiable,
      // un timeout de la Vision primaire ne doit pas déclencher un split 3 segments.
      // Le split est trop coûteux et peut mélanger les lignes articles. On conserve
      // alors le budget et on bloque l’apprentissage Courses intelligentes.
      const primaryTimedOut =
        /timeout/i.test(String(primaryError || "")) ||
        String(primaryStage || "") === "openai_vision_primary_exception";
      const shortTicketCount = Number(
        declaredEvidence.count ||
          expectedItemsMin ||
          declaredItemsCount ||
          itemsDetectedBeforeOpenAi ||
          0,
      );
      const shortTicketWithReliableLocalBudget = Boolean(
        primaryTimedOut &&
        shortTicketCount > 0 &&
        shortTicketCount <= 10 &&
        totalDetectedBeforeOpenAi &&
        Number(localReceipt.total_amount || 0) > 0 &&
        localReceipt.total_needs_review !== true &&
        Boolean(localReceipt.store_name) &&
        Boolean(localReceipt.purchase_date),
      );

      if (shortTicketWithReliableLocalBudget) {
        const baseWarnings = Array.isArray(baseReceipt.warnings)
          ? baseReceipt.warnings
          : [];
        const budgetOnlyReceipt = {
          ...baseReceipt,
          store_name: String(
            baseReceipt.store_name || localReceipt.store_name || "",
          ),
          normalized_store_name: String(
            baseReceipt.normalized_store_name ||
              localReceipt.normalized_store_name ||
              "",
          ),
          store_location: String(
            baseReceipt.store_location || localReceipt.store_location || "",
          ),
          purchase_date: String(
            baseReceipt.purchase_date || localReceipt.purchase_date || "",
          ),
          total_amount: Number(
            baseReceipt.total_amount || localReceipt.total_amount || 0,
          ),
          total_needs_review: false,
          total_status: "detected",
          total_source: String(
            baseReceipt.total_source ||
              localReceipt.total_source ||
              "local_total_after_primary_timeout",
          ),
          total_raw_text: String(
            baseReceipt.total_raw_text || localReceipt.total_raw_text || "",
          ),
          total_confidence: Number(
            baseReceipt.total_confidence ||
              localReceipt.total_confidence ||
              0.9,
          ),
          items: [],
          budget_status: "reliable",
          items_quality_status: "blocked",
          smart_shopping_safe: false,
          smart_shopping_blocked_reasons: [
            ...(Array.isArray(
              (baseReceipt as Record<string, unknown>)
                .smart_shopping_blocked_reasons,
            )
              ? ((baseReceipt as Record<string, unknown>)
                  .smart_shopping_blocked_reasons as string[])
              : []),
            "primary_timeout_short_ticket_no_split",
          ],
          final_scan_status: "budget_ok_articles_blocked",
          scan_status: "budget_ok_articles_blocked",
          warnings: [
            ...baseWarnings,
            "primary_timeout_short_ticket_budget_only_no_split",
          ],
          expected_items_count: shortTicketCount,
          declared_items_count: declaredEvidence.count || shortTicketCount,
          declared_items_raw_text: declaredEvidence.raw || "",
        };

        console.info(
          "[scan-receipt-ocr] short_ticket_primary_timeout_budget_only_no_split",
          {
            scheduled: false,
            reason: "primary_timeout_short_ticket_budget_only_no_split",
            primary_stage: primaryStage,
            primary_error: primaryError,
            declared_items_count: declaredEvidence.count || null,
            expected_items_min: expectedItemsMin || null,
            items_detected_before_openai: itemsDetectedBeforeOpenAi,
            total_detected_before_openai: totalDetectedBeforeOpenAi,
            total_amount: budgetOnlyReceipt.total_amount,
            split_retry_used: false,
          },
        );

        return {
          response: jsonResponse({
            ok: true,
            pipeline_version: "scanner_premium_plus_v4_1",
            provider: "openai_vision_primary_timeout_budget_only",
            model: MODEL,
            stage: "openai_vision_primary_timeout_budget_only",
            scan_strategy_used: "primary_timeout_budget_only_no_split",
            scanStatus: "budget_ok_articles_blocked",
            scan_status: "budget_ok_articles_blocked",
            source: "local_budget_after_primary_timeout",
            text: browserText,
            confidence: 68,
            receipt: budgetOnlyReceipt,
            openaiDurationMs: Number(primaryDurationMs || 0),
            totalDetectionDurationMs: localDurationMs,
            inputTokens: Number(primaryInputTokens || 0),
            outputTokens: Number(primaryOutputTokens || 0),
            estimatedCostEur: null,
            fast_local_extraction_used: true,
            openai_called: true,
            text_ai_used: false,
            vision_used: true,
            scan_ai_calls_count: 1,
            split_retry_eligible: false,
            split_retry_used: false,
            split_retry_skipped_reason:
              "short_ticket_primary_timeout_budget_only_no_split",
            split_segments_count: imageSegments.length,
            split_segments_results: [],
            split_segments_success_count: 0,
            split_segments_timeout_count: 0,
            split_cost_warning: false,
            primary_stage: primaryStage,
            primary_error: primaryError,
            fallback_stage: "budget_only_no_split",
            premium_plus_detected: isPremiumPlus,
            segments_received_by_edge_function: imageSegments.length,
            premium_plus_daily_ai_limit: PREMIUM_PLUS_DAILY_AI_LIMIT,
            premium_plus_split_retry_daily_limit:
              SPLIT_RETRY_DAILY_LIMIT_PREMIUM_PLUS,
            strong_fallback_used: false,
            items_detected_before_openai: itemsDetectedBeforeOpenAi,
            total_detected_before_openai: totalDetectedBeforeOpenAi,
            items_detected_by_vision: primaryRawItemsDetected,
            raw_items_detected_by_vision: primaryRawItemsDetected,
            reliable_items_detected_by_vision: primaryReliableItemsDetected,
            raw_items_detected_by_split: 0,
            reliable_items_detected_by_split: 0,
            calculated_items_sum: null,
            total_detected_by_vision: primaryTotalDetected,
            total_estimated_from_items: false,
            total_needs_review: false,
            total_raw_text: budgetOnlyReceipt.total_raw_text,
            total_confidence: budgetOnlyReceipt.total_confidence,
            total_source: budgetOnlyReceipt.total_source,
            estimated_items_sum: null,
            expected_items_min: expectedItemsMin || shortTicketCount || null,
            expected_items_source: declaredEvidence.count
              ? declaredEvidence.source
              : "short_ticket_count_fallback",
            declared_items_count:
              declaredEvidence.count || shortTicketCount || null,
            declared_items_raw_text: declaredEvidence.raw || "",
            items_count_status: declaredEvidence.count
              ? "declared"
              : "short_ticket_known",
            budget_status: "reliable",
            items_quality_status: "blocked",
            smart_shopping_safe: false,
            smart_shopping_blocked_reasons: [
              "primary_timeout_short_ticket_no_split",
            ],
            final_scan_status: "budget_ok_articles_blocked",
            ...localOcrDiagnostics,
            diagnostics: {
              split_retry_eligible: false,
              split_retry_used: false,
              split_retry_skipped_reason:
                "short_ticket_primary_timeout_budget_only_no_split",
              split_segments_count: imageSegments.length,
              split_segments_results: [],
              primary_stage: primaryStage,
              primary_error: primaryError,
              fallback_stage: "budget_only_no_split",
              premium_plus_detected: isPremiumPlus,
              segments_received_by_edge_function: imageSegments.length,
              guard: "v4_0_short_ticket_primary_timeout_budget_only_no_split",
            },
          }),
          diagnostics: null,
        };
      }

      const splitRetryEligible = shouldRunSplitRetry({
        isPremiumPlus,
        scanStatus: "manual_review_required",
        totalNeedsReview: true,
        expectedItemsMin,
        reliableItemsDetected: primaryReliableItemsDetected,
        confidence: primaryConfidence,
        imageSize: requestImageSize,
      });
      const skippedReason = splitRetryEligible
        ? splitRetrySkippedReason({
            isPremiumPlus,
            segmentsCount: imageSegments.length,
          })
        : splitRetrySkippedReason({
            isPremiumPlus,
            segmentsCount: imageSegments.length,
            scanAlreadyTrusted: true,
          });

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
            ...localOcrDiagnostics,
          },
        };
      }

      console.info("[scan-receipt-ocr] premium_plus_split_retry", {
        scheduled: true,
        scan_strategy_used: "mini_split_3",
        reason: primaryStage,
        expected_items_min: expectedItemsMin || null,
        expected_items_source: declaredEvidence.count
          ? declaredEvidence.source
          : "not_found",
        declared_items_count: declaredEvidence.count || null,
        declared_items_raw_text: declaredEvidence.raw || "",
        items_count_status: declaredEvidence.count ? "declared" : "unknown",
        expected_items_min_is_proven: expectedItemsMin > 0,
        ...localOcrDiagnostics,
        reliable_items_detected_by_vision: primaryReliableItemsDetected,
        split_segments_count: imageSegments.length,
      });

      try {
        markAiCalledAfterLocalOcrFailure();
        const splitRetry = await runSplitRetry({
          imageSegments,
          browserText,
          baseReceipt,
          expectedItemsMin,
          imageQualityWarning,
        });

        const splitDiagnostics = buildSplitDiagnostics({
          splitResults: splitRetry.splitResults || [],
          expectedItemsMin:
            splitRetry.merged?.expectedItemsMin || expectedItemsMin,
          reliableItemsDetectedBySplit:
            splitRetry.merged?.reliableItemsCount || 0,
        });
        const splitSegmentsResults = splitDiagnostics.split_segments_results;

        if (!splitRetry.error && splitRetry.merged) {
          const merged = splitRetry.merged;
          const splitReceipt = merged.receipt;
          const scanReliabilityBlockedReason =
            !localOcrAvailable &&
            imageQualityWarning &&
            Boolean(splitReceipt.total_needs_review)
              ? "local_ocr_empty_quality_low_total_unreliable"
              : imageQualityWarning &&
                  splitDiagnostics.recovery_ratio !== null &&
                  Number(splitDiagnostics.recovery_ratio) < 0.4
                ? "low_image_quality_and_low_recovery"
                : "";
          const primaryTimeoutTotalUnavailable =
            primaryStage === "openai_vision_primary_exception" &&
            /timeout/i.test(String(primaryError || ""));
          const splitBottomSegment = splitSegmentsResults.find(
            (segment: Record<string, unknown>) =>
              String(segment.segment_name || segment.segment || "") ===
              "bottom",
          );
          const splitBottomSegmentTotalMissing = Boolean(
            splitBottomSegment && splitBottomSegment.total_found !== true,
          );
          const totalMissingAfterPrimaryTimeout = Boolean(
            primaryTimeoutTotalUnavailable &&
            splitBottomSegmentTotalMissing &&
            splitReceipt.total_needs_review,
          );

          return {
            response: jsonResponse({
              ok: true,
              pipeline_version: "scanner_premium_plus_v4_1",
              provider: "openai_vision_split",
              model: MODEL,
              stage: "openai_vision_split_retry",
              scan_strategy_used: "mini_split_3",
              scanStatus: merged.scanStatus,
              scan_status: merged.scanStatus,
              source: "openai_vision_split",
              text: browserText,
              confidence: String(merged.scanStatus || "").includes(
                "usable_review",
              )
                ? 68
                : 42,
              receipt: splitReceipt,
              openaiDurationMs:
                Number(primaryDurationMs || 0) +
                (splitRetry.splitResults || []).reduce(
                  (sum: number, result: Record<string, unknown>) =>
                    sum + Number(result.durationMs || 0),
                  0,
                ),
              totalDetectionDurationMs: localDurationMs,
              inputTokens:
                Number(primaryInputTokens || 0) +
                (splitRetry.splitResults || []).reduce(
                  (sum: number, result: Record<string, unknown>) =>
                    sum + Number(result.inputTokens || 0),
                  0,
                ),
              outputTokens:
                Number(primaryOutputTokens || 0) +
                (splitRetry.splitResults || []).reduce(
                  (sum: number, result: Record<string, unknown>) =>
                    sum + Number(result.outputTokens || 0),
                  0,
                ),
              estimatedCostEur: null,
              fast_local_extraction_used: true,
              openai_called: true,
              text_ai_used: false,
              vision_used: true,
              scan_ai_calls_count:
                Number(
                  primaryStage === "openai_vision_primary_exception" ? 0 : 1,
                ) + (splitRetry.splitResults || []).length,
              split_retry_eligible: true,
              split_retry_used: true,
              split_retry_skipped_reason: "",
              split_segments_count: (splitRetry.splitResults || []).length,
              split_segments_strategy: "vertical_3_overlap",
              split_segments_overlap_percent: 8,
              split_segments_results: splitSegmentsResults,
              split_segments_success_count:
                splitDiagnostics.split_segments_success_count,
              split_segments_timeout_count:
                splitDiagnostics.split_segments_timeout_count,
              split_total_input_tokens:
                splitDiagnostics.split_total_input_tokens,
              split_total_output_tokens:
                splitDiagnostics.split_total_output_tokens,
              split_total_duration_ms: splitDiagnostics.split_total_duration_ms,
              split_cost_warning: splitDiagnostics.split_cost_warning,
              recovery_ratio_raw: splitDiagnostics.recovery_ratio_raw,
              recovery_ratio: splitDiagnostics.recovery_ratio,
              recovery_ratio_capped: splitDiagnostics.recovery_ratio_capped,
              recovery_ratio_status: splitDiagnostics.recovery_ratio_status,
              expected_items_min_is_proven:
                splitDiagnostics.expected_items_min_is_proven,
              recovery_ratio_denominator_source:
                splitDiagnostics.recovery_ratio_denominator_source,
              recovery_ratio_blocked_reason:
                splitDiagnostics.recovery_ratio_blocked_reason,
              split_failure_reason: splitDiagnostics.split_failure_reason,
              rotation_applied:
                requestImageSize.rotationApplied ??
                requestImageSize.rotation_applied ??
                null,
              orientation_confidence: requestImageSize.orientation ? 85 : 45,
              deskew_applied: Array.isArray(requestImageSize.preProcessing)
                ? requestImageSize.preProcessing.includes(
                    "soft_deskew_orientation",
                  )
                : false,
              segment_quality_score: segmentQualityScore,
              image_quality_warning: imageQualityWarning,
              split_after_rotation:
                Number(
                  requestImageSize.rotationApplied ??
                    requestImageSize.rotation_applied ??
                    0,
                ) !== 0,
              local_ocr_available: localOcrAvailable,
              browserTextLength: browserText.length,
              edge_text_length: browserText.length,
              text_empty_reason: textEmptyReason,
              ...localOcrDiagnostics,
              total_verified_against_local_ocr:
                splitReceipt.total_raw_text_verified_against_ocr === true &&
                localOcrAvailable,
              total_verified_against_segment_text:
                splitReceipt.total_verified_against_segment_text === true,
              scan_reliability_blocked_reason: scanReliabilityBlockedReason,
              primary_timeout_total_unavailable: primaryTimeoutTotalUnavailable,
              split_bottom_segment_total_missing:
                splitBottomSegmentTotalMissing,
              total_missing_after_primary_timeout:
                totalMissingAfterPrimaryTimeout,
              scan_strategy_used_detail: "primary_failed_then_mini_split_3",
              primary_stage: primaryStage,
              primary_error: primaryError,
              fallback_stage: "openai_vision_split_retry",
              premium_plus_detected: isPremiumPlus,
              segments_received_by_edge_function: imageSegments.length,
              premium_plus_daily_ai_limit: PREMIUM_PLUS_DAILY_AI_LIMIT,
              premium_plus_split_retry_daily_limit:
                SPLIT_RETRY_DAILY_LIMIT_PREMIUM_PLUS,
              strong_fallback_used: false,
              items_detected_before_openai: itemsDetectedBeforeOpenAi,
              total_detected_before_openai: totalDetectedBeforeOpenAi,
              items_detected_by_vision: primaryRawItemsDetected,
              raw_items_detected_by_vision: primaryRawItemsDetected,
              reliable_items_detected_by_vision: primaryReliableItemsDetected,
              raw_items_detected_by_split: Array.isArray(splitReceipt.items)
                ? splitReceipt.items.length
                : 0,
              reliable_items_detected_by_split: merged.reliableItemsCount,
              calculated_items_sum: sumReceiptItems(splitReceipt.items || []),
              total_detected_by_vision: primaryTotalDetected,
              total_estimated_from_items: false,
              total_needs_review: Boolean(splitReceipt.total_needs_review),
              split_total_value: merged.splitTotalValue,
              split_total_raw_text: merged.splitTotalRawText,
              split_total_confidence: merged.splitTotalConfidence,
              preserved_primary_total_value:
                merged.preservedPrimaryTotalValue || null,
              preserved_primary_total_raw_text:
                merged.preservedPrimaryTotalRawText || "",
              preserved_primary_total_confidence:
                merged.preservedPrimaryTotalConfidence || 0,
              total_raw_text_verified_against_ocr:
                splitReceipt.total_raw_text_verified_against_ocr === true,
              total_rejected_reason: splitReceipt.total_rejected_reason || "",
              total_raw_text: splitReceipt.total_raw_text || "",
              total_confidence: splitReceipt.total_confidence || 0,
              total_source:
                splitReceipt.total_source || "missing_or_unreliable",
              estimated_items_sum: splitReceipt.estimated_items_sum ?? null,
              expected_items_min:
                merged.expectedItemsMin || expectedItemsMin || null,
              expected_items_source: merged.expectedItemsSource || "not_found",
              declared_items_count: merged.declaredItemsCount || null,
              declared_items_raw_text: merged.declaredItemsRawText || "",
              items_count_status: merged.declaredItemsCount
                ? "declared"
                : "unknown",
              diagnostics: {
                split_retry_eligible: true,
                split_retry_used: true,
                split_retry_skipped_reason: "",
                split_segments_count: (splitRetry.splitResults || []).length,
                split_segments_results: splitSegmentsResults,
                split_segments_success_count:
                  splitDiagnostics.split_segments_success_count,
                split_segments_timeout_count:
                  splitDiagnostics.split_segments_timeout_count,
                split_total_input_tokens:
                  splitDiagnostics.split_total_input_tokens,
                split_total_output_tokens:
                  splitDiagnostics.split_total_output_tokens,
                split_total_duration_ms:
                  splitDiagnostics.split_total_duration_ms,
                split_cost_warning: splitDiagnostics.split_cost_warning,
                recovery_ratio_raw: splitDiagnostics.recovery_ratio_raw,
                recovery_ratio: splitDiagnostics.recovery_ratio,
                recovery_ratio_capped: splitDiagnostics.recovery_ratio_capped,
                recovery_ratio_status: splitDiagnostics.recovery_ratio_status,
                expected_items_min_is_proven:
                  splitDiagnostics.expected_items_min_is_proven,
                recovery_ratio_denominator_source:
                  splitDiagnostics.recovery_ratio_denominator_source,
                recovery_ratio_blocked_reason:
                  splitDiagnostics.recovery_ratio_blocked_reason,
                split_failure_reason: splitDiagnostics.split_failure_reason,
                rotation_applied:
                  requestImageSize.rotationApplied ??
                  requestImageSize.rotation_applied ??
                  null,
                orientation_confidence: requestImageSize.orientation ? 85 : 45,
                deskew_applied: Array.isArray(requestImageSize.preProcessing)
                  ? requestImageSize.preProcessing.includes(
                      "soft_deskew_orientation",
                    )
                  : false,
                segment_quality_score: segmentQualityScore,
                image_quality_warning: imageQualityWarning,
                split_after_rotation:
                  Number(
                    requestImageSize.rotationApplied ??
                      requestImageSize.rotation_applied ??
                      0,
                  ) !== 0,
                local_ocr_available: localOcrAvailable,
                browserTextLength: browserText.length,
                edge_text_length: browserText.length,
                text_empty_reason: textEmptyReason,
                ...localOcrDiagnostics,
                total_verified_against_local_ocr:
                  splitReceipt.total_raw_text_verified_against_ocr === true &&
                  localOcrAvailable,
                total_verified_against_segment_text:
                  splitReceipt.total_verified_against_segment_text === true,
                scan_reliability_blocked_reason: scanReliabilityBlockedReason,
                primary_timeout_total_unavailable:
                  primaryTimeoutTotalUnavailable,
                split_bottom_segment_total_missing:
                  splitBottomSegmentTotalMissing,
                total_missing_after_primary_timeout:
                  totalMissingAfterPrimaryTimeout,
                primary_stage: primaryStage,
                primary_error: primaryError,
                fallback_stage: "openai_vision_split_retry",
                premium_plus_detected: isPremiumPlus,
                segments_received_by_edge_function: imageSegments.length,
              },
            }),
            diagnostics: null,
          };
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
        };
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
            ...localOcrDiagnostics,
          },
        };
      }
    };

    const localCanSkipOpenAi =
      !localArticlesBlockedForLearning &&
      localExtractionIsHighConfidence({
        totalDetected: totalDetectedBeforeOpenAi,
        itemCount: itemsDetectedBeforeOpenAi,
        expectedItemsMin,
      });

    if (localArticlesBlockedForLearning) {
      console.info(
        "[scan-receipt-ocr] local_budget_ok_but_articles_blocked_force_vision",
        {
          scheduled: true,
          reason: "budget_reliable_but_articles_blocked",
          budget_status: localReceipt.budget_status,
          items_quality_status: localReceipt.items_quality_status,
          smart_shopping_safe: localReceipt.smart_shopping_safe,
          smart_shopping_blocked_reasons:
            localReceipt.smart_shopping_blocked_reasons,
          final_scan_status: localReceipt.final_scan_status,
          items_detected_before_openai: itemsDetectedBeforeOpenAi,
          total_detected_before_openai: totalDetectedBeforeOpenAi,
          expected_items_min: expectedItemsMin || null,
        },
      );
    }

    if (localCanSkipOpenAi) {
      console.info("[scan-receipt-ocr] openai_vision_primary", {
        scheduled: false,
        reason: "local_high_confidence_skip_openai",
        items_detected_before_openai: itemsDetectedBeforeOpenAi,
        total_detected_before_openai: totalDetectedBeforeOpenAi,
        expected_items_min: expectedItemsMin || null,
        expected_items_source: declaredEvidence.count
          ? declaredEvidence.source
          : "not_found",
        declared_items_count: declaredEvidence.count || null,
        declared_items_raw_text: declaredEvidence.raw || "",
        items_count_status: declaredEvidence.count ? "declared" : "unknown",
        expected_items_min_is_proven: expectedItemsMin > 0,
        ...localOcrDiagnostics,
      });

      return jsonResponse({
        ok: true,
        pipeline_version: "scanner_v2_ai_first_cost_guard",
        provider: "local-ocr-regex-fallback",
        model: MODEL,
        stage: "fast_local_extraction",
        scan_strategy_used: localExactDeclaredCount
          ? "local_fast"
          : "local_ocr_regex",
        scanStatus: scanStatus,
        scan_status: scanStatus,
        scan_status_legacy: localReceipt.scan_status_legacy || scanStatusLegacy,
        final_scan_status: localReceipt.final_scan_status || scanStatus,
        source: "local-ocr-regex-fallback",
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
        local_scan_sufficient: true,
        local_articles_blocked_for_learning: false,
        local_scan_sufficient_reason: localExactDeclaredCount
          ? "store_date_total_items_declared_from_local_ocr"
          : "store_date_total_items_detected_locally",
        ai_skipped_reason: "local_scan_sufficient",
        items_detected_before_openai: itemsDetectedBeforeOpenAi,
        total_detected_before_openai: totalDetectedBeforeOpenAi,
        budget_status: localReceipt.budget_status,
        items_quality_status: localReceipt.items_quality_status,
        smart_shopping_safe: localReceipt.smart_shopping_safe,
        smart_shopping_blocked_reasons:
          localReceipt.smart_shopping_blocked_reasons,
        calculated_items_sum_before_section_filter:
          localReceipt.calculated_items_sum_before_section_filter,
        calculated_items_sum_after_section_filter:
          localReceipt.calculated_items_sum_after_section_filter,
        section_subtotals_rejected_count:
          localReceipt.section_subtotals_rejected_count,
        section_subtotals_rejected_amount:
          localReceipt.section_subtotals_rejected_amount,
        section_subtotals_rejected_lines:
          localReceipt.section_subtotals_rejected_lines,
        items_kept_lines: localReceipt.items_kept_lines,
        items_total_vs_receipt_total_delta:
          localReceipt.items_total_vs_receipt_total_delta,
        ocr_text_has_total: localReceipt.ocr_text_has_total,
        ocr_text_has_payment: localReceipt.ocr_text_has_payment,
        ocr_text_has_declared_items_count:
          localReceipt.ocr_text_has_declared_items_count,
        ocr_text_last_lines: localReceipt.ocr_text_last_lines,
        local_total_missing_reason: localReceipt.local_total_missing_reason,
        expected_items_min: expectedItemsMin || null,
        expected_items_source: declaredEvidence.count
          ? declaredEvidence.source
          : "not_found",
        declared_items_count: declaredEvidence.count || null,
        declared_items_raw_text: declaredEvidence.raw || "",
        items_count_status: declaredEvidence.count ? "declared" : "unknown",
        expected_items_min_is_proven: expectedItemsMin > 0,
        ...localOcrDiagnostics,
        expected_items_count: declaredItemsCount || null,
        premium_plus_daily_ai_limit: PREMIUM_PLUS_DAILY_AI_LIMIT,
      });
    }

    console.info("[scan-receipt-ocr] openai_vision_primary", {
      scheduled: true,
      reason: localArticlesBlockedForLearning
        ? "local_budget_ok_but_articles_blocked"
        : "ai_first_food_receipt_pipeline",
      image_size: requestImageSize,
      browserTextLength: browserText.length,
      local_items_detected: itemsDetectedBeforeOpenAi,
      local_total_detected: totalDetectedBeforeOpenAi,
      local_articles_blocked_for_learning: localArticlesBlockedForLearning,
      items_quality_status: localReceipt.items_quality_status,
      smart_shopping_safe: localReceipt.smart_shopping_safe,
      final_scan_status: localReceipt.final_scan_status,
    });

    try {
      markAiCalledAfterLocalOcrFailure();
      const visionPrimary = await runOpenAiVisionFallback({
        imageBase64,
        mimeType,
        imageSize: requestImageSize,
        hintText: browserText,
      });

      if (visionPrimary && !("error" in visionPrimary)) {
        let visionExpectedMinBeforeMerge = 0;
        let visionValidation;
        try {
          visionExpectedMinBeforeMerge = isLikelyFoodTicket(
            visionPrimary.receipt,
            browserText,
          )
            ? expectedItemsForFoodTicket(browserText)
            : 0;
          visionValidation = applyVisionServerValidation({
            receipt: visionPrimary.receipt,
            hintText: browserText,
            expectedItemsMin: visionExpectedMinBeforeMerge,
          });
        } catch (validationError) {
          const splitAttempt = await runPremiumPlusSplitOrNull({
            primaryStage: "openai_vision_validation",
            primaryError: errorMessage(validationError),
            providerMessage: `Validation serveur du scan impossible: ${errorMessage(validationError)}`,
            baseReceipt: {
              ...localReceipt,
              ...visionPrimary.receipt,
              store_name: String(
                visionPrimary.receipt?.store_name ||
                  localReceipt.store_name ||
                  "",
              ),
              normalized_store_name: String(
                visionPrimary.receipt?.normalized_store_name ||
                  localReceipt.normalized_store_name ||
                  localReceipt.store_name ||
                  "",
              ),
              store_location: String(
                visionPrimary.receipt?.store_location ||
                  localReceipt.store_location ||
                  "",
              ),
            },
            primaryDurationMs: Number(visionPrimary.durationMs || 0),
            primaryInputTokens: Number(visionPrimary.inputTokens || 0),
            primaryOutputTokens: Number(visionPrimary.outputTokens || 0),
            primaryReliableItemsDetected: 0,
            primaryRawItemsDetected: Array.isArray(visionPrimary.receipt?.items)
              ? visionPrimary.receipt.items.length
              : 0,
            primaryTotalDetected:
              Number(visionPrimary.receipt?.total_amount || 0) > 0,
            primaryConfidence: 25,
          });
          if (splitAttempt.response) return splitAttempt.response;
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
          });
        }
        const validatedVisionReceipt = visionValidation.receipt;
        const primaryVisionItems = Array.isArray(validatedVisionReceipt.items)
          ? validatedVisionReceipt.items
          : [];
        const shouldPreferPrimaryVisionItems =
          primaryVisionItems.length >= 5 &&
          visionValidation.reliableItemsCount >= 5;
        const sourceItems = shouldPreferPrimaryVisionItems
          ? primaryVisionItems
          : pickBestItems(primaryVisionItems, localReceipt.items);
        const mergedItems = sourceItems.map((item) =>
          visionValidation.scanStatus === "partial_low_items"
            ? {
                ...item,
                item_status: "a_verifier",
                review_status: "needs_review",
                needs_review: true,
                confidence_score: Math.min(
                  Number(item.confidence_score || 45),
                  45,
                ),
              }
            : item,
        );
        let visionTotal = Number(validatedVisionReceipt.total_amount || 0);
        const visionReceipt = {
          ...localReceipt,
          ...validatedVisionReceipt,
          store_name: String(
            validatedVisionReceipt.store_name || localReceipt.store_name || "",
          ),
          purchase_date: String(
            validatedVisionReceipt.purchase_date ||
              localReceipt.purchase_date ||
              "",
          ),
          total_amount: visionTotal || null,
          total_status: visionTotal ? "detected" : "missing_or_unreliable",
          total_needs_review: !visionTotal,
          total_source: visionTotal
            ? validatedVisionReceipt.total_source
            : "missing_or_unreliable",
          total_raw_text: visionTotal
            ? validatedVisionReceipt.total_raw_text
            : "",
          total_confidence: visionTotal
            ? validatedVisionReceipt.total_confidence
            : 0,
          estimated_items_sum: !visionTotal
            ? sumReceiptItems(mergedItems)
            : null,
          items: mergedItems,
          warnings: visionValidation.warnings,
        };
        const primaryVisionTotalEvidence =
          primaryOpenAiTotalEvidence(visionReceipt);
        if (!visionTotal && primaryVisionTotalEvidence.amount > 0) {
          visionTotal = primaryVisionTotalEvidence.amount;
          Object.assign(visionReceipt, {
            total_amount: primaryVisionTotalEvidence.amount,
            total_status: "detected",
            total_needs_review: false,
            total_source: primaryVisionTotalEvidence.source,
            total_raw_text: primaryVisionTotalEvidence.rawText,
            total_confidence: primaryVisionTotalEvidence.confidence,
            total_rejected_reason: "",
            total_preserved_from_openai_primary: true,
            estimated_items_sum: null,
          });
        }
        const visionItemsCount = mergedItems.length;
        const visionFoodTicket = isLikelyFoodTicket(visionReceipt, browserText);
        const visionExpectedMin = visionFoodTicket
          ? expectedItemsForFoodTicket(browserText)
          : 0;
        const primaryVisionEnoughWithoutSplit = primaryVisionCanStopBeforeSplit(
          {
            receipt: visionReceipt,
            visionItemsCount,
            reliableItemsCount: visionValidation.reliableItemsCount,
            expectedItemsMin: visionExpectedMin,
          },
        );
        const canUseEstimatedTotal =
          visionValidation.scanStatus !== "partial_low_items" &&
          visionTotal <= 0 &&
          mergedItems.length >= 3;
        const provisionalTotal =
          visionTotal ||
          (canUseEstimatedTotal ? sumReceiptItems(mergedItems) : 0);
        const needsReview =
          !visionTotal ||
          Boolean(visionReceipt.needs_review) ||
          (visionExpectedMin > 0 &&
            visionItemsCount < Math.ceil(visionExpectedMin * 0.6));
        const visionScanStatus = primaryVisionEnoughWithoutSplit
          ? "usable_review"
          : visionValidation.scanStatus === "partial_low_items" || needsReview
            ? "partial_low_items"
            : "partial";
        const shortTicketSplitDisabled =
          visionExpectedMin > 0 && visionExpectedMin <= 10;
        const shouldSplit =
          primaryVisionEnoughWithoutSplit || shortTicketSplitDisabled
            ? false
            : shouldRunSplitRetry({
              isPremiumPlus,
              scanStatus: visionScanStatus,
              totalNeedsReview: !visionTotal,
              expectedItemsMin: visionExpectedMin,
              reliableItemsDetected: visionValidation.reliableItemsCount,
              confidence: visionScanStatus === "partial_low_items" ? 45 : 88,
              imageSize: requestImageSize,
            });

        if (shouldSplit) {
          console.info("[scan-receipt-ocr] premium_plus_split_retry", {
            scheduled: true,
            scan_strategy_used: "mini_split_3",
            expected_items_min: visionExpectedMin,
            reliable_items_detected_by_vision:
              visionValidation.reliableItemsCount,
            split_segments_count: imageSegments.length,
          });

          markAiCalledAfterLocalOcrFailure();
          const splitRetry = await runSplitRetry({
            imageSegments,
            browserText,
            baseReceipt: visionReceipt,
            expectedItemsMin: visionExpectedMin,
            imageQualityWarning,
          });

          if (!splitRetry.error && splitRetry.merged) {
            const merged = splitRetry.merged;
            const splitReceipt = merged.receipt;
            const splitDiagnostics = buildSplitDiagnostics({
              splitResults: splitRetry.splitResults || [],
              expectedItemsMin: merged.expectedItemsMin || visionExpectedMin,
              reliableItemsDetectedBySplit: merged.reliableItemsCount,
            });
            const splitSegmentsResults =
              splitDiagnostics.split_segments_results;
            const scanReliabilityBlockedReason =
              !localOcrAvailable &&
              imageQualityWarning &&
              Boolean(splitReceipt.total_needs_review)
                ? "local_ocr_empty_quality_low_total_unreliable"
                : imageQualityWarning &&
                    splitDiagnostics.recovery_ratio !== null &&
                    Number(splitDiagnostics.recovery_ratio) < 0.4
                  ? "low_image_quality_and_low_recovery"
                  : "";
            const primaryTimeoutTotalUnavailable = false;
            const splitBottomSegment = splitSegmentsResults.find(
              (segment: Record<string, unknown>) =>
                String(segment.segment_name || segment.segment || "") ===
                "bottom",
            );
            const splitBottomSegmentTotalMissing = Boolean(
              splitBottomSegment && splitBottomSegment.total_found !== true,
            );
            const totalMissingAfterPrimaryTimeout = false;

            return jsonResponse({
              ok: true,
              pipeline_version: "scanner_premium_plus_v4_1",
              provider: "openai_vision_split",
              model: MODEL,
              stage: "openai_vision_split_retry",
              scan_strategy_used: "mini_split_3",
              scanStatus: merged.scanStatus,
              scan_status: merged.scanStatus,
              source: "openai_vision_split",
              text: browserText,
              confidence: String(merged.scanStatus || "").includes(
                "usable_review",
              )
                ? 68
                : 42,
              receipt: splitReceipt,
              openaiDurationMs:
                Number(visionPrimary.durationMs || 0) +
                (splitRetry.splitResults || []).reduce(
                  (sum: number, result: Record<string, unknown>) =>
                    sum + Number(result.durationMs || 0),
                  0,
                ),
              totalDetectionDurationMs: localDurationMs,
              inputTokens:
                Number(visionPrimary.inputTokens || 0) +
                (splitRetry.splitResults || []).reduce(
                  (sum: number, result: Record<string, unknown>) =>
                    sum + Number(result.inputTokens || 0),
                  0,
                ),
              outputTokens:
                Number(visionPrimary.outputTokens || 0) +
                (splitRetry.splitResults || []).reduce(
                  (sum: number, result: Record<string, unknown>) =>
                    sum + Number(result.outputTokens || 0),
                  0,
                ),
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
              premium_plus_split_retry_daily_limit:
                SPLIT_RETRY_DAILY_LIMIT_PREMIUM_PLUS,
              split_retry_used: true,
              strong_fallback_used: false,
              items_detected_before_openai: itemsDetectedBeforeOpenAi,
              total_detected_before_openai: totalDetectedBeforeOpenAi,
              items_detected_by_vision: visionItemsCount,
              raw_items_detected_by_vision: visionValidation.rawItemsCount,
              reliable_items_detected_by_vision:
                visionValidation.reliableItemsCount,
              raw_items_detected_by_split: Array.isArray(splitReceipt.items)
                ? splitReceipt.items.length
                : 0,
              reliable_items_detected_by_split: merged.reliableItemsCount,
              calculated_items_sum: sumReceiptItems(splitReceipt.items || []),
              total_detected_by_vision: visionTotal > 0,
              total_estimated_from_items: false,
              total_needs_review: Boolean(splitReceipt.total_needs_review),
              openai_total_value: visionReceipt.openai_total_value ?? null,
              openai_total_raw_text: visionReceipt.openai_total_raw_text || "",
              openai_total_confidence:
                visionReceipt.openai_total_confidence ?? 0,
              split_total_value: merged.splitTotalValue,
              split_total_raw_text: merged.splitTotalRawText,
              split_total_confidence: merged.splitTotalConfidence,
              preserved_primary_total_value:
                merged.preservedPrimaryTotalValue || null,
              preserved_primary_total_raw_text:
                merged.preservedPrimaryTotalRawText || "",
              preserved_primary_total_confidence:
                merged.preservedPrimaryTotalConfidence || 0,
              total_raw_text_verified_against_ocr:
                splitReceipt.total_raw_text_verified_against_ocr === true,
              total_rejected_reason: splitReceipt.total_rejected_reason || "",
              total_raw_text: splitReceipt.total_raw_text || "",
              total_confidence: splitReceipt.total_confidence || 0,
              total_source:
                splitReceipt.total_source || "missing_or_unreliable",
              estimated_items_sum: splitReceipt.estimated_items_sum ?? null,
              expected_items_min:
                merged.expectedItemsMin || visionExpectedMin || null,
              expected_items_source: merged.expectedItemsSource || "not_found",
              declared_items_count: merged.declaredItemsCount || null,
              declared_items_raw_text: merged.declaredItemsRawText || "",
              items_count_status: merged.declaredItemsCount
                ? "declared"
                : "unknown",
              split_segments_count: (splitRetry.splitResults || []).length,
              split_segments_strategy: "vertical_3_overlap",
              split_segments_overlap_percent: 8,
              split_segments_results: splitSegmentsResults,
              split_segments_success_count:
                splitDiagnostics.split_segments_success_count,
              split_segments_timeout_count:
                splitDiagnostics.split_segments_timeout_count,
              split_total_input_tokens:
                splitDiagnostics.split_total_input_tokens,
              split_total_output_tokens:
                splitDiagnostics.split_total_output_tokens,
              split_total_duration_ms: splitDiagnostics.split_total_duration_ms,
              split_cost_warning: splitDiagnostics.split_cost_warning,
              recovery_ratio_raw: splitDiagnostics.recovery_ratio_raw,
              recovery_ratio: splitDiagnostics.recovery_ratio,
              recovery_ratio_capped: splitDiagnostics.recovery_ratio_capped,
              recovery_ratio_status: splitDiagnostics.recovery_ratio_status,
              expected_items_min_is_proven:
                splitDiagnostics.expected_items_min_is_proven,
              recovery_ratio_denominator_source:
                splitDiagnostics.recovery_ratio_denominator_source,
              recovery_ratio_blocked_reason:
                splitDiagnostics.recovery_ratio_blocked_reason,
              split_failure_reason: splitDiagnostics.split_failure_reason,
              rotation_applied:
                requestImageSize.rotationApplied ??
                requestImageSize.rotation_applied ??
                null,
              orientation_confidence: requestImageSize.orientation ? 85 : 45,
              deskew_applied: Array.isArray(requestImageSize.preProcessing)
                ? requestImageSize.preProcessing.includes(
                    "soft_deskew_orientation",
                  )
                : false,
              segment_quality_score: segmentQualityScore,
              image_quality_warning: imageQualityWarning,
              split_after_rotation:
                Number(
                  requestImageSize.rotationApplied ??
                    requestImageSize.rotation_applied ??
                    0,
                ) !== 0,
              local_ocr_available: localOcrAvailable,
              browserTextLength: browserText.length,
              edge_text_length: browserText.length,
              text_empty_reason: textEmptyReason,
              ...localOcrDiagnostics,
              total_verified_against_local_ocr:
                splitReceipt.total_raw_text_verified_against_ocr === true &&
                localOcrAvailable,
              total_verified_against_segment_text:
                splitReceipt.total_verified_against_segment_text === true,
              scan_reliability_blocked_reason: scanReliabilityBlockedReason,
              primary_timeout_total_unavailable: primaryTimeoutTotalUnavailable,
              split_bottom_segment_total_missing:
                splitBottomSegmentTotalMissing,
              total_missing_after_primary_timeout:
                totalMissingAfterPrimaryTimeout,
              diagnostics: {
                split_retry_eligible: true,
                split_retry_used: true,
                split_retry_skipped_reason: "",
                split_segments_count: (splitRetry.splitResults || []).length,
                split_segments_results: splitSegmentsResults,
                split_segments_success_count:
                  splitDiagnostics.split_segments_success_count,
                split_segments_timeout_count:
                  splitDiagnostics.split_segments_timeout_count,
                split_total_input_tokens:
                  splitDiagnostics.split_total_input_tokens,
                split_total_output_tokens:
                  splitDiagnostics.split_total_output_tokens,
                split_total_duration_ms:
                  splitDiagnostics.split_total_duration_ms,
                split_cost_warning: splitDiagnostics.split_cost_warning,
                recovery_ratio_raw: splitDiagnostics.recovery_ratio_raw,
                recovery_ratio: splitDiagnostics.recovery_ratio,
                recovery_ratio_capped: splitDiagnostics.recovery_ratio_capped,
                recovery_ratio_status: splitDiagnostics.recovery_ratio_status,
                expected_items_min_is_proven:
                  splitDiagnostics.expected_items_min_is_proven,
                recovery_ratio_denominator_source:
                  splitDiagnostics.recovery_ratio_denominator_source,
                recovery_ratio_blocked_reason:
                  splitDiagnostics.recovery_ratio_blocked_reason,
                split_failure_reason: splitDiagnostics.split_failure_reason,
                split_improved_items: merged.improved,
                rotation_applied:
                  requestImageSize.rotationApplied ??
                  requestImageSize.rotation_applied ??
                  null,
                orientation_confidence: requestImageSize.orientation ? 85 : 45,
                deskew_applied: Array.isArray(requestImageSize.preProcessing)
                  ? requestImageSize.preProcessing.includes(
                      "soft_deskew_orientation",
                    )
                  : false,
                segment_quality_score: segmentQualityScore,
                image_quality_warning: imageQualityWarning,
                split_after_rotation:
                  Number(
                    requestImageSize.rotationApplied ??
                      requestImageSize.rotation_applied ??
                      0,
                  ) !== 0,
                local_ocr_available: localOcrAvailable,
                browserTextLength: browserText.length,
                edge_text_length: browserText.length,
                text_empty_reason: textEmptyReason,
                ...localOcrDiagnostics,
                total_verified_against_local_ocr:
                  splitReceipt.total_raw_text_verified_against_ocr === true &&
                  localOcrAvailable,
                total_verified_against_segment_text:
                  splitReceipt.total_verified_against_segment_text === true,
                scan_reliability_blocked_reason: scanReliabilityBlockedReason,
                primary_timeout_total_unavailable:
                  primaryTimeoutTotalUnavailable,
                split_bottom_segment_total_missing:
                  splitBottomSegmentTotalMissing,
                total_missing_after_primary_timeout:
                  totalMissingAfterPrimaryTimeout,
                primary_stage: "openai_vision_primary",
                primary_error: "",
                fallback_stage: "openai_vision_split_retry",
                premium_plus_detected: isPremiumPlus,
                segments_received_by_edge_function: imageSegments.length,
                user_plan: userPlan,
              },
            });
          }
        }

        if (provisionalTotal > 0 || visionItemsCount >= 3) {
          return jsonResponse({
            ok: true,
            pipeline_version: "scanner_premium_plus_v4_1",
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
            split_retry_skipped_reason: primaryVisionEnoughWithoutSplit
              ? "primary_vision_sufficient_short_ticket"
              : shortTicketSplitDisabled
                ? "short_ticket_split_disabled_v4_1"
                : "not_needed",
            short_ticket_split_disabled: shortTicketSplitDisabled,
            primary_vision_sufficient_without_split:
              primaryVisionEnoughWithoutSplit,
            strong_fallback_used: false,
            items_detected_before_openai: itemsDetectedBeforeOpenAi,
            total_detected_before_openai: totalDetectedBeforeOpenAi,
            items_detected_by_vision: visionItemsCount,
            raw_items_detected_by_vision: visionValidation.rawItemsCount,
            reliable_items_detected_by_vision:
              visionValidation.reliableItemsCount,
            calculated_items_sum: visionValidation.calculatedItemsSum,
            total_difference: visionValidation.totalDifference,
            discarded_hallucinated_items_count:
              visionValidation.discardedHallucinatedItems,
            total_detected_by_vision: visionTotal > 0,
            total_estimated_from_items: false,
            total_needs_review: !visionTotal,
            preserved_primary_total_value:
              primaryVisionTotalEvidence.amount || null,
            preserved_primary_total_raw_text:
              primaryVisionTotalEvidence.rawText || "",
            preserved_primary_total_confidence:
              primaryVisionTotalEvidence.confidence || 0,
            openai_total_value: visionReceipt.openai_total_value ?? null,
            openai_total_raw_text: visionReceipt.openai_total_raw_text || "",
            openai_total_confidence: visionReceipt.openai_total_confidence ?? 0,
            total_raw_text_verified_against_ocr:
              visionReceipt.total_raw_text_verified_against_ocr === true,
            total_rejected_reason: visionReceipt.total_rejected_reason || "",
            total_raw_text: visionReceipt.total_raw_text,
            total_confidence: visionReceipt.total_confidence,
            total_source: visionReceipt.total_source,
            expected_items_min: visionExpectedMin,
            premium_plus_daily_ai_limit: PREMIUM_PLUS_DAILY_AI_LIMIT,
          });
        }
      }

      if (visionPrimary && "error" in visionPrimary) {
        console.warn(
          "[scan-receipt-ocr] openai_vision_primary_failed",
          visionPrimary,
        );
        const splitAttempt = await runPremiumPlusSplitOrNull({
          primaryStage: "openai_vision_primary_failed",
          primaryError: String(
            visionPrimary.message ||
              visionPrimary.code ||
              "Analyse IA partielle ou invalide.",
          ),
          providerMessage: String(
            visionPrimary.message ||
              visionPrimary.code ||
              "Analyse IA partielle ou invalide.",
          ),
          baseReceipt: localReceipt,
          primaryDurationMs: Number(visionPrimary.durationMs || 0),
          primaryInputTokens: Number(visionPrimary.inputTokens || 0),
          primaryOutputTokens: Number(visionPrimary.outputTokens || 0),
          primaryReliableItemsDetected: 0,
          primaryRawItemsDetected: 0,
          primaryTotalDetected: false,
          primaryConfidence: 25,
        });
        if (splitAttempt.response) return splitAttempt.response;
        return manualReviewResponse({
          stage: "openai_vision_primary",
          providerMessage: String(
            visionPrimary.message ||
              visionPrimary.code ||
              "Analyse IA partielle ou invalide.",
          ),
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
        });
      }
    } catch (visionPrimaryError) {
      console.warn("[scan-receipt-ocr] openai_vision_primary_exception", {
        message:
          visionPrimaryError instanceof Error
            ? visionPrimaryError.message
            : String(visionPrimaryError),
        model: MODEL,
      });
      const splitAttempt = await runPremiumPlusSplitOrNull({
        primaryStage: "openai_vision_primary_exception",
        primaryError: errorMessage(visionPrimaryError),
        providerMessage: `Exception scanner recuperee: ${errorMessage(visionPrimaryError)}`,
        baseReceipt: localReceipt,
        primaryConfidence: 25,
      });
      if (splitAttempt.response) return splitAttempt.response;
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
          ...localOcrDiagnostics,
          ...(splitAttempt.diagnostics || {}),
        },
      });
    }

    if (totalDetectedBeforeOpenAi || itemsDetectedBeforeOpenAi >= 3) {
      const splitAttempt = await runPremiumPlusSplitOrNull({
        primaryStage: "openai_vision_primary_local_fallback",
        primaryError:
          "Primary vision did not return usable data before local fallback.",
        providerMessage:
          "OpenAI Vision tried once; local fallback available but Premium+ split should run first.",
        baseReceipt: localReceipt,
        primaryConfidence: 25,
      });
      if (splitAttempt.response) return splitAttempt.response;

      const trustedLocalTotal =
        localReceipt.total_amount > 0 ? localReceipt.total_amount : 0;
      const partialReceipt = {
        ...localReceipt,
        total_amount: trustedLocalTotal || null,
        total_status:
          trustedLocalTotal > 0 ? "detected" : "missing_or_unreliable",
        total_needs_review: trustedLocalTotal <= 0,
        total_source:
          trustedLocalTotal > 0
            ? "trusted_total_line"
            : "missing_or_unreliable",
        total_raw_text: "",
        total_confidence: trustedLocalTotal > 0 ? 0.78 : 0,
        estimated_items_sum:
          trustedLocalTotal > 0 ? null : sumReceiptItems(localReceipt.items),
        warnings: [
          ...(Array.isArray(localReceipt.warnings)
            ? localReceipt.warnings
            : []),
          ...(trustedLocalTotal > 0
            ? []
            : [
                "Total non lu avec certitude. Verification manuelle necessaire.",
              ]),
        ],
      };

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
        expected_items_min: expectedItemsMin || null,
        premium_plus_daily_ai_limit: PREMIUM_PLUS_DAILY_AI_LIMIT,
        split_retry_eligible: Boolean(
          splitAttempt.diagnostics?.split_retry_eligible,
        ),
        split_retry_used: Boolean(splitAttempt.diagnostics?.split_retry_used),
        split_retry_skipped_reason: String(
          splitAttempt.diagnostics?.split_retry_skipped_reason || "",
        ),
        split_segments_count: Number(
          splitAttempt.diagnostics?.split_segments_count || 0,
        ),
        split_segments_results: Array.isArray(
          splitAttempt.diagnostics?.split_segments_results,
        )
          ? splitAttempt.diagnostics.split_segments_results
          : [],
        primary_stage: String(
          splitAttempt.diagnostics?.primary_stage ||
            "openai_vision_primary_local_fallback",
        ),
        primary_error: splitAttempt.diagnostics?.primary_error || "",
        fallback_stage: "local_fallback_after_vision",
        premium_plus_detected: Boolean(
          splitAttempt.diagnostics?.premium_plus_detected,
        ),
        segments_received_by_edge_function: Number(
          splitAttempt.diagnostics?.segments_received_by_edge_function || 0,
        ),
      });
    }

    const splitAttempt = await runPremiumPlusSplitOrNull({
      primaryStage: "openai_vision_primary_no_usable_data",
      primaryError:
        "OpenAI Vision tried once; no usable receipt data was returned.",
      providerMessage:
        "OpenAI Vision tried once; no usable receipt data was returned.",
      baseReceipt: localReceipt,
      primaryConfidence: 25,
    });
    if (splitAttempt.response) return splitAttempt.response;

    return manualReviewResponse({
      stage: "openai_vision_primary",
      providerMessage:
        "OpenAI Vision tried once; no usable receipt data was returned.",
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
        ...localOcrDiagnostics,
        ...(splitAttempt.diagnostics || {}),
      },
    });

    if (!totalDetectedBeforeOpenAi) {
      console.info("[scan-receipt-ocr] server_ocr_fallback", {
        used: false,
        reason: "no_server_ocr_engine_available",
        openai_called: false,
        browserTextLength: browserText.length,
        items_detected_before_openai: itemsDetectedBeforeOpenAi,
        total_detected_before_openai: false,
      });

      if (browserText.trim().length >= 30) {
        console.info("[scan-receipt-ocr] openai_enrichment", {
          scheduled: true,
          openai_called: true,
          reason: "local_parser_failed_but_ocr_text_available",
          textLength: browserText.length,
          image_size: requestImageSize,
        });

        try {
          markAiCalledAfterLocalOcrFailure();
          const aiFallback = await runOpenAiTextFallback(
            browserText,
            requestImageSize,
          );
          if (
            aiFallback &&
            !("error" in aiFallback) &&
            aiFallback.receipt.total_amount > 0
          ) {
            const aiReceipt = {
              ...localReceipt,
              ...aiFallback.receipt,
              store_name:
                aiFallback.receipt.store_name || localReceipt.store_name,
              purchase_date:
                aiFallback.receipt.purchase_date || localReceipt.purchase_date,
              items: pickBestItems(
                aiFallback.receipt.items,
                localReceipt.items,
              ),
            };
            const aiItemsCount = aiReceipt.items.length;
            const aiFoodTicket = isLikelyFoodTicket(aiReceipt, browserText);
            const aiExpectedMin = aiFoodTicket ? 3 : 0;
            const aiScanStatus =
              aiFoodTicket && aiItemsCount < aiExpectedMin
                ? "partial_low_items"
                : "partial";

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
            });
          }

          if (aiFallback && "error" in aiFallback) {
            console.warn(
              "[scan-receipt-ocr] openai_text_fallback_failed",
              aiFallback,
            );
          }
        } catch (openAiError) {
          console.warn("[scan-receipt-ocr] openai_text_fallback_exception", {
            message:
              openAiError instanceof Error
                ? openAiError.message
                : String(openAiError),
            model: MODEL,
          });
        }
      }

      console.info("[scan-receipt-ocr] openai_enrichment", {
        scheduled: true,
        openai_called: true,
        reason: "local_parser_failed_total_absent_vision_fallback",
        textLength: browserText.length,
        image_size: requestImageSize,
      });

      try {
        markAiCalledAfterLocalOcrFailure();
        const visionFallback = await runOpenAiVisionFallback({
          imageBase64,
          mimeType,
          imageSize: requestImageSize,
          hintText: browserText,
        });

        if (
          visionFallback &&
          !("error" in visionFallback) &&
          visionFallback.receipt.total_amount > 0
        ) {
          const visionReceipt = {
            ...localReceipt,
            ...visionFallback.receipt,
            store_name:
              visionFallback.receipt.store_name || localReceipt.store_name,
            purchase_date:
              visionFallback.receipt.purchase_date ||
              localReceipt.purchase_date,
            items: pickBestItems(
              visionFallback.receipt.items,
              localReceipt.items,
            ),
          };
          const visionItemsCount = visionReceipt.items.length;
          const visionFoodTicket = isLikelyFoodTicket(
            visionReceipt,
            browserText,
          );
          const visionExpectedMin = visionFoodTicket ? 3 : 0;
          const visionScanStatus =
            visionFoodTicket && visionItemsCount < visionExpectedMin
              ? "partial_low_items"
              : "partial";

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
          });
        }

        if (visionFallback && "error" in visionFallback) {
          console.warn(
            "[scan-receipt-ocr] openai_vision_fallback_failed",
            visionFallback,
          );
        }
      } catch (openAiVisionError) {
        console.warn("[scan-receipt-ocr] openai_vision_fallback_exception", {
          message:
            openAiVisionError instanceof Error
              ? openAiVisionError.message
              : String(openAiVisionError),
          model: MODEL,
        });
      }

      if (itemsDetectedBeforeOpenAi >= 3) {
        const provisionalTotal = sumReceiptItems(localReceipt.items);
        const partialReceipt = {
          ...localReceipt,
          total_amount: provisionalTotal,
          total_status: "estimated_from_items",
        };

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
          expected_items_min: expectedItemsMin || null,
        });
      }

      return manualReviewResponse({
        stage: "server_ocr_fallback",
        providerMessage:
          "Total absent apres OCR local/regex et apres fallback IA.",
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
      });
    }

    if (
      isFoodTicket &&
      expectedItemsMin > 0 &&
      itemsDetectedBeforeOpenAi < Math.ceil(expectedItemsMin * 0.6)
    ) {
      console.info("[scan-receipt-ocr] openai_enrichment", {
        scheduled: true,
        openai_called: true,
        reason: "local_items_below_quality_threshold",
        textLength: browserText.length,
        items_detected_before_openai: itemsDetectedBeforeOpenAi,
        expected_items_min: expectedItemsMin || null,
        image_size: requestImageSize,
      });

      try {
        const aiFallback =
          browserText.trim().length >= 30
            ? (markAiCalledAfterLocalOcrFailure(),
              await runOpenAiTextFallback(browserText, requestImageSize))
            : (markAiCalledAfterLocalOcrFailure(),
              await runOpenAiVisionFallback({
                imageBase64,
                mimeType,
                imageSize: requestImageSize,
                hintText: browserText,
              }));

        if (
          aiFallback &&
          !("error" in aiFallback) &&
          aiFallback.receipt.total_amount > 0
        ) {
          const aiReceipt = {
            ...localReceipt,
            ...aiFallback.receipt,
            store_name:
              aiFallback.receipt.store_name || localReceipt.store_name,
            purchase_date:
              aiFallback.receipt.purchase_date || localReceipt.purchase_date,
            total_amount:
              aiFallback.receipt.total_amount || localReceipt.total_amount,
            items: pickBestItems(aiFallback.receipt.items, localReceipt.items),
          };
          const aiItemsCount = aiReceipt.items.length;
          const aiScanStatus =
            aiItemsCount < Math.ceil(expectedItemsMin * 0.6)
              ? "partial_low_items"
              : "partial";
          const usedVision = browserText.trim().length < 30;

          return jsonResponse({
            ok: true,
            pipeline_version: "scanner_v2_phase2_sprint3",
            provider: usedVision
              ? "openai_vision_fallback"
              : "openai_text_fallback",
            model: MODEL,
            stage: "openai_enrichment",
            scanStatus: aiScanStatus,
            scan_status: aiScanStatus,
            source: usedVision
              ? "openai_vision_fallback"
              : "openai_text_fallback",
            text: browserText,
            confidence:
              aiItemsCount >= Math.ceil(expectedItemsMin * 0.6) ? 76 : 60,
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
            expected_items_min: expectedItemsMin || null,
          });
        }

        if (aiFallback && "error" in aiFallback) {
          console.warn(
            "[scan-receipt-ocr] openai_quality_fallback_failed",
            aiFallback,
          );
        }
      } catch (openAiQualityError) {
        console.warn("[scan-receipt-ocr] openai_quality_fallback_exception", {
          message:
            openAiQualityError instanceof Error
              ? openAiQualityError.message
              : String(openAiQualityError),
          model: MODEL,
        });
      }
    }

    console.info("[scan-receipt-ocr] openai_enrichment", {
      scheduled: false,
      openai_called: false,
      reason: "ticket_acceptance_is_local_only",
      items_detected_before_openai: itemsDetectedBeforeOpenAi,
      total_detected_before_openai: true,
      expected_items_min: expectedItemsMin || null,
    });

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
      expected_items_min: expectedItemsMin || null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown scanner error.";

    return diagnosticErrorResponse({
      errorCode: "SCAN_UNKNOWN_ERROR",
      errorMessage: message,
      status: 500,
      providerMessage: message,
      stage: "edge_function",
    });
  }
});
