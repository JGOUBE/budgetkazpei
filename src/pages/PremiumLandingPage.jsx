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

const WATERMARK = "/icons-creole/palmier.png"
const PREMIUM_PRICE = "2,99 €"
const PREMIUM_PLUS_PRICE = "4,99 €"

const CONTENT = {
  fr: {
    back: "Retour à l'app",
    switchLang: "🇷🇪 Kréol",
    heroBadge: "🇷🇪 Pensé pour La Réunion",
    heroTitle: "💰 Plus d'argent. Moins de stress.",
    heroText: "Aides, économies et bons plans : ne laissez plus les opportunités vous échapper.",
    heroButton: "⭐ Voir les avantages Premium",

    problemTitle: "💡 Aides, économies, réductions, dispositifs locaux...",
    problemText: "Chaque mois, des opportunités passent inaperçues. BudgetKazPei Premium vous aide à les identifier pour améliorer votre budget et augmenter votre pouvoir d'achat.",

    imagineTitle: "🌴 Imaginez votre prochain mois",
    imagineItems: [
      "Une vision claire de votre budget",
      "Des aides identifiées",
      "Des économies réalisées",
      "Des bons plans découverts",
      "Moins de mauvaises surprises",
      "Plus de sérénité",
    ],

    analysisTitle: "🔎 Exemple d'analyse BudgetKazPei Premium",
    analysisItems: [
      "Situation analysée",
      "Aides potentielles détectées",
      "Économies possibles identifiées",
      "Bons plans locaux détectés",
      "Documents à préparer",
    ],
    analysisLocked: "Débloquez l'analyse complète avec Premium",

    reunionTitle: "🇷🇪 Pourquoi BudgetKazPei ?",
    reunionText: "Le coût de la vie augmente. Les aides existent. Les bons plans aussi. Encore faut-il les connaître. BudgetKazPei Premium vous aide à identifier les opportunités qui pourraient améliorer votre quotidien et votre pouvoir d'achat.",

    freeTitle: "Gratuit",
    premiumTitle: "Premium",
    premiumPlusTitle: "Premium+",
    freeSubtitle: "Découvrir BudgetKazPei et suivre l'essentiel.",
    premiumSubtitle: "Pour ceux qui veulent identifier davantage d'opportunités et rester informés.",
    premiumPlusSubtitle: "Votre copilote BudgetKazPei. Analyse, accompagnement et futures fonctionnalités IA.",
    freeButton: "🔍 Voir mes aides possibles",
    premiumButton: "⭐ Débloquer Premium",
    premiumPlusButton: "👑 Passer à Premium+",
    perMonth: "/mois",
    popularBadge: "POPULAIRE",
    recommendedPlusBadge: "RECOMMANDÉ ++",
    premiumSoon: "Le paiement Premium sera branché à Stripe à l'étape suivante.",
    premiumPlusSoon: "Le paiement Premium+ sera branché à Stripe à l'étape suivante.",

    trustTitle: "💬 BudgetKazPei évolue avec ses utilisateurs",
    trustText: "Chaque retour compte. Vos remarques permettront d'améliorer l'application et d'ajouter les fonctionnalités les plus utiles aux Réunionnais.",

    faqTitle: "Questions fréquentes",
    faq: [
      ["Puis-je résilier mon abonnement ?", "Oui. Vous pourrez mettre fin à votre abonnement à tout moment depuis l'espace prévu sur le site. Votre accès restera actif jusqu'à la fin de la période déjà réglée."],
      ["Puis-je changer d'offre ?", "Oui. Vous pourrez passer de Premium à Premium+ si vous souhaitez accéder au futur Conseiller IA BudgetKazPei et aux fonctionnalités avancées."],
      ["Mes données sont-elles conservées ?", "Oui. Vos données restent associées à votre compte BudgetKazPei et sont stockées de manière sécurisée. Elles ne sont pas revendues à des tiers."],
      ["Pourquoi une offre Premium ?", "Les offres Premium permettent de financer l'évolution de BudgetKazPei tout en proposant davantage d'outils, d'alertes et d'opportunités aux utilisateurs qui veulent aller plus loin."],
      ["BudgetKazPei est-il réservé aux bénéficiaires d'aides ?", "Non. BudgetKazPei s'adresse à tous les Réunionnais qui veulent mieux gérer leur budget, suivre leurs dépenses, identifier des aides possibles et découvrir des bons plans utiles."],
      ["Le Conseiller IA est-il déjà disponible ?", "Le Conseiller IA BudgetKazPei est en cours de développement. Il sera progressivement enrichi pour accompagner les utilisateurs dans leur budget, leurs démarches et leurs décisions du quotidien."],
      ["Les fonctionnalités vont-elles évoluer ?", "Oui. De nouvelles aides, de nouveaux bons plans, de nouvelles alertes et de nouveaux outils seront ajoutés régulièrement grâce aux retours des utilisateurs."],
    ],

    freeFeatures: [
      "Tableau de bord budget",
      "Dépenses et revenus",
      "Charges fixes",
      "Historique simple",
      "Profil utilisateur",
      "Aides & droits en version simple",
      "Français / créole",
    ],
    premiumFeatures: [
      "Tout le gratuit inclus",
      "Assistant Aides Réunion 🇷🇪",
      "Réponses en français ou créole",
      "Analyse personnalisée des aides",
      "Suivi des démarches",
      "Documents à préparer",
      "Alertes budget intelligentes",
      "Nouveautés aides et dispositifs",
      "Bons plans locaux",
      "Opportunités & économies",
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
      "Accompagnement personnalisé",
      "Futures fonctionnalités IA",
    ],
  },

  kr: {
    back: "Retour dann l'app",
    switchLang: "🇫🇷 Français",
    heroBadge: "🇷🇪 Fait pou La Rényon",
    heroTitle: "💰 Plis larzan. Mwins stress.",
    heroText: "Zéd, économies é bon plan : laisse pa bann opportunités chap aou.",
    heroButton: "⭐ Voir bann avantages Premium",

    problemTitle: "💡 Zéd, économies, réductions, dispositifs lokal...",
    problemText: "Chak mwa, nana bann opportunités i passe inaperçues. BudgetKazPei Premium i aide aou trouv sak i pourrait améliore out bidjé é augmente out pouvoir d'achat.",

    imagineTitle: "🌴 Imagine out prochain mwa",
    imagineItems: [
      "In vision kler de out bidjé",
      "Bann zéd identifiées",
      "Bann économies réalisées",
      "Bann bon plan découverts",
      "Mwins mauvaise surprise",
      "Plis trankilité",
    ],

    analysisTitle: "🔎 Egzanp analiz BudgetKazPei Premium",
    analysisItems: [
      "Sitiasyon analizée",
      "Zéd potentielles détectées",
      "Économies possibles identifiées",
      "Bon plan lokal détectés",
      "Dokiman pou préparé",
    ],
    analysisLocked: "Débloque analiz konplète ek Premium",

    reunionTitle: "🇷🇪 Poukoi BudgetKazPei ?",
    reunionText: "La vie lé chère. Bann zéd i existe. Bann bon plan osi. Mé fo koné zot. BudgetKazPei Premium i aide aou trouv bann opportunités ke pourrait améliore out quotidien é out pouvoir d'achat.",

    freeTitle: "Gratis",
    premiumTitle: "Premium",
    premiumPlusTitle: "Premium+",
    freeSubtitle: "Découv BudgetKazPei é suivre lessentiel.",
    premiumSubtitle: "Pou bann moun ke i veu trouv plis opportunités é reste informés.",
    premiumPlusSubtitle: "Out copilote BudgetKazPei. Analiz, accompagnement é futures fonctionnalités IA.",
    freeButton: "🔍 Voir mon bann zéd possibles",
    premiumButton: "⭐ Débloque Premium",
    premiumPlusButton: "👑 Pass Premium+",
    perMonth: "/mwa",
    popularBadge: "POPILÈR",
    recommendedPlusBadge: "REKOMANDÉ ++",
    premiumSoon: "Paiement Premium va être branché ek Stripe dann prochaine étape.",
    premiumPlusSoon: "Paiement Premium+ va être branché ek Stripe dann prochaine étape.",

    trustTitle: "💬 BudgetKazPei i évolue ek bann utilisateurs",
    trustText: "Sak retour lé important. Out remarques i va aide améliore l'application é ajoute bann fonctionnalités pli utiles pou bann Rényoné.",

    faqTitle: "Kestion souvan",
    faq: [
      ["Mi pé résilié mon abonnement ?", "Wi. Ou pourra arrêt out abonnement à tout moment depi lespas prévu su site. Out accès i reste actif ziska la fin période déjà réglée."],
      ["Mi pé changer doffre ?", "Wi. Ou pourra pass Premium à Premium+ si ou veu accès au futur Konseye IA BudgetKazPei é fonctionnalités avancées."],
      ["Mon bann données lé gardées ?", "Wi. Out données i reste liées ek out compte BudgetKazPei é stockées de manière sécurisée. Zot lé pa revendues à des tiers."],
      ["Poukoi in offre Premium ?", "Bann offres Premium i permet finance évolution BudgetKazPei é proposé plis zouti, alertes é opportunités pou bann utilisateurs ke i veu allé pli loin."],
      ["BudgetKazPei lé réservé pou bann bénéficiaires daides ?", "Non. BudgetKazPei lé pou tout bann Rényoné ke i veu mieux gérer zot bidjé, suivre zot dépans, trouv zéd possibles é découv bon plan utiles."],
      ["Konseye IA lé déjà disponible ?", "Konseye IA BudgetKazPei lé en développement. Li sera enrichi progressivement pou aide su bidjé, démarches é décisions du quotidien."],
      ["Fonctionnalités i va évolué ?", "Wi. Nouvo zéd, nouvo bon plan, nouvo alertes é nouvo zouti va être ajoutés régulièrement grâce aux retours utilisateurs."],
    ],

    freeFeatures: [
      "Tablo débor bidjé",
      "Dépans é larzan rantre",
      "Sarz fix",
      "Istorik simpl",
      "Profil itilizatèr",
      "Zéd & drwa an version simpl",
      "Fransé / kréol",
    ],
    premiumFeatures: [
      "Tout sa lé gratis inclus",
      "Asistan Zéd Rényon 🇷🇪",
      "Répons an fransé ou kréol",
      "Analiz personnalisée bann zéd",
      "Suivi bann démarches",
      "Dokiman pou préparé",
      "Alèrt bidjé entèlizan",
      "Nouveautés zéd é dispositifs",
      "Bon plan lokal",
      "Opportunités & économies",
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
      "Accompagnement personnalisé",
      "Futures fonctionnalités IA",
    ],
  },
}

