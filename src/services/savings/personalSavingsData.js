import { supabase } from "../../services/supabase"

const PAGE_SIZE = 500

async function paginated(table, select, makeQuery) {
  const all = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const query = makeQuery(supabase.from(table).select(select))
    const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1)
    if (error) throw error
    all.push(...(data || []))
    if (!data || data.length < PAGE_SIZE) return all
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

async function fetchByIds(table, select, column, ids) {
  const values = unique(ids)
  if (!values.length) return []
  const result = []
  for (let i = 0; i < values.length; i += 80) {
    const slice = values.slice(i, i + 80)
    const { data, error } = await supabase.from(table).select(select).in(column, slice)
    if (error) throw error
    result.push(...(data || []))
  }
  return result
}

export async function loadPersonalSavingsContext(userId) {
  if (!userId) return { receipts: [], receiptItems: [], products: [], links: [], prices: [], stores: [] }

  const [receipts, receiptItems] = await Promise.all([
    paginated(
      "receipts",
      "id,store_name,purchase_date,validation_status,hidden_at,removed_from_history_at",
      query => query.eq("user_id", userId).eq("validation_status", "validated")
        .order("purchase_date", { ascending: false }).order("id", { ascending: true }),
    ),
    paginated(
      "receipt_items",
      "id,receipt_id,name,corrected_name,market_product_id,market_matched,market_match_type,market_match_confidence,item_status,line_type,quantity,unit,unit_price,total_price,created_at",
      query => query.eq("user_id", userId).eq("market_matched", true)
        .not("market_product_id", "is", null)
        .order("created_at", { ascending: false }).order("id", { ascending: true }),
    ),
  ])

  const marketIds = unique(receiptItems.map(item => item.market_product_id))
  const links = await fetchByIds(
    "shopping_market_product_links",
    "market_product_id,shopping_product_id,match_method",
    "market_product_id",
    marketIds,
  )
  const productIds = unique(links.map(link => link.shopping_product_id))
  const products = await fetchByIds(
    "shopping_products",
    "id,display_name,brand,size_label,is_active",
    "id",
    productIds,
  )
  const prices = await paginated(
    "shopping_price_observations",
    "id,product_id,price,quantity,observed_at,unit_label,unit_price,retailer_slug,store_location_id,commune,is_publishable,confidence_score",
    query => query.in("product_id", productIds.length ? productIds : ["00000000-0000-0000-0000-000000000000"])
      .eq("is_publishable", true).not("verified_at", "is", null)
      .order("observed_at", { ascending: false }).order("id", { ascending: true }),
  )
  const stores = await fetchByIds(
    "shopping_store_locations",
    "id,store_name,retailer_slug,commune",
    "id",
    unique(prices.map(price => price.store_location_id)),
  )
  return { receipts, receiptItems, links, products, prices, stores }
}
