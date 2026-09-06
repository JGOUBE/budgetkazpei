import { normalizeForAssistantMatch } from "./assistantLanguage.js"
import { buildSavingsInsights } from "../savings/savingsEngine.ts"
import { buildBudgetAdvisorContext } from "./budgetAdvisorContext.js"
import { dateIsInBudgetRange, resolveBudgetPeriod } from "./budgetPeriodResolver.js"

const CATEGORY_LABELS = {
  alimentaire: { fr: "l'alimentation", kr: "manzé" },
  logement: { fr: "le logement", kr: "logement" },
  transport: { fr: "le transport", kr: "transport" },
  energie: { fr: "l'énergie", kr: "kouran/dilo" },
  telecom: { fr: "la téléphonie", kr: "téléfoni" },
  assurances: { fr: "les assurances", kr: "lasirans" },
  sante: { fr: "la santé", kr: "lasanté" },
  loisirs: { fr: "les loisirs", kr: "loisirs" },
  divers: { fr: "les dépenses diverses", kr: "bann dépans diverses" },
}

function money(value) {
  const number = Number(String(value ?? 0).replace(",", "."))
  return Number.isFinite(number) ? number : 0
}

function optionalMoney(value) {
  if (value === null || value === undefined || value === "") return null
  const number = Number(String(value).replace(",", "."))
  return Number.isFinite(number) ? number : null
}

function categoryId(value = "") {
  const normalized = normalizeForAssistantMatch(value)

  if (["alimentaire", "alimentation", "courses", "supermarche", "supermarches", "manze"].includes(normalized)) {
    return "alimentaire"
  }

  if (normalized.includes("logement") || normalized.includes("loyer") || normalized.includes("kaz")) return "logement"
  if (normalized.includes("transport") || normalized.includes("essence") || normalized.includes("carburant")) return "transport"
  if (normalized.includes("energie") || normalized.includes("electricite") || normalized.includes("edf") || normalized.includes("eau")) return "energie"
  if (normalized.includes("telecom") || normalized.includes("telephone") || normalized.includes("internet") || normalized.includes("mobile")) return "telecom"
  if (normalized.includes("assurance")) return "assurances"
  if (normalized.includes("sante") || normalized.includes("pharmacie")) return "sante"
  if (normalized.includes("loisir") || normalized.includes("streaming")) return "loisirs"

  return normalized || "divers"
}

function transactionCategory(transaction = {}) {
  return categoryId(
    transaction.category ||
      transaction.categorie ||
      transaction.categoryKey ||
      transaction.budget_category ||
      transaction.type ||
      transaction.label ||
      transaction.nom ||
      "divers",
  )
}

function categoryTotalsFromTransactions(transactions = []) {
  const totals = new Map()

  transactions.forEach(transaction => {
    const amount = money(transaction.amount)
    if (amount >= 0) return

    const id = transactionCategory(transaction)
    totals.set(id, money(totals.get(id)) + Math.abs(amount))
  })

  return Array.from(totals.entries())
    .map(([id, amount]) => ({ id, amount }))
    .sort((a, b) => b.amount - a.amount)
}

function mergeCurrentCategories({ transactions = [], byCategory = [] }) {
  const fromBudget = (Array.isArray(byCategory) ? byCategory : [])
    .map(category => ({
      id: categoryId(category.id || category.category || category.label),
      amount: money(category.depense ?? category.amount),
      budget: money(category.budget),
    }))
    .filter(category => category.amount > 0)

  if (fromBudget.length > 0) {
    return fromBudget.sort((a, b) => b.amount - a.amount)
  }

  return categoryTotalsFromTransactions(transactions)
}

