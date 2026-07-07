import { classifyReceipt } from "./receiptClassifier"
import {
  SCAN_MERCHANTS,
  getProductDictionaryMeta,
  normalizeMerchantName,
  normalizeProductOcrName,
} from "./receiptDictionaries"
import {
  classifyLineRejectionReason,
  classifySectionSubtotalLine,
  extractDeclaredItemsEvidence,
  extractReliableDateCandidates,
  extractTrustedTotal,
  isPhoneLine,
  isItemEligibleForSmartShopping,
  normalizeItemQualityStatus,
  isSectionSubtotalLine,
  normalizeReceiptRuleDate,
  normalizeStoreName as normalizeStoreFromRules,
  shouldRejectLineAsProduct,
} from "./receiptRules"

const STORES = [
  ...SCAN_MERCHANTS,
  "E.Leclerc Le Portail",
  "E.Leclerc",
  "Leader Price",
  "Leclerc",
  "Carrefour",
  "Super U",
  "Hyper U",
  "Lidl",
  "Score",
  "U Express",
  "Intermarche",
  "Jumbo",
  "Run Market",
  "Casino",
  "Spar",
  "Vival",
  "Auchan",
]

const CATEGORY_HINTS: Record<string, string> = {
  lait: "alimentaire",
  pain: "alimentaire",
  coca: "alimentaire",
  riz: "alimentaire",
  poulet: "alimentaire",
  yaourt: "alimentaire",
  cafe: "alimentaire",
  huile: "alimentaire",
  lesieur: "alimentaire",
  pomme: "alimentaire",
  colin: "alimentaire",
  poisson: "alimentaire",
  banane: "alimentaire",
  chips: "alimentaire",
  biscuit: "alimentaire",
  spaghetti: "alimentaire",
  edam: "alimentaire",
  mimolette: "alimentaire",
  saucisson: "alimentaire",
  salade: "alimentaire",
  sardines: "alimentaire",
  thon: "alimentaire",
  lessive: "divers",
  shampoing: "sante",
  mouchoir: "sante",
  mouch: "sante",
}

const VALID_CATEGORIES = new Set(["alimentaire", "transport", "logement", "sante", "loisirs", "divers"])

const DEPARTMENTS = [
  { label: "BOISSONS", category: "alimentaire", subcategory: "Boissons", headings: ["boissons", "boissons sans alcool", "liquides", "eaux boissons", "drink", "drinks"], keywords: ["soda", "jus", "eau", "coca", "boisson"] },
  { label: "EPICERIE SALEE", category: "alimentaire", subcategory: "Epicerie salee / condiments", headings: ["epicerie salee", "epicerie sale", "epicerie", "conserves", "condiments"], keywords: ["cornichon", "corni", "thon", "huile", "pates", "spaghetti", "riz", "sardines", "salad"] },
  { label: "EPICERIE SUCREE", category: "alimentaire", subcategory: "Epicerie sucree", headings: ["epicerie sucree", "biscuits confiserie", "sucre", "sucree"], keywords: ["biscuit", "gouter", "choco", "chocolat", "cereales"] },
  { label: "BOULANGERIE", category: "alimentaire", subcategory: "Boulangerie", headings: ["boulangerie", "pain patisserie", "pain viennoiserie"], keywords: ["pain", "baguette", "brioche", "croissant"] },
  { label: "CREMERIE", category: "alimentaire", subcategory: "Cremerie", headings: ["cremerie", "produits laitiers", "frais ls", "fromagerie", "ultra frais"], keywords: ["lait", "yaourt", "fromage", "beurre", "edam", "mimolette"] },
  { label: "CHARCUTERIE", category: "alimentaire", subcategory: "Charcuterie", headings: ["charcuterie", "charcuterie ls", "traiteur"], keywords: ["saucisson", "jambon", "salami"] },
  { label: "BOUCHERIE", category: "alimentaire", subcategory: "Boucherie", headings: ["boucherie", "viandes", "volaille"], keywords: ["poulet", "boeuf", "porc", "steak", "viande"] },
  { label: "POISSONNERIE", category: "alimentaire", subcategory: "Poissonnerie", headings: ["poissonnerie", "poisson"], keywords: ["poisson", "colin", "saumon", "thon"] },
  { label: "SURGELES", category: "alimentaire", subcategory: "Surgeles", headings: ["surgeles", "surgele", "froid surgele"], keywords: ["glace", "surgel"] },
  { label: "HYGIENE", category: "sante", subcategory: "Hygiene", headings: ["hygiene", "higiene", "hygiene beaute", "droguerie parfumerie hygiene", "dph", "beaute"], keywords: ["shampoing", "savon", "dentifrice", "mouch", "mouchoir", "lessive"] },
  { label: "FRUITS LEGUMES", category: "alimentaire", subcategory: "Fruits et legumes", headings: ["fruits legumes", "fruits et legumes", "fleurs plantes fruits legumes", "fruits-legumes", "primeur", "fruits", "legumes"], keywords: ["fruit", "legume", "pomme de terre", "banane", "tomate", "salade"] },
  { label: "BEBE", category: "divers", subcategory: "Bebe", headings: ["bebe", "baby"], keywords: ["couche", "lingette", "bebe"] },
  { label: "ANIMALERIE", category: "divers", subcategory: "Animalerie", headings: ["animalerie", "animaux", "pet food"], keywords: ["chat", "chien", "croquette", "litiere"] },
]

export type ParsedReceiptItem = {
  name: string
  ocr_name?: string
  corrected_name?: string
  normalized_name?: string
  brand?: string | null
  quantity: number
  unit?: string | null
  price?: number | null
  unit_price?: number | null
  total_price?: number | null
  category: string
  subcategory?: string | null
  department?: string | null
  ticket_section?: string | null
  promotion?: boolean
  vat?: number | null
  status?: string
  item_status?: string
  review_status?: string
  needs_review?: boolean
  item_quality_score?: number
  item_rejection_reason?: string
  raw_text?: string
  source_line?: string
  line_type?: string
  source?: string
  confidence_score: number
}

export type ParsedReceipt = {
  store_name: string
  merchant_name: string
  merchant_confidence: number
  purchase_date: string | null
  date_status: "detected" | "needs_review"
  total_amount: number
  currency: "EUR"
  ocr_text: string
  ocr_status: "success" | "failed" | "manual"
  ai_used: boolean
  validation_status: "draft"
  ticket_type: string
  budget_category: string
  is_food_ticket: boolean
  confidence_score: number
  scan_level_used?: number
  scan_duration_ms?: number
  escalation_reason?: string
  scan_status?: "success" | "trusted" | "usable_review" | "partial" | "partial_low_items" | "failed" | "budget_ok_articles_ok" | "budget_ok_articles_partial" | "budget_ok_articles_blocked" | "budget_needs_review" | "rejected"
  expected_items_count?: number | null
  expected_items_source?: string
  declared_items_count?: number | null
  declared_items_raw_text?: string
  items_count_status?: string
  total_needs_review?: boolean
  total_source?: string
  total_raw_text?: string
  total_confidence?: number
  payment_method?: string | null
  payment_total_value?: number | null
  payment_total_raw_text?: string
  total_payment_consistent?: boolean
  parser_debug?: Record<string, unknown>
  items: ParsedReceiptItem[]
  warnings: string[]
}

