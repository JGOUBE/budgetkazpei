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

    const identity = candidates.find(item =>
      Math.abs(Number(item.total_price || 0) - Number(shoppingItem.price || 0)) <= 0.02,
    ) || candidates[0]
    const receiptUnit = Number(identity.unit_price || 0)
    const receiptQty = Number(identity.quantity || 0)
    const receiptLine = Number(identity.total_price || 0)
    const reliableReceiptUnit = receiptUnit > 0 && receiptQty > 0
      && Math.abs(receiptUnit * receiptQty - receiptLine) <= 0.02
      && Math.abs(receiptLine - Number(shoppingItem.price || 0)) <= 0.02
    return {
      ...shoppingItem,
      market_product_id: identity.market_product_id,
      market_canonical_name: identity.market_canonical_name || null,
      market_brand: identity.market_brand || null,
      market_package_format: identity.market_package_format || null,
      market_match_type: identity.market_match_type || null,
      controlled_normalization: true,
      receipt_pack_unit_price: reliableReceiptUnit ? receiptUnit : null,
      receipt_pack_count: reliableReceiptUnit ? receiptQty : null,
    }
  })
}
