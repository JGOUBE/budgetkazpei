// utils/calculateBudget.js
export function calculateBudgetStats(transactions) {
  const revenus  = transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const depenses = transactions.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const solde    = revenus - depenses;
  return { revenus, depenses, solde };
}

export function calculateByCategory(transactions, categories) {
  return categories.map(cat => {
    const total = transactions
      .filter(t => t.category === cat.id)
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    return { ...cat, depense: total };
  });
}