import { normalizeProductName } from "./normalizer.ts"

function receiptIdentityKey(receiptId = "", normalizedName = "") {
  const cleanReceiptId = String(receiptId || "").trim()
  const cleanName = normalizeProductName(normalizedName)
  return cleanReceiptId && cleanName ? `${cleanReceiptId}|${cleanName}` : ""
}

export function enrichShoppingItemsWithReceiptIdentities(shoppingItems = [], receiptItems = []) {
  const identitiesByReceiptAndName = new Map()

  for (const receiptItem of receiptItems || []) {
    if (receiptItem?.market_matched !== true || !receiptItem?.market_product_id) continue
    const key = receiptIdentityKey(
      receiptItem.receipt_id,
      receiptItem.normalized_name || receiptItem.corrected_name || receiptItem.name,
    )
    if (!key) continue
    const candidates = identitiesByReceiptAndName.get(key) || []
    candidates.push(receiptItem)
    identitiesByReceiptAndName.set(key, candidates)
  }

  return (shoppingItems || []).map(shoppingItem => {
    const key = receiptIdentityKey(
      shoppingItem.receipt_id,
      shoppingItem.normalized_name || shoppingItem.corrected_name || shoppingItem.product_name,
    )
    const candidates = key ? identitiesByReceiptAndName.get(key) || [] : []
    const productIds = new Set(candidates.map(item => item.market_product_id).filter(Boolean))

    if (productIds.size !== 1) return shoppingItem

    const identity = candidates[0]
    return {
      ...shoppingItem,
      market_product_id: identity.market_product_id,
      market_canonical_name: identity.market_canonical_name || null,
      market_brand: identity.market_brand || null,
      market_package_format: identity.market_package_format || null,
      market_match_type: identity.market_match_type || null,
      controlled_normalization: true,
    }
  })
}
