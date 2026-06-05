import { useEffect, useState } from "react"
import { supabase } from "../services/supabase"

function safeNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function getPreviousMonthInfo() {
  const now = new Date()
  const previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)

  return {
    mois: previousMonthDate.getMonth() + 1,
    annee: previousMonthDate.getFullYear(),
    startDate: new Date(previousMonthDate.getFullYear(), previousMonthDate.getMonth(), 1)
      .toISOString()
      .split("T")[0],
    endDate: new Date(previousMonthDate.getFullYear(), previousMonthDate.getMonth() + 1, 1)
      .toISOString()
      .split("T")[0],
  }
}

export function useMonthlyHistory(userId, isPremium) {
  const [historiques, setHistoriques] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!userId || !isPremium) {
      setHistoriques([])
      return
    }

    fetchHistoriques()
  }, [userId, isPremium])

  async function fetchHistoriques() {
    setLoading(true)

    const { data, error } = await supabase
      .from("historiques_mensuels")
      .select("*")
      .eq("user_id", userId)
      .order("annee", { ascending: false })
      .order("mois", { ascending: false })

    if (error) {
      console.error("Erreur chargement historique mensuel:", error)
      setHistoriques([])
    } else {
      setHistoriques(data || [])
    }

    setLoading(false)
  }

  async function saveMonthlyHistory({
    mois,
    annee,
    revenus = 0,
    depenses = 0,
    abonnements = 0,
    solde = 0,
    pdf_url = null,
    details = {},
  }) {
    if (!userId || !isPremium) {
      return { error: "Premium requis" }
    }

    const payload = {
      user_id: userId,
      mois,
      annee,
      revenus: safeNumber(revenus),
      depenses: safeNumber(depenses),
      abonnements: safeNumber(abonnements),
      solde: safeNumber(solde),
      pdf_url,
      details,
    }

    const { data, error } = await supabase
      .from("historiques_mensuels")
      .upsert(payload, {
        onConflict: "user_id,annee,mois",
      })
      .select("*")
      .single()

    if (error) {
      console.error("Erreur sauvegarde historique mensuel:", error)
      return { error }
    }

    setHistoriques(prev => {
      const exists = prev.some(item => item.id === data.id)
      return exists
        ? prev.map(item => (item.id === data.id ? data : item))
        : [data, ...prev]
    })

    return { data, error: null }
  }

  async function savePreviousMonthHistory() {
    if (!userId || !isPremium) {
      return { error: "Premium requis" }
    }

    const previous = getPreviousMonthInfo()

    const { data: existingHistory } = await supabase
      .from("historiques_mensuels")
      .select("id")
      .eq("user_id", userId)
      .eq("annee", previous.annee)
      .eq("mois", previous.mois)
      .maybeSingle()

    if (existingHistory?.id) {
      return { data: existingHistory, alreadyExists: true, error: null }
    }

    const { data: transactions, error: transactionsError } = await supabase
      .from("transactions")
      .select("*")
      .eq("user_id", userId)
      .gte("date", previous.startDate)
      .lt("date", previous.endDate)
      .order("date", { ascending: true })

    if (transactionsError) {
      console.error("Erreur récupération transactions mois précédent:", transactionsError)
      return { error: transactionsError }
    }

    const { data: abonnements, error: abonnementsError } = await supabase
      .from("abonnements")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })

    if (abonnementsError) {
      console.error("Erreur récupération abonnements:", abonnementsError)
      return { error: abonnementsError }
    }

    const revenus = (transactions || [])
      .filter(transaction => safeNumber(transaction.amount) > 0)
      .reduce((total, transaction) => total + safeNumber(transaction.amount), 0)

    const depensesTransactions = (transactions || []).filter(
      transaction => safeNumber(transaction.amount) < 0
    )

    const revenusTransactions = (transactions || []).filter(
      transaction => safeNumber(transaction.amount) > 0
    )

    const depensesVariables = depensesTransactions.reduce(
      (total, transaction) => total + Math.abs(safeNumber(transaction.amount)),
      0
    )

    const chargesFixes = (abonnements || []).reduce(
      (total, abonnement) => total + safeNumber(abonnement.montant),
      0
    )

    const depenses = depensesVariables + chargesFixes
    const solde = revenus - depenses

    const details = {
      periode: {
        mois: previous.mois,
        annee: previous.annee,
        startDate: previous.startDate,
        endDate: previous.endDate,
      },
      revenus: revenusTransactions,
      depenses: depensesTransactions,
      abonnements: abonnements || [],
    }

    return saveMonthlyHistory({
      mois: previous.mois,
      annee: previous.annee,
      revenus,
      depenses,
      abonnements: chargesFixes,
      solde,
      pdf_url: null,
      details,
    })
  }

  return {
    historiques,
    loading,
    fetchHistoriques,
    saveMonthlyHistory,
    savePreviousMonthHistory,
  }
}