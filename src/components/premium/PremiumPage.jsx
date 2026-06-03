import { useState } from "react"
import { stripePromise, PRICE_ID } from "../../services/stripe"

const COLORS = {
  card: "#0F1E38",
  cardLight: "#152444",
  border: "#1E3A5F",
  accent: "#F97316",
  green: "#22C55E",
  red: "#EF4444",
  muted: "#8EA4C5",
  text: "#F1F5F9",
  yellow: "#FCD34D",
  cyan: "#23D3D6",
}

const FEATURE_DESCRIPTIONS_FR = {
  "Tout le gratuit inclus": "Tu gardes toutes les fonctionnalités gratuites avec les outils avancés en plus.",
  "🔔 Alertes budget intelligentes": "Sois prévenu quand tu dépasses un budget ou qu'une charge importante approche.",
  "🤖 Assistant IA personnalisé": "Pose tes questions budget et reçois des conseils adaptés à ta situation.",
  "🎯 Bons plans locaux exclusifs": "Découvre des aides, offres et bons plans utiles à La Réunion.",
  "📊 Historique avancé": "Analyse ton évolution sur plusieurs mois pour mieux anticiper.",
  "🏦 Open Banking — import automatique": "Bientôt : importe automatiquement tes mouvements bancaires.",
  "📄 Export PDF mensuel": "Télécharge un récapitulatif propre de ton mois en PDF.",
  "🚀 Nouveautés en avant-première": "Teste les nouvelles fonctionnalités avant tout le monde.",
}

const FEATURE_DESCRIPTIONS_KR = {
  "Tout sa i gratis déza": "Ou gard tout bann fonksion gratis, avèk bann zouti avansé an plis.",
  "🔔 Alèrt bidjé entèlizan": "Ou lé avèrti kan ou dépass in bidjé ou kan in gro dépans i ariv.",
  "🤖 Asistan IA pèrsonalizé": "Poz out késtion bidjé é gagn bann konsey adapté pou ou sitiasion.",
  "🎯 Bon plan lokal èksklizif": "Découv bann éd, lofr é bon plan itil pou La Rényon.",
  "📊 Istorik avansé": "Gard koman ou bidjé i évolu pou mieux antisipé.",
  "🏦 Open Banking — import otomatik": "Biento : import otomatikman ou bann mouvman bankèr.",
  "📄 Èksport PDF chak mwa": "Télécharg in rékap prop pou chak mwa.",
  "🚀 Nouvo fonksionalité avan tout moun": "Test bann nouvo fonksionalité avan tout moun.",
}

function isSoonFeature(text) {
  return text?.toLowerCase().includes("open banking")
}

function FeatureItem({ feature, description, soonLabel, premium }) {
  return (
    <div
      title={description}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "10px 0",
        borderBottom: `1px solid ${COLORS.border}`,
        cursor: "help",
      }}
    >
      <span style={{ color: premium ? COLORS.yellow : COLORS.green, fontSize: 15 }}>
        {premium ? "✓" : "✓"}
      </span>

      <div style={{ flex: 1 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            fontSize: 13,
            fontWeight: 800,
            color: premium ? COLORS.text : COLORS.muted,
          }}
        >
          {feature}

          {isSoonFeature(feature) && (
            <span
              style={{
                background: "rgba(252,211,77,.16)",
                border: "1px solid rgba(252,211,77,.35)",
                color: COLORS.yellow,
                borderRadius: 999,
                padding: "2px 7px",
                fontSize: 10,
                fontWeight: 900,
              }}
            >
              {soonLabel}
            </span>
          )}
        </div>

        {description && (
          <div
            style={{
              marginTop: 4,
              fontSize: 11,
              lineHeight: 1.45,
              color: COLORS.muted,
            }}
          >
            {description}
          </div>
        )}
      </div>
    </div>
  )
}

