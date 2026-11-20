import { useEffect, useState } from "react"
import {
  ArrowRight,
  ArrowUpRight,
  HandHeart,
  MessageCircle,
  Search,
  ShoppingBasket,
  Store,
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
    heroLead: "BudgetKazPeï va plus loin que le suivi des dépenses : comprenez vos courses, repérez les aides utiles et découvrez les bons plans de La Réunion."
    heroPrimary: "Commencer gratuitement",
    heroSecondary: "Découvrir les fonctionnalités",
    quick: ["Mon budget", "Mes courses", "Mes aides", "Mon Conseiller", "Bons plans"],
    featureEyebrow: "L'essentiel, sans complication",
    featureTitle: "Tout est plus simple quand on y voit clair.",
    featureLead: "Des outils concrets, une navigation directe et uniquement les informations qui vous sont utiles.",
    features: [
      { title: "Mon budget", lead: "Visualisez vos revenus, vos dépenses et ce qu'il vous reste.", Icon: Wallet, tone: "mint" },
      { title: "Mes courses", lead: "Scannez vos tickets, suivez vos achats et préparez vos listes.", Icon: ShoppingBasket, tone: "blue" },
      { title: "Mes aides", lead: "Repérez les aides possibles et organisez vos démarches.", Icon: HandHeart, tone: "lavender" },
      { title: "Mon Conseiller", lead: "Posez vos questions et avancez avec des conseils adaptés à votre offre.", Icon: MessageCircle, tone: "sage" },
    ],
    advisorEyebrow: "Un accompagnement utile",
    advisorTitle: "Des réponses qui vous aident à avancer.",
    advisorLead: "Pour mieux comprendre vos dépenses et préparer vos démarches, votre Conseiller vous accompagne selon les fonctionnalités de votre offre.",
    advisorExampleLabel: "Exemple de question",
    advisorAnswerLabel: "Exemple de réponse",
    advisorNote: "Les droits et les montants des aides sont à vérifier auprès des organismes concernés.",
    dealsEyebrow: "Découvrir l'île autrement",
    dealsTitle: "De bonnes adresses, tout près de vous.",
    dealsLead: "Restaurants, commerces, artisans, sorties et services : retrouvez les bons plans locaux selon les informations disponibles.",
    dealsLink: "Découvrir les bons plans",
    dealsLocation: "Recherche par commune ou sur toute l'île",
    proEyebrow: "Artisans, créateurs et professionnels",
    proTitle: "Votre activité mérite d'être découverte.",
    proLead: "Nous préparons un espace pour présenter votre savoir-faire avec une photo, une description, votre commune et un lien vers votre site ou vos réseaux sociaux.",
    proOffer: "12 mois de visibilité offerts au lancement",
    proDisclosure: "Sans engagement, sans paiement et sans obligation de partenariat. Offre de lancement soumise à validation, dans la limite des places disponibles.",
    proLater: "Espace « Je propose » en préparation",
    proFields: ["Une photo", "Une présentation", "Un lien"],
    endEyebrow: "BudgetKazPeï",
    endTitle: "Un quotidien plus léger commence ici.",
    endText: "Commencez gratuitement et découvrez les fonctionnalités qui correspondent à vos besoins.",
    endLink: "Découvrir les offres",
    navPro: "Je propose",
  },
  kr: {
    heroEyebrow: "In aplikasyon pansé pou La Rényon",
    heroTitleLead: "Pa zis in bidjé.",
    heroTitleFocus: "Bann désizion pli klèr.",
    heroLead: "BudgetKazPeï i fé plis ke swiv out dépans : konprann out courses, repèr bann èd itil ek dékouv bann bon plan dann La Rényon."
    heroPrimary: "Koumans gratis",
    heroSecondary: "Dékouv bann fonksionalité",
    quick: ["Mon bidjé", "Mon bann courses", "Mon bann èd", "Mon Konseyé", "Bon Plan"],
    featureEyebrow: "Sak lé esansyèl, san komplikasyon",
    featureTitle: "Kan tout lé klèr, la vi lé pli sinp.",
    featureLead: "Bann zouti itil, in navigasyon dirèk ek zis bann zinformasyon ou la bézwin.",
    features: [
      { title: "Mon bidjé", lead: "War larzan i rantre, bann dépans ek sak i reste.", Icon: Wallet, tone: "mint" },
      { title: "Mon bann courses", lead: "Scan out tiké, swiv out achats ek prépar out list.", Icon: ShoppingBasket, tone: "blue" },
      { title: "Mon bann èd", lead: "Repèr bann èd posib ek organiz out bann démars.", Icon: HandHeart, tone: "lavender" },
      { title: "Mon Konseyé", lead: "Poz out kestyon ek trouv bann konsey selon out lof.", Icon: MessageCircle, tone: "sage" },
    ],
    advisorEyebrow: "In koudmin itil",
    advisorTitle: "Bann répons pou aide aou avansé.",
    advisorLead: "Pou konpran out dépans ek prépar out bann démars, out Konseyé i aide aou selon bann fonksionalité out lof.",
    advisorExampleLabel: "In legzanp kestyon",
    advisorAnswerLabel: "In legzanp répons",
    advisorNote: "Fodra vérifié bann drwa ek bann montan èd kot bann organismes konsèrné.",
    dealsEyebrow: "Dékouv nout lil",
    dealsTitle: "Bann bon ladres près koté ou.",
    dealsLead: "Restoran, komers, artizan, sorti ek servis : trouv bann Bon Plan lokal selon bann zinformasyon disponib.",
    dealsLink: "Dékouv bann Bon Plan",
    dealsLocation: "Rode par kominn ou bien dann toute lil",
    proEyebrow: "Artizan, kréatèr ek profésionèl",
    proTitle: "Fé konèt out laktivité.",
    proLead: "Nou lé an train prépar in lespas pou présant out savoir-fèr, avèk in foto, in déskripsion, out kominn ek in lien vers out site ou rézo sosyo.",
    proOffer: "12 mwa visibilité ofèr pou lansman",
    proDisclosure: "San angazman, san péman ek san obligasyon partnarya. Lof lansman lé soumèt a validasyon, dann limit bann plas disponib.",
    proLater: "Léspas « Mi propoz » lé an préparasyon",
    proFields: ["In foto", "In présantasyon", "In lien"],
    endEyebrow: "BudgetKazPeï",
    endTitle: "Out kotidien pé vinn pli sinp.",
    endText: "Koumans gratis ek dékouv bann fonksionalité ki korésponn a out bézwin.",
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

      <div className="bk-quicknav" aria-label={content.summaryAriaLabel}>
        <div className="landing-shell bk-quicknav__inner">
          {copy.quick.map((item, index) => <span key={item} className={"bk-quicknav__item bk-quicknav__item--" + index}>{item}</span>)}
        </div>
      </div>

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
            <p className="bk-advisor__question">{content.advisor.conversation.user}</p>
            <div className="bk-advisor__answer">
              <p className="bk-example-label">{copy.advisorAnswerLabel}</p>
              <p>{content.advisor.conversation.assistant}</p>
            </div>
            <small>{copy.advisorNote}</small>
          </div>
        </div>
      </section>

      <section className="bk-section bk-deals" id="bons-plans" aria-labelledby="bk-deals-title">
        <div className="landing-shell bk-two-column">
          <div className="bk-section-heading">
            <p className="bk-eyebrow">{copy.dealsEyebrow}</p>
            <h2 id="bk-deals-title">{copy.dealsTitle}</h2>
            <p>{copy.dealsLead}</p>
            <TextLink href={appHref}>{copy.dealsLink}</TextLink>
          </div>
          <div className="bk-deals__details">
            <div className="bk-deals__heading"><Search size={20} aria-hidden="true" />{copy.dealsLocation}</div>
            <div className="bk-deals__categories">
              {content.localDeals.localOffers.categories.map(item => <span key={item.label}>{item.label}</span>)}
            </div>
          </div>
        </div>
      </section>

      <section className="bk-section bk-professionals" id="je-propose" aria-labelledby="bk-professionals-title">
        <div className="landing-shell bk-two-column">
          <div className="bk-section-heading">
            <p className="bk-eyebrow">{copy.proEyebrow}</p>
            <h2 id="bk-professionals-title">{copy.proTitle}</h2>
            <p>{copy.proLead}</p>
          </div>
          <div className="bk-professionals__offer">
            <p className="bk-professionals__offer-title"><Store size={24} aria-hidden="true" />{copy.proOffer}</p>
            <div className="bk-professionals__fields">
              {copy.proFields.map(field => <span key={field}>{field}</span>)}
            </div>
            <p>{copy.proDisclosure}</p>
            <small>{copy.proLater}</small>
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
