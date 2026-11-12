import { supabase } from "../supabase"
import { buildCatalogSavingsInsights, normalizeSavingsCatalogName } from "./catalogSavingsEngine"

const CATALOG_PAGE_SIZE = 1000

export async function loadCatalogSavingsInsights({ shoppingItems = [], client = supabase } = {}) {
  if (!shoppingItems.length) {
    return buildCatalogSavingsInsights({ shoppingItems: [] })
  }

  // The catalogue is public. Fetch only active identities and then the recent,
  // published prices for products present in this user's own shopping history.
  const products = []
  for (let offset = 0; offset < 5000; offset += CATALOG_PAGE_SIZE) {
    const { data, error } = await client
      .from("shopping_products")
      .select("id,display_name,brand,size_label,is_active")
      .eq("is_active", true)
      .order("id", { ascending: true })
      .range(offset, offset + CATALOG_PAGE_SIZE - 1)
    if (error) throw error
    const page = data || []
    products.push(...page)
    if (page.length < CATALOG_PAGE_SIZE) break
  }

  const purchaseKeys = new Set(shoppingItems.map(item =>
    normalizeSavingsCatalogName(item?.product_name || item?.corrected_name || item?.name)
  ).filter(Boolean))
  const relevantIds = [...new Set(products
    .filter(product => purchaseKeys.has(normalizeSavingsCatalogName(product.display_name)))
    .map(product => product.id))]
  const observations = []
  for (let i = 0; i < relevantIds.length; i += 40) {
    const { data, error } = await client
      .from("published_shopping_price_observations")
      .select("product_id,price,observed_at,confidence_score,retailer_slug,store_name,commune,unit_label,unit_price,is_publishable")
      .in("product_id", relevantIds.slice(i, i + 40))
      .order("observed_at", { ascending: false })
      .limit(1000)
    if (error) throw error
    observations.push(...(data || []))
  }

  return buildCatalogSavingsInsights({ shoppingItems, products, observations })
}
