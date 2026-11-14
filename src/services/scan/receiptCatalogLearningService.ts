import { supabase } from "../supabase"

// Catalog learning only reads server-side validated receipt records.
// An error must never prevent a receipt from being saved.
const LEARNING_TIMEOUT_MS = 7000

export async function learnSharedShoppingCatalogFromReceipt(receiptId: string) {
  const id = String(receiptId || "").trim()
  if (!id) return { ok: false, skipped: true, reason: "missing_receipt_id" }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), LEARNING_TIMEOUT_MS)
  try {
    const { data, error } = await supabase
      .rpc("shopping_learn_receipt_to_shared_catalog", { p_receipt_id: id })
      .abortSignal(controller.signal)
    if (error) throw error
    return data || { ok: true, skipped: true, reason: "no_result" }
  } finally {
    clearTimeout(timeoutId)
  }
}
