import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'

export function useAuth() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Récupère la session au chargement
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Écoute les changements d'auth
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => {
      listener?.subscription?.unsubscribe()
    }
  }, [])

  // 🔐 LOGIN EMAIL / PASSWORD
  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) throw error
    return data
  }

  // 🆕 SIGNUP + création profil
  async function signUp(email, password, nom) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name: nom },
      },
    })

    if (error) throw error

    // création profil DB
    if (data.user) {
      await supabase.from('profiles').insert({
        id: data.user.id,
        email: email,
        nom: nom,
        premium: false,
      })
    }

    return data
  }

  // 🔴 LOGOUT
  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  // 🔵 LOGIN GOOGLE
  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
    })

    if (error) throw error
  }

  return {
    user,
    loading,
    signIn,
    signUp,
    signOut,
    signInWithGoogle,
  }
}
    