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
  // Only active new-customer payment links. Old Stripe subscriptions keep running.
  premiumMonthly: "https://buy.stripe.com/7sY28qdAJ1FQ6GCddsgMw03",
  premiumAnnual: "https://buy.stripe.com/5kQ7sKgMVfwGe94b5kgMw04",
}

const PREMIUM_CONTENT = {
  fr: {
    seo: {
      title: "Offres BudgetKazPéi — Gratuit, Premium et Premium",
      description:
        "Comparez les offres Gratuit, Premium et Premium de BudgetKazPéi et choisissez le niveau d'accompagnement adapté à votre quotidien.",
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
        "Gratuit pose les bases. Premium ajoute le Conseiller pour la gestion quotidienne. Premium vous accompagne dans des démarches concrètes.",
      trust: [
        "Annulation du renouvellement possible",
        "Paiement sécurisé par Stripe",
        "Disponible en français et en créole réunionnais",
      ],
    },
    offers: {
      eyebrow: "Les offres",
      title: "Gratuit et Premium : deux possibilités.",
      intro:
        "Commencez gratuitement ou choisissez Premium, en paiement mensuel ou annuel.",
      recommended: "Recommandé",
      complete: "Accompagnement complet",
      monthly: "Mensuel",
      perMonth: "/mois",
      freeCta: "Commencer gratuitement",
      dashboardCta: "Accéder à mon tableau de bord",
      premiumCta: "Choisir Premium",
      premiumGuestCta: "Créer mon compte pour Premium",
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
          text: "Le Conseiller aide à comprendre votre budget, vos dépenses, vos courses et les aides disponibles.",
        },
      ],
    },
    faq: {
      eyebrow: "FAQ",
      title: "Questions fréquentes",
      items: [
        [
          "Que comprend Premium ?",
          "Le Conseiller complet, le scanner et les analyses avancées sont inclus en formule mensuelle ou annuelle.",
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
          "Les photos servent temporairement au traitement du ticket. Lorsqu'elles sont enregistrées, elles deviennent inaccessibles au plus tard après 7 jours puis sont supprimées automatiquement, tandis que les données structurées utiles à votre budget restent conservées.",
        ],
        [
          "Puis-je arrêter mon abonnement ?",
          "Oui. Les formules Premium sont sans engagement et peuvent être arrêtées lorsque vous le souhaitez.",
        ],
      ],
    },
    footer: {
      privacy: "Confidentialité",
      legalNotices: "Mentions légales",
      terms: "Conditions",
      deleteAccount: "Suppression du compte",
      contact: "Contact",
      navigationAriaLabel: "Liens de pied de page",
    },
  },
  kr: {
    seo: {
      title: "Bann offres BudgetKazPéi — Gratis, Premium ek Premium",
      description:
        "Konpar bann offres Gratis, Premium ek Premium BudgetKazPéi é swazi lakonpagnman ki korespond ek out kotidien.",
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
        "Gratis i poz bann baz. Premium i azout Konseyé-la pou lo kotidien. Premium i akonpagn aou dann bann demars konkrè.",
      trust: [
        "Ou pé arèt renouvèlman",
        "Payman sekirizé par Stripe",
        "Disponib an fransé ek kréol rényoné",
      ],
    },
    offers: {
      eyebrow: "Bann offres",
      title: "Gratis ek Premium : dé posibilités.",
      intro:
        "Koumans gratis ou swazi Premium chak mwa ou chak ané.",
      recommended: "Nou konsey",
      complete: "Lakonpagnman konplé",
      monthly: "Chak mwa",
      perMonth: "/mwa",
      freeCta: "Koumans gratis",
      dashboardCta: "Alé su mon tablo débor",
      premiumCta: "Swazi Premium",
      premiumGuestCta: "Kré mon kont pou Premium",
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
          text: "Konseyé-la i aide aou konprann out bidjé, dépans, courses ek bann èd.",
        },
      ],
    },
    faq: {
      eyebrow: "FAQ",
      title: "Kestion souvan pozé",
      items: [
        [
          "Kosa lé dann Premium ?",
          "Konseyé complet, scanner ek bann analiz avansé lé dann Premium chak mwa ou chak ané.",
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
          "Bann foto i servi tanporèrman pou traite tiké-la. Kan zot lé anrezistré, ou pé pi war azot apré 7 zour o pli tar, épi zot lé suprimé otomatikman. Bann données itil pou out bidjé i reste sovgardé.",
        ],
        [
          "Mi pé arèt mon abonman ?",
          "Wi. Bann formules Premium lé san langazman é ou pé arèt kan ou vé.",
        ],
      ],
    },
    footer: {
      privacy: "Konfidansyalité",
      legalNotices: "Mansion légal",
      terms: "Kondisyon",
      deleteAccount: "Suprim mon kont",
      contact: "Kontakt",
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

function PlanCard({ plan, content, isAuthenticated, billingPeriod, onBillingPeriodChange, isFrench }) {
  const isFree = plan.id === PLAN_IDS.free
  const annual = !isFree && billingPeriod === "annual"
  const badge = isFree ? null : content.recommended
  const ctaLabel = isFree
    ? (isAuthenticated ? content.dashboardCta : content.freeCta)
    : !isAuthenticated
      ? content.premiumGuestCta
      : annual
        ? (isFrench ? "Choisir Premium annuel" : "Swazi Premium ané")
        : content.premiumCta
  const href = isFree
    ? (isAuthenticated ? "/app" : "/register")
    : !isAuthenticated ? "/register"
      : annual ? STRIPE_LINKS.premiumAnnual : STRIPE_LINKS.premiumMonthly
  const displayPrice = isFree ? "0 €" : annual ? "49,90 €" : "4,99 €"

  return (
    <article
      className={`pricing-card pricing-card--${plan.tone} premium-pricing-card ${plan.featured ? "pricing-card--featured premium-pricing-card--featured" : ""}`}
      aria-label={`${plan.name} — ${plan.price}`}
    >
      {badge && <span className="premium-pricing-card__badge">{badge}</span>}

      <div className="premium-plan__heading">
        <p className="pricing-card__label">{plan.name}</p>
        {!isFree && (
          <div role="group" aria-label={isFrench ? "Période de facturation Premium" : "Période peyman Premium"}
            style={{ display:"flex",gap:8,marginTop:12,marginBottom:10,flexWrap:"wrap" }}>
            {[
              { id:"monthly", label:isFrench ? "Mensuel" : "Chak mwa" },
              { id:"annual", label:isFrench ? "Annuel" : "Chak ané" },
            ].map(term => (
              <button key={term.id} type="button" aria-pressed={billingPeriod===term.id}
                onClick={() => onBillingPeriodChange(term.id)}
                style={{padding:"9px 15px",borderRadius:12,cursor:"pointer",font:"inherit",
                  color:billingPeriod===term.id?"#276C67":"#475569",
                  background:billingPeriod===term.id?"#DDF4EF":"#F8FAFC",
                  border:billingPeriod===term.id?"1.5px solid #439D90":"1px solid #D8E0E6"}}>
                {term.label}
              </button>
            ))}
          </div>
        )}
        <div className="premium-plan__price-row">
          <strong className="premium-plan__price">{displayPrice}</strong>
          {!isFree && <span>{annual ? (isFrench ? "/an" : "/ané") : content.perMonth}</span>}
        </div>
        {!isFree && <p className="premium-plan__billing">{annual
          ? (isFrench ? "Économisez 9,98 € par an, mêmes fonctionnalités." : "Ekonomiz 9,98 € par ané, minm fonksyon.")
          : (isFrench ? "Résiliable à tout moment ; tarif mensuel." : "Ou pé aret kan ou vé ; pri chak mwa.")}</p>}
        <p className="premium-plan__intro">{plan.intro}</p>
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
  const [billingPeriod, setBillingPeriod] = useState("monthly")
  const sharedContent = getLandingContent(language)
  const rawContent = PREMIUM_CONTENT[language]
  const fr = language !== LANDING_LANGUAGES.kr
  const content = {
    ...rawContent,
    seo: {
      ...rawContent.seo,
      title: fr ? "BudgetKazPéi — Gratuit et Premium" : "BudgetKazPéi — Gratis ek Premium",
      description: fr
        ? "Une offre gratuite et une seule offre Premium à 4,99 € par mois avec accompagnement complet."
        : "In lof gratis ek in sel lof Premium 4,99 € par mwa, avèk lakonpagnman complet.",
    },
    hero: {
      ...rawContent.hero,
      text: fr
        ? "Commencez gratuitement. Avec Premium à 4,99 €/mois, accédez au Conseiller et à l'accompagnement complet de vos démarches."
        : "Koumans gratis. Avec Premium 4,99 € par mwa, retrouve Konseyé ek lakonpagnman pou bann démarches.",
    },
    offers: {
      ...rawContent.offers,
      title: fr ? "Gratuit ou Premium, tout simplement." : "Gratis ou Premium, tout senp.",
      intro: fr ? "Une seule offre payante, sans niveaux supplémentaires." : "In sel lof payant, san lezot nivo.",
    },
    comparison: {
      ...rawContent.comparison,
      intro: fr
        ? "Choisissez l'essentiel gratuit ou l'accompagnement complet avec Premium."
        : "Choisi Gratis pou l'esansyèl ou Premium pou lakonpagnman complet.",
      choices: rawContent.comparison.choices,
    },
    faq: {
      ...rawContent.faq,
      items: fr ? [
        ["Quelle différence entre Premium mensuel et annuel ?", "Aucune différence de fonctionnalités : le Conseiller complet, les démarches et le scanner Premium sont inclus dans les deux formules. Seule la fréquence de facturation change."],
        ["Comment fonctionnent les scans gratuits ?", "Trois scans sont offerts au total durant les 30 premiers jours suivant l'inscription. Après cette période, le scanner reste accessible avec Premium."],
        ["Que se passe-t-il en cas d'utilisation inhabituelle ?", "Une protection interne peut temporairement interrompre les nouveaux scans ou analyses IA et vous inviter à contacter l'équipe. Vos données restent accessibles."],
        ["Puis-je résilier mon abonnement ?", "Oui, vous pouvez arrêter le renouvellement de Premium. L'abonnement annuel reste accessible jusqu'à la fin de sa période payée."],
      ] : [
        ["Kosa lé diferans Premium chak mwa ek chak ané ?", "Minm fonksyon dann dé formule : Konseyé complet, démarches ek scanner Premium. Sé fason peyman i sanze."],
        ["Koman bann scans gratis i mars ?", "Troi scans ofèr dann bann 30 prémyé zour apré l'inskripsyon. Apré, scanner lé dann Premium."],
        ["Kosa i ariv si i néna in utilisation inhabituel ?", "In protéksyon an aryer-plan pé aret bann nouvo scans ou analyses IA ek demand aou kontakte l'équipe. Out données i reste disponib."],
        ["Mi pé aret mon abonnement ?", "Wi, ou pé aret renouvèlman Premium. L'abonnement ané i reste disponib ziska fin période peyé."],
      ],
    },
  }

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
                billingPeriod={billingPeriod}
                onBillingPeriodChange={setBillingPeriod}
                isFrench={fr}
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
            <LandingLink href="/mentions-legales">{content.footer.legalNotices}</LandingLink>
            <LandingLink href="/terms">{content.footer.terms}</LandingLink>
            <LandingLink href="/suppression-compte">
              {content.footer.deleteAccount}
            </LandingLink>
            <a href={`mailto:${CONTACT_EMAIL}`}>{content.footer.contact}</a>
          </nav>
        </div>
      </footer>
    </main>
  )
}