function Watermark({ size = 230, right = -45, bottom = -70 }) {
  return (
    <img
      src={WATERMARK}
      alt=""
      style={{
        position: "absolute",
        width: size,
        right,
        bottom,
        opacity: 0.055,
        pointerEvents: "none",
        userSelect: "none",
        transform: "rotate(-8deg)",
        filter: "grayscale(1) brightness(1.9)",
      }}
    />
  )
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

function ValueCard({ title, text, color = COLORS.cyan, children }) {
  return (
    <section
      style={{
        position: "relative",
        overflow: "hidden",
        background: `linear-gradient(135deg, ${color}12, ${COLORS.card})`,
        border: `1px solid ${color}35`,
        borderRadius: 24,
        padding: 24,
      }}
    >
      <Watermark size={190} right={-55} bottom={-70} />
      <div style={{ position: "relative", zIndex: 1 }}>
        <h2
          style={{
            margin: "0 0 10px",
            color,
            fontSize: 24,
            fontFamily: "'DM Serif Display', serif",
            fontWeight: 400,
          }}
        >
          {title}
        </h2>
        {text && <p style={{ color: COLORS.muted, margin: 0, lineHeight: 1.65, fontSize: 16 }}>{text}</p>}
        {children}
      </div>
    </section>
  )
}

function MiniCheckList({ items, color = COLORS.green }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginTop: 16 }}>
      {items.map((item, index) => (
        <div
          key={index}
          style={{
            background: "rgba(255,255,255,.045)",
            border: "1px solid rgba(255,255,255,.09)",
            borderRadius: 14,
            padding: "11px 12px",
            color: COLORS.text,
            fontWeight: 800,
            fontSize: 13.5,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ color, fontWeight: 900 }}>✓</span>
          {item}
        </div>
      ))}
    </div>
  )
}

