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
const WATERMARK = "/icons-creole/palmier.png"

const CONTENT = {
  fr: {
    back: "Retour à l'app",
    switchLang: "🇷🇪 Kréol",
    heroTitle: "Gérez votre budget. Découvrez les aides auxquelles vous avez droit.",
    heroText:
      "BudgetKazPei réunit votre budget, vos aides, vos démarches et vos bons plans dans une seule application.",
    localBadge: "🇷🇪 Conçu à La Réunion, pour les Réunionnais.",
    heroCta: "Découvrir les offres",
    valueTitle: "🌴 Une seule application pour :",
    valueItems: [
      "Gérer votre budget",
      "Suivre vos démarches",
      "Identifier les aides auxquelles vous pourriez avoir droit",
      "Préparer vos documents",
      "Recevoir des conseils personnalisés",
    ],
    problemTitle: "Pourquoi BudgetKazPei ?",
    problems: [
      "Vous avez parfois l'impression de passer à côté d'une aide ?",
      "Vous manquez de temps pour suivre vos démarches administratives ?",
      "Vous aimeriez mieux comprendre où part votre argent chaque mois ?",
    ],
    solution:
      "BudgetKazPei vous aide à centraliser vos informations, à suivre vos droits et à garder le contrôle sur votre budget.",
    reunionTitle: "🇷🇪 Pensé pour La Réunion",
    reunionText:
      "Une application locale, simple et utile, pensée pour les réalités du quotidien à La Réunion.",
    reunionItems: [
      "Français & Créole réunionnais",
      "Aides locales et nationales",
      "Budget familial",
      "Démarches administratives",
      "Bons plans intelligents",
    ],
    freeTitle: "Gratuit",
    premiumTitle: "Premium",
    premiumPlusTitle: "Premium+",
    freeSubtitle: "L'essentiel pour suivre votre budget au quotidien.",
    premiumSubtitle:
      "L'offre idéale pour suivre vos aides, vos démarches et vos documents.",
    premiumPlusSubtitle:
      "Votre futur conseiller BudgetKazPei : conseils personnalisés, aide aux démarches et outils avancés pour mieux gérer votre quotidien.",
    freeButton: "Commencer gratuitement",
    premiumButton: "Choisir Premium",
    premiumPlusButton: "Choisir Premium+",
    perMonth: "/mois",
    popularBadge: "POPULAIRE",
    recommendedPlusBadge: "RECOMMANDÉ ++",
    premiumSoon: "Le paiement Premium sera branché à Stripe à l'étape suivante.",
    premiumPlusSoon: "Le paiement Premium+ sera branché à Stripe à l'étape suivante.",
    trustTitle: "BudgetKazPei évolue avec ses utilisateurs",
    trustText:
      "Chaque suggestion contribue à améliorer l'application. L'objectif est simple : construire un outil vraiment utile pour les Réunionnais.",
    faqTitle: "Questions fréquentes",
    faq: [
      [
        "Puis-je résilier mon abonnement ?",
        "Oui. Vous pourrez mettre fin à votre abonnement à tout moment depuis l'espace prévu sur le site. Votre accès Premium ou Premium+ restera actif jusqu'à la fin de la période déjà réglée.",
      ],
      [
        "Puis-je changer d'offre ?",
        "Oui. Vous pourrez passer de Premium à Premium+ si vous souhaitez accéder au futur Conseiller IA BudgetKazPei et aux fonctionnalités avancées. L'objectif est de vous laisser choisir l'offre qui correspond le mieux à vos besoins.",
      ],
      [
        "Mes données sont-elles conservées ?",
        "Oui. Vos données restent associées à votre compte BudgetKazPei et sont stockées de manière sécurisée. Vos informations ne sont pas revendues à des tiers.",
      ],
      [
        "Pourquoi une offre Premium ?",
        "Le développement et l'amélioration de BudgetKazPei demandent du temps, des serveurs et des services avancés. Les offres Premium permettent de financer l'évolution de l'application tout en proposant davantage d'outils aux utilisateurs qui le souhaitent.",
      ],
      [
        "BudgetKazPei est-il réservé aux bénéficiaires d'aides ?",
        "Non. BudgetKazPei s'adresse à tous les Réunionnais qui souhaitent mieux gérer leur budget, suivre leurs dépenses et rester informés des aides et dispositifs existants.",
      ],
      [
        "Le Conseiller IA est-il déjà disponible ?",
        "Le Conseiller IA BudgetKazPei est en cours de développement. Il sera progressivement enrichi afin d'aider les utilisateurs dans leurs démarches, leur budget et la préparation de certains documents administratifs.",
      ],
      [
        "Les fonctionnalités vont-elles évoluer ?",
        "Oui. BudgetKazPei évolue régulièrement grâce aux retours de ses utilisateurs. De nouvelles fonctionnalités, aides, outils et améliorations seront ajoutés au fil du temps.",
      ],
      [
        "Comment proposer une amélioration ?",
        "Une rubrique Suggestions sera disponible dans l'application. Chaque remarque sera lue avec attention et pourra contribuer aux futures évolutions de BudgetKazPei.",
      ],
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
      "Futures fonctionnalités IA",
    ],
    premiumPlusExamplesTitle: "Exemples de demandes Premium+ :",
    premiumPlusExamples: [
      "Quelles aides puis-je demander ?",
      "Prépare mon dossier CAF",
      "Rédige un courrier",
      "Comment améliorer mon budget ?",
    ],
  },
  kr: {
    back: "Retour dann l'app",
    switchLang: "🇫🇷 Français",
    heroTitle: "Gèr out bidjé. Trouv bann zéd ke ou gagne drwa.",
    heroText:
      "BudgetKazPei i rassemble out bidjé, out bann zéd, out démarches é out bon plan dann in sèl aplikasyon.",
    localBadge: "🇷🇪 Fait pou La Rényon.",
    heroCta: "Découv bann offres",
    valueTitle: "🌴 In sèl aplikasyon pou :",
    valueItems: [
      "Gèr out bidjé",
      "Suivre out démarches",
      "Trouv bann zéd ke ou gagne drwa",
      "Prépar out bann dokiman",
      "Gagn bann konsey personnalisés",
    ],
    problemTitle: "Poukoi BudgetKazPei ?",
    problems: [
      "Ou la déza demandé aou : eske mi passe à koté in zéd ?",
      "Ou na pa touzour lo tan pou suivre out démarches administratives ?",
      "Ou aimeré mieux konprann koté out larzan i passe chak mwa ?",
    ],
    solution:
      "BudgetKazPei i aide aou garde tout ansanm, suivre out drwa é gèr mieux out larzan.",
    reunionTitle: "🇷🇪 Pensé pou La Rényon",
    reunionText:
      "In aplikasyon lokal, simple é itil, pensé pou la réalité la vi tou lé zour La Rényon.",
    reunionItems: [
      "Fransé é Kréol Rényoné",
      "Zéd lokal é national",
      "Bidjé la famille",
      "Démarches administratives",
      "Bon plan entèlizan",
    ],
    freeTitle: "Gratis",
    premiumTitle: "Premium",
    premiumPlusTitle: "Premium+",
    freeSubtitle: "Lessentiel pou suivre out bidjé tou lé zour.",
    premiumSubtitle:
      "Loffre idéal pou suivre out zéd, out démarches é out bann dokiman.",
    premiumPlusSubtitle:
      "Out futur konseye BudgetKazPei : konsey personnalisés, aide pou démarches é zouti avansé pou mieux gèr out quotidien.",
    freeButton: "Démarr gratis",
    premiumButton: "Choisir Premium",
    premiumPlusButton: "Choisir Premium+",
    perMonth: "/mwa",
    popularBadge: "POPILÈR",
    recommendedPlusBadge: "REKOMANDÉ ++",
    premiumSoon: "Paiement Premium va être branché ek Stripe dann prochaine étape.",
    premiumPlusSoon: "Paiement Premium+ va être branché ek Stripe dann prochaine étape.",
    trustTitle: "BudgetKazPei i évolue ek zot retours",
    trustText:
      "Chak suggestion i aide améliore l'application. Lobjectif lé simple : construire in zouti vraiment itil pou bann Rényoné.",
    faqTitle: "Kestion souvan",
    faq: [
      [
        "Mi pé résilié mon abonnement ?",
        "Wi. Ou pourra arrêt out abonnement kan ou veu depi lespas prévu su site. Out accès Premium ou Premium+ i reste actif ziska la fin période déza réglée.",
      ],
      [
        "Mi pé pass Premium à Premium+ ?",
        "Wi. Ou pourra pass Premium à Premium+ si ou veu gagn accès au futur Konseye IA BudgetKazPei é bann fonctionnalités pli avansées.",
      ],
      [
        "Mon bann données lé gardées ?",
        "Wi. Out données i reste liées ek out compte BudgetKazPei é stockées de manière sécurisée. Out informations i sera pa revendues à des tiers.",
      ],
      [
        "Poukoi in offre Premium ?",
        "Dévelopé é améliore BudgetKazPei i demande du temps, bann serveurs é services avansés. Bann offres Premium i aide finance l'évolution l'application tout en proposant plis zouti pou bann utilisateurs ke i veu.",
      ],
      [
        "BudgetKazPei lé réservé pou bann bénéficiaires zéd ?",
        "Non. BudgetKazPei lé pou tout bann Rényoné ke i veu mieux gèr zot bidjé, suivre zot dépenses é reste informés su bann zéd é dispositifs existants.",
      ],
      [
        "Konseye IA lé déza disponible ?",
        "Konseye IA BudgetKazPei lé en cours développement. Li va être enrichi progressivement pou aide bann utilisateurs dann démarches, bidjé é préparation certains dokiman administratifs.",
      ],
      [
        "Bann fonctionnalités va évolué ?",
        "Wi. BudgetKazPei i évolue régulièrement grâce aux retours bann utilisateurs. Nouvo fonctionnalités, zéd, zouti é améliorations va être ajoutés au fil du temps.",
      ],
      [
        "Komman propose in amélioration ?",
        "In rubrique Suggestions sera disponible dann l'application. Sak remarque sera lue ek attention é pourra contribuer bann futures évolutions BudgetKazPei.",
      ],
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
      "Futures fonctionnalités IA",
    ],
    premiumPlusExamplesTitle: "Exemples demandes Premium+ :",
    premiumPlusExamples: [
      "Ki zéd mi gagne demande ?",
      "Prépar mon dosyé CAF",
      "Ékri in courrier pou moin",
      "Komman améliore mon bidjé ?",
    ],
  },
}

