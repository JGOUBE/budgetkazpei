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

