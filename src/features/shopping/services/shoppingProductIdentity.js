import { normalizeProductName } from "./normalizer.ts"

// Keep package size and pack count in the strict key: the historical generic
// normalized_name deliberately drops sizes and can cover multiple SKUs.
function exactNameKey(value = "") {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}
function receiptIdentityKey(receiptId = "", normalizedName = "") {
  const cleanReceiptId = String(receiptId || "").trim()
  const cleanName = normalizeProductName(normalizedName)
  return cleanReceiptId && cleanName ? `${cleanReceiptId}|${cleanName}` : ""
}
function exactReceiptKey(receiptId = "", label = "") {
  const exact = exactNameKey(label)
  return receiptId && exact ? `${receiptId}|${exact}` : ""
}
function addCandidate(map, key, item) {
  if (!key) return
  const candidates = map.get(key) || []
  candidates.push(item)
  map.set(key, candidates)
}

export function enrichShoppingItemsWithReceiptIdentities(shoppingItems = [], receiptItems = []) {
  const byNormalized = new Map()
  const byExact = new Map()
  for (const item of receiptItems || []) {
    if (item?.market_matched !== true || !item.market_product_id) continue
    addCandidate(byNormalized, receiptIdentityKey(
      item.receipt_id, item.normalized_name || item.corrected_name || item.name,
    ), item)
    addCandidate(byExact, exactReceiptKey(
      item.receipt_id, item.corrected_name || item.name,
    ), item)
  }

  return (shoppingItems || []).map(shoppingItem => {
    // An exact corrected commercial name is stronger than a generic key.
    // Fall back only when it has no exact match, and never merge two SKUs.
    const exactKey = exactReceiptKey(
      shoppingItem.receipt_id, shoppingItem.corrected_name || shoppingItem.product_name,
    )
    const genericKey = receiptIdentityKey(
      shoppingItem.receipt_id,
      shoppingItem.normalized_name || shoppingItem.corrected_name || shoppingItem.product_name,
    )
    const candidates = (exactKey ? byExact.get(exactKey) : null)
      || (genericKey ? byNormalized.get(genericKey) : null)
      || []
    const ids = new Set(candidates.map(item => item.market_product_id).filter(Boolean))
    if (ids.size !== 1) return shoppingItem

    const identity = candidates.find(item =>
      Math.abs(Number(item.total_price || 0) - Number(shoppingItem.price || 0)) <= 0.02,
    ) || candidates[0]
    const unitPrice = Number(identity.unit_price || 0)
    const quantity = Number(identity.quantity || 0)
    const lineTotal = Number(identity.total_price || 0)
    const reconciledLine = unitPrice > 0 && quantity > 0
      && Math.abs(unitPrice * quantity - lineTotal) <= 0.02
    const safeUnit = reconciledLine
      && Math.abs(lineTotal - Number(shoppingItem.price || 0)) <= 0.02

    return {
      ...shoppingItem,
      market_product_id: identity.market_product_id,
      market_canonical_name: identity.market_canonical_name || null,
      market_brand: identity.market_brand || null,
      market_package_format: identity.market_package_format || null,
      market_match_type: identity.market_match_type || null,
      controlled_normalization: true,
      receipt_pack_unit_price: safeUnit ? unitPrice : null,
      receipt_pack_count: safeUnit ? quantity : null,
      receipt_variable_weight: unitPrice > 0 && lineTotal > 0 && !reconciledLine,
    }
  })
}
