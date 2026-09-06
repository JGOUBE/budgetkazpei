import { useCallback, useEffect, useMemo, useState } from "react"
import { supabase } from "../services/supabase"
import { listShoppingItems } from "../features/shopping/services/shoppingEngine"
import { buildAssistantInsights } from "../services/ai/assistantInsightsService"
import { buildShoppingAdvisorContext } from "../services/ai/shoppingAdvisorContext"
import { loadActiveRetailPromotions } from "../services/retail/retailPromotionService"
import { loadShoppingListDraft } from "../services/shoppingList/shoppingListDraft"

function getHistoryStartDate() {
  const date = new Date()
  date.setDate(date.getDate() - 90)
  return date.toISOString().slice(0, 10)
}

function resultOf(promise) {
  return Promise.resolve(promise)
    .then(result => result && typeof result === "object" && ("data" in result || "error" in result) ? result : { data: result, error: null })
    .catch(error => ({ data: null, error }))
}

function normalizeSnapshot(row = null) {
  if (!row) return null
  return {
    id: row.id,
    items: Array.isArray(row.items) ? row.items : [],
    totalEstimated: Number(row.total_estimated || 0),
    missingPriceCount: Number(row.missing_price_count || 0),
    totalItems: Number(row.total_items || 0),
    createdAt: row.created_at,
  }
}

export function useAssistantInsights({
  userId,
  transactions = [],
  historyTransactions: providedHistoryTransactions,
  recurringCharges: providedRecurringCharges,
  budgetTargets = [],
  stats = {},
  byCategory = [],
} = {}) {
  const [shoppingItems, setShoppingItems] = useState([])
  const [receipts, setReceipts] = useState([])
  const [loadedHistoryTransactions, setLoadedHistoryTransactions] = useState([])
  const [loadedRecurringCharges, setLoadedRecurringCharges] = useState([])
  const [profile, setProfile] = useState(null)
  const [shoppingBasket, setShoppingBasket] = useState(null)
  const [availability, setAvailability] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let ignore = false

    async function load() {
      if (!userId) {
        setShoppingItems([])
        setReceipts([])
        setLoadedHistoryTransactions([])
        setLoadedRecurringCharges([])
        setProfile(null)
        setShoppingBasket(null)
        setAvailability({})
        setLoading(false)
        setError("")
        return
      }

      setLoading(true)
      setError("")
      const historyStartDate = getHistoryStartDate()
      const historyPromise = providedHistoryTransactions !== undefined
        ? Promise.resolve({ data: providedHistoryTransactions, error: null })
        : supabase.from("transactions").select("*").eq("user_id", userId).gte("date", historyStartDate).order("date", { ascending: false })
      const recurringPromise = providedRecurringCharges !== undefined
        ? Promise.resolve({ data: providedRecurringCharges, error: null })
        : supabase.from("abonnements").select("*").eq("user_id", userId).order("created_at", { ascending: true })

      const [shoppingResult, receiptsResult, transactionsResult, profileResult, recurringResult, promotionsResult, snapshotResult] = await Promise.all([
        resultOf(listShoppingItems({ userId, includeProductIdentity: true })),
        resultOf(supabase
          .from("receipts")
          .select("id, store_name, merchant_name, normalized_store_name, purchase_date, total_amount, validation_status, budget_category, is_food_ticket, created_at")
          .eq("user_id", userId)
          .gte("purchase_date", historyStartDate)
          .order("purchase_date", { ascending: false })),
        resultOf(historyPromise),
        resultOf(supabase.from("profiles").select("*").eq("id", userId).maybeSingle()),
        resultOf(recurringPromise),
        resultOf(loadActiveRetailPromotions({ client: supabase })),
        resultOf(supabase
          .from("shopping_list_snapshots")
          .select("id, items, total_estimated, missing_price_count, total_items, created_at, expires_at")
          .eq("user_id", userId)
          .eq("status", "active")
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()),
      ])

      if (ignore) return

      const nextShoppingItems = shoppingResult.data || []
      const nextReceipts = receiptsResult.data || []
      const nextTransactions = transactionsResult.data || []
      const nextRecurringCharges = recurringResult.data || []
      const draftItems = loadShoppingListDraft({ userId })
      const nextShoppingBasket = buildShoppingAdvisorContext({
        draftItems,
        snapshot: normalizeSnapshot(snapshotResult.data),
        shoppingItems: nextShoppingItems,
        promotions: promotionsResult.data || [],
      })

      setShoppingItems(nextShoppingItems)
      setReceipts(nextReceipts)
      setLoadedHistoryTransactions(nextTransactions)
      setLoadedRecurringCharges(nextRecurringCharges)
      setProfile(profileResult.data || null)
      setShoppingBasket(nextShoppingBasket)
      setAvailability({
        transactions: !transactionsResult.error,
        receipts: !receiptsResult.error,
        shoppingItems: !shoppingResult.error,
        recurringCharges: !recurringResult.error,
        emptyTransactionsKnown: !transactionsResult.error && nextTransactions.length === 0,
      })

      const importantError = transactionsResult.error || profileResult.error || recurringResult.error
      if (importantError) {
        console.error("Erreur contexte assistant:", importantError)
        setError("assistant_context_partially_unavailable")
      }
    }

    load()
      .catch(loadError => {
        console.error("Erreur contexte assistant:", loadError)
        if (!ignore) setError("assistant_context_unavailable")
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })

    return () => {
      ignore = true
    }
  }, [userId, providedHistoryTransactions, providedRecurringCharges])

  const effectiveHistoryTransactions = providedHistoryTransactions ?? loadedHistoryTransactions
  const effectiveRecurringCharges = providedRecurringCharges ?? loadedRecurringCharges

  const buildForQuestion = useCallback((question = "", language = "fr") => buildAssistantInsights({
    transactions,
    historyTransactions: effectiveHistoryTransactions,
    stats,
    byCategory,
    shoppingItems,
    receipts,
    profile,
    recurringCharges: effectiveRecurringCharges,
    budgetTargets,
    shoppingBasket,
    question,
    language,
    dataAvailability: availability,
  }), [transactions, effectiveHistoryTransactions, stats, byCategory, shoppingItems, receipts, profile, effectiveRecurringCharges, budgetTargets, shoppingBasket, availability])

  const insights = useMemo(() => buildForQuestion("", "fr"), [buildForQuestion])

  return {
    insights,
    buildForQuestion,
    shoppingItems,
    receipts,
    historyTransactions: effectiveHistoryTransactions,
    recurringCharges: effectiveRecurringCharges,
    shoppingBasket,
    profile,
    loading,
    error,
  }
}
