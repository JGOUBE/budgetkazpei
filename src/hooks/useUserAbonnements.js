import { useEffect, useState } from "react"
import { supabase } from "../services/supabase"

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

  if (["electricity", "edf", "energy", "energie", "énergie", "eau", "water", "dilo", "cinor"].includes(categorie)) {
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
      "telephonie",
      "téléphonie",
      "zeop",
      "only",
    ].includes(categorie)
  ) {
    return "telecom"
  }

  if (["assurance", "assurances", "lasirans", "mutuelle"].includes(categorie)) {
    return "assurances"
  }

  if (["logement", "kaz", "loyer", "loyé", "credit", "crédit"].includes(categorie)) {
    return "logement"
  }

  if (["streaming", "netflix", "loisirs", "loisir"].includes(categorie)) {
    return "loisirs"
  }

  if (["sante", "santé", "pharmacie"].includes(categorie)) {
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

    // Nouvel utilisateur : aucun abonnement par défaut.
    // Les charges fixes restent à 0 tant que l'utilisateur n'en ajoute pas.
    setAbonnements(data || [])
    setLoading(false)
  }

  async function addAbonnement() {
    const { data, error } = await supabase
      .from("abonnements")
      .insert({
        user_id: userId,
        nom: "Nouvelle charge fixe",
        categorie: "divers",
        montant: 0,
        emoji: "📦",
        color: "#94A3B8",
      })
      .select("*")
      .single()

    if (error) {
      console.error("Erreur ajout abonnement:", error)
      return { error }
    }

    setAbonnements(prev => [...prev, data])
    return { data, error: null }
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
      return { error }
    }

    setAbonnements(prev => prev.filter(abonnement => abonnement.id !== id))
    return { error: null }
  }

  async function resetAbonnements() {
    const { error } = await supabase
      .from("abonnements")
      .delete()
      .eq("user_id", userId)

    if (error) {
      console.error("Erreur reinitialisation abonnements:", error)
      return { error }
    }

    // Réinitialiser = vider les charges fixes, pas recréer des abonnements par défaut.
    setAbonnements([])
    return { error: null }
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