function AnalysisPreview({ c }) {
  return (
    <ValueCard title={c.analysisTitle} color={COLORS.yellow}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: 12,
          marginTop: 14,
        }}
      >
        {c.analysisItems.map((item, index) => (
          <div
            key={index}
            style={{
              background: "rgba(10,22,40,.65)",
              border: `1px solid ${COLORS.yellow}30`,
              borderRadius: 16,
              padding: 14,
              minHeight: 82,
            }}
          >
            <div style={{ color: COLORS.yellow, fontWeight: 900, fontSize: 19, marginBottom: 8 }}>✓</div>
            <div style={{ color: COLORS.text, fontWeight: 900, fontSize: 14 }}>{item}</div>
            <div style={{ marginTop: 8, height: 7, borderRadius: 99, background: "rgba(142,164,197,.22)", overflow: "hidden" }}>
              <div style={{ width: `${48 + index * 9}%`, height: "100%", background: COLORS.yellow, opacity: 0.55 }} />
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 16,
          background: "rgba(252,211,77,.10)",
          border: `1px solid ${COLORS.yellow}35`,
          borderRadius: 16,
          padding: 14,
          color: COLORS.yellow,
          fontWeight: 900,
          textAlign: "center",
        }}
      >
        🔒 {c.analysisLocked}
      </div>
    </ValueCard>
  )
}

