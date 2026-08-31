import { useEffect, useState } from "react"
import { BkIcons } from "../components/icons-budgetkazpei"
import BenefitCard from "../components/landing/BenefitCard"
import FinalCTA from "../components/landing/FinalCTA"
import HeroProductDemo from "../components/landing/HeroProductDemo"
import LandingFAQ from "../components/landing/LandingFAQ"
import LandingHeader from "../components/landing/LandingHeader"
import LandingLink from "../components/landing/LandingLink"
import PricingSection from "../components/landing/PricingSection"
import ScanJourney from "../components/landing/ScanJourney"
import {
  LANDING_LANGUAGES,
  getLandingContent,
} from "../components/landing/landingContent"
import "../styles/landing.css"

const CONTACT_EMAIL = "contact.budgetkazpei@gmail.com"
const LANDING_LANGUAGE_STORAGE_KEY = "budgetkazpei-public-language"

function upsertMeta(selector, attributes) {
  if (typeof document === "undefined") return

  let element = document.head.querySelector(selector)
  if (!element) {
    element = document.createElement("meta")
    document.head.appendChild(element)
  }

  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, value)
  })
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

function useLandingSeo(content, language) {
  useEffect(() => {
    if (typeof document === "undefined") return

    document.title = content.title
    document.documentElement.lang = language === LANDING_LANGUAGES.kr ? "rcf" : "fr"

    upsertMeta('meta[name="description"]', {
      name: "description",
      content: content.description,
    })
    upsertMeta('meta[property="og:title"]', {
      property: "og:title",
      content: content.ogTitle,
    })
    upsertMeta('meta[property="og:description"]', {
      property: "og:description",
      content: content.ogDescription,
    })
    upsertMeta('meta[property="og:type"]', {
      property: "og:type",
      content: "website",
    })
    upsertMeta('meta[property="og:image"]', {
      property: "og:image",
      content: "/icons-creole/logo-budgetkazpei.png",
    })
  }, [content, language])
}

function SectionHeading({ id, eyebrow, title, children }) {
  return (
    <div className="landing-section-heading">
      {eyebrow && <p className="landing-eyebrow">{eyebrow}</p>}
      <h2 id={id}>{title}</h2>
      {children && <p>{children}</p>}
    </div>
  )
}

function LocalDealsSection({ content }) {
  return (
    <section
      className="landing-section landing-local"
      id="bons-plans"
      aria-labelledby="local-deals-title"
    >
      <div className="landing-shell local-deals">
        <div>
          <p className="landing-eyebrow">{content.eyebrow}</p>
          <h2 id="local-deals-title">{content.title}</h2>
          <p>{content.intro}</p>

          <div className="landing-pill-row" aria-label={content.categoriesAriaLabel}>
            {content.categories.map(category => (
              <span key={category}>{category}</span>
            ))}
          </div>
        </div>

        <div className="local-deals__cards" aria-label={content.principlesAriaLabel}>
          {content.principles.map(item => (
            <article key={item}>
              <BkIcons.check size={18} aria-hidden="true" />
              <span>{item}</span>
            </article>
          ))}

          <article className="local-deals__pro">
            <h3>{content.professionalTitle}</h3>
            <p>{content.professionalText}</p>
            <a
              className="landing-link-button landing-link-button--primary"
              href={`mailto:${CONTACT_EMAIL}`}
            >
              {content.contact}
            </a>
          </article>
        </div>
      </div>
    </section>
  )
}

export default function PublicHomePage({ isAuthenticated = false }) {
  const [language, setLanguage] = useState(getInitialLanguage)
  const content = getLandingContent(language)

  useLandingSeo(content.seo, language)

  useEffect(() => {
    if (typeof window === "undefined") return

    try {
      window.localStorage.setItem(LANDING_LANGUAGE_STORAGE_KEY, language)
    } catch {
      // La landing reste utilisable si le stockage local est indisponible.
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
      className="landing-page"
      id="contenu"
      lang={language === LANDING_LANGUAGES.kr ? "rcf" : "fr"}
      data-language={language}
    >
      <LandingHeader
        isAuthenticated={isAuthenticated}
        language={language}
        onToggleLanguage={toggleLanguage}
        content={content.header}
        navItems={content.navItems}
      />

      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-shell landing-hero__grid">
          <div className="landing-hero__copy">
            <p className="landing-eyebrow">{content.hero.eyebrow}</p>
            <h1 id="landing-title">{content.hero.title}</h1>
            <p className="landing-hero__lead">{content.hero.lead}</p>

            <div className="landing-hero__actions">
              <LandingLink
                href={isAuthenticated ? "/app" : "/register"}
                className="landing-link-button landing-link-button--primary"
              >
                {isAuthenticated
                  ? content.hero.primaryAuthenticated
                  : content.hero.primaryGuest}
              </LandingLink>

              <a
                className="landing-link-button landing-link-button--ghost"
                href="#fonctionnalites"
              >
                {content.hero.secondary}
              </a>
            </div>
          </div>

          <HeroProductDemo content={content.heroDemo} />
        </div>
      </section>

      <section
        className="landing-section"
        id="fonctionnalites"
        aria-labelledby="pillars-title"
      >
        <div className="landing-shell">
          <SectionHeading
            id="pillars-title"
            eyebrow={content.features.eyebrow}
            title={content.features.title}
          >
            {content.features.intro}
          </SectionHeading>

          <div className="benefit-grid">
            {content.features.pillars.map(benefit => (
              <BenefitCard key={benefit.title} benefit={benefit} />
            ))}
          </div>
        </div>
      </section>

      <ScanJourney content={content.productDemo} />
      <LocalDealsSection content={content.localDeals} />
      <PricingSection
        isAuthenticated={isAuthenticated}
        content={content.pricing}
      />

      <section
        className="landing-section landing-section--soft landing-closing"
        aria-labelledby="faq-title"
      >
        <LandingFAQ content={content.faq} />
        <FinalCTA
          isAuthenticated={isAuthenticated}
          content={content.finalCta}
        />
      </section>

      <footer className="landing-footer">
        <div className="landing-shell landing-footer__inner">
          <span>© {new Date().getFullYear()} BudgetKazPei</span>

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
