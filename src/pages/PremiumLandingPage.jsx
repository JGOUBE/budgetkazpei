import { useState } from "react"

const COLORS = {
  bg: "#0A1628",
  card: "#0F1E38",
  cardLight: "#152444",
  border: "#1E3A5F",
  accent: "#F97316",
  yellow: "#FCD34D",
  green: "#22C55E",
  cyan: "#23D3D6",
  purple: "#A78BFA",
  muted: "#8EA4C5",
  text: "#F1F5F9",
  red: "#FB7185",
}

const PREMIUM_PRICE = "2,99 €"
const PREMIUM_PLUS_PRICE = "4,99 €"

const CONTENT = {
  fr: {
    back: "Retour à l'app",
    switchLang: "🇷🇪 Kréol",
    heroTitle: "BudgetKazPei Premium",
    heroText: "Des outils pensés pour La Réunion : budget, aides, démarches, bons plans et conseiller IA.",
    freeTitle: "Gratuit",
    premiumTitle: "Premium",
    premiumPlusTitle: "Premium+",
    freeSubtitle: "Pour gérer simplement son budget au quotidien.",
    premiumSubtitle: "Pour trouver ses aides, suivre ses démarches et profiter des bons plans intelligents.",
    premiumPlusSubtitle: "Pour bénéficier d’un conseiller IA BudgetKazPei plus avancé et personnalisé.",
    freeButton: "Commencer gratuitement",
    premiumButton: "Choisir Premium",
    premiumPlusButton: "Choisir Premium+",
    perMonth: "/mois",
    popularBadge: "POPULAIRE",
    recommendedPlusBadge: "RECOMMANDÉ ++",
    premiumSoon: "Le paiement Premium sera branché à Stripe à l'étape suivante.",
    premiumPlusSoon: "Le paiement Premium+ sera branché à Stripe à l'étape suivante.",
    faqTitle: "Questions fréquentes",
    faq: [
      ["Puis-je résilier ?", "Oui, l’abonnement sera résiliable depuis l’espace prévu sur le site."],
      ["Puis-je passer de Premium à Premium+ ?", "Oui, l’objectif est de permettre l’évolution d’une offre à l’autre."],
      ["Mes données sont-elles conservées ?", "Oui, tes données restent liées à ton compte BudgetKazPei dans Supabase."],
      ["Pourquoi Premium+ ?", "Premium+ ajoute le futur conseiller IA BudgetKazPei, les courriers, l’analyse avancée et l’accompagnement administratif."],
    ],
    freeFeatures: [
      "Tableau de bord budget",
      "Ajout dépenses et revenus",
      "Charges fixes",
      "Historique simple",
      "Profil utilisateur",
      "Aides & droits en version simple",
      "Interface français / créole",
    ],
    premiumFeatures: [
      "Tout le gratuit inclus",
      "Assistant Aides Réunion 🇷🇪",
      "Réponses en français ou créole réunionnais",
      "Analyse personnalisée des aides",
      "Suivi des démarches administratives",
      "Documents à préparer avec checklist",
      "Alertes budget intelligentes",
      "Bons plans intelligents",
      "Historique avancé",
      "Export PDF mensuel",
    ],
    premiumPlusFeatures: [
      "Tout Premium inclus",
      "Conseiller IA BudgetKazPei",
      "Conversation libre en français ou créole",
      "Analyse budgétaire avancée",
      "Génération de courriers administratifs",
      "Préparation de dossiers complets",
      "Conseils personnalisés selon le profil",
      "Veille automatique des droits et nouvelles aides",
    ],
  },
  kr: {
    back: "Retour dann l'app",
    switchLang: "🇫🇷 Français",
    heroTitle: "BudgetKazPei Premium",
    heroText: "Bann zouti pensé pou La Rényon : bidjé, zéd, démarches, bon plan é konseye IA.",
    freeTitle: "Gratis",
    premiumTitle: "Premium",
    premiumPlusTitle: "Premium+",
    freeSubtitle: "Pou gèr out bidjé fasilman tou lé zour.",
    premiumSubtitle: "Pou trouv out zéd, suivre out démarches é profit bann bon plan entèlizan.",
    premiumPlusSubtitle: "Pou gagn in konseye IA BudgetKazPei pli avansé é personnalisée.",
    freeButton: "Démarr gratis",
    premiumButton: "Choisir Premium",
    premiumPlusButton: "Choisir Premium+",
    perMonth: "/mwa",
    popularBadge: "POPILÈR",
    recommendedPlusBadge: "REKOMANDÉ ++",
    premiumSoon: "Paiement Premium va être branché ek Stripe dann prochaine étape.",
    premiumPlusSoon: "Paiement Premium+ va être branché ek Stripe dann prochaine étape.",
    faqTitle: "Kestion souvan",
    faq: [
      ["Mi pé résilié ?", "Wi, labonnement sera résiliab depi lespas prévu su site."],
      ["Mi pé pass Premium à Premium+ ?", "Wi, lobjectif sé permette chang dofr fasilman."],
      ["Mon bann données lé gardées ?", "Wi, out données i reste liées ek out compte BudgetKazPei dann Supabase."],
      ["Poukoi Premium+ ?", "Premium+ i ajoute futur konseye IA BudgetKazPei, courrier, analiz avansé é accompagnement administratif."],
    ],
    freeFeatures: [
      "Tablo débor bidjé",
      "Azout dépans é larzan rantre",
      "Sarz fix",
      "Istorik simpl",
      "Profil itilizatèr",
      "Zéd & drwa an version simpl",
      "Interface fransé / kréol",
    ],
    premiumFeatures: [
      "Tout sa lé gratis déza inclus",
      "Asistan Zéd Rényon 🇷🇪",
      "Répons an fransé ou kréol rényoné",
      "Analiz personnalisée bann zéd",
      "Suivi bann démarches administratives",
      "Dokiman pou préparé ek checklist",
      "Alèrt bidjé entèlizan",
      "Bon plan entèlizan",
      "Istorik avansé",
      "Export PDF chak mwa",
    ],
    premiumPlusFeatures: [
      "Tout Premium inclus",
      "Konseye IA BudgetKazPei",
      "Diskision libre an fransé ou kréol",
      "Analiz bidjé pli avansé",
      "Kréation courrier administratif",
      "Préparasyon dosyé konplé",
      "Konsey personnalisés selon out profil",
      "Veille otomatik bann drwa é nouvo zéd",
    ],
  },
}

