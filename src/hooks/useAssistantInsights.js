import { useEffect, useMemo, useState } from "react"
import { supabase } from "../services/supabase"
import { listShoppingItems } from "../features/shopping/services/shoppingEngine"
import { buildAssistantInsights } from "../services/ai/assistantInsightsService"

function getHistoryStartDate() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10)
}

function isMissingColumnError(error) {
  const message = String(error?.message || error?.details || "")
  return error?.code === "PGRST204" || message.includes("Could not find") || message.includes("column")
}

export function useAssistantInsights({
  userId,
  transactions = [],
  stats = {},
  byCategory = [],
} = {}) {
  const [shoppingItems, setShoppingItems] = useState([])
  const [receipts, setReceipts] = useState([])
  const [historyTransactions, setHistoryTransactions] = useState([])
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let ignore = false

    async function load() {
      if (!userId) {
        setShoppingItems([])
        setReceipts([])
        setHistoryTransactions([])
        setProfile(null)
        setLoading(false)
        setError("")
        return
      }

      setLoading(true)
      setError("")

      try {
        const historyStartDate = getHistoryStartDate()
        const [shoppingRows, receiptsResult, transactionsResult, profileResult] = await Promise.all([
          listShoppingItems({ userId }),
          supabase
            .from("receipts")
            .select("id, store_name, merchant_name, normalized_store_name, purchase_date, total_amount, validation_status, budget_category, is_food_ticket, created_at")
            .eq("user_id", userId)
            .gte("purchase_date", historyStartDate)
            .order("purchase_date", { ascending: false }),
          supabase
            .from("transactions")
            .select("*")
            .eq("user_id", userId)
            .gte("date", historyStartDate)
            .order("date", { ascending: false }),
          supabase
            .from("profiles")
            .select("id, plan, premium, premium_plus, revenus_foyer, revenus_details")
            .eq("id", userId)
            .maybeSingle(),
        ])

        if (ignore) return

        if (receiptsResult.error && !isMissingColumnError(receiptsResult.error)) throw receiptsResult.error
        if (transactionsResult.error) throw transactionsResult.error
        if (profileResult.error) throw profileResult.error

        setShoppingItems(shoppingRows || [])
        setReceipts(receiptsResult.data || [])
        setHistoryTransactions(transactionsResult.data || [])
        setProfile(profileResult.data || null)
      } catch (loadError) {
        console.error("Erreur contexte assistant:", loadError)
        if (!ignore) {
          setShoppingItems([])
          setReceipts([])
          setHistoryTransactions([])
          setProfile(null)
          setError("assistant_context_unavailable")
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

  const insights = useMemo(() => {
    return buildAssistantInsights({
      transactions,
      historyTransactions,
      stats,
      byCategory,
      shoppingItems,
      receipts,
      profile,
    })
  }, [transactions, historyTransactions, stats, byCategory, shoppingItems, receipts, profile])

  return {
    insights,
    shoppingItems,
    receipts,
    historyTransactions,
    profile,
    loading,
    error,
  }
}
