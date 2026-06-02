import { useState } from "react"

const COLORS = {
  bg: "#0A1628",
  card: "#0F1E38",
  cardLight: "#152444",
  border: "#1E3A5F",
  ink: "#05080C",
  cream: "#F8ECD0",
  paper: "#FFF6DE",
  blue: "#0E63A6",
  accent: "#F97316",
  yellow: "#F5C518",
  green: "#177A51",
  red: "#EF4444",
  muted: "#8AA0BD",
  text: "#F1F5F9",
}

export default function LoginPage({ onLogin, onGoRegister, onGoogleLogin }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      await onLogin(email, password)
    } catch (err) {
      setError(err.message || "Erreur de connexion")
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleLogin() {
    setError("")
    setGoogleLoading(true)

    try {
      await onGoogleLogin()
    } catch (err) {
      setError(err.message || "Erreur Google login")
      setGoogleLoading(false)
    }
  }

  const fieldWrapStyle = {
    width: "100%",
    maxWidth: 340,
    margin: "0 auto",
  }

  const inputStyle = {
    display: "block",
    width: "100%",
    boxSizing: "border-box",
    background: COLORS.paper,
    border: `3px solid ${COLORS.ink}`,
    borderRadius: 10,
    padding: "13px 16px",
    color: COLORS.ink,
    fontSize: 15,
    fontWeight: 800,
    outline: "none",
    fontFamily: "inherit",
    boxShadow: `5px 5px 0 ${COLORS.ink}`,
  }

  const labelStyle = {
    display: "block",
    textAlign: "center",
    marginBottom: 9,
    color: COLORS.cream,
    fontSize: 13,
    fontWeight: 900,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    textShadow: `2px 2px 0 ${COLORS.ink}`,
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: COLORS.bg,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'DM Sans', sans-serif",
      padding: "32px 18px",
    }}>
      <div style={{ width: 440, maxWidth: "94vw" }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 34 }}>
          <div style={{
            position: "relative",
            width: 300,
            maxWidth: "100%",
            height: 84,
            margin: "0 auto",
          }}>
            <img
              src="/icons-creole/palmier.png"
              alt=""
              aria-hidden="true"
              style={{
                position: "absolute",
                left: 56,
                top: -12,
                width: 62,
                height: 62,
                objectFit: "contain",
                transform: "rotate(-8deg)",
                filter: `drop-shadow(2px 3px 0 ${COLORS.ink})`,
              }}
            />
            <h1 style={{
              position: "absolute",
              left: "50%",
              top: 30,
              margin: 0,
              transform: "translateX(-40%) rotate(-2deg)",
              fontSize: 32,
              lineHeight: 0.9,
              fontFamily: "Impact, 'Arial Black', 'DM Serif Display', Georgia, serif",
              color: COLORS.cream,
              letterSpacing: -0.5,
              textShadow: `3px 3px 0 ${COLORS.ink}`,
              whiteSpace: "nowrap",
            }}>
              BudgetKazPei
            </h1>
          </div>
          <p style={{
            margin: "2px 0 0",
            color: "#23D3D6",
            fontSize: 15,
            fontWeight: 700,
            textShadow: "1px 1px 0 rgba(5, 8, 12, 0.8)",
          }}>
            Gérez votre budget facilement
          </p>
        </div>

        {/* Card */}
        <div style={{
          position: "relative",
          overflow: "hidden",
          background: `
            linear-gradient(145deg, rgba(7, 16, 31, 0.98) 0%, rgba(13, 36, 68, 0.97) 58%, rgba(24, 82, 128, 0.93) 100%),
            ${COLORS.card}
          `,
          border: `3px solid ${COLORS.ink}`,
          borderRadius: 22,
          padding: "34px 28px 30px",
          boxShadow: `9px 9px 0 ${COLORS.ink}, 0 26px 70px rgba(0, 0, 0, 0.35)`,
        }}>
          <img
            src="/icons-creole/palmier.png"
            alt=""
            aria-hidden="true"
            style={{
              position: "absolute",
              width: 220,
              height: 220,
              objectFit: "contain",
              right: -76,
              top: -48,
              opacity: 0.11,
              transform: "rotate(-18deg)",
              pointerEvents: "none",
            }}
          />
          <img
            src="/icons-creole/palmier.png"
            alt=""
            aria-hidden="true"
            style={{
              position: "absolute",
              width: 200,
              height: 200,
              objectFit: "contain",
              left: -84,
              bottom: 10,
              opacity: 0.085,
              transform: "rotate(22deg)",
              pointerEvents: "none",
            }}
          />
          <img
            src="/icons-creole/palmier.png"
            alt=""
            aria-hidden="true"
            style={{
              position: "absolute",
              width: 140,
              height: 140,
              objectFit: "contain",
              right: 26,
              bottom: -50,
              opacity: 0.075,
              transform: "rotate(8deg)",
              pointerEvents: "none",
            }}
          />

          <div style={{ position: "relative", zIndex: 1 }}>
            <h2 style={{
              margin: "0 0 26px",
              fontSize: 26,
              color: COLORS.cream,
              textAlign: "center",
              fontFamily: "Impact, 'Arial Black', 'DM Serif Display', Georgia, serif",
              letterSpacing: 0.3,
              textShadow: `3px 3px 0 ${COLORS.ink}`,
            }}>
              Connexion
            </h2>

            <div style={{ width: "100%", maxWidth: 340, margin: "0 auto" }}>
              <button
                onClick={handleGoogleLogin}
                disabled={googleLoading}
                style={{
                  width: "100%",
                  padding: "11px 16px",
                  borderRadius: 12,
                  border: `3px solid ${COLORS.ink}`,
                  background: COLORS.paper,
                  color: COLORS.ink,
                  fontWeight: 900,
                  cursor: googleLoading ? "not-allowed" : "pointer",
                  marginBottom: 18,
                  boxShadow: `5px 5px 0 ${COLORS.ink}`,
                  fontSize: 15,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                }}
              >
                {!googleLoading && (
                  <img
                    src="/icons-creole/google-logo.png"
                    alt=""
                    aria-hidden="true"
                    style={{
                      width: 28,
                      height: 28,
                      objectFit: "contain",
                      flexShrink: 0,
                    }}
                  />
                )}
                <span>{googleLoading ? "Connexion Google..." : "Continuer avec Google"}</span>
              </button>
            </div>

            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              width: "100%",
              maxWidth: 260,
              margin: "16px auto 24px",
              color: COLORS.muted,
              fontSize: 12,
              fontWeight: 800,
            }}>
              <span style={{ height: 2, flex: 1, background: "rgba(248, 236, 208, 0.28)" }} />
              <span>OU</span>
              <span style={{ height: 2, flex: 1, background: "rgba(248, 236, 208, 0.28)" }} />
            </div>

            <form
              onSubmit={handleSubmit}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 18,
              }}
            >
              <div style={fieldWrapStyle}>
                <label style={labelStyle}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  style={inputStyle}
                  required
                />
              </div>

              <div style={fieldWrapStyle}>
                <label style={labelStyle}>Mot de passe</label>
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
                  width: "100%",
                  maxWidth: 340,
                  margin: "0 auto",
                  background: `${COLORS.red}18`,
                  border: `2px solid ${COLORS.red}`,
                  borderRadius: 10,
                  padding: "10px 14px",
                  fontSize: 13,
                  color: "#FFD6D6",
                  fontWeight: 700,
                }}>
                  ⚠️ {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: "100%",
                  maxWidth: 340,
                  margin: "2px auto 0",
                  background: loading ? COLORS.muted : COLORS.accent,
                  border: `3px solid ${COLORS.ink}`,
                  borderRadius: 12,
                  padding: "14px 0",
                  color: "#fff",
                  fontSize: 17,
                  fontWeight: 900,
                  cursor: loading ? "not-allowed" : "pointer",
                  boxShadow: `5px 5px 0 ${COLORS.ink}`,
                  textShadow: `1px 1px 0 ${COLORS.ink}`,
                }}
              >
                {loading ? "Connexion..." : "Se connecter"}
              </button>
            </form>

            <p style={{ textAlign: "center", margin: "24px 0 0", fontSize: 13, color: COLORS.muted }}>
              Pas encore de compte ?{" "}
              <button
                onClick={onGoRegister}
                style={{
                  background: "none",
                  border: "none",
                  color: COLORS.accent,
                  cursor: "pointer",
                  fontWeight: 900,
                  padding: 0,
                }}
              >
                Créer un compte
              </button>
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;600;700;800;900&display=swap');
      `}</style>
    </div>
  )
}
