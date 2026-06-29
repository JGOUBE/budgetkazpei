import { buildStoreHabits, buildTopProducts } from "../../features/shopping/services/priceHistory"
import { isWithinPeriod, moneyValue } from "./statisticsFormatters"

export function buildStatisticsInsights({
  transactions = [],
  stats = {},
  byCategory = [],
  shoppingItems = [],
  receipts = [],
  period = "month",
}: {
  transactions?: any[]
  stats?: any
  byCategory?: any[]
  shoppingItems?: any[]
  receipts?: any[]
  period?: string
}) {
  const periodTransactions = transactions.filter(tx => isWithinPeriod(tx.date, period))
  const periodExpenses = periodTransactions.filter(tx => moneyValue(tx.amount) < 0)
  const totalExpenses = periodExpenses.reduce((sum, tx) => sum + Math.abs(moneyValue(tx.amount)), 0)
  const revenus = moneyValue(stats.revenus)
  const remaining = revenus - totalExpenses
  const budgetUse = revenus > 0 ? Math.round((totalExpenses / revenus) * 100) : 0
  const periodShopping = shoppingItems.filter(item => isWithinPeriod(item.created_at, period))
  const periodReceipts = receipts.filter(row => isWithinPeriod(row.purchase_date || row.created_at, period))
  const basketAverage = periodReceipts.length
    ? periodReceipts.reduce((sum, row) => sum + moneyValue(row.total_amount), 0) / periodReceipts.length
    : 0

  const categoryData = [...(byCategory || [])]
    .filter(cat => moneyValue(cat.depense) > 0)
    .map(cat => ({
      ...cat,
      percent: totalExpenses > 0 ? Math.round((moneyValue(cat.depense) / totalExpenses) * 100) : 0,
    }))
    .sort((a, b) => moneyValue(b.depense) - moneyValue(a.depense))

  return {
    monthly: {
      totalExpenses,
      revenus,
      remaining,
      budgetUse,
    },
    categories: categoryData,
    weeklyEvolution: buildWeeklyEvolution(periodExpenses),
    courses: {
      receiptsCount: periodReceipts.length,
      productsCount: periodShopping.length,
      basketAverage,
      topProduct: buildTopProducts(periodShopping, 1)[0] || null,
    },
    stores: buildStoreHabits(periodShopping),
    topProducts: buildTopProducts(periodShopping, 8),
  }
}

function buildWeeklyEvolution(expenses: any[] = []) {
  const weeks = [0, 0, 0, 0, 0]

  expenses.forEach(tx => {
    const date = new Date(tx.date)
    const weekIndex = Math.min(4, Math.floor((date.getDate() - 1) / 7))
    weeks[weekIndex] += Math.abs(moneyValue(tx.amount))
  })

  return weeks.map((amount, index) => ({
    label: `Semaine ${index + 1}`,
    amount,
  }))
}
