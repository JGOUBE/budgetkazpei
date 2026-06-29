type ReceiptLike = {
  store_name?: string
  purchase_date?: string
  total_amount?: number | string
  items?: unknown[]
  receipt_items?: unknown[]
}

function amount(value: number | string | undefined) {
  return Number(String(value ?? 0).replace(",", ".")) || 0
}

function sameDay(a = "", b = "") {
  return String(a || "").slice(0, 10) === String(b || "").slice(0, 10)
}

export function validateParsedReceipt(receipt: ReceiptLike) {
  const issues = []

  if (!amount(receipt.total_amount)) issues.push("total_missing")

  return {
    valid: issues.length === 0,
    issues,
  }
}

export function findDuplicateReceipt(receipt: ReceiptLike, existingReceipts: ReceiptLike[] = []) {
  const currentTotal = amount(receipt.total_amount)
  const currentCount = (receipt.items || []).length

  return existingReceipts.find(row => {
    const totalClose = Math.abs(amount(row.total_amount) - currentTotal) <= 0.05
    const sameStore = String(row.store_name || "").toLowerCase() === String(receipt.store_name || "").toLowerCase()
    const sameDate = sameDay(row.purchase_date, receipt.purchase_date)
    const rowCount = (row.receipt_items || []).length
    const sameCount = !currentCount || !rowCount || Math.abs(rowCount - currentCount) <= 1

    return totalClose && sameStore && sameDate && sameCount
  }) || null
}

export function getConfidenceColor(score = 0) {
  if (score >= 85) return "#22C55E"
  if (score >= 70) return "#FCD34D"
  return "#EF4444"
}

export function getConfidenceIcon(score = 0) {
  if (score >= 85) return "●"
  if (score >= 70) return "●"
  return "⚠"
}
