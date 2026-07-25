import { useEffect } from "react"
import { BkIcons } from "../components/icons-budgetkazpei"
import BenefitCard from "../components/landing/BenefitCard"
import FinalCTA from "../components/landing/FinalCTA"
import HeroProductDemo from "../components/landing/HeroProductDemo"
import LandingFAQ from "../components/landing/LandingFAQ"
import LandingHeader from "../components/landing/LandingHeader"
import LandingLink from "../components/landing/LandingLink"
import PricingSection from "../components/landing/PricingSection"
import ScanJourney from "../components/landing/ScanJourney"
import { localDealCategories, localDealPrinciples, pillars } from "../components/landing/landingContent"
import "../styles/landing.css"

const CONTACT_EMAIL = "contact.budgetkazpei@gmail.com"

function upsertMeta(selector, attributes) {
  if (typeof document === "undefined") return
  let element = document.head.querySelector(selector)
  if (!element) {
    element = document.createElement("meta")
    document.head.appendChild(element)
  }
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value))
}

function useLandingSeo() {
  useEffect(() => {
    if (typeof document === "undefined") return
    document.title = "BudgetKazPei — Budget, courses, aides et bons plans à La Réunion"
    upsertMeta('meta[name="description"]', {
      name: "description",
      content: "Suivez votre budget, comprenez vos courses, préparez vos démarches et découvrez progressivement les bons plans locaux avec BudgetKazPei.",
    })
    upsertMeta('meta[property="og:title"]', {
      property: "og:title",
      content: "BudgetKazPei - Budget, courses, aides et bons plans à La Réunion",
    })
    upsertMeta('meta[property="og:description"]', {
      property: "og:description",
      content: "Une application locale pour réunir budget, courses, aides, démarches et solutions utiles autour de vous.",
    })
    upsertMeta('meta[property="og:type"]', { property: "og:type", content: "website" })
    upsertMeta('meta[property="og:image"]', { property: "og:image", content: "/icons-creole/logo-budgetkazpei.png" })
  }, [])
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

function LocalDealsSection() {
  return (
    <section className="landing-section landing-local" id="bons-plans" aria-labelledby="local-deals-title">
      <div className="landing-shell local-deals">
        <div>
          <p className="landing-eyebrow">Bons plans locaux</p>
          <h2 id="local-deals-title">Les bons plans autour de chez vous.</h2>
          <p>
            Retrouvez progressivement des promotions, commerces, artisans et services locaux classés par ville et catégorie.
          </p>
          <div className="landing-pill-row" aria-label="Catégories de bons plans">
            {localDealCategories.map(category => <span key={category}>{category}</span>)}
          </div>
        </div>

        <div className="local-deals__cards" aria-label="Fonctionnement progressif des bons plans">
          {localDealPrinciples.map(item => (
            <article key={item}>
              <BkIcons.check size={18} aria-hidden="true" />
              <span>{item}</span>
            </article>
          ))}
          <article className="local-deals__pro">
            <h3>Vous êtes commerçant, artisan ou professionnel à La Réunion ?</h3>
            <p>Proposez votre établissement, une promotion ou un service local pour apparaître dans les Bons plans BudgetKazPei.</p>
            <a className="landing-link-button landing-link-button--primary" href={`mailto:${CONTACT_EMAIL}`}>
              Nous contacter
            </a>
          </article>
        </div>
      </div>
    </section>
  )
}

export default function PublicHomePage({ isAuthenticated = false }) {
  const dashboardLabel = "Accéder à mon tableau de bord"
  useLandingSeo()

  return (
    <main className="landing-page" id="contenu">
      <LandingHeader isAuthenticated={isAuthenticated} />

      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-shell landing-hero__grid">
          <div className="landing-hero__copy">
            <p className="landing-eyebrow">BudgetKazPei à La Réunion</p>
            <h1 id="landing-title">Votre budget, vos courses et vos aides. Au même endroit.</h1>
            <p className="landing-hero__lead">
              Suivez vos dépenses, comprenez mieux vos achats, préparez vos démarches et découvrez progressivement
              les solutions utiles autour de vous, avec une application pensée pour La Réunion.
            </p>
            <div className="landing-hero__actions">
              <LandingLink href={isAuthenticated ? "/app" : "/register"} className="landing-link-button landing-link-button--primary">
                {isAuthenticated ? dashboardLabel : "Créer mon compte"}
              </LandingLink>
              <a className="landing-link-button landing-link-button--ghost" href="#fonctionnalites">
                Découvrir les fonctionnalités
              </a>
            </div>
          </div>
          <HeroProductDemo />
        </div>
      </section>

      <section className="landing-section" id="fonctionnalites" aria-labelledby="pillars-title">
        <div className="landing-shell">
          <SectionHeading id="pillars-title" eyebrow="Fonctionnalités" title="Tout votre quotidien dans une seule application.">
            Budget, courses, aides et bons plans avancent ensemble, sans présenter le scanner comme tout le produit.
          </SectionHeading>
          <div className="benefit-grid">
            {pillars.map(benefit => (
              <BenefitCard key={benefit.title} benefit={benefit} />
            ))}
          </div>
        </div>
      </section>

      <ScanJourney />
      <LocalDealsSection />
      <PricingSection isAuthenticated={isAuthenticated} />

      <section className="landing-section landing-section--soft landing-closing" aria-labelledby="faq-title">
        <LandingFAQ />
        <FinalCTA isAuthenticated={isAuthenticated} />
      </section>

      <footer className="landing-footer">
        <div className="landing-shell landing-footer__inner">
          <span>© {new Date().getFullYear()} BudgetKazPei</span>
          <nav aria-label="Liens de pied de page">
            <LandingLink href="/privacy">Confidentialité</LandingLink>
            <LandingLink href="/terms">Conditions</LandingLink>
            <LandingLink href="/suppression-compte">Suppression compte</LandingLink>
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </nav>
        </div>
      </footer>
    </main>
  )
}
