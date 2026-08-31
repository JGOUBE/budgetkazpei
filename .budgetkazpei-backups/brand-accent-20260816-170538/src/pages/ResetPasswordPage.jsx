import { useEffect, useRef, useState } from "react"
import AuthCard from "../components/auth/AuthCard"
import AuthField from "../components/auth/AuthField"
import AuthLayout from "../components/auth/AuthLayout"
import AuthMessage from "../components/auth/AuthMessage"
import PasswordField from "../components/auth/PasswordField"
import { useAuth } from "../hooks/useAuth"
import { LOGIN_ROUTE, mapAuthError, navigate } from "../services/authNavigation"

function cleanResetError(error) {
  const raw = String(error?.message || error || "").toLowerCase()
  if (raw.includes("expired") || raw.includes("invalid") || raw.includes("grant")) {
    return "Ce lien n'est plus valide. Demandez un nouveau lien de réinitialisation."
  }
  return mapAuthError(error, "Impossible de modifier le mot de passe.")
}

export default function ResetPasswordPage() {
  const { updatePassword, resetPassword } = useAuth()
  const titleRef = useRef(null)
  const passwordRef = useRef(null)
  const confirmRef = useRef(null)
  const emailRef = useRef(null)
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [email, setEmail] = useState("")
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState("")
  const [requestMode, setRequestMode] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    titleRef.current?.focus()
    setTimeout(() => (requestMode ? emailRef.current?.focus() : passwordRef.current?.focus()), 0)
  }, [requestMode])

  function focusFirstError(nextErrors) {
    if (nextErrors.password) passwordRef.current?.focus()
    else if (nextErrors.confirmPassword) confirmRef.current?.focus()
    else if (nextErrors.email) emailRef.current?.focus()
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (loading) return

    const nextErrors = {}
    if (!password) nextErrors.password = "Entrez un nouveau mot de passe."
    else if (password.length < 6) nextErrors.password = "Choisissez un mot de passe d'au moins 6 caractères."
    if (!confirmPassword) nextErrors.confirmPassword = "Confirmez le nouveau mot de passe."
    else if (password !== confirmPassword) nextErrors.confirmPassword = "Les deux mots de passe ne correspondent pas."

    setErrors(nextErrors)
    setMessage("")

    if (Object.keys(nextErrors).length) {
      focusFirstError(nextErrors)
      return
    }

    setLoading(true)
    try {
      await updatePassword(password)
      setMessage("Mot de passe modifié avec succès. Vous pouvez retourner à la connexion.")
      setPassword("")
      setConfirmPassword("")
    } catch (error) {
      setErrors({ form: cleanResetError(error) })
    } finally {
      setLoading(false)
    }
  }

  async function handleRequestLink(event) {
    event.preventDefault()
    if (loading) return

    const cleanEmail = email.trim()
    const nextErrors = {}
    if (!cleanEmail) nextErrors.email = "Entrez votre adresse e-mail."

    setErrors(nextErrors)
    setMessage("")

    if (Object.keys(nextErrors).length) {
      focusFirstError(nextErrors)
      return
    }

    setLoading(true)
    try {
      await resetPassword(cleanEmail)
      setMessage("Si un compte correspond à cette adresse, un lien de réinitialisation sera envoyé.")
    } catch (error) {
      setErrors({ form: mapAuthError(error, "Impossible d'envoyer un nouveau lien.") })
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title={requestMode ? "Demandez un nouveau lien." : "Choisissez un nouveau mot de passe."}
      subtitle={
        requestMode
          ? "Le message reste volontairement neutre pour protéger votre compte."
          : "Saisissez un mot de passe, confirmez-le, puis retournez à la connexion."
      }
      sideTitle="Un accès clair, même quand le lien expire."
      sideText="BudgetKazPei évite les erreurs techniques brutes et vous propose une nouvelle demande de lien si nécessaire."
      titleRef={titleRef}
    >
      <AuthCard busy={loading}>
        <AuthMessage type="error">{errors.form}</AuthMessage>
        <AuthMessage type="success">{message}</AuthMessage>

        {requestMode ? (
          <form className="auth-form" onSubmit={handleRequestLink} noValidate aria-busy={loading}>
            <AuthField
              ref={emailRef}
              id="reset-email"
              label="Adresse e-mail"
              type="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
              autoComplete="email"
              inputMode="email"
              error={errors.email}
              required
            />
            <button type="submit" className="auth-primary-button" disabled={loading} aria-busy={loading}>
              {loading ? "Envoi du lien..." : "Envoyer un nouveau lien"}
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit} noValidate aria-busy={loading}>
            <PasswordField
              ref={passwordRef}
              id="reset-password"
              label="Nouveau mot de passe"
              value={password}
              onChange={event => setPassword(event.target.value)}
              autoComplete="new-password"
              hint="Minimum 6 caractères."
              error={errors.password}
              required
            />
            <PasswordField
              ref={confirmRef}
              id="reset-confirm-password"
              label="Confirmer le mot de passe"
              value={confirmPassword}
              onChange={event => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              error={errors.confirmPassword}
              required
            />
            <button type="submit" className="auth-primary-button" disabled={loading} aria-busy={loading}>
              {loading ? "Modification en cours..." : "Modifier le mot de passe"}
            </button>
          </form>
        )}

        <div className="auth-row">
          <button type="button" className="auth-text-button" onClick={() => setRequestMode(value => !value)}>
            {requestMode ? "J'ai déjà un lien" : "Demander un nouveau lien"}
          </button>
          <button type="button" className="auth-text-button" onClick={() => navigate(LOGIN_ROUTE, { replace: true })}>
            Retour connexion
          </button>
        </div>
      </AuthCard>
    </AuthLayout>
  )
}
