function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null
  const number = Number(String(value).replace(",", "."))
  return Number.isFinite(number) ? number : null
}

function rounded(value) {
  const number = numberOrNull(value)
  return number === null ? null : Math.round((number + Number.EPSILON) * 100) / 100
}

function positiveOrNull(value) {
  const number = numberOrNull(value)
  return number !== null && number > 0 ? rounded(number) : null
}

function safeArray(value) {
  return Array.isArray(value) ? value : []
}

function expenseAmount(transaction = {}) {
  const amount = numberOrNull(transaction.amount)
  return amount !== null && amount < 0 ? Math.abs(amount) : null
}

function transactionDate(transaction = {}) {
  return transaction.date || transaction.created_at || null
}

function transactionCategory(transaction = {}) {
  return transaction.categoryId || transaction.category || transaction.categorie || "divers"
}

function median(values = []) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right)
  if (sorted.length === 0) return null
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function incomeDetails(inputs = {}) {
  const details = inputs.incomeDetails
  if (!details || typeof details !== "object" || Array.isArray(details)) return []

  const rows = [
    ["Salaire parent 1", details.salaire_parent_1],
    ["Salaire parent 2", details.salaire_parent_2],
    ["France Travail", details.france_travail],
    ["Autres revenus", details.autres_revenus],
  ]
    .map(([label, value]) => ({ label, amount: positiveOrNull(value) }))
    .filter(row => row.amount !== null)

  safeArray(details.aides).forEach((item, index) => {
    const amount = positiveOrNull(item?.amount)
    if (amount !== null) rows.push({ label: item?.label || `Aide ${index + 1}`, amount })
  })

  return rows
}

function buildRecurringCharges(insights = {}) {
  return safeArray(insights.recurringCharges)
    .map((charge, index) => ({
      id: charge.id || `charge-${index + 1}`,
      label: String(charge.nom || charge.label || "Charge fixe").trim(),
      amount: positiveOrNull(charge.montant ?? charge.amount),
      frequency: charge.frequency || charge.frequence || "monthly",
      category: transactionCategory(charge),
    }))
    .filter(charge => charge.amount !== null)
    .sort((left, right) => right.amount - left.amount)
}

function buildCategoryRows(current = {}, previous = {}) {
  const currentRows = safeArray(current.categories)
  const previousById = new Map(safeArray(previous.categories).map(row => [row.id, rounded(row.amount) || 0]))
  const total = currentRows.reduce((sum, row) => sum + (rounded(row.amount) || 0), 0)

  return currentRows
    .map(row => {
      const amount = rounded(row.amount) || 0
      const previousAmount = previousById.has(row.id) ? previousById.get(row.id) : null
      const changeAmount = previousAmount === null ? null : rounded(amount - previousAmount)
      const changePercent = previousAmount && changeAmount !== null
        ? rounded((changeAmount / previousAmount) * 100)
        : null

      return {
        category: row.id,
        amount,
        share: total > 0 ? rounded((amount / total) * 100) : null,
        previousAmount,
        changeAmount,
        changePercent,
      }
    })
    .filter(row => row.amount > 0)
    .sort((left, right) => right.amount - left.amount)
}

function buildSignificantTransactions(insights = {}) {
  return safeArray(insights.currentTransactions)
    .map(transaction => ({
      id: transaction.id || null,
      label: String(transaction.label || transaction.nom || "Dépense").trim(),
      amount: expenseAmount(transaction),
      category: transactionCategory(transaction),
      date: transactionDate(transaction),
    }))
    .filter(row => row.amount !== null)
    .sort((left, right) => right.amount - left.amount)
    .slice(0, 5)
}

