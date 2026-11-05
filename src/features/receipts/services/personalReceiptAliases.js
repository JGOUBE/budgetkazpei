import { supabase } from "../../../services/supabase"
import { normalizePersonalAlias, buildPersonalAliasMap, applyPersonalAliasesToDraft } from "./personalReceiptAliasRules"

export async function suggestPersonalAliasesForScan({ userId, draft, client = supabase }) {
  if (!userId || !draft?.store_name || !draft?.items?.length) return draft
  const { data: receipts, error: receiptError } = await client.from("receipts")
    .select("id,store_name").eq("user_id", userId)
    .order("created_at", { ascending: false }).limit(80)
  if (receiptError) throw receiptError
  const store = normalizePersonalAlias(draft.store_name)
  const ids = (receipts || []).filter(receipt => normalizePersonalAlias(receipt.store_name) === store).map(receipt => receipt.id)
  if (!ids.length) return draft
  const { data: items, error: itemError } = await client.from("receipt_items")
    .select("ocr_name,corrected_name,item_status")
    .eq("user_id", userId).eq("item_status", "user_validated").in("receipt_id", ids)
    .limit(1000)
  if (itemError) throw itemError
  return applyPersonalAliasesToDraft(draft, buildPersonalAliasMap(items || []))
}
