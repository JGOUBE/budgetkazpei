import { normalizeProductName } from "../../features/shopping/services/normalizer.ts"
import { normalizeShoppingProductText } from "./shoppingProductCompatibility.js"

export function getShoppingListQuantity(item = {}) {
  const value = Number(item.list_quantity ?? item.listQuantity ?? 1)
  if (!Number.isFinite(value) || value <= 0) return 1
  return Math.max(1, Math.round(value))
}

function clean(value) {
  return String(value || "").trim()
}

export function shoppingListItemIdentityKey(item = {}) {
  const shoppingProductId = clean(item.shopping_product_id || item.shoppingProductId || item.product_id)
  const marketProductId = clean(item.market_product_id || item.marketProductId)
  const barcode = clean(item.barcode || item.ean || item.gtin)
  const name = normalizeProductName(item.name || item.product_name || "")
  const brand = normalizeShoppingProductText(item.brand || item.market_brand || "")
  const packageFormat = normalizeShoppingProductText(
    item.package_format || item.packageFormat || item.market_package_format || "",
  )
  const category = normalizeShoppingProductText(item.category || item.subcategory || "")
  const reference = shoppingProductId
    ? `shopping:${shoppingProductId}`
    : marketProductId
      ? `market:${marketProductId}`
      : /^\d{8,14}$/.test(barcode)
        ? `barcode:${barcode}`
        : name
          ? `name:${name}`
          : ""

  return reference
    ? [reference, `brand:${brand}`, `package:${packageFormat}`, `category:${category}`].join("|")
    : ""
}

export function findExactShoppingListDuplicate(items = [], candidate = {}) {
  const candidateKey = shoppingListItemIdentityKey(candidate)
  if (!candidateKey) return null
  return (Array.isArray(items) ? items : []).find(item =>
    shoppingListItemIdentityKey(item) === candidateKey,
  ) || null
}
