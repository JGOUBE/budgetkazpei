import { useEffect, useMemo, useState } from "react"
import { supabase } from "../services/supabase"
import { listShoppingItems } from "../features/shopping/services/shoppingEngine"
import { buildStatisticsAdvice } from "../services/statistics/statisticsAdviceEngine"
import { buildStatisticsInsights } from "../services/statistics/statisticsEngine"

export function useStatisticsInsights({
  userId,
  transactions = [],
  stats = {},
  byCategory = [],
  period = "month",
  language = "fr",
}: {
  userId?: string
  transactions?: any[]
  stats?: any
  byCategory?: any[]
  period?: string
  language?: string
}) {
  const [shoppingItems, setShoppingItems] = useState<any[]>([])
  const [receipts, setReceipts] = useState<any[]>([])
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
            .select("id, store_name, purchase_date, total_amount, created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: false }),
        ])

        if (ignore) return
        setShoppingItems(shoppingRows || [])
        setReceipts(receiptsResult.data || [])
      } catch (error) {
        console.error("Erreur statistiques:", error)
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
    const insights = buildStatisticsInsights({
      transactions,
      stats,
      byCategory,
      shoppingItems,
      receipts,
      period,
    })

    return {
      loading,
      insights,
      advice: buildStatisticsAdvice(insights, language),
    }
  }, [loading, transactions, stats, byCategory, shoppingItems, receipts, period, language])
}
