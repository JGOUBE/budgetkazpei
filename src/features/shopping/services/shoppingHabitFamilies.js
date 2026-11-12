// Regroupements pour les habitudes uniquement : ces familles ne sont
// jamais des identités commerciales ni des références de prix comparables.
// Un pack 6 x 1 L et une brique de 1 L ne deviennent pas un même produit.
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

const FAMILY_RULES = Object.freeze([
  {
    key: "goat-milk",
    label: "Lait de chèvre",
    matches: text =>
      /\blait (?:de )?chev(?:re|ure)\b/.test(text) &&
      !/\b(?:fromage|yaourt|yogourt|savon|creme|dessert|pains?)\b/.test(text),
  },
  {
    key: "chocolate-tablets",
    label: "Chocolat en tablette",
    matches: text =>
      /^(?:tab(?:lette)? (?:de )?(?:chocolat|choco|choc|milka)\b|chocolat (?:noir|au lait|blanc|dessert)\b)/.test(text) &&
      !/\b(?:biscuit|cereale|poudre|boisson|barres?|cacao soluble|glace|cones?)\b/.test(text),
  },
])

export function identifyShoppingHabitFamily(item = {}) {
  const label = normalizedText(item.product_name || item.corrected_name || item.normalized_name || "")
  if (!label) return null
  return FAMILY_RULES.find(rule => rule.matches(label))?.key || null
}

function positiveMoney(value) {
  const amount = Number(String(value ?? "").replace(",", "."))
  return Number.isFinite(amount) && amount > 0 ? amount : 0
}

function roundMoney(amount) {
  return Math.round((amount + Number.EPSILON) * 100) / 100
}

function ticketKey(item = {}) {
  const direct = String(item.receipt_id || item.transaction_id || "").trim()
  if (direct) return direct
  // Sans ID de ticket, la date ne représente pas un nombre de passages
  // suffisamment fiable : ne pas prétendre connaître les tickets distincts.
  return ""
}

export function buildShoppingHabitFamilies(items = []) {
  const groups = new Map()

  for (const item of Array.isArray(items) ? items : []) {
    const familyKey = identifyShoppingHabitFamily(item)
    const label = String(item.product_name || item.corrected_name || "").trim()
    const price = positiveMoney(item.price)
    if (!familyKey || !label || !price || item.needs_review === true) continue

    const rule = FAMILY_RULES.find(entry => entry.key === familyKey)
    let family = groups.get(familyKey)
    if (!family) {
      family = { key: familyKey, label: rule.label, purchaseCount: 0, totalSpent: 0, receiptKeys: new Set(), variantsByName: new Map() }
      groups.set(familyKey, family)
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
    // Ces regroupements apportent de la valeur si plusieurs désignations
    // coexistent ; sinon la liste des produits précis les couvre déjà.
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
