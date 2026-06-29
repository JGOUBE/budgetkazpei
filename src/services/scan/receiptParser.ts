import { classifyReceipt } from "./receiptClassifier"

const STORES = [
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
  { label: "HYGIENE", category: "sante", subcategory: "Hygiene", headings: ["hygiene", "hygiene beaute", "droguerie parfumerie hygiene", "dph", "beaute"], keywords: ["shampoing", "savon", "dentifrice", "mouch", "mouchoir", "lessive"] },
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
  unit_price?: number | null
  total_price?: number | null
  category: string
  subcategory?: string | null
  department?: string | null
  ticket_section?: string | null
  promotion?: boolean
  vat?: number | null
  confidence_score: number
}

export type ParsedReceipt = {
  store_name: string
  merchant_name: string
  merchant_confidence: number
  purchase_date: string
  date_status: "detected" | "estimated"
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
  scan_status?: "success" | "partial" | "failed"
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

function normalizeLookup(value = "") {
  return normalize(value).replace(/[^a-z0-9]/g, "")
}

const STORE_ALIASES: Record<string, string> = {
  leaderprix: "Leader Price",
  leaderprx: "Leader Price",
  leaderprice: "Leader Price",
  leaderprice974: "Leader Price",
}

function detectStore(text = "") {
  const cleaned = normalizeLookup(text)
  const store = STORES.find(storeName => cleaned.includes(normalizeLookup(storeName)))
  if (store) return store
  const aliasEntry = Object.entries(STORE_ALIASES).find(([alias]) => cleaned.includes(alias))
  return aliasEntry?.[1] || ""
}

function detectDate(text = "") {
  const rawLine = String(text || "")
    .split(/\r?\n/)
    .find(line => /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/.test(line))
  const match = String(rawLine || text).match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/)
  if (!match) {
    scanDebug("raw OCR date line", rawLine || "not found")
    scanDebug("date parsed", "")
    return ""
  }

  const day = match[1].padStart(2, "0")
  const month = match[2].padStart(2, "0")
  const year = match[3].length === 2 ? `20${match[3]}` : match[3]
  const parsed = `${year}-${month}-${day}`
  scanDebug("raw OCR date line", rawLine || match[0])
  scanDebug("date parsed", parsed)
  return parsed
}

export function normalizeReceiptDate(value = "") {
  const raw = String(value || "").trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const match = raw.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/)
  if (!match) return ""
  const day = match[1].padStart(2, "0")
  const month = match[2].padStart(2, "0")
  const year = match[3].length === 2 ? `20${match[3]}` : match[3]
  return `${year}-${month}-${day}`
}

export function extractReceiptTotal(text = "") {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)

  const totalPatterns = [
    /\b(total|total\s+ttc|net\s+a\s+payer|a\s+payer|montant)\b/i,
    /\b(carte\s+bleue|cb|visa|mastercard)\b/i,
  ]

  const totalLine = [...lines].reverse().find(line => {
    const clean = normalize(line)
    return totalPatterns.some(pattern => pattern.test(clean))
  })

  if (totalLine) return money(totalLine) || 0

  return 0
}

