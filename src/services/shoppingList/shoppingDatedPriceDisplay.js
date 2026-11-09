// A dated, published catalogue price is a visual reference, NOT necessarily
// a current budget estimate. Use exact product identity to avoid cross-format
// or cross-brand price attribution.
function productKey(value = "") {
  return String(value || "")
    .replace(/œ/gi, "oe")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
}
function positivePrice(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}
function validObservedDate(value, now) {
  const t = value ? new Date(value).getTime() : NaN
  return Number.isFinite(t) && t <= now && t > 0 ? t : null
}
export function getDatedShoppingListPrice({
  item = {}, products = [], observations = [], now = Date.now(),
} = {}) {
  const label = productKey(item.name || item.product_name || item.label)
  if (!label) return null
  const quantity = Math.max(1, Number(item.list_quantity || 1) || 1)
  // The selected reference may outlive the product's presence in a later
  // catalogue response, so preserve its exact selected package price.
  const selected = positivePrice(item.selected_pack_price)
  const selectedAt = validObservedDate(item.selected_price_observed_at, now)
  if (selected > 0 && selectedAt !== null) {
    return { price: Number((selected * quantity).toFixed(2)),
      observedAt: item.selected_price_observed_at,
      retailer: item.selected_price_retailer || "" }
  }
  const exact = (products || []).find(p => productKey(p.display_name) === label)
  if (!exact) return null
  const matching = (observations || [])
    .filter(o => o.product_id === exact.id && positivePrice(o.price) > 0)
    .filter(o => validObservedDate(o.observed_at, now) !== null)
    .sort((a,b) => new Date(b.observed_at).getTime() - new Date(a.observed_at).getTime())
  const latest = matching[0]
  if (!latest) return null
  return { price: Number((positivePrice(latest.price) * quantity).toFixed(2)),
    observedAt: latest.observed_at,
    retailer: [latest.retailer_slug, latest.locality || latest.commune].filter(Boolean).join(" · ") }
}
