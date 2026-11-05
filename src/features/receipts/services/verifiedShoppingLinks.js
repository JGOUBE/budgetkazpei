import { supabase } from "../../../services/supabase"
import { applyVerifiedShoppingLinks } from "./verifiedShoppingLinkRules"

export async function attachVerifiedShoppingLinks({ userId, draft, client = supabase }) {
  if (!userId || !Array.isArray(draft?.items)) return draft
  const marketIds = [...new Set(draft.items
    .filter(item => item.market_matched === true && item.market_product_id)
    .map(item => item.market_product_id))]
  if (!marketIds.length) return draft
  const { data: links, error: linkError } = await client.from("shopping_market_product_links")
    .select("market_product_id,shopping_product_id").in("market_product_id", marketIds)
  if (linkError) throw linkError
  const productIds = [...new Set((links || []).map(x => x.shopping_product_id))]
  if (!productIds.length) return draft
  const { data: products, error: productError } = await client.from("shopping_products")
    .select("id,display_name").eq("is_active", true).in("id", productIds)
  if (productError) throw productError
  return applyVerifiedShoppingLinks(draft, links, products)
}
