// Répartition des lignes de tickets en grandes familles de consommation.
// Un univers sert à comprendre ses dépenses ; ce n'est PAS un lien de
// catalogue et ne doit jamais servir à calculer une économie entre produits.
const GROUPS = Object.freeze([
  { key: "produce", label: "Fruits & légumes", icon: "apple" },
  { key: "treats", label: "Goûters & plaisirs", icon: "cookie" },
  { key: "dairy", label: "Laitages & œufs", icon: "milk" },
  { key: "proteins", label: "Viandes, poissons & végétal", icon: "fish" },
  { key: "pantry", label: "Épicerie & repas", icon: "shopping-basket" },
  { key: "breakfast", label: "Pain & petit-déjeuner", icon: "wheat" },
  { key: "drinks", label: "Boissons", icon: "glass-water" },
  { key: "household", label: "Maison & entretien", icon: "house" },
  { key: "care", label: "Hygiène & soins", icon: "droplets" },
  { key: "pets", label: "Animaux", icon: "paw-print" },
  { key: "other", label: "Autres achats à préciser", icon: "circle-help" },
])

const DEPARTMENT_ROWS = new Set([
  "boucherie coupe", "charcuterie ls", "cremerie", "epicerie sucree",
  "epicerie salee", "boissons sans alcool", "ultra frais",
  "fleurs plantes fruits legumes", "fruits legumes", "sous traitance", "ppi",
])

export function normalizeShoppingSpendingLabel(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/œ/gi, "oe")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function contains(text, pattern) {
  return pattern.test(text)
}

