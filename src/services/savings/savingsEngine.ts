import { buildTopProducts } from "../../features/shopping/services/priceHistory"

function money(value: unknown) {
  return Number(String(value ?? 0).replace(",", ".")) || 0
}

function isKreolLanguage(language: string | undefined) {
  return ["cr", "kreol", "kr"].includes(String(language || "").toLowerCase())
}

export function buildSavingsInsights({
  shoppingItems = [],
  transactions = [],
  language = "fr",
}: {
  shoppingItems?: any[]
  transactions?: any[]
  language?: string
}) {
  const isKreol = isKreolLanguage(language)
  const suggestions = []
  const products = buildTopProducts(shoppingItems, 12)
  const safeTransactions = Array.isArray(transactions) ? transactions : []
  let potentialSavings = 0

  products.forEach(product => {
    const history = product.history || []
    const last = money(product.lastPrice)
    const low = money(product.lowestPrice)
    const diff = last > low ? last - low : 0

    if (diff > 0.1) {
      potentialSavings += diff
      const bestStore = history.find((item: any) => money(item.price) === low)?.store || (isKreol ? "in autre magasin" : "un autre magasin")
      suggestions.push({
        title: isKreol
          ? `${product.label} le parfois moins cher chez ${bestStore}.`
          : `${product.label} est parfois moins cher chez ${bestStore}.`,
        detail: isKreol
          ? `Lekonomi moyenne possible : ${diff.toFixed(2)} EUR`
          : `Economie moyenne possible : ${diff.toFixed(2)} EUR`,
        amount: diff,
      })
    }

    if (product.purchaseCount >= 4) {
      suggestions.push({
        title: isKreol ? `Ou achete souvent ${product.label}.` : `Tu achetes souvent ${product.label}.`,
        detail: isKreol
          ? "Pense compare bann formats familiaux ou bann lots."
          : "Pense a comparer les formats familiaux ou les lots.",
        amount: 0,
      })
    }
  })

  const recentExpenses = safeTransactions
    .filter(tx => money(tx.amount) < 0)
    .slice(0, 30)
    .reduce((sum, tx) => sum + Math.abs(money(tx.amount)), 0)

  const olderExpenses = safeTransactions
    .filter(tx => money(tx.amount) < 0)
    .slice(30, 60)
    .reduce((sum, tx) => sum + Math.abs(money(tx.amount)), 0)

  if (recentExpenses > olderExpenses && olderExpenses > 0) {
    suggestions.push({
      title: isKreol ? "Out panier i augmente progressivement." : "Ton panier augmente progressivement.",
      detail: isKreol
        ? "Regarde bann achats repetes pou reperer bann petites hausses."
        : "Regarde les achats repetes pour reperer les petites hausses.",
      amount: 0,
    })
  }

  return {
    weeklyPotential: potentialSavings,
    suggestions: suggestions.slice(0, 8),
  }
}
