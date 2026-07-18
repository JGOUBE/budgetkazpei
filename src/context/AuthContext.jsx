import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { supabase } from "../services/supabase"
import {
  resetPasswordForEmailAuth,
  signInWithGoogleAuth,
  signInWithPasswordAuth,
  signUpWithEmailAuth,
} from "../services/authSupabase"
import {
  APP_ROUTE,
  SESSION_EXPIRED_MESSAGE,
  buildLoginPath,
  getAuthCallbackUrl,
  getResetPasswordRedirectUrl,
  hasAuthenticatedDevice,
  isAuthCallbackPath,
  isProtectedPath,
  markAuthenticatedDevice,
  mapAuthError,
  navigate,
  sanitizeNextPath,
} from "../services/authNavigation"

const AuthContext = createContext(null)
const profileEnsures = new Set()

async function ensureProfile(user) {
  if (!user?.id || profileEnsures.has(user.id)) return

  profileEnsures.add(user.id)

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
  } finally {
    profileEnsures.delete(user.id)
  }
}

function toUserError(error, fallbackMessage) {
  return new Error(mapAuthError(error, fallbackMessage))
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState(null)
  const [authMessage, setAuthMessage] = useState(null)
  const [hasAuthenticatedBefore, setHasAuthenticatedBefore] = useState(hasAuthenticatedDevice)

  const applySession = useCallback(nextSession => {
    const nextUser = nextSession?.user ?? null
    setSession(nextSession ?? null)
    setUser(nextUser)

    if (nextUser) {
      markAuthenticatedDevice()
      setHasAuthenticatedBefore(true)
      setAuthError(null)
      setAuthMessage(null)
      setTimeout(() => {
        ensureProfile(nextUser)
      }, 0)
    }
  }, [])

  useEffect(() => {
    let mounted = true

    async function initSession() {
      try {
        const { data, error } = await supabase.auth.getSession()

        if (!mounted) return

        if (error) {
          setAuthError(mapAuthError(error, "Impossible de récupérer votre session."))
          applySession(null)
        } else {
          applySession(data.session ?? null)
        }
      } catch (err) {
        console.error("Erreur initSession:", err)

        if (mounted) {
          setAuthError(mapAuthError(err, "Impossible de récupérer votre session."))
          applySession(null)
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    initSession()

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return

      applySession(nextSession ?? null)
      setLoading(false)

      if (event === "SIGNED_IN" && nextSession?.user) {
        markAuthenticatedDevice()
        setHasAuthenticatedBefore(true)
      }

      if (event === "SIGNED_OUT" || !nextSession) {
        const path = window.location.pathname
        if (isProtectedPath(path) || isAuthCallbackPath(path)) {
          setAuthMessage(SESSION_EXPIRED_MESSAGE)
          navigate(buildLoginPath(APP_ROUTE, "session_expired"), { replace: true })
        }
      }
    })

    return () => {
      mounted = false
      data?.subscription?.unsubscribe()
    }
  }, [applySession])

  const refreshSession = useCallback(async () => {
    const { data, error } = await supabase.auth.getSession()

    if (error) {
      setAuthError(mapAuthError(error, "Impossible de récupérer votre session."))
      applySession(null)
      throw toUserError(error, "Impossible de récupérer votre session.")
    }

    applySession(data.session ?? null)
    return data.session ?? null
  }, [applySession])

  const signIn = useCallback(async (email, password, options = {}) => {
    setAuthError(null)
    setAuthMessage(null)

    const { data, error } = await signInWithPasswordAuth(supabase, email, password)

    if (error) {
      const message = mapAuthError(error, "Impossible de vous connecter.")
      setAuthError(message)
      throw toUserError(error, "Impossible de vous connecter.")
    }

    applySession(data.session ?? null)

    if (!data.session) {
      const errorMessage = "Connexion validée, mais la session n'a pas été ouverte."
      setAuthError(errorMessage)
      throw new Error(errorMessage)
    }

    navigate(sanitizeNextPath(options.next), { replace: true })
    return data
  }, [applySession])

  const signUp = useCallback(async (email, password, nom, options = {}) => {
    setAuthError(null)
    setAuthMessage(null)

    const { data, error } = await signUpWithEmailAuth(supabase, {
      email,
      password,
      nom,
      emailRedirectTo: getAuthCallbackUrl(),
    })

    if (error) {
      const message = mapAuthError(error, "Impossible de créer le compte.")
      setAuthError(message)
      throw toUserError(error, "Impossible de créer le compte.")
    }

    if (data.session) {
      applySession(data.session)
      navigate(sanitizeNextPath(options.next), { replace: true })
      return { ...data, needsEmailConfirmation: false }
    }

    if (data.user) {
      setTimeout(() => {
        ensureProfile(data.user)
      }, 0)
    }

    return { ...data, needsEmailConfirmation: true }
  }, [applySession])

  const resetPassword = useCallback(async email => {
    setAuthError(null)

    const { data, error } = await resetPasswordForEmailAuth(supabase, {
      email,
      redirectTo: getResetPasswordRedirectUrl(),
    })

    if (error) {
      const message = mapAuthError(error, "Impossible d'envoyer l'email de réinitialisation.")
      setAuthError(message)
      throw toUserError(error, "Impossible d'envoyer l'email de réinitialisation.")
    }

    return data
  }, [])

  const updatePassword = useCallback(async newPassword => {
    setAuthError(null)

    const { data, error } = await supabase.auth.updateUser({
      password: newPassword,
    })

    if (error) {
      const message = mapAuthError(error, "Impossible de modifier le mot de passe.")
      setAuthError(message)
      throw toUserError(error, "Impossible de modifier le mot de passe.")
    }

    return data
  }, [])

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()

    if (error) {
      const message = mapAuthError(error, "Impossible de vous déconnecter.")
      setAuthError(message)
      throw toUserError(error, "Impossible de vous déconnecter.")
    }

    applySession(null)
    setAuthError(null)
    setAuthMessage(null)
    setHasAuthenticatedBefore(true)
    navigate("/login", { replace: true })
  }, [applySession])

  const signInWithGoogle = useCallback(async (options = {}) => {
    setAuthError(null)
    setAuthMessage(null)

    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("budgetkazpei:auth-next", sanitizeNextPath(options.next))
    }

    const { error } = await signInWithGoogleAuth(supabase, {
      redirectTo: getAuthCallbackUrl(),
    })

    if (error) {
      const message = mapAuthError(error, "Impossible de lancer la connexion Google.")
      setAuthError(message)
      throw toUserError(error, "Impossible de lancer la connexion Google.")
    }
  }, [])

  const value = useMemo(
    () => ({
      session,
      user,
      loading,
      authError,
      authMessage,
      hasAuthenticatedBefore,
      signIn,
      signUp,
      signOut,
      signInWithGoogle,
      resetPassword,
      updatePassword,
      refreshSession,
      clearAuthMessage: () => setAuthMessage(null),
    }),
    [
      session,
      user,
      loading,
      authError,
      authMessage,
      hasAuthenticatedBefore,
      signIn,
      signUp,
      signOut,
      signInWithGoogle,
      resetPassword,
      updatePassword,
      refreshSession,
    ]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuthContext() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error("useAuthContext must be used within AuthProvider")
  }

  return context
}
