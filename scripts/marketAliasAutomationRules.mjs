export function normalizeAutomationText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function containsBrandAsWholeToken(rawLabel = "", brand = "") {
  const rawTokens = normalizeAutomationText(rawLabel).split(" ").filter(Boolean)
  const brandTokens = normalizeAutomationText(brand).split(" ").filter(Boolean)

  if (!rawTokens.length || !brandTokens.length) return false

  // Une marque d'une seule lettre, comme U, ne doit jamais Ãªtre
  // dÃ©duite d'un libellÃ© par simple prÃ©sence de caractÃ¨re.
  if (brandTokens.length === 1 && brandTokens[0].length < 2) return false

  for (let start = 0; start <= rawTokens.length - brandTokens.length; start += 1) {
    let matches = true
    for (let offset = 0; offset < brandTokens.length; offset += 1) {
      if (rawTokens[start + offset] !== brandTokens[offset]) {
        matches = false
        break
      }
    }
    if (matches) return true
  }

  return false
}

export function normalizeAutomationStoreChain(value = "") {
  const normalized = normalizeAutomationText(value)
  if (normalized.startsWith("e leclerc") || normalized === "leclerc") return "e leclerc"
  if (normalized.startsWith("leader price")) return "leader price"
  if (normalized.startsWith("carrefour")) return "carrefour"
  if (["u", "super u", "hyper u"].includes(normalized)) return "u"
  if (normalized.startsWith("auchan")) return "auchan"
  if (normalized.startsWith("gamm vert")) return "gamm vert"
  if (normalized.startsWith("weldom")) return "weldom"
  return normalized
}