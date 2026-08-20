import { useEffect, useState } from "react"
import LandingHeader from "../components/landing/LandingHeader"
import LandingLink from "../components/landing/LandingLink"
import {
  LANDING_LANGUAGES,
  getLandingContent,
} from "../components/landing/landingContent"
import {
  PLAN_FEATURE_STATUS,
  PLAN_IDS,
} from "../config/plans"
import "../styles/landing.css"

const CONTACT_EMAIL = "contact.budgetkazpei@gmail.com"
const LANDING_LANGUAGE_STORAGE_KEY = "budgetkazpei-public-language"

const STRIPE_LINKS = {
  premiumMonthly: "https://buy.stripe.com/7sYbJ0fIR2JU4yua1ggMw00",
  premiumPlusMonthly: "https://buy.stripe.com/7sY28qdAJ1FQ6GCddsgMw03",
}

const PREMIUM_CONTENT = {
  fr: {
    seo: {
      title: "Offres BudgetKazPéi — Gratuit, Premium et Premium+",
      description:
        "Comparez les offres Gratuit, Premium et Premium+ de BudgetKazPéi et choisissez le niveau d'accompagnement adapté à votre quotidien.",
    },
    navItems: [
      { label: "Offres", href: "#offres" },
      { label: "Quelle formule choisir ?", href: "#comparatif" },
      { label: "FAQ", href: "#faq" },
    ],
    hero: {
      eyebrow: "Découvrir BudgetKazPéi",
      title: "Découvrez, soyez conseillé, puis accompagné.",
      text:
        "Gratuit pose les bases. Premium ajoute le Conseiller pour la gestion quotidienne. Premium+ vous accompagne dans des démarches concrètes.",
      trust: [
        "Sans engagement",
        "Paiement sécurisé par Stripe",
        "Disponible en français et en créole réunionnais",
      ],
    },
    offers: {
      eyebrow: "Les offres",
      title: "Trois niveaux, faciles à comparer.",
      intro:
        "Chaque formule reprend les outils de la précédente et ajoute un accompagnement plus complet.",
      recommended: "Recommandé",
      complete: "Accompagnement complet",
      monthly: "Mensuel",
      perMonth: "/mois",
      freeCta: "Commencer gratuitement",
      dashboardCta: "Accéder à mon tableau de bord",
      premiumCta: "Choisir Premium",
      premiumPlusCta: "Choisir Premium+",
      premiumGuestCta: "Créer mon compte pour Premium",
      premiumPlusGuestCta: "Créer mon compte pour Premium+",
      normalUse: "Utilisation illimitée dans le cadre d'un usage normal du service.",
      comingSoonTitle: "En préparation",
      comingSoonText:
        "Les comparaisons intelligentes et les Bons plans personnalisés seront ajoutés progressivement, à mesure que la base locale s'enrichit.",
    },
    comparison: {
      eyebrow: "Quelle formule choisir ?",
      title: "Choisissez selon votre usage réel.",
      intro:
        "Vous pouvez commencer gratuitement et changer de formule lorsque vos besoins évoluent.",
      choices: [
        {
          label: "Je veux découvrir l'application",
          plan: "Gratuit",
          text: "Pour gérer un budget simple et tester le scanner.",
        },
        {
          label: "Je veux être conseillé au quotidien",
          plan: "Premium",
          text: "Le Conseiller analyse budget, dépenses, habitudes, courses et aides, avec une utilisation limitée.",
        },
        {
          label: "Je veux agir avec un accompagnement avancé",
          plan: "Premium+",
          text: "Pour préparer dossiers, courriers, emails, relances, rendez-vous et recours.",
        },
      ],
    },
    faq: {
      eyebrow: "FAQ",
      title: "Questions fréquentes",
      items: [
        [
          "Quelle est la différence entre Premium et Premium+ ?",
          "Premium donne accès au Conseiller BudgetKazPéi en utilisation limitée pour la gestion quotidienne. Premium+ ajoute une utilisation illimitée dans le cadre d'un usage normal et l'accompagnement avancé des démarches.",
        ],
        [
          "Que se passe-t-il lorsque j'atteins ma limite de scans ?",
          "Avec Premium, le scanner redevient disponible au début du mois suivant. Vous pouvez toujours ajouter ou corriger une dépense manuellement.",
        ],
        [
          "Le scanner de tickets est-il obligatoire ?",
          "Non. BudgetKazPéi reste utilisable sans scanner. Vous pouvez saisir vos revenus, dépenses et courses manuellement.",
        ],
        [
          "Comment sont protégées les photos de mes tickets ?",
          "Les photos servent temporairement au traitement du ticket. Elles sont ensuite supprimées automatiquement, tandis que les données utiles à votre budget restent conservées.",
        ],
        [
          "Puis-je arrêter mon abonnement ?",
          "Oui. Les formules Premium sont sans engagement et peuvent être arrêtées lorsque vous le souhaitez.",
        ],
      ],
    },
    footer: {
      privacy: "Confidentialité",
      terms: "Conditions",
      deleteAccount: "Suppression du compte",
      navigationAriaLabel: "Liens de pied de page",
    },
  },
  kr: {
    seo: {
      title: "Bann offres BudgetKazPéi — Gratis, Premium ek Premium+",
      description:
        "Konpar bann offres Gratis, Premium ek Premium+ BudgetKazPéi é swazi lakonpagnman ki korespond ek out kotidien.",
    },
    navItems: [
      { label: "Bann offres", href: "#offres" },
      { label: "Kèl offre swazi ?", href: "#comparatif" },
      { label: "FAQ", href: "#faq" },
    ],
    hero: {
      eyebrow: "Dékouv BudgetKazPéi",
      title: "Dékouv, gagn konsey, épi gagn lakonpagnman.",
      text:
        "Gratis i poz bann baz. Premium i azout Konseyé-la pou lo kotidien. Premium+ i akonpagn aou dann bann demars konkrè.",
      trust: [
        "San langazman",
        "Payman sekirizé par Stripe",
        "Disponib an fransé ek kréol rényoné",
      ],
    },
    offers: {
      eyebrow: "Bann offres",
      title: "Trois nivo, fasil pou konparé.",
      intro:
        "Sak formule i repran bann zouti formule avan é i azout in lakonpagnman pli konplé.",
      recommended: "Nou konsey",
      complete: "Lakonpagnman konplé",
      monthly: "Chak mwa",
      perMonth: "/mwa",
      freeCta: "Koumans gratis",
      dashboardCta: "Alé su mon tablo débor",
      premiumCta: "Swazi Premium",
      premiumPlusCta: "Swazi Premium+",
      premiumGuestCta: "Kré mon kont pou Premium",
      premiumPlusGuestCta: "Kré mon kont pou Premium+",
      normalUse: "Itilizasion san limit dann kad in lizaz normal servis-la.",
      comingSoonTitle: "An préparasyon",
      comingSoonText:
        "Konparézon entélizan ek Bon Plan pèsonalizé va ariv progressivement, amezir baz lokal-la i grandi.",
    },
    comparison: {
      eyebrow: "Kèl offre swazi ?",
      title: "Swazi selon koman ou servi BudgetKazPéi.",
      intro:
        "Ou pé koumans gratis é shanz formule kan out bezoin i évolié.",
      choices: [
        {
          label: "Mi vé dékouv laplikasyon",
          plan: "Gratis",
          text: "Pou gèr in bidjé senp ek teste scanner-la.",
        },
        {
          label: "Mi vé gagn konsey dann mon kotidien",
          plan: "Premium",
          text: "Konseyé-la i analiz bidjé, dépans, labitid, courses ek èd, avèk in itilizasion limité.",
        },
        {
          label: "Mi vé azir avèk in lakonpagnman avansé",
          plan: "Premium+",
          text: "Pou prépar dosyé, kourrié, email, relans, randévou ek rekour.",
        },
      ],
    },
    faq: {
      eyebrow: "FAQ",
      title: "Kestion souvan pozé",
      items: [
        [
          "Kosa lé diferans ant Premium ek Premium+ ?",
          "Premium i donn aksé Konseyé BudgetKazPéi an itilizasion limité pou lo kotidien. Premium+ i azout in itilizasion san limit dann kad in lizaz normal ek lakonpagnman avansé pou bann demars.",
        ],
        [
          "Kosa i ariv kan mi ariv mon limit scans ?",
          "Avèk Premium, scanner-la i revien disponib komansman mwa apré. Ou pé touzour azout ou korij in dépans amain.",
        ],
        [
          "Scanner tiké-la lé obligatoire ?",
          "Non. BudgetKazPéi i marche san scanner osi. Ou pé rant out larzan, out dépans ek out courses amain.",
        ],
        [
          "Koman bann foto mon tiké lé protézé ?",
          "Bann foto i servi tanporèrman pou traite tiké-la. Apré zot lé suprimé otomatikman, mé bann données itil pou out bidjé i reste sovgardé.",
        ],
        [
          "Mi pé arèt mon abonman ?",
          "Wi. Bann formules Premium lé san langazman é ou pé arèt kan ou vé.",
        ],
      ],
    },
    footer: {
      privacy: "Konfidansyalité",
      terms: "Kondisyon",
      deleteAccount: "Suprim mon kont",
      navigationAriaLabel: "Lien anba paz",
    },
  },
}

