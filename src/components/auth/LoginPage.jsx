import { useState } from "react"

const COLORS = {
  bg: "#0A1628",
  card: "#0F1E38",
  ink: "#05080C",
  cream: "#F8ECD0",
  paper: "#FFF6DE",
  accent: "#F97316",
  red: "#EF4444",
  muted: "#8AA0BD",
  cyan: "#23D3D6",
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
    maxWidth: 350,
    margin: "0 auto",
  }

  const inputStyle = {
    display: "block",
    width: "100%",
    boxSizing: "border-box",
    background: COLORS.paper,
    border: `3px solid ${COLORS.ink}`,
    borderRadius: 12,
    padding: "15px 17px",
    color: COLORS.ink,
    fontSize: 16,
    fontWeight: 800,
    outline: "none",
    fontFamily: "inherit",
    boxShadow: `6px 6px 0 ${COLORS.ink}`,
  }

  const labelStyle = {
    display: "block",
    textAlign: "center",
    marginBottom: 10,
    color: COLORS.cream,
    fontSize: 14,
    fontWeight: 900,
    letterSpacing: 0.9,
    textTransform: "uppercase",
    textShadow: `2px 2px 0 ${COLORS.ink}`,
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top, rgba(35,211,214,.20), transparent 36%), linear-gradient(180deg, #06111F 0%, #0A1628 55%, #06111F 100%)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        fontFamily: "'DM Sans', sans-serif",
        padding: "8px 0 36px",
        overflowX: "hidden",
        overflowY: "auto",
      }}
    >
      <div
        style={{
          width: 460,
          maxWidth: "100vw",
          position: "relative",
          overflow: "visible",
          padding: "0 18px",
          boxSizing: "border-box",
        }}
      >
        <img
          src="/icons-creole/palmier.png"
          alt=""
          aria-hidden="true"
          style={{
            position: "absolute",
            width: 420,
            height: 420,
            objectFit: "contain",
            right: -160,
            top: -115,
            opacity: 0.25,
            transform: "rotate(-18deg)",
            pointerEvents: "none",
            filter: "drop-shadow(0 0 26px rgba(35,211,214,.18))",
          }}
        />

        <img
          src="/icons-creole/palmier.png"
          alt=""
          aria-hidden="true"
          style={{
            position: "absolute",
            width: 360,
            height: 360,
            objectFit: "contain",
            left: -160,
            bottom: 40,
            opacity: 0.18,
            transform: "rotate(18deg)",
            pointerEvents: "none",
            filter: "drop-shadow(0 0 26px rgba(35,211,214,.14))",
          }}
        />

        <div
          style={{
            textAlign: "center",
            marginBottom: 18,
            position: "relative",
            zIndex: 1,
            overflow: "visible",
          }}
        >
          <img
            src="/icons-creole/logo-budgetkazpei.png"
            alt="BudgetKazPei"
            style={{
              display: "block",
              width: "118vw",
              maxWidth: 620,
              minWidth: 430,
              height: "auto",
              marginLeft: "45%",
              transform: "translateX(-50%)",
              marginTop: 30,
                        marginBottom: -78,
              objectFit: "contain",
              filter:
                "drop-shadow(4px 8px 0 rgba(5,8,12,.88)) drop-shadow(0 0 22px rgba(35,211,214,.28))",
              position: "relative",
              zIndex: 2,
            }}
          />

          <p
            style={{
              margin: "-8px 0 20px",
              color: COLORS.cyan,
              fontSize: 20,
              fontWeight: 900,
              fontFamily: "Poppins, 'DM Sans', sans-serif",
              letterSpacing: 0.2,
              textTransform: "uppercase",
              transform: "rotate(-3deg)",
              display: "inline-block",
              textShadow:
                "3px 3px 0 rgba(5,8,12,.90), 0 0 18px rgba(35,211,214,.55)",
              position: "relative",
              zIndex: 3,
            }}
          >
            Fasilman gèr ou larzan
          </p>
        </div>

        <div
          style={{
            position: "relative",
            overflow: "hidden",
            background: `
              linear-gradient(145deg, rgba(7,16,31,.96) 0%, rgba(13,36,68,.96) 56%, rgba(24,82,128,.92) 100%),
              ${COLORS.card}
            `,
            border: `3px solid ${COLORS.ink}`,
            borderRadius: 28,
            padding: "38px 30px 32px",
            boxShadow:
              `10px 10px 0 ${COLORS.ink}, 0 30px 80px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.06)`,
          }}
        >
          <img
            src="/icons-creole/palmier.png"
            alt=""
            aria-hidden="true"
            style={{
              position: "absolute",
              width: 400,
              height: 400,
              objectFit: "contain",
              right: -105,
              top: -85,
              opacity: 0.34,
              transform: "rotate(-16deg)",
              pointerEvents: "none",
              filter: "drop-shadow(0 0 25px rgba(35,211,214,.22))",
            }}
          />

          <img
            src="/icons-creole/palmier.png"
            alt=""
            aria-hidden="true"
            style={{
              position: "absolute",
              width: 410,
              height: 410,
              objectFit: "contain",
              left: -150,
              bottom: 130,
              opacity: 0.30,
              transform: "rotate(21deg)",
              pointerEvents: "none",
              filter: "drop-shadow(0 0 25px rgba(35,211,214,.18))",
            }}
          />

          <img
            src="/icons-creole/palmier.png"
            alt=""
            aria-hidden="true"
            style={{
              position: "absolute",
              width: 330,
              height: 330,
              objectFit: "contain",
              right: -35,
              bottom: -82,
              opacity: 0.25,
              transform: "rotate(8deg)",
              pointerEvents: "none",
              filter: "drop-shadow(0 0 25px rgba(35,211,214,.16))",
            }}
          />

          <div style={{ position: "relative", zIndex: 1 }}>
            <h2
              style={{
                margin: "0 0 28px",
                fontSize: 34,
                color: COLORS.cream,
                textAlign: "center",
                fontFamily:
                  "Impact, 'Arial Black', 'DM Serif Display', Georgia, serif",
                letterSpacing: 0.3,
                textShadow:
                  `4px 4px 0 ${COLORS.ink}, 0 0 18px rgba(248,236,208,.18)`,
              }}
            >
              Connexion
            </h2>

            <div style={{ width: "100%", maxWidth: 350, margin: "0 auto" }}>
              <button
                onClick={handleGoogleLogin}
                disabled={googleLoading}
                style={{
                  width: "100%",
                  padding: "14px 18px",
                  borderRadius: 14,
                  border: `3px solid ${COLORS.ink}`,
                  background:
                    "linear-gradient(180deg, #FFF9E9 0%, #FFF2D0 100%)",
                  color: COLORS.ink,
                  fontWeight: 900,
                  cursor: googleLoading ? "not-allowed" : "pointer",
                  marginBottom: 20,
                  boxShadow: `6px 6px 0 ${COLORS.ink}`,
                  fontSize: 18,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                  fontFamily: "inherit",
                }}
              >
                {!googleLoading && (
                  <img
                    src="/icons-creole/google-logo.png"
                    alt=""
                    aria-hidden="true"
                    style={{
                      width: 40,
                      height: 40,
                      objectFit: "contain",
                      flexShrink: 0,
                      marginRight: 2,
                    }}
                  />
                )}

                <span>
                  {googleLoading
                    ? "Connexion Google..."
                    : "Continuer avec Google"}
                </span>
              </button>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 13,
                width: "100%",
                maxWidth: 300,
                margin: "18px auto 26px",
                color: COLORS.muted,
                fontSize: 14,
                fontWeight: 900,
              }}
            >
              <span
                style={{
                  height: 2,
                  flex: 1,
                  background: "rgba(248,236,208,.34)",
                }}
              />
              <span>OU</span>
              <span
                style={{
                  height: 2,
                  flex: 1,
                  background: "rgba(248,236,208,.34)",
                }}
              />
            </div>

            <form
              onSubmit={handleSubmit}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 20,
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
                <div
                  style={{
                    width: "100%",
                    maxWidth: 350,
                    margin: "0 auto",
                    background: `${COLORS.red}18`,
                    border: `2px solid ${COLORS.red}`,
                    borderRadius: 12,
                    padding: "10px 14px",
                    fontSize: 13,
                    color: "#FFD6D6",
                    fontWeight: 800,
                  }}
                >
                  ⚠️ {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: "100%",
                  maxWidth: 350,
                  margin: "4px auto 0",
                  background: loading
                    ? COLORS.muted
                    : "linear-gradient(135deg, #FF8A1F 0%, #F97316 55%, #EA580C 100%)",
                  border: `3px solid ${COLORS.ink}`,
                  borderRadius: 14,
                  padding: "16px 0",
                  color: "#fff",
                  fontSize: 20,
                  fontWeight: 900,
                  cursor: loading ? "not-allowed" : "pointer",
                  boxShadow: `6px 6px 0 ${COLORS.ink}`,
                  textShadow: `2px 2px 0 ${COLORS.ink}`,
                  fontFamily: "inherit",
                }}
              >
                {loading ? "Connexion..." : "Se connecter"}
              </button>
            </form>

            <p
              style={{
                textAlign: "center",
                margin: "24px 0 0",
                fontSize: 13,
                color: COLORS.muted,
              }}
            >
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
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;600;700;800;900&family=Poppins:wght@400;500;600;700&display=swap');
      `}</style>
    </div>
  )
}