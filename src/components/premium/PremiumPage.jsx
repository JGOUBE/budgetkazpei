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

const FREE_FEATURES = [
  {
    icon: "📊",
    label: "Tableau de bord budget",
    desc: "Visualisez rapidement vos revenus, dépenses et votre reste à vivre.",
  },
  {
    icon: "➕",
    label: "Ajout de transactions",
    desc: "Ajoutez vos revenus et dépenses manuellement en quelques secondes.",
  },
  {
    icon: "🏷️",
    label: "Suivi des catégories",
    desc: "Suivez vos dépenses par catégorie pour mieux comprendre où part votre argent.",
  },
  {
    icon: "🌴",
    label: "Traduction créole",
    desc: "Utilisez l'application en français ou en créole réunionnais.",
  },
  {
    icon: "🏛️",
    label: "Aides & droits",
    desc: "Consultez les aides disponibles et les pistes utiles à La Réunion.",
  },
]

const PREMIUM_FEATURES = [
  {
    icon: "✅",
    label: "Tout le gratuit inclus",
    desc: "Vous gardez toutes les fonctionnalités gratuites, avec les outils avancés en plus.",
  },
  {
    icon: "🔔",
    label: "Alertes budget intelligentes",
    desc: "Soyez prévenu quand vous dépassez un budget ou qu'une charge importante approche.",
  },
  {
    icon: "🤖",
    label: "Assistant IA personnalisé",
    desc: "Posez vos questions budget et recevez des conseils adaptés à votre situation.",
  },
  {
    icon: "🌴",
    label: "Bons plans locaux exclusifs",
    desc: "Découvrez des aides, offres et bons plans utiles pour La Réunion.",
  },
  {
    icon: "📈",
    label: "Historique avancé",
    desc: "Analysez votre évolution sur plusieurs mois pour mieux anticiper.",
  },
  {
    icon: "🏦",
    label: "Open Banking — import automatique",
    desc: "Bientôt : connectez votre compte bancaire pour importer vos mouvements automatiquement.",
    soon: true,
  },
  {
    icon: "📄",
    label: "Export PDF mensuel",
    desc: "Téléchargez un récapitulatif propre de votre mois en PDF.",
  },
  {
    icon: "🚀",
    label: "Nouveautés en avant-première",
    desc: "Accédez en priorité aux nouvelles fonctionnalités BudgetKazPei.",
  },
]

function FeatureItem({ feature, premium }) {
  return (
    <div
      title={feature.desc}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "10px 0",
        borderBottom: `1px solid ${COLORS.border}`,
        cursor: "help",
      }}
    >
      <span style={{ fontSize: 15, marginTop: 1 }}>{feature.icon}</span>

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
          {feature.label}

          {feature.soon && (
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
              Bientôt
            </span>
          )}
        </div>

        <div
          style={{
            marginTop: 4,
            fontSize: 11,
            lineHeight: 1.45,
            color: COLORS.muted,
          }}
        >
          {feature.desc}
        </div>
      </div>
    </div>
  )
}

export default function PremiumPage({ user, isPremium, t }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

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
            background: `linear-gradient(135deg, ${COLORS.yellow}22, ${COLORS.card})`,
            border: `2px solid ${COLORS.yellow}55`,
            borderRadius: 22,
            padding: 32,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 12 }}>🌴⭐</div>

          <h2
            style={{
              margin: "0 0 8px",
              fontSize: 26,
              color: COLORS.yellow,
              fontFamily: "'DM Serif Display', serif",
            }}
          >
            Vous êtes Premium
          </h2>

          <p style={{ color: COLORS.muted, fontSize: 14, margin: 0 }}>
            Vous profitez déjà des fonctionnalités avancées BudgetKazPei.
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
            Vos avantages Premium
          </h3>

          {PREMIUM_FEATURES.map((feature, i) => (
            <FeatureItem key={i} feature={feature} premium />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22, maxWidth: 820 }}>
      <div
        style={{
          background: `linear-gradient(135deg, ${COLORS.yellow}22, ${COLORS.accent}14, ${COLORS.card})`,
          border: `1px solid ${COLORS.yellow}44`,
          borderRadius: 24,
          padding: "32px 28px",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 44, marginBottom: 10 }}>🌴⭐</div>

        <h2
          style={{
            margin: "0 0 10px",
            fontSize: 30,
            color: COLORS.yellow,
            fontFamily: "'DM Serif Display', serif",
          }}
        >
          Passe en Premium
        </h2>

        <p
          style={{
            color: COLORS.muted,
            fontSize: 15,
            margin: "0 auto 18px",
            lineHeight: 1.65,
            maxWidth: 620,
          }}
        >
          Reprends le contrôle de ton budget avec des outils avancés, des alertes intelligentes
          et des avantages pensés pour La Réunion. Anticipe tes dépenses et pilote ton argent
          plus sereinement.
        </p>

        <div
          style={{
            fontSize: 42,
            fontWeight: 900,
            color: COLORS.yellow,
            fontFamily: "'DM Serif Display', serif",
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
            / mois
          </span>
        </div>

        <div style={{ marginTop: 6, fontSize: 12, color: COLORS.muted }}>
          Sans engagement
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
            Gratuit
          </div>

          {FREE_FEATURES.map((feature, i) => (
            <FeatureItem key={i} feature={feature} />
          ))}
        </div>

        <div
          style={{
            background: `linear-gradient(135deg, ${COLORS.yellow}18, ${COLORS.card})`,
            border: `2px solid ${COLORS.yellow}55`,
            borderRadius: 18,
            padding: 22,
            position: "relative",
            boxShadow: `0 0 30px ${COLORS.yellow}12`,
          }}
        >
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
            Recommandé
          </div>

          <div
            style={{
              fontSize: 13,
              color: COLORS.yellow,
              fontWeight: 900,
              marginBottom: 14,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Premium — 3€/mois
          </div>

          {PREMIUM_FEATURES.map((feature, i) => (
            <FeatureItem key={i} feature={feature} premium />
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
          transition: "all 0.2s",
        }}
        onMouseEnter={e => !loading && (e.currentTarget.style.transform = "scale(1.015)")}
        onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
      >
        {loading ? "Redirection..." : "Débloquer Premium • 3€/mois"}
      </button>

      <p style={{ textAlign: "center", fontSize: 11, color: COLORS.muted, margin: 0 }}>
        Paiement sécurisé via Stripe. Résiliation possible à tout moment.
      </p>
    </div>
  )
}