function getInitialLanguage() {
  if (typeof window === "undefined") return LANDING_LANGUAGES.fr

  try {
    const storedLanguage = window.localStorage.getItem(LANDING_LANGUAGE_STORAGE_KEY)
    return storedLanguage === LANDING_LANGUAGES.kr
      ? LANDING_LANGUAGES.kr
      : LANDING_LANGUAGES.fr
  } catch {
    return LANDING_LANGUAGES.fr
  }
}

function usePremiumSeo(content, language) {
  useEffect(() => {
    if (typeof document === "undefined") return

    document.title = content.title
    document.documentElement.lang = language === LANDING_LANGUAGES.kr ? "rcf" : "fr"

    let description = document.head.querySelector('meta[name="description"]')
    if (!description) {
      description = document.createElement("meta")
      description.setAttribute("name", "description")
      document.head.appendChild(description)
    }
    description.setAttribute("content", content.description)
  }, [content, language])
}

function PlanCard({ plan, content, isAuthenticated }) {
  const isFree = plan.id === PLAN_IDS.free
  const isPremium = plan.id === PLAN_IDS.premium
  const isPremiumPlus = plan.id === PLAN_IDS.premiumPlus
  const badge = isPremium ? content.recommended : isPremiumPlus ? content.complete : null
  const ctaLabel = isFree
    ? isAuthenticated
      ? content.dashboardCta
      : content.freeCta
    : isPremium
      ? (isAuthenticated ? content.premiumCta : content.premiumGuestCta)
      : (isAuthenticated ? content.premiumPlusCta : content.premiumPlusGuestCta)
  const href = isFree
    ? isAuthenticated
      ? "/app"
      : "/register"
    : !isAuthenticated
      ? "/register"
      : isPremium
        ? STRIPE_LINKS.premiumMonthly
        : STRIPE_LINKS.premiumPlusMonthly
  const displayPrice = plan.price.replace(/\/mois$/, "")

  return (
    <article
      className={`pricing-card pricing-card--${plan.tone} premium-pricing-card ${plan.featured ? "pricing-card--featured premium-pricing-card--featured" : ""}`}
      aria-label={`${plan.name} — ${plan.price}`}
    >
      {badge && <span className="premium-pricing-card__badge">{badge}</span>}

      <div className="premium-plan__heading">
        <p className="pricing-card__label">{plan.name}</p>
        <div className="premium-plan__price-row">
          <strong className="premium-plan__price">{displayPrice}</strong>
          {!isFree && <span>{content.perMonth}</span>}
        </div>
        {!isFree && <p className="premium-plan__billing">{content.monthly}</p>}
        <p className="premium-plan__intro">{plan.intro}</p>
        {isPremiumPlus && <p className="premium-plan__usage-note">{content.normalUse}</p>}
      </div>

      <ul className="premium-plan__features">
        {plan.items.map(item => (
          <li key={item.text} className={item.status === PLAN_FEATURE_STATUS.locked ? "is-locked" : ""}>
            <span
              className={item.status === PLAN_FEATURE_STATUS.locked ? "premium-plan__lock" : "premium-plan__check"}
              aria-hidden="true"
            >
              {item.status === PLAN_FEATURE_STATUS.locked ? "🔒" : "✓"}
            </span>
            <span>{item.text}</span>
          </li>
        ))}
      </ul>

      {isFree || !isAuthenticated ? (
        <LandingLink
          href={href}
          className={`landing-link-button ${plan.featured ? "landing-link-button--primary" : "landing-link-button--ghost"} premium-plan__action`}
        >
          {ctaLabel}
        </LandingLink>
      ) : (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="landing-link-button landing-link-button--primary premium-plan__action"
        >
          {ctaLabel}
        </a>
      )}
    </article>
  )
}

