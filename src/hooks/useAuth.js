import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'

export function useAuth() {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Récupère la session active au démarrage
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Écoute les changements de connexion/déconnexion
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signUp(email, password, nom) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name: nom }  // ← le prénom est stocké dans les métadonnées
      }
    })
    if (error) throw error

    // Crée le profil dans la table profiles
    if (data.user) {
      await supabase.from('profiles').insert({
        id: data.user.id,
        email,
        nom,
        premium: false,
      })
    }
    return data
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  return { user, loading, signUp, signIn, signOut }
}
