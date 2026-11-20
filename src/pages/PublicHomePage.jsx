import { useEffect, useState } from "react"
import {
  ArrowRight,
  ArrowUpRight,
  HandHeart,
  MessageCircle,
  ShoppingBasket,
  Wallet,
} from "lucide-react"
import LandingHeader from "../components/landing/LandingHeader"
import LandingLink from "../components/landing/LandingLink"
import { LANDING_LANGUAGES, getLandingContent } from "../components/landing/landingContent"
import "../styles/landing-clean.css"

const CONTACT_EMAIL = "contact.budgetkazpei@gmail.com"
const LANDING_LANGUAGE_STORAGE_KEY = "budgetkazpei-public-language"

function upsertMeta(selector, attributes) {
  if (typeof document === "undefined") return
  let element = document.head.querySelector(selector)
  if (!element) {
    element = document.createElement("meta")
    document.head.appendChild(element)
  }
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value))
}

function getInitialLanguage() {
  if (typeof window === "undefined") return LANDING_LANGUAGES.fr
  try {
    return window.localStorage.getItem(LANDING_LANGUAGE_STORAGE_KEY) === LANDING_LANGUAGES.kr
      ? LANDING_LANGUAGES.kr
      : LANDING_LANGUAGES.fr
  } catch {
    return LANDING_LANGUAGES.fr
  }
}

function useLandingSeo(content, language) {
  useEffect(() => {
    if (typeof document === "undefined") return
    document.title = content.title
    document.documentElement.lang = language === LANDING_LANGUAGES.kr ? "rcf" : "fr"
    upsertMeta('meta[name="description"]', { name: "description", content: content.description })
    upsertMeta('meta[property="og:title"]', { property: "og:title", content: content.ogTitle })
    upsertMeta('meta[property="og:description"]', { property: "og:description", content: content.ogDescription })
    upsertMeta('meta[property="og:type"]', { property: "og:type", content: "website" })
    upsertMeta('meta[property="og:image"]', { property: "og:image", content: "/icons-creole/logo-budgetkazpei.png" })
  }, [content, language])
}

