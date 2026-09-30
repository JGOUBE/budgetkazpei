const PERSONAL_CARE_WORDS = new Set([
  "corporel", "corporelle", "corps", "visage", "peau", "hydratant", "hydratante",
  "demaquillant", "demaquillante", "cosmetique", "beaute", "toilette",
])

const BEVERAGE_WORDS = new Set([
  "jus", "boisson", "nectar", "smoothie", "soda", "cidre", "sirop",
])

const PROCESSED_FRUIT_WORDS = new Set([
  "compote", "puree", "coulis", "confiture", "gelee", "dessert",
])

const FRESH_PRODUCE_WORDS = new Set([
  "pomme", "poire", "banane", "orange", "citron", "mangue", "ananas", "fraise",
  "tomate", "carotte", "courgette", "aubergine", "salade", "oignon", "ail",
  "avocat", "concombre", "poivron", "chou", "haricot", "patate",
])

const GENERIC_CATEGORIES = new Set([
  "", "alimentaire", "alimentation", "epicerie", "shopping", "autre", "divers",
])

export function normalizeShoppingProductText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function tokens(value = "") {
  return normalizeShoppingProductText(value).split(" ").filter(Boolean)
}

function hasAny(words, candidates) {
  return words.some(word => candidates.has(word))
}

function productText(product = {}) {
  return [
    product.name,
    product.label,
    product.product_name,
    product.productName,
    product.normalized_product_name,
    product.normalizedProductName,
    product.category,
    product.subcategory,
    product.department,
  ].filter(Boolean).join(" ")
}

export function getShoppingProductDomain(product = {}) {
  const value = typeof product === "string" ? product : productText(product)
  const clean = normalizeShoppingProductText(value)
  const productWords = tokens(clean)

  if (hasAny(productWords, PERSONAL_CARE_WORDS)) return "personal_care"
  if (hasAny(productWords, BEVERAGE_WORDS)) return "beverage"
  if (hasAny(productWords, PROCESSED_FRUIT_WORDS)) return "processed_fruit"
  if (productWords.includes("lait")) return "food_milk"
  if (clean.includes("pomme de terre")) return "fresh_produce"
  if (hasAny(productWords, FRESH_PRODUCE_WORDS)) return "fresh_produce"
  return ""
}

function explicitCategory(product = {}) {
  if (!product || typeof product === "string") return ""
  const category = normalizeShoppingProductText(
    product.category || product.subcategory || product.department || "",
  )
  return GENERIC_CATEGORIES.has(category) ? "" : category
}

export function areShoppingProductSemanticsCompatible(left = {}, right = {}) {
  const leftDomain = getShoppingProductDomain(left)
  const rightDomain = getShoppingProductDomain(right)
  if (leftDomain && rightDomain && leftDomain !== rightDomain) return false

  const leftCategory = explicitCategory(left)
  const rightCategory = explicitCategory(right)
  if (leftCategory && rightCategory && leftCategory !== rightCategory) return false

  return true
}

export function isShoppingSearchCandidateCompatible(query = "", candidate = {}) {
  if (!areShoppingProductSemanticsCompatible({ name: query }, candidate)) return false
  return Boolean(
    normalizeShoppingProductText(query) &&
    normalizeShoppingProductText(candidate.label || candidate.productName || candidate.product_name || candidate.name || ""),
  )
}
