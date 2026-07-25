import { useState } from "react"
import AppLogo from "../components/AppLogo"
import { createColorAliases, ds } from "../styles/designSystem"
import { PLAN_IDS, PLAN_PRICES, PLAN_PUBLIC_SCAN_LABELS } from "../config/plans"

const COLORS = createColorAliases({
  band: () => ds.elevated,
})

const HERO_BG = "/icons-creole/fond-principal.png"

const PREMIUM_PRICE = PLAN_PRICES[PLAN_IDS.premium].replace("/mois", "")
const PREMIUM_PLUS_PRICE = PLAN_PRICES[PLAN_IDS.premiumPlus].replace("/mois", "")

const STRIPE_LINKS = {
  premiumMonthly: "https://buy.stripe.com/7sYbJ0fIR2JU4yua1ggMw00",
  premiumPlusMonthly: "https://buy.stripe.com/7sY28qdAJ1FQ6GCddsgMw03",
}

const CONTENT = {
  fr: {
    switchLang: "RE Kreol",
    back: "Retour à l'app",
    login: "Se connecter",
    dashboard: "Accéder à mon tableau de bord",
    heroBadge: "BudgetKazPei Premium",
    heroTitle: "Choisissez le niveau d'accompagnement qui vous aide vraiment.",
    heroText:
      "Premium et Premium+ ne servent pas seulement à ajouter plus de courses. Ils transforment vos données en statistiques, prévisions, conseils et décisions plus simples au quotidien.",
    plansTitle: "Les offres",
    monthly: "Mensuel",
    choosePremiumMonthly: "Choisir Premium mensuel",
    choosePlusMonthly: "Choisir Premium+ mensuel",
    freeButton: "Essayer gratuitement",
    plans: [
      {
        name: "Gratuit",
        color: COLORS.green,
        price: "0 €",
        promise: "Découvrir BudgetKazPei.",
        features: ["Budget simple", "Dépenses et revenus", "Aides en version simple", PLAN_PUBLIC_SCAN_LABELS[PLAN_IDS.free]],
      },
      {
        name: "Premium",
        color: COLORS.yellow,
        promise: "Gérer parfaitement son budget.",
        features: [PLAN_PUBLIC_SCAN_LABELS[PLAN_IDS.premium], "Statistiques avancées", "Historique complet", "Alertes budget", "Export PDF", "Assistant standard"],
        featured: true,
      },
      {
        name: "Premium+",
        color: COLORS.purple,
        promise: "Votre copilote financier intelligent.",
        features: [PLAN_PUBLIC_SCAN_LABELS[PLAN_IDS.premiumPlus], "Conseiller renforcé", "Suivi des démarches", "Conseils personnalisés", "Comparaisons intelligentes bientôt disponible", "Bons plans personnalisés bientôt disponible"],
      },
    ],
    valueTitle: "Premium+ est votre copilote financier",
    valueText:
      "Premium+ est pensé comme un accompagnement : comprendre pourquoi votre budget évolue, anticiper les fins de mois, repérer les économies possibles et vous guider sans complexité.",
    faqTitle: "Questions fréquentes",
    faq: [
      ["Pourquoi encadrer les analyses automatiques ?", "Une analyse automatique utilise OCR, parsing et parfois IA. Les actions manuelles et la consultation restent disponibles selon l'offre."],
      ["Le scanner est-il obligatoire ?", "Non. Vous pouvez toujours ajouter une course manuellement. Le scanner est simplement le moyen le plus rapide."],
      ["Que vais-je gagner avec Premium ?", "Une lecture plus complète de vos courses, produits, magasins, historiques et statistiques."],
      ["Que vais-je gagner avec Premium+ ?", "Un vrai copilote financier : assistant IA, explications, prévisions, conseils et résumés personnalisés."],
    ],
  },
  kr: {
    switchLang: "FR Français",
    back: "Retour dann l'app",
    login: "Konekte",
    dashboard: "Accéder à mon tableau de bord",
    heroBadge: "BudgetKazPei Premium",
    heroTitle: "Swazi lakonpagnman ki aide aou pou de vrai.",
    heroText:
      "Premium ek Premium+ lé pa zis pou azout plis courses. Zot transforme out données an statistik, prévision, konsey ek desizion pli simple.",
    plansTitle: "Bann offres",
    monthly: "Mensuel",
    choosePremiumMonthly: "Choisir Premium mensuel",
    choosePlusMonthly: "Choisir Premium+ mensuel",
    freeButton: "Koumans gratis",
    plans: [
      {
        name: "Gratis",
        color: COLORS.green,
        price: "0 €",
        promise: "Dekouv BudgetKazPei.",
        features: ["Bidze simple", "Depans ek larzan rantre", "Aides version simple", PLAN_PUBLIC_SCAN_LABELS[PLAN_IDS.free]],
      },
      {
        name: "Premium",
        color: COLORS.yellow,
        promise: "Gere bien out bidze.",
        features: [PLAN_PUBLIC_SCAN_LABELS[PLAN_IDS.premium], "Statistik avance", "Istorik complet", "Alertes bidze", "Export PDF", "Assistant standard"],
        featured: true,
      },
      {
        name: "Premium+",
        color: COLORS.purple,
        promise: "Out copilote financier entélizan.",
        features: [PLAN_PUBLIC_SCAN_LABELS[PLAN_IDS.premiumPlus], "Conseiller renforcé", "Swivi démarches", "Konsey personnalisé", "Comparaisons entélizantes bientôt disponible", "Bons plans personnalisés bientôt disponible"],
      },
    ],
    valueTitle: "Premium+ lé out copilote financier",
    valueText:
      "Premium+ lé fait pou accompagne aou : konprann poukisa out bidze i bouge, anticipe fin de mwa, trouv lekonomi possible ek guide aou simplement.",
    faqTitle: "Kestion souvent",
    faq: [
      ["Poukisa encadrer bann analiz otomatik ?", "In analiz otomatik i servi OCR, parsing ek parfwa IA. Azout amain ek consultation i reste disponible selon l'offre."],
      ["Scanner lé obligatoire ?", "Non. Ou pe toujours azout in course amain. Scanner-la lé zis fason pli rapide."],
      ["Kosa Premium i donn amwin ?", "In lecture pli complète de out courses, produits, magasins, istorik ek statistik."],
      ["Kosa Premium+ i donn amwin ?", "In vrai copilote financier : assistant IA, explications, prévisions, konsey ek résumés personnalisés."],
    ],
  },
}

