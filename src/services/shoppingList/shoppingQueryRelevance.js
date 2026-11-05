export function normalizeShoppingQuery(value = "") {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

// One- or two-character strings cause unrelated product matches ("la" -> lanières).
export function hasUsefulShoppingQuery(query = "") {
  return normalizeShoppingQuery(query).replace(/ /g, "").length >= 3
}

// Only exclude cosmetics when "lait" clearly means food milk, not when searching
// deliberately for "lait corps" or other body care.
export function isFoodMilkQuery(query = "") {
  const text = normalizeShoppingQuery(query)
  if (!/^lait(?: |$)/.test(text)) return false
  return !/\b(corps|peau|visage|hydratant|mixa|cica|solaire|demaquillant)\b/.test(text)
}
export function isMilkCosmeticLabel(label = "") {
  const text = normalizeShoppingQuery(label)
  return /\blait\s+(?:corps|corporel|pour\s+le\s+corps|pour\s+la\s+peau|hydratant|solaire|demaquillant)\b/.test(text)
    || /\b(?:mixa|cica|nourrissant\s+au\s+karite)\b/.test(text)
}
export function filterShoppingIntentSuggestions(rows = [], query = "") {
  if (!hasUsefulShoppingQuery(query)) return []
  if (!isFoodMilkQuery(query)) return rows
  return rows.filter(row => !isMilkCosmeticLabel(row.label || row.productName || row.display_name))
}
