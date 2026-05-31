import { useMemo } from "react";
import { CATEGORIES } from "../data/categories";
import { calculateBudgetStats, calculateByCategory } from "../utils/calculateBudget";

export function useBudgets(transactions) {
  const stats = useMemo(() => calculateBudgetStats(transactions), [transactions]);
  const byCategory = useMemo(() => calculateByCategory(transactions, CATEGORIES), [transactions]);

  const pieData = byCategory
    .filter(c => c.depense > 0)
    .map(c => ({ name: c.id, value: c.depense, color: c.color }));

  return { ...stats, byCategory, pieData };
}
