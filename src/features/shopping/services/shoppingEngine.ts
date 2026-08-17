import { supabase } from "../../../services/supabase"
import { isItemEligibleForSmartShopping } from "../../../services/scan/receiptRules"
import { guessBrand, normalizeProductName } from "./normalizer"
import { computeUnitPrice, inferUnitFromName } from "./unitPrice"

function money(value: number | string | null | undefined) {
  return Number(String(value ?? 0).replace(",", ".")) || 0
}

function normalizeForGuard(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function isMissingColumnError(error: any) {
  const message = String(error?.message || error?.details || "")
  return error?.code === "PGRST204" || message.includes("Could not find") || message.includes("column")
}

function isReviewItem(item: Record<string, any> = {}) {
  if (!isItemEligibleForSmartShopping(item)) return true

  const status = normalizeForGuard(
    [item.item_status, item.status, item.review_status].filter(Boolean).join(" "),
  )

  return item.needs_review === true
    || status.includes("needs review")
    || status.includes("needs_review")
    || status.includes("a verifier")
    || status.includes("a_verifier")
    || status.includes("rejected")
}

function isParasiteProductName(value = "") {
  const raw = String(value || "")
  const clean = normalizeForGuard(value)
  if (!clean) return true
  if (/\b02[\s.:-]*62(?:[\s.:-]*\d{2}){3,4}\b/.test(raw)) return true
  if (/\b0[0-9](?:[\s.:-]*\d{2}){4}\b/.test(raw)) return true
  if ((raw.match(/\d{2}\./g) || []).length >= 3) return true
  if (clean.includes("article illisible") || clean.includes("produit a verifier")) return true
  if (/^(tel|telephone|siret|sirene|cb|carte|total|reste a payer|net a payer|tva|fid|fidelite)\b/.test(clean)) return true
  if (/\b(total|carte bleue|ticket|caisse|merci|siret|telephone|tel)\b/.test(clean)) return true
  return false
}

async function safeDeleteShoppingItems({ userId, receiptId, transactionId }: { userId?: string, receiptId?: string, transactionId?: string }) {
  const deletions = []

  if (receiptId) {
    deletions.push(
      supabase
        .from("shopping_items")
        .delete()
        .eq("user_id", userId)
        .eq("receipt_id", receiptId),
    )
  }

  if (transactionId) {
    deletions.push(
      supabase
        .from("shopping_items")
        .delete()
        .eq("user_id", userId)
        .eq("transaction_id", transactionId),
    )
  }

  for (const deletion of deletions) {
    const { error } = await deletion
    if (error && !isMissingColumnError(error)) throw error
  }
}

function buildShoppingRows({ userId, transactionId, receipt, items }: { userId: string, transactionId: string, receipt: Record<string, any>, items?: Record<string, any>[] }) {
  return (items || [])
    .filter(item => String(item.name || item.corrected_name || item.ocr_name || "").trim())
    .filter(item => !isReviewItem(item))
    .map(item => {
      const originalName = String(item.ocr_name || item.name || "").trim()
      const correctedName = String(item.corrected_name || item.name || originalName).trim()
      const productName = correctedName || originalName
      const normalizedName = item.normalized_name || normalizeProductName(productName)
      const inferred = inferUnitFromName(productName)
      const quantity = money(item.quantity) || inferred.quantity || 1
      const unit = item.unit || inferred.unit || "piece"
      const price = money(item.total_price) || money(item.price) || money(item.unit_price)
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
    .filter(row => row.normalized_name && row.price > 0 && !isParasiteProductName(row.product_name))
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
  receipt?: Record<string, any>
  items?: Record<string, any>[]
}) {
  if (!userId || !receipt?.id) return []

  await safeDeleteShoppingItems({
    userId,
    receiptId: receipt.id,
    transactionId,
  })

  if (!transactionId) {
    console.warn("[shopping] sync skipped", {
      reason: "missing_transaction_id",
      receipt_id: receipt.id,
      store: receipt.store_name || null,
    })
    return []
  }

  const rows = buildShoppingRows({ userId, transactionId, receipt, items })

  if (rows.length === 0) return []

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