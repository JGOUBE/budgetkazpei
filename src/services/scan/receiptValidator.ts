type ReceiptLike = {
  store_name?: string
  purchase_date?: string
  total_amount?: number | string
  items?: any[]
  receipt_items?: unknown[]
}

function amount(value: number | string | undefined) {
  return Number(String(value ?? 0).replace(",", ".")) || 0
}

function sameDay(a = "", b = "") {
  return String(a || "").slice(0, 10) === String(b || "").slice(0, 10)
}

function dateDistanceDays(a = "", b = "") {
  const left = Date.parse(String(a || "").slice(0, 10))
  const right = Date.parse(String(b || "").slice(0, 10))
  if (Number.isNaN(left) || Number.isNaN(right)) return Number.POSITIVE_INFINITY
  return Math.abs(left - right) / 86400000
}

function normalizeMerchant(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\be\s+leclerc\b|\beleclerc\b|\bleclerc\b/g, "eleclerc")
    .replace(/\bleader\s*price\b|\bleaderprice\b/g, "leader price")
}

function itemNames(receipt: ReceiptLike) {
  const source = Array.isArray(receipt.items) ? receipt.items : Array.isArray(receipt.receipt_items) ? receipt.receipt_items : []
  return source
    .map((item: any) => String(item?.normalized_name || item?.corrected_name || item?.name || "").toLowerCase().trim())
    .filter(Boolean)
}

function sharedItemRatio(left: string[], right: string[]) {
  if (!left.length || !right.length) return 0
  const rightSet = new Set(right)
  const shared = left.filter(name => rightSet.has(name)).length
  return shared / Math.min(left.length, right.length)
}

export function validateParsedReceipt(receipt: ReceiptLike) {
  const issues = []
  const blockingIssues = []
  const total = amount(receipt.total_amount)
  const items = Array.isArray(receipt.items) ? receipt.items : []
  const itemsTotal = items.reduce((sum, item) => {
    return sum + amount(item?.total_price ?? item?.price ?? item?.unit_price)
  }, 0)
  const totalGap = total > 0 && itemsTotal > 0 ? Math.abs(itemsTotal - total) : null
  const totalGapRatio = totalGap == null || total <= 0 ? null : totalGap / total
  const totalComparisonStatus = totalGap == null
    ? "not_available"
    : totalGap <= 0.15 || (totalGapRatio != null && totalGapRatio <= 0.03)
      ? "coherent"
      : "needs_review"

  if (!total) {
    issues.push("total_missing")
    blockingIssues.push("total_missing")
  }
  if (totalComparisonStatus === "needs_review") issues.push("items_total_mismatch")

  return {
    valid: blockingIssues.length === 0,
    issues,
    blocking_issues: blockingIssues,
    items_total_amount: Number(itemsTotal.toFixed(2)),
    receipt_total_amount: total,
    total_gap_amount: totalGap == null ? null : Number(totalGap.toFixed(2)),
    total_gap_ratio: totalGapRatio == null ? null : Number(totalGapRatio.toFixed(4)),
    total_comparison_status: totalComparisonStatus,
  }
}

export function findDuplicateReceipt(receipt: ReceiptLike, existingReceipts: ReceiptLike[] = []) {
  const currentTotal = amount(receipt.total_amount)
  const currentCount = (receipt.items || []).length
  const currentStore = normalizeMerchant(receipt.store_name)
  const currentNames = itemNames(receipt)

  return existingReceipts.find(row => {
    const totalClose = Math.abs(amount(row.total_amount) - currentTotal) <= 0.05
    const rowStore = normalizeMerchant(row.store_name)
    const sameStore = rowStore === currentStore || Boolean(rowStore && currentStore && (rowStore.includes(currentStore) || currentStore.includes(rowStore)))
    const sameDate = sameDay(row.purchase_date, receipt.purchase_date) || dateDistanceDays(row.purchase_date, receipt.purchase_date) <= 1
    const rowCount = (row.receipt_items || []).length
    const sameCount = !currentCount || !rowCount || Math.abs(rowCount - currentCount) <= 1
    const similarItems = sharedItemRatio(currentNames, itemNames(row)) >= 0.55

    return totalClose && sameStore && sameDate && (sameCount || similarItems)
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
