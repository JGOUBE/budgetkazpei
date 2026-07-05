export type ReliableDateCandidate = {
  raw: string
  normalized: string
  source: "ticket_date"
}

export type TrustedTotal = {
  amount: number
  raw: string
  source: "explicit_total_line" | "explicit_total_line_ocr_fuzzy" | "payment_final_line_when_total_label_fuzzy_or_missing" | "total_line" | "due_line" | "missing"
  confidence: number
  paymentAmount?: number
  paymentRaw?: string
  paymentConsistent?: boolean
}

export type DeclaredItemsEvidence = {
  count: number
  raw: string
  source: "declared_total_articles" | "declared_total_articles_ocr_fuzzy" | "missing"
}

export type ItemQualityStatus = "trusted" | "needs_review" | "rejected" | "user_validated"

export function normalizeScannerText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

function compactLine(value = "") {
  return normalizeScannerText(value)
    .replace(/[^a-z0-9%.,:/ -]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function moneyFromLine(value = "") {
  const matches = Array.from(String(value || "").matchAll(/(\d+(?:\s?\d{3})*[,.]\d{2})/g))
  if (matches.length === 0) return 0
  return Number(matches[matches.length - 1][1].replace(/\s/g, "").replace(",", ".")) || 0
}

function stripMoneyAndCurrency(value = "") {
  return compactLine(value)
    .replace(/\b\d+(?:\s?\d{3})*[,.]\d{2}\b/g, " ")
    .replace(/\beur(?:os?)?\b/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function totalLabelKind(line = ""): "" | "exact" | "fuzzy" | "due" {
  const clean = compactLine(line)
  if (/\b(reste a payer|net a payer|a payer)\b/.test(clean)) return "due"
  if (/\btotal\b/.test(clean)) return "exact"

  const label = stripMoneyAndCurrency(line)
  if (/\b(tuial|t0tal|totai|t0ial|toial|tutal|tuilal)\b/.test(label)) return "fuzzy"
  return ""
}

function declaredItemsSearchLine(line = "") {
  return compactLine(line)
    .replace(/\b([a-z])(?:\s+(?=[a-z]\b)[a-z])+\b/g, (match) => match.replace(/\s+/g, ""))
    .replace(/\bart1cles?\b/g, "articles")
    .replace(/\bartlcles?\b/g, "articles")
}

function isDeclaredItemsLine(line = "") {
  const joinedLetters = declaredItemsSearchLine(line)
  return /\b(?:total|nombre|n0mbre|hombre|hohe|nb|nbr|gre)\s+articles?\s*[:=]?\s*\d{1,3}\b|\b(?:total|nombre|n0mbre|hombre|hohe|gre)\s+\d{1,3}\s+articles?\b/.test(joinedLetters)
}

const SECTION_SUBTOTAL_HEADINGS = [
  "epicerie salee",
  "epicerie sale",
  "epicerie sucree",
  "boissons sans alcool",
  "boissons",
  "charcuterie ls",
  "charcuterie",
  "cremerie",
  "fleurs plantes fruits legumes",
  "fleurs plantes fruits-legumes",
  "fleurs plantes fruits legumes",
  "fruits legumes",
  "fruits et legumes",
  "ultra frais",
  "volaille",
  "animalerie",
  "liquide",
  "liquides",
  "frais",
  "surgeles",
  "surgele",
  "bazar",
  "hygiene",
  "higiene",
  "entretien",
  "ppi",
]

function normalizeSectionSubtotalLabel(line = "") {
  return compactLine(line)
    .replace(/\b\d+(?:\s?\d{3})*[,.]\d{2}\b/g, " ")
    .replace(/\beur\b/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\bcharcuter(?:ie|1e|te)\b/g, "charcuterie")
    .replace(/\bepicer(?:ie|1e|te)\b/g, "epicerie")
    .replace(/\bsucr(?:ee+|ef|e)\b/g, "sucree")
    .replace(/\bsale(?:e|)\b/g, "salee")
    .replace(/\bcrererie\b/g, "cremerie")
    .replace(/\bsungeles\b/g, "surgeles")
    .replace(/\bvola1lle\b/g, "volaille")
    .replace(/\s+/g, " ")
    .trim()
}

function removeOcrDepartmentSuffix(label = "") {
  return label
    .replace(/\s+(?:1s|ls|l5|is)$/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

export function isSectionSubtotalLine(line = "") {
  const amount = moneyFromLine(line)
  if (amount <= 0) return false
  const clean = normalizeSectionSubtotalLabel(line)
  if (!clean) return false

  const candidates = [
    clean,
    removeOcrDepartmentSuffix(clean),
    clean.replace(/\bfruits legumes\b/g, "fruits plantes fruits legumes"),
  ].filter(Boolean)

  if (candidates.some((candidate) => SECTION_SUBTOTAL_HEADINGS.includes(candidate))) return true
  if (/^charcuterie(?:\s+(?:1s|ls|l5|is))?$/.test(clean)) return true
  if (/^epicerie\s+(?:sucree|salee)(?:\s+(?:1s|ls|l5|is))?$/.test(clean)) return true
  if (/^boissons\s+sans\s+alcool(?:\s+(?:1s|ls|l5|is))?$/.test(clean)) return true
  if (/^fleurs\s+plantes\s+fruits\s+legumes(?:\s+(?:1s|ls|l5|is))?$/.test(clean)) return true
  if (/^(?:cremerie|surgeles|surgele|ultra frais|volaille|ppi)(?:\s+(?:1s|ls|l5|is))?$/.test(clean)) return true

  return false
}

function isValidDateParts(year: number, month: number, day: number) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false
  if (month < 1 || month > 12 || day < 1 || day > 31) return false
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
}

export function normalizeReceiptRuleDate(value = "") {
  const raw = String(value || "").trim()
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) {
    const year = Number(iso[1])
    const month = Number(iso[2])
    const day = Number(iso[3])
    return isValidDateParts(year, month, day) ? `${iso[1]}-${iso[2]}-${iso[3]}` : ""
  }

  const match = raw.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/)
  if (!match) {
    const clean = normalizeScannerText(raw)
      .replace(/[^a-z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
    const monthAliases: Record<string, number> = {
      janvier: 1,
      fevrier: 2,
      mars: 3,
      avril: 4,
      mai: 5,
      juin: 6,
      suin: 6,
      juih: 6,
      juillet: 7,
      aout: 8,
      septembre: 9,
      octobre: 10,
      novembre: 11,
      decembre: 12,
    }
    const wordMatch = clean.match(/\b(\d{1,2})\s+([a-z]{3,10})\s+(\d{2,4})\b/)
    const month = wordMatch ? monthAliases[wordMatch[2]] : 0
    if (!wordMatch || !month) return ""
    const day = Number(wordMatch[1])
    const year = Number(wordMatch[3].length === 2 ? `20${wordMatch[3]}` : wordMatch[3])
    if (!isValidDateParts(year, month, day)) return ""
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  }
  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3])
  if (!isValidDateParts(year, month, day)) return ""
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

export function isPhoneLine(line = "") {
  const raw = String(line || "")
  const clean = compactLine(raw)
  if (/\b(tel|telephone|telephones?)\b/.test(clean)) return true
  if (/\b02[\s.:-]*62(?:[\s.:-]*\d{2}){3,4}\b/.test(raw)) return true
  if (/\b02[\s.:-]*62[\s.:-]*\d{2}[\s.:-]*\d{2}[,.:\s-]*\d{2}\b/.test(raw)) return true
  if (/\b0[0-9](?:[\s.:-]*\d{2}){4}\b/.test(raw)) return true
  return (raw.match(/\d{2}\./g) || []).length >= 3
}

export function isVatOrPaymentLine(line = "") {
  const clean = compactLine(line)
  if (!clean) return false
  if (/\b(especes|espece|cash|carte bleue|cb|visa|mastercard|american express|ticket restaurant)\b/.test(clean)) return true
  if (/\b(ventilation|tva|t v a|t\.v\.a|ttc|t t c|t\.t\.c|tot ht|tot\.ht|code tot)\b/.test(clean)) return true
  if (/^\d+\s+\d+[,.]\d{3,4}\s+\d+[,.]\d{2}%\s+\d+[,.]\d{3,4}\s+\d+[,.]\d{2}$/.test(clean)) return true
  if (/^total\s+\d+[,.]\d{3,4}\s+\d+[,.]\d{2}$/.test(clean)) return true
  return false
}

export function isLoyaltyLine(line = "") {
  return /\b(fidelite|fid|points?|cagnotte|solde carte)\b/.test(compactLine(line))
}

export function isMarketingLine(line = "") {
  return /\b(merci|visite|publicite|beneficiez|catalogue|notifications?)\b/.test(compactLine(line))
}

function isNoiseAmountLine(line = "") {
  if (moneyFromLine(line) <= 0) return false
  const clean = compactLine(line)
  if (/\bx\b/.test(clean) || /\bkg\b/.test(clean) || /\beur\s*\/\s*kg\b/.test(clean)) return false
  const label = stripMoneyAndCurrency(line).replace(/[^a-z]/g, "")
  return label.length > 0 && label.length <= 2
}

export function isReceiptMetaLine(line = "") {
  const clean = compactLine(line)
  if (!clean) return true
  if (/\b(duplicata|operation|vente|caisse|ticket|bienvenue|recu par|nombre articles?)\b/.test(clean)) return true
  if (/\b(total|sous total|net a payer|reste a payer|a payer)\b/.test(clean)) return true
  if (totalLabelKind(line)) return true
  if (isDeclaredItemsLine(line)) return true
  if (/\b(rue|974\d{2}|saint leu|saint-leu)\b/.test(clean)) return true
  return false
}

export function isNonProductLine(line = "") {
  return isPhoneLine(line)
    || isSectionSubtotalLine(line)
    || isVatOrPaymentLine(line)
    || isLoyaltyLine(line)
    || isMarketingLine(line)
    || isNoiseAmountLine(line)
    || isReceiptMetaLine(line)
}

export function shouldRejectLineAsProduct(line = "") {
  return isNonProductLine(line)
}

export function classifyLineRejectionReason(line = "") {
  const clean = compactLine(line)
  if (!clean) return "empty"
  if (isPhoneLine(line)) return "phone"
  if (isSectionSubtotalLine(line)) return "section_subtotal"
  if (isVatOrPaymentLine(line)) {
    if (/\b(especes|espece|cash|carte bleue|cb|visa|mastercard|american express|ticket restaurant)\b/.test(clean)) return "payment"
    return "vat"
  }
  if (isLoyaltyLine(line)) return "loyalty"
  if (isMarketingLine(line)) return "marketing"
  if (isNoiseAmountLine(line)) return "ocr_noise_amount"
  if (totalLabelKind(line) || /\b(total|sous total|net a payer|reste a payer|a payer)\b/.test(clean)) return "total"
  if (isDeclaredItemsLine(line)) return "declared_items_count"
  if (isReceiptMetaLine(line)) return "receipt_meta"
  return ""
}

export function normalizeItemQualityStatus(item: Record<string, unknown> = {}): ItemQualityStatus {
  const status = compactLine(String(item.item_status || item.status || item.review_status || ""))
  if (status === "user_validated" || status === "user validated") return "user_validated"
  if (item.needs_review === true) return "needs_review"
  if (status === "trusted") return "trusted"
  if (status === "rejected") return "rejected"
  if (status === "needs_review" || status === "needs review" || status === "a verifier" || status === "a_verifier") return "needs_review"
  if (status === "detected" && item.review_status === "trusted") return "trusted"
  if (status === "detected") return "needs_review"
  return "needs_review"
}

export function isItemEligibleForSmartShopping(item: Record<string, unknown> = {}) {
  const status = normalizeItemQualityStatus(item)
  if (status !== "trusted" && status !== "user_validated") return false
  if (String(item.line_type || "product") !== "product") return false
  const sourceText = [
    item.raw_text,
    item.source_line,
    item.ocr_name,
    item.corrected_name,
    item.name,
  ].map(value => String(value || "")).find(Boolean) || ""
  if (!sourceText.trim()) return false
  if (classifyLineRejectionReason(sourceText) || classifyLineRejectionReason(String(item.name || ""))) return false
  return true
}

export function extractDeclaredItemsCount(text = "") {
  return extractDeclaredItemsEvidence(text).count
}

export function extractDeclaredItemsEvidence(text = ""): DeclaredItemsEvidence {
  const joinedLetters = declaredItemsSearchLine(text)
  const match = joinedLetters.match(/\b(?:total|nombre|n0mbre|hombre|hohe|nb|nbr|gre)\s+articles?\s*[:=]?\s*(\d{1,3})\b|\b(?:total|nombre|n0mbre|hombre|hohe|gre)\s+(\d{1,3})\s+articles?\b/)
  const count = Number(match?.[1] || match?.[2] || match?.[3] || 0) || 0
  const raw = String(text || "").split(/\r?\n/).find((line) => {
    const joined = declaredItemsSearchLine(line)
    return /\b(?:total|nombre|n0mbre|hombre|hohe|nb|nbr|gre)\s+articles?\s*[:=]?\s*\d{1,3}\b|\b(?:total|nombre|n0mbre|hombre|hohe|gre)\s+\d{1,3}\s+articles?\b/.test(joined)
  }) || ""
  const fallbackCount = Number(raw.match(/\b(\d{1,3})\b(?!.*\b\d{1,3}\b)/)?.[1] || 0) || 0
  const finalCount = count || fallbackCount
  if (!finalCount) return { count: 0, raw: "", source: "missing" }
  const rawClean = compactLine(raw)
  const source = /\b(nombre|total)\b/.test(rawClean) && !/\b(nb|nbr|gre|hohe|hombre|n0mbre|art1cles|artlcles)\b/.test(rawClean)
    ? "declared_total_articles"
    : "declared_total_articles_ocr_fuzzy"
  return { count: finalCount, raw: raw.trim(), source }
}

export function extractReliableDateCandidates(text = ""): ReliableDateCandidate[] {
  const candidates: ReliableDateCandidate[] = []
  for (const line of String(text || "").split(/\r?\n/)) {
    const normalized = normalizeReceiptRuleDate(line)
    if (!normalized) continue
    if (isPhoneLine(line) && !/\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\b/.test(String(line || ""))) continue
    candidates.push({ raw: line.trim(), normalized, source: "ticket_date" })
  }
  return candidates
}

function isPaymentLine(line = "") {
  return /\b(especes|espece|cash|carte bleue|cb|carte|visa|mastercard)\b/.test(compactLine(line))
}

function findFinalPaymentTotal(lines: string[]): TrustedTotal | null {
  const lateTicketStart = Math.floor(lines.length * 0.6)
  const relaxedFooterStart = Math.max(0, lines.length - 18)

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]
    const amount = moneyFromLine(line)
    if (!amount || !isPaymentLine(line)) continue
    if (index < lateTicketStart && index < relaxedFooterStart) continue

    const trailingProductLike = lines.slice(index + 1).some((candidate) => {
      if (!moneyFromLine(candidate)) return false
      if (isDeclaredItemsLine(candidate)) return false
      return !isNonProductLine(candidate)
    })
    if (trailingProductLike) continue

    const previousAmount = moneyFromLine(lines[index - 1] || "")
    return {
      amount,
      raw: line,
      source: "payment_final_line_when_total_label_fuzzy_or_missing",
      confidence: previousAmount && Math.abs(previousAmount - amount) <= 0.01 ? 0.99 : 0.96,
      paymentAmount: amount,
      paymentRaw: line,
      paymentConsistent: true,
    }
  }

  return null
}

export function extractTrustedTotal(text = ""): TrustedTotal {
  const lines = String(text || "").split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]
    const clean = compactLine(line)
    if (/\btotal\s+\d{1,3}\s+articles?\b/.test(clean)) continue
    const labelKind = totalLabelKind(line)
    const isDue = labelKind === "due"
    const isFuzzyTotal = labelKind === "fuzzy"
    if (!labelKind) continue
    const nextLine = lines[index + 1] || ""
    const previousLine = lines[index - 1] || ""
    const amount = moneyFromLine(line) || moneyFromLine([line, nextLine].filter(Boolean).join(" ")) || moneyFromLine([previousLine, line].filter(Boolean).join(" "))
    if (amount > 0) {
      const paymentLine = lines.slice(index + 1, index + 3).find(candidate => {
        const cleanPayment = compactLine(candidate)
        if (!/\b(especes|espece|cash|carte bleue|cb|visa|mastercard)\b/.test(cleanPayment)) return false
        return Math.abs(moneyFromLine(candidate) - amount) <= 0.01
      }) || ""
      if (isFuzzyTotal && !paymentLine) continue
      return {
        amount,
        raw: moneyFromLine(line) ? line : [line, nextLine].filter(Boolean).join(" "),
        source: isDue ? "due_line" : (isFuzzyTotal ? "explicit_total_line_ocr_fuzzy" : "explicit_total_line"),
        confidence: paymentLine ? 0.99 : 0.95,
        paymentAmount: paymentLine ? moneyFromLine(paymentLine) : 0,
        paymentRaw: paymentLine,
        paymentConsistent: Boolean(paymentLine),
      }
    }
  }
  const finalPaymentTotal = findFinalPaymentTotal(lines)
  if (finalPaymentTotal) return finalPaymentTotal
  return { amount: 0, raw: "", source: "missing", confidence: 0 }
}

export function normalizeStoreName(text = "") {
  const clean = compactLine(text)
  if ((clean.includes("leader price") || clean.includes("leaderprice") || clean.includes("leader pr1ce")) && (clean.includes("saint leu") || clean.includes("saint-leu"))) {
    return { store_name: "Leader Price Saint-Leu", normalized_store_name: "leader price", store_location: "Saint-Leu" }
  }
  if (clean.includes("leader price") || clean.includes("leaderprice") || clean.includes("leader pr1ce")) {
    return { store_name: "Leader Price", normalized_store_name: "leader price", store_location: "" }
  }
  if ((clean.includes("leclerc") || clean.includes("lecierc")) && clean.includes("le portail")) {
    return { store_name: "E.Leclerc Le Portail", normalized_store_name: "e.leclerc", store_location: "Le Portail" }
  }
  if (clean.includes("leclerc") || clean.includes("lecierc")) {
    return { store_name: "E.Leclerc", normalized_store_name: "e.leclerc", store_location: "" }
  }
  return { store_name: "", normalized_store_name: "", store_location: "" }
}
