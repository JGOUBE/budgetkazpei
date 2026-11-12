// Familles de consommation : rapprochement statistique, JAMAIS identité
// commerciale. Les prix par article et les formats restent séparés.
// La classification fonctionne sur toutes les désignations (y compris
// nouvelles), sans dépendre de la catégorie peu précise du ticket.
function normalizedText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/œ/gi, "oe")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

const TOKEN_ALIASES = Object.freeze({
  pains: "pain", pommes: "pomme", patates: "patate",
  biscuits: "biscuit", gouter: "gouter", gouters: "gouter",
  fourres: "fourre", fourrees: "fourre", fourree: "fourre",
  cornichons: "cornichon", lentilles: "lentille",
  tomates: "tomate", tomats: "tomate",
  yaourts: "yaourt", yogourts: "yaourt", yogourt: "yaourt",
  oeufs: "oeuf", oeuf: "oeuf",
  wraps: "wrap", tortillas: "tortilla",
  feuilletes: "feuillete", feuilletee: "feuillete",
  rape: "rape", rap: "rape", rapes: "rape",
  gaufrettes: "gaufrette", madeleines: "madeleine",
  saucisses: "saucisse", sauces: "sauce", sacs: "sac",
  boissons: "boisson", cereales: "cereale",
  petits: "petit", desserts: "dessert",
  mouchoirs: "mouchoir", mouchoir: "mouchoir",
  concombres: "concombre", carottes: "carotte",
  brocolis: "brocoli", salades: "salade",
  fromages: "fromage", chips: "chips",
  olives: "olive", farines: "farine",
  tranches: "tranche", tranchettes: "tranche",
  boites: "boite", paquets: "paquet",
  cremes: "creme", purees: "puree",
  noir: "noir", noire: "noir",
  noix: "noix", ecreme: "ecreme", ecr: "ecreme",
  cheure: "chevre", chevres: "chevre",
  choc: "chocolat", choco: "chocolat",
  fraiches: "fraiche", naturelles: "nature",
  compotes: "compote", tablettes: "tablette",
  barres: "barre", pelees: "pelee",
})

const EMPTY_WORDS = new Set([
  "a", "au", "aux", "de", "du", "des", "d", "en", "et", "le", "la", "les",
  "un", "une", "pour", "avec", "lot", "pack", "paquet", "bocal", "boite",
  "sachet", "format", "piece", "pieces", "unite", "unites", "tranche", "tranches",
  "tranchette", "tranchettes", "x", "sur", "kg", "g", "gr", "l", "cl", "ml", "littre",
])

function canonicalToken(token) {
  const raw = token.replace(/(?<=\d)o(?=\d)/g, "0")
  return TOKEN_ALIASES[raw] || raw
}

function productTokens(value) {
  return normalizedText(value)
    .split(" ")
    .map(canonicalToken)
    .filter(token =>
      token &&
      !EMPTY_WORDS.has(token) &&
      !/^\d+(?:x\d+)?(?:kg|g|gr|l|cl|ml|tr|pcs?|pces?)?$/.test(token) &&
      !/^x\d+(?:kg|g|gr|l|cl|ml)?$/.test(token) &&
      !/^\d+(?:mg|%|m2)$/.test(token),
    )
}

const PRODUCT_ANCHORS = new Set([
  "beurre", "farine", "riz", "pate", "coquillette", "farfalle", "tagliatelle",
  "nouille", "couscous", "cornichon", "lentille", "flageolet",
  "haricot", "pois", "mais", "tomate", "puree", "confiture",
  "compote", "yaourt", "oeuf", "fromage", "gouda", "emmental",
  "mimolette", "camembert", "mozzarella", "cheddar", "maasdam",
  "pain", "croissant", "brioche", "wrap", "tortilla", "galette",
  "biscuit", "gouter", "madeleine", "gaufrette", "chips",
  "cracker", "chocolat", "barre", "cereale", "muesli",
  "lait", "boisson", "jus", "nectar", "the", "cafe",
  "eau", "sirop", "huile", "vinaigre", "sauce", "mayonnaise",
  "thon", "saumon", "sardine", "crevette", "poulet", "saucisse",
  "saucisson", "coppa", "rosette", "jambon", "escalope",
  "pomme", "banane", "raisin", "kiwi", "ananas", "carotte",
  "concombre", "oignon", "echalote", "brocoli", "epinard",
  "salade", "champignon", "potiron", "olive", "cajou",
  "mouchoir", "papier", "lessive", "dentifrice", "gel",
  "savon", "coton", "brosse", "sac", "pile", "feuillete",
  "chausson", "burger", "pizza", "tourte", "ravioli",
])

