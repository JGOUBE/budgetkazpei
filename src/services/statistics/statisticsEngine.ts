import { buildStoreHabits, buildTopProducts } from "../../features/shopping/services/priceHistory"
import { isWithinPeriod, moneyValue } from "./statisticsFormatters"

function normalizeCategoryId(value = "") {
  const clean = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  if (["alimentation", "alimentaire", "courses", "supermarche", "supermarches"].includes(clean)) return "alimentaire"
  if (clean.includes("energie") || clean.includes("electricite") || clean.includes("eau")) return "energie"
  if (clean.includes("logement") || clean.includes("loyer")) return "logement"
  if (clean.includes("transport") || clean.includes("essence") || clean.includes("carburant")) return "transport"
  if (clean.includes("loisir")) return "loisirs"
  if (clean.includes("sante")) return "sante"
  return clean || "divers"
}

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
      id: normalizeCategoryId(cat.id || cat.category || cat.label),
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
  const weeks = [0, 0, 0, 0, 0].map((_, index) => ({
    label: `Semaine ${index + 1}`,
    amount: 0,
    categoryKeys: [] as string[],
  }))
  const categoryKeys = new Set<string>()

  expenses.forEach(tx => {
    const date = new Date(tx.date)
    const weekIndex = Math.min(4, Math.floor((date.getDate() - 1) / 7))
    const amount = Math.abs(moneyValue(tx.amount))
    const category = normalizeCategoryId(tx.category || tx.categoryKey || tx.budget_category || "divers")

    weeks[weekIndex].amount += amount
    ;(weeks[weekIndex] as any)[category] = moneyValue((weeks[weekIndex] as any)[category]) + amount
    if (amount > 0) {
      categoryKeys.add(category)
      if (!weeks[weekIndex].categoryKeys.includes(category)) weeks[weekIndex].categoryKeys.push(category)
    }
  })

  return weeks.map(week => ({
    ...week,
    allCategoryKeys: Array.from(categoryKeys),
  }))
}
