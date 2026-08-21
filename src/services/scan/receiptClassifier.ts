const CATEGORY_RULES = [
  {
    type: "fuel",
    category: "transport",
    keywords: ["station", "carburant", "essence", "gazole", "diesel", "totalenergies", "shell", "vito"],
  },
  {
    type: "pharmacy",
    category: "sante",
    keywords: ["pharmacie", "parapharmacie", "medicament", "ordonnance"],
  },
  {
    type: "restaurant",
    category: "loisirs",
    keywords: ["restaurant", "snack", "burger", "pizza", "kfc", "mcdonald", "fast food"],
  },
  {
    type: "home",
    category: "logement",
    keywords: ["bricolage", "leroy", "mr bricolage", "jardin", "maison"],
  },
  {
    type: "clothing",
    category: "divers",
    keywords: ["vetement", "textile", "chaussure", "mode", "kiabi", "decathlon"],
  },
  {
    type: "ecommerce",
    category: "divers",
    keywords: ["amazon", "cdiscount", "commande", "livraison", "e commerce"],
  },
  {
    type: "grocery",
    category: "alimentaire",
    keywords: [
      "leader price",
      "leclerc",
      "carrefour",
      "super u",
      "hyper u",
      "lidl",
      "score",
      "jumbo",
      "run market",
      "intermarche",
      "alimentaire",
      "epicerie",
      "boulangerie",
      "cremerie",
    ],
  },
]

const FOOD_CATEGORY_ALIASES = [
  "alimentaire",
  "food",
  "grocery",
  "groceries",
  "course",
  "courses",
  "epicerie",
  "boulangerie",
  "cremerie",
]

const FOOD_ITEM_KEYWORDS = [
  "pain",
  "baguette",
  "brioche",
  "gateau",
  "biscuit",
  "cereale",
  "farine",
  "pate",
  "pates",
  "riz",
  "semoule",
  "lentille",
  "haricot",
  "pois",
  "cornichon",
  "mayonnaise",
  "sauce",
  "huile",
  "vinaigre",
  "lait",
  "creme",
  "yaourt",
  "fromage",
  "emmental",
  "mimolette",
  "beurre",
  "oeuf",
  "poulet",
  "boeuf",
  "porc",
  "saucisse",
  "jambon",
  "coppa",
  "thon",
  "merlu",
  "poisson",
  "saumon",
  "pomme",
  "banane",
  "orange",
  "citron",
  "tomate",
  "carotte",
  "brocoli",
  "legume",
  "fruit",
  "compote",
  "jus",
  "boisson",
  "sirop",
  "eau",
  "cafe",
  "the",
  "chocolat",
  "bonbon",
  "confiserie",
  "nouille",
  "ravioli",
  "wrap",
  "pizza",
  "sandwich",
]