function categoryKey(text) {
  if (!text || DEPARTMENT_ROWS.has(text)) return null

  // Le libellé "alimentaire" est utilisé pour presque tous les tickets,
  // même des produits ménagers : ne jamais s'y fier pour la ventilation.
  if (contains(text, /\b(?:croq(?:uettes?)?|biskrok|fido|pedigree|pour chiens?|pour chats?|nourriture (?:chien|chat)|alim comp rich volail|funtastix)\b/)) return "pets"
  if (contains(text, /\b(?:lessive|poubelle|papier toilette|mouchoirs?|essuie tout|nettoyant(?:s)?|vaisselle|eponge|bicarbonate|detergent|desinfectant|sacs? poubelle|papier menage|papier cuisine)\b/)) return "household"
  if (contains(text, /\b(?:dentifrice|colgate|gel douche|shampooing|shampoing|cotons?|coloration|brosse(?:s)? (?:cheveux|demelage)|bouchons? oreilles?|deodorant|savon(?:s)?|creme visage|soins? cheveux)\b/)) return "care"

  // Produits transformés : ne pas assimiler compote, tomates en conserve,
  // fritures, pains aux fruits ou jus aux fruits/légumes frais.
  if (contains(text, /\b(?:compote(?:s)?|gouter(?:s)?|madeleine(?:s)?|biscuit(?:s)?|cookie(?:s)?|gateaux?|gaufrettes?|sables?|palets?|bonbons?|confiserie|oursons?|guimauve|chabrior goutak|chocolat(?:s)?|choco(?:lat)?|milka|kinder|snickers|croissants?|chaussons? pomme|pains? (?:au |aux )?chocolat|chips|cacahuetes? grillees?|pop corn|caramel|sucettes?|nougats?|barres? cereales?|barres? choco)\b/) &&
      !contains(text, /\b(?:chocolat en poudre|choco poudre|lait chocolat|boisson choco|cereales? petit dej|cereales? petit dejeuner)\b/)) return "treats"

  if (contains(text, /\b(?:jus|nectar|boisson(?:s)?|cola|coca|orangina|fanta|soda|eau (?:minerale|gazeuse)|vichy celestin|the glace|sirop|ginger shot|joker tetra|rean jus|rea jus|diego (?:ananas|mangue)|poulain|nesquik|chocolat en poudre)\b/) &&
      !contains(text, /\b(?:lait de chevre|lait demi|lait 1 2|lait uht|lait ecreme)\b/)) return "drinks"

  if (contains(text, /\b(?:lait|yaourts?|yogourts?|yoplait|fromage|emmental|gouda|mimolette|camembert|cheddar|maasdam|mozzarella|beurre|oeufs?|oeuf|creme anglaise|creme fraiche|tomme|petit benare|toastinette|ferme nature sucre)\b/) &&
      !contains(text, /\b(?:pains? au lait|pains? de lait|pain lait|lait de coco|lait de noisette|lait amande|pate a tartiner)\b/)) return "dairy"

  if (contains(text, /\b(?:poulet|thon|saumon|sardines?|merlu|espadon|crevettes?|camaron|escalopes?|steaks?|saucisses?|saucisson|jambon|galantine|fuet|coppa|rosette|rillettes?|vegetariens?|vege|veggie|nuggets?|knack|knaggies|porc|boeuf|viande|pave saumon)\b/) &&
      !contains(text, /\b(?:chips|cracker|biscuit|gouter|barre|sauce)\b/)) return "proteins"

  if (contains(text, /\b(?:pain de mie|pain mie|pain aux cereales|pain cereales|pain grille|p grille|pains? wrap|wraps?|pain hamburger|pain burger|brioche|petit pain|pains? au lait|pains? lait|cereales? petit|cereales? dej|muesli|cruesli|corn flakes|quaker|flocon(?:s)? avoine)\b/)) return "breakfast"

  // Les conserves, condiments et plats préparés passent avant les fruits/
  // légumes pour ne pas compter des tomates pelées comme du frais.
  if (contains(text, /\b(?:tomates? pelees?|puree (?:de )?tomate|coulis|tomacouli|sauce|macedoine|lentilles?|flageolets?|ma[iï]s|cornichons?|olives?|haricots? (?:verts?|blancs?|rouges?) (?:\d|bocal|boite)|riz|pates?|coquillettes?|farfalle|tagliatelle|serpentini|couscous|farine|huile|vinaigre|mayonnaise|mayo|ravioli|nouilles?|poelee|frites?|frite|curry|chapelure|sel fin|oignons? rustica|poelee wok|pizza|burger|tourte|tortillas?|petits? pois|salsifis|champignons? noirs?|tuc|crackers? sales?|quatre compotes)\b/)) return "pantry"

  if (contains(text, /\b(?:pommes? de terre|pomme granny|granny smith|pommes? (?:reunion|france|afrique)|bananes?|raisins?|kiwi|ananas frais|mangues?|citrons?|oranges?|fruits? frais|carottes?|concombres?|brocolis?|epinards?|salades?|batavia|choux? de bruxelles|choux?|courgettes?|poivrons?|echalotes?|oignons? rouges?|oignons? frais|avocats?|tomates? fraiches?|tomates? grappe|patates? douces?|litchis?|letchis?|past[eè]ques?|melons?|fraises?|aubergines?|poireaux?|fruits? de la reunion)\b/)) return "produce"

  // Marque/produit inconnu : une classification incertaine ne devient pas
  // une conclusion sur les habitudes alimentaires de la personne.
  return "other"
}

export function classifyShoppingSpendingCategory(item = {}) {
  const name = item.product_name || item.corrected_name || item.normalized_name || ""
  return categoryKey(normalizeShoppingSpendingLabel(name))
}

function money(value) {
  const n = Number(String(value ?? 0).replace(",", "."))
  return Number.isFinite(n) && n > 0 ? n : 0
}

