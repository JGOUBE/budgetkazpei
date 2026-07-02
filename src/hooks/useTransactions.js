import { useMemo, useState, useEffect, useCallback } from "react"
import { supabase } from "../services/supabase"

function isMissingColumnError(error) {
  const message = String(error?.message || error?.details || "")
  return error?.code === "PGRST204" || message.includes("Could not find") || message.includes("column")
}

function getCurrentMonthRange() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)

  return {
    startDate: start.toISOString().split("T")[0],
    endDate: end.toISOString().split("T")[0],
  }
}

function isCurrentMonth(dateValue) {
  if (!dateValue) return false

  const [year, month] = String(dateValue).slice(0, 10).split("-").map(Number)
  const now = new Date()

  return (
    year === now.getFullYear() &&
    month === now.getMonth() + 1
  )
}

function transactionActivityTime(transaction = {}) {
  const value = transaction.created_at || transaction.updated_at || transaction.date || ""
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : 0
}

function sortTransactionsByActivity(rows = []) {
  return [...rows].sort((a, b) => {
    const activityDiff = transactionActivityTime(b) - transactionActivityTime(a)
    if (activityDiff !== 0) return activityDiff
    return String(b.date || "").localeCompare(String(a.date || ""))
  })
}

async function logSuspiciousReceiptScanTransactions(rows = []) {
  const suspects = rows.filter(transaction => {
    const amount = Math.abs(Number(transaction.amount || 0))
    const label = String(transaction.label || transaction.nom || "").toLowerCase()
    return Math.abs(amount - 88.88) < 0.01
      || (Math.abs(amount - 88.81) < 0.01 && label.includes("portail"))
  })

  if (suspects.length === 0) return

  const receiptIds = [...new Set(suspects.map(transaction => transaction.receipt_id).filter(Boolean))]
  let receiptsById = new Map()

  if (receiptIds.length > 0) {
    const { data, error } = await supabase
      .from("receipts")
      .select("id, store_name, merchant_name, normalized_store_name, store_location, purchase_date, total_amount, scan_status, created_at, updated_at")
      .in("id", receiptIds)

    if (!error) {
      receiptsById = new Map((data || []).map(receipt => [receipt.id, receipt]))
    }
  }

  suspects.forEach(transaction => {
    console.info("SUSPECT_TRANSACTION_88_88", {
      transaction_id: transaction.id,
      amount: transaction.amount,
      label: transaction.label || transaction.nom || "",
      date: transaction.date,
      created_at: transaction.created_at || null,
      updated_at: transaction.updated_at || null,
      receipt_id: transaction.receipt_id || null,
      source: transaction.source || null,
      receipt: transaction.receipt_id ? receiptsById.get(transaction.receipt_id) || null : null,
      appears_high_because: "Dernieres transactions est maintenant trie par created_at DESC, puis updated_at DESC, puis date DESC.",
    })
  })
}

export function useTransactions(userId) {
  const [allTransactions, setAllTransactions] = useState([])
  const [loading, setLoading] = useState(true)

  const transactions = useMemo(
    () => sortTransactionsByActivity(allTransactions.filter(transaction => isCurrentMonth(transaction.date))),
    [allTransactions]
  )

  const fetchTransactions = useCallback(async () => {
    if (!userId) {
      setAllTransactions([])
      setLoading(false)
      return
    }

    setLoading(true)

    let { data, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })

    if (error && isMissingColumnError(error)) {
      const retry = await supabase
        .from("transactions")
        .select("*")
        .eq("user_id", userId)
        .order("date", { ascending: false })

      data = retry.data
      error = retry.error
    }

    if (error) {
      console.error("Erreur chargement transactions:", error)
      setAllTransactions([])
    } else {
      const sorted = sortTransactionsByActivity(data || [])
      setAllTransactions(sorted)
      logSuspiciousReceiptScanTransactions(sorted).catch(logError => {
        console.warn("Diagnostic transaction 88,88 indisponible:", logError)
      })
    }

    setLoading(false)
  }, [userId])

  useEffect(() => {
    fetchTransactions()
  }, [fetchTransactions])

  useEffect(() => {
    if (!userId) return

    function handleTransactionsUpdated() {
      fetchTransactions()
    }

    window.addEventListener("budgetkazpei:transactions-updated", handleTransactionsUpdated)

    return () => {
      window.removeEventListener("budgetkazpei:transactions-updated", handleTransactionsUpdated)
    }
  }, [userId, fetchTransactions])

  async function addTransaction(transaction) {
    const newTransaction = {
      ...transaction,
      user_id: userId,
      date: transaction.date || new Date().toISOString().split("T")[0],
    }

    const { data, error } = await supabase
      .from("transactions")
      .insert(newTransaction)
      .select()
      .single()

    if (error) {
      console.error("Erreur ajout transaction:", error)
      return { error }
    }

    setAllTransactions(prev => sortTransactionsByActivity([data, ...prev]))
    return { data, error: null }
  }

  async function updateTransaction(id, updates) {
    const { data, error } = await supabase
      .from("transactions")
      .update(updates)
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single()

    if (error) {
      console.error("Erreur modification transaction:", error)
      return { error }
    }

    setAllTransactions(prev => sortTransactionsByActivity(prev.map(t => (t.id === id ? data : t))))
    return { data, error: null }
  }

  async function deleteTransaction(id) {
    const { error } = await supabase
      .from("transactions")
      .delete()
      .eq("id", id)
      .eq("user_id", userId)

    if (error) {
      console.error("Erreur suppression transaction:", error)
      return { error }
    }

    setAllTransactions(prev => prev.filter(t => t.id !== id))
    return { error: null }
  }

  function getTransactionsByMonth(year, month) {
    return allTransactions.filter(transaction => {
      if (!transaction.date) return false
      const date = new Date(transaction.date)
      return date.getFullYear() === year && date.getMonth() === month
    })
  }

  function getAvailableMonths() {
    const months = new Map()

    allTransactions.forEach(transaction => {
      if (!transaction.date) return

      const date = new Date(transaction.date)
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`

      months.set(key, {
        key,
        year: date.getFullYear(),
        month: date.getMonth(),
        label: date.toLocaleDateString("fr-FR", {
          month: "long",
          year: "numeric",
        }),
      })
    })

    return Array.from(months.values()).sort((a, b) => b.key.localeCompare(a.key))
  }

  return {
    transactions,
    allTransactions,
    loading,
    fetchTransactions,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    getTransactionsByMonth,
    getAvailableMonths,
    currentMonthRange: getCurrentMonthRange(),
  }
}