function buildUnusualExpenses(insights = {}, categoryRows = []) {
  const history = safeArray(insights.historyTransactions)
  const currentIds = new Set(safeArray(insights.currentTransactions).map(row => row.id).filter(Boolean))
  const historicalByCategory = new Map()

  history.forEach(transaction => {
    if (currentIds.has(transaction.id)) return
    const amount = expenseAmount(transaction)
    if (amount === null) return
    const category = transactionCategory(transaction)
    const values = historicalByCategory.get(category) || []
    values.push(amount)
    historicalByCategory.set(category, values)
  })

  const unusualTransactions = buildSignificantTransactions(insights)
    .filter(transaction => {
      const baseline = historicalByCategory.get(transaction.category) || []
      const typical = median(baseline)
      return baseline.length >= 3 && typical !== null && transaction.amount >= Math.max(50, typical * 2.5)
    })
    .map(transaction => ({
      type: "large_transaction",
      ...transaction,
      observation: "higher_than_usual_for_category",
    }))

  const categoryIncreases = categoryRows
    .filter(row => row.previousAmount !== null && row.previousAmount > 0 && row.changeAmount >= 50 && row.changePercent >= 50)
    .map(row => ({
      type: "category_increase",
      category: row.category,
      amount: row.amount,
      previousAmount: row.previousAmount,
      changeAmount: row.changeAmount,
      changePercent: row.changePercent,
      observation: "strong_period_increase",
    }))

  return [...unusualTransactions, ...categoryIncreases].slice(0, 5)
}

function buildBudgetTargets(insights = {}, categoryRows = []) {
  const currentByCategory = new Map(categoryRows.map(row => [row.category, row.amount]))
  return safeArray(insights.budgetTargets)
    .map(target => ({
      category: target.id || target.category,
      amount: positiveOrNull(target.budget ?? target.amount),
      spent: rounded(currentByCategory.get(target.id || target.category)) || 0,
    }))
    .filter(target => target.category && target.amount !== null)
}

