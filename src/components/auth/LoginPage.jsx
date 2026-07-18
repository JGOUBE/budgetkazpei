import { useEffect, useRef, useState } from "react"
import AuthCard from "./AuthCard"
import AuthField from "./AuthField"
import AuthLayout from "./AuthLayout"
import AuthMessage from "./AuthMessage"
import GoogleAuthButton from "./GoogleAuthButton"
import PasswordField from "./PasswordField"
import { DISCOVER_ROUTE, REGISTER_ROUTE, navigate } from "../../services/authNavigation"

const EMAIL_EMPTY = "Entrez votre adresse e-mail."
const PASSWORD_EMPTY = "Entrez votre mot de passe."
const RESET_CONFIRMATION =
  "Si un compte correspond à cette adresse, un lien de réinitialisation sera envoyé."

function cleanError(error, fallback = "Impossible de vous connecter. Réessayez dans un instant.") {
  const raw = String(error?.message || error || "").toLowerCase()
  if (raw.includes("google")) return "La connexion avec Google n'a pas abouti. Réessayez."
  if (raw.includes("réseau") || raw.includes("network") || raw.includes("fetch")) {
    return "Impossible de contacter le service. Vérifiez votre connexion."
  }
  if (raw.includes("incorrect") || raw.includes("invalid")) {
    return "L'adresse e-mail ou le mot de passe est incorrect."
  }
  if (raw.includes("confirm")) return "Votre e-mail n'est pas encore confirmé. Vérifiez votre boîte mail."
  return error?.message && !/authapierror|invalid_grant|supabase|stack/i.test(error.message)
    ? error.message
    : fallback
}

export default function LoginPage({
  onLogin,
  onGoRegister,
  onGoogleLogin,
  onResetPassword,
  next = "/app",
  authMessage = "",
  onAuthMessageRead,
}) {
  const titleRef = useRef(null)
  const emailRef = useRef(null)
  const passwordRef = useRef(null)
  const [mode, setMode] = useState("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)

  useEffect(() => {
    titleRef.current?.focus()
    setTimeout(() => emailRef.current?.focus(), 0)
  }, [mode])

  useEffect(() => {
    if (!authMessage) return
    setErrors({ form: cleanError(authMessage, "Reconnectez-vous pour continuer.") })
    onAuthMessageRead?.()
  }, [authMessage, onAuthMessageRead])

  function focusFirstError(nextErrors) {
    if (nextErrors.email) emailRef.current?.focus()
    else if (nextErrors.password) passwordRef.current?.focus()
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (loading) return

    const nextErrors = {}
    if (!email.trim()) nextErrors.email = EMAIL_EMPTY
    if (!password) nextErrors.password = PASSWORD_EMPTY

    setMessage("")
    setErrors(nextErrors)

    if (Object.keys(nextErrors).length) {
      focusFirstError(nextErrors)
      return
    }

    setLoading(true)
    try {
      await onLogin(email.trim(), password, { next })
    } catch (error) {
      setErrors({ form: cleanError(error) })
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleLogin() {
    if (googleLoading || loading || resetLoading) return

    setErrors({})
    setMessage("")
    setGoogleLoading(true)
    try {
      await onGoogleLogin({ next })
    } catch (error) {
      setErrors({ form: cleanError(error, "La connexion avec Google n'a pas abouti. Réessayez.") })
      setGoogleLoading(false)
    }
  }

  async function handleResetPassword(event) {
    event.preventDefault()
    if (resetLoading) return

    const cleanEmail = email.trim()
    const nextErrors = {}
    if (!cleanEmail) nextErrors.email = EMAIL_EMPTY

    setErrors(nextErrors)
    setMessage("")

    if (Object.keys(nextErrors).length) {
      focusFirstError(nextErrors)
      return
    }

    setResetLoading(true)
    try {
      await onResetPassword(cleanEmail)
      setMessage(RESET_CONFIRMATION)
    } catch (error) {
      setErrors({ form: cleanError(error, "Impossible d'envoyer le lien. Réessayez dans un instant.") })
    } finally {
      setResetLoading(false)
    }
  }

  const busy = loading || googleLoading || resetLoading
  const isReset = mode === "reset"

  return (
    <AuthLayout
      title={isReset ? "Réinitialisez votre mot de passe." : "Heureux de vous revoir."}
      subtitle={
        isReset
          ? "Entrez votre e-mail. Nous vous indiquerons la suite sans révéler si un compte existe."
          : "Connectez-vous pour retrouver votre budget, vos tickets et vos démarches."
      }
      titleRef={titleRef}
    >
      <AuthCard busy={busy}>
        <AuthMessage type="error">{errors.form}</AuthMessage>
        <AuthMessage type="success">{message}</AuthMessage>

        {!isReset && (
          <>
            <GoogleAuthButton
              onClick={handleGoogleLogin}
              loading={googleLoading}
              disabled={loading || resetLoading}
            />
            <div className="auth-divider">ou avec l'e-mail</div>
          </>
        )}

        <form className="auth-form" onSubmit={isReset ? handleResetPassword : handleSubmit} noValidate aria-busy={busy}>
          <AuthField
            ref={emailRef}
            id="login-email"
            label="Adresse e-mail"
            type="email"
            value={email}
            onChange={event => setEmail(event.target.value)}
            autoComplete="email"
            inputMode="email"
            error={errors.email}
            required
          />

          {!isReset && (
            <>
              <PasswordField
                ref={passwordRef}
                id="login-password"
                label="Mot de passe"
                value={password}
                onChange={event => setPassword(event.target.value)}
                autoComplete="current-password"
                error={errors.password}
                required
              />
              <div className="auth-row">
                <button type="button" className="auth-text-button" onClick={() => setMode("reset")}>
                  Mot de passe oublié ?
                </button>
              </div>
            </>
          )}

          <button type="submit" className="auth-primary-button" disabled={busy} aria-busy={isReset ? resetLoading : loading}>
            {isReset
              ? resetLoading ? "Envoi du lien..." : "Envoyer le lien"
              : loading ? "Connexion en cours..." : "Connexion"}
          </button>
        </form>

        {isReset ? (
          <p className="auth-switch">
            <button type="button" className="auth-text-button" onClick={() => setMode("login")}>
              Retour à la connexion
            </button>
          </p>
        ) : (
          <div className="auth-switch">
            <p>
              Pas encore de compte ?{" "}
              <button type="button" className="auth-text-button" onClick={onGoRegister || (() => navigate(REGISTER_ROUTE))}>
                Créer un compte
              </button>
            </p>
            <button type="button" className="auth-text-button" onClick={() => navigate(DISCOVER_ROUTE)}>
              Découvrir BudgetKazPei
            </button>
          </div>
        )}
      </AuthCard>
    </AuthLayout>
  )
}
