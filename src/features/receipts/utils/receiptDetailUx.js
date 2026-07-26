export const RECEIPT_DETAIL_BUTTON_LABELS = {
  fr: "Enregistrer les modifications du ticket",
  kr: "Anrezistre bann modifikasion lo tiké",
}

export const RECEIPT_DETAIL_CONFIRMATION_LABELS = {
  fr: "Modifications du ticket enregistrées.",
  kr: "Bann modifikasion lo tiké inn anrezistré.",
}

function isPlainRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function normalizeText(value = "") {
  return String(value || "").trim()
}

function formatCompactDate(value = "") {
  const raw = normalizeText(value)
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!isoMatch) return raw
  return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`
}

export function buildReceiptHistorySummary(receipt = {}, formatAmount) {
  const store = normalizeText(receipt.store_name) || "Ticket"
  const date = formatCompactDate(receipt.purchase_date)
  const amount = typeof formatAmount === "function"
    ? formatAmount(Number(receipt.total_amount || 0))
    : String(receipt.total_amount || "")

  return [store, date, amount].filter(Boolean).join(" · ")
}

export function splitReceiptDetailSavePayload(payload = {}) {
  if (isPlainRecord(payload) && ("receiptUpdates" in payload || "itemUpdates" in payload)) {
    return {
      receiptUpdates: isPlainRecord(payload.receiptUpdates) ? payload.receiptUpdates : null,
      itemUpdates: Array.isArray(payload.itemUpdates) ? payload.itemUpdates : [],
    }
  }

  return {
    receiptUpdates: isPlainRecord(payload) ? payload : null,
    itemUpdates: [],
  }
}

export function mergeUpdatedReceiptRow(rows = [], updatedReceipt = {}) {
  const safeRows = Array.isArray(rows) ? rows : []
  if (!updatedReceipt?.id) return safeRows

  return safeRows.map(row => row.id === updatedReceipt.id ? { ...row, ...updatedReceipt } : row)
}

export function buildReceiptSaveSuccessUiState({
  rows = [],
  updatedReceipt = null,
  confirmationMessage = "",
} = {}) {
  return {
    nextRows: mergeUpdatedReceiptRow(rows, updatedReceipt || {}),
    nextMode: "history",
    nextDetail: null,
    nextDetailImageUrl: "",
    nextMessage: confirmationMessage,
  }
}

export function buildReceiptSaveFailureUiState(currentState = {}) {
  return {
    nextMode: currentState.mode || "detail",
    nextDetail: currentState.detail || null,
    nextDetailImageUrl: currentState.detailImageUrl || "",
    nextMessage: currentState.message || "",
  }
}
