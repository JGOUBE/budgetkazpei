import { useEffect, useState } from "react"
import { supabase } from "../services/supabase"

function getRedirectUrl() {
  if (window.location.hostname === "localhost") {
    return window.location.origin
  }

  return "https://budgetkazpei.vercel.app"
}

async function ensureProfile(user) {
  if (!user?.id) return

  const name =
    user.user_metadata?.name ||
    user.user_metadata?.full_name ||
    user.email?.split("@")[0] ||
    "Utilisateur"

  try {
    const { data, error: selectError } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle()

    if (selectError) {
      console.error("Erreur lecture profile:", selectError.message)
      return
    }

    if (!data) {
      const { error } = await supabase.from("profiles").insert({
        id: user.id,
        email: user.email || "",
        nom: name,
        premium: false,
      })

      if (error) {
        console.error("Erreur creation profile:", error.message)
      }
    }
  } catch (err) {
    console.error("Erreur ensureProfile:", err)
  }
}

export function useAuth() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState(null)

  useEffect(() => {
    let mounted = true

    const safetyTimer = setTimeout(() => {
      if (mounted) {
        setLoading(false)
      }
    }, 3000)

    async function initSession() {
      try {
        const { data, error } = await supabase.auth.getSession()

        if (!mounted) return

        if (error) {
          setAuthError(error.message)
          setUser(null)
        } else {
          const sessionUser = data.session?.user ?? null

          setUser(sessionUser)
          setAuthError(null)

          if (sessionUser) {
            setTimeout(() => {
              ensureProfile(sessionUser)
            }, 0)
          }
        }
      } catch (err) {
        console.error("Erreur initSession:", err)

        if (mounted) {
          setAuthError(err.message || "Erreur de session")
          setUser(null)
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    initSession()

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const sessionUser = session?.user ?? null

      if (mounted) {
        setUser(sessionUser)
        setAuthError(null)
        setLoading(false)
      }

      if (sessionUser) {
        setTimeout(() => {
          ensureProfile(sessionUser)
        }, 0)
      }
    })

    return () => {
      mounted = false
      clearTimeout(safetyTimer)
      data?.subscription?.unsubscribe()
    }
  }, [])

  async function signIn(email, password) {
    setAuthError(null)

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setAuthError(error.message)
      throw error
    }

    if (data.user) {
      setUser(data.user)

      setTimeout(() => {
        ensureProfile(data.user)
      }, 0)
    }

    return data
  }

  async function signUp(email, password, nom) {
    setAuthError(null)

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: nom,
        },
        emailRedirectTo: getRedirectUrl(),
      },
    })

    if (error) {
      setAuthError(error.message)
      throw error
    }

    if (data.user) {
      setTimeout(() => {
        ensureProfile(data.user)
      }, 0)
    }

    return data
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut()

    if (error) {
      setAuthError(error.message)
      throw error
    }

    setUser(null)
    setAuthError(null)
    window.location.assign("/")
  }

  async function signInWithGoogle() {
    setAuthError(null)

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: getRedirectUrl(),
        queryParams: {
          prompt: "select_account",
        },
      },
    })

    if (error) {
      setAuthError(error.message)
      throw error
    }
  }

  return {
    user,
    loading,
    authError,
    signIn,
    signUp,
    signOut,
    signInWithGoogle,
  }
}