export const APP_SECTION_NAVIGATION_EVENT = "budgetkazpei:navigate"

const SECTION_ALIASES = Object.freeze({
  "liste-de-courses": { section: "shopping", shoppingTab: "list" },
  "mes-economies": { section: "shopping", shoppingTab: "savings" },
  financeAssistant: { section: "conseiller", advisorMode: "budget_depenses" },
  finance_assistant: { section: "conseiller", advisorMode: "budget_depenses" },
  monAssistant: { section: "conseiller", advisorMode: "budget_depenses" },
  "mon-assistant": { section: "conseiller", advisorMode: "budget_depenses" },
  savings: { section: "shopping", shoppingTab: "savings" },
  shoppingList: { section: "shopping", shoppingTab: "list" },
  shopping_list: { section: "shopping", shoppingTab: "list" },
  promotions: { section: "goodDeals", goodDealsView: "product_promotion" },
  "promotions-pertinentes": { section: "goodDeals", goodDealsView: "product_promotion" },
})

export function resolveAppSectionTarget(value) {
  if (value && typeof value === "object") {
    const section = String(value.section || "").trim()
    return {
      requested: section,
      section: section || "dashboard",
      ...(value.shoppingTab ? { shoppingTab: value.shoppingTab } : {}),
      ...(value.advisorMode ? { advisorMode: value.advisorMode } : {}),
      ...(value.goodDealsView ? { goodDealsView: value.goodDealsView } : {}),
      ...(value.context ? { context: value.context } : {}),
      legacy: false,
    }
  }

  const raw = String(value || "").trim()
  const decoded = raw.replace(/^#?\/?(?:app\/)?/, "").split(/[?#]/)[0]
  const direct = SECTION_ALIASES[raw] || SECTION_ALIASES[decoded]
  if (direct) return { requested: raw, ...direct, legacy: true }

  if (["revenusDetails", "revenus-detail", "revenus-details"].includes(raw)) {
    return { requested: raw, section: "revenus", legacy: true }
  }
  if (["depensesDetails", "depenses-detail", "depenses-details"].includes(raw)) {
    return { requested: raw, section: "depenses", legacy: true }
  }
  if (["soldeDetails", "solde-detail", "solde-details"].includes(raw)) {
    return { requested: raw, section: "solde", legacy: true }
  }

  return { requested: raw, section: raw || "dashboard", legacy: false }
}

export function createAppSectionTarget(section, options = {}) {
  return resolveAppSectionTarget({ section, ...options })
}

export function resolveGoodDealsPromotionFocus(deals = [], context = null) {
  const promotionId = String(context?.promotionId || "").trim()
  if (!promotionId) return { mode: "normal", promotionId: "", deal: null }

  const deal = (Array.isArray(deals) ? deals : []).find(item => String(item?.id || "") === promotionId) || null
  return deal
    ? { mode: "promotion", promotionId, deal }
    : { mode: "fallback", promotionId, deal: null }
}

export function requestAppSectionNavigation(target, eventTarget = globalThis?.window) {
  if (!eventTarget?.dispatchEvent || typeof CustomEvent !== "function") return false
  eventTarget.dispatchEvent(new CustomEvent(APP_SECTION_NAVIGATION_EVENT, {
    detail: resolveAppSectionTarget(target),
  }))
  return true
}
