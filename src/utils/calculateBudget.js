function normalizeCategorie(categorie) {
  const value = String(categorie || "").toLowerCase()

  if (["electricity", "energie", "edf", "energy"].includes(value)) return "energie"
  if (["internet", "mobile", "telephone", "téléphone", "telecom", "zeop", "only"].includes(value)) return "telecom"
  if (["water", "eau", "cinor"].includes(value)) return "logement"
  if (["streaming", "netflix", "loisirs"].includes(value)) return "loisirs"
  if (["sante", "santé", "mutuelle"].includes(value)) return "sante"
  if (["transport"].includes(value)) return "transport"
  if (["alimentaire"].includes(value)) return "alimentaire"

  return "divers"
}

export function calculateBudgetStats(transactions, abonnements = []) {
  const revenus = transactions
    .filter(t => Number(t.amount) > 0)
    .reduce((s, t) => s + Number(t.amount), 0)

  const depensesVariables = transactions
    .filter(t => Number(t.amount) < 0)
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0)

  const chargesFixes = abonnements
    .reduce((s, abonnement) => s + (Number(abonnement.montant) || 0), 0)

  const depenses = depensesVariables + chargesFixes
  const solde = revenus - depenses
  const resteAVivre = revenus - chargesFixes - depensesVariables
  const tauxChargesFixes = revenus > 0 ? Math.round((chargesFixes / revenus) * 100) : 0

  return { revenus, depenses, solde, chargesFixes, depensesVariables, resteAVivre, tauxChargesFixes }
}

export function calculateByCategory(transactions, categories, abonnements = []) {
  return categories.map(cat => {
    const depensesTransactions = transactions
      .filter(t => t.category === cat.id)
      .reduce((s, t) => s + Math.abs(Number(t.amount)), 0)

    const depensesAbonnements = abonnements
      .filter(abonnement => normalizeCategorie(abonnement.categorie) === cat.id)
      .reduce((s, abonnement) => s + (Number(abonnement.montant) || 0), 0)

    return { ...cat, depense: depensesTransactions + depensesAbonnements }
  })
}