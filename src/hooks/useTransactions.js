import { useMemo, useState, useEffect } from "react"
import { supabase } from "../services/supabase"

function getCurrentMonthRange() {
  const now = new Date()

  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)

  const startDate = start.toISOString().split("T")[0]
  const endDate = end.toISOString().split("T")[0]

  return { startDate, endDate }
}

function isCurrentMonth(dateValue) {
  if (!dateValue) return false

  const date = new Date(dateValue)
  const now = new Date()

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth()
  )
}

export function useTransactions(userId) {
  const [allTransactions, setAllTransactions] = useState([])
  const [loading, setLoading] = useState(true)

  const transactions = useMemo(
    () => allTransactions.filter(transaction => isCurrentMonth(transaction.date)),
    [allTransactions]
  )

  useEffect(() => {
    if (!userId) {
      setAllTransactions([])
      setLoading(false)
      return
    }

    fetchTransactions()
  }, [userId])

  async function fetchTransactions() {
    setLoading(true)

    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("user_id", userId)
      .order("date", { ascending: false })

    if (error) {
      console.error("Erreur chargement transactions:", error)
      setAllTransactions([])
    } else {
      setAllTransactions(data || [])
    }

    setLoading(false)
  }

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

    setAllTransactions(prev => [data, ...prev])
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

    setAllTransactions(prev => prev.map(t => (t.id === id ? data : t)))
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
    addTransaction,
    updateTransaction,
    deleteTransaction,
    getTransactionsByMonth,
    getAvailableMonths,
    currentMonthRange: getCurrentMonthRange(),
  }
}