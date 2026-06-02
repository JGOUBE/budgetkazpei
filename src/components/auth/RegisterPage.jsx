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
  text: "#F1F5F9",
}

export default function RegisterPage({ onRegister, onGoLogin }) {
  const [nom, setNom] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError("")

    if (password !== confirm) {
      setError("Les mots de passe ne correspondent pas")
      return
    }

    if (password.length < 6) {
      setError("Le mot de passe doit faire au moins 6 caractères")
      return
    }

    setLoading(true)

    try {
      await onRegister(email, password, nom)
      setSuccess(true)
    } catch (err) {
      setError(err.message || "Erreur lors de l'inscription")
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    width: "100%",
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
    marginBottom: 8,
    color: COLORS.cream,
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    textShadow: `2px 2px 0 ${COLORS.ink}`,
  }

  if (success) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <h2 style={titleStyle}>Vérifie ta boîte mail !</h2>
          <p style={{ color: COLORS.muted, textAlign: "center" }}>
            Un lien de confirmation a été envoyé à {email}.
          </p>
          <button onClick={onGoLogin} style={buttonStyle}>
            Retour à la connexion
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={pageStyle}>
      <div style={{ width: 440, maxWidth: "94vw" }}>
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <img
            src="/icons-creole/logo-budgetkazpei.png"
            alt="BudgetKazPei"
            style={{
              width: 195,
              maxWidth: "80vw",
              height: "auto",
              margin: "0 auto",
              display: "block",
              objectFit: "contain",
              pointerEvents: "none",
              filter: "drop-shadow(3px 5px 0 rgba(5,8,12,.65))",
            }}
          />

          <p
            style={{
              margin: "-30px 0 0",
              color: "#23D3D6",
              fontSize: 15,
              fontWeight: 700,
              fontFamily: "Poppins, 'DM Sans', sans-serif",
              textAlign: "center",
            }}
          >
            Crée ton compte gratuitement
          </p>
        </div>

        <div style={cardStyle}>
          <img
            src="/icons-creole/palmier.png"
            alt=""
            aria-hidden="true"
            style={{
              position: "absolute",
              width: 210,
              height: 210,
              right: -80,
              top: -50,
              opacity: 0.07,
              transform: "rotate(-18deg)",
              pointerEvents: "none",
            }}
          />

          <div style={{ position: "relative", zIndex: 1 }}>
            <h2 style={titleStyle}>Inscription</h2>

            <form
              onSubmit={handleSubmit}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}
            >
              <div>
                <label style={labelStyle}>Prénom ou pseudo</label>
                <input
                  type="text"
                  value={nom}
                  onChange={e => setNom(e.target.value)}
                  required
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Mot de passe</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Confirmer le mot de passe</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  required
                  style={inputStyle}
                />
              </div>

              {error && (
                <div
                  style={{
                    background: `${COLORS.red}18`,
                    border: `2px solid ${COLORS.red}`,
                    borderRadius: 10,
                    padding: "10px 14px",
                    color: "#FFD6D6",
                    fontWeight: 700,
                    fontSize: 13,
                  }}
                >
                  ⚠️ {error}
                </div>
              )}

              <button type="submit" disabled={loading} style={buttonStyle}>
                {loading ? "Création..." : "Créer mon compte"}
              </button>
            </form>

            <p style={{ textAlign: "center", marginTop: 22, color: COLORS.muted }}>
              Déjà un compte ?{" "}
              <button
                onClick={onGoLogin}
                style={{
                  background: "none",
                  border: "none",
                  color: COLORS.accent,
                  cursor: "pointer",
                  fontWeight: 900,
                }}
              >
                Se connecter
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

const pageStyle = {
  minHeight: "100vh",
  background:
    "radial-gradient(circle at top, rgba(35,211,214,.12), transparent 35%), #0A1628",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "'DM Sans', sans-serif",
  padding: "32px 18px",
}

const cardStyle = {
  position: "relative",
  overflow: "hidden",
  background:
    "linear-gradient(145deg, rgba(10,31,61,.98), rgba(13,52,92,.96), rgba(24,92,138,.92))",
  border: `3px solid ${COLORS.ink}`,
  borderRadius: 22,
  padding: "34px 28px 30px",
  boxShadow: `9px 9px 0 ${COLORS.ink}, 0 26px 70px rgba(0,0,0,.35)`,
}

const titleStyle = {
  margin: "0 0 26px",
  fontSize: 26,
  color: COLORS.cream,
  textAlign: "center",
  fontFamily: "Impact, 'Arial Black', 'DM Serif Display', serif",
  textShadow: `3px 3px 0 ${COLORS.ink}`,
}

const buttonStyle = {
  width: "100%",
  background: COLORS.accent,
  border: `3px solid ${COLORS.ink}`,
  borderRadius: 12,
  padding: "14px 0",
  color: "#fff",
  fontSize: 17,
  fontWeight: 900,
  cursor: "pointer",
  fontFamily: "inherit",
  boxShadow: `5px 5px 0 ${COLORS.ink}`,
}