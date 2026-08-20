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
})

export function resolveAppSectionTarget(value) {
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