function Feature({ children, color = COLORS.green }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "9px 0",
        borderBottom: "1px solid rgba(142,164,197,.12)",
        color: COLORS.text,
        fontSize: 14,
        lineHeight: 1.4,
        fontWeight: 700,
      }}
    >
      <span style={{ color, fontWeight: 900 }}>✓</span>
      <span>{children}</span>
    </div>
  )
}

function PlanCard({ icon, title, price, subtitle, features, color, badge, buttonText, onClick, perMonth }) {
  return (
    <article
      style={{
        position: "relative",
        overflow: "hidden",
        background: `linear-gradient(135deg, ${color}16, ${COLORS.card})`,
        border: `2px solid ${color}55`,
        borderRadius: 24,
        padding: 24,
        boxShadow: `0 20px 50px ${color}10`,
      }}
    >
      {badge && (
        <div
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            background: color,
            color: COLORS.bg,
            borderRadius: 999,
            padding: "5px 10px",
            fontSize: 11,
            fontWeight: 900,
            letterSpacing: ".03em",
          }}
        >
          {badge}
        </div>
      )}

      <div style={{ fontSize: 42, marginBottom: 10 }}>{icon}</div>
      <h2 style={{ margin: 0, color, fontSize: 25, fontFamily: "'DM Serif Display', serif" }}>
        {title}
      </h2>
      <p style={{ color: COLORS.muted, minHeight: 44, lineHeight: 1.5, fontSize: 14 }}>
        {subtitle}
      </p>

      <div style={{ margin: "16px 0 18px" }}>
        <span style={{ color, fontSize: 36, fontWeight: 900, fontFamily: "'DM Serif Display', serif" }}>
          {price}
        </span>
        {price !== "0 €" && <span style={{ color: COLORS.muted, marginLeft: 6 }}>{perMonth}</span>}
      </div>

      <div style={{ display: "grid", gap: 0 }}>
        {features.map((feature, index) => (
          <Feature key={index} color={color}>{feature}</Feature>
        ))}
      </div>

      <button
        type="button"
        onClick={onClick}
        style={{
          width: "100%",
          marginTop: 20,
          background: `linear-gradient(135deg, ${color}, ${COLORS.accent})`,
          color: COLORS.bg,
          border: "none",
          borderRadius: 15,
          padding: "14px 16px",
          fontSize: 15,
          fontWeight: 900,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        {buttonText}
      </button>
    </article>
  )
}

