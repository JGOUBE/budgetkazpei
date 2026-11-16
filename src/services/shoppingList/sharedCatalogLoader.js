const PAGE_SIZE = 1000;

// Supabase PostgREST limits responses to the configured max rows (normally 1000).
// Page through the published shared catalog so later imports stay visible.
export async function loadSharedShoppingCatalog({ client, pageSize = PAGE_SIZE } = {}) {
  if (!client) throw new Error("missing_supabase_client");
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client.from("shopping_products")
      .select("id,display_name,normalized_name,brand,size_label,category,subcategory")
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

// Search private retailer/OCR aliases through a narrow, authenticated RPC.
// Only public product IDs/scores return to the device; raw aliases stay private.
export async function searchSharedShoppingAliases({ client, query, limit = 24 } = {}) {
  if (!client) throw new Error("missing_supabase_client");
  const searched = String(query || "").trim();
  if (searched.replace(/\s+/g, "").length < 3) return [];
  const { data, error } = await client.rpc("shopping_find_product_ids_by_alias", {
    p_query: searched,
    p_limit: Math.min(Math.max(Number(limit) || 24, 1), 30),
  });
  if (error) throw error;
  return (Array.isArray(data) ? data : []).filter(row => typeof row?.product_id === "string" && row.product_id);
}
