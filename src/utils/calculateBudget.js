function normalizeCategorie(categorie) {
  const value = String(categorie || "").toLowerCase().trim()

  if (["electricity", "energie", "énergie", "edf", "energy"].includes(value)) return "energie"
  if (["internet", "mobile", "telephone", "téléphone", "telecom", "zeop", "only"].includes(value)) return "telecom"
  if (["water", "eau", "cinor"].includes(value)) return "logement"
  if (["streaming", "netflix", "loisirs"].includes(value)) return "loisirs"
  if (["sante", "santé", "mutuelle"].includes(value)) return "sante"
  if (["transport"].includes(value)) return "transport"
  if (["alimentaire"].includes(value)) return "alimentaire"

  return "divers"
}

function safeNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function safeArray(value) {
  return Array.isArray(value) ? value : []
}

function getCustomBudgetForCategory(customBudgets, categoryId, defaultBudget) {
  const found = safeArray(customBudgets).find(item => item.category === categoryId)
  const value = safeNumber(found?.amount)

  if (value >= 0 && found) return value

  return safeNumber(defaultBudget)
}

export function calculateBudgetStats(transactions, abonnements = []) {
  const safeTransactions = safeArray(transactions)
  const safeAbonnements = safeArray(abonnements)

  const revenus = safeTransactions
    .filter(t => safeNumber(t?.amount) > 0)
    .reduce((s, t) => s + safeNumber(t?.amount), 0)

  const depensesVariables = safeTransactions
    .filter(t => safeNumber(t?.amount) < 0)
    .reduce((s, t) => s + Math.abs(safeNumber(t?.amount)), 0)

  const chargesFixes = safeAbonnements
    .reduce((s, abonnement) => s + safeNumber(abonnement?.montant), 0)

  const depenses = depensesVariables + chargesFixes
  const solde = revenus - depenses
  const resteAVivre = revenus - chargesFixes - depensesVariables
  const tauxChargesFixes = revenus > 0 ? Math.round((chargesFixes / revenus) * 100) : 0

  return {
    revenus,
    depenses,
    solde,
    chargesFixes,
    depensesVariables,
    resteAVivre,
    tauxChargesFixes,
  }
}

export function calculateByCategory(transactions, categories, abonnements = [], customBudgets = []) {
  const safeTransactions = safeArray(transactions)
  const safeCategories = safeArray(categories)
  const safeAbonnements = safeArray(abonnements)
  const safeCustomBudgets = safeArray(customBudgets)

  return safeCategories.map(cat => {
    const depensesTransactions = safeTransactions
      .filter(t => t?.category === cat.id)
      .reduce((s, t) => s + Math.abs(safeNumber(t?.amount)), 0)

    const depensesAbonnements = safeAbonnements
      .filter(abonnement => normalizeCategorie(abonnement?.categorie) === cat.id)
      .reduce((s, abonnement) => s + safeNumber(abonnement?.montant), 0)

    const budget = getCustomBudgetForCategory(safeCustomBudgets, cat.id, cat.budget)

    return {
      ...cat,
      budget,
      depense: depensesTransactions + depensesAbonnements,
      isCustomBudget: safeCustomBudgets.some(item => item.category === cat.id),
    }
  })
}