function Watermark({ size = 260, right = -70, bottom = -95, opacity = 0.055 }) {
  return (
    <img
      src={WATERMARK}
      alt=""
      style={{
        position: "absolute",
        width: size,
        right,
        bottom,
        opacity,
        pointerEvents: "none",
        userSelect: "none",
        transform: "rotate(-8deg)",
        filter: "grayscale(1) brightness(1.8)",
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

function InfoCard({ title, text, items, color = COLORS.cyan }) {
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
      <Watermark size={210} right={-65} bottom={-80} opacity={0.04} />
      <div style={{ position: "relative", zIndex: 1 }}>
        <h2 style={{ margin: "0 0 10px", color, fontSize: 23, fontFamily: "'DM Serif Display', serif" }}>
          {title}
        </h2>
        {text && <p style={{ margin: "0 0 14px", color: COLORS.muted, lineHeight: 1.65 }}>{text}</p>}
        <div style={{ display: "grid", gap: 8 }}>
          {items.map((item, index) => (
            <div key={index} style={{ display: "flex", gap: 9, color: COLORS.text, fontWeight: 800, lineHeight: 1.45 }}>
              <span style={{ color }}>✔</span>
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function ProblemSolution({ c }) {
  return (
    <section
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        gap: 18,
        marginBottom: 22,
      }}
    >
      <div
        style={{
          background: `linear-gradient(135deg, rgba(251,113,133,.10), ${COLORS.card})`,
          border: "1px solid rgba(251,113,133,.28)",
          borderRadius: 24,
          padding: 24,
        }}
      >
        <h2 style={{ margin: "0 0 14px", color: COLORS.red, fontSize: 23, fontFamily: "'DM Serif Display', serif" }}>
          {c.problemTitle}
        </h2>
        <div style={{ display: "grid", gap: 11 }}>
          {c.problems.map((problem, index) => (
            <p key={index} style={{ margin: 0, color: COLORS.text, lineHeight: 1.55, fontWeight: 800 }}>
              {problem}
            </p>
          ))}
        </div>
      </div>

      <div
        style={{
          position: "relative",
          overflow: "hidden",
          background: `linear-gradient(135deg, rgba(34,197,94,.12), rgba(35,211,214,.08), ${COLORS.card})`,
          border: "1px solid rgba(34,197,94,.28)",
          borderRadius: 24,
          padding: 24,
        }}
      >
        <Watermark size={230} right={-70} bottom={-90} opacity={0.045} />
        <div style={{ position: "relative", zIndex: 1 }}>
          <h2 style={{ margin: "0 0 12px", color: COLORS.green, fontSize: 23, fontFamily: "'DM Serif Display', serif" }}>
            BudgetKazPei
          </h2>
          <p style={{ margin: 0, color: COLORS.text, lineHeight: 1.7, fontSize: 17, fontWeight: 800 }}>
            {c.solution}
          </p>
        </div>
      </div>
    </section>
  )
}

function PremiumPlusExamples({ c }) {
  return (
    <div
      style={{
        marginTop: 14,
        background: "rgba(167,139,250,.08)",
        border: "1px solid rgba(167,139,250,.25)",
        borderRadius: 16,
        padding: 14,
      }}
    >
      <div style={{ color: COLORS.purple, fontWeight: 900, fontSize: 13, marginBottom: 8 }}>
        {c.premiumPlusExamplesTitle}
      </div>
      <div style={{ display: "grid", gap: 7 }}>
        {c.premiumPlusExamples.map((example, index) => (
          <div key={index} style={{ color: COLORS.text, fontSize: 13, fontWeight: 800, lineHeight: 1.35 }}>
            “{example}”
          </div>
        ))}
      </div>
    </div>
  )
}

function PlanCard({ icon, title, price, subtitle, features, color, badge, buttonText, onClick, perMonth, highlight, children }) {
  return (
    <article
      style={{
        position: "relative",
        overflow: "hidden",
        background: `linear-gradient(135deg, ${color}18, ${COLORS.card})`,
        border: `2px solid ${color}66`,
        borderRadius: 26,
        padding: 24,
        boxShadow: highlight ? `0 24px 70px ${color}22` : `0 20px 50px ${color}10`,
        transform: highlight ? "translateY(-6px)" : "none",
      }}
    >
      <Watermark size={210} right={-55} bottom={-75} opacity={0.04} />
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
        <h2 style={{ margin: 0, color, fontSize: 27, fontFamily: "'DM Serif Display', serif" }}>
          {title}
        </h2>
        <p style={{ color: COLORS.muted, minHeight: 62, lineHeight: 1.55, fontSize: 14 }}>
          {subtitle}
        </p>

        <div style={{ margin: "16px 0 18px" }}>
          <span style={{ color, fontSize: 38, fontWeight: 900, fontFamily: "'DM Serif Display', serif" }}>
            {price}
          </span>
          {price !== "0 €" && <span style={{ color: COLORS.muted, marginLeft: 6 }}>{perMonth}</span>}
        </div>

        <div style={{ display: "grid", gap: 0 }}>
          {features.map((feature, index) => (
            <Feature key={index} color={color}>{feature}</Feature>
          ))}
        </div>

        {children}

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

  function scrollToOffers() {
    document.getElementById("offres")?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: `radial-gradient(circle at 15% 0%, rgba(35,211,214,.18), transparent 35%), radial-gradient(circle at 90% 10%, rgba(249,115,22,.14), transparent 28%), radial-gradient(circle at 50% 35%, rgba(167,139,250,.10), transparent 28%), ${COLORS.bg}`,
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
          <img src="/icons-creole/logo-budgetkazpei.png" alt="BudgetKazPei" style={{ width: 150, height: "auto" }} />

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
            position: "relative",
            overflow: "hidden",
            textAlign: "center",
            background: `linear-gradient(135deg, rgba(252,211,77,.17), rgba(35,211,214,.10), rgba(167,139,250,.13), ${COLORS.card})`,
            border: `1px solid ${COLORS.yellow}44`,
            borderRadius: 30,
            padding: "50px 24px",
            marginBottom: 22,
            boxShadow: "0 24px 80px rgba(0,0,0,.20)",
          }}
        >
          <Watermark size={340} right={-90} bottom={-130} opacity={0.05} />
          <div style={{ fontSize: 52, marginBottom: 12, position: "relative", zIndex: 1 }}>🌴⭐👑</div>
          <h1
            style={{
              margin: 0,
              color: COLORS.yellow,
              fontFamily: "'DM Serif Display', serif",
              fontSize: "clamp(34px, 5.2vw, 62px)",
              fontWeight: 400,
              lineHeight: 1.06,
              position: "relative",
              zIndex: 1,
            }}
          >
            {c.heroTitle}
          </h1>
          <p style={{ color: COLORS.text, maxWidth: 850, margin: "18px auto 0", lineHeight: 1.7, fontSize: 18, fontWeight: 800, position: "relative", zIndex: 1 }}>
            {c.heroText}
          </p>
          <div
            style={{
              margin: "18px auto 0",
              display: "inline-flex",
              background: "rgba(35,211,214,.10)",
              border: `1px solid ${COLORS.cyan}55`,
              borderRadius: 999,
              padding: "9px 14px",
              color: COLORS.cyan,
              fontWeight: 900,
              position: "relative",
              zIndex: 1,
            }}
          >
            {c.localBadge}
          </div>
          <div style={{ marginTop: 22, position: "relative", zIndex: 1 }}>
            <button
              type="button"
              onClick={scrollToOffers}
              style={{
                background: `linear-gradient(135deg, ${COLORS.yellow}, ${COLORS.accent})`,
                color: COLORS.bg,
                border: "none",
                borderRadius: 15,
                padding: "15px 22px",
                fontWeight: 900,
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 15,
              }}
            >
              {c.heroCta}
            </button>
          </div>
        </section>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 18, marginBottom: 22 }}>
          <InfoCard title={c.valueTitle} items={c.valueItems} color={COLORS.cyan} />
          <InfoCard title={c.reunionTitle} text={c.reunionText} items={c.reunionItems} color={COLORS.yellow} />
        </div>

        <ProblemSolution c={c} />

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
          id="offres"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(285px, 1fr))",
            gap: 18,
            alignItems: "stretch",
            paddingTop: 10,
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
            highlight
            onClick={() => handleStripeSoon("premium_plus")}
          >
            <PremiumPlusExamples c={c} />
          </PlanCard>
        </section>

        <section
          style={{
            position: "relative",
            overflow: "hidden",
            marginTop: 24,
            background: `linear-gradient(135deg, rgba(35,211,214,.10), rgba(249,115,22,.08), ${COLORS.card})`,
            border: `1px solid ${COLORS.cyan}35`,
            borderRadius: 22,
            padding: 24,
            textAlign: "center",
          }}
        >
          <Watermark size={260} right={-85} bottom={-110} opacity={0.04} />
          <div style={{ position: "relative", zIndex: 1 }}>
            <h2 style={{ margin: "0 0 10px", color: COLORS.cyan, fontSize: 24, fontFamily: "'DM Serif Display', serif" }}>
              {c.trustTitle}
            </h2>
            <p style={{ color: COLORS.text, margin: "0 auto", maxWidth: 760, lineHeight: 1.65, fontWeight: 800 }}>
              {c.trustText}
            </p>
          </div>
        </section>

        <section
          style={{
            marginTop: 24,
            background: "rgba(255,255,255,.045)",
            border: `1px solid ${COLORS.border}`,
            borderRadius: 22,
            padding: 24,
          }}
        >
          <h2 style={{ margin: "0 0 16px", color: COLORS.text, fontSize: 24, fontFamily: "'DM Serif Display', serif" }}>{c.faqTitle}</h2>
          <div style={{ display: "grid", gap: 14, color: COLORS.muted, lineHeight: 1.62 }}>
            {c.faq.map(([question, answer]) => (
              <div key={question} style={{ background: "rgba(255,255,255,.035)", border: "1px solid rgba(142,164,197,.12)", borderRadius: 16, padding: 15 }}>
                <strong style={{ color: COLORS.text, fontSize: 15 }}>{question}</strong>
                <p style={{ margin: "7px 0 0", color: COLORS.muted }}>{answer}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