export default function PremiumLandingPage() {
  const [message, setMessage] = useState("")
  const [lang, setLang] = useState("fr")
  const c = CONTENT[lang]

  function handleStripeSoon(plan) {
    setMessage(plan === "premium_plus" ? c.premiumPlusSoon : c.premiumSoon)
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: `radial-gradient(circle at top, rgba(35,211,214,.13), transparent 35%), ${COLORS.bg}`,
        color: COLORS.text,
        fontFamily: "'DM Sans', sans-serif",
        padding: "34px 18px 50px",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;700;900&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; }
      `}</style>

      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 34, flexWrap: "wrap" }}>
          <img src="/icons-creole/logo-budgetkazpei.png" alt="BudgetKazPei" style={{ width: 145, height: "auto" }} />

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setLang(lang === "fr" ? "kr" : "fr")}
              style={{
                background: "rgba(35,211,214,.08)",
                border: `1px solid ${COLORS.cyan}55`,
                borderRadius: 12,
                color: COLORS.cyan,
                padding: "10px 14px",
                fontWeight: 900,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {c.switchLang}
            </button>

            <button
              type="button"
              onClick={() => { window.location.href = "/" }}
              style={{
                background: "rgba(255,255,255,.06)",
                border: `1px solid ${COLORS.border}`,
                borderRadius: 12,
                color: COLORS.text,
                padding: "10px 14px",
                fontWeight: 800,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {c.back}
            </button>
          </div>
        </header>

        <section
          style={{
            textAlign: "center",
            background: `linear-gradient(135deg, rgba(252,211,77,.16), rgba(167,139,250,.13), ${COLORS.card})`,
            border: `1px solid ${COLORS.yellow}44`,
            borderRadius: 28,
            padding: "42px 22px",
            marginBottom: 22,
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 12 }}>🌴⭐👑</div>
          <h1
            style={{
              margin: 0,
              color: COLORS.yellow,
              fontFamily: "'DM Serif Display', serif",
              fontSize: "clamp(32px, 5vw, 54px)",
              fontWeight: 400,
            }}
          >
            {c.heroTitle}
          </h1>
          <p style={{ color: COLORS.muted, maxWidth: 760, margin: "14px auto 0", lineHeight: 1.65, fontSize: 17 }}>
            {c.heroText}
          </p>
        </section>

        {message && (
          <div
            style={{
              background: "rgba(35,211,214,.10)",
              border: "1px solid rgba(35,211,214,.35)",
              borderRadius: 16,
              padding: 14,
              color: COLORS.cyan,
              fontWeight: 800,
              marginBottom: 18,
              textAlign: "center",
            }}
          >
            {message}
          </div>
        )}

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 18,
            alignItems: "stretch",
          }}
        >
          <PlanCard
            icon="🆓"
            title={c.freeTitle}
            price="0 €"
            subtitle={c.freeSubtitle}
            features={c.freeFeatures}
            color={COLORS.green}
            buttonText={c.freeButton}
            perMonth={c.perMonth}
            onClick={() => { window.location.href = "/" }}
          />

          <PlanCard
            icon="⭐"
            title={c.premiumTitle}
            price={PREMIUM_PRICE}
            subtitle={c.premiumSubtitle}
            features={c.premiumFeatures}
            color={COLORS.yellow}
            badge={c.popularBadge}
            buttonText={c.premiumButton}
            perMonth={c.perMonth}
            onClick={() => handleStripeSoon("premium")}
          />

          <PlanCard
            icon="👑"
            title={c.premiumPlusTitle}
            price={PREMIUM_PLUS_PRICE}
            subtitle={c.premiumPlusSubtitle}
            features={c.premiumPlusFeatures}
            color={COLORS.purple}
            badge={c.recommendedPlusBadge}
            buttonText={c.premiumPlusButton}
            perMonth={c.perMonth}
            onClick={() => handleStripeSoon("premium_plus")}
          />
        </section>

        <section
          style={{
            marginTop: 24,
            background: "rgba(255,255,255,.045)",
            border: `1px solid ${COLORS.border}`,
            borderRadius: 22,
            padding: 22,
          }}
        >
          <h2 style={{ margin: "0 0 14px", color: COLORS.text, fontSize: 22 }}>{c.faqTitle}</h2>
          <div style={{ display: "grid", gap: 12, color: COLORS.muted, lineHeight: 1.55 }}>
            {c.faq.map(([question, answer]) => (
              <p key={question}><strong style={{ color: COLORS.text }}>{question}</strong><br />{answer}</p>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
