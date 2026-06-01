import { useState } from "react"

const COLORS = {
  bg: "#0A1628",
  card: "#0F1E38",
  cardLight: "#152444",
  border: "#1E3A5F",
  accent: "#F97316",
  green: "#22C55E",
  red: "#EF4444",
  muted: "#64748B",
  text: "#F1F5F9",
}

export default function LoginPage({ onLogin, onGoRegister, onGoogleLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await onLogin(email, password)
    } catch (err) {
      setError(err.message || 'Erreur de connexion')
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleLogin() {
    setError('')
    setGoogleLoading(true)

    try {
      await onGoogleLogin()
    } catch (err) {
      setError(err.message || 'Erreur Google login')
      setGoogleLoading(false)
    }
  }

  const inputStyle = {
    background: COLORS.cardLight,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 10,
    padding: "12px 16px",
    color: COLORS.text,
    fontSize: 14,
    width: "100%",
    outline: "none",
    fontFamily: "inherit",
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: COLORS.bg,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'DM Sans', sans-serif",
    }}>
      <div style={{ width: 400, maxWidth: "90vw" }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🌴</div>
          <h1 style={{
            margin: 0,
            fontSize: 28,
            fontFamily: "'DM Serif Display', serif",
            color: COLORS.text,
          }}>
            BudgetKazPei
          </h1>
          <p style={{ margin: "6px 0 0", color: COLORS.muted, fontSize: 14 }}>
            Gérez votre budget facilement
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: COLORS.card,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 20,
          padding: 32,
        }}>
          <h2 style={{ margin: "0 0 24px", fontSize: 20, color: COLORS.text }}>
            Connexion
          </h2>

          {/* 🔵 GOOGLE LOGIN BUTTON */}
          <button
            onClick={handleGoogleLogin}
            disabled={googleLoading}
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: 12,
              border: `1px solid ${COLORS.border}`,
              background: "#fff",
              color: "#000",
              fontWeight: 600,
              cursor: googleLoading ? "not-allowed" : "pointer",
              marginBottom: 16,
            }}
          >
            {googleLoading ? "Connexion Google..." : "🔵 Continuer avec Google"}
          </button>

          {/* Divider */}
          <div style={{
            textAlign: "center",
            color: COLORS.muted,
            margin: "10px 0 20px",
            fontSize: 12
          }}>
            ─── ou ───
          </div>

          {/* FORM */}
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            <div>
              <label style={{ fontSize: 13, color: COLORS.muted, marginBottom: 6, display: "block" }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={inputStyle}
                required
              />
            </div>

            <div>
              <label style={{ fontSize: 13, color: COLORS.muted, marginBottom: 6, display: "block" }}>
                Mot de passe
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={inputStyle}
                required
              />
            </div>

            {error && (
              <div style={{
                background: `${COLORS.red}15`,
                border: `1px solid ${COLORS.red}33`,
                borderRadius: 8,
                padding: "10px 14px",
                fontSize: 13,
                color: COLORS.red,
              }}>
                ⚠️ {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                background: loading ? COLORS.muted : COLORS.accent,
                border: "none",
                borderRadius: 12,
                padding: "13px 0",
                color: "#fff",
                fontSize: 15,
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Connexion..." : "Se connecter"}
            </button>
          </form>

          {/* REGISTER */}
          <p style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: COLORS.muted }}>
            Pas encore de compte ?{" "}
            <button
              onClick={onGoRegister}
              style={{
                background: "none",
                border: "none",
                color: COLORS.accent,
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Créer un compte
            </button>
          </p>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;600;700&display=swap');
      `}</style>
    </div>
  )
}