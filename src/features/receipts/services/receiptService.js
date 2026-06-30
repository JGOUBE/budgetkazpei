import { supabase } from "../../../services/supabase"

export const RECEIPT_BUCKET = "receipt-images"

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

export async function getReceiptImageUrl(imagePath) {
  if (!imagePath) return ""

  const { data, error } = await supabase.storage
    .from(RECEIPT_BUCKET)
    .createSignedUrl(imagePath, 60 * 10)

  if (error) return ""
  return data?.signedUrl || ""
}

export async function createReceipt({ userId, draft, imagePath }) {
  const dateGuard = resolveReceiptDateForDb(draft.purchase_date)
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
    ocr_text: draft.ocr_text || "",
    ocr_status: draft.ocr_status || "manual",
    ai_used: Boolean(draft.ai_used),
    validation_status: "draft",
    ticket_type: draft.ticket_type || "other",
    budget_category: draft.budget_category || "divers",
    is_food_ticket: Boolean(draft.is_food_ticket),
    scan_level_used: Number(draft.scan_level_used || 1),
    scan_duration_ms: Number(draft.scan_duration_ms || 0),
    confidence_score: Number(draft.confidence_score || 0),
    escalation_reason: draft.escalation_reason || null,
    scan_status: draft.scan_status || "success",
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
      is_food_ticket,
      scan_level_used,
      scan_duration_ms,
      confidence_score,
      escalation_reason,
      scan_status,
      ...legacyPayload
    } = payload

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
      item_source: item.item_source || item.source || "parser",
      confidence_score: item.confidence_score == null ? null : Number(item.confidence_score),
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

export async function validateReceipt({ receiptId, userId, draft, items, transactionId }) {
  console.info("[scanner] Validation receipt: START", { receiptId, transactionId })
  const dateGuard = resolveReceiptDateForDb(draft.purchase_date)
  const payload = {
    store_name: draft.store_name || "Enseigne non reconnue",
    merchant_name: draft.merchant_name || draft.store_name || "Enseigne non reconnue",
    merchant_confidence: Number(draft.merchant_confidence || (draft.store_name ? 90 : 0)),
    purchase_date: dateGuard.purchaseDate,
    date_status: draft.date_status === "detected" && !dateGuard.fallbackUsed ? "detected" : dateGuard.dateStatus,
    total_amount: Number(draft.total_amount || 0),
    validation_status: "validated",
    ocr_status: draft.ocr_status || "manual",
    ticket_type: draft.ticket_type || "other",
    budget_category: draft.budget_category || "divers",
    is_food_ticket: Boolean(draft.is_food_ticket),
    scan_level_used: Number(draft.scan_level_used || 1),
    scan_duration_ms: Number(draft.scan_duration_ms || 0),
    confidence_score: Number(draft.confidence_score || 0),
    escalation_reason: draft.escalation_reason || null,
    scan_status: draft.scan_status || "success",
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
      is_food_ticket,
      scan_level_used,
      scan_duration_ms,
      confidence_score,
      escalation_reason,
      scan_status,
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
  await saveReceiptItems({ receiptId, userId, items })
  console.info("[scanner] Validation receipt: OK", data)
  return data
}

export async function updateReceipt({ receiptId, userId, updates }) {
  const cleanUpdates = {
    ...updates,
    updated_at: new Date().toISOString(),
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
      is_food_ticket,
      scan_level_used,
      scan_duration_ms,
      confidence_score,
      escalation_reason,
      scan_status,
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

export async function updateReceiptItem({ itemId, userId, updates }) {
  let { data, error } = await supabase
    .from("receipt_items")
    .update(updates)
    .eq("id", itemId)
    .eq("user_id", userId)
    .select()
    .single()

  if (error && isMissingColumnError(error)) {
    const { item_status, line_type, item_source, ...legacyUpdates } = updates
    const retry = await supabase
      .from("receipt_items")
      .update(legacyUpdates)
      .eq("id", itemId)
      .eq("user_id", userId)
      .select()
      .single()

    data = retry.data
    error = retry.error
  }

  if (error) throw error
  return data
}

export async function deleteReceiptItem({ itemId, userId }) {
  const { error } = await supabase
    .from("receipt_items")
    .delete()
    .eq("id", itemId)
    .eq("user_id", userId)

  if (error) throw error
}

export async function listReceipts({ userId }) {
  const { data, error } = await supabase
    .from("receipts")
    .select("*, receipt_items(id)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })

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

export async function deleteReceipt({ receipt, userId }) {
  if (receipt?.image_path) {
    await supabase.storage.from(RECEIPT_BUCKET).remove([receipt.image_path])
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
