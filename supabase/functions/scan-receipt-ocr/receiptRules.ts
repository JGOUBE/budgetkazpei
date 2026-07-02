export type TrustedTotal = {
  amount: number
  raw: string
  source: "total_line" | "due_line" | "missing"
  confidence: number
}

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
  if (!match) return ""
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
  if (/\b0[0-9](?:[\s.:-]*\d{2}){4}\b/.test(raw)) return true
  return (raw.match(/\d{2}\./g) || []).length >= 3
}

export function isVatOrPaymentLine(line = "") {
  const clean = compactLine(line)
  if (!clean) return false
  if (/\b(carte bleue|cb|visa|mastercard|american express|ticket restaurant)\b/.test(clean)) return true
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

export function isReceiptMetaLine(line = "") {
  const clean = compactLine(line)
  if (!clean) return true
  if (/\b(duplicata|operation|vente|caisse|ticket|bienvenue|recu par|nombre articles?)\b/.test(clean)) return true
  if (/\b(total|sous total|net a payer|reste a payer|a payer)\b/.test(clean)) return true
  if (/\b(rue|974\d{2}|saint leu|saint-leu)\b/.test(clean)) return true
  return false
}

export function isNonProductLine(line = "") {
  return isPhoneLine(line)
    || isVatOrPaymentLine(line)
    || isLoyaltyLine(line)
    || isMarketingLine(line)
    || isReceiptMetaLine(line)
}

export function shouldRejectLineAsProduct(line = "") {
  return isNonProductLine(line)
}

export function extractDeclaredItemsCount(text = "") {
  const compact = compactLine(text)
  const joinedLetters = compact.replace(/\b([a-z])(?:\s+(?=[a-z]\b)[a-z])+\b/g, (match) => match.replace(/\s+/g, ""))
  const match = joinedLetters.match(/\b(?:total|nombre)\s+articles?\s*[:=]?\s*(\d{1,3})\b|\b(?:total|nombre)\s+(\d{1,3})\s+articles?\b/)
  return Number(match?.[1] || match?.[2] || 0) || 0
}

export function extractReliableDateCandidates(text = "") {
  const candidates = []
  for (const line of String(text || "").split(/\r?\n/)) {
    const normalized = normalizeReceiptRuleDate(line)
    if (!normalized) continue
    if (isPhoneLine(line) && !/\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\b/.test(String(line || ""))) continue
    candidates.push({ raw: line.trim(), normalized, source: "ticket_date" })
  }
  return candidates
}

export function extractTrustedTotal(text = ""): TrustedTotal {
  const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]
    const clean = compactLine(line)
    if (/\btotal\s+\d{1,3}\s+articles?\b/.test(clean)) continue
    const isDue = /\b(reste a payer|net a payer|a payer)\b/.test(clean)
    const isTotal = /\btotal\b/.test(clean)
    if (!isDue && !isTotal) continue
    const amount = moneyFromLine(line)
    if (amount > 0) return { amount, raw: line, source: isDue ? "due_line" : "total_line", confidence: 0.95 }
  }
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