const COPY = {
  fr: {
    heroEyebrow: "Une application pensée pour La Réunion",
    heroTitleLead: "Plus qu’un budget.",
    heroTitleFocus: "Des décisions éclairées.",
    heroLead: "Budget, courses, aides et conseils personnalisés : mieux comprendre son argent, à La Réunion.",
    heroPrimary: "Commencer gratuitement",
    heroSecondary: "Comment ça marche ?",
    quick: [{ label: "Budget", href: "#fonctionnalites" }, { label: "Courses", href: "#fonctionnalites" }, { label: "Aides", href: "#fonctionnalites" }, { label: "Conseiller", href: "#conseiller" }, { label: "Bons plans", href: "#bons-plans" }],
    featureEyebrow: "L’essentiel, sans complication",
    featureTitle: "Tout pour mieux décider.",
    featureLead: "Quatre outils, un seul espace.",
    features: [
      { title: "Mon budget", lead: "Voyez ce qui entre, sort et reste.", Icon: Wallet, tone: "mint" },
      { title: "Mes courses", lead: "Tickets, habitudes et listes de courses.", Icon: ShoppingBasket, tone: "blue" },
      { title: "Mes aides", lead: "Repérez vos droits et préparez vos démarches.", Icon: HandHeart, tone: "lavender" },
      { title: "Mon Conseiller", lead: "Des pistes adaptées aux données disponibles.", Icon: MessageCircle, tone: "sage" },
    ],
    advisorEyebrow: "Un Conseiller qui va plus loin",
    advisorTitle: "Il ne répond pas seulement. Il aide à comprendre.",
    advisorLead: "À partir des informations disponibles, il cherche les causes d’un écart et les actions utiles.",
    advisorExampleLabel: "Votre question",
    advisorAnswerLabel: "Son raisonnement",
    advisorNote: "Exemple illustratif, pas une analyse réelle. Résultats selon les données disponibles.",
    advisorQuestion: "Mes courses ont augmenté de 120 €, pourtant j’achète presque pareil. Pourquoi ?",
    advisorSteps: [{ label: "Je compare", text: "Prix, quantités et fréquence des achats." }, { label: "Je repère", text: "Les produits qui expliquent le plus l’écart." }, { label: "Je propose", text: "Des pistes concrètes si les données le permettent." }],
    dealsEyebrow: "Près de vous",
    dealsTitle: "La Réunion, aussi dans vos bons plans.",
    dealsLead: "Restaurants, artisans, activités et services locaux.",
    dealsLink: "Découvrir les bons plans",
    dealsLocation: "Recherche par commune ou sur toute l'île",
    proEyebrow: "Pour les professionnels",
    proTitle: "Faites découvrir votre activité.",
    proLead: "Un espace de présentation simple arrive bientôt.",
    proOffer: "12 mois de visibilité offerts au lancement",
    proDisclosure: "Sans engagement, sans paiement et sans obligation de partenariat. Offre de lancement soumise à validation, dans la limite des places disponibles.",
    proLater: "Espace « Je propose » en préparation",
    proFields: ["Une photo", "Une présentation", "Un lien"],
    endEyebrow: "BudgetKazPeï",
    endTitle: "Essayez BudgetKazPeï.",
    endText: "Commencez gratuitement. Passez à Premium seulement si vous en avez besoin.",
    endLink: "Découvrir les offres",
    navPro: "Je propose",
  },
  kr: {
    heroEyebrow: "In aplikasyon pansé pou La Rényon",
    heroTitleLead: "Pa zis in bidjé.",
    heroTitleFocus: "Bann désizion pli klèr.",
    heroLead: "Bidjé, courses, bann èd ek konsey adapté : konpran out larzan dann La Rényon.",
    heroPrimary: "Koumans gratis",
    heroSecondary: "Koman sa i mars ?",
    quick: [{ label: "Bidjé", href: "#fonctionnalites" }, { label: "Courses", href: "#fonctionnalites" }, { label: "Bann èd", href: "#fonctionnalites" }, { label: "Konseyé", href: "#conseiller" }, { label: "Bon Plan", href: "#bons-plans" }],
    featureEyebrow: "Sak lé esansyèl, san komplikasyon",
    featureTitle: "Tout pou mié désidé.",
    featureLead: "Kat zouti dann in sèl lespas.",
    features: [
      { title: "Mon bidjé", lead: "War sak i rantre, sak i sort ek sak i reste.", Icon: Wallet, tone: "mint" },
      { title: "Mon bann courses", lead: "Tiké, labitid achat ek list courses.", Icon: ShoppingBasket, tone: "blue" },
      { title: "Mon bann èd", lead: "Repèr bann drwa ek prépar out bann démars.", Icon: HandHeart, tone: "lavender" },
      { title: "Mon Konseyé", lead: "Bann piste selon bann donné disponib.", Icon: MessageCircle, tone: "sage" },
    ],
    advisorEyebrow: "In Konseyé ki va pli lwin",
    advisorTitle: "Li répond pa zis. Li aide aou konpran.",
    advisorLead: "Avèk bann donné disponib, li rode poukwa néna in ékar ek kosa fé.",
    advisorExampleLabel: "Out kestyon",
    advisorAnswerLabel: "Son rézonman",
    advisorNote: "In legzanp, pa in vré analiz. Résilta selon bann donné disponib.",
    advisorQuestion: "Mon bann courses la ogmanté de 120 €, mé mi achète presk parey. Poukwa ?",
    advisorSteps: [{ label: "Mi konpar", text: "Pri, kantité ek frékans bann achats." }, { label: "Mi repèr", text: "Bann produi ki explik plis l’écar." }, { label: "Mi propoz", text: "Bann piste si bann donné lé sifizan." }],
    dealsEyebrow: "Près koté ou",
    dealsTitle: "Bann Bon Plan dann La Rényon.",
    dealsLead: "Restoran, artizan, aktivité ek servis lokal.",
    dealsLink: "Dékouv bann Bon Plan",
    dealsLocation: "Rode par kominn ou bien dann toute lil",
    proEyebrow: "Pou bann profésionèl",
    proTitle: "Fé dékouv out laktivité.",
    proLead: "In lespas sinp pou présant out laktivité i ariv biento.",
    proOffer: "12 mwa visibilité ofèr pou lansman",
    proDisclosure: "San angazman, san péman ek san obligasyon partnarya. Lof lansman lé soumèt a validasyon, dann limit bann plas disponib.",
    proLater: "Léspas « Mi propoz » lé an préparasyon",
    proFields: ["In foto", "In présantasyon", "In lien"],
    endEyebrow: "BudgetKazPeï",
    endTitle: "Essay BudgetKazPeï.",
    endText: "Koumans gratis. Pas dan Premium selman si ou néna besoin.",
    endLink: "Dékouv bann lof",
    navPro: "Mi propoz",
  },
}

