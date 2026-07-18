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
import { benefits, howItWorks, useCases } from "../components/landing/landingContent"
import "../styles/landing.css"

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
    document.title = "BudgetKazPei — Budget, tickets et aides à La Réunion"
    upsertMeta('meta[name="description"]', {
      name: "description",
      content: "Scannez vos tickets, suivez votre budget et préparez vos démarches avec une application pensée pour le quotidien à La Réunion.",
    })
    upsertMeta('meta[property="og:title"]', {
      property: "og:title",
      content: "BudgetKazPei - Vos tickets deviennent des conseils utiles",
    })
    upsertMeta('meta[property="og:description"]', {
      property: "og:description",
      content: "Une application locale pour suivre son budget, comprendre ses courses et préparer ses démarches.",
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

export default function PublicHomePage({ isAuthenticated = false }) {
  const dashboardLabel = "Accéder à mon tableau de bord"
  useLandingSeo()

  return (
    <main className="landing-page" id="contenu">
      <LandingHeader isAuthenticated={isAuthenticated} />

      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-shell landing-hero__grid">
          <div className="landing-hero__copy">
            <p className="landing-eyebrow">Budget, tickets et démarches</p>
            <h1 id="landing-title">Vos tickets deviennent des conseils utiles.</h1>
            <p className="landing-hero__lead">
              Scannez vos achats, suivez votre budget et découvrez progressivement où vous pouvez économiser à La Réunion.
            </p>
            <div className="landing-hero__actions">
              <LandingLink href={isAuthenticated ? "/app" : "/register"} className="landing-link-button landing-link-button--primary">
                {isAuthenticated ? dashboardLabel : "Essayer gratuitement"}
              </LandingLink>
              <a className="landing-link-button landing-link-button--ghost" href="#demo-scanner">
                Voir comment ça marche
              </a>
            </div>
            <p className="landing-hero__microcopy">
              Création gratuite · Sans carte bancaire · Français et créole
            </p>
          </div>
          <HeroProductDemo />
        </div>
      </section>

      <ScanJourney />

      <section className="landing-section" id="fonctionnalites" aria-labelledby="benefits-title">
        <div className="landing-shell">
          <SectionHeading id="benefits-title" eyebrow="Ce que ça change" title="Un budget plus lisible, sans promesse magique.">
            Quatre usages simples pour passer du ticket oublié à une décision plus claire.
          </SectionHeading>
          <div className="benefit-grid">
            {benefits.map(benefit => (
              <BenefitCard key={benefit.title} benefit={benefit} />
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section landing-section--split" aria-labelledby="how-title">
        <div className="landing-shell split-grid">
          <div>
            <p className="landing-eyebrow">Comment ça marche</p>
            <h2 id="how-title">Trois gestes simples pour y voir plus clair.</h2>
            <p>
              BudgetKazPei vous accompagne, mais vous restez la personne qui vérifie, corrige et décide.
            </p>
          </div>
          <div className="how-list">
            {howItWorks.map((step, index) => (
              <article key={step.title}>
                <span>{index + 1}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section" aria-labelledby="use-cases-title">
        <div className="landing-shell">
          <SectionHeading id="use-cases-title" eyebrow="Cas d'usage" title="Pour les petits budgets, les familles et les démarches du quotidien." />
          <div className="use-case-grid">
            {useCases.map((item, index) => (
              <article key={item.title}>
                <span aria-hidden="true">{["Courses", "Famille", "Dossier"][index]}</span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section landing-local" aria-labelledby="local-title">
        <div className="landing-shell split-grid">
          <div className="landing-local__badge" aria-hidden="true">
            <BkIcons.location size={34} />
            <span>La Réunion</span>
          </div>
          <div>
            <p className="landing-eyebrow">Valeur locale</p>
            <h2 id="local-title">Pensé pour le quotidien à La Réunion.</h2>
            <p>
              Aujourd'hui, BudgetKazPei vous aide à mieux comprendre vos habitudes. Les comparaisons
              deviendront plus précises à mesure que la base de prix grandira avec des données validées.
            </p>
            <div className="landing-pill-row" aria-label="Points locaux">
              <span>Français et créole</span>
              <span>Aides locales et nationales</span>
              <span>Courses du quotidien</span>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section landing-section--soft" aria-labelledby="advisor-title">
        <div className="landing-shell advisor-grid">
          <div>
            <p className="landing-eyebrow">Conseiller et démarches</p>
            <h2 id="advisor-title">Un parcours clair, pas quatre produits séparés.</h2>
            <p>
              BudgetKazPei vous aide à préparer vos démarches. La décision finale appartient toujours
              à l'organisme officiel.
            </p>
          </div>
          <div className="advisor-flow" aria-label="Parcours Conseiller BudgetKazPei">
            {["Mon profil", "Aides possibles", "Mes démarches", "Documents et prochaine action"].map(item => (
              <article key={item}>
                <BkIcons.check size={20} aria-hidden="true" />
                <span>{item}</span>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section privacy-band" aria-labelledby="privacy-title">
        <div className="landing-shell privacy-band__inner">
          <div>
            <p className="landing-eyebrow">Confidentialité</p>
            <h2 id="privacy-title">Vos données restent sous votre contrôle.</h2>
            <p>
              BudgetKazPei ne revend pas vos données personnelles. Vous pouvez demander l'accès, la correction
              ou la suppression de vos informations, et corriger les résultats avant de les utiliser.
            </p>
          </div>
          <div className="privacy-links">
            <LandingLink href="/privacy">Confidentialité</LandingLink>
            <LandingLink href="/terms">Conditions</LandingLink>
            <LandingLink href="/suppression-compte">Suppression de compte</LandingLink>
          </div>
        </div>
      </section>

      <PricingSection isAuthenticated={isAuthenticated} />
      <LandingFAQ />
      <FinalCTA isAuthenticated={isAuthenticated} />

      <footer className="landing-footer">
        <div className="landing-shell landing-footer__inner">
          <span>© {new Date().getFullYear()} BudgetKazPei</span>
          <nav aria-label="Liens de pied de page">
            <LandingLink href="/privacy">Confidentialité</LandingLink>
            <LandingLink href="/terms">Conditions</LandingLink>
            <LandingLink href="/suppression-compte">Suppression compte</LandingLink>
            <a href="mailto:contact.budgetkazpei@gmail.com">contact.budgetkazpei@gmail.com</a>
          </nav>
        </div>
      </footer>
    </main>
  )
}
