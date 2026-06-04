import { useEffect, useState } from "react"
import { supabase } from "../services/supabase"
import { ABONNEMENTS } from "../data/categories"

function parseMontant(value) {
  if (value === "" || value === null || value === undefined) return 0

  const normalized = String(value)
    .replace(",", ".")
    .replace(/[^\d.]/g, "")

  const parts = normalized.split(".")
  const clean =
    parts.length > 1
      ? `${parts[0]}.${parts.slice(1).join("")}`
      : normalized

  const number = Number(clean)

  return Number.isFinite(number) ? number : 0
}

function normalizeCategorie(value) {
  const categorie = String(value || "").toLowerCase().trim()

  if (["electricity", "edf", "energy", "energie", "énergie"].includes(categorie)) {
    return "energie"
  }

  if (
    [
      "internet",
      "mobile",
      "telephone",
      "téléphone",
      "telecom",
      "télécom",
      "zeop",
      "only",
    ].includes(categorie)
  ) {
    return "telecom"
  }

  if (["water", "eau", "dilo", "cinor", "logement", "kaz"].includes(categorie)) {
    return "logement"
  }

  if (["streaming", "netflix", "loisirs", "loisir"].includes(categorie)) {
    return "loisirs"
  }

  if (["sante", "santé", "mutuelle"].includes(categorie)) {
    return "sante"
  }

  if (["transport", "essence", "carburant"].includes(categorie)) {
    return "transport"
  }

  if (["alimentaire", "alimentation", "courses"].includes(categorie)) {
    return "alimentaire"
  }

  return "divers"
}

function defaultAbonnements(userId) {
  return ABONNEMENTS.map(abonnement => ({
    user_id: userId,
    nom: abonnement.nom,
    categorie: normalizeCategorie(abonnement.categoryKey || abonnement.id),
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
        categorie: "divers",
        montant: 0,
        emoji: "📦",
        color: "#94A3B8",
      })
      .select("*")
      .single()

    if (error) {
      console.error("Erreur ajout abonnement:", error)
      return
    }

    setAbonnements(prev => [...prev, data])
  }

  function updateAbonnementLocal(id, updates) {
    setAbonnements(prev =>
      prev.map(abonnement =>
        abonnement.id === id
          ? {
              ...abonnement,
              ...updates,
            }
          : abonnement
      )
    )
  }

  async function updateAbonnement(id, updates, options = {}) {
    const localUpdates = { ...updates }

    if (localUpdates.categorie !== undefined) {
      localUpdates.categorie = normalizeCategorie(localUpdates.categorie)
    }

    updateAbonnementLocal(id, localUpdates)

    if (options.localOnly) {
      return { data: null, error: null }
    }

    const cleanedUpdates = { ...localUpdates }

    if (cleanedUpdates.montant !== undefined) {
      cleanedUpdates.montant = parseMontant(cleanedUpdates.montant)
    }

    Object.keys(cleanedUpdates).forEach(key => {
      if (cleanedUpdates[key] === undefined) {
        delete cleanedUpdates[key]
      }
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
      return { error }
    }

    setAbonnements(prev =>
      prev.map(abonnement => (abonnement.id === id ? data : abonnement))
    )

    return { data, error: null }
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
    updateAbonnementLocal,
    deleteAbonnement,
    resetAbonnements,
  }
}