import { useEffect, useState } from "react"
import { supabase } from "../services/supabase"
import { ABONNEMENTS } from "../data/categories"

function defaultAbonnements(userId) {
  return ABONNEMENTS.map(abonnement => ({
    user_id: userId,
    nom: abonnement.nom,
    categorie: abonnement.categoryKey || abonnement.id,
    montant: Number(abonnement.montant) || 0,
    emoji: abonnement.emoji || "📋",
    color: abonnement.color || "#64748B",
  }))
}

export function useUserAbonnements(userId) {
  const [abonnements, setAbonnements] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) {
      setAbonnements([])
      setLoading(false)
      return
    }

    fetchAbonnements()
  }, [userId])

  async function fetchAbonnements() {
    setLoading(true)

    const { data, error } = await supabase
      .from("abonnements")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })

    if (error) {
      console.error("Erreur chargement abonnements:", error)
      setAbonnements([])
      setLoading(false)
      return
    }

    if (!data || data.length === 0) {
      await createDefaultAbonnements()
      return
    }

    setAbonnements(data)
    setLoading(false)
  }

  async function createDefaultAbonnements() {
    const { data, error } = await supabase
      .from("abonnements")
      .insert(defaultAbonnements(userId))
      .select("*")
      .order("created_at", { ascending: true })

    if (error) {
      console.error("Erreur creation abonnements par defaut:", error)
      setAbonnements([])
    } else {
      setAbonnements(data || [])
    }

    setLoading(false)
  }

  async function addAbonnement() {
    const { data, error } = await supabase
      .from("abonnements")
      .insert({
        user_id: userId,
        nom: "Nouvel abonnement",
        categorie: "autre",
        montant: 0,
        emoji: "📋",
        color: "#38BDF8",
      })
      .select("*")
      .single()

    if (error) {
      console.error("Erreur ajout abonnement:", error)
      return
    }

    setAbonnements(prev => [...prev, data])
  }

  async function updateAbonnement(id, updates) {
    const cleanedUpdates = {
      ...updates,
      montant: updates.montant !== undefined ? Number(updates.montant) || 0 : updates.montant,
    }

    Object.keys(cleanedUpdates).forEach(key => {
      if (cleanedUpdates[key] === undefined) delete cleanedUpdates[key]
    })

    const { data, error } = await supabase
      .from("abonnements")
      .update(cleanedUpdates)
      .eq("id", id)
      .eq("user_id", userId)
      .select("*")
      .single()

    if (error) {
      console.error("Erreur modification abonnement:", error)
      return
    }

    setAbonnements(prev => prev.map(abonnement => abonnement.id === id ? data : abonnement))
  }

  async function deleteAbonnement(id) {
    const { error } = await supabase
      .from("abonnements")
      .delete()
      .eq("id", id)
      .eq("user_id", userId)

    if (error) {
      console.error("Erreur suppression abonnement:", error)
      return
    }

    setAbonnements(prev => prev.filter(abonnement => abonnement.id !== id))
  }

  async function resetAbonnements() {
    const { error: deleteError } = await supabase
      .from("abonnements")
      .delete()
      .eq("user_id", userId)

    if (deleteError) {
      console.error("Erreur reinitialisation abonnements:", deleteError)
      return
    }

    await createDefaultAbonnements()
  }

  return {
    abonnements,
    loading,
    addAbonnement,
    updateAbonnement,
    deleteAbonnement,
    resetAbonnements,
  }
}
