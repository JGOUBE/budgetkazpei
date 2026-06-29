export function normalizeProductName(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[-_/]/g, " ")
    .replace(/\b\d+(?:[,.]\d+)?\s?(?:kg|kgs|kilogrammes?|g|gr|grammes?|l|litres?|cl|ml)\b/gi, " ")
    .replace(/\b\d+\s?(?:x|pcs?|pieces?)\b/gi, " ")
    .replace(/\b(?:lot|pack|format|promo)\b/gi, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

export function guessBrand(productName = "") {
  const normalized = normalizeProductName(productName)
  const knownBrands = [
    "coca cola",
    "pepsi",
    "dodo",
    "yoplait",
    "danone",
    "president",
    "elle vire",
    "candia",
  ]

  return knownBrands.find(brand => normalized.startsWith(brand)) || ""
}
