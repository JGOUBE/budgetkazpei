const PAGE_SIZE = 1000;

// Supabase PostgREST limits responses to the configured max rows (normally 1000).
// Page through the published shared catalog so later imports stay visible.
export async function loadSharedShoppingCatalog({ client, pageSize = PAGE_SIZE } = {}) {
  if (!client) throw new Error("missing_supabase_client");
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client.from("shopping_products")
      .select("id,barcode,display_name,normalized_name,brand,size_label,category,subcategory")
      .eq("is_active", true)
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return rows;
  }
}

export async function loadSharedShoppingPrices({ client, pageSize = PAGE_SIZE } = {}) {
  if (!client) throw new Error("missing_supabase_client");
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client.from("shopping_price_observations")
      .select("product_id,price,quantity,unit_label,unit_price,observed_at,retailer_slug,commune,locality,id")
      .eq("is_publishable", true)
      .order("observed_at", { ascending: false })
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return rows;
  }
}