function normalize(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

function money(value = "") {
  const match = String(value).match(/(\d+(?:\s?\d{3})*[,.]\d{2})/)
  if (!match) return null
  return Number(match[1].replace(/\s/g, "").replace(",", "."))
}

function lastMoney(value = "") {
  const matches = Array.from(String(value).matchAll(/(\d+[,.]\d{2})/g))
  if (matches.length === 0) return null
  return Number(matches[matches.length - 1][1].replace(",", "."))
}

export function extractReceiptDueTotal(text = "") {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]
    const clean = normalize(line)
    const isDueLine = clean.includes("reste a payer") || clean.includes("net a payer") || clean.includes("a payer")
    if (!isDueLine) continue

    const sameLineTotal = money(line)
    if (sameLineTotal) return sameLineTotal

    const nearby = [lines[index + 1], lines[index - 1]].filter(Boolean).join(" ")
    const nearbyTotal = money(nearby)
    if (nearbyTotal) return nearbyTotal
  }

  return 0
}

function normalizeLookup(value = "") {
  return normalize(value).replace(/[^a-z0-9]/g, "")
}

const STORE_ALIASES: Record<string, string> = {
  eleclercleportail: "E.Leclerc Le Portail",
  leclercleportail: "E.Leclerc Le Portail",
  leportail: "E.Leclerc Le Portail",
  eleclerc: "E.Leclerc",
  leaderprix: "Leader Price",
  leaderprx: "Leader Price",
  leaderprice: "Leader Price",
  leaderprice974: "Leader Price",
  carrefourreunion: "Carrefour",
  hyperu: "Hyper U",
  superu: "Super U",
  runmarket: "Run Market",
  jumbo: "Jumbo",
  casino: "Casino",
  spar: "Spar",
  vival: "Vival",
  auchan: "Auchan",
}

function detectStore(text = "") {
  const ruleStore = normalizeStoreFromRules(text)
  if (ruleStore.store_name) return ruleStore.store_name

  const dictionaryHit = normalizeMerchantName(text)
  if (dictionaryHit) return dictionaryHit

  const cleaned = normalizeLookup(text)
  if (cleaned.includes("leclerc") && cleaned.includes("portail")) return "E.Leclerc Le Portail"
  const store = STORES.find(storeName => cleaned.includes(normalizeLookup(storeName)))
  if (store) return store
  const aliasEntry = Object.entries(STORE_ALIASES).find(([alias]) => cleaned.includes(alias))
  return aliasEntry?.[1] || ""
}

function detectDate(text = "") {
  const candidate = extractReliableDateCandidates(text)[0]
  const parsed = candidate?.normalized || ""
  scanDebug("raw_date_detected", candidate?.raw || "not found")
  scanDebug("normalized_date", parsed)
  if (!parsed) {
    scanDebug("date_status", "needs_review")
  }
  return parsed
}

function isValidDateParts(year: number, month: number, day: number) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false
  if (month < 1 || month > 12) return false
  if (day < 1 || day > 31) return false

  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
}

export function normalizeReceiptDate(value = "") {
  return normalizeReceiptRuleDate(value)
}

export function extractReceiptTotal(text = "") {
  const trusted = extractTrustedTotal(text)
  if (trusted.amount) return trusted.amount

  const dueTotal = extractReceiptDueTotal(text)
  if (dueTotal) return dueTotal

  const lines = String(text || "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)

  const totalPatterns = [
    /\b(total|total\s+ttc|net\s+a\s+payer|a\s+payer)\b/i,
  ]

  const isArticleCountTotalLine = (value = "") => /\btotal\s+\d{1,3}\s+articles?\b/i.test(normalize(value))

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]
    const clean = normalize(line)
    if (isArticleCountTotalLine(line)) {
      continue
    }
    const isTotalLine = totalPatterns.some(pattern => pattern.test(clean))
    if (!isTotalLine) continue

    const sameLineTotal = money(line)
    if (sameLineTotal) return sameLineTotal

    const nearby = [lines[index + 1], lines[index - 1]].filter(Boolean).join(" ")
    const nearbyTotal = money(nearby)
    if (nearbyTotal) return nearbyTotal
  }

  return 0
}

function detectTotal(lines: string[]) {
  return extractReceiptTotal(lines.join("\n"))
}

function detectPaymentMethod(line = "") {
  const clean = normalize(line)
  if (clean.includes("especes") || clean.includes("espece") || clean.includes("cash")) return "especes"
  if (clean.includes("carte bleue") || clean === "cb" || clean.includes(" visa ") || clean.includes("mastercard")) return "carte"
  return null
}

function sectionSubtotalDiagnostics(lines: string[]) {
  const classified = lines
    .map(line => ({
      line,
      amount: lastMoney(line) || 0,
      classification: classifySectionSubtotalLine(line),
    }))
    .filter(row => row.classification.kind !== "none")

  const rejected = classified
    .filter(row => row.classification.kind === "confirmed")
    .map(row => ({
      line: row.line,
      amount: row.amount,
      reason: row.classification.reason,
      matched_heading: row.classification.matchedHeading,
    }))

  const probable = classified
    .filter(row => row.classification.kind === "probable")
    .map(row => ({
      line: row.line,
      amount: row.amount,
      reason: row.classification.reason,
      matched_heading: row.classification.matchedHeading,
    }))

  const amount = rejected.reduce((sum, item) => sum + Number(item.amount || 0), 0)

  return {
    rejected,
    probable,
    rejectedCount: rejected.length,
    probableCount: probable.length,
    rejectedAmount: Number(amount.toFixed(2)),
  }
}

function classifySectionSubtotalWithContext(
  line: string,
  items: ParsedReceiptItem[],
  sectionStartIndex: number,
) {
  const base = classifySectionSubtotalLine(line)
  if (base.kind === "none") return base

  const amount = base.amount || lastMoney(line) || 0
  const sectionItems = items.slice(Math.max(0, sectionStartIndex))
  const sectionSum = Number(sectionItems.reduce((sum, item) => {
    return sum + Number(item.total_price ?? item.price ?? item.unit_price ?? 0)
  }, 0).toFixed(2))

  const amountMatchesSection = amount > 0
    && sectionSum > 0
    && Math.abs(sectionSum - amount) <= 0.05

  if (base.kind === "confirmed" || amountMatchesSection) {
    return {
      ...base,
      kind: "confirmed" as const,
      reason: "section_subtotal_confirmed" as const,
      sectionSum,
      amountMatchesSection,
    }
  }

  return {
    ...base,
    kind: "probable" as const,
    reason: "section_subtotal_probable" as const,
    sectionSum,
    amountMatchesSection,
  }
}

