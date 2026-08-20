import { normalizeForAssistantMatch } from "./assistantLanguage.js"
import { buildSavingsInsights } from "../savings/savingsEngine.ts"

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

function toIsoDate(date) {
  return date.toISOString().slice(0, 10)
}

function monthRange(offset = 0, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1)

  return {
    start,
    end,
    startDate: toIsoDate(start),
    endDate: toIsoDate(end),
  }
}

function parseDate(value) {
  if (!value) return null
  const raw = String(value).slice(0, 10)
  const [year, month, day] = raw.split("-").map(Number)

  if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
    return new Date(year, month - 1, day)
  }

  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
}

function isInRange(value, range) {
  const date = parseDate(value)
  return Boolean(date && date >= range.start && date < range.end)
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
  now = new Date(),
} = {}) {
  const currentRange = monthRange(0, now)
  const previousRange = monthRange(-1, now)
  const allTransactions = Array.isArray(historyTransactions) && historyTransactions.length > 0
    ? historyTransactions
    : transactions

  const currentTransactions = allTransactions.filter(transaction => isInRange(transaction.date || transaction.created_at, currentRange))
  const previousTransactions = allTransactions.filter(transaction => isInRange(transaction.date || transaction.created_at, previousRange))

  const fallbackCurrentTransactions = currentTransactions.length > 0 ? currentTransactions : transactions

  const currentReceipts = receipts.filter(receipt => isInRange(receipt.purchase_date || receipt.created_at, currentRange))
  const previousReceipts = receipts.filter(receipt => isInRange(receipt.purchase_date || receipt.created_at, previousRange))
  const currentShoppingItems = shoppingItems.filter(item => isInRange(item.created_at, currentRange))
  const previousShoppingItems = shoppingItems.filter(item => isInRange(item.created_at, previousRange))

  const currentMonth = monthSummary({
    transactions: fallbackCurrentTransactions,
    receipts: currentReceipts,
    shoppingItems: currentShoppingItems,
    byCategory,
  })
  const previousMonth = monthSummary({
    transactions: previousTransactions,
    receipts: previousReceipts,
    shoppingItems: previousShoppingItems,
  })

  if (money(stats.depenses) > currentMonth.expenses) {
    currentMonth.expenses = money(stats.depenses)
  }

  const revenusFoyer = money(stats.revenus) || money(profile?.revenus_foyer) || currentMonth.incomes
  const estimatedRemaining = money(stats.resteAVivre ?? stats.solde) || revenusFoyer - currentMonth.expenses
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

  return {
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
    dataUsed: {
      transactionsCount: fallbackCurrentTransactions.length,
      previousTransactionsCount: previousTransactions.length,
      receiptsCount: currentMonth.receiptsCount,
      previousReceiptsCount: previousMonth.receiptsCount,
      storesCount: stores.length,
      productsCount: currentShoppingItems.length,
      comparableProductsCount: storeComparisons.comparableProductsCount,
    },
  }
}

export function buildAssistantAiSummary(insights = {}) {
  return {
    currentMonthExpenses: money(insights.currentMonth?.expenses),
    previousMonthExpenses: money(insights.previousMonth?.expenses),
    householdIncome: money(insights.revenusFoyer),
    estimatedRemaining: money(insights.estimatedRemaining),
    budgetUse: money(insights.budgetUse),
    topCategories: (insights.currentMonth?.topCategories || []).map(category => ({
      id: category.id,
      amount: money(category.amount),
    })),
    categoryIncreases: (insights.categoryIncreases || []).map(category => ({
      id: category.id,
      difference: money(category.difference),
      percent: category.percent,
    })),
    receiptsCount: money(insights.currentMonth?.receiptsCount),
    basketAverage: money(insights.currentMonth?.basketAverage),
    stores: (insights.stores || []).slice(0, 5).map(store => ({
      store: store.store,
      totalSpend: money(store.totalSpend),
      receiptsCount: money(store.receiptsCount),
    })),
    frequentProducts: (insights.frequentProducts || []).slice(0, 5).map(product => ({
      label: product.label,
      count: money(product.count),
      totalSpend: money(product.totalSpend),
    })),
    reliableSavings: (insights.savings?.suggestions || []).slice(0, 5).map(item => ({
      product: item.product,
      referenceStore: item.referenceStore,
      bestStore: item.bestStore,
      referencePrice: money(item.referencePrice),
      lowerObservedPrice: money(item.alternativePrice),
      potentialSaving: money(item.potentialSaving),
      normalizedComparison: Boolean(item.normalizedComparison),
      unitLabel: item.unitLabel || "",
      lastObservedAt: item.lastObservedAt || "",
      observationsCount: money(item.observationsCount),
    })),
    totalReliablePotentialSaving: money(insights.savings?.totalPotential),
    dataUsed: insights.dataUsed || {},
  }
}
