import { useEffect, useState } from "react"
import { supabase } from "../services/supabase"

export function useCustomBudgets(userId, isPremium) {
  const [customBudgets, setCustomBudgets] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadBudgets() {
      if (!userId || !isPremium) {
        setCustomBudgets([])
        setLoading(false)
        return
      }

      setLoading(true)

      const { data, error } = await supabase
        .from("budgets")
        .select("id, user_id, category, amount, alert_enabled")
        .eq("user_id", userId)

      if (!cancelled) {
        if (!error && data) {
          setCustomBudgets(
            data.map(item => ({
              id: item.id,
              user_id: item.user_id,
              category: item.category,
              amount: Number(item.amount) || 0,
              alert_enabled: item.alert_enabled !== false,
            }))
          )
        }

        setLoading(false)
      }
    }

    loadBudgets()

    return () => {
      cancelled = true
    }
  }, [userId, isPremium])

  async function saveBudgets(budgets) {
    if (!userId || !isPremium) {
      return { error: "Premium requis" }
    }

    const payload = budgets.map(budget => ({
      user_id: userId,
      category: budget.category,
      amount: Number(budget.amount) || 0,
      alert_enabled: budget.alert_enabled !== false,
    }))

    const { data, error } = await supabase
      .from("budgets")
      .upsert(payload, {
        onConflict: "user_id,category",
      })
      .select("id, user_id, category, amount, alert_enabled")

    if (!error && data) {
      setCustomBudgets(
        data.map(item => ({
          id: item.id,
          user_id: item.user_id,
          category: item.category,
          amount: Number(item.amount) || 0,
          alert_enabled: item.alert_enabled !== false,
        }))
      )
    }

    return { data, error }
  }

  return {
    customBudgets,
    loading,
    saveBudgets,
  }
}