function roundCents(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function receipt(item) {
  return String(item.receipt_id || item.transaction_id || "").trim()
}

function isProductRow(item) {
  if (item?.needs_review === true) return false
  if (item?.line_type && item.line_type !== "product") return false
  if (item?.item_status === "rejected" || item?.status === "rejected") return false
  return true
}

const SUGGESTIONS = Object.freeze({
  treats: "Pour les achats répétés, comparez les formats et le prix au kilo. L'application ne présume pas de votre consommation réelle.",
  produce: "Comparer les fruits et légumes de saison et leur prix au kilo peut être utile lors de vos prochaines courses.",
  dairy: "Pour le lait et les produits frais, regardez le prix au litre ou à la pièce avant de comparer deux formats.",
  proteins: "Comparer le prix au kilo et les conditionnements peut aider à choisir parmi vos produits habituels.",
  pantry: "Les produits achetés souvent méritent une comparaison au kilo ou au litre, entre formats identiques.",
  breakfast: "Pour les produits du quotidien, comparez le prix au kilo et les formats que vous utilisez réellement.",
  drinks: "Comparer les grands formats au litre peut être utile, sans supposer qu'ils correspondent à vos besoins.",
  household: "Pour l'entretien, comparez les prix par usage ou par quantité lorsqu'ils sont disponibles.",
  care: "Pour l'hygiène, les formats et les prix à l'unité peuvent aider à comparer vos achats.",
  pets: "Pour vos animaux, comparez le prix au kilo de références adaptées, sans changer leur alimentation sur le seul critère du prix.",
})

export function buildShoppingSpendingSummary(items = []) {
  const groups = new Map()
  let totalSpent = 0
  let purchaseCount = 0
  const allReceipts = new Set()

  for (const item of Array.isArray(items) ? items : []) {
    const key = classifyShoppingSpendingCategory(item)
    const price = money(item?.price)
    if (!key || !price || !isProductRow(item)) continue
    const descriptor = GROUPS.find(entry => entry.key === key)
    let group = groups.get(key)
    if (!group) {
      group = {
        key, label: descriptor.label, icon: descriptor.icon,
        purchaseCount: 0, totalSpent: 0,
        receiptIds: new Set(), products: new Map(),
      }
      groups.set(key, group)
    }
    purchaseCount += 1
    totalSpent += price
    group.purchaseCount += 1
    group.totalSpent += price
    const id = receipt(item)
    if (id) {
      allReceipts.add(id)
      group.receiptIds.add(id)
    }
    const label = String(item.product_name || item.corrected_name || item.normalized_name || "").trim()
    const normalized = normalizeShoppingSpendingLabel(label)
    const variant = group.products.get(normalized) || { label, purchaseCount: 0, spent: 0 }
    variant.purchaseCount += 1
    variant.spent += price
    group.products.set(normalized, variant)
  }
  const total = roundCents(totalSpent)
  const categories = [...groups.values()].map(group => ({
    key: group.key,
    label: group.label,
    icon: group.icon,
    purchaseCount: group.purchaseCount,
    receiptCount: group.receiptIds.size,
    spent: roundCents(group.totalSpent),
    sharePercent: total ? Math.round(100 * group.totalSpent / total) : 0,
    suggestedAction: group.key !== "other" && group.receiptIds.size >= 2 && group.purchaseCount >= 3
      ? SUGGESTIONS[group.key] || null
      : null,
    products: [...group.products.values()]
      .map(row => ({ ...row, spent: roundCents(row.spent) }))
      .sort((a, b) => b.spent - a.spent || b.purchaseCount - a.purchaseCount),
  })).sort((a, b) =>
    (a.key === "other" ? 1 : 0) - (b.key === "other" ? 1 : 0) ||
    b.spent - a.spent || a.label.localeCompare(b.label, "fr"),
  )
  const classifiedSpent = roundCents(total - (categories.find(row => row.key === "other")?.spent || 0))
  return {
    totalSpent: total,
    classifiedSpent,
    classificationPercent: total ? Math.round(100 * classifiedSpent / total) : 0,
    purchaseCount,
    receiptCount: allReceipts.size,
    categories,
  }
}