function normalize(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function containsKeyword(text = "", keyword = "") {
  const normalizedText = ` ${normalize(text)} `
  const normalizedKeyword = normalize(keyword)
  if (!normalizedKeyword) return false
  return normalizedText.includes(` ${normalizedKeyword} `)
}

function containsAny(text = "", keywords = []) {
  return keywords.some(keyword => containsKeyword(text, keyword))
}

function getItems(receipt = {}) {
  return Array.isArray(receipt?.items) ? receipt.items.filter(Boolean) : []
}

function itemCategoryText(item = {}) {
  return normalize([item.category, item.department, item.subcategory].filter(Boolean).join(" "))
}

function itemProductText(item = {}) {
  return normalize([
    item.name,
    item.corrected_name,
    item.ocr_name,
    item.normalized_name,
    item.department,
  ].filter(Boolean).join(" "))
}

function isExplicitFoodItem(item = {}) {
  const categoryText = itemCategoryText(item)
  if (FOOD_CATEGORY_ALIASES.some(alias => containsKeyword(categoryText, alias))) return true

  return containsAny(itemProductText(item), FOOD_ITEM_KEYWORDS)
}

function matchesRuleCategory(item = {}, rule) {
  const categoryText = itemCategoryText(item)
  if (!categoryText) return false

  if (rule.type === "grocery") {
    return FOOD_CATEGORY_ALIASES.some(alias => containsKeyword(categoryText, alias))
  }

  return containsKeyword(categoryText, rule.category)
}

function scoreRule(rule, receipt, items) {
  const merchantText = normalize([receipt.store_name, receipt.merchant_name].filter(Boolean).join(" "))
  const ocrText = normalize(receipt.ocr_text || "")

  const merchantMatched = rule.keywords.some(keyword => containsKeyword(merchantText, keyword))
  const ocrMatched = rule.keywords.some(keyword => containsKeyword(ocrText, keyword))

  let structuredMatches = 0
  let itemKeywordMatches = 0

  for (const item of items) {
    if (matchesRuleCategory(item, rule)) structuredMatches += 1

    const productText = itemProductText(item)
    if (rule.keywords.some(keyword => containsKeyword(productText, keyword))) {
      itemKeywordMatches += 1
    }
  }

  // Le magasin est un signal utile, mais il ne doit jamais écraser à lui seul
  // une forte majorité d'articles d'une autre nature.
  const score =
    (merchantMatched ? 10 : 0)
    + (ocrMatched ? 2 : 0)
    + (structuredMatches * 6)
    + Math.min(itemKeywordMatches, 8)

  return {
    rule,
    score,
    merchantMatched,
    structuredMatches,
    itemKeywordMatches,
  }
}

export function classifyReceipt(receipt: any = {}) {
  const items = getItems(receipt)

  const foodLikeCount = items.filter(item => isExplicitFoodItem(item)).length
  const minimumFoodEvidence = items.length <= 4 ? 2 : 3
  const foodRatio = items.length > 0 ? foodLikeCount / items.length : 0

  // Une majorité claire d'articles alimentaires est une preuve plus forte
  // qu'un mot isolé comme "maison" ou "jardin" dans l'OCR ou sur une ligne.
  const strongFoodEvidence =
    foodLikeCount >= minimumFoodEvidence
    && foodRatio >= 0.5

  if (strongFoodEvidence) {
    return {
      ticket_type: "grocery",
      budget_category: "alimentaire",
      is_food_ticket: true,
      confidence: "strong",
      classification_source: "item_majority",
      should_override_existing: true,
      evidence: {
        item_count: items.length,
        food_like_count: foodLikeCount,
        food_ratio: foodRatio,
      },
    }
  }

  const scored = CATEGORY_RULES
    .map(rule => scoreRule(rule, receipt, items))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      if (b.structuredMatches !== a.structuredMatches) return b.structuredMatches - a.structuredMatches
      if (Number(b.merchantMatched) !== Number(a.merchantMatched)) {
        return Number(b.merchantMatched) - Number(a.merchantMatched)
      }
      return 0
    })

  const winner = scored[0]
  if (!winner || winner.score <= 0) {
    return {
      ticket_type: "other",
      budget_category: "divers",
      is_food_ticket: false,
      confidence: "weak",
      classification_source: "no_evidence",
      should_override_existing: false,
      evidence: {
        item_count: items.length,
        food_like_count: foodLikeCount,
        food_ratio: foodRatio,
      },
    }
  }

  const strongStructuredEvidence =
    winner.structuredMatches >= 2
    && items.length > 0
    && (winner.structuredMatches / items.length) >= 0.5

  return {
    ticket_type: winner.rule.type,
    budget_category: winner.rule.category,
    is_food_ticket: winner.rule.type === "grocery",
    confidence: strongStructuredEvidence || winner.score >= 12 ? "strong" : "medium",
    classification_source: strongStructuredEvidence
      ? "structured_items"
      : winner.merchantMatched
        ? "merchant_and_content"
        : "content_score",
    // On ne remplace une classification déjà enregistrée que si le contenu
    // structuré apporte une preuve forte. Un simple nom d'enseigne ne suffit pas.
    should_override_existing: strongStructuredEvidence,
    evidence: {
      item_count: items.length,
      food_like_count: foodLikeCount,
      food_ratio: foodRatio,
      winning_score: winner.score,
      structured_matches: winner.structuredMatches,
      merchant_matched: winner.merchantMatched,
    },
  }
}