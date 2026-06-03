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
}

const WATERMARK = "/icons-creole/palmier.png"

const DESCRIPTIONS_FR = {
  "Tout le gratuit inclus": "Tu gardes toutes les fonctionnalités gratuites, avec les outils avancés en plus.",
  "🔔 Alertes budget intelligentes": "Sois prévenu quand tu dépasses un budget ou qu’une charge importante approche.",
  "🤖 Assistant IA personnalisé": "Pose tes questions budget et reçois des conseils adaptés à ta situation.",
  "🎯 Bons plans locaux exclusifs": "Découvre des aides, offres et bons plans utiles à La Réunion.",
  "📊 Historique avancé": "Analyse ton évolution sur plusieurs mois pour mieux anticiper.",
  "🏦 Open Banking — import automatique": "Bientôt : importe automatiquement tes mouvements bancaires.",
  "📄 Export PDF mensuel": "Télécharge un récapitulatif propre de ton mois en PDF.",
  "🚀 Nouveautés en avant-première": "Teste les nouvelles fonctionnalités avant tout le monde.",
}

const DESCRIPTIONS_KR = {
  "Tout sa i gratis déza": "Ou gard tout bann fonksion gratis, avèk bann zouti avansé an plis.",
  "🔔 Alèrt bidjé entèlizan": "Ou lé avèrti kan ou dépass in bidjé ou kan in gro dépans i ariv.",
  "🤖 Asistan IA pèrsonalizé": "Poz out késtion bidjé é gagn bann konsey adapté pou ou sitiasion.",
  "🎯 Bon plan lokal èksklizif": "Découv bann éd, lofr é bon plan itil pou La Rényon.",
  "📊 Istorik avansé": "Gard koman ou bidjé i évolu pou mieux antisipé.",
  "🏦 Open Banking — import otomatik": "Biento : import otomatikman ou bann mouvman bankèr.",
  "📄 Èksport PDF chak mwa": "Télécharg in rékap prop pou chak mwa.",
  "🚀 Nouvo fonksionalité avan tout moun": "Test bann nouvo fonksionalité avan tout moun.",
}

function isOpenBanking(text) {
  return String(text || "").toLowerCase().includes("open banking")
}

function Watermark({ size = 210, right = -45, bottom = -55 }) {
  return (
    <img
      src={WATERMARK}
      alt=""
      style={{
        position: "absolute",
        width: size,
        right,
        bottom,
        opacity: 0.06,
        pointerEvents: "none",
        userSelect: "none",
        transform: "rotate(-8deg)",
        filter: "grayscale(1) brightness(1.8)",
      }}
    />
  )
}

function FeatureItem({ feature, description, soonLabel, premium }) {
  return (
    <div
      title={description}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        padding: "10px 0",
        borderBottom: `1px solid ${COLORS.border}`,
        cursor: description ? "help" : "default",
        position: "relative",
        zIndex: 1,
      }}
    >
      <span style={{ color: premium ? COLORS.yellow : COLORS.green, fontSize: 15, fontWeight: 900 }}>
        ✓
      </span>

      <span
        style={{
          flex: 1,
          fontSize: 13,
          color: premium ? COLORS.text : COLORS.muted,
          fontWeight: premium ? 800 : 700,
          lineHeight: 1.3,
        }}
      >
        {feature}
      </span>

      {description && (
        <span
          style={{
            width: 18,
            height: 18,
            borderRadius: 999,
            border: "1px solid rgba(142,164,197,.35)",
            color: COLORS.muted,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontWeight: 900,
            flexShrink: 0,
          }}
        >
          i
        </span>
      )}

      {isOpenBanking(feature) && (
        <span
          style={{
            background: "rgba(252,211,77,.16)",
            border: "1px solid rgba(252,211,77,.35)",
            color: COLORS.yellow,
            borderRadius: 999,
            padding: "3px 8px",
            fontSize: 10,
            fontWeight: 900,
            flexShrink: 0,
          }}
        >
          {soonLabel}
        </span>
      )}
    </div>
  )
}

