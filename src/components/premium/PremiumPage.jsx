import { useState } from 'react'
import { stripePromise, PRICE_ID } from '../../services/stripe'

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
  yellow: "#FCD34D",
}

export default function PremiumPage({ user, isPremium, t }) {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState("")

  const featuresFree    = t("premium", "featuresFree")
  const featuresPremium = t("premium", "featuresPremium")

  async function handleSubscribe() {
    setLoading(true)
    setError("")
    try {
      const stripe = await stripePromise
      const { error } = await stripe.redirectToCheckout({
        lineItems: [{ price: PRICE_ID, quantity: 1 }],
        mode: 'subscription',
        successUrl: `${window.location.origin}?premium=success`,
        cancelUrl: `${window.location.origin}?premium=cancel`,
        customerEmail: user?.email,
      })
      if (error) setError(error.message)
    } catch {
      setError("Erreur lors de la redirection vers le paiement")
    } finally {
      setLoading(false)
    }
  }

  // ── Déjà Premium ────────────────────────────────────────────
  if (isPremium) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 600 }}>
        <div style={{
          background: `linear-gradient(135deg, ${COLORS.yellow}22, ${COLORS.card})`,
          border: `2px solid ${COLORS.yellow}55`,
          borderRadius: 20, padding: 32, textAlign: "center",
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⭐</div>
          <h2 style={{ margin: "0 0 8px", fontSize: 24, color: COLORS.yellow, fontFamily: "'DM Serif Display', serif" }}>
            {t("premium", "alreadyPremium")}
          </h2>
          <p style={{ color: COLORS.muted, fontSize: 14, margin: 0 }}>
            {t("premium", "alreadyPremiumSub")}
          </p>
        </div>

        <div style={{
          background: `linear-gradient(135deg, ${COLORS.card} 0%, ${COLORS.cardLight} 100%)`,
          border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 24,
        }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 15, color: COLORS.text }}>
            {t("premium", "activePerks")}
          </h3>
          {(Array.isArray(featuresPremium) ? featuresPremium : []).map((f, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 0",
              borderBottom: i < featuresPremium.length - 1 ? `1px solid ${COLORS.border}` : "none",
            }}>
              <span style={{ color: COLORS.green, fontSize: 16 }}>✓</span>
              <span style={{ fontSize: 13, color: COLORS.text }}>{f}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── Pas encore Premium ───────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 700 }}>

      {/* Bannière */}
      <div style={{
        background: `linear-gradient(135deg, ${COLORS.yellow}22, ${COLORS.accent}15)`,
        border: `1px solid ${COLORS.yellow}44`,
        borderRadius: 20, padding: 28, textAlign: "center",
      }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🌴⭐</div>
        <h2 style={{ margin: "0 0 8px", fontSize: 26, color: COLORS.yellow, fontFamily: "'DM Serif Display', serif" }}>
          {t("premium", "title")}
        </h2>
        <p style={{ color: COLORS.muted, fontSize: 14, margin: "0 0 16px", lineHeight: 1.6 }}>
          {t("premium", "subtitle")}
        </p>
        <div style={{ fontSize: 36, fontWeight: 700, color: COLORS.yellow, fontFamily: "'DM Serif Display', serif" }}>
          3€ <span style={{ fontSize: 16, color: COLORS.muted, fontFamily: "'DM Sans', sans-serif" }}>
            {t("premium", "perMonth")}
          </span>
        </div>
      </div>

      {/* Comparaison */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>

        {/* Gratuit */}
        <div style={{
          background: `linear-gradient(135deg, ${COLORS.card} 0%, ${COLORS.cardLight} 100%)`,
          border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 20,
        }}>
          <div style={{ fontSize: 13, color: COLORS.muted, fontWeight: 600, marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            {t("premium", "free")}
          </div>
          {(Array.isArray(featuresFree) ? featuresFree : []).map((f, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "7px 0",
              borderBottom: i < featuresFree.length - 1 ? `1px solid ${COLORS.border}` : "none",
            }}>
              <span style={{ color: COLORS.green, fontSize: 14 }}>✓</span>
              <span style={{ fontSize: 12, color: COLORS.muted }}>{f}</span>
            </div>
          ))}
        </div>

        {/* Premium */}
        <div style={{
          background: `linear-gradient(135deg, ${COLORS.yellow}15, ${COLORS.card})`,
          border: `2px solid ${COLORS.yellow}44`, borderRadius: 16, padding: 20,
          position: "relative",
        }}>
          <div style={{
            position: "absolute", top: -10, right: 16,
            background: COLORS.yellow, color: "#0A1628",
            fontSize: 10, fontWeight: 700, padding: "3px 10px",
            borderRadius: 99, letterSpacing: "0.05em",
          }}>
            {t("premium", "recommended")}
          </div>
          <div style={{ fontSize: 13, color: COLORS.yellow, fontWeight: 600, marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            {t("premium", "premiumLabel")}
          </div>
          {(Array.isArray(featuresPremium) ? featuresPremium : []).map((f, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "7px 0",
              borderBottom: i < featuresPremium.length - 1 ? `1px solid ${COLORS.border}` : "none",
            }}>
              <span style={{ color: COLORS.yellow, fontSize: 14 }}>✓</span>
              <span style={{ fontSize: 12, color: COLORS.text }}>{f}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Erreur */}
      {error && (
        <div style={{
          background: `${COLORS.red}15`, border: `1px solid ${COLORS.red}33`,
          borderRadius: 10, padding: "12px 16px", fontSize: 13, color: COLORS.red,
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* Bouton */}
      <button
        onClick={handleSubscribe}
        disabled={loading}
        style={{
          background: loading ? COLORS.muted : `linear-gradient(135deg, ${COLORS.yellow}, ${COLORS.accent})`,
          border: "none", borderRadius: 14,
          padding: "16px 0", color: "#0A1628",
          fontSize: 16, fontWeight: 700,
          fontFamily: "inherit", cursor: loading ? "not-allowed" : "pointer",
          boxShadow: `0 4px 20px ${COLORS.yellow}44`,
          transition: "all 0.2s",
        }}
        onMouseEnter={e => !loading && (e.currentTarget.style.transform = "scale(1.02)")}
        onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
      >
        {loading ? t("premium", "subscribing") : t("premium", "subscribe")}
      </button>

      <p style={{ textAlign: "center", fontSize: 11, color: COLORS.muted, margin: 0 }}>
        {t("premium", "securePayment")}
      </p>
    </div>
  )
}
