import { pricingPlans } from "./landingContent"
import LandingLink from "./LandingLink"

export default function PricingSection({ isAuthenticated = false }) {
  return (
    <section className="landing-section" id="offres" aria-labelledby="pricing-title">
      <div className="landing-shell">
        <div className="landing-section-heading">
          <p className="landing-eyebrow">Offres</p>
          <h2 id="pricing-title">Choisissez le niveau qui correspond à votre usage.</h2>
          <p>
            Les prix restent simples. Les nouveautés futures sont présentées comme telles, sans les faire
            passer pour des fonctions déjà disponibles.
          </p>
        </div>

        <div className="pricing-grid">
          {pricingPlans.map(plan => (
            <article className={`pricing-card pricing-card--${plan.tone} ${plan.featured ? "pricing-card--featured" : ""}`} key={plan.name}>
              <div>
                <p className="pricing-card__label">{plan.name}</p>
                <h3>{plan.price}</h3>
                <p>{plan.intro}</p>
              </div>
              <ul>
                {plan.items.map(item => (
                  <li key={`${plan.name}-${item.text}`}>
                    <span>{item.status}</span>
                    {item.text}
                  </li>
                ))}
              </ul>
              <LandingLink
                href={isAuthenticated && plan.name === "Gratuit" ? "/app" : plan.href}
                className={plan.featured ? "landing-link-button landing-link-button--primary" : "landing-link-button landing-link-button--ghost"}
              >
                {isAuthenticated && plan.name === "Gratuit" ? "Accéder à mon tableau de bord" : plan.cta}
              </LandingLink>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
