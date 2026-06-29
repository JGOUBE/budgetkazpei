const STORE_NAMES = [
  "Leader Price",
  "Leclerc",
  "Carrefour",
  "Score",
  "U Express",
  "Super U",
  "Intermarche",
  "Intermarché",
  "Jumbo",
  "Run Market",
]

function normalize(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

function parseAmount(value = "") {
  const match = String(value).match(/(\d+[,.]\d{2}|\d+)/)
  if (!match) return null
  return Number(match[1].replace(",", "."))
}

function parseDate(text = "") {
  const match = text.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/)
  if (!match) return new Date().toISOString().split("T")[0]

  const day = match[1].padStart(2, "0")
  const month = match[2].padStart(2, "0")
  const rawYear = match[3]
  const year = rawYear.length === 2 ? `20${rawYear}` : rawYear

  return `${year}-${month}-${day}`
}

function detectStore(text = "") {
  const clean = normalize(text)
  return STORE_NAMES.find(name => clean.includes(normalize(name))) || ""
}

function detectTotal(lines = []) {
  const totalLine = [...lines].reverse().find(line => {
    const clean = normalize(line)
    return clean.includes("total") || clean.includes("a payer") || clean.includes("net a payer")
  })

  if (totalLine) return parseAmount(totalLine)

  const amounts = lines
    .map(parseAmount)
    .filter(value => Number.isFinite(value))

  return amounts.length > 0 ? Math.max(...amounts) : null
}

function detectItems(lines = []) {
  return lines
    .map(line => {
      const amount = parseAmount(line)
      const label = String(line)
        .replace(/(\d+[,.]\d{2}|\d+)\s*€?/g, "")
        .replace(/\s+/g, " ")
        .trim()

      return { label, amount }
    })
    .filter(item => item.label.length >= 3 && Number.isFinite(item.amount))
    .filter(item => !normalize(item.label).includes("total"))
    .slice(0, 20)
    .map(item => ({
      name: item.label,
      quantity: 1,
      unit_price: item.amount,
      total_price: item.amount,
      category: "alimentaire",
      confidence_score: 55,
    }))
}

export function parseReceiptText(ocrText = "") {
  const lines = String(ocrText || "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)

  return {
    store_name: detectStore(ocrText),
    purchase_date: parseDate(ocrText),
    total_amount: detectTotal(lines) || 0,
    currency: "EUR",
    ocr_text: ocrText,
    ocr_status: ocrText ? "success" : "manual",
    ai_used: false,
    validation_status: "draft",
    items: detectItems(lines),
  }
}

export function createManualReceiptDraft() {
  return {
    store_name: "",
    purchase_date: new Date().toISOString().split("T")[0],
    total_amount: 0,
    currency: "EUR",
    ocr_text: "",
    ocr_status: "manual",
    ai_used: false,
    validation_status: "draft",
    items: [],
  }
}
