import { buildTopProducts } from "../../features/shopping/services/priceHistory"

function money(value: unknown) {
  return Number(String(value ?? 0).replace(",", ".")) || 0
}

export function buildSavingsInsights({ shoppingItems = [], transactions = [] }: { shoppingItems?: any[]; transactions?: any[] }) {
  const suggestions = []
  const products = buildTopProducts(shoppingItems, 12)
  let potentialSavings = 0

  products.forEach(product => {
    const history = product.history || []
    const last = money(product.lastPrice)
    const low = money(product.lowestPrice)
    const diff = last > low ? last - low : 0

    if (diff > 0.1) {
      potentialSavings += diff
      const bestStore = history.find((item: any) => money(item.price) === low)?.store || "un autre magasin"
      suggestions.push({
        title: `${product.label} est parfois moins cher chez ${bestStore}.`,
        detail: `Économie moyenne possible : ${diff.toFixed(2)} €`,
        amount: diff,
      })
    }

    if (product.purchaseCount >= 4) {
      suggestions.push({
        title: `Tu achètes souvent ${product.label}.`,
        detail: "Pense à comparer les formats familiaux ou les lots.",
        amount: 0,
      })
    }
  })

  const recentExpenses = transactions
    .filter(tx => money(tx.amount) < 0)
    .slice(0, 30)
    .reduce((sum, tx) => sum + Math.abs(money(tx.amount)), 0)

  const olderExpenses = transactions
    .filter(tx => money(tx.amount) < 0)
    .slice(30, 60)
    .reduce((sum, tx) => sum + Math.abs(money(tx.amount)), 0)

  if (recentExpenses > olderExpenses && olderExpenses > 0) {
    suggestions.push({
      title: "Ton panier augmente progressivement.",
      detail: "Regarde les achats répétés pour repérer les petites hausses.",
      amount: 0,
    })
  }

  return {
    weeklyPotential: potentialSavings,
    suggestions: suggestions.slice(0, 8),
  }
}
