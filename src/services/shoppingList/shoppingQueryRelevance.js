export function normalizeShoppingQuery(value = "") {
  return String(value || "").replace(/œ/g, "oe").replace(/Œ/g, "Oe").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
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
  if (/\b(essentiell?e?s?|moteur|massage|corps|cheveux|visage|douche|bain|solaire|parfum|cosmetique|cuticule)\b/.test(text)) return false
  return true
}

export function isCookingOilProduct(row = {}) {
  const label = normalizeShoppingQuery(typeof row === "string"
    ? row
    : row.label || row.productName || row.product_name || row.display_name || row.name)
  if (!label) return false
  // Exclude non-edible uses even if the wording starts with 'Huile'.
  if (/\b(wc|menager|nettoyant|gel|lessive|savon|shampooing|shampoing|douche|bain|massage|moteur|essentiell?e?s?|corps|cheveux|visage|parfum|solaire|cosmetique|lampes?|lubrifiant|entretien)\b/.test(label)) return false
  // The noun should be oil. A brand may prefix it (e.g. 'Lesieur huile ...').
  // Products 'à l'huile' have another primary noun and are not cooking oil.
  return /^(?:huile|huiles)\b/.test(label) ||
    /^[a-z0-9-]+ (?:huile|huiles)\b/.test(label)
}

// The user looking for eggs must not receive beef (boeuf) or fish roe.
export function isTableEggQuery(query = "") {
  const text = normalizeShoppingQuery(query)
  return /^(?:oeuf|oeufs)(?: |$)/.test(text) &&
    !/\b(lompe|poisson|caviar)\b/.test(text)
}
export function isTableEggProduct(row = {}) {
  const label = normalizeShoppingQuery(typeof row === "string" ? row :
    row.label || row.productName || row.product_name || row.display_name || row.name)
  if (!label || /\b(lompe|poisson|caviar|boeuf)\b/.test(label)) return false
  return /(?:^|\s)oeufs?(?:\s|$)/.test(label)
}

// Variantes de saisie équivalentes : "coton tige", "cotons-tiges", "cotontige".
 // Keep the normalization specific: a generic search for "coton" must still
 // match cotton pads, while a search for cotton swabs must not match perfumes.
export function normalizeShoppingSearchText(value = "") {
  const normalized = normalizeShoppingQuery(value)
    .replace(/\b(?:cotons?\s+tiges?|cotontiges?)\b/g, "cotontige")
    .replace(/\s+/g, " ")
    .trim()
  // Both "coton" and "cotons" should retrieve "cotons-tiges".
  return normalized === "cotons" ? "coton" : normalized
}

export function isCottonSwabQuery(query = "") {
  const text = normalizeShoppingQuery(query)
  return /^(?:cotons?\s+t(?:i(?:g(?:e(?:s)?)?)?)?|cotontiges?)(?:\s|$)/.test(text)
}

export function isCottonSwabProduct(row = {}) {
  const label = normalizeShoppingQuery(typeof row === "string" ? row :
    row.label || row.productName || row.product_name || row.display_name || row.name)
  return /\bcotons?\s+tiges?\b/.test(label) ||
    /\bcotontiges?\b/.test(label) ||
    /\bbatonnets?\s+(?:ouates?|de\s+coton)\b/.test(label)
}

// Used by the catalog and by the other suggestion sources to rank the actual
// product family ahead of incidental keyword matches.
export function getShoppingCatalogSuggestionScore(label = "", query = "") {
  const name = normalizeShoppingSearchText(label)
  const searched = normalizeShoppingSearchText(query)
  if (!name || !searched) return -1
  const terms = searched.split(" ").filter(Boolean)
  if (!terms.every(term => name.includes(term))) return -1
  if (name === searched) return 120
  if (name.startsWith(searched)) return 100
  if (name.split(" ").some(word => word.startsWith(searched))) return 70
  return 30
}

export function filterShoppingIntentSuggestions(rows = [], query = "") {
  if (!hasUsefulShoppingQuery(query)) return []
  return rows.filter(row => {
    if (isFoodMilkQuery(query) && isMilkCosmeticLabel(row.label || row.productName || row.display_name)) return false
    if (isCookingOilQuery(query) && !isCookingOilProduct(row)) return false
    if (isTableEggQuery(query) && !isTableEggProduct(row)) return false
    if (isCottonSwabQuery(query) && !isCottonSwabProduct(row)) return false
    return true
  })
}

// Rank across ALL suggestion sources before limiting the results. Group priority
// is only a tie-breaker: a relevant catalogue product must not be buried below
// an unrelated scented product just because its price was observed elsewhere.
export function rankShoppingSuggestionGroups(groups = {}, query = "", { showAll = false, limit = 4 } = {}) {
  const sources = ["historical", "observed", "retail", "catalog"]
  const normalizedQuery = normalizeShoppingQuery(query)
  const genericCotton = /^(?:coton|cotons)$/.test(normalizedQuery)

  const ranked = sources.flatMap((group, sourceIndex) =>
    (Array.isArray(groups[group]) ? groups[group] : []).map((suggestion, itemIndex) => {
      const label = String(suggestion?.label || suggestion?.display_name || suggestion?.productName || "")
      const matchScore = Math.max(0, getShoppingCatalogSuggestionScore(label, query))
      const normalizedLabel = normalizeShoppingQuery(label)
      // "Coton" describes a product family, not a fragrance. Give physical
      // cotton items priority; preserve all matches for an explicit fragrance
      // search ("déodorant fleur de coton").
      const isCottonMaterial = /^(?:cotons?|disques?|carres?|compresses?|boules?)\b/.test(normalizedLabel)
        && /\bcotons?\b/.test(normalizedLabel)
      const cottonPriority = genericCotton
        ? isCottonSwabProduct(suggestion) ? 200
          : isCottonMaterial ? 140
          : /^(?:coton|cotons)(?: |$)/.test(normalizedLabel) ? 100
          : /\b(?:fleur de coton|parfum(?:e)?(?:e)?(?: au| de)? coton)\b/.test(normalizedLabel) ? -120
          : 0
        : 0
      return { group, suggestion, sourceIndex, itemIndex, relevance: matchScore * 10 + cottonPriority }
    }),
  )

  ranked.sort((a, b) =>
    b.relevance - a.relevance ||
    a.sourceIndex - b.sourceIndex ||
    a.itemIndex - b.itemIndex,
  )
  const visible = showAll ? ranked : ranked.slice(0, Math.max(0, limit))
  const result = { historical: [], observed: [], retail: [], catalog: [], groupOrder: [] }
  for (const entry of visible) {
    result[entry.group].push(entry.suggestion)
    if (!result.groupOrder.includes(entry.group)) result.groupOrder.push(entry.group)
  }
  return result
}