export default function PremiumPage({ user, isPremium, t }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const featuresFree = t("premium", "featuresFree")
  const featuresPremium = t("premium", "featuresPremium")
  const isKreol = t("premium", "perMonth") === "/mwa"

  const descriptions = isKreol ? FEATURE_DESCRIPTIONS_KR : FEATURE_DESCRIPTIONS_FR

  async function handleSubscribe() {
    setLoading(true)
    setError("")

    try {
      const stripe = await stripePromise

      const { error } = await stripe.redirectToCheckout({
        lineItems: [{ price: PRICE_ID, quantity: 1 }],
        mode: "subscription",
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

  if (isPremium) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 780 }}>
        <div
          style={{
            position: "relative",
            overflow: "hidden",
            background: `linear-gradient(135deg, ${COLORS.yellow}22, ${COLORS.card})`,
            border: `2px solid ${COLORS.yellow}55`,
            borderRadius: 22,
            padding: 32,
            textAlign: "center",
          }}
        >
          <div
            style={{
              position: "absolute",
              right: -20,
              bottom: -28,
              fontSize: 140,
              opacity: 0.045,
              pointerEvents: "none",
              transform: "rotate(-12deg)",
            }}
          >
            🌴
          </div>

          <div style={{ fontSize: 48, marginBottom: 12 }}>🌴⭐</div>

          <h2 style={{ margin: "0 0 8px", fontSize: 26, color: COLORS.yellow, fontFamily: "'DM Serif Display', serif" }}>
            {t("premium", "alreadyPremium")}
          </h2>

          <p style={{ color: COLORS.muted, fontSize: 14, margin: 0 }}>
            {t("premium", "alreadyPremiumSub")}
          </p>
        </div>

        <div
          style={{
            background: `linear-gradient(135deg, ${COLORS.card} 0%, ${COLORS.cardLight} 100%)`,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 18,
            padding: 24,
          }}
        >
          <h3 style={{ margin: "0 0 16px", fontSize: 16, color: COLORS.text }}>
            {t("premium", "activePerks")}
          </h3>

          {(Array.isArray(featuresPremium) ? featuresPremium : []).map((feature, i) => (
            <FeatureItem
              key={i}
              feature={feature}
              premium
              soonLabel={t("premium", "openBankingSoon")}
              description={descriptions[feature]}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22, maxWidth: 820 }}>
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          background: `linear-gradient(135deg, ${COLORS.yellow}22, ${COLORS.accent}14, ${COLORS.card})`,
          border: `1px solid ${COLORS.yellow}44`,
          borderRadius: 24,
          padding: "32px 28px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            position: "absolute",
            right: -20,
            bottom: -25,
            fontSize: 150,
            opacity: 0.045,
            pointerEvents: "none",
            transform: "rotate(-12deg)",
          }}
        >
          🌴
        </div>

        <div
          style={{
            position: "absolute",
            left: -15,
            top: -18,
            fontSize: 90,
            opacity: 0.035,
            pointerEvents: "none",
            transform: "rotate(20deg)",
          }}
        >
          🍃
        </div>

        <div style={{ fontSize: 44, marginBottom: 10, position: "relative" }}>🌴⭐</div>

        <h2
          style={{
            margin: "0 0 10px",
            fontSize: 30,
            color: COLORS.yellow,
            fontFamily: "'DM Serif Display', serif",
            position: "relative",
          }}
        >
          {t("premium", "title")}
        </h2>

        <p
          style={{
            color: COLORS.muted,
            fontSize: 15,
            margin: "0 auto 18px",
            lineHeight: 1.65,
            maxWidth: 620,
            position: "relative",
          }}
        >
          {t("premium", "subtitle")}
        </p>

        <div
          style={{
            fontSize: 42,
            fontWeight: 900,
            color: COLORS.yellow,
            fontFamily: "'DM Serif Display', serif",
            position: "relative",
          }}
        >
          3€
          <span
            style={{
              fontSize: 16,
              color: COLORS.muted,
              fontFamily: "'DM Sans', sans-serif",
              marginLeft: 5,
            }}
          >
            {t("premium", "perMonth")}
          </span>
        </div>

        <div style={{ marginTop: 6, fontSize: 12, color: COLORS.muted, position: "relative" }}>
          {t("premium", "noCommitment")}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 16,
        }}
      >
        <div
          style={{
            background: `linear-gradient(135deg, ${COLORS.card} 0%, ${COLORS.cardLight} 100%)`,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 18,
            padding: 22,
          }}
        >
          <div style={{ fontSize: 13, color: COLORS.muted, fontWeight: 900, marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            {t("premium", "free")}
          </div>

          {(Array.isArray(featuresFree) ? featuresFree : []).map((feature, i) => (
            <FeatureItem key={i} feature={feature} />
          ))}
        </div>

        <div
          style={{
            position: "relative",
            overflow: "hidden",
            background: `linear-gradient(135deg, ${COLORS.yellow}18, ${COLORS.card})`,
            border: `2px solid ${COLORS.yellow}55`,
            borderRadius: 18,
            padding: 22,
            boxShadow: `0 0 30px ${COLORS.yellow}12`,
          }}
        >
          <div
            style={{
              position: "absolute",
              right: -18,
              bottom: -28,
              fontSize: 120,
              opacity: 0.035,
              pointerEvents: "none",
            }}
          >
            🌿
          </div>

          <div
            style={{
              position: "absolute",
              top: -12,
              right: 18,
              background: COLORS.yellow,
              color: COLORS.card,
              fontSize: 10,
              fontWeight: 900,
              padding: "4px 11px",
              borderRadius: 999,
              letterSpacing: "0.05em",
            }}
          >
            {t("premium", "recommended")}
          </div>

          <div style={{ fontSize: 13, color: COLORS.yellow, fontWeight: 900, marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.08em", position: "relative" }}>
            {t("premium", "premiumLabel")}
          </div>

          {(Array.isArray(featuresPremium) ? featuresPremium : []).map((feature, i) => (
            <FeatureItem
              key={i}
              feature={feature}
              premium
              soonLabel={t("premium", "openBankingSoon")}
              description={descriptions[feature]}
            />
          ))}
        </div>
      </div>

      {error && (
        <div
          style={{
            background: `${COLORS.red}15`,
            border: `1px solid ${COLORS.red}33`,
            borderRadius: 12,
            padding: "12px 16px",
            fontSize: 13,
            color: COLORS.red,
          }}
        >
          ⚠️ {error}
        </div>
      )}

      <button
        onClick={handleSubscribe}
        disabled={loading}
        style={{
          background: loading ? COLORS.muted : `linear-gradient(135deg, ${COLORS.yellow}, ${COLORS.accent})`,
          border: "none",
          borderRadius: 16,
          padding: "17px 0",
          color: COLORS.card,
          fontSize: 17,
          fontWeight: 900,
          fontFamily: "inherit",
          cursor: loading ? "not-allowed" : "pointer",
          boxShadow: `0 8px 28px ${COLORS.yellow}33`,
          transition: "all 0.2s",
        }}
      >
        {loading ? t("premium", "subscribing") : t("premium", "subscribe")}
      </button>

      <p style={{ textAlign: "center", fontSize: 11, color: COLORS.muted, margin: 0 }}>
        {t("premium", "securePayment")}
      </p>
    </div>
  )
}