function normalizeStoreName(value = "") {
  const clean = normalizeForAssistantMatch(value)
  const compact = clean.replace(/\s+/g, "")

  if (!clean) return "Magasin non renseigné"
  if (clean.includes("leader price") || compact.includes("leaderprice")) return "Leader Price"
  if (clean.includes("carrefour market")) return "Carrefour Market"
  if (clean.includes("carrefour")) return "Carrefour"
  if (clean.includes("e leclerc") || compact.includes("eleclerc") || clean.includes("leclerc")) return "Leclerc"
  if (clean.includes("super u") || compact.includes("superu")) return "Super U"
  if (clean.includes("hyper u") || compact.includes("hyperu")) return "Hyper U"
  if (clean.includes("lidl")) return "Lidl"
  if (clean.includes("run market") || compact.includes("runmarket")) return "Run Market"
  if (clean.includes("jumbo score") || compact.includes("jumboscore")) return "Jumbo Score"
  if (clean.includes("jumbo")) return "Jumbo"
  if (clean.includes("intermarche") || clean.includes("inter marche")) return "Intermarché"
  if (clean.includes("score")) return "Score"
  if (clean.includes("casino")) return "Casino"
  if (clean.includes("spar")) return "Spar"
  if (clean.includes("auchan")) return "Auchan"

  return clean
    .split(" ")
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

function storeFromReceipt(receipt = {}) {
  return normalizeStoreName(receipt.store_name || receipt.merchant_name || receipt.normalized_store_name || "")
}

function storeFromItem(item = {}) {
  return normalizeStoreName(item.store || item.store_name || item.merchant_name || "")
}

function groupStoreSpending({ receipts = [], shoppingItems = [] }) {
  const groups = new Map()

  receipts.forEach(receipt => {
    const amount = money(receipt.total_amount)
    if (amount <= 0) return

    const store = storeFromReceipt(receipt)
    const current = groups.get(store) || { store, receiptsCount: 0, itemsCount: 0, totalSpend: 0 }
    current.receiptsCount += 1
    current.totalSpend += amount
    groups.set(store, current)
  })

  if (groups.size === 0) {
    shoppingItems.forEach(item => {
      const amount = money(item.price)
      if (amount <= 0) return

      const store = storeFromItem(item)
      const current = groups.get(store) || { store, receiptsCount: 0, itemsCount: 0, totalSpend: 0 }
      current.itemsCount += 1
      current.totalSpend += amount
      groups.set(store, current)
    })
  }

  return Array.from(groups.values())
    .map(store => ({
      ...store,
      averageSpend: store.receiptsCount > 0 ? store.totalSpend / store.receiptsCount : store.totalSpend,
    }))
    .sort((a, b) => a.totalSpend - b.totalSpend)
}

function buildFrequentProducts(items = [], limit = 6) {
  const groups = new Map()

  items.forEach(item => {
    const name = normalizeForAssistantMatch(item.normalized_name || item.product_name || item.corrected_name || "")
    const amount = money(item.price)
    if (!name || amount <= 0) return

    const current = groups.get(name) || {
      normalizedName: name,
      label: item.product_name || item.corrected_name || name,
      count: 0,
      totalSpend: 0,
      stores: new Set(),
    }

    current.count += 1
    current.totalSpend += amount
    current.stores.add(storeFromItem(item))
    groups.set(name, current)
  })

  return Array.from(groups.values())
    .map(product => ({
      normalizedName: product.normalizedName,
      label: product.label,
      count: product.count,
      totalSpend: product.totalSpend,
      storesCount: product.stores.size,
    }))
    .sort((a, b) => b.count - a.count || b.totalSpend - a.totalSpend)
    .slice(0, limit)
}

function monthSummary({ transactions = [], receipts = [], shoppingItems = [], byCategory = [] }) {
  const expenses = transactions
    .filter(transaction => money(transaction.amount) < 0)
    .reduce((sum, transaction) => sum + Math.abs(money(transaction.amount)), 0)

  const incomes = transactions
    .filter(transaction => money(transaction.amount) > 0)
    .reduce((sum, transaction) => sum + money(transaction.amount), 0)

  const categories = byCategory.length > 0
    ? mergeCurrentCategories({ transactions, byCategory })
    : categoryTotalsFromTransactions(transactions)

  const foodExpenses = categories
    .filter(category => category.id === "alimentaire")
    .reduce((sum, category) => sum + money(category.amount), 0)

  const receiptsWithTotal = receipts.filter(receipt => money(receipt.total_amount) > 0)
  const basketAverage = receiptsWithTotal.length
    ? receiptsWithTotal.reduce((sum, receipt) => sum + money(receipt.total_amount), 0) / receiptsWithTotal.length
    : 0

  const foodItems = shoppingItems.filter(item => categoryId(item.category || "alimentaire") === "alimentaire")

  return {
    transactionsCount: transactions.length,
    expenseTransactionsCount: transactions.filter(transaction => money(transaction.amount) < 0).length,
    expenses,
    incomes,
    categories,
    topCategories: categories.slice(0, 3),
    foodExpenses,
    receiptsCount: receiptsWithTotal.length,
    productsCount: shoppingItems.length,
    foodProductsCount: foodItems.length,
    basketAverage,
  }
}

function buildCategoryIncreases(currentCategories = [], previousCategories = []) {
  const previousById = new Map(previousCategories.map(category => [category.id, money(category.amount)]))

  return currentCategories
    .map(category => {
      const previous = money(previousById.get(category.id))
      const current = money(category.amount)
      const difference = current - previous

      return {
        id: category.id,
        current,
        previous,
        difference,
        percent: previous > 0 ? Math.round((difference / previous) * 100) : null,
      }
    })
    .filter(category => category.difference > 0)
    .sort((a, b) => b.difference - a.difference)
    .slice(0, 3)
}

function buildSmallRepeatedPurchases(items = []) {
  const rows = items.filter(item => {
    const amount = money(item.price)
    return amount > 0 && amount <= 5
  })

  return {
    count: rows.length,
    total: rows.reduce((sum, item) => sum + money(item.price), 0),
  }
}

export function getAssistantCategoryLabel(id = "divers", language = "fr") {
  const key = categoryId(id)
  const labels = CATEGORY_LABELS[key] || CATEGORY_LABELS.divers
  return language === "kr" ? labels.kr : labels.fr
}

export function buildAssistantInsights({
  transactions = [],
  historyTransactions = [],
  stats = {},
  byCategory = [],
  shoppingItems = [],
  receipts = [],
  profile = {},
  recurringCharges = [],
  budgetTargets = [],
  shoppingBasket = null,
  question = "",
  language = "fr",
  dataAvailability = {},
  now = new Date(),
} = {}) {
  const resolvedRanges = resolveBudgetPeriod(question, now, language)
  const currentRange = resolvedRanges.current
  const previousRange = resolvedRanges.previous
  const allTransactions = Array.isArray(historyTransactions) && historyTransactions.length > 0
    ? historyTransactions
    : transactions

  const currentTransactions = allTransactions.filter(transaction => dateIsInBudgetRange(transaction.date || transaction.created_at, currentRange))
  const previousTransactions = allTransactions.filter(transaction => dateIsInBudgetRange(transaction.date || transaction.created_at, previousRange))

  const currentReceipts = receipts.filter(receipt => dateIsInBudgetRange(receipt.purchase_date || receipt.created_at, currentRange))
  const previousReceipts = receipts.filter(receipt => dateIsInBudgetRange(receipt.purchase_date || receipt.created_at, previousRange))
  const currentShoppingItems = shoppingItems.filter(item => dateIsInBudgetRange(item.created_at, currentRange))
  const previousShoppingItems = shoppingItems.filter(item => dateIsInBudgetRange(item.created_at, previousRange))

  const currentMonth = monthSummary({
    transactions: currentTransactions,
    receipts: currentReceipts,
    shoppingItems: currentShoppingItems,
    byCategory: [],
  })
  const previousMonth = monthSummary({
    transactions: previousTransactions,
    receipts: previousReceipts,
    shoppingItems: previousShoppingItems,
  })

  const configuredIncome = optionalMoney(profile?.revenus_foyer ?? stats.revenus)
  const revenusFoyer = currentMonth.incomes > 0 ? currentMonth.incomes : configuredIncome
  const estimatedRemaining = optionalMoney(stats.resteAVivre ?? stats.solde)
  const budgetUse = revenusFoyer > 0 ? Math.round((currentMonth.expenses / revenusFoyer) * 100) : 0
  const stores = groupStoreSpending({ receipts: currentReceipts, shoppingItems: currentShoppingItems })
  const frequentProducts = buildFrequentProducts(currentShoppingItems)
  const savings = buildSavingsInsights({ shoppingItems })
  const reliableStoreRanking = Array.from(
    savings.suggestions.reduce((ranking, item) => {
      const current = ranking.get(item.bestStore) || { store: item.bestStore, wins: 0, savings: 0, products: [] }
      current.wins += 1
      current.savings += money(item.potentialSaving)
      current.products.push(item.product)
      ranking.set(item.bestStore, current)
      return ranking
    }, new Map()).values(),
  ).sort((a, b) => b.wins - a.wins || b.savings - a.savings)
  const storeComparisons = {
    comparableProductsCount: savings.comparableProductsCount,
    hasReliableComparison: savings.hasReliableComparison,
    ranking: reliableStoreRanking,
    examples: savings.suggestions.slice(0, 4).map(item => ({
      product: item.product,
      bestStore: item.bestStore,
      referenceStore: item.referenceStore,
      referencePrice: item.referencePrice,
      bestPrice: item.alternativePrice,
      potentialSaving: item.potentialSaving,
      normalizedComparison: item.normalizedComparison,
      unitLabel: item.unitLabel,
      lastObservedAt: item.lastObservedAt,
    })),
  }
  const smallRepeatedPurchases = buildSmallRepeatedPurchases(currentShoppingItems)
  const categoryIncreases = buildCategoryIncreases(currentMonth.categories, previousMonth.categories)

  const insights = {
    ranges: {
      current: currentRange,
      previous: previousRange,
    },
    currentMonth,
    previousMonth,
    revenusFoyer,
    estimatedRemaining,
    budgetUse,
    categoryIncreases,
    stores,
    storeComparisons,
    savings,
    frequentProducts,
    smallRepeatedPurchases,
    budgetInputs: {
      income: configuredIncome,
      incomeDetails: profile?.revenus_details ?? null,
      fixedExpenses: recurringCharges.length > 0 ? optionalMoney(stats.chargesFixes) : null,
      variableExpenses: optionalMoney(stats.depensesVariables),
      availableBalance: optionalMoney(stats.resteAVivre ?? stats.solde),
    },
    recurringCharges,
    budgetTargets: budgetTargets.length > 0 ? budgetTargets : byCategory,
    shoppingBasket,
    currentTransactions,
    historyTransactions: allTransactions,
    dataAvailability: {
      transactions: dataAvailability.transactions !== false,
      receipts: dataAvailability.receipts !== false,
      shoppingItems: dataAvailability.shoppingItems !== false,
      recurringCharges: dataAvailability.recurringCharges !== false,
      emptyTransactionsKnown: dataAvailability.emptyTransactionsKnown === true,
    },
    dataUsed: {
      transactionsCount: currentTransactions.length,
      previousTransactionsCount: previousTransactions.length,
      receiptsCount: currentMonth.receiptsCount,
      previousReceiptsCount: previousMonth.receiptsCount,
      storesCount: stores.length,
      productsCount: currentShoppingItems.length,
      comparableProductsCount: storeComparisons.comparableProductsCount,
    },
  }

  insights.budgetAdvisorContext = buildBudgetAdvisorContext(insights)
  return insights
}

export function buildAssistantAiSummary(insights = {}, intent = "budget_general") {
  const context = insights.budgetAdvisorContext || buildBudgetAdvisorContext(insights)
  const common = {
    period: context.period,
    dataCompleteness: context.dataCompleteness,
  }
  const intentFields = {
    budget_remaining: ["income", "expenses", "remainingAfterFixedExpenses", "currentAvailableMargin", "spendingByCategory", "recentSignificantTransactions"],
    budget_category: ["expenses", "spendingByCategory"],
    budget_period_compare: ["expenses", "spendingByCategory", "periodComparison"],
    budget_grocery: ["currentAvailableMargin", "grocery", "budgetTargets"],
    budget_fixed_expenses: ["income", "expenses", "remainingAfterFixedExpenses", "recurringCharges"],
    budget_subscriptions: ["expenses", "recurringCharges"],
    budget_unusual_expense: ["unusualExpenses", "recentSignificantTransactions", "spendingByCategory"],
    budget_savings: ["grocery"],
    budget_shopping_affordability: ["currentAvailableMargin", "grocery", "budgetTargets"],
  }
  const fields = intentFields[intent]
  const compactContext = fields
    ? fields.reduce((result, field) => ({ ...result, [field]: context[field] }), common)
    : context

  return {
    intent,
    budgetAdvisorContext: compactContext,
    dataUsed: insights.dataUsed || {},
  }
}