// Un seul nom de famille pour les produits à signification claire.
// Les termes ambigus (lait, pomme, sauce, pain, papier...) conservent
// un qualificatif pour éviter des regroupements trompeurs.
const UNQUALIFIED = new Set([
  "beurre", "farine", "riz", "coquillette", "farfalle", "tagliatelle",
  "cornichon", "lentille", "flageolet", "yaourt", "compote", "oeuf",
  "gouda", "emmental", "mimolette", "camembert", "mozzarella",
  "maasdam", "croissant", "wrap", "tortilla", "biscuit",
  "gouter", "madeleine", "gaufrette", "chips", "cereale",
  "muesli", "confiture", "thon", "sardine", "saucisse",
  "saucisson", "rosette", "carotte", "concombre", "brocoli",
  "epinard", "salade", "champignon", "olive", "mouchoir",
  "lessive", "dentifrice", "cafe", "the", "huile",
  "ravioli", "feuillete", "burger", "pizza",
])

const DEPARTMENTS = new Set([
  "boucherie coupe", "charcuterie ls", "cremerie", "epicerie sucree",
  "epicerie salee", "boissons sans alcool", "ultra frais",
  "fleurs plantes fruits legumes", "fruits legumes", "sous traitance", "ppi",
])

const CUSTOM_FAMILIES = Object.freeze([
  {
    key: "goat-milk",
    label: "Lait de chèvre",
    matches: tokens => {
      const text = tokens.join(" ")
      return /\blait\b/.test(text) &&
        /\bchevre\b/.test(text) &&
        !/\b(?:fromage|yaourt|savon|creme|dessert|pain)\b/.test(text)
    },
  },
  {
    key: "chocolate-tablets",
    label: "Chocolat en tablette",
    matches: (tokens, original) => {
      const text = tokens.join(" ")
      const startsWithTablet = /^(?:tab(?:lette)?\b|chocolat (?:noir|lait|blanc|dessert)\b)/.test(text)
      return startsWithTablet &&
        !/\b(?:biscuit|cereale|poudre|boisson|barre|glace|cone)\b/.test(text) &&
        !/\b(?:biscuit|cereale|poudre|boisson|barre|glace|cone)\b/.test(original)
    },
  },
])

const DISPLAY = Object.freeze({
  oeuf: "Œufs", yaourt: "Yaourts", pain: "Pains", pomme: "Pommes",
  lait: "Lait", puree: "Purée", pate: "Pâtes", gouter: "Goûters",
  cornichon: "Cornichons", lentille: "Lentilles", biscuit: "Biscuits",
  farine: "Farine", chocolat: "Chocolat", emmental: "Emmental", sac: "Sacs",
  gouda: "Gouda", feuillete: "Feuilletés", sauce: "Sauce",
  tomate: "Tomates", boisson: "Boissons", mouchoir: "Mouchoirs",
  cereale: "Céréales", cafe: "Café", the: "Thé", rape: "râpé",
  creme: "crème", ecreme: "écrémé",
})

const QUALIFIED_LABELS = Object.freeze({
  "pomme terre": "Pommes de terre",
  "pomme granny": "Pommes Granny",
  "pain lait": "Pains au lait",
  "pain chocolat": "Pains au chocolat",
  "pain mie": "Pain de mie",
  "pate tartiner": "Pâte à tartiner",
  "lait demi": "Lait demi-écrémé",
  "lait ecreme": "Lait écrémé",
  "chocolat poudre": "Chocolat en poudre",
})

