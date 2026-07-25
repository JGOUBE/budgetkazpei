import { PLAN_FEATURE_STATUS, PLAN_IDS } from "../../config/plans"
import { getLandingContent } from "./landingContent"
import LandingLink from "./LandingLink"

function FeatureMarker({ status, copy }) {
  if (status === PLAN_FEATURE_STATUS.soon) {
    return <span className="pricing-card__soon">{copy.soonLabel}</span>
  }

  if (status === PLAN_FEATURE_STATUS.unavailable) {
    return (
      <span
        className="pricing-card__dash"
        role="img"
        aria-label={copy.unavailableAriaLabel}
      >
        −
      </span>
    )
  }

  return (
    <span
      className="pricing-card__check"
      role="img"
      aria-label={copy.includedAriaLabel}
    >
      ✓
    </span>
  )
}

export default function PricingSection({ isAuthenticated = false, content }) {
  const copy = content || getLandingContent("fr").pricing

  return (
    <section
      className="landing-section"
      id="offres"
      aria-labelledby="pricing-title"
    >
      <div className="landing-shell">
        <div className="landing-section-heading">
          <p className="landing-eyebrow">{copy.eyebrow}</p>
          <h2 id="pricing-title">{copy.title}</h2>
          <p>{copy.intro}</p>
        </div>

        <div className="pricing-grid">
          {copy.plans.map(plan => {
            const isFreePlan = plan.id === PLAN_IDS.free
            const href = isAuthenticated && isFreePlan ? "/app" : plan.href
            const ctaLabel =
              isAuthenticated && isFreePlan ? copy.dashboard : plan.cta

            return (
              <article
                className={`pricing-card pricing-card--${plan.tone} ${
                  plan.featured ? "pricing-card--featured" : ""
                }`}
                key={plan.id}
              >
                <div>
                  <p className="pricing-card__label">{plan.name}</p>
                  <h3>{plan.price}</h3>
                  <p>{plan.intro}</p>
                </div>

                <ul>
                  {plan.items.map(item => (
                    <li key={`${plan.id}-${item.text}`}>
                      <FeatureMarker status={item.status} copy={copy} />
                      <span>{item.text}</span>
                    </li>
                  ))}
                </ul>

                <LandingLink
                  href={href}
                  className={
                    plan.featured
                      ? "landing-link-button landing-link-button--primary"
                      : "landing-link-button landing-link-button--ghost"
                  }
                >
                  {ctaLabel}
                </LandingLink>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
