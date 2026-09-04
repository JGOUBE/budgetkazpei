function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null
  const number = Number(String(value).replace(",", "."))
  return Number.isFinite(number) ? number : null
}

function isoDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null
}

export function buildBudgetAdvisorContext(insights = {}) {
  const inputs = insights.budgetInputs || {}
  const current = insights.currentMonth || {}
  const previous = insights.previousMonth || {}
  const dataUsed = insights.dataUsed || {}
  const hasCurrentTransactions = numberOrNull(dataUsed.transactionsCount) > 0
  const hasPreviousTransactions = numberOrNull(dataUsed.previousTransactionsCount) > 0
  const categories = Array.isArray(current.categories) ? current.categories : []
  const reliableSuggestions = Array.isArray(insights.savings?.suggestions)
    ? insights.savings.suggestions
    : []

  const context = {
    period: {
      startsAt: isoDate(insights.ranges?.current?.start),
      endsBefore: isoDate(insights.ranges?.current?.end),
    },
    income: inputs.income ?? (hasCurrentTransactions ? numberOrNull(current.incomes) : null),
    fixedExpenses: inputs.fixedExpenses ?? null,
    variableExpenses: inputs.variableExpenses ?? null,
    spendingByCategory: categories.map(category => ({
      id: category.id,
      amount: numberOrNull(category.amount),
      budget: numberOrNull(category.budget),
    })),
    grocerySpend: categories.some(category => category.id === "alimentaire")
      ? numberOrNull(current.foodExpenses)
      : null,
    previousPeriodComparison: hasPreviousTransactions
      ? {
          currentExpenses: numberOrNull(current.expenses),
          previousExpenses: numberOrNull(previous.expenses),
          difference: numberOrNull(current.expenses) - numberOrNull(previous.expenses),
        }
      : null,
    availableBalance: inputs.availableBalance ?? null,
    recurringCharges: null,
    unusualExpenses: null,
    shoppingSavings: reliableSuggestions.length > 0
      ? {
          source: "historical_observations",
          currentPromotionsIntegrated: false,
          totalReliablePotential: numberOrNull(insights.savings?.totalPotential),
          comparableProductsCount: reliableSuggestions.length,
        }
      : null,
    dataCompleteness: {
      transactions: hasCurrentTransactions,
      previousPeriod: hasPreviousTransactions,
      income: inputs.income !== null && inputs.income !== undefined,
      fixedExpenses: inputs.fixedExpenses !== null && inputs.fixedExpenses !== undefined,
      variableExpenses: inputs.variableExpenses !== null && inputs.variableExpenses !== undefined,
      categories: categories.length > 0,
      grocerySpend: categories.some(category => category.id === "alimentaire"),
      recurringCharges: false,
      unusualExpenses: false,
      currentShoppingPromotions: false,
    },
  }

  context.dataCompleteness.missing = Object.entries(context.dataCompleteness)
    .filter(([, available]) => available === false)
    .map(([field]) => field)

  return context
}