export default function PremiumPage({ user, isPremium, t }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const featuresFree = Array.isArray(t("premium", "featuresFree"))
    ? t("premium", "featuresFree")
    : []

  const featuresPremium = Array.isArray(t("premium", "featuresPremium"))
    ? t("premium", "featuresPremium")
    : []

  const isKreol = t("premium", "perMonth") === "/mwa"
  const descriptions = isKreol ? DESCRIPTIONS_KR : DESCRIPTIONS_FR

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

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 920,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: 22,
      }}
    >
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          background: `linear-gradient(135deg, ${COLORS.yellow}22, ${COLORS.accent}14, ${COLORS.card})`,
          border: `1px solid ${COLORS.yellow}44`,
          borderRadius: 24,
          padding: "34px 28px",
          textAlign: "center",
        }}
      >
        <Watermark size={260} right={-55} bottom={-75} />

        <div style={{ fontSize: 44, marginBottom: 10, position: "relative", zIndex: 1 }}>🌴⭐</div>

        <h2
          style={{
            margin: "0 0 10px",
            fontSize: 31,
            color: COLORS.yellow,
            fontFamily: "'DM Serif Display', serif",
            position: "relative",
            zIndex: 1,
          }}
        >
          {isPremium ? t("premium", "alreadyPremium") : t("premium", "title")}
        </h2>

        <p
          style={{
            color: COLORS.muted,
            fontSize: 15,
            margin: "0 auto 18px",
            lineHeight: 1.65,
            maxWidth: 650,
            position: "relative",
            zIndex: 1,
          }}
        >
          {isPremium ? t("premium", "alreadyPremiumSub") : t("premium", "subtitle")}
        </p>

        {!isPremium && (
          <>
            <div
              style={{
                fontSize: 42,
                fontWeight: 900,
                color: COLORS.yellow,
                fontFamily: "'DM Serif Display', serif",
                position: "relative",
                zIndex: 1,
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

            <div style={{ marginTop: 6, fontSize: 12, color: COLORS.muted, position: "relative", zIndex: 1 }}>
              {t("premium", "noCommitment")}
            </div>
          </>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 16,
          alignItems: "stretch",
        }}
      >
        {!isPremium && (
          <div
            style={{
              background: `linear-gradient(135deg, ${COLORS.card} 0%, ${COLORS.cardLight} 100%)`,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 18,
              padding: 22,
            }}
          >
            <div
              style={{
                fontSize: 13,
                color: COLORS.muted,
                fontWeight: 900,
                marginBottom: 14,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              {t("premium", "free")}
            </div>

            {featuresFree.map((feature, i) => (
              <FeatureItem key={i} feature={feature} />
            ))}
          </div>
        )}

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
          <Watermark size={190} right={-45} bottom={-60} />

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              marginBottom: 14,
              position: "relative",
              zIndex: 1,
            }}
          >
            <div
              style={{
                fontSize: 13,
                color: COLORS.yellow,
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              {t("premium", "premiumLabel")}
            </div>

            {!isPremium && (
              <span
                style={{
                  background: COLORS.yellow,
                  color: COLORS.card,
                  fontSize: 10,
                  fontWeight: 900,
                  padding: "4px 10px",
                  borderRadius: 999,
                  letterSpacing: "0.05em",
                  whiteSpace: "nowrap",
                }}
              >
                {t("premium", "recommended")}
              </span>
            )}
          </div>

          {featuresPremium.map((feature, i) => (
            <FeatureItem
              key={i}
              feature={feature}
              premium
              description={descriptions[feature]}
              soonLabel={t("premium", "openBankingSoon")}
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

      {!isPremium && (
        <>
          <button
            type="button"
            onClick={handleSubscribe}
            disabled={loading}
            style={{
              width: "100%",
              background: loading
                ? COLORS.muted
                : `linear-gradient(135deg, ${COLORS.yellow}, ${COLORS.accent})`,
              border: "none",
              borderRadius: 16,
              padding: "17px 0",
              color: COLORS.card,
              fontSize: 17,
              fontWeight: 900,
              fontFamily: "inherit",
              cursor: loading ? "not-allowed" : "pointer",
              boxShadow: `0 8px 28px ${COLORS.yellow}33`,
            }}
          >
            {loading ? t("premium", "subscribing") : t("premium", "subscribe")}
          </button>

          <p style={{ textAlign: "center", fontSize: 11, color: COLORS.muted, margin: 0 }}>
            {t("premium", "securePayment")}
          </p>
        </>
      )}
    </div>
  )
}