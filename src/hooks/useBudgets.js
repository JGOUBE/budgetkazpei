import { useMemo } from "react"
import { CATEGORIES } from "../data/categories"
import { calculateBudgetStats, calculateByCategory } from "../utils/calculateBudget"

function safeArray(value) {
  return Array.isArray(value) ? value : []
}

export function useBudgets(
  transactions,
  abonnements = [],
  customBudgets = []
) {
  const safeTransactions = safeArray(transactions)
  const safeAbonnements = safeArray(abonnements)
  const safeCustomBudgets = safeArray(customBudgets)

  const stats = useMemo(
    () => calculateBudgetStats(
      safeTransactions,
      safeAbonnements
    ),
    [safeTransactions, safeAbonnements]
  )

  const byCategory = useMemo(
    () =>
      calculateByCategory(
        safeTransactions,
        CATEGORIES,
        safeAbonnements,
        safeCustomBudgets
      ),
    [
      safeTransactions,
      safeAbonnements,
      safeCustomBudgets,
    ]
  )

  const pieData = byCategory
    .filter(c => Number(c.depense) > 0)
    .map(c => ({
      name: c.id,
      value: Number(c.depense) || 0,
      color: c.color,
    }))

  const budgetAlerts = byCategory
    .filter(
      c =>
        Number(c.budget) > 0 &&
        Number(c.depense) >= Number(c.budget)
    )
    .map(c => ({
      id: c.id,
      emoji: c.emoji,
      depense: Number(c.depense) || 0,
      budget: Number(c.budget) || 0,
      over:
        (Number(c.depense) || 0) -
        (Number(c.budget) || 0),
      color: c.color,
    }))

  return {
    ...stats,
    byCategory,
    pieData,
    budgetAlerts,
  }
}