function PlanCard({ icon, title, price, subtitle, features, color, badge, buttonText, onClick, perMonth, featured = false }) {
  return (
    <article
      style={{
        position: "relative",
        overflow: "hidden",
        background: `linear-gradient(135deg, ${color}18, ${COLORS.card})`,
        border: `2px solid ${color}66`,
        borderRadius: 24,
        padding: 24,
        boxShadow: featured ? `0 24px 70px ${color}22` : `0 20px 50px ${color}10`,
        transform: featured ? "translateY(-6px)" : "none",
      }}
    >
      <Watermark size={190} right={-55} bottom={-70} />

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
            zIndex: 2,
          }}
        >
          {badge}
        </div>
      )}

      <div style={{ position: "relative", zIndex: 1 }}>
        <div style={{ fontSize: 42, marginBottom: 10 }}>{icon}</div>
        <h2 style={{ margin: 0, color, fontSize: 25, fontFamily: "'DM Serif Display', serif" }}>{title}</h2>
        <p style={{ color: COLORS.muted, minHeight: 54, lineHeight: 1.5, fontSize: 14 }}>{subtitle}</p>

        <div style={{ margin: "16px 0 18px" }}>
          <span style={{ color, fontSize: 36, fontWeight: 900, fontFamily: "'DM Serif Display', serif" }}>{price}</span>
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
      </div>
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

  function goHome() {
    window.location.href = "/"
  }

  function scrollToPlans() {
    document.getElementById("offres")?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: `radial-gradient(circle at 20% 0%, rgba(35,211,214,.18), transparent 34%), radial-gradient(circle at 80% 8%, rgba(249,115,22,.14), transparent 30%), ${COLORS.bg}`,
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
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 30, flexWrap: "wrap" }}>
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
              onClick={goHome}
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
            position: "relative",
            overflow: "hidden",
            textAlign: "center",
            background: `linear-gradient(135deg, rgba(35,211,214,.14), rgba(252,211,77,.14), rgba(167,139,250,.12), ${COLORS.card})`,
            border: `1px solid ${COLORS.yellow}44`,
            borderRadius: 30,
            padding: "48px 22px",
            marginBottom: 18,
          }}
        >
          <Watermark size={330} right={-80} bottom={-115} />
          <div style={{ position: "relative", zIndex: 1 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                background: "rgba(35,211,214,.10)",
                border: `1px solid ${COLORS.cyan}44`,
                color: COLORS.cyan,
                borderRadius: 999,
                padding: "7px 13px",
                fontSize: 13,
                fontWeight: 900,
                marginBottom: 18,
              }}
            >
              {c.heroBadge}
            </div>

            <h1
              style={{
                margin: 0,
                color: COLORS.yellow,
                fontFamily: "'DM Serif Display', serif",
                fontSize: "clamp(36px, 6vw, 66px)",
                lineHeight: 1.04,
                fontWeight: 400,
              }}
            >
              {c.heroTitle}
            </h1>

            <p style={{ color: COLORS.text, maxWidth: 760, margin: "18px auto 0", lineHeight: 1.62, fontSize: 18, fontWeight: 700 }}>
              {c.heroText}
            </p>

            <button
              type="button"
              onClick={scrollToPlans}
              style={{
                marginTop: 24,
                background: `linear-gradient(135deg, ${COLORS.yellow}, ${COLORS.accent})`,
                color: COLORS.bg,
                border: "none",
                borderRadius: 16,
                padding: "15px 22px",
                fontSize: 16,
                fontWeight: 900,
                cursor: "pointer",
                fontFamily: "inherit",
                boxShadow: `0 12px 36px ${COLORS.yellow}28`,
              }}
            >
              {c.heroButton}
            </button>
          </div>
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

        <div style={{ display: "grid", gap: 18, marginBottom: 22 }}>
          <ValueCard title={c.problemTitle} text={c.problemText} color={COLORS.accent} />

          <ValueCard title={c.imagineTitle} color={COLORS.cyan}>
            <MiniCheckList items={c.imagineItems} color={COLORS.cyan} />
          </ValueCard>

          <AnalysisPreview c={c} />

          <ValueCard title={c.reunionTitle} text={c.reunionText} color={COLORS.green} />
        </div>

        <section
          id="offres"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 18,
            alignItems: "stretch",
            scrollMarginTop: 24,
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
            onClick={goHome}
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
            featured
            onClick={() => handleStripeSoon("premium_plus")}
          />
        </section>

        <section
          style={{
            marginTop: 24,
            background: `linear-gradient(135deg, ${COLORS.cyan}10, ${COLORS.card})`,
            border: `1px solid ${COLORS.cyan}30`,
            borderRadius: 22,
            padding: 22,
          }}
        >
          <h2 style={{ margin: "0 0 8px", color: COLORS.cyan, fontSize: 22 }}>{c.trustTitle}</h2>
          <p style={{ margin: 0, color: COLORS.muted, lineHeight: 1.6, fontWeight: 700 }}>{c.trustText}</p>
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
              <p key={question} style={{ margin: 0 }}>
                <strong style={{ color: COLORS.text }}>{question}</strong>
                <br />
                {answer}
              </p>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