function detectTotal(lines: string[]) {
  return extractReceiptTotal(lines.join("\n"))
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

function isNonProductText(value = "") {
  const clean = normalize(value)
    .replace(/[^a-z0-9% ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (!clean) return true
  if (clean.includes("jeudi") || clean.includes("judith")) return true
  if (clean.includes("mdd") && (clean.includes("alcool") || clean.includes("remise") || clean.includes("10"))) return true
  if (clean.includes("prix promotion")) return true
  if (clean.includes("total") || clean.includes("carte bleue") || clean.includes("duplicata")) return true
  if (clean.includes("operation") || clean.includes("bienvenue") || clean.includes("ventilation")) return true
  if (clean.includes("tva") || clean.includes("ttc") || clean.includes("ht")) return true
  if (clean.includes("point") || clean.includes("fidelite") || clean.includes("solde")) return true
  if (clean.includes("beneficiez") || clean.includes("merci")) return true
  return false
}

function isBarcodeOnlyLine(line = "") {
  const digits = String(line || "").replace(/[^0-9]/g, "")
  return digits.length >= 8 && !/[a-zA-Z]/.test(line) && !hasMoneyAmount(line)
}

function scanDebug(label: string, payload?: unknown) {
  if (typeof console === "undefined") return
  console.info(`[scanner] ${label}`, payload ?? "")
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
  const dept = currentDepartment || DEPARTMENTS.find(row => row.keywords.some(keyword => clean.includes(normalize(keyword)))) || null
  return {
    category: dept?.category || categoryFor(name),
    subcategory: dept?.subcategory || null,
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
  const uncertain = looksUncertain(ocrName)
  const correctedName = uncertain ? "Produit à vérifier" : ocrName
  const meta = metadataFor(ocrName, currentDepartment)
  const baseConfidence = Math.max(45, Math.min(98, Math.round(ocrConfidence + (uncertain ? -10 : 15))))

  return {
    name: correctedName,
    ocr_name: ocrName,
    corrected_name: correctedName,
    normalized_name: normalizedProductName(isVerificationPlaceholder(correctedName) ? ocrName : correctedName),
    brand: guessBrandFromName(ocrName),
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
    confidence_score: baseConfidence,
  }
}

function cleanProductName(line = "") {
  return String(line || "")
    .replace(/^\(?\d+\)?\d{4,}\s*/, "")
    .replace(/^\*+/, "")
    .replace(/\bprix promotion\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
}

function isStoreLine(line = "") {
  const clean = normalizeLookup(line)
  if (STORES.some(store => clean === normalizeLookup(store) || clean.includes(normalizeLookup(store)))) return true
  if (Object.keys(STORE_ALIASES).some(alias => clean.includes(alias))) return true
  return false
}

function isIgnoredLine(line = "") {
  const clean = normalize(line)
  const ignored = !clean
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
  const uncertain = looksUncertain(sourceName)
  const correctedName = uncertain ? "Produit à vérifier" : sourceName
  const meta = metadataFor(sourceName)
  const itemCategory = String(item.category || "").trim()

  return {
    name: correctedName,
    ocr_name: rawName || sourceName,
    corrected_name: correctedName,
    normalized_name: item.normalized_name || normalizedProductName(isVerificationPlaceholder(correctedName) ? rawName || sourceName : correctedName),
    brand: item.brand || guessBrandFromName(sourceName),
    quantity: Number(item.quantity || 1),
    unit: item.unit || "piece",
    unit_price: item.unit_price == null ? null : Number(item.unit_price),
    total_price: item.total_price == null ? null : Number(item.total_price),
    category: meta.category || (VALID_CATEGORIES.has(itemCategory) ? itemCategory : "alimentaire"),
    subcategory: item.subcategory || meta.subcategory,
    department: item.department || meta.department,
    ticket_section: item.ticket_section || meta.ticket_section,
    promotion: Boolean(item.promotion),
    vat: item.vat ?? null,
    confidence_score: Math.max(35, Math.min(98, Number(item.confidence_score || 75) + (uncertain ? -25 : 0))),
  }
}

export function mergeReceiptItems(primary: ParsedReceiptItem[] = [], fallback: ParsedReceiptItem[] = []) {
  const byName = new Map<string, ParsedReceiptItem>()

  ;[...primary, ...fallback].forEach(item => {
    const sourceText = String(item.ocr_name || item.corrected_name || item.name || "")
    if (isNonProductText(sourceText)) {
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

function parseItems(lines: string[], ocrConfidence: number): ParsedReceiptItem[] {
  const items: ParsedReceiptItem[] = []
  let pendingName = ""
  let currentDepartment: (typeof DEPARTMENTS)[number] | null = null
  let pendingPromotion = false
  let sectionStartIndex = 0

  for (const rawLine of lines) {
    const line = rawLine.trim()

    if (isDiscountLine(line)) {
      if (items.length > 0) items[items.length - 1] = { ...items[items.length - 1], promotion: true }
      pendingPromotion = false
      continue
    }

    if (isIgnoredLine(line)) continue

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

    const price = lastMoney(line)
    const promotionLine = normalize(line).includes("prix promotion") || normalize(line).includes("promotion")
    const weightLine = /\bkg\b/i.test(line) && /x/i.test(line) && Number.isFinite(price)

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
      const name = quantityLine ? pendingName : candidateName.length >= 3 ? candidateName : pendingName
      const quantityMatch = quantityLine ? line.match(/\b(\d+)\s*x\s*(\d+[,.]\d{2})/i) : null
      const quantity = quantityMatch ? Number(quantityMatch[1]) : 1
      const unitPrice = quantityMatch ? Number(quantityMatch[2].replace(",", ".")) : price

      if (name && name.length >= 3 && !isIgnoredLine(name)) {
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
    if (maybeProduct.length >= 4 && /[a-zA-Z]/.test(maybeProduct)) {
      pendingName = maybeProduct
    } else {
      scanDebug("produit rejeté", { reason: "no_price_or_invalid_pending", line })
    }
  }

  return mergeReceiptItems(items, []).slice(0, 60)
}

export function parseReceipt({ text = "", ocrStatus = "manual", ocrConfidence = 0 }) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)

  const store = detectStore(text)
  const items = parseItems(lines, ocrConfidence)
  const total = detectTotal(lines)
  const purchaseDate = detectDate(text)
  const classification = classifyReceipt({ store_name: store, ocr_text: text, items })
  const warnings = []

  if (!store) warnings.push("store_missing")
  if (!total) warnings.push("total_missing")
  if (items.length === 0) warnings.push("items_missing")
  if (!purchaseDate) warnings.push("date_estimated")

  return {
    store_name: store || "Enseigne non reconnue",
    merchant_name: store || "Enseigne non reconnue",
    merchant_confidence: store ? 90 : 0,
    purchase_date: purchaseDate || new Date().toISOString().slice(0, 10),
    date_status: purchaseDate ? "detected" : "estimated",
    total_amount: total,
    currency: "EUR",
    ocr_text: text,
    ocr_status: ocrStatus as ParsedReceipt["ocr_status"],
    ai_used: false,
    validation_status: "draft",
    ticket_type: classification.ticket_type,
    budget_category: classification.budget_category,
    is_food_ticket: classification.is_food_ticket,
    confidence_score: Math.max(0, Math.min(100, Math.round(((ocrConfidence || 0) + (total ? 20 : 0) + (items.length ? 10 : 0) + (store ? 10 : 0)) / 1.4))),
    items,
    warnings,
  }
}
