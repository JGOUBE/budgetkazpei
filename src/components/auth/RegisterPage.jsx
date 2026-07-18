import { useEffect, useRef, useState } from "react"
import AuthCard from "./AuthCard"
import AuthField from "./AuthField"
import AuthLayout from "./AuthLayout"
import AuthMessage from "./AuthMessage"
import GoogleAuthButton from "./GoogleAuthButton"
import PasswordField from "./PasswordField"
import { DISCOVER_ROUTE, LOGIN_ROUTE, navigate } from "../../services/authNavigation"

function cleanError(error, fallback = "Impossible de créer le compte. Réessayez dans un instant.") {
  const raw = String(error?.message || error || "").toLowerCase()
  if (raw.includes("already") || raw.includes("existe")) {
    return "Un compte existe déjà avec cette adresse. Essayez de vous connecter."
  }
  if (raw.includes("weak") || raw.includes("faible") || raw.includes("password")) {
    return "Choisissez un mot de passe plus long et plus difficile à deviner."
  }
  if (raw.includes("google")) return "La connexion avec Google n'a pas abouti. Réessayez."
  if (raw.includes("network") || raw.includes("fetch") || raw.includes("réseau")) {
    return "Impossible de contacter le service. Vérifiez votre connexion."
  }
  return error?.message && !/authapierror|invalid_grant|supabase|stack/i.test(error.message)
    ? error.message
    : fallback
}

function maskEmail(address) {
  const [name = "", domain = ""] = address.split("@")
  if (!name || !domain) return address
  const safeName = name.length <= 2 ? `${name[0] || ""}...` : `${name.slice(0, 2)}...${name.slice(-1)}`
  return `${safeName}@${domain}`
}

