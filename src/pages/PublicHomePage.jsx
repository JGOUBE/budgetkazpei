import { useEffect, useState } from "react"
import FinalCTA from "../components/landing/FinalCTA"
import HeroProductDemo from "../components/landing/HeroProductDemo"
import LandingHeader from "../components/landing/LandingHeader"
import LandingLink from "../components/landing/LandingLink"
import AdvisorAndLocalDeals from "../components/landing/AdvisorAndLocalDeals"
import LandingPillar from "../components/landing/LandingPillar"
import {
  LANDING_LANGUAGES,
  getLandingContent,
} from "../components/landing/landingContent"
import "../styles/landing-public.css"

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

function SectionHeading({ id, eyebrow, title, children }) {
  return (
    <div className="landing-section-heading">
      {eyebrow && <p className="landing-eyebrow">{eyebrow}</p>}
      <h2 id={id}>{title}</h2>
      {children && <p>{children}</p>}
    </div>
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
    setLanguage(currentLanguage => currentLanguage === LANDING_LANGUAGES.fr ? LANDING_LANGUAGES.kr : LANDING_LANGUAGES.fr)
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
            <p className="landing-hero__local">
              <span className="landing-local-mark" aria-hidden="true"><img src="/icons-creole/drapeau-reunionnais.png" alt="" /></span>
              {content.hero.localLine}
            </p>

            <div className="landing-hero__actions">
              <LandingLink
                href={isAuthenticated ? "/app" : "/register"}
                className="landing-link-button landing-link-button--primary"
              >
                {isAuthenticated ? content.hero.primaryAuthenticated : content.hero.primaryGuest}
              </LandingLink>
              <a className="landing-link-button landing-link-button--ghost" href="#fonctionnalites">
                {content.hero.secondary}
              </a>
            </div>
          </div>

          <HeroProductDemo content={content.heroDemo} />
        </div>
      </section>

      <section className="landing-section landing-pillars-section" id="fonctionnalites" aria-labelledby="pillars-title">
        <div className="landing-shell">
          <SectionHeading id="pillars-title" eyebrow={content.features.eyebrow} title={content.features.title}>
            {content.features.intro}
          </SectionHeading>
          <div className="landing-showcase-track landing-pillars-carousel" aria-label="Les écrans BudgetKazPéi" aria-roledescription="carousel">
            {content.features.pillars.slice(1).map((benefit, index) => <LandingPillar key={benefit.title} benefit={benefit} index={index + 1} />)}
          </div>
        </div>
      </section>

      <AdvisorAndLocalDeals advisor={content.advisor} localDeals={content.localDeals} />

      <section className="landing-section landing-section--soft landing-closing" aria-label={content.finalCta.eyebrow}>
        <FinalCTA isAuthenticated={isAuthenticated} content={content.finalCta} />
      </section>

      <footer className="landing-footer">
        <div className="landing-shell landing-footer__inner">
          <span>© {new Date().getFullYear()} BudgetKazPéi</span>
          <nav aria-label={content.footer.navigationAriaLabel}>
            <LandingLink href="/privacy">{content.footer.privacy}</LandingLink>
            <LandingLink href="/terms">{content.footer.terms}</LandingLink>
            <LandingLink href="/suppression-compte">{content.footer.deleteAccount}</LandingLink>
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </nav>
        </div>
      </footer>
    </main>
  )
}
