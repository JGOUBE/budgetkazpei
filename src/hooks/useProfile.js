import { useState, useEffect } from "react"
import { supabase } from "../services/supabase"

function cleanProfileUpdates(updates = {}) {
  return {
    ...updates,
    nombre_enfants:
      updates.nombre_enfants === "" || updates.nombre_enfants === null
        ? null
        : Number(updates.nombre_enfants),
    revenus_foyer:
      updates.revenus_foyer === "" || updates.revenus_foyer === null
        ? null
        : Number(updates.revenus_foyer),
  }
}

export function useProfile(userId) {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!userId) {
      setProfile(null)
      setLoading(false)
      return
    }

    async function fetchProfile() {
      setLoading(true)

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single()

      if (error) {
        console.error("Erreur chargement profil:", error)
        setProfile(null)
      } else {
        setProfile(data)
      }

      setLoading(false)
    }

    fetchProfile()
  }, [userId])

  async function updateProfile(updates) {
    setSaving(true)

    const cleanedUpdates = cleanProfileUpdates(updates)

    const { data, error } = await supabase
      .from("profiles")
      .update(cleanedUpdates)
      .eq("id", userId)
      .select()
      .single()

    if (error) {
      console.error("Erreur mise à jour profil:", error)
      setSaving(false)
      throw error
    }

    setProfile(data)
    setSaving(false)
    return data
  }

  async function uploadAvatar(file) {
    const ext = file.name.split(".").pop()
    const path = `${userId}/avatar.${ext}`

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true })

    if (uploadError) throw uploadError

    const { data } = supabase.storage.from("avatars").getPublicUrl(path)
    const avatarUrl = data.publicUrl + "?t=" + Date.now()

    await updateProfile({ avatar_url: avatarUrl })
    return avatarUrl
  }

  return { profile, loading, saving, updateProfile, uploadAvatar }
}