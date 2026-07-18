export default function GoogleAuthButton({
  onClick,
  loading = false,
  disabled = false,
  label = "Continuer avec Google",
  loadingLabel = "Ouverture de Google...",
}) {
  return (
    <button
      type="button"
      className="auth-google-button"
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading}
    >
      <img src="/icons-creole/google-logo.png" alt="" aria-hidden="true" />
      <span>{loading ? loadingLabel : label}</span>
    </button>
  )
}
