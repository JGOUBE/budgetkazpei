function firstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value || "").trim()
    if (text) return text
  }
  return ""
}

function normalizeComparableText(value = "") {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
}

function normalizeComparablePrice(value) {
  if (value === "" || value == null) return ""
  const numeric = Number(String(value).replace(",", "."))
  if (!Number.isFinite(numeric)) return ""
  return numeric.toFixed(2)
}

export function getReceiptItemRawName(item = {}) {
  return firstNonEmpty(item.raw_name, item.ocr_name)
}

export function getReceiptItemVisibleName(item = {}) {
  return firstNonEmpty(
    item.corrected_name,
    item.market_canonical_name,
    item.canonical_name,
    item.name,
    item.raw_name,
    item.ocr_name,
  )
}

export function createReceiptItemDraft(item = {}) {
  return {
    corrected_name: getReceiptItemVisibleName(item),
    total_price: item.total_price ?? "",
    category: item.category || "alimentaire",
  }
}

export function buildReceiptItemDraftMap(items = []) {
  return Object.fromEntries(
    (Array.isArray(items) ? items : []).map(item => [item.id, createReceiptItemDraft(item)]),
  )
}

export function hasReceiptItemDraftChanges(item = {}, draft = null) {
  if (!draft) return false

  const baselineName = normalizeComparableText(getReceiptItemVisibleName(item))
  const draftName = normalizeComparableText(draft.corrected_name)
  if (baselineName !== draftName) return true

  const baselinePrice = normalizeComparablePrice(item.total_price)
  const draftPrice = normalizeComparablePrice(draft.total_price)
  if (baselinePrice !== draftPrice) return true

  const baselineCategory = String(item.category || "alimentaire")
  const draftCategory = String(draft.category || "alimentaire")
  return baselineCategory !== draftCategory
}

export function buildReceiptItemUpdatePayload(item = {}, draft = null, overrides = {}) {
  const safeDraft = draft || createReceiptItemDraft(item)
  const baselineName = normalizeComparableText(getReceiptItemVisibleName(item))
  const draftName = normalizeComparableText(safeDraft.corrected_name)
  const correctedName = draftName !== baselineName
    ? draftName
    : normalizeComparableText(item.corrected_name)

  return {
    corrected_name: correctedName,
    total_price: safeDraft.total_price === "" ? "" : safeDraft.total_price,
    category: safeDraft.category || item.category || "alimentaire",
    ...overrides,
  }
}

export function applyReceiptItemDraftToItem(item = {}, draft = null) {
  const updates = buildReceiptItemUpdatePayload(item, draft)
  return {
    ...item,
    corrected_name: updates.corrected_name,
    total_price: updates.total_price === "" ? null : Number(String(updates.total_price).replace(",", ".")),
    category: updates.category,
  }
}

export function applyValidatedReceiptItemDraft(item = {}, draft = null) {
  return {
    ...applyReceiptItemDraftToItem(item, draft),
    item_status: "user_validated",
    status: "user_validated",
    review_status: "trusted",
    needs_review: false,
  }
}

export function hasReceiptItemPendingPersistence(item = {}, workingItem = null) {
  if (!workingItem) return false

  if (normalizeComparableText(item.corrected_name) !== normalizeComparableText(workingItem.corrected_name)) return true
  if (normalizeComparablePrice(item.total_price) !== normalizeComparablePrice(workingItem.total_price)) return true
  if (String(item.category || "alimentaire") !== String(workingItem.category || "alimentaire")) return true
  if (String(item.item_status || item.status || "") !== String(workingItem.item_status || workingItem.status || "")) return true
  if (String(item.review_status || "") !== String(workingItem.review_status || "")) return true
  if (Boolean(item.needs_review) !== Boolean(workingItem.needs_review)) return true

  return false
}

export function buildReceiptItemPersistenceUpdates(item = {}, workingItem = {}) {
  const updates = {}

  if (normalizeComparableText(item.corrected_name) !== normalizeComparableText(workingItem.corrected_name)) {
    updates.corrected_name = normalizeComparableText(workingItem.corrected_name)
  }
  if (normalizeComparablePrice(item.total_price) !== normalizeComparablePrice(workingItem.total_price)) {
    updates.total_price = workingItem.total_price === "" ? "" : (workingItem.total_price ?? "")
  }
  if (String(item.category || "alimentaire") !== String(workingItem.category || "alimentaire")) {
    updates.category = workingItem.category || item.category || "alimentaire"
  }
  if (String(item.item_status || item.status || "") !== String(workingItem.item_status || workingItem.status || "")) {
    updates.item_status = workingItem.item_status || workingItem.status || item.item_status || item.status || "user_validated"
  }
  if (String(item.review_status || "") !== String(workingItem.review_status || "")) {
    updates.review_status = workingItem.review_status || item.review_status || "trusted"
  }
  if (Boolean(item.needs_review) !== Boolean(workingItem.needs_review)) {
    updates.needs_review = Boolean(workingItem.needs_review)
  }

  return updates
}
