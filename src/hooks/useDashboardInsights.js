import { useEffect, useMemo, useState } from "react"
import { supabase } from "../services/supabase"
import { buildStoreHabits } from "../features/shopping/services/priceHistory"
import { listShoppingItems } from "../features/shopping/services/shoppingEngine"

function money(value) {
  return Number(String(value ?? 0).replace(",", ".")) || 0
}

function daysLeftInMonth() {
  const now = new Date()
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return Math.max(1, last.getDate() - now.getDate() + 1)
}

function buildBudgetAlert(stats = {}, byCategory = []) {
  const food = (byCategory || []).find(cat => cat.id === "alimentaire")
  const foodSpent = money(food?.depense)
  const foodBudget = money(food?.budget)
  const used = foodBudget > 0 ? Math.round((foodSpent / foodBudget) * 100) : 0

  if (foodBudget > 0) {
    if (used >= 100) return { level: "danger", percent: used, text: `Budget alimentaire dépassé : ${used} % utilisé.` }
    if (used >= 90) return { level: "alert", percent: used, text: `Attention, ton budget alimentaire est déjà utilisé à ${used} %.` }
    if (used >= 70) return { level: "warning", percent: used, text: `Vigilance, ton budget alimentaire est utilisé à ${used} %.` }
  }

  const revenus = money(stats.revenus)
  const depenses = money(stats.depenses)
  const globalUsed = revenus > 0 ? Math.round((depenses / revenus) * 100) : 0

  if (revenus > 0 && globalUsed >= 90) {
    return { level: "alert", percent: globalUsed, text: `Attention, tes dépenses atteignent ${globalUsed} % de tes revenus.` }
  }

  return { level: "ok", percent: globalUsed, text: "Tout va bien, tes dépenses restent maîtrisées ce mois-ci." }
}

function buildSavingsHints({ stats = {}, byCategory = [], shoppingItems = [] }) {
  const hints = []
  const revenus = money(stats.revenus)
  const depenses = money(stats.depenses)
  const food = (byCategory || []).find(cat => cat.id === "alimentaire")

  if (money(food?.depense) > 0 && depenses > 0 && money(food?.depense) / depenses > 0.4) {
    hints.push("Ton budget alimentaire prend une grande place ce mois-ci.")
  }

  const habits = buildStoreHabits(shoppingItems)
  const mainHabitPercent = Number(habits[0]?.percent || 0)
  if (mainHabitPercent >= 45) {
    hints.push("Tu vas souvent au même magasin.")
  }

  const smallRepeated = shoppingItems.filter(item => money(item.price) > 0 && money(item.price) <= 5).length
  if (smallRepeated >= 5) {
    hints.push("Plusieurs petites dépenses répétées peuvent peser en fin de mois.")
  }

  if (revenus > 0 && depenses / revenus > 0.75) {
    hints.push("Tes dépenses montent, garde un oeil sur les prochains achats.")
  }

  if (hints.length === 0) {
    hints.push("Aucune alerte forte : continue à suivre tes dépenses régulièrement.")
  }

  return hints.slice(0, 3)
}

export function useDashboardInsights({ userId, stats = {}, byCategory = [] }) {
  const [shoppingItems, setShoppingItems] = useState([])
  const [receipts, setReceipts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let ignore = false

    async function load() {
      if (!userId) {
        setShoppingItems([])
        setReceipts([])
        setLoading(false)
        return
      }

      setLoading(true)

      try {
        const [shoppingRows, receiptsResult] = await Promise.all([
          listShoppingItems({ userId }),
          supabase
            .from("receipts")
            .select("id, store_name, purchase_date, total_amount, validation_status, receipt_items(id)")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(5),
        ])

        if (ignore) return
        setShoppingItems(shoppingRows || [])
        setReceipts(receiptsResult.data || [])
      } catch (error) {
        console.error("Erreur insights dashboard:", error)
        if (!ignore) {
          setShoppingItems([])
          setReceipts([])
        }
      } finally {
        if (!ignore) setLoading(false)
      }
    }

    load()

    return () => {
      ignore = true
    }
  }, [userId])

  return useMemo(() => {
    const revenus = money(stats.revenus)
    const depenses = money(stats.depenses)
    const balance = revenus - depenses
    const perDay = balance / daysLeftInMonth()
    const topCategories = [...(byCategory || [])]
      .filter(cat => money(cat.depense) > 0)
      .sort((a, b) => money(b.depense) - money(a.depense))
      .slice(0, 3)
    const storeHabits = buildStoreHabits(shoppingItems)
    const mainStore = storeHabits[0] || null
    const validatedReceipts = receipts.filter(row => row.validation_status !== "draft")
    const basketAverage = validatedReceipts.length
      ?
      validatedReceipts.reduce((sum, row) => sum + money(row.total_amount), 0) / validatedReceipts.length
      : 0

    return {
      loading,
      monthlyBalance: balance,
      dailyBalance: perDay,
      budgetAlert: buildBudgetAlert(stats, byCategory),
      topCategories,
      shoppingItems,
      storeHabits,
      mainStore,
      basketAverage,
      recentReceipts: receipts,
      savingsHints: buildSavingsHints({ stats, byCategory, shoppingItems }),
    }
  }, [loading, stats, byCategory, shoppingItems, receipts])
}
