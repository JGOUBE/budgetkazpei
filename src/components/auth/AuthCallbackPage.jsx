import { useEffect } from "react"
import { useAuth } from "../../hooks/useAuth"
import {
  APP_ROUTE,
  LOGIN_ROUTE,
  navigate,
  sanitizeNextPath,
} from "../../services/authNavigation"
import AuthLoadingScreen from "./AuthLoadingScreen"
import { createColorAliases, ds } from "../../styles/designSystem"

const COLORS = createColorAliases()

function getStoredNext() {
  if (typeof window === "undefined") return APP_ROUTE

  const next = window.sessionStorage.getItem("budgetkazpei:auth-next")
  window.sessionStorage.removeItem("budgetkazpei:auth-next")
  return sanitizeNextPath(next)
}

export default function AuthCallbackPage() {
  const { user, loading, authError } = useAuth()

  useEffect(() => {
    if (!loading && user) {
      navigate(getStoredNext(), { replace: true })
    }
  }, [loading, user])

  if (loading || user) {
    return <AuthLoadingScreen />
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: ds.appBackground,
        color: COLORS.text,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: 420,
          background: COLORS.card,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 18,
          padding: 24,
          boxShadow: COLORS.shadow,
          textAlign: "center",
        }}
      >
        <h1 style={{ margin: "0 0 10px", color: COLORS.text }}>Connexion interrompue</h1>
        <p role="alert" style={{ margin: "0 0 18px", color: COLORS.muted, fontWeight: 800 }}>
          {authError || "Reconnectez-vous pour continuer."}
        </p>
        <button
          type="button"
          onClick={() => navigate(LOGIN_ROUTE, { replace: true })}
          style={{
            border: "none",
            borderRadius: 12,
            background: COLORS.accent,
            color: "#fff",
            fontWeight: 900,
            padding: "12px 18px",
            cursor: "pointer",
          }}
        >
          Se connecter
        </button>
      </section>
    </main>
  )
}