export default function RegisterPage({
  onRegister,
  onGoLogin,
  onGoogleLogin,
  next = "/app",
}) {
  const titleRef = useRef(null)
  const nameRef = useRef(null)
  const emailRef = useRef(null)
  const passwordRef = useRef(null)
  const confirmRef = useRef(null)
  const termsRef = useRef(null)
  const [nom, setNom] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [errors, setErrors] = useState({})
  const [successEmail, setSuccessEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  useEffect(() => {
    titleRef.current?.focus()
    setTimeout(() => nameRef.current?.focus(), 0)
  }, [successEmail])

  function focusFirstError(nextErrors) {
    if (nextErrors.nom) nameRef.current?.focus()
    else if (nextErrors.email) emailRef.current?.focus()
    else if (nextErrors.password) passwordRef.current?.focus()
    else if (nextErrors.confirm) confirmRef.current?.focus()
    else if (nextErrors.terms) termsRef.current?.focus()
  }

  function validate() {
    const nextErrors = {}
    if (!email.trim()) nextErrors.email = "Entrez votre adresse e-mail."
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) nextErrors.email = "Entrez une adresse e-mail valide."
    if (!password) nextErrors.password = "Choisissez un mot de passe."
    else if (password.length < 6) nextErrors.password = "Choisissez un mot de passe d'au moins 6 caractères."
    if (!confirm) nextErrors.confirm = "Confirmez votre mot de passe."
    else if (password !== confirm) nextErrors.confirm = "Les deux mots de passe ne correspondent pas."
    if (!acceptedTerms) nextErrors.terms = "Vous devez accepter les conditions pour créer votre compte."
    return nextErrors
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (loading || googleLoading) return

    const nextErrors = validate()
    setErrors(nextErrors)

    if (Object.keys(nextErrors).length) {
      focusFirstError(nextErrors)
      return
    }

    setLoading(true)
    try {
      const result = await onRegister(email.trim(), password, nom.trim(), { next })
      if (result?.needsEmailConfirmation !== false) {
        setSuccessEmail(email.trim())
      }
    } catch (error) {
      setErrors({ form: cleanError(error) })
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleLogin() {
    if (googleLoading || loading) return

    if (!acceptedTerms) {
      const nextErrors = { terms: "Vous devez accepter les conditions pour crÃ©er votre compte." }
      setErrors(nextErrors)
      focusFirstError(nextErrors)
      return
    }

    setErrors({})
    setGoogleLoading(true)
    try {
      await onGoogleLogin({ next })
    } catch (error) {
      setErrors({ form: cleanError(error, "La connexion avec Google n'a pas abouti. Réessayez.") })
      setGoogleLoading(false)
    }
  }

  if (successEmail) {
    return (
      <AuthLayout
        title="Vérifiez votre boîte mail."
        subtitle="Votre compte est créé, mais il doit encore être confirmé avant l'ouverture de session."
        titleRef={titleRef}
      >
        <AuthCard>
          <AuthMessage type="success">
            Un lien de confirmation a été envoyé à {maskEmail(successEmail)}. Vérifiez aussi vos spams.
          </AuthMessage>
          <p>
            Si votre projet Supabase confirme les comptes par e-mail, la session ne sera ouverte qu'après
            validation du lien.
          </p>
          <button type="button" className="auth-primary-button" onClick={onGoLogin || (() => navigate(LOGIN_ROUTE))}>
            Retour à la connexion
          </button>
        </AuthCard>
      </AuthLayout>
    )
  }

  const busy = loading || googleLoading

  return (
    <AuthLayout
      title="Créez votre espace BudgetKazPei."
      subtitle="Commencez gratuitement et complétez votre profil plus tard, à votre rythme."
      sideTitle="Un compte d'abord, le profil ensuite."
      sideText="Revenus, aides, famille ou Conseiller se complètent progressivement dans l'application, quand ces informations deviennent utiles."
      titleRef={titleRef}
    >
      <AuthCard busy={busy}>
        <AuthMessage type="error">{errors.form}</AuthMessage>

        <GoogleAuthButton
          onClick={handleGoogleLogin}
          loading={googleLoading}
          disabled={loading}
          label="Créer avec Google"
          loadingLabel="Ouverture de Google..."
        />
        <div className="auth-divider">ou créer avec l'e-mail</div>

        <form className="auth-form" onSubmit={handleSubmit} noValidate aria-busy={busy}>
          <AuthField
            ref={nameRef}
            id="register-name"
            label="Prénom ou nom d'usage"
            type="text"
            value={nom}
            onChange={event => setNom(event.target.value)}
            autoComplete="given-name"
            hint="Facultatif. Vous pourrez compléter votre profil plus tard."
            error={errors.nom}
          />
          <AuthField
            ref={emailRef}
            id="register-email"
            label="Adresse e-mail"
            type="email"
            value={email}
            onChange={event => setEmail(event.target.value)}
            autoComplete="email"
            inputMode="email"
            error={errors.email}
            required
          />
          <PasswordField
            ref={passwordRef}
            id="register-password"
            label="Mot de passe"
            value={password}
            onChange={event => setPassword(event.target.value)}
            autoComplete="new-password"
            hint="Minimum 6 caractères. Évitez les mots de passe trop évidents."
            error={errors.password}
            required
          />
          <PasswordField
            ref={confirmRef}
            id="register-confirm"
            label="Confirmer le mot de passe"
            value={confirm}
            onChange={event => setConfirm(event.target.value)}
            autoComplete="new-password"
            error={errors.confirm}
            required
          />

          <label className="auth-checkbox">
            <input
              ref={termsRef}
              type="checkbox"
              checked={acceptedTerms}
              onChange={event => setAcceptedTerms(event.target.checked)}
              aria-invalid={Boolean(errors.terms)}
              aria-describedby={errors.terms ? "register-terms-error" : undefined}
            />
            <span>
              J'accepte les <a href="/terms">conditions d'utilisation</a> et la{" "}
              <a href="/privacy">politique de confidentialité</a>.
              {errors.terms && <em id="register-terms-error" role="alert">{errors.terms}</em>}
            </span>
          </label>

          <button type="submit" className="auth-primary-button" disabled={busy} aria-busy={loading}>
            {loading ? "Création du compte..." : "Créer mon compte"}
          </button>
          <p className="auth-field__hint">Aucune carte bancaire nécessaire.</p>
        </form>

        <div className="auth-switch">
          <p>
            Déjà un compte ?{" "}
            <button type="button" className="auth-text-button" onClick={onGoLogin || (() => navigate(LOGIN_ROUTE))}>
              Se connecter
            </button>
          </p>
          <button type="button" className="auth-text-button" onClick={() => navigate(DISCOVER_ROUTE)}>
            Découvrir BudgetKazPei
          </button>
        </div>
      </AuthCard>
    </AuthLayout>
  )
}
