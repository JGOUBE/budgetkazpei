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
  if (!(text === "lai" || /^lait(?: |$)/.test(text))) return false
  return !/\b(corps|peau|visage|hydratant|mixa|cica|solaire|demaquillant)\b/.test(text)
}
export function isMilkCosmeticLabel(label = "") {
  const text = normalizeShoppingQuery(label)
  return /\blait\s+(?:corps|corporel|pour\s+le\s+corps|pour\s+la\s+peau|hydratant|solaire|demaquillant)\b/.test(text)
    || /\b(?:mixa|cica|nourrissant\s+au\s+karite)\b/.test(text)
}
// A generic search for cooking oil must identify the product itself, not
// incidental ingredients (sardines à l'huile, lentilles à l'huile), cosmetic
// oils or household cleaners with essential oils.
export function isCookingOilQuery(query = "") {
  const text = normalizeShoppingQuery(query)
  if (!/^(?:hui|huil|huile|huiles)(?: |$)/.test(text)) return false
  // A deliberately specialised search must not be silently forced into food.
  if (/\\b(essentiell?e?s?|moteur|massage|corps|cheveux|visage|douche|bain|solaire|parfum|cosmetique|cuticule)\\b/.test(text)) return false
  return true
}

export function isCookingOilProduct(row = {}) {
  const label = normalizeShoppingQuery(typeof row === "string"
    ? row
    : row.label || row.productName || row.product_name || row.display_name || row.name)
  if (!label) return false
  // Exclude non-edible uses even if the wording starts with 'Huile'.
  if (/\\b(wc|menager|nettoyant|gel|lessive|savon|shampooing|shampoing|douche|bain|massage|moteur|essentiell?e?s?|corps|cheveux|visage|parfum|solaire|cosmetique|lampes?|lubrifiant|entretien)\\b/.test(label)) return false
  // The noun should be oil. A brand may prefix it (e.g. 'Lesieur huile ...').
  // Products 'à l'huile' have another primary noun and are not cooking oil.
  return /^(?:huile|huiles)\\b/.test(label) ||
    /^[a-z0-9-]+ (?:huile|huiles)\\b/.test(label)
}

export function filterShoppingIntentSuggestions(rows = [], query = "") {
  if (!hasUsefulShoppingQuery(query)) return []
  return rows.filter(row => {
    if (isFoodMilkQuery(query) && isMilkCosmeticLabel(row.label || row.productName || row.display_name)) return false
    if (isCookingOilQuery(query) && !isCookingOilProduct(row)) return false
    return true
  })
}
