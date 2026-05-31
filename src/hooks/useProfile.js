import { useState, useEffect } from "react";
import { supabase } from "../services/supabase";

export function useProfile(userId) {
  const [profile, setProfile]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);

  // ── Charger le profil ───────────────────────────────────────
  useEffect(() => {
    if (!userId) return;

    async function fetchProfile() {
      setLoading(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) console.error("Erreur chargement profil:", error);
      else setProfile(data);
      setLoading(false);
    }

    fetchProfile();
  }, [userId]);

  // ── Mettre à jour le profil ─────────────────────────────────
  async function updateProfile(updates) {
    setSaving(true);
    const { data, error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", userId)
      .select()
      .single();

    if (error) {
      console.error("Erreur mise à jour profil:", error);
      setSaving(false);
      throw error;
    }

    setProfile(data);
    setSaving(false);
    return data;
  }

  // ── Uploader une photo de profil ────────────────────────────
  async function uploadAvatar(file) {
    const ext      = file.name.split(".").pop();
    const path     = `${userId}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    const avatarUrl = data.publicUrl + "?t=" + Date.now(); // cache busting

    await updateProfile({ avatar_url: avatarUrl });
    return avatarUrl;
  }

  return { profile, loading, saving, updateProfile, uploadAvatar };
}
