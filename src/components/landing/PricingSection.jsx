import { PLAN_FEATURE_STATUS } from "../../config/plans"
import { pricingPlans } from "./landingContent"
import LandingLink from "./LandingLink"

function FeatureMarker({ status }) {
  if (status === PLAN_FEATURE_STATUS.soon) {
    return <span className="pricing-card__soon">Bientôt</span>
  }
  if (status === PLAN_FEATURE_STATUS.unavailable) {
    return <span className="pricing-card__dash" aria-hidden="true">-</span>
  }
  return <span className="pricing-card__check" aria-hidden="true">✓</span>
}

export default function PricingSection({ isAuthenticated = false }) {
  return (
    <section className="landing-section" id="offres" aria-labelledby="pricing-title">
      <div className="landing-shell">
        <div className="landing-section-heading">
          <p className="landing-eyebrow">Offres</p>
          <h2 id="pricing-title">Trois niveaux, lisibles en quelques secondes.</h2>
          <p>Commencez simplement, puis choisissez plus d'accompagnement lorsque cela devient utile.</p>
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
                    <FeatureMarker status={item.status} />
                    <span>{item.text}</span>
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
