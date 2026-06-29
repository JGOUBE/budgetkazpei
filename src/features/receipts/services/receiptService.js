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
  console.info("[scanner] Creation receipt: START", {
    store: draft.store_name,
    date: draft.purchase_date,
    total: draft.total_amount,
  })
  const { data, error } = await supabase
    .from("receipts")
    .insert({
      user_id: userId,
      store_name: draft.store_name || null,
      purchase_date: draft.purchase_date || new Date().toISOString().split("T")[0],
      total_amount: Number(draft.total_amount || 0),
      currency: "EUR",
      image_path: imagePath || null,
      ocr_text: draft.ocr_text || "",
      ocr_status: draft.ocr_status || "manual",
      ai_used: Boolean(draft.ai_used),
      validation_status: "draft",
    })
    .select()
    .single()

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
      total_price: item.total_price === "" || item.total_price == null ? null : Number(item.total_price),
      category: item.category || "alimentaire",
      subcategory: item.subcategory || null,
      department: item.department || null,
      ticket_section: item.ticket_section || null,
      promotion: Boolean(item.promotion),
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
  const { data, error } = await supabase
    .from("receipts")
    .update({
      store_name: draft.store_name || null,
      purchase_date: draft.purchase_date || new Date().toISOString().split("T")[0],
      total_amount: Number(draft.total_amount || 0),
      validation_status: "validated",
      ocr_status: draft.ocr_status || "manual",
      transaction_id: transactionId || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", receiptId)
    .eq("user_id", userId)
    .select()
    .single()

  if (error) {
    console.error("[scanner] Validation receipt: ERREUR", error)
    throw error
  }
  await saveReceiptItems({ receiptId, userId, items })
  console.info("[scanner] Validation receipt: OK", data)
  return data
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