function localOcrTextPresenceDiagnostics(lines: string[], total = 0, declaredCount = 0) {
  const totalLikeLine = lines.find((line) => {
    const clean = normalize(line)
    return /\b(total|tuial|t0tal|totai|t0ial|toial|tutal|reste a payer|net a payer|a payer)\b/.test(clean)
  }) || ""
  const paymentLine = lines.find((line) => detectPaymentMethod(line) && lastMoney(line) > 0) || ""
  return {
    ocr_text_has_total: Boolean(totalLikeLine || (total > 0 && paymentLine)),
    ocr_text_has_payment: Boolean(paymentLine),
    ocr_text_has_declared_items_count: declaredCount > 0,
    ocr_text_last_lines: lines.slice(-8),
    local_total_missing_reason: total > 0
      ? ""
      : totalLikeLine
        ? (paymentLine ? "total_like_present_but_not_trusted" : "total_like_without_matching_payment")
        : "bottom_total_not_present_in_ocr_text",
  }
}

function categoryFor(name = "") {
  const clean = normalize(name)
  const hit = Object.entries(CATEGORY_HINTS).find(([keyword]) => clean.includes(normalize(keyword)))
  return hit?.[1] || "alimentaire"
}

function departmentFromLine(line = "") {
  const clean = normalize(line).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim()
  if (!clean) return null
  const withoutAmount = clean
    .replace(/\b\d+[,.]?\d{0,2}\b/g, " ")
    .replace(/\beur\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return DEPARTMENTS.find(dept => dept.headings.some(keyword => withoutAmount === normalize(keyword))) || null
}

function hasMoneyAmount(line = "") {
  return /-?\d+[,.]\d{2}\s*(eur|euro|euros)?/i.test(line)
}

function isKnownSubtotalLine(line = "") {
  const clean = normalize(line).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim()
  return hasMoneyAmount(line) && (clean.startsWith("ppi ") || clean === "ppi")
}

function isDiscountLine(line = "") {
  const clean = normalize(line)
  return hasMoneyAmount(line) && (clean.includes("jeudi 10") || clean.includes("remise") || clean.includes("mdd")) && /-\s*\d+[,.]\d{2}/.test(line)
}

function isVatSectionStart(line = "") {
  const clean = normalize(line).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim()
  return clean.includes("ventilation")
    || clean.includes("code tot")
    || clean.includes("t v a")
    || clean.includes("tva")
    || clean.includes("t t c")
    || clean.includes("ttc")
}

function isVatSectionContinuation(line = "") {
  const clean = normalize(line).replace(/[^a-z0-9%,. ]/g, " ").replace(/\s+/g, " ").trim()
  return /^[0-9 ]+\d+[,.]\d{3,4}\s+\d+[,.]\d{2}%\s+\d+[,.]\d{3,4}\s+\d+[,.]\d{2}$/.test(clean)
    || /^total\s+\d+[,.]\d{3,4}\s+\d+[,.]\d{2}$/.test(clean)
}

function isHardIgnoredPricedLine(line = "") {
  const clean = normalize(line)
    .replace(/[^a-z0-9% ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (!clean) return true
  if (shouldRejectLineAsProduct(line)) return true
  if (isDiscountLine(line)) return true
  if (clean.includes("total") || clean.includes("sous total") || clean.includes("net a payer") || clean.includes("a payer")) return true
  if (clean.includes("carte bleue") || clean === "cb" || clean.includes(" visa ") || clean.includes("mastercard")) return true
  if (clean.includes("tva") || clean.includes("ttc") || clean.includes("ht") || clean.includes("ventilation")) return true
  if (clean.includes("fidelite") || clean.includes("point") || clean.includes("cagnotte") || clean.includes("solde")) return true
  if (clean.includes("operation") || clean.includes("duplicata") || clean.includes("recu par")) return true
  if (clean.includes("caisse") || clean.includes("ticket") || clean.includes("code")) return true
  if (clean.includes("merci") || clean.includes("beneficiez") || clean.includes("publicite")) return true
  return false
}

function isNonProductText(value = "") {
  const clean = normalize(value)
    .replace(/[^a-z0-9% ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (!clean) return true
  if (shouldRejectLineAsProduct(value)) return true
  if (clean.includes("jeudi") || clean.includes("judith")) return true
  if (clean.includes("mdd") && (clean.includes("alcool") || clean.includes("remise") || clean.includes("10"))) return true
  if (clean.includes("prix promotion")) return true
  if (clean.includes("total") || clean.includes("carte bleue") || clean.includes("duplicata")) return true
  if (clean.includes("operation") || clean.includes("bienvenue") || clean.includes("ventilation")) return true
  if (clean.includes("tva") || clean.includes("ttc") || clean.includes("ht")) return true
  if (clean.includes("point") || clean.includes("fidelite") || clean.includes("solde")) return true
  if (clean.includes("cagnotte") || clean.includes("caisse") || clean.includes("ticket") || clean.includes("code")) return true
  if (clean.includes("beneficiez") || clean.includes("merci") || clean.includes("publicite")) return true
  return false
}

function isPhoneOrContactLine(value = "") {
  return isPhoneLine(value)
}

function isBarcodeOnlyLine(line = "") {
  const digits = String(line || "").replace(/[^0-9]/g, "")
  return digits.length >= 8 && !/[a-zA-Z]/.test(line) && !hasMoneyAmount(line)
}

function scanDebug(label: string, payload?: unknown) {
  if (typeof console === "undefined") return
  console.info(`[scanner] ${label}`, payload ?? "")
}

function createParserDebug(lines: string[]) {
  return {
    rawLinesCount: lines.length,
    candidateLinesCount: 0,
    rejectedLinesCount: 0,
    rejectedLines: [] as Array<{ line: string; reason: string }>,
  }
}

function rejectParserLine(debug: ReturnType<typeof createParserDebug>, line: string, reason: string) {
  debug.rejectedLinesCount += 1
  debug.rejectedLines.push({ line, reason })
  scanDebug("ligne rejetee", { reason, line })
}

function isQuantityOnlyCandidate(value = "") {
  const clean = normalize(value).replace(/[^0-9x,. ]/g, "").replace(/\s+/g, " ").trim()
  return Boolean(clean) && /^[0-9x,. ]+$/.test(clean) && clean.includes("x")
}

function applyDepartmentToSection(items: ParsedReceiptItem[], startIndex: number, department: (typeof DEPARTMENTS)[number]) {
  for (let index = startIndex; index < items.length; index += 1) {
    items[index] = {
      ...items[index],
      category: department.category,
      subcategory: department.subcategory,
      department: department.label,
      ticket_section: department.label,
    }
  }
}

function metadataFor(name = "", currentDepartment: (typeof DEPARTMENTS)[number] | null = null) {
  const clean = normalize(name)
  const dictionaryMeta = getProductDictionaryMeta(name)
  const dept = currentDepartment || DEPARTMENTS.find(row => row.keywords.some(keyword => clean.includes(normalize(keyword)))) || null
  return {
    category: dictionaryMeta?.category || dept?.category || categoryFor(name),
    subcategory: dictionaryMeta?.subcategory || dept?.subcategory || null,
    department: dept?.label || null,
    ticket_section: dept?.label || null,
  }
}

function normalizedProductName(name = "") {
  return normalize(name)
    .replace(/\b\d+[,.]?\d*\s*(kg|g|gr|l|cl|ml)\b/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function isVerificationPlaceholder(name = "") {
  return /produit.*v.*rifier/.test(normalizedProductName(name))
}

function hasKnownProductSignal(name = "") {
  const clean = normalizedProductName(name)
  if (!clean) return false

  const categoryHit = Object.keys(CATEGORY_HINTS).some(keyword => clean.includes(normalize(keyword)))
  const departmentHit = DEPARTMENTS.some(row => row.keywords.some(keyword => clean.includes(normalize(keyword))))

  return categoryHit || departmentHit
}

function looksUncertain(name = "") {
  const clean = normalize(name)
  const words = clean.split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  if (clean.includes("fain mise")) return true
  if (clean === "1" || clean === "(1)") return true
  if (clean.includes("legende")) return true
  if (clean.includes("alcool") && !clean.includes("sans alcool")) return true
  if (clean.includes("judith mans")) return true
  if (clean.includes("faquito abc")) return true
  if (hasKnownProductSignal(name)) return false
  if (words.length <= 2 && clean.length <= 5) return true
  if (/^[a-z]{2,4}\s+[a-z]{2,4}\s+[a-z]{1,3}\s+[a-z]{2,4}/.test(clean) && !clean.includes("pomme de terre")) return true
  return false
}

function guessBrandFromName(name = "") {
  const clean = normalize(name)
  if (clean.includes("lesieur")) return "Lesieur"
  if (clean.includes("coca")) return "Coca-Cola"
  if (clean.includes("leader price")) return "Leader Price"
  return null
}

function buildItem({
  rawName,
  quantity = 1,
  unit = "piece",
  unitPrice = null,
  totalPrice = null,
  ocrConfidence = 0,
  currentDepartment = null,
  promotion = false,
}: {
  rawName: string
  quantity?: number
  unit?: string | null
  unitPrice?: number | null
  totalPrice?: number | null
  ocrConfidence?: number
  currentDepartment?: (typeof DEPARTMENTS)[number] | null
  promotion?: boolean
}): ParsedReceiptItem {
  const ocrName = cleanProductName(rawName)
  const dictionaryName = normalizeProductOcrName(ocrName)
  const uncertain = looksUncertain(ocrName)
  const correctedName = uncertain ? "Produit à vérifier" : ocrName
  const meta = metadataFor(dictionaryName || ocrName, currentDepartment)
  const finalName = dictionaryName && dictionaryName !== ocrName ? dictionaryName : correctedName
  const baseConfidence = Math.max(45, Math.min(98, Math.round(ocrConfidence + (uncertain ? -10 : 15))))
  const itemStatus = uncertain ? "needs_review" : "trusted"

  return {
    name: finalName,
    ocr_name: ocrName,
    corrected_name: finalName,
    normalized_name: normalizedProductName(isVerificationPlaceholder(finalName) ? ocrName : finalName),
    brand: getProductDictionaryMeta(ocrName)?.brand || guessBrandFromName(dictionaryName || ocrName),
    quantity,
    unit,
    unit_price: unitPrice,
    total_price: totalPrice,
    category: meta.category,
    subcategory: meta.subcategory,
    department: meta.department,
    ticket_section: meta.ticket_section,
    promotion,
    vat: null,
    item_status: itemStatus,
    status: itemStatus,
    review_status: itemStatus,
    needs_review: uncertain,
    item_quality_score: baseConfidence,
    item_rejection_reason: "",
    raw_text: rawName,
    source_line: rawName,
    line_type: "product",
    source: "local_ocr",
    confidence_score: baseConfidence,
  }
}

function cleanProductName(line = "") {
  return String(line || "")
    .replace(/^\(\d+\)\s*\d{4,}\s*/, "")
    .replace(/^\(?\d+\)?\d{4,}\s*/, "")
    .replace(/^\(pm\)\s*/i, "")
    .replace(/^\*+/, "")
    .replace(/^\d+\s*(kg|g|gr|l|cl|ml)\s+/i, "")
    .replace(/\bprix promotion\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
}

function isStoreLine(line = "") {
  const clean = normalizeLookup(line)
  if (normalizeMerchantName(line)) return true
  if (STORES.some(store => clean === normalizeLookup(store) || clean.includes(normalizeLookup(store)))) return true
  if (Object.keys(STORE_ALIASES).some(alias => clean.includes(alias))) return true
  return false
}

function isIgnoredLine(line = "") {
  const clean = normalize(line)
    const ignored = !clean
    || /^>+/.test(String(line || "").trim())
    || shouldRejectLineAsProduct(line)
    || clean.includes("total")
    || clean.includes("carte")
    || clean.includes("fidelite")
    || clean.includes("bienvenue")
    || clean.includes("operation")
    || clean.includes("duplicata")
    || clean.includes("tva")
    || clean.includes("ventilation")
    || clean.includes("merci")
    || clean.includes("american express")
    || clean.includes("point")
    || clean.includes("solde")
    || clean.includes("cagnotte")
    || clean.includes("recu par")
    || clean.includes("tel")
    || clean.includes("telephone")
    || clean.includes("rue")
    || clean.includes("974")
    || clean.includes("mes tickets")
    || clean.includes("notifications")
    || clean.includes("catalogues")
    || clean.includes("leaderdrive")
    || clean.includes("catalogue")
    || (!hasMoneyAmount(line) && isStoreLine(line))
    || (clean.includes("jeudi") && clean.includes("mdd"))
    || clean === "mdd"
    || isBarcodeOnlyLine(line)
  if (ignored) scanDebug("ligne ignorée", { reason: "non_produit", line })
  return ignored
}

function itemKey(item: ParsedReceiptItem) {
  return normalize(item.normalized_name || item.corrected_name || item.name).replace(/\s+/g, " ").trim()
}

function normalizeIncomingItem(item: Partial<ParsedReceiptItem> = {}): ParsedReceiptItem {
  const rawName = cleanProductName(String(item.ocr_name || item.name || ""))
  const displayName = cleanProductName(String(item.corrected_name || item.name || rawName))
  const sourceName = isVerificationPlaceholder(displayName) && rawName ? rawName : displayName || rawName
  const dictionaryName = normalizeProductOcrName(sourceName)
  const uncertain = looksUncertain(sourceName)
  const correctedName = uncertain ? "Produit à vérifier" : sourceName
  const finalName = dictionaryName && dictionaryName !== sourceName ? dictionaryName : correctedName
  const meta = metadataFor(dictionaryName || sourceName)
  const itemCategory = String(item.category || "").trim()

  const explicitStatus = normalizeItemQualityStatus(item as Record<string, unknown>)
  const itemStatus = explicitStatus === "trusted" || explicitStatus === "user_validated"
    ? explicitStatus
    : uncertain
      ? "needs_review"
      : "trusted"
  const confidence = Math.max(35, Math.min(98, Number(item.confidence_score || 75) + (uncertain ? -25 : 0)))

  return {
    name: finalName,
    ocr_name: rawName || sourceName,
    corrected_name: finalName,
    normalized_name: item.normalized_name || normalizedProductName(isVerificationPlaceholder(finalName) ? rawName || sourceName : finalName),
    brand: item.brand || getProductDictionaryMeta(sourceName)?.brand || guessBrandFromName(dictionaryName || sourceName),
    quantity: Number(item.quantity || 1),
    unit: item.unit || "piece",
    unit_price: item.unit_price == null ? null : Number(item.unit_price),
    total_price: item.total_price == null ? item.price == null ? null : Number(item.price) : Number(item.total_price),
    category: meta.category || (VALID_CATEGORIES.has(itemCategory) ? itemCategory : "alimentaire"),
    subcategory: item.subcategory || meta.subcategory,
    department: item.department || meta.department,
    ticket_section: item.ticket_section || meta.ticket_section,
    promotion: Boolean(item.promotion),
    vat: item.vat ?? null,
    item_status: itemStatus,
    status: itemStatus,
    review_status: itemStatus,
    needs_review: itemStatus === "needs_review",
    item_quality_score: confidence,
    item_rejection_reason: String((item as any).item_rejection_reason || ""),
    raw_text: String((item as any).raw_text || (item as any).source_line || rawName || sourceName),
    source_line: String((item as any).source_line || (item as any).raw_text || rawName || sourceName),
    line_type: item.line_type || "product",
    source: item.source || "local_ocr",
    confidence_score: confidence,
  }
}

export function mergeReceiptItems(primary: ParsedReceiptItem[] = [], fallback: ParsedReceiptItem[] = []) {
  const byName = new Map<string, ParsedReceiptItem>()

  ;[...primary, ...fallback].forEach(item => {
    const sourceText = String(item.ocr_name || item.corrected_name || item.name || "")
    const displayText = String(item.name || item.corrected_name || item.ocr_name || "")
    if (isNonProductText(sourceText) && isNonProductText(displayText)) {
      scanDebug("produit rejeté", { reason: "non_product_text", item })
      return
    }
    const hasValidPrice = Number(item.total_price ?? item.unit_price ?? 0) > 0
    if (!hasValidPrice) {
      scanDebug("produit rejeté", { reason: "missing_price", item })
      return
    }
    const normalizedItem = normalizeIncomingItem(item)
    const key = itemKey(normalizedItem)
    if (!key) return
    const existing = byName.get(key)
    if (!existing || (normalizedItem.confidence_score || 0) > (existing.confidence_score || 0)) {
      byName.set(key, normalizedItem)
      scanDebug("produit retenu", normalizedItem)
    }
  })

  return Array.from(byName.values())
}

function summarizeItemQuality(items: ParsedReceiptItem[] = [], rejectedLines: Array<{ line: string; reason: string }> = []) {
  const trustedItems = items.filter(item => normalizeItemQualityStatus(item as unknown as Record<string, unknown>) === "trusted")
  const needsReviewItems = items.filter(item => normalizeItemQualityStatus(item as unknown as Record<string, unknown>) === "needs_review")
  const rejectedReasonCounts = rejectedLines.reduce((acc, row) => {
    const reason = row.reason || classifyLineRejectionReason(row.line) || "unknown"
    acc[reason] = (acc[reason] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  const smartShoppingEligible = items.filter(item => isItemEligibleForSmartShopping(item as unknown as Record<string, unknown>))
  const trustedRatio = items.length ? trustedItems.length / items.length : 0

  return {
    trusted_items_count: trustedItems.length,
    needs_review_items_count: needsReviewItems.length,
    rejected_items_count: rejectedLines.length,
    trusted_items_ratio: Number(trustedRatio.toFixed(2)),
    items_quality_status: items.length === 0
      ? "no_items"
      : trustedRatio >= 0.8
        ? "trusted_enough"
        : "needs_review",
    items_sent_to_smart_shopping_count: smartShoppingEligible.length,
    items_excluded_from_smart_shopping_count: Math.max(0, items.length - smartShoppingEligible.length),
    items_excluded_reasons_summary: {
      ...rejectedReasonCounts,
      needs_review: needsReviewItems.length,
    },
    item_quality_summary: items.map(item => ({
      name: item.name,
      raw_text: item.raw_text || item.ocr_name || item.name,
      item_status: item.item_status,
      review_status: item.review_status,
      item_quality_score: item.item_quality_score ?? item.confidence_score,
      smart_shopping_allowed: isItemEligibleForSmartShopping(item as unknown as Record<string, unknown>),
    })),
  }
}

function resolveItemsQualityStatus({
  items,
  qualitySummary,
  smartShoppingBlockedReasons,
}: {
  items: ParsedReceiptItem[]
  qualitySummary: ReturnType<typeof summarizeItemQuality>
  smartShoppingBlockedReasons: string[]
}) {
  if (items.length === 0) return "blocked"
  if (smartShoppingBlockedReasons.length > 0) return "blocked"
  if (qualitySummary.items_sent_to_smart_shopping_count === 0) return "needs_review"
  if (qualitySummary.trusted_items_ratio >= 0.8) return "trusted"
  return "partial"
}

function resolveFinalScanStatus({
  budgetStatus,
  itemsQualityStatus,
  smartShoppingSafe,
}: {
  budgetStatus: string
  itemsQualityStatus: string
  smartShoppingSafe: boolean
}) {
  if (budgetStatus === "rejected") return "rejected"
  if (budgetStatus !== "reliable") return "budget_needs_review"
  if (smartShoppingSafe && itemsQualityStatus === "trusted") return "budget_ok_articles_ok"
  if (itemsQualityStatus === "partial") return "budget_ok_articles_partial"
  return "budget_ok_articles_blocked"
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
  items: ParsedReceiptItem[]
  expectedItemsCount: number
  expectedItemsSource: string
  qualitySummary: ReturnType<typeof summarizeItemQuality>
  itemsQualityStatus: string
  smartShoppingSafe: boolean
  finalScanStatus: string
}) {
  const declaredCountKnown = expectedItemsCount > 0 && String(expectedItemsSource || "").includes("declared")
  const blocked = finalScanStatus === "budget_ok_articles_blocked"
    || smartShoppingSafe === false
    || itemsQualityStatus === "blocked"
    || itemsQualityStatus === "needs_review"
    || qualitySummary.needs_review_items_count > 0

  if (blocked) {
    return {
      displayed_items_count: null,
      displayed_items_count_source: "blocked_unreliable",
      real_items_count_if_known: declaredCountKnown ? expectedItemsCount : null,
      item_count_display_label: "Articles a verifier",
    }
  }

  if (declaredCountKnown && qualitySummary.trusted_items_count === expectedItemsCount) {
    return {
      displayed_items_count: expectedItemsCount,
      displayed_items_count_source: "declared_trusted_count",
      real_items_count_if_known: expectedItemsCount,
      item_count_display_label: `${expectedItemsCount} article(s)`,
    }
  }

  if (smartShoppingSafe && qualitySummary.trusted_items_count > 0 && qualitySummary.trusted_items_count === items.length) {
    return {
      displayed_items_count: qualitySummary.trusted_items_count,
      displayed_items_count_source: "trusted_items_count",
      real_items_count_if_known: declaredCountKnown ? expectedItemsCount : null,
      item_count_display_label: `${qualitySummary.trusted_items_count} article(s)`,
    }
  }

  return {
    displayed_items_count: null,
    displayed_items_count_source: "unknown_or_unreliable",
    real_items_count_if_known: declaredCountKnown ? expectedItemsCount : null,
    item_count_display_label: "Articles a verifier",
  }
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
]

function containsSectionSubtotalKeyword(value = "") {
  const clean = normalize(value)
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return SECTION_SUBTOTAL_KEYWORDS.some(keyword => clean.includes(keyword))
}

function hasDominantOcrNoise(value = "") {
  const clean = normalize(value)
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  const letters = clean.replace(/[^a-z]/g, "")
  if (!letters) return true
  if (/([a-z])\1{5,}/.test(letters)) return true
  if (/\b(e{4,}|h{4,}|o{4,}|r{4,})\b/.test(clean)) return true
  if (/\b(ecooree|eters|heeeee|sungeles)\b/.test(clean)) return true
  if (letters.length >= 10) {
    const uniqueLetters = new Set(letters.split("")).size
    if (uniqueLetters <= 4) return true
  }
  return false
}

function smartShoppingBlockReasons({
  totalDelta,
  lostPossibleProductLines,
  sectionSubtotal,
  lines,
  items,
}: {
  totalDelta: number | null
  lostPossibleProductLines: string[]
  sectionSubtotal: ReturnType<typeof sectionSubtotalDiagnostics>
  lines: string[]
  items: ParsedReceiptItem[]
}) {
  const reasons = new Set<string>()
  if (Number(totalDelta || 0) > 0.05) reasons.add("items_total_mismatch")
  if (lostPossibleProductLines.length > 0) reasons.add("lost_possible_product_lines")
  if (items.some(item => isSectionSubtotalLine(String(item.source_line || item.raw_text || item.ocr_name || item.name || "")))) {
    reasons.add("section_subtotal_kept_as_item")
  }
  if (items.some(item => classifySectionSubtotalLine(String(item.source_line || item.raw_text || item.ocr_name || item.name || "")).kind === "probable")) {
    reasons.add("section_subtotal_probable_kept_as_item")
  }
  if (items.some(item => containsSectionSubtotalKeyword(String(item.ocr_name || item.name || "")) && !hasKnownProductSignal(String(item.ocr_name || item.name || "")))) {
    reasons.add("section_heading_kept_as_item")
  }
  if (items.some(item => hasDominantOcrNoise(String(item.raw_text || item.ocr_name || item.name || "")))) {
    reasons.add("dominant_ocr_noise")
  }
  if (
    Number(totalDelta || 0) > 0.05
    && sectionSubtotal.rejectedCount === 0
    && sectionSubtotal.probableCount === 0
    && lines.some(line => containsSectionSubtotalKeyword(line))
  ) {
    reasons.add("section_subtotals_present_but_not_rejected")
  }
  if (sectionSubtotal.probableCount > 0) {
    reasons.add("section_subtotals_probable_present")
  }
  if (items.some(item => Number(item.item_quality_score ?? item.confidence_score ?? 0) < 70 && normalizeItemQualityStatus(item as unknown as Record<string, unknown>) === "trusted")) {
    reasons.add("low_quality_item_marked_trusted")
  }
  return Array.from(reasons)
}

function applySmartShoppingGuard(items: ParsedReceiptItem[], blockedReasons: string[]) {
  if (blockedReasons.length === 0) return items
  const reason = blockedReasons[0] || "smart_shopping_quality_guard"
  return items.map(item => ({
    ...item,
    item_status: "needs_review",
    status: "needs_review",
    review_status: "needs_review",
    needs_review: true,
    item_quality_score: Math.min(Number(item.item_quality_score ?? item.confidence_score ?? 55), 55),
    confidence_score: Math.min(Number(item.confidence_score ?? item.item_quality_score ?? 55), 55),
    item_rejection_reason: item.item_rejection_reason || reason,
  }))
}

function parseItems(lines: string[], ocrConfidence: number, debug = createParserDebug(lines)): ParsedReceiptItem[] {
  const items: ParsedReceiptItem[] = []
  let pendingName = ""
  let currentDepartment: (typeof DEPARTMENTS)[number] | null = null
  let pendingPromotion = false
  let sectionStartIndex = 0
  let inVatSection = false

  for (const rawLine of lines) {
    const line = rawLine.trim()
    const price = lastMoney(line)
    const promotionLine = normalize(line).includes("prix promotion") || normalize(line).includes("promotion")
    const weightLine = /\bkg\b/i.test(line) && /x/i.test(line) && Number.isFinite(price)

    if (isVatSectionStart(line)) {
      inVatSection = true
      pendingName = ""
      rejectParserLine(debug, line, "vat_section")
      continue
    }

    if (inVatSection) {
      rejectParserLine(debug, line, isVatSectionContinuation(line) ? "vat_section_numeric" : "vat_section_tail")
      continue
    }

    if (isDiscountLine(line)) {
      if (items.length > 0) items[items.length - 1] = { ...items[items.length - 1], promotion: true }
      pendingPromotion = false
      rejectParserLine(debug, line, "discount")
      continue
    }

    if (Number.isFinite(price) && price > 0) {
      const sectionSubtotal = classifySectionSubtotalWithContext(line, items, sectionStartIndex)

      if (sectionSubtotal.kind !== "none") {
        rejectParserLine(debug, line, sectionSubtotal.reason)

        if (sectionSubtotal.kind === "confirmed") {
          sectionStartIndex = items.length
          currentDepartment = null
        }

        pendingName = ""
        pendingPromotion = false
        continue
      }
    }

    if (Number.isFinite(price) && price > 0 && isHardIgnoredPricedLine(line)) {
      rejectParserLine(debug, line, "hard_ignored_priced_line")
      continue
    }

    if (Number.isFinite(price) && price > 0) {
      debug.candidateLinesCount += 1
    } else if (isIgnoredLine(line)) {
      rejectParserLine(debug, line, "ignored_non_product")
      continue
    }

    const department = departmentFromLine(line)
    if (department) {
      scanDebug("rayon détecté", { line, department: department.label })
      if (hasMoneyAmount(line)) {
        applyDepartmentToSection(items, sectionStartIndex, department)
        sectionStartIndex = items.length
      } else {
        currentDepartment = department
        sectionStartIndex = items.length
      }
      continue
    }

    if (isKnownSubtotalLine(line)) {
      scanDebug("ligne ignorée", { reason: "subtotal", line })
      sectionStartIndex = items.length
      continue
    }

    if (weightLine && pendingName) {
      const quantityMatch = line.match(/(\d+[,.]\d{1,3})\s*kg/i)
      const unitPriceMatch = line.match(/x\s*(\d+[,.]\d{2})\s*eur\/kg/i)
      const quantity = quantityMatch ? Number(quantityMatch[1].replace(",", ".")) : 1
      const unitPrice = unitPriceMatch ? Number(unitPriceMatch[1].replace(",", ".")) : null

      items.push(buildItem({
        rawName: pendingName,
        quantity,
        unit: "kg",
        unitPrice,
        totalPrice: price,
        ocrConfidence: ocrConfidence + 3,
        currentDepartment,
        promotion: pendingPromotion,
      }))
      pendingName = ""
      pendingPromotion = false
      continue
    }

    if (Number.isFinite(price)) {
      const candidateName = cleanProductName(line.replace(/(\d+[,.]\d{2})\s*(eur|euro|euros)?/gi, ""))
      const quantityLine = pendingName && isQuantityOnlyCandidate(candidateName)
      const nextLinePriceForPendingProduct = pendingName && (promotionLine || candidateName.length < 3 || isQuantityOnlyCandidate(candidateName))
      const name = quantityLine || nextLinePriceForPendingProduct ? pendingName : candidateName.length >= 2 ? candidateName : pendingName
      const quantityMatch = quantityLine ? line.match(/\b(\d+)\s*x\s*(\d+[,.]\d{2})/i) : null
      const quantity = quantityMatch ? Number(quantityMatch[1]) : 1
      const unitPrice = quantityMatch ? Number(quantityMatch[2].replace(",", ".")) : price

      if (name && name.length >= 2 && !isHardIgnoredPricedLine(name)) {
        items.push(buildItem({
          rawName: name,
          quantity,
          unit: "piece",
          unitPrice,
          totalPrice: price,
          ocrConfidence,
          currentDepartment,
          promotion: pendingPromotion || promotionLine,
        }))
        pendingName = ""
        pendingPromotion = false
      } else {
        scanDebug("produit rejeté", { reason: "invalid_name", line, candidateName })
      }
      continue
    }

    const maybeProduct = cleanProductName(line)
    if (normalize(line).includes("promotion")) {
      scanDebug("ligne ignorée", { reason: "promotion_marker", line })
      pendingPromotion = true
      continue
    }
    if (maybeProduct.length >= 2 && /[a-zA-Z]/.test(maybeProduct)) {
      pendingName = maybeProduct
    } else {
      scanDebug("produit rejeté", { reason: "no_price_or_invalid_pending", line })
    }
  }

  return mergeReceiptItems(items, []).slice(0, 80)
}

export function parseReceipt({ text = "", ocrStatus = "manual", ocrConfidence = 0 }) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)

  const store = detectStore(text)
  const storeMeta = normalizeStoreFromRules(text)
  const parserDebug = createParserDebug(lines)
  const declaredEvidence = extractDeclaredItemsEvidence(text)
  const expectedItemsCount = declaredEvidence.count
  const rawItems = parseItems(lines, ocrConfidence, parserDebug)
  const candidateItemsBeforeRejection = parserDebug.candidateLinesCount
  const rejectedBeforeItemLimitLines = parserDebug.rejectedLines.map(row => ({
    ...row,
    quality_reason: classifyLineRejectionReason(row.line) || row.reason,
  }))
  const initialItems = expectedItemsCount > 0 && rawItems.length > expectedItemsCount
    ? rawItems.slice(0, expectedItemsCount)
    : rawItems
  const itemLimitAppliedAfterFiltering = expectedItemsCount > 0 && rawItems.length > expectedItemsCount
  const lostPossibleProductLines = itemLimitAppliedAfterFiltering
    ? rawItems.slice(expectedItemsCount).map(item => item.raw_text || item.ocr_name || item.name)
    : []
  const total = detectTotal(lines)
  const trustedTotal = extractTrustedTotal(text)
  const purchaseDate = detectDate(text)
  const initialItemsTotal = initialItems.reduce((sum, item) => sum + Number(item.total_price ?? item.price ?? item.unit_price ?? 0), 0)
  const sectionSubtotal = sectionSubtotalDiagnostics(lines)
  const textPresence = localOcrTextPresenceDiagnostics(lines, total, expectedItemsCount)
  const initialItemsTotalRounded = Number(initialItemsTotal.toFixed(2))
  const calculatedBeforeSectionFilter = Number((initialItemsTotal + sectionSubtotal.rejectedAmount).toFixed(2))
  const totalDelta = total ? Number(Math.abs(initialItemsTotalRounded - total).toFixed(2)) : null
  const smartShoppingBlockedReasons = smartShoppingBlockReasons({
    totalDelta,
    lostPossibleProductLines,
    sectionSubtotal,
    lines,
    items: initialItems,
  })
  const items = applySmartShoppingGuard(initialItems, smartShoppingBlockedReasons)
  const classification = classifyReceipt({ store_name: store, ocr_text: text, items })
  const itemsTotal = items.reduce((sum, item) => sum + Number(item.total_price ?? item.price ?? item.unit_price ?? 0), 0)
  const itemsTotalRounded = Number(itemsTotal.toFixed(2))
  const exactDeclaredCount = expectedItemsCount > 0 && items.length === expectedItemsCount
  const qualitySummaryRaw = summarizeItemQuality(items, parserDebug.rejectedLines)
  const itemsQualityStatus = resolveItemsQualityStatus({
    items,
    qualitySummary: qualitySummaryRaw,
    smartShoppingBlockedReasons,
  })
  const qualitySummary = {
    ...qualitySummaryRaw,
    items_quality_status: itemsQualityStatus,
  }
  const budgetReliable = Boolean(store && purchaseDate && total && !(trustedTotal.amount && trustedTotal.paymentRaw && !trustedTotal.paymentConsistent))
  const budgetStatus = budgetReliable ? "reliable" : "needs_review"
  const smartShoppingSafe = budgetReliable
    && smartShoppingBlockedReasons.length === 0
    && qualitySummary.items_sent_to_smart_shopping_count > 0
  const scanStatusLegacy = exactDeclaredCount && total && store && purchaseDate ? "trusted" : items.length >= 3 && total ? "usable_review" : "failed"
  const finalScanStatus = resolveFinalScanStatus({
    budgetStatus,
    itemsQualityStatus,
    smartShoppingSafe,
  })
  const displayedItemsDiagnostics = resolveDisplayedItemsDiagnostics({
    items,
    expectedItemsCount,
    expectedItemsSource: declaredEvidence.source,
    qualitySummary,
    itemsQualityStatus,
    smartShoppingSafe,
    finalScanStatus,
  })
  console.info("[scanner] OCR_DEBUG_SUMMARY", {
    raw_lines_count: parserDebug.rawLinesCount,
    candidate_items_before_rejection: candidateItemsBeforeRejection,
    article_candidate_lines_count: parserDebug.candidateLinesCount,
    rejected_lines_count: parserDebug.rejectedLinesCount,
    rejected_lines: parserDebug.rejectedLines,
    rejected_before_item_limit_count: rejectedBeforeItemLimitLines.length,
    rejected_before_item_limit_lines: rejectedBeforeItemLimitLines,
    final_items_count: items.length,
    final_items_after_rejection: items.length,
    item_limit_applied_after_filtering: itemLimitAppliedAfterFiltering,
    lost_possible_product_lines: lostPossibleProductLines,
    expected_items_count: expectedItemsCount || null,
    total_detected: total,
    items_sum: itemsTotalRounded,
    calculated_items_sum_before_section_filter: calculatedBeforeSectionFilter,
    calculated_items_sum_after_section_filter: itemsTotalRounded,
    section_subtotals_rejected_count: sectionSubtotal.rejectedCount,
    section_subtotals_rejected_amount: sectionSubtotal.rejectedAmount,
    section_subtotals_rejected_lines: sectionSubtotal.rejected.map(item => item.line),
    section_subtotals_probable_count: sectionSubtotal.probableCount,
    section_subtotals_probable_lines: sectionSubtotal.probable.map(item => item.line),
    rejected_section_subtotal_examples: sectionSubtotal.rejected.map(item => item.line).slice(0, 8),
    items_total_vs_receipt_total_delta: totalDelta,
    ...qualitySummary,
    ...displayedItemsDiagnostics,
    budget_reliable: budgetReliable,
    budget_status: budgetStatus,
    smart_shopping_safe: smartShoppingSafe,
    smart_shopping_blocked_reasons: smartShoppingBlockedReasons,
    final_scan_status: finalScanStatus,
    scan_status_legacy: scanStatusLegacy,
    ...textPresence,
    source_used: "parser",
  })
  const warnings = []

  if (!store) warnings.push("store_missing")
  if (!total) warnings.push("total_missing")
  if (items.length === 0) warnings.push("items_missing")
  if (!purchaseDate) warnings.push("date_estimated")

  return {
    store_name: storeMeta.store_name || store || "Enseigne non reconnue",
    merchant_name: storeMeta.store_name || store || "Enseigne non reconnue",
    merchant_confidence: store ? 90 : 0,
    normalized_store_name: storeMeta.normalized_store_name || "",
    store_location: storeMeta.store_location || "",
    purchase_date: purchaseDate || null,
    date_status: purchaseDate ? "detected" : "needs_review",
    total_amount: total,
    currency: "EUR",
    ocr_text: text,
    ocr_status: ocrStatus as ParsedReceipt["ocr_status"],
    ai_used: false,
    validation_status: "draft",
    ticket_type: classification.ticket_type,
    budget_category: classification.budget_category,
    is_food_ticket: classification.is_food_ticket,
    scan_status: finalScanStatus,
    expected_items_count: expectedItemsCount || null,
    expected_items_source: expectedItemsCount ? declaredEvidence.source : "not_found",
    declared_items_count: expectedItemsCount || null,
    declared_items_raw_text: declaredEvidence.raw,
    items_count_status: expectedItemsCount ? "declared" : "unknown",
    total_needs_review: !total,
    total_source: trustedTotal.source || (total ? "explicit_total_line" : "missing_or_unreliable"),
    total_raw_text: trustedTotal.raw || "",
    total_confidence: trustedTotal.confidence || (total ? 0.82 : 0),
    payment_method: detectPaymentMethod(trustedTotal.paymentRaw || ""),
    payment_total_value: trustedTotal.paymentAmount || null,
    payment_total_raw_text: trustedTotal.paymentRaw || "",
    total_payment_consistent: Boolean(trustedTotal.paymentConsistent),
    budget_status: budgetStatus,
    items_quality_status: itemsQualityStatus,
    smart_shopping_safe: smartShoppingSafe,
    smart_shopping_blocked_reasons: smartShoppingBlockedReasons,
    final_scan_status: finalScanStatus,
    scan_status_legacy: scanStatusLegacy,
    confidence_score: Math.max(0, Math.min(100, Math.round(((ocrConfidence || 0) + (total ? 20 : 0) + (items.length ? 10 : 0) + (store ? 10 : 0)) / 1.4))),
    parser_debug: {
      raw_lines_count: parserDebug.rawLinesCount,
      candidate_items_before_rejection: candidateItemsBeforeRejection,
      article_candidate_lines_count: parserDebug.candidateLinesCount,
      rejected_lines_count: parserDebug.rejectedLinesCount,
      rejected_lines: parserDebug.rejectedLines,
      rejected_before_item_limit_count: rejectedBeforeItemLimitLines.length,
      rejected_before_item_limit_lines: rejectedBeforeItemLimitLines,
      final_items_count: items.length,
      final_items_after_rejection: items.length,
      item_limit_applied_after_filtering: itemLimitAppliedAfterFiltering,
      lost_possible_product_lines: lostPossibleProductLines,
      expected_items_count: expectedItemsCount || null,
      total_detected: total,
      items_sum: itemsTotalRounded,
      calculated_items_sum_before_section_filter: calculatedBeforeSectionFilter,
      calculated_items_sum_after_section_filter: itemsTotalRounded,
      section_subtotals_rejected_count: sectionSubtotal.rejectedCount,
      section_subtotals_rejected_amount: sectionSubtotal.rejectedAmount,
      section_subtotals_rejected: sectionSubtotal.rejected,
      section_subtotals_rejected_lines: sectionSubtotal.rejected.map(item => item.line),
      section_subtotals_probable_count: sectionSubtotal.probableCount,
      section_subtotals_probable: sectionSubtotal.probable,
      section_subtotals_probable_lines: sectionSubtotal.probable.map(item => item.line),
      rejected_section_subtotal_examples: sectionSubtotal.rejected.map(item => item.line).slice(0, 8),
      items_kept_lines: items.map(item => item.ocr_name || item.name),
      items_rejected_lines: rejectedBeforeItemLimitLines,
      items_total_vs_receipt_total_delta: totalDelta,
      ...qualitySummary,
      ...displayedItemsDiagnostics,
      budget_reliable: budgetReliable,
      budget_status: budgetStatus,
      smart_shopping_safe: smartShoppingSafe,
      smart_shopping_blocked_reasons: smartShoppingBlockedReasons,
      final_scan_status: finalScanStatus,
      scan_status_legacy: scanStatusLegacy,
      ...textPresence,
      source_used: "parser",
    },
    items,
    warnings,
  }
}
