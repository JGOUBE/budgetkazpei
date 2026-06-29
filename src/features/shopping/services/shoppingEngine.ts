import { supabase } from "../../../services/supabase"
import { guessBrand, normalizeProductName } from "./normalizer"
import { computeUnitPrice, inferUnitFromName } from "./unitPrice"

type Receipt = {
  id?: string
  store_name?: string
  purchase_date?: string
}

type ReceiptItem = {
  name?: string
  ocr_name?: string
  corrected_name?: string
  normalized_name?: string
  brand?: string | null
  quantity?: number | string | null
  unit?: string | null
  unit_price?: number | string | null
  total_price?: number | string | null
  category?: string
  subcategory?: string | null
  department?: string | null
  ticket_section?: string | null
  promotion?: boolean
  confidence_score?: number | string | null
  barcode?: string | null
}

function money(value: number | string | null | undefined) {
  return Number(String(value ?? 0).replace(",", ".")) || 0
}

export async function listShoppingItems({ userId }: { userId?: string }) {
  if (!userId) return []

  const { data, error } = await supabase
    .from("shopping_items")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })

  if (error) throw error
  return data || []
}

export async function syncShoppingItemsFromReceipt({
  userId,
  transactionId,
  receipt,
  items,
}: {
  userId?: string
  transactionId?: string
  receipt?: Receipt
  items?: ReceiptItem[]
}) {
  if (!userId || !transactionId || !receipt?.id) return []

  const rows = (items || [])
    .filter(item => String(item.name || "").trim())
    .map(item => {
      const originalName = String(item.ocr_name || item.name || "").trim()
      const correctedName = String(item.corrected_name || item.name || originalName).trim()
      const productName = correctedName || originalName
      const normalizedName = item.normalized_name || normalizeProductName(productName)
      const inferred = inferUnitFromName(productName)
      const quantity = money(item.quantity) || inferred.quantity || 1
      const unit = item.unit || inferred.unit || "piece"
      const price = money(item.total_price) || money(item.unit_price)
      const unitPrice = computeUnitPrice({ price, quantity: inferred.quantity || quantity, unit })

      return {
        user_id: userId,
        transaction_id: transactionId,
        receipt_id: receipt.id,
        store: receipt.store_name || null,
        product_name: productName,
        original_name: originalName || productName,
        corrected_name: correctedName || productName,
        normalized_name: normalizedName || productName.toLowerCase(),
        brand: item.brand || guessBrand(productName) || null,
        category: item.category || "alimentaire",
        subcategory: item.subcategory || null,
        department: item.department || item.ticket_section || null,
        promotion: Boolean(item.promotion),
        confidence_score: item.confidence_score == null ? null : money(item.confidence_score),
        quantity,
        unit,
        price,
        price_per_unit: unitPrice?.value || null,
        currency: "EUR",
        barcode: item.barcode || null,
        created_at: receipt.purchase_date ? `${receipt.purchase_date}T12:00:00.000Z` : new Date().toISOString(),
      }
    })
    .filter(row => row.normalized_name && row.price > 0)

  if (rows.length === 0) return []

  await supabase
    .from("shopping_items")
    .delete()
    .eq("user_id", userId)
    .eq("transaction_id", transactionId)

  let { data, error } = await supabase
    .from("shopping_items")
    .insert(rows)
    .select()

  if (error && isMissingColumnError(error)) {
    const legacyRows = rows.map(row => ({
      user_id: row.user_id,
      transaction_id: row.transaction_id,
      receipt_id: row.receipt_id,
      store: row.store,
      product_name: row.product_name,
      normalized_name: row.normalized_name,
      brand: row.brand,
      category: row.category,
      quantity: row.quantity,
      unit: row.unit,
      price: row.price,
      price_per_unit: row.price_per_unit,
      currency: row.currency,
      barcode: row.barcode,
      created_at: row.created_at,
    }))

    const retry = await supabase
      .from("shopping_items")
      .insert(legacyRows)
      .select()

    data = retry.data
    error = retry.error
  }

  if (error) throw error
  return data || []
}

function isMissingColumnError(error: any) {
  const message = String(error?.message || error?.details || "")
  return error?.code === "PGRST204" || message.includes("Could not find") || message.includes("column")
}