function openStripeLink(url) {
  window.open(url, "_blank", "noopener,noreferrer")
}

function Button({ children, onClick, href, variant = "primary" }) {
  const primary = variant === "primary"
  const style = {
    minHeight: 46,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    padding: "0 16px",
    border: primary ? "none" : `1px solid ${COLORS.cyan}66`,
    background: primary ? `linear-gradient(135deg, ${COLORS.yellow}, ${COLORS.accent})` : "rgba(8,20,38,.72)",
    color: primary ? COLORS.bg : COLORS.text,
    fontWeight: 950,
    fontFamily: "inherit",
    fontSize: 14,
    cursor: "pointer",
    textDecoration: "none",
  }

  if (href) return <a href={href} style={style}>{children}</a>
  return <button type="button" onClick={onClick} style={style}>{children}</button>
}

function BillingChoice({ label, price, period, badge, color, onClick, button }) {
  return (
    <div style={{ border: `1px solid ${color}44`, background: "rgba(8,20,38,.55)", borderRadius: 8, padding: 13 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <strong>{label}</strong>
        {badge && <span style={{ color, fontSize: 11, fontWeight: 950 }}>{badge}</span>}
      </div>
      <div style={{ margin: "10px 0 12px" }}>
        <span style={{ color, fontSize: 28, fontWeight: 950, fontFamily: "'DM Serif Display', serif" }}>{price}</span>
        <span style={{ color: COLORS.muted, marginLeft: 5 }}>{period}</span>
      </div>
      <Button onClick={onClick}>{button}</Button>
    </div>
  )
}

export default function PremiumLandingPage({ isAuthenticated = false }) {
  const [lang, setLang] = useState("fr")
  const c = CONTENT[lang]

  return (
    <main style={{ minHeight: "100vh", background: COLORS.bg, color: COLORS.text, fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;700;900&display=swap');
        * { box-sizing: border-box; }
        html, body, #root { margin: 0; min-height: 100%; background: ${COLORS.bg}; }
      `}</style>

      <header style={{ padding: "20px 18px", position: "absolute", inset: "0 0 auto", zIndex: 4 }}>
        <div style={{ maxWidth: 1160, margin: "0 auto", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <a href="/" aria-label="BudgetKazPei accueil" style={{ display: "inline-flex", alignItems: "center", gap: 9, textDecoration: "none" }}>
            <AppLogo size={38} />
            <span style={{ color: COLORS.text, fontWeight: 950, fontSize: 19, lineHeight: 1 }}>BudgetKazPei</span>
          </a>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button type="button" onClick={() => setLang(lang === "fr" ? "kr" : "fr")} style={{ minHeight: 42, borderRadius: 12, border: `1px solid ${COLORS.cyan}66`, background: "rgba(8,20,38,.72)", color: COLORS.cyan, fontWeight: 950, padding: "0 12px", fontFamily: "inherit", cursor: "pointer" }}>
              {c.switchLang}
            </button>
            {isAuthenticated ? (
              <Button href="/app" variant="secondary">{c.dashboard}</Button>
            ) : (
              <>
                <Button href="/login" variant="secondary">{c.login}</Button>
                <Button href="/register">{c.freeButton}</Button>
              </>
            )}
          </div>
        </div>
      </header>

      <section style={{ minHeight: "min(700px, calc(100vh - 80px))", display: "grid", placeItems: "center", textAlign: "center", padding: "122px 18px 72px", backgroundImage: `linear-gradient(180deg, rgba(8,20,38,.28), ${COLORS.bg} 96%), linear-gradient(90deg, rgba(8,20,38,.92), rgba(8,20,38,.60)), url(${HERO_BG})`, backgroundSize: "cover", backgroundPosition: "center" }}>
        <div style={{ maxWidth: 920 }}>
          <div style={{ display: "inline-flex", color: COLORS.cyan, fontWeight: 950, border: `1px solid ${COLORS.cyan}55`, background: "rgba(35,211,214,.10)", borderRadius: 999, padding: "7px 12px", marginBottom: 16 }}>
            {c.heroBadge}
          </div>
          <h1 style={{ margin: 0, fontFamily: "'DM Serif Display', serif", fontSize: "clamp(40px, 7vw, 78px)", lineHeight: 1.04, fontWeight: 400 }}>
            {c.heroTitle}
          </h1>
          <p style={{ maxWidth: 820, margin: "18px auto 0", color: "#D8E4F6", fontSize: "clamp(17px, 2.2vw, 21px)", lineHeight: 1.62, fontWeight: 800 }}>
            {c.heroText}
          </p>
        </div>
      </section>

      <section style={{ padding: "50px 18px", background: COLORS.bg }}>
        <h2 style={{ margin: "0 0 22px", textAlign: "center", fontFamily: "'DM Serif Display', serif", fontSize: "clamp(32px, 5vw, 48px)", fontWeight: 400 }}>
          {c.plansTitle}
        </h2>
        <div style={{ maxWidth: 1160, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
          {c.plans.map((plan, index) => (
            <article key={plan.name} style={{ background: plan.featured ? `linear-gradient(135deg, ${COLORS.yellow}18, ${COLORS.card})` : COLORS.card, border: `1px solid ${plan.featured ? COLORS.yellow : COLORS.border}`, borderRadius: 8, padding: 20 }}>
              <h3 style={{ margin: 0, color: plan.color, fontSize: 28 }}>{plan.name}</h3>
              <p style={{ color: COLORS.text, fontWeight: 950, margin: "10px 0 6px" }}>{plan.promise}</p>
              <div style={{ display: "grid", gap: 8, marginBottom: index === 0 ? 18 : 16 }}>
                {plan.features.map(feature => (
                  <div key={feature} style={{ color: COLORS.muted, fontWeight: 750 }}>✓ {feature}</div>
                ))}
              </div>

              {index === 0 && (
                <Button href={isAuthenticated ? "/app" : "/register"}>
                  {isAuthenticated ? c.dashboard : c.freeButton}
                </Button>
              )}
              {index === 1 && (
                <div style={{ display: "grid", gap: 10 }}>
                  <BillingChoice label={c.monthly} price={PREMIUM_PRICE} period="/mois" color={plan.color} button={c.choosePremiumMonthly} onClick={() => openStripeLink(STRIPE_LINKS.premiumMonthly)} />
                </div>
              )}
              {index === 2 && (
                <div style={{ display: "grid", gap: 10 }}>
                  <BillingChoice label={c.monthly} price={PREMIUM_PLUS_PRICE} period="/mois" color={plan.color} button={c.choosePlusMonthly} onClick={() => openStripeLink(STRIPE_LINKS.premiumPlusMonthly)} />
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      <section style={{ padding: "46px 18px", background: COLORS.band }}>
        <div style={{ maxWidth: 920, margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ margin: "0 0 10px", color: COLORS.purple, fontFamily: "'DM Serif Display', serif", fontSize: "clamp(32px, 5vw, 48px)", fontWeight: 400 }}>
            {c.valueTitle}
          </h2>
          <p style={{ margin: 0, color: COLORS.muted, lineHeight: 1.7, fontWeight: 800, fontSize: 17 }}>{c.valueText}</p>
        </div>
      </section>

      <section style={{ padding: "48px 18px", background: COLORS.bg }}>
        <h2 style={{ margin: "0 0 18px", textAlign: "center", fontFamily: "'DM Serif Display', serif", fontSize: "clamp(30px, 5vw, 44px)", fontWeight: 400 }}>{c.faqTitle}</h2>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "grid", gap: 10 }}>
          {c.faq.map(([question, answer]) => (
            <details key={question} style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "15px 16px" }}>
              <summary style={{ cursor: "pointer", color: COLORS.text, fontWeight: 950 }}>{question}</summary>
              <p style={{ margin: "10px 0 0", color: COLORS.muted, lineHeight: 1.6, fontWeight: 700 }}>{answer}</p>
            </details>
          ))}
        </div>
      </section>
    </main>
  )
}
