export type MerchantAlias = {
  label: string
  aliases: string[]
}

export type ProductAlias = {
  canonical: string
  aliases: string[]
  category?: string
  subcategory?: string
  brand?: string | null
}

function normalizeText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

export function normalizeLookup(value = "") {
  return normalizeText(value).replace(/[^a-z0-9]/g, "")
}

export const MERCHANT_DICTIONARY: MerchantAlias[] = [
  {
    label: "Leader Price",
    aliases: [
      "leader price",
      "leaderprice",
      "leader prix",
      "leader pr1ce",
      "leaoer price",
      "leaoer pr1ce",
      "leader price saint leu",
      "leader price express",
    ],
  },
  { label: "E.Leclerc Le Portail", aliases: ["e.leclerc le portail", "eleclerc le portail", "leclerc le portail", "le portail"] },
  { label: "E.Leclerc", aliases: ["e.leclerc", "eleclerc", "leclerc"] },
  { label: "Carrefour Market", aliases: ["carrefour market", "carrefour mkt"] },
  { label: "Carrefour", aliases: ["carrefour"] },
  { label: "Hyper U", aliases: ["hyper u", "hyperu"] },
  { label: "Super U", aliases: ["super u", "superu"] },
  { label: "U Express", aliases: ["u express", "uexpress"] },
  { label: "Jumbo Score", aliases: ["jumbo score", "jumboscore"] },
  { label: "Score", aliases: ["score"] },
  { label: "Run Market", aliases: ["run market", "runmarket"] },
  { label: "Intermarche", aliases: ["intermarche", "inter marche"] },
  { label: "Lidl", aliases: ["lidl"] },
  { label: "Auchan", aliases: ["auchan"] },
  { label: "Casino", aliases: ["casino"] },
  { label: "Spar", aliases: ["spar"] },
  { label: "Vival", aliases: ["vival"] },
]

export const SCAN_MERCHANTS = MERCHANT_DICTIONARY.map(row => row.label)

export const PRODUCT_DICTIONARY: ProductAlias[] = [
  { canonical: "Coca-Cola 1,5 L", aliases: ["coca15l", "coca 15l", "coca 1 5l", "coca cola 1.5l"], category: "alimentaire", subcategory: "Boissons", brand: "Coca-Cola" },
  { canonical: "Banane", aliases: ["bann", "banane", "banane reunion", "bananes"], category: "alimentaire", subcategory: "Fruits et legumes" },
  { canonical: "Tomates cerises", aliases: ["tom ceri", "tomates cerises", "tomate cerise"], category: "alimentaire", subcategory: "Fruits et legumes" },
  { canonical: "Pain de mie tranche complet", aliases: ["pain mie tranche complet", "pain de mie tranche complet"], category: "alimentaire", subcategory: "Boulangerie" },
  { canonical: "Petit pain lait x10 350g", aliases: ["petit pain lait x10 350g", "petit pain lait x10"], category: "alimentaire", subcategory: "Boulangerie" },
  { canonical: "Spaghetti ble complet 500g", aliases: ["spaghetti ble complet 500", "spaghetti ble complet"], category: "alimentaire", subcategory: "Epicerie salee / condiments" },
  { canonical: "Thon albacore carrefour 360g", aliases: ["thon alb carri 360g viet", "thon alb carri 360g"], category: "alimentaire", subcategory: "Poissonnerie" },
]

export function normalizeMerchantName(value = "") {
  const lookup = normalizeLookup(value)
  if (!lookup) return ""

  const hit = MERCHANT_DICTIONARY.find(row => {
    return row.aliases.some(alias => {
      const normalizedAlias = normalizeLookup(alias)
      return lookup.includes(normalizedAlias) || normalizedAlias.includes(lookup)
    })
  })

  return hit?.label || ""
}

export function normalizeProductOcrName(value = "") {
  const lookup = normalizeLookup(value)
  if (!lookup) return String(value || "").trim()

  const hit = PRODUCT_DICTIONARY.find(row => row.aliases.some(alias => {
    const normalizedAlias = normalizeLookup(alias)
    return lookup === normalizedAlias || lookup.includes(normalizedAlias) || normalizedAlias.includes(lookup)
  }))

  return hit?.canonical || String(value || "").trim()
}

export function getProductDictionaryMeta(value = "") {
  const lookup = normalizeLookup(value)
  if (!lookup) return null

  return PRODUCT_DICTIONARY.find(row => row.aliases.some(alias => {
    const normalizedAlias = normalizeLookup(alias)
    return lookup === normalizedAlias || lookup.includes(normalizedAlias) || normalizedAlias.includes(lookup)
  })) || null
}