function TextLink({ href, children }) {
  return <LandingLink href={href} className="bk-text-link">{children}<ArrowUpRight size={17} aria-hidden="true" /></LandingLink>
}

export default function PublicHomePage({ isAuthenticated = false }) {
  const [language, setLanguage] = useState(getInitialLanguage)
  const isKreol = language === LANDING_LANGUAGES.kr
  const content = getLandingContent(language)
  const copy = COPY[language]
  const appHref = isAuthenticated ? "/app" : "/register"

  useLandingSeo(content.seo, language)

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      window.localStorage.setItem(LANDING_LANGUAGE_STORAGE_KEY, language)
    } catch {
      // La landing reste utilisable sans stockage local.
    }
  }, [language])

  return (
    <main className="landing-page bk-landing" id="contenu" data-language={language} lang={isKreol ? "rcf" : "fr"}>
      <LandingHeader
        isAuthenticated={isAuthenticated}
        language={language}
        onToggleLanguage={() => setLanguage(current => current === LANDING_LANGUAGES.fr ? LANDING_LANGUAGES.kr : LANDING_LANGUAGES.fr)}
        content={content.header}
        navItems={[...content.navItems, { label: copy.navPro, href: "#je-propose" }]}
      />

      <section className="bk-hero" aria-labelledby="landing-title">
        <div className="landing-shell bk-hero__inner">
          <p className="bk-eyebrow">{copy.heroEyebrow}</p>
          <h1 id="landing-title">
            <span className="bk-hero__title-lead">{copy.heroTitleLead}</span>
            <span className="bk-hero__title-focus">{copy.heroTitleFocus}</span>
          </h1>
          <p className="bk-hero__lead">{copy.heroLead}</p>
          <div className="bk-hero__actions">
            <LandingLink href={appHref} className="landing-link-button landing-link-button--primary">
              {isAuthenticated ? content.hero.primaryAuthenticated : copy.heroPrimary}
              <ArrowRight size={17} aria-hidden="true" />
            </LandingLink>
            <a className="landing-link-button landing-link-button--ghost" href="#fonctionnalites">{copy.heroSecondary}</a>
          </div>
        </div>
      </section>

      <nav className="bk-quicknav" aria-label={content.summaryAriaLabel}>
        <div className="landing-shell bk-quicknav__inner">
          {copy.quick.map(({ label, href }, index) => (
            <a key={index} href={href} className={"bk-quicknav__item bk-quicknav__item--" + index}>{label}</a>
          ))}
        </div>
      </nav>

      <section className="bk-section bk-features" id="fonctionnalites" aria-labelledby="bk-features-title">
        <div className="landing-shell">
          <div className="bk-section-heading">
            <p className="bk-eyebrow">{copy.featureEyebrow}</p>
            <h2 id="bk-features-title">{copy.featureTitle}</h2>
            <p>{copy.featureLead}</p>
          </div>
          <div className="bk-feature-grid">
            {copy.features.map(({ title, lead, Icon, tone }) => (
              <article className={"bk-feature bk-feature--" + tone} key={title}>
                <span className="bk-feature__icon"><Icon size={22} strokeWidth={1.8} aria-hidden="true" /></span>
                <h3>{title}</h3>
                <p>{lead}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bk-section bk-advisor" id="conseiller" aria-labelledby="bk-advisor-title">
        <div className="landing-shell bk-two-column">
          <div className="bk-section-heading">
            <p className="bk-eyebrow">{copy.advisorEyebrow}</p>
            <h2 id="bk-advisor-title">{copy.advisorTitle}</h2>
            <p>{copy.advisorLead}</p>
          </div>
          <div className="bk-advisor__example">
            <p className="bk-example-label">{copy.advisorExampleLabel}</p>
            <p className="bk-advisor__question">{copy.advisorQuestion}</p>
            <div className="bk-advisor__answer">
              <p className="bk-example-label">{copy.advisorAnswerLabel}</p>
              <ol className="bk-advisor__steps">
                {copy.advisorSteps.map(step => (
                  <li key={step.label}><strong>{step.label}</strong><span>{step.text}</span></li>
                ))}
              </ol>
            </div>
            <small>{copy.advisorNote}</small>
          </div>
        </div>
      </section>

      <section className="bk-section bk-local" id="bons-plans" aria-labelledby="bk-deals-title">
        <div className="landing-shell bk-local__grid">
          <div className="bk-local__deals">
            <p className="bk-eyebrow">{copy.dealsEyebrow}</p>
            <h2 id="bk-deals-title">{copy.dealsTitle}</h2>
            <p>{copy.dealsLead}</p>
            <TextLink href={appHref}>{copy.dealsLink}</TextLink>
          </div>
          <div className="bk-local__pro" id="je-propose">
            <p className="bk-eyebrow">{copy.proEyebrow}</p>
            <h3>{copy.proTitle}</h3>
            <p>{copy.proLead}</p>
            <strong>{copy.proOffer}</strong>
            <small>{copy.proDisclosure} {copy.proLater}.</small>
          </div>
        </div>
      </section>

      <section className="bk-section bk-closing" aria-labelledby="bk-closing-title">
        <div className="landing-shell bk-closing__inner">
          <div>
            <p className="bk-eyebrow">{copy.endEyebrow}</p>
            <h2 id="bk-closing-title">{copy.endTitle}</h2>
            <p>{copy.endText}</p>
          </div>
          <div className="bk-closing__actions">
            <LandingLink href={appHref} className="landing-link-button landing-link-button--primary">
              {isAuthenticated ? content.hero.primaryAuthenticated : copy.heroPrimary}
              <ArrowRight size={17} aria-hidden="true" />
            </LandingLink>
            <TextLink href="/decouvrir">{copy.endLink}</TextLink>
          </div>
        </div>
      </section>

      <footer className="bk-footer">
        <div className="landing-shell bk-footer__inner">
          <span>© {new Date().getFullYear()} BudgetKazPeï</span>
          <nav aria-label={content.footer.navigationAriaLabel}>
            <LandingLink href="/privacy">{content.footer.privacy}</LandingLink>
            <LandingLink href="/mentions-legales">{content.footer.legalNotices}</LandingLink>
            <LandingLink href="/terms">{content.footer.terms}</LandingLink>
            <LandingLink href="/suppression-compte">{content.footer.deleteAccount}</LandingLink>
            <a href={"mailto:" + CONTACT_EMAIL}>{content.footer.contact}</a>
          </nav>
        </div>
      </footer>
    </main>
  )
}
