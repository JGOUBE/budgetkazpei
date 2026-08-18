import { learnManualMarketAliasFromReceiptItem } from "../../../services/scan/marketManualAliasService"
import { classifyReceipt } from "../../../services/scan/receiptClassifier"
import { supabase } from "../../../services/supabase"
import { createCompatibleReceiptImageUrl } from "./receiptImageAvailability"

export const RECEIPT_BUCKET = "receipt-images"

export function getReceiptStoragePaths(receipt = {}) {
  if (typeof receipt === "string") return receipt.trim() ? [receipt.trim()] : []

  return [...new Set([
    ...(Array.isArray(receipt?.image_paths) ? receipt.image_paths : []),
    receipt?.image_path,
    receipt?.storage_path,
  ].map(value => String(value || "").trim()).filter(Boolean))]
}

function getReceiptId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function normalizeProductLabel(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b\d+[,.]?\d*\s*(kg|g|gr|l|cl|ml)\b/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function isValidDateParts(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false
  if (month < 1 || month > 12) return false
  if (day < 1 || day > 31) return false

  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
}

function normalizeReceiptDateForDb(value = "") {
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

function resolveReceiptDateForDb(value = "") {
  const normalized = normalizeReceiptDateForDb(value)
  const fallback = new Date().toISOString().slice(0, 10)
  const fallbackUsed = !normalized
  if (fallbackUsed && value) {
    console.warn("[scanner] invalid_ocr_date", value)
  }
  console.info("[scanner] receipt_date_guard", {
    raw_date_detected: value || null,
    normalized_date: normalized || fallback,
    date_status: fallbackUsed ? "estimated" : "detected",
    date_fallback_used: fallbackUsed,
    fallback_scan_date: fallbackUsed ? fallback : null,
  })
  return {
    purchaseDate: normalized || fallback,
    dateStatus: fallbackUsed ? "estimated" : "detected",
    fallbackUsed,
  }
}

function shouldLearnManualAlias(item = {}, previousItem = null) {
  const corrected = normalizeProductLabel(item.corrected_name || item.name || "")
  const raw = normalizeProductLabel(item.ocr_name || previousItem?.ocr_name || previousItem?.raw_name || "")
  const previousCorrected = normalizeProductLabel(previousItem?.corrected_name || previousItem?.name || "")
  const status = String(item.item_status || previousItem?.item_status || item.review_status || previousItem?.review_status || "")
  if (!corrected || !raw) return false
  if (corrected === raw) return false
  if (previousCorrected && previousCorrected === corrected) return false
  return status === "user_validated" || status === "trusted"
}

export function buildManualAliasLearningCandidate({ itemId, previousItem = null, item = null }) {
  const previousCorrectedName = String(
    previousItem?.corrected_name
    || previousItem?.ocr_name
    || previousItem?.raw_name
    || previousItem?.name
    || "",
  ).trim()
  const nextCorrectedName = String(item?.corrected_name || item?.name || "").trim()
  const rawName = String(
    previousItem?.raw_name
    || previousItem?.ocr_name
    || item?.raw_name
    || item?.ocr_name
    || previousItem?.name
    || "",
  ).trim()
  const status = String(
    item?.item_status
    || previousItem?.item_status
    || item?.review_status
    || previousItem?.review_status
    || "",
  ).trim()

  const normalizedPrevious = normalizeProductLabel(previousCorrectedName)
  const normalizedNext = normalizeProductLabel(nextCorrectedName)
  const normalizedRaw = normalizeProductLabel(rawName)

  let skipReason = ""
  if (!String(itemId || "").trim()) skipReason = "missing_item_id"
  else if (!normalizedRaw) skipReason = "missing_raw_name"
  else if (!normalizedNext) skipReason = "missing_next_corrected_name"
  else if (normalizedNext === normalizedRaw) skipReason = "corrected_matches_raw"
  else if (normalizedPrevious && normalizedPrevious === normalizedNext) skipReason = "no_change"
  else if (!(status === "user_validated" || status === "trusted")) skipReason = "status_not_validated"

  return {
    itemId: String(itemId || "").trim(),
    rawName,
    previousCorrectedName,
    nextCorrectedName,
    status,
    shouldAttempt: !skipReason,
    skipReason,
  }
}

async function attemptManualAliasLearning({
  itemId,
  userId,
  item,
  previousItem = null,
  candidate = null,
  dependencies = {},
}) {
  const learnAliasRpcImpl = dependencies.learnAliasRpcImpl || learnManualMarketAliasFromReceiptItem
  const refreshReceiptItemImpl = dependencies.refreshReceiptItemImpl || refreshReceiptItem
  const resolvedCandidate = candidate || buildManualAliasLearningCandidate({
    itemId,
    previousItem,
    item,
  })

  console.info("[scanner] alias_learning_candidate", {
    receipt_item_id: resolvedCandidate.itemId,
    raw_name: resolvedCandidate.rawName || null,
    previous_corrected_name: resolvedCandidate.previousCorrectedName || null,
    next_corrected_name: resolvedCandidate.nextCorrectedName || null,
    status: resolvedCandidate.status || null,
    should_attempt: resolvedCandidate.shouldAttempt,
    skip_reason: resolvedCandidate.skipReason || "",
  })

  if (!resolvedCandidate.shouldAttempt) {
    console.info("[scanner] alias_learning_skipped", {
      receipt_item_id: resolvedCandidate.itemId,
      reason: resolvedCandidate.skipReason || "unknown",
      raw_name: resolvedCandidate.rawName || null,
      previous_corrected_name: resolvedCandidate.previousCorrectedName || null,
      next_corrected_name: resolvedCandidate.nextCorrectedName || null,
      status: resolvedCandidate.status || null,
    })
    return {
      item,
      attempted: false,
      skipped: true,
      skipReason: resolvedCandidate.skipReason || "unknown",
      candidate: resolvedCandidate,
    }
  }

  console.info("[scanner] alias_learning_rpc_started", {
    receipt_item_id: resolvedCandidate.itemId,
  })

  try {
    const learning = await learnAliasRpcImpl(resolvedCandidate.itemId)
    console.info("[scanner] alias_learning_rpc_succeeded", {
      receipt_item_id: resolvedCandidate.itemId,
      learned: learning?.learned === true,
      reason: learning?.reason || "",
      alias_id: learning?.alias_id || null,
      validation_count: learning?.validation_count ?? null,
      scope: learning?.scope || null,
    })
    if (learning?.learned === true) {
      return {
        item: await refreshReceiptItemImpl({ itemId: resolvedCandidate.itemId, userId }),
        attempted: true,
        skipped: false,
        learning,
        candidate: resolvedCandidate,
      }
    }

    return {
      item,
      attempted: true,
      skipped: false,
      learning,
      candidate: resolvedCandidate,
    }
  } catch (learningError) {
    console.warn("[scanner] alias_learning_rpc_failed", {
      receipt_item_id: resolvedCandidate.itemId,
      code: learningError?.code || null,
      message: learningError?.message || "",
      details: learningError?.details || "",
      hint: learningError?.hint || "",
    })
    return {
      item,
      attempted: true,
      skipped: false,
      failed: true,
      error: learningError,
      candidate: resolvedCandidate,
    }
  }
}

async function refreshReceiptItem({ itemId, userId }) {
  const { data, error } = await supabase
    .from("receipt_items")
    .select("*")
    .eq("id", itemId)
    .eq("user_id", userId)
    .single()

  if (error) throw error
  return data
}

export async function uploadReceiptImage({ userId, file }) {
  const receiptId = getReceiptId()
  const imagePath = `${userId}/${receiptId}.jpg`

  const { error } = await supabase.storage
    .from(RECEIPT_BUCKET)
    .upload(imagePath, file, {
      cacheControl: "3600",
      contentType: "image/jpeg",
      upsert: false,
    })

  if (error) throw error

  return { receiptId, imagePath }
}

export async function getReceiptImageUrl(receipt) {
  const [imagePath] = getReceiptStoragePaths(receipt)
  if (!receipt?.id || !imagePath || receipt?.image_deleted_at) return ""

  return createCompatibleReceiptImageUrl({
    receiptId: receipt.id,
    imagePath,
    fetchRetentionWindow: receiptId => supabase.rpc(
      "receipt_image_remaining_seconds",
      { p_receipt_id: receiptId },
    ),
    createSignedUrl: (path, expiresIn) => supabase.storage
      .from(RECEIPT_BUCKET)
      .createSignedUrl(path, expiresIn),
    onLegacyFallback: ({ receiptId }) => {
      console.info("[scanner] Retention images non deployee, URL signee legacy utilisee", {
        receipt_id: receiptId,
      })
    },
  })
}

export async function createReceipt({ userId, draft, imagePath }) {
  const dateGuard = resolveReceiptDateForDb(draft.purchase_date)
  const inferredClassification = classifyReceipt({
    ...draft,
    items: Array.isArray(draft?.items) ? draft.items : [],
  })
  const draftTicketType = String(draft?.ticket_type || "").trim()
  const draftBudgetCategory = String(draft?.budget_category || "").trim()
  const persistedTicketType = draftTicketType && draftTicketType !== "other"
    ? draftTicketType
    : inferredClassification.ticket_type
  const persistedBudgetCategory = draftBudgetCategory && draftBudgetCategory !== "divers"
    ? draftBudgetCategory
    : inferredClassification.budget_category
  const persistedIsFoodTicket = draft?.is_food_ticket === true || inferredClassification.is_food_ticket === true
  console.info("[scanner] Creation receipt: START", {
    store: draft.store_name,
    date: dateGuard.purchaseDate,
    total: draft.total_amount,
  })
  const payload = {
    user_id: userId,
    store_name: draft.store_name || "Enseigne non reconnue",
    merchant_name: draft.merchant_name || draft.store_name || "Enseigne non reconnue",
    merchant_confidence: Number(draft.merchant_confidence || (draft.store_name ? 90 : 0)),
    purchase_date: dateGuard.purchaseDate,
    date_status: draft.date_status === "detected" && !dateGuard.fallbackUsed ? "detected" : dateGuard.dateStatus,
    total_amount: Number(draft.total_amount || 0),
    currency: "EUR",
    image_path: imagePath || null,
    image_paths: imagePath ? [imagePath] : [],
    ocr_text: draft.ocr_text || "",
    ocr_status: draft.ocr_status || "manual",
    ai_used: Boolean(draft.ai_used),
    validation_status: "draft",
    ticket_type: persistedTicketType,
    budget_category: persistedBudgetCategory,
    normalized_store_name: draft.normalized_store_name || draft.merchant_normalized_name || null,
    store_location: draft.store_location || draft.location || null,
    is_food_ticket: persistedIsFoodTicket,
    scan_level_used: Number(draft.scan_level_used || 1),
    scan_duration_ms: Number(draft.scan_duration_ms || 0),
    confidence_score: Number(draft.confidence_score || 0),
    escalation_reason: draft.escalation_reason || null,
    duplicate_confirmed: Boolean(draft.duplicate_confirmed),
    duplicate_of_receipt_id: draft.duplicate_of_receipt_id || null,
  }

  let { data, error } = await supabase
    .from("receipts")
    .insert(payload)
    .select()
    .single()

  if (error && isMissingColumnError(error)) {
    const {
      merchant_name,
      merchant_confidence,
      date_status,
      ticket_type,
      budget_category,
      normalized_store_name,
      store_location,
      is_food_ticket,
      scan_level_used,
      scan_duration_ms,
      confidence_score,
      escalation_reason,
      scan_status,
      duplicate_confirmed,
      duplicate_of_receipt_id,
      image_paths,
      ...legacyPayload
    } = payload
    void image_paths

    const retry = await supabase
      .from("receipts")
      .insert(legacyPayload)
      .select()
      .single()

    data = retry.data
    error = retry.error
  }

  if (error) {
    console.error("[scanner] Creation receipt: ERREUR", error)
    throw error
  }
  console.info("[scanner] Creation receipt: OK", data)
  return data
}

export async function saveReceiptItems({ receiptId, userId, items }) {
  console.info("[scanner] Creation receipt_items: START", { receiptId, count: (items || []).length })
  await supabase
    .from("receipt_items")
    .delete()
    .eq("receipt_id", receiptId)
    .eq("user_id", userId)

  const cleanItems = (items || [])
    .filter(item => String(item.name || "").trim())
    .map(item => ({
      receipt_id: receiptId,
      user_id: userId,
      name: String(item.name || "").trim(),
      ocr_name: String(item.ocr_name || item.name || "").trim(),
      corrected_name: String(item.corrected_name || item.name || "").trim(),
      normalized_name: normalizeProductLabel(item.normalized_name || item.corrected_name || item.name),
      brand: item.brand || null,
      quantity: Number(item.quantity || 1),
      unit: item.unit || null,
      unit_price: item.unit_price === "" || item.unit_price == null ? null : Number(item.unit_price),
      total_price: item.total_price === "" || item.total_price == null ? item.price == null ? null : Number(item.price) : Number(item.total_price),
      category: item.category || "alimentaire",
      subcategory: item.subcategory || null,
      department: item.department || null,
      ticket_section: item.ticket_section || null,
      promotion: Boolean(item.promotion),
      item_status: item.item_status || item.status || (normalizeProductLabel(item.name).includes("produit verifier") ? "a_verifier" : "detected"),
      line_type: item.line_type || "product",
      confidence_score: item.confidence_score == null ? null : Number(item.confidence_score),
      market_product_id: item.market_product_id || null,
      market_matched: item.market_matched === true,
      market_match_type: item.market_match_type || null,
      market_match_confidence: item.market_match_confidence == null ? null : Number(item.market_match_confidence),
      market_canonical_name: item.market_canonical_name || null,
      market_brand: item.market_brand || null,
      market_category: item.market_category || null,
      market_subcategory: item.market_subcategory || null,
      market_package_format: item.market_package_format || null,
    }))

  if (cleanItems.length === 0) {
    console.warn("[scanner] Creation receipt_items: ERREUR", "no clean items")
    return []
  }

  let { data, error } = await supabase
    .from("receipt_items")
    .insert(cleanItems)
    .select()

  if (error && isMissingColumnError(error)) {
    const legacyItems = cleanItems.map(item => ({
      receipt_id: item.receipt_id,
      user_id: item.user_id,
      name: item.name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total_price: item.total_price,
      category: item.category,
      confidence_score: item.confidence_score,
    }))

    const retry = await supabase
      .from("receipt_items")
      .insert(legacyItems)
      .select()

    data = retry.data
    error = retry.error
  }

  if (error) {
    console.error("[scanner] Creation receipt_items: ERREUR", error)
    throw error
  }
  console.info("[scanner] Creation receipt_items: OK", { count: data?.length || 0 })
  return data || []
}

function isMissingColumnError(error) {
  const message = String(error?.message || error?.details || "")
  return error?.code === "PGRST204" || message.includes("Could not find") || message.includes("column")
}

const RECEIPT_UPDATE_COLUMNS = new Set([
  "store_name",
  "purchase_date",
  "total_amount",
  "currency",
  "image_path",
  "image_paths",
  "image_expires_at",
  "ocr_text",
  "ocr_status",
  "ai_used",
  "validation_status",
  "transaction_id",
  "updated_at",
  "merchant_name",
  "merchant_confidence",
  "date_status",
  "ticket_type",
  "budget_category",
  "normalized_store_name",
  "store_location",
  "is_food_ticket",
  "scan_level_used",
  "scan_duration_ms",
  "confidence_score",
  "escalation_reason",
  "scan_status",
  "duplicate_confirmed",
  "duplicate_of_receipt_id",
  "hidden_at",
  "image_deleted_at",
  "removed_from_history_at",
  "removal_type",
  "image_deleted_reason",
  "image_url",
  "storage_path",
])

const RECEIPT_ITEM_UPDATE_COLUMNS = new Set([
  "name",
  "corrected_name",
  "normalized_name",
  "brand",
  "quantity",
  "unit",
  "unit_price",
  "total_price",
  "category",
  "subcategory",
  "department",
  "ticket_section",
  "promotion",
  "confidence_score",
  "item_status",
  "line_type",
  "item_source",
  "market_product_id",
  "market_matched",
  "market_match_type",
  "market_match_confidence",
  "market_canonical_name",
  "market_brand",
  "market_category",
  "market_subcategory",
  "market_package_format",
])

function sanitizeReceiptHeaderUpdates(updates = {}) {
  const cleanUpdates = {}

  for (const [key, value] of Object.entries(updates || {})) {
    if (!RECEIPT_UPDATE_COLUMNS.has(key) || value === undefined) continue
    cleanUpdates[key] = value
  }

  if ("purchase_date" in cleanUpdates) {
    const normalizedDate = normalizeReceiptDateForDb(cleanUpdates.purchase_date)
    cleanUpdates.purchase_date = normalizedDate || cleanUpdates.purchase_date || null
  }

  if ("total_amount" in cleanUpdates) {
    cleanUpdates.total_amount = cleanUpdates.total_amount === "" || cleanUpdates.total_amount == null
      ? null
      : Number(cleanUpdates.total_amount)
  }

  if ("merchant_confidence" in cleanUpdates) {
    cleanUpdates.merchant_confidence = cleanUpdates.merchant_confidence === "" || cleanUpdates.merchant_confidence == null
      ? null
      : Number(cleanUpdates.merchant_confidence)
  }

  if ("scan_level_used" in cleanUpdates) {
    cleanUpdates.scan_level_used = cleanUpdates.scan_level_used === "" || cleanUpdates.scan_level_used == null
      ? null
      : Number(cleanUpdates.scan_level_used)
  }

  if ("scan_duration_ms" in cleanUpdates) {
    cleanUpdates.scan_duration_ms = cleanUpdates.scan_duration_ms === "" || cleanUpdates.scan_duration_ms == null
      ? null
      : Number(cleanUpdates.scan_duration_ms)
  }

  if ("confidence_score" in cleanUpdates) {
    cleanUpdates.confidence_score = cleanUpdates.confidence_score === "" || cleanUpdates.confidence_score == null
      ? null
      : Number(cleanUpdates.confidence_score)
  }

  return cleanUpdates
}

function sanitizeReceiptItemUpdates(updates = {}) {
  const cleanUpdates = {}

  for (const [key, value] of Object.entries(updates || {})) {
    if (!RECEIPT_ITEM_UPDATE_COLUMNS.has(key) || value === undefined) continue
    cleanUpdates[key] = value
  }

  for (const key of [
    "name",
    "corrected_name",
    "normalized_name",
    "brand",
    "unit",
    "category",
    "subcategory",
    "department",
    "ticket_section",
    "item_status",
    "line_type",
    "item_source",
    "market_match_type",
    "market_canonical_name",
    "market_brand",
    "market_category",
    "market_subcategory",
    "market_package_format",
  ]) {
    if (key in cleanUpdates) {
      cleanUpdates[key] = cleanUpdates[key] == null ? null : String(cleanUpdates[key] || "").trim()
      if (cleanUpdates[key] === "") cleanUpdates[key] = null
    }
  }

  for (const key of ["quantity", "unit_price", "total_price", "confidence_score", "market_match_confidence"]) {
    if (key in cleanUpdates) {
      cleanUpdates[key] = cleanUpdates[key] === "" || cleanUpdates[key] == null
        ? null
        : Number(cleanUpdates[key])
    }
  }

  if ("promotion" in cleanUpdates) cleanUpdates.promotion = Boolean(cleanUpdates.promotion)
  if ("market_matched" in cleanUpdates) cleanUpdates.market_matched = Boolean(cleanUpdates.market_matched)

  return cleanUpdates
}

function buildReceiptItemDbUpdates(safeUpdates = {}, previousItem = null) {
  const draftUpdates = {}
  const previousItemStatus = previousItem?.item_status || previousItem?.status || "user_validated"
  const previousReviewStatus = previousItem?.review_status || "trusted"

  if ("name" in safeUpdates) {
    draftUpdates.name = String(safeUpdates.name || "").trim()
  }

  if ("corrected_name" in safeUpdates || "name" in safeUpdates) {
    const cleanCorrectedName = "corrected_name" in safeUpdates
      ? String(safeUpdates.corrected_name || "").trim()
      : String(draftUpdates.name || "").trim()
    draftUpdates.corrected_name = cleanCorrectedName
    draftUpdates.normalized_name = normalizeProductLabel(
      safeUpdates.normalized_name || cleanCorrectedName || draftUpdates.name || previousItem?.corrected_name || previousItem?.name,
    )
  } else if ("normalized_name" in safeUpdates) {
    draftUpdates.normalized_name = normalizeProductLabel(
      safeUpdates.normalized_name || previousItem?.corrected_name || previousItem?.name,
    )
  }

  if ("total_price" in safeUpdates) {
    draftUpdates.total_price = safeUpdates.total_price === "" || safeUpdates.total_price == null
      ? null
      : Number(safeUpdates.total_price)
  }
  if ("category" in safeUpdates) draftUpdates.category = safeUpdates.category || previousItem?.category || "alimentaire"
  if ("item_status" in safeUpdates) {
    draftUpdates.item_status = safeUpdates.item_status || previousItemStatus
  } else if ("review_status" in safeUpdates) {
    draftUpdates.item_status = safeUpdates.review_status === "needs_review" ? "a_verifier" : previousItemStatus
  }
  if ("quantity" in safeUpdates) draftUpdates.quantity = Number(safeUpdates.quantity || 1)
  if ("unit_price" in safeUpdates) draftUpdates.unit_price = safeUpdates.unit_price === "" || safeUpdates.unit_price == null ? null : Number(safeUpdates.unit_price)
  if ("unit" in safeUpdates) draftUpdates.unit = safeUpdates.unit || null
  if ("brand" in safeUpdates) draftUpdates.brand = safeUpdates.brand || null
  if ("subcategory" in safeUpdates) draftUpdates.subcategory = safeUpdates.subcategory || null
  if ("department" in safeUpdates) draftUpdates.department = safeUpdates.department || null
  if ("ticket_section" in safeUpdates) draftUpdates.ticket_section = safeUpdates.ticket_section || null
  if ("promotion" in safeUpdates) draftUpdates.promotion = Boolean(safeUpdates.promotion)
  if ("confidence_score" in safeUpdates) draftUpdates.confidence_score = safeUpdates.confidence_score

  if ("needs_review" in safeUpdates && !("item_status" in draftUpdates)) {
    const nextNeedsReview = Boolean(safeUpdates.needs_review)
    draftUpdates.item_status = nextNeedsReview
      ? "a_verifier"
      : previousReviewStatus === "needs_review"
        ? previousItemStatus
        : previousItemStatus
  }

  return sanitizeReceiptItemUpdates(draftUpdates)
}

async function persistReceiptItemUpdate({
  itemId,
  userId,
  updates,
  previousItem = null,
  learnAlias = true,
  dependencies = {},
}) {
  const supabaseClient = dependencies.supabaseClient || supabase
  const learnAliasImpl = dependencies.learnAliasImpl || maybeLearnManualAliasForReceiptItem
  const missingColumnErrorImpl = dependencies.isMissingColumnErrorImpl || isMissingColumnError

  let { data, error } = await supabaseClient
    .from("receipt_items")
    .update(updates)
    .eq("id", itemId)
    .eq("user_id", userId)
    .select()
    .single()

  if (error && missingColumnErrorImpl(error)) {
    const legacyUpdates = sanitizeReceiptItemUpdates({
      name: updates.name,
      corrected_name: updates.corrected_name,
      normalized_name: updates.normalized_name,
      total_price: updates.total_price,
      category: updates.category,
    })

    const retry = await supabaseClient
      .from("receipt_items")
      .update(legacyUpdates)
      .eq("id", itemId)
      .eq("user_id", userId)
      .select()
      .single()

    data = retry.data
    error = retry.error
  }

  if (error) {
    console.error("[scanner] Update receipt_item: ERREUR", {
      item_id: itemId,
      payload: updates,
      error: {
        code: error?.code || null,
        message: error?.message || "",
        details: error?.details || "",
        hint: error?.hint || "",
      },
    })
    throw error
  }

  console.info("[scanner] receipt_item_update_succeeded", {
    receipt_item_id: itemId,
    payload: updates,
    persisted_corrected_name: data?.corrected_name ?? null,
    persisted_raw_name: data?.ocr_name || data?.name || null,
    item_status: data?.item_status || data?.review_status || null,
  })

  const nextItem = { ...(previousItem || {}), ...(data || {}), ...updates }

  if (!learnAlias) {
    return data
  }

  return await learnAliasImpl({
    itemId,
    userId,
    item: nextItem,
    previousItem,
  })
}

function normalizeComparableText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function receiptTransactionStoreKey(value = "") {
  return normalizeComparableText(value)
    .replace(/^courses?\s+/i, "")
    .replace(/^(ticket|scan)\s+/i, "")
    .replace(/\b(saint leu|saint denis|saint pierre|le portail|reunion|la reunion)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function receiptTransactionLabelsMatch(a = "", b = "") {
  const left = receiptTransactionStoreKey(a)
  const right = receiptTransactionStoreKey(b)
  if (!left || !right) return false
  return left === right || left.includes(right) || right.includes(left)
}

function buildReceiptTransactionPayload({ receiptId, receipt, draft, amount }) {
  const storeName = draft?.store_name || receipt?.store_name || "Enseigne non reconnue"
  return {
    label: `Courses - ${storeName}`,
    category: "alimentaire",
    amount: -Math.abs(Number(amount || 0)),
    date: draft?.purchase_date || receipt?.purchase_date || new Date().toISOString().split("T")[0],
    icon: "ticket",
    source: "receipt_scan",
    receipt_id: receiptId,
  }
}

async function findTransactionById({ userId, transactionId }) {
  if (!userId || !transactionId) return null

  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", transactionId)
    .eq("user_id", userId)
    .maybeSingle()

  if (error && !isMissingColumnError(error)) throw error
  return data || null
}

async function findTransactionByReceiptId({ userId, receiptId }) {
  if (!userId || !receiptId) return null

  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .eq("receipt_id", receiptId)
    .maybeSingle()

  if (error && !isMissingColumnError(error)) throw error
  return data || null
}

async function findExistingReceiptScanTransaction({ userId, receiptId, payload, duplicateConfirmed = false }) {
  if (!userId || duplicateConfirmed) return null

  const amount = Number(payload.amount || 0)
  const lowerAmount = Number((amount - 0.01).toFixed(2))
  const upperAmount = Number((amount + 0.01).toFixed(2))

  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .eq("date", payload.date)
    .gte("amount", lowerAmount)
    .lte("amount", upperAmount)
    .order("created_at", { ascending: false })
    .limit(20)

  if (error && !isMissingColumnError(error)) throw error
  const rows = Array.isArray(data) ? data : []

  return rows.find(row => {
    if (String(row.receipt_id || "") === String(receiptId || "")) return true
    if (String(row.source || "") === "receipt_scan") return true
    return receiptTransactionLabelsMatch(row.label, payload.label)
  }) || null
}

async function saveReceiptTransactionPayload({ userId, transactionId, payload }) {
  let { data, error } = await supabase
    .from("transactions")
    .update(payload)
    .eq("id", transactionId)
    .eq("user_id", userId)
    .select()
    .single()

  if (error && isMissingColumnError(error)) {
    const { source, receipt_id, ...legacyPayload } = payload
    const retry = await supabase
      .from("transactions")
      .update(legacyPayload)
      .eq("id", transactionId)
      .eq("user_id", userId)
      .select()
      .single()
    data = retry.data
    error = retry.error
  }

  if (error) throw error
  return data
}

async function insertReceiptTransactionPayload({ userId, payload }) {
  const insertPayload = { ...payload, user_id: userId }
  let { data, error } = await supabase
    .from("transactions")
    .insert(insertPayload)
    .select()
    .single()

  if (error && isMissingColumnError(error)) {
    const { source, receipt_id, ...legacyPayload } = insertPayload
    const retry = await supabase
      .from("transactions")
      .insert(legacyPayload)
      .select()
      .single()
    data = retry.data
    error = retry.error
  }

  if (error) throw error
  return data
}

async function linkReceiptToTransaction({ userId, receiptId, transactionId }) {
  if (!userId || !receiptId || !transactionId) return

  const payload = {
    transaction_id: transactionId,
    updated_at: new Date().toISOString(),
  }

  let { error } = await supabase
    .from("receipts")
    .update(payload)
    .eq("id", receiptId)
    .eq("user_id", userId)

  if (error && isMissingColumnError(error)) {
    const retry = await supabase
      .from("receipts")
      .update({ transaction_id: transactionId })
      .eq("id", receiptId)
      .eq("user_id", userId)
    error = retry.error
  }

  if (error && !isMissingColumnError(error)) throw error
}

export async function upsertReceiptTransaction({ userId, receipt, draft, transactionId }) {
  const receiptId = receipt?.id
  const amount = Math.abs(Number(draft?.total_amount || receipt?.total_amount || 0))

  if (!userId || !receiptId) {
    return { transaction: null, created: false, updated: false, skipReason: "missing_user_or_receipt" }
  }

  if (amount <= 0 || draft?.total_needs_review) {
    return { transaction: null, created: false, updated: false, skipReason: "total_missing_or_needs_review" }
  }

  const payload = buildReceiptTransactionPayload({ receiptId, receipt, draft, amount })
  const duplicateConfirmed = Boolean(draft?.duplicate_confirmed)
  const existingTransaction = await findTransactionById({
    userId,
    transactionId: transactionId || receipt?.transaction_id,
  }) || await findTransactionByReceiptId({
    userId,
    receiptId,
  }) || await findExistingReceiptScanTransaction({
    userId,
    receiptId,
    payload,
    duplicateConfirmed,
  })

  if (existingTransaction?.id) {
    const updated = await saveReceiptTransactionPayload({
      userId,
      transactionId: existingTransaction.id,
      payload,
    })

    const duplicatePrevented = !transactionId
      && String(existingTransaction.receipt_id || "") !== String(receiptId || "")

    await linkReceiptToTransaction({
      userId,
      receiptId,
      transactionId: updated.id,
    })

    return {
      transaction: updated,
      created: false,
      updated: true,
      skipReason: duplicatePrevented ? "existing_receipt_transaction_reused" : "",
      duplicatePrevented,
    }
  }

  const inserted = await insertReceiptTransactionPayload({ userId, payload })
  await linkReceiptToTransaction({
    userId,
    receiptId,
    transactionId: inserted.id,
  })
  return { transaction: inserted, created: true, updated: false, skipReason: "" }
}

export async function validateReceipt({ receiptId, userId, draft, items, transactionId }) {
  console.info("[scanner] Validation receipt: START", { receiptId, transactionId })
  const dateGuard = resolveReceiptDateForDb(draft.purchase_date)
  const inferredClassification = classifyReceipt({
    ...draft,
    items: Array.isArray(draft?.items) && draft.items.length > 0 ? draft.items : items,
  })
  const draftTicketType = String(draft?.ticket_type || "").trim()
  const draftBudgetCategory = String(draft?.budget_category || "").trim()
  const persistedTicketType = draftTicketType && draftTicketType !== "other"
    ? draftTicketType
    : inferredClassification.ticket_type
  const persistedBudgetCategory = draftBudgetCategory && draftBudgetCategory !== "divers"
    ? draftBudgetCategory
    : inferredClassification.budget_category
  const persistedIsFoodTicket = draft?.is_food_ticket === true || inferredClassification.is_food_ticket === true
  const payload = {
    store_name: draft.store_name || "Enseigne non reconnue",
    merchant_name: draft.merchant_name || draft.store_name || "Enseigne non reconnue",
    merchant_confidence: Number(draft.merchant_confidence || (draft.store_name ? 90 : 0)),
    purchase_date: dateGuard.purchaseDate,
    date_status: draft.date_status === "detected" && !dateGuard.fallbackUsed ? "detected" : dateGuard.dateStatus,
    total_amount: Number(draft.total_amount || 0),
    validation_status: "validated",
    ocr_status: draft.ocr_status || "manual",
    ticket_type: persistedTicketType,
    budget_category: persistedBudgetCategory,
    normalized_store_name: draft.normalized_store_name || draft.merchant_normalized_name || null,
    store_location: draft.store_location || draft.location || null,
    is_food_ticket: persistedIsFoodTicket,
    scan_level_used: Number(draft.scan_level_used || 1),
    scan_duration_ms: Number(draft.scan_duration_ms || 0),
    confidence_score: Number(draft.confidence_score || 0),
    escalation_reason: draft.escalation_reason || null,
    duplicate_confirmed: Boolean(draft.duplicate_confirmed),
    duplicate_of_receipt_id: draft.duplicate_of_receipt_id || null,
    transaction_id: transactionId || null,
    updated_at: new Date().toISOString(),
  }

  let { data, error } = await supabase
    .from("receipts")
    .update(payload)
    .eq("id", receiptId)
    .eq("user_id", userId)
    .select()
    .single()

  if (error && isMissingColumnError(error)) {
    const {
      merchant_name,
      merchant_confidence,
      date_status,
      ticket_type,
      budget_category,
      normalized_store_name,
      store_location,
      is_food_ticket,
      scan_level_used,
      scan_duration_ms,
      confidence_score,
      escalation_reason,
      scan_status,
      duplicate_confirmed,
      duplicate_of_receipt_id,
      ...legacyPayload
    } = payload

    const retry = await supabase
      .from("receipts")
      .update(legacyPayload)
      .eq("id", receiptId)
      .eq("user_id", userId)
      .select()
      .single()

    data = retry.data
    error = retry.error
  }

  if (error) {
    console.error("[scanner] Validation receipt: ERREUR", error)
    throw error
  }
  const savedReceiptItems = await saveReceiptItems({ receiptId, userId, items })
  console.info("[scanner] Validation receipt: OK", data)
  return {
    ...(data || {}),
    receipt_items: savedReceiptItems,
  }
}

export async function updateReceipt({ receiptId, userId, updates }) {
  const cleanUpdates = sanitizeReceiptHeaderUpdates({
    ...(updates && typeof updates === "object" ? updates : {}),
    updated_at: new Date().toISOString(),
  })

  if (!Object.keys(cleanUpdates).length) {
    return null
  }

  let { data, error } = await supabase
    .from("receipts")
    .update(cleanUpdates)
    .eq("id", receiptId)
    .eq("user_id", userId)
    .select()
    .single()

  if (error && isMissingColumnError(error)) {
    const {
      merchant_name,
      merchant_confidence,
      date_status,
      ticket_type,
      budget_category,
      normalized_store_name,
      store_location,
      is_food_ticket,
      scan_level_used,
      scan_duration_ms,
      confidence_score,
      escalation_reason,
      scan_status,
      duplicate_confirmed,
      duplicate_of_receipt_id,
      hidden_at,
      image_deleted_at,
      removed_from_history_at,
      removal_type,
      image_deleted_reason,
      ...legacyUpdates
    } = cleanUpdates

    const retry = await supabase
      .from("receipts")
      .update(legacyUpdates)
      .eq("id", receiptId)
      .eq("user_id", userId)
      .select()
      .single()

    data = retry.data
    error = retry.error
  }

  if (error) throw error
  return data
}

export async function maybeLearnManualAliasForReceiptItem({
  itemId,
  userId,
  item,
  previousItem = null,
  candidate = null,
  dependencies = {},
}) {
  const result = await attemptManualAliasLearning({
    itemId,
    userId,
    item,
    previousItem,
    candidate,
    dependencies,
  })
  return result.item
}

export async function updateReceiptItem({ itemId, userId, updates, previousItem = null, learnAlias = true }) {
  const safeUpdates = updates && typeof updates === "object" ? updates : {}
  const cleanUpdates = buildReceiptItemDbUpdates(safeUpdates, previousItem)

  if (!Object.keys(cleanUpdates).length) {
    return previousItem
  }
  return await persistReceiptItemUpdate({
    itemId,
    userId,
    updates: cleanUpdates,
    previousItem,
    learnAlias,
  })
}

export const __receiptServiceTestUtils = {
  normalizeProductLabel,
  sanitizeReceiptHeaderUpdates,
  sanitizeReceiptItemUpdates,
  buildReceiptItemDbUpdates,
  buildManualAliasLearningCandidate,
  attemptManualAliasLearning,
  persistReceiptItemUpdate,
  shouldLearnManualAlias,
}

export async function deleteReceiptItem({ itemId, userId }) {
  const { error } = await supabase
    .from("receipt_items")
    .delete()
    .eq("id", itemId)
    .eq("user_id", userId)

  if (error) throw error
}

export async function listReceipts({ userId, includeHidden = false }) {
  let query = supabase
    .from("receipts")
    .select("*, receipt_items(id)")
    .eq("user_id", userId)

  if (!includeHidden) {
    query = query.is("removed_from_history_at", null)
  }

  let { data, error } = await query
    .order("created_at", { ascending: false })

  if (error && isMissingColumnError(error) && !includeHidden) {
    const retry = await supabase
      .from("receipts")
      .select("*, receipt_items(id)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })

    data = retry.data
    error = retry.error
  }

  if (error) throw error
  return data || []
}

export async function getReceiptDetail({ receiptId, userId }) {
  const { data, error } = await supabase
    .from("receipts")
    .select("*, receipt_items(*)")
    .eq("id", receiptId)
    .eq("user_id", userId)
    .single()

  if (error) throw error
  return data
}

async function safeDeleteRows(tableName, buildQuery, context = {}) {
  try {
    const { error } = await buildQuery(supabase.from(tableName).delete())
    if (error && !isMissingColumnError(error)) {
      console.warn(`[scanner] Suppression ${tableName} indisponible`, { error, ...context })
    }
  } catch (error) {
    console.warn(`[scanner] Suppression ${tableName} indisponible`, { error, ...context })
  }
}

async function findReceiptTransactionForRemoval({ receipt, userId }) {
  const receiptId = receipt?.id
  const transactionById = await findTransactionById({ userId, transactionId: receipt?.transaction_id })
  if (transactionById?.id) return transactionById

  const transactionByReceipt = await findTransactionByReceiptId({ userId, receiptId })
  if (transactionByReceipt?.id) return transactionByReceipt

  const amount = Math.abs(Number(receipt?.total_amount || 0))
  if (amount <= 0) return null

  const payload = buildReceiptTransactionPayload({
    receiptId,
    receipt,
    draft: receipt,
    amount,
  })

  return findExistingReceiptScanTransaction({
    userId,
    receiptId,
    payload,
    duplicateConfirmed: false,
  })
}

async function removeShoppingItemsLinkedToReceipt({ receipt, userId, transaction, reason = "receipt_removed" }) {
  if (!userId || !receipt?.id) return

  if (transaction?.id) {
    await safeDeleteRows(
      "shopping_items",
      query => query.eq("user_id", userId).eq("transaction_id", transaction.id),
      { receipt_id: receipt.id, transaction_id: transaction.id, reason },
    )
  }

  await safeDeleteRows(
    "shopping_items",
    query => query.eq("user_id", userId).eq("receipt_id", receipt.id),
    { receipt_id: receipt.id, reason },
  )
}

async function removeTransactionLinkedToReceipt({ receipt, userId, removeLearning = true, reason = "receipt_removed" }) {
  const transaction = await findReceiptTransactionForRemoval({ receipt, userId })

  if (removeLearning) {
    await removeShoppingItemsLinkedToReceipt({ receipt, userId, transaction, reason })
  }

  if (!transaction?.id) {
    return { removed: false, transaction: null, reason: "no_linked_transaction_found" }
  }

  let { error } = await supabase
    .from("transactions")
    .delete()
    .eq("id", transaction.id)
    .eq("user_id", userId)

  if (error && !isMissingColumnError(error)) throw error

  return { removed: !error, transaction, reason: error ? "transaction_delete_skipped_missing_column" : "" }
}

export async function removeReceiptFromHistory({
  receipt,
  userId,
  removeBudget = false,
  removeLearning = false,
  reason = "automatic_history_expiry",
} = {}) {
  if (!receipt?.id || !userId) return

  const now = new Date().toISOString()
  const imagePaths = getReceiptStoragePaths(receipt)
  const imagePath = imagePaths[0] || null
  const linkedCleanup = removeBudget
    ? await removeTransactionLinkedToReceipt({ receipt, userId, removeLearning, reason })
    : { removed: false, transaction: null, reason: "budget_preserved" }

  if (imagePaths.length) {
    const { error: storageError } = await supabase.storage.from(RECEIPT_BUCKET).remove(imagePaths)
    if (storageError) {
      console.warn("[scanner] Suppression image ticket indisponible", storageError)
    }
  }

  const payload = {
    image_path: null,
    image_paths: [],
    image_url: null,
    storage_path: null,
    transaction_id: removeBudget ? null : receipt?.transaction_id || null,
    hidden_at: now,
    image_deleted_at: imagePath ? now : null,
    removed_from_history_at: now,
    removal_type: removeBudget ? "hidden_remove_budget" : "hidden_keep_analytics",
    image_deleted_reason: imagePath ? reason : null,
    updated_at: now,
  }

  let { error } = await supabase
    .from("receipts")
    .update(payload)
    .eq("id", receipt.id)
    .eq("user_id", userId)

  if (error && isMissingColumnError(error)) {
    const {
      image_url,
      image_paths,
      storage_path,
      transaction_id,
      hidden_at,
      image_deleted_at,
      removed_from_history_at,
      removal_type,
      image_deleted_reason,
      ...legacyPayload
    } = payload
    void image_paths

    const retry = await supabase
      .from("receipts")
      .update(legacyPayload)
      .eq("id", receipt.id)
      .eq("user_id", userId)

    error = retry.error
  }

  if (error) throw error

  console.info("[scanner] Ticket retire de l'historique", {
    receipt_id: receipt.id,
    removal_type: payload.removal_type,
    budget_preserved: !removeBudget,
    transaction_removed: Boolean(linkedCleanup.removed),
    transaction_id: linkedCleanup.transaction?.id || receipt?.transaction_id || null,
    cleanup_reason: linkedCleanup.reason || reason || "",
  })
}

export async function deleteReceipt(args) {
  return removeReceiptFromHistory(args)
}

export async function expireReceiptFromHistory({ receipt, userId } = {}) {
  if (!receipt?.id || !userId) return

  const imagePaths = getReceiptStoragePaths(receipt)
  if (imagePaths.length) {
    const { error: storageError } = await supabase.storage.from(RECEIPT_BUCKET).remove(imagePaths)
    if (storageError) throw storageError
  }

  const now = new Date().toISOString()
  const { error } = await supabase
    .from("receipts")
    .update({
      image_path: null,
      image_paths: [],
      image_url: null,
      storage_path: null,
      image_deleted_at: now,
      image_deleted_reason: "automatic_7_days_expiry",
      updated_at: now,
    })
    .eq("id", receipt.id)
    .eq("user_id", userId)

  if (error) throw error
}

export async function hardDeleteReceipt({ receipt, userId }) {
  const imagePaths = getReceiptStoragePaths(receipt)
  if (imagePaths.length) {
    await supabase.storage.from(RECEIPT_BUCKET).remove(imagePaths)
  }

  const { error } = await supabase
    .from("receipts")
    .delete()
    .eq("id", receipt.id)
    .eq("user_id", userId)

  if (error) throw error
}

export async function countMonthlyReceipts({ userId }) {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()

  const { count, error } = await supabase
    .from("receipts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", start)
    .lt("created_at", end)

  if (error) throw error
  return count || 0
}
