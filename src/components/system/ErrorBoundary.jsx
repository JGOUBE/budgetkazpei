import React from "react"
import { supabase } from "../../services/supabase"

const boxStyle = {
  minHeight: "100vh",
  background:
    "radial-gradient(circle at top, rgba(35,211,214,.12), transparent 35%), #0A1628",
  color: "#F8FAFC",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  fontFamily: "'DM Sans', sans-serif",
}

const cardStyle = {
  width: 460,
  maxWidth: "94vw",
  background:
    "linear-gradient(135deg, rgba(15,30,56,.98), rgba(10,22,40,.98))",
  border: "1px solid rgba(56,189,248,.25)",
  borderRadius: 24,
  padding: 24,
  boxShadow: "0 30px 90px rgba(0,0,0,.35)",
  textAlign: "center",
}

const buttonStyle = {
  width: "100%",
  border: "none",
  borderRadius: 14,
  padding: "12px 14px",
  cursor: "pointer",
  fontFamily: "inherit",
  fontWeight: 900,
  marginTop: 10,
}

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      hasError: false,
      errorMessage: "",
    }
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      errorMessage: error?.message || "Erreur inconnue",
    }
  }

  componentDidCatch(error, info) {
    console.error("Erreur capturée par ErrorBoundary:", error, info)
  }

  async handleSignOut() {
    try {
      await supabase.auth.signOut()
    } catch (err) {
      console.error("Erreur signOut fallback:", err)
    }

    window.location.assign("/")
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    return (
      <div style={boxStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: 42, marginBottom: 12 }}>🌴</div>

          <h1
            style={{
              margin: "0 0 8px",
              fontSize: 24,
              fontFamily: "'Baloo 2', 'DM Serif Display', sans-serif",
            }}
          >
            Oups, l'app a rencontré un souci
          </h1>

          <p
            style={{
              margin: "0 0 16px",
              color: "#8EA4C5",
              fontSize: 14,
              lineHeight: 1.6,
            }}
          >
            Pas d'inquiétude : vos données sont conservées. Rechargez la page ou
            déconnectez-vous pour relancer proprement la session.
          </p>

          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              ...buttonStyle,
              background: "linear-gradient(135deg, #23D3D6, #38BDF8)",
              color: "#062033",
            }}
          >
            Recharger l'application
          </button>

          <button
            type="button"
            onClick={() => this.handleSignOut()}
            style={{
              ...buttonStyle,
              background: "rgba(255,255,255,.08)",
              color: "#F8FAFC",
              border: "1px solid rgba(255,255,255,.12)",
            }}
          >
            Me déconnecter
          </button>

          <details
            style={{
              marginTop: 16,
              textAlign: "left",
              color: "#94A3B8",
              fontSize: 12,
            }}
          >
            <summary>Voir le détail technique</summary>
            <pre style={{ whiteSpace: "pre-wrap" }}>{this.state.errorMessage}</pre>
          </details>
        </div>
      </div>
    )
  }
}