function genericName(words) {
  const exact = QUALIFIED_LABELS[words.join(" ")]
  if (exact) return exact
  return words.map((word, i) => DISPLAY[word] || (i ? word : word[0].toUpperCase() + word.slice(1))).join(" ")
}

function classifiedFamily(item = {}) {
  const name = item.product_name || item.corrected_name || item.normalized_name || ""
  const original = normalizedText(name)
  if (!original || DEPARTMENTS.has(original)) return null

  const tokens = productTokens(name)
  if (!tokens.length) return null

  const special = CUSTOM_FAMILIES.find(rule => rule.matches(tokens, original))
  if (special) return { key: special.key, label: special.label }

  // Les titres OCR commencent parfois par la marque (Kokot, Eco+, etc.).
  // Chercher le premier terme produit connu au lieu de classer par marque.
  const firstAnchor = tokens.findIndex(token => PRODUCT_ANCHORS.has(token))
  const start = firstAnchor >= 0 ? firstAnchor : 0
  const head = tokens[start]
  if (!head) return null
  const length = UNQUALIFIED.has(head) ? 1 : 2
  const significant = tokens.slice(start, start + length)
  if (!significant.length || significant[0].length < 3) return null
  // Sans nom produit significatif, ne pas créer de famille à partir d'un
  // numéro isolé, d'une marque inconnue ou d'un libellé trop générique.
  if (firstAnchor < 0 && significant.length < 2) return null
  return {
    key: "auto:" + significant.join("-"),
    label: genericName(significant),
  }
}

export function identifyShoppingHabitFamily(item = {}) {
  return classifiedFamily(item)?.key || null
}

function positiveMoney(value) {
  const amount = Number(String(value ?? "").replace(",", "."))
  return Number.isFinite(amount) && amount > 0 ? amount : 0
}

function roundMoney(amount) {
  return Math.round((amount + Number.EPSILON) * 100) / 100
}

function ticketKey(item = {}) {
  return String(item.receipt_id || item.transaction_id || "").trim()
}

export function buildShoppingHabitFamilies(items = []) {
  const groups = new Map()
  for (const item of Array.isArray(items) ? items : []) {
    const familyInfo = classifiedFamily(item)
    const label = String(item.product_name || item.corrected_name || "").trim()
    const price = positiveMoney(item.price)
    if (!familyInfo || !label || !price || item.needs_review === true) continue

    let family = groups.get(familyInfo.key)
    if (!family) {
      family = {
        key: familyInfo.key,
        label: familyInfo.label,
        purchaseCount: 0,
        totalSpent: 0,
        receiptKeys: new Set(),
        variantsByName: new Map(),
      }
      groups.set(familyInfo.key, family)
    }
    family.purchaseCount += 1
    family.totalSpent += price

    const visit = ticketKey(item)
    if (visit) family.receiptKeys.add(visit)

    const variantKey = normalizedText(label)
    const variant = family.variantsByName.get(variantKey) || {
      label, purchaseCount: 0, totalSpent: 0,
    }
    variant.purchaseCount += 1
    variant.totalSpent += price
    family.variantsByName.set(variantKey, variant)
  }

  return [...groups.values()]
    // Les familles multiréférences complètent le top des produits identiques.
    // Ne pas créer une seconde liste de tous les achats isolés.
    .filter(group => group.variantsByName.size >= 2 && group.purchaseCount >= 2)
    .map(group => ({
      key: group.key,
      label: group.label,
      purchaseCount: group.purchaseCount,
      receiptCount: group.receiptKeys.size,
      totalSpent: roundMoney(group.totalSpent),
      variants: [...group.variantsByName.values()]
        .map(variant => ({ ...variant, totalSpent: roundMoney(variant.totalSpent) }))
        .sort((a, b) => b.purchaseCount - a.purchaseCount || b.totalSpent - a.totalSpent),
    }))
    .sort((a, b) => b.purchaseCount - a.purchaseCount || b.totalSpent - a.totalSpent)
}