export function buildBudgetAdvisorContext(insights = {}) {
  const current = insights.currentMonth || {}
  const previous = insights.previousMonth || {}
  const inputs = insights.budgetInputs || {}
  const availability = insights.dataAvailability || {}
  const recurringCharges = buildRecurringCharges(insights)
  const fixedExpenses = recurringCharges.length > 0
    ? rounded(recurringCharges.reduce((sum, charge) => sum + charge.amount, 0))
    : positiveOrNull(inputs.fixedExpenses)
  const transactionDataAvailable = availability.transactions !== false
  const hasAnyCurrentTransaction = Number(current.transactionsCount || 0) > 0
  const variableExpenses = transactionDataAvailable && hasAnyCurrentTransaction
    ? rounded(current.expenses || 0)
    : null
  const transactionIncome = positiveOrNull(current.incomes)
  const profileIncome = positiveOrNull(inputs.income)
  const currentPeriodType = insights.ranges?.current?.type
  const usesCurrentMonthlyBudget = currentPeriodType === "current_month_to_date"
  const incomeTotal = transactionIncome ?? (usesCurrentMonthlyBudget ? profileIncome : null)
  const remainingAfterFixedExpenses = usesCurrentMonthlyBudget && incomeTotal !== null && fixedExpenses !== null
    ? rounded(incomeTotal - fixedExpenses)
    : null
  const currentAvailableMargin = remainingAfterFixedExpenses !== null && variableExpenses !== null
    ? rounded(remainingAfterFixedExpenses - variableExpenses)
    : null
  const categoryRows = buildCategoryRows(current, previous)
  const hasPreviousExpenses = Number(previous.expenseTransactionsCount || 0) > 0
  const previousExpenses = hasPreviousExpenses ? rounded(previous.expenses) : null
  const expenseChange = previousExpenses !== null && variableExpenses !== null
    ? rounded(variableExpenses - previousExpenses)
    : null
  const expenseChangePercent = previousExpenses && expenseChange !== null
    ? rounded((expenseChange / previousExpenses) * 100)
    : null
  const shopping = insights.shoppingBasket || null
  const groceryCurrent = categoryRows.find(row => row.category === "alimentaire")?.amount ??
    (hasAnyCurrentTransaction ? 0 : null)
  const groceryPreviousRow = safeArray(previous.categories).find(row => row.id === "alimentaire")
  const groceryPrevious = hasPreviousExpenses ? rounded(groceryPreviousRow?.amount || 0) : null
  const groceryChange = groceryCurrent !== null && groceryPrevious !== null
    ? rounded(groceryCurrent - groceryPrevious)
    : null
  const groceryChangePercent = groceryPrevious && groceryChange !== null
    ? rounded((groceryChange / groceryPrevious) * 100)
    : null
  const budgetTargets = buildBudgetTargets(insights, categoryRows)
  const unusualExpenses = buildUnusualExpenses(insights, categoryRows)

  const missingFields = []
  if (incomeTotal === null) missingFields.push("income")
  if (fixedExpenses === null) missingFields.push("fixedExpenses")
  if (!transactionDataAvailable || !hasAnyCurrentTransaction) missingFields.push("currentTransactions")
  if (!hasPreviousExpenses) missingFields.push("previousPeriod")
  if (Number(insights.dataUsed?.receiptsCount || 0) + Number(insights.dataUsed?.previousReceiptsCount || 0) < 3) missingFields.push("groceryHistory")
  if (!shopping) missingFields.push("currentShoppingList")
  if (budgetTargets.length === 0) missingFields.push("budgetTargets")

  const completenessSignals = 7
  const availableSignals = completenessSignals - missingFields.length

  return {
    period: {
      type: insights.ranges?.current?.type || "current_month_to_date",
      start: insights.ranges?.current?.startDate || null,
      end: insights.ranges?.current?.inclusiveEndDate || null,
      label: insights.ranges?.current?.label || "",
    },
    income: { total: incomeTotal, details: incomeDetails(inputs), available: incomeTotal !== null },
    expenses: {
      total: usesCurrentMonthlyBudget && fixedExpenses !== null && variableExpenses !== null ? rounded(fixedExpenses + variableExpenses) : null,
      fixed: fixedExpenses,
      variable: variableExpenses,
      fixedPeriodBasis: fixedExpenses === null ? null : "current_monthly_recurring_charges",
    },
    remainingAfterFixedExpenses,
    currentAvailableMargin,
    spendingByCategory: categoryRows,
    recurringCharges: recurringCharges.length > 0 ? recurringCharges : null,
    grocery: {
      currentSpend: groceryCurrent,
      previousSpend: groceryPrevious,
      changeAmount: groceryChange,
      changePercent: groceryChangePercent,
      historicalBasketEstimate: shopping ? rounded(shopping.historicalBasketEstimate) : null,
      reliableSavingsTotal: shopping ? rounded(shopping.reliableSavingsTotal || 0) : null,
      optimizedBasketEstimate: shopping ? rounded(shopping.optimizedBasketEstimate) : null,
      shoppingListItemsCount: shopping ? Number(shopping.itemsCount || 0) : null,
      missingPriceCount: shopping ? Number(shopping.missingPriceCount || 0) : null,
      reliablePromotionCount: shopping ? Number(shopping.reliablePromotionCount || 0) : null,
      promotionWithoutHistoricalPriceCount: shopping ? Number(shopping.promotionWithoutHistoricalPriceCount || 0) : null,
      source: shopping?.source || null,
    },
    periodComparison: {
      previousIncome: hasPreviousExpenses ? positiveOrNull(previous.incomes) : null,
      previousExpenses,
      expenseChange,
      expenseChangePercent,
      comparable: hasPreviousExpenses,
      previousPeriod: insights.ranges?.previous
        ? { start: insights.ranges.previous.startDate, end: insights.ranges.previous.inclusiveEndDate, label: insights.ranges.previous.label }
        : null,
    },
    recentSignificantTransactions: buildSignificantTransactions(insights),
    unusualExpenses,
    budgetTargets,
    dataCompleteness: {
      score: Math.max(0, Math.round((availableSignals / completenessSignals) * 100)),
      missingFields,
      currentShoppingPromotions: Boolean(shopping),
    },
    // Compatibilité lecture seule avec les consommateurs V1 pendant la transition.
    fixedExpenses,
    availableBalance: numberOrNull(inputs.availableBalance),
  }
}
