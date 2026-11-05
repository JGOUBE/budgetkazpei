import { supabase } from "../../../services/supabase"

// A verified identity link is ONLY a UI hint. It never changes the receipt's
// name, amount, quantity, category, confidence, market match, or saved record.
export function applyVerifiedShoppingLinks(draft = {}, links = [], products = []) {
  if (!Array.isArray(draft?.items)) return draft
  const productNames = new Map(products.map(p => [p.id, p.display_name]))
  const linkedNames = new Map(links.map(link => [
    link.market_product_id,
    { id: link.shopping_product_id, name: productNames.get(link.shopping_product_id) },
  ]))
  const norm = value => String(value || "").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim()
  return {
    ...draft,
    items: draft.items.map(item => {
      if (item?.market_matched !== true || !item?.market_product_id) return item
      const linked = linkedNames.get(item.market_product_id)
      if (!linked?.id || !linked?.name) return item
      // If the user has changed the product name, the previous match is stale.
      if (!item.market_canonical_name ||
          norm(item.name || item.corrected_name) !== norm(item.market_canonical_name)) return item
      return { ...item, _verified_shopping_product_id: linked.id,
        _verified_shopping_product_name: linked.name }
    }),
  }
}

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
