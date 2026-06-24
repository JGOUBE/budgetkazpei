import { useState } from "react"
import { supabase } from "../services/supabase"

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError("")
    setMessage("")

    if (password.length < 6) {
      setError("Le mot de passe doit contenir au moins 6 caractères.")
      return
    }

    if (password !== confirmPassword) {
      setError("Les deux mots de passe ne correspondent pas.")
      return
    }

    setLoading(true)

    const { error } = await supabase.auth.updateUser({
      password,
    })

    setLoading(false)

    if (error) {
      setError(error.message || "Impossible de modifier le mot de passe.")
      return
    }

    setMessage("Mot de passe modifié avec succès. Tu peux te reconnecter.")
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0A1628",
      color: "#F8ECD0",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 20,
      fontFamily: "'DM Sans', sans-serif",
    }}>
      <form
        onSubmit={handleSubmit}
        style={{
          width: "100%",
          maxWidth: 380,
          background: "#0F1E38",
          border: "3px solid #05080C",
          borderRadius: 24,
          padding: 28,
          boxShadow: "8px 8px 0 #05080C",
        }}
      >
        <h1 style={{ textAlign: "center", marginBottom: 24 }}>
          Nouveau mot de passe
        </h1>

        <input
          type="password"
          placeholder="Nouveau mot de passe"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          style={inputStyle}
        />

        <input
          type="password"
          placeholder="Confirmer le mot de passe"
          value={confirmPassword}
          onChange={e => setConfirmPassword(e.target.value)}
          required
          style={inputStyle}
        />

        {error && <p style={{ color: "#FCA5A5", fontWeight: 800 }}>{error}</p>}
        {message && <p style={{ color: "#86EFAC", fontWeight: 800 }}>{message}</p>}

        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            padding: 14,
            borderRadius: 14,
            border: "3px solid #05080C",
            background: "#F97316",
            color: "#fff",
            fontWeight: 900,
            fontSize: 16,
            cursor: loading ? "not-allowed" : "pointer",
            marginTop: 12,
          }}
        >
          {loading ? "Modification..." : "Modifier le mot de passe"}
        </button>

        <button
          type="button"
          onClick={() => window.location.href = "/login"}
          style={{
            marginTop: 18,
            width: "100%",
            background: "none",
            border: "none",
            color: "#23D3D6",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          Retour à la connexion
        </button>
      </form>
    </div>
  )
}

const inputStyle = {
  width: "100%",
  padding: 14,
  marginBottom: 14,
  borderRadius: 12,
  border: "3px solid #05080C",
  fontSize: 16,
  fontWeight: 800,
}