export default function PremiumLandingPage({ isAuthenticated = false }) {
  const [language, setLanguage] = useState(getInitialLanguage)
  const sharedContent = getLandingContent(language)
  const content = PREMIUM_CONTENT[language]

  usePremiumSeo(content.seo, language)

  useEffect(() => {
    if (typeof window === "undefined") return

    try {
      window.localStorage.setItem(LANDING_LANGUAGE_STORAGE_KEY, language)
    } catch {
      // La page reste utilisable si le stockage local est indisponible.
    }
  }, [language])

  function toggleLanguage() {
    setLanguage(currentLanguage =>
      currentLanguage === LANDING_LANGUAGES.fr
        ? LANDING_LANGUAGES.kr
        : LANDING_LANGUAGES.fr,
    )
  }

  return (
    <main
      className="landing-page premium-public-page"
      id="contenu"
      lang={language === LANDING_LANGUAGES.kr ? "rcf" : "fr"}
      data-language={language}
    >
      <LandingHeader
        isAuthenticated={isAuthenticated}
        language={language}
        onToggleLanguage={toggleLanguage}
        content={sharedContent.header}
        navItems={content.navItems}
      />

      <section className="premium-page__hero" aria-labelledby="premium-title">
        <div className="landing-shell premium-page__hero-inner">
          <p className="landing-eyebrow">{content.hero.eyebrow}</p>
          <h1 id="premium-title">{content.hero.title}</h1>
          <p className="premium-page__hero-text">{content.hero.text}</p>

          <div className="premium-page__trust" aria-label={content.hero.eyebrow}>
            {content.hero.trust.map(item => (
              <span key={item}>✓ {item}</span>
            ))}
          </div>
        </div>
      </section>

      <section
        className="landing-section premium-page__offers"
        id="offres"
        aria-labelledby="premium-offers-title"
      >
        <div className="landing-shell">
          <div className="landing-section-heading">
            <p className="landing-eyebrow">{content.offers.eyebrow}</p>
            <h2 id="premium-offers-title">{content.offers.title}</h2>
            <p>{content.offers.intro}</p>
          </div>

          <div className="pricing-grid premium-pricing-grid">
            {sharedContent.pricing.plans.map(plan => (
              <PlanCard
                key={plan.id}
                plan={plan}
                content={content.offers}
                isAuthenticated={isAuthenticated}
              />
            ))}
          </div>

          <aside className="premium-page__coming-soon">
            <strong>{content.offers.comingSoonTitle}</strong>
            <p>{content.offers.comingSoonText}</p>
          </aside>
        </div>
      </section>

      <section
        className="landing-section landing-section--soft"
        id="comparatif"
        aria-labelledby="premium-comparison-title"
      >
        <div className="landing-shell">
          <div className="landing-section-heading">
            <p className="landing-eyebrow">{content.comparison.eyebrow}</p>
            <h2 id="premium-comparison-title">{content.comparison.title}</h2>
            <p>{content.comparison.intro}</p>
          </div>

          <div className="premium-choice-grid">
            {content.comparison.choices.map((choice, index) => (
              <article key={choice.label}>
                <span>{index + 1}</span>
                <p>{choice.label}</p>
                <h3>{choice.plan}</h3>
                <strong>{choice.text}</strong>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        className="landing-section premium-page__faq-section"
        id="faq"
        aria-labelledby="premium-faq-title"
      >
        <div className="landing-shell landing-shell--narrow">
          <div className="landing-section-heading">
            <p className="landing-eyebrow">{content.faq.eyebrow}</p>
            <h2 id="premium-faq-title">{content.faq.title}</h2>
          </div>

          <div className="premium-faq">
            {content.faq.items.map(([question, answer], index) => (
              <details key={question} className="premium-faq__item" open={index === 0}>
                <summary>{question}</summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-shell landing-footer__inner">
          <span>© {new Date().getFullYear()} BudgetKazPéi</span>

          <nav aria-label={content.footer.navigationAriaLabel}>
            <LandingLink href="/privacy">{content.footer.privacy}</LandingLink>
            <LandingLink href="/terms">{content.footer.terms}</LandingLink>
            <LandingLink href="/suppression-compte">
              {content.footer.deleteAccount}
            </LandingLink>
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </nav>
        </div>
      </footer>
    </main>
  )
}
