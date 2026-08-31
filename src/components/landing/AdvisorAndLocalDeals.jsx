import { BkIcons } from "../icons-budgetkazpei"
import { LANDING_REFERENCE_IMAGES } from "./landingReferenceImages"

const PROMOTION_ICONS = {
  catalog: BkIcons.deals,
  shopping: BkIcons.shopping,
}

const LOCAL_OFFER_ICONS = {
  artisans: BkIcons.homeServices,
  commerces: BkIcons.store,
  restaurants: BkIcons.food,
  services: BkIcons.demarches,
}

function AdvisorShowcase({ advisor }) {
  const conversation = advisor.conversation || {}

  return (
    <section className="landing-section landing-advisor-section" id="conseiller" aria-labelledby="advisor-title">
      <div className="landing-shell advisor-showcase advisor-showcase--reverse">
        <div className="advisor-showcase__visual">
          <div className="advisor-phone-stage">
            <img src={LANDING_REFERENCE_IMAGES.advisorPhone} alt={advisor.phoneAlt} draggable="false" />
          </div>
        </div>
        <div className="advisor-showcase__copy">
          <p className="landing-eyebrow">{advisor.eyebrow}</p>
          <h2 id="advisor-title">{advisor.title}</h2>
          <p>{advisor.intro}</p>
          <div className="advisor-proof-card">
            <strong>{conversation.user}</strong>
            <p>{conversation.assistant}</p>
          </div>
          <div className="advisor-context-row" aria-label={advisor.contextAriaLabel}>
            {advisor.contextLabels.map(label => <span key={label}>{label}</span>)}
          </div>
        </div>
      </div>
    </section>
  )
}

function PromotionCard({ card }) {
  const Icon = PROMOTION_ICONS[card.icon] || BkIcons.deals

  return (
    <article className={`native-promo-card native-promo-card--${card.tone || "peach"}`}>
      <div className="native-promo-card__icon" aria-hidden="true"><Icon size={22} /></div>
      <span className="native-promo-card__badge">{card.badge}</span>
      <h3>{card.title}</h3>
      <p>{card.text}</p>
      <small>{card.meta}</small>
    </article>
  )
}

function PromotionsSection({ content }) {
  return (
    <section className="landing-section landing-promotions-section" id="bons-plans" aria-labelledby="promotions-title">
      <div className="landing-shell native-marketing-section">
        <div className="native-marketing-heading">
          <p className="landing-eyebrow">{content.eyebrow}</p>
          <h2 id="promotions-title">{content.title}</h2>
          <p>{content.text}</p>
        </div>
        <div className="native-promo-grid">
          {content.cards.map(card => <PromotionCard card={card} key={card.title} />)}
        </div>
      </div>
    </section>
  )
}

function LocalOffersSection({ content }) {
  return (
    <section className="landing-section landing-local-offers-section" id="offres-locales" aria-labelledby="local-offers-title">
      <div className="landing-shell local-offers-layout">
        <div className="native-marketing-heading">
          <p className="landing-eyebrow">{content.eyebrow}</p>
          <h2 id="local-offers-title">{content.title}</h2>
          <p>{content.text}</p>
        </div>
        <div className="local-offer-chips" aria-label={content.categoriesAriaLabel}>
          {content.categories.map(category => {
            const Icon = LOCAL_OFFER_ICONS[category.icon] || BkIcons.location
            return <span key={category.label}><Icon size={18} aria-hidden="true" />{category.label}</span>
          })}
        </div>
      </div>
    </section>
  )
}

function FamilySection({ content }) {
  return (
    <section className="landing-section landing-family-section" id="sorties-famille" aria-labelledby="family-title">
      <div className="landing-shell family-marketing-layout">
        <div className="native-marketing-heading">
          <p className="landing-eyebrow">{content.eyebrow}</p>
          <h2 id="family-title">{content.title}</h2>
          <p>{content.text}</p>
        </div>

        <div className="family-product-fragment">
          <article className="family-event-card">
            <span className="family-event-card__label">{content.event.label}</span>
            <h3>{content.event.title}</h3>
            <p><BkIcons.location size={17} aria-hidden="true" />{content.event.location}</p>
            <time>{content.event.period}</time>
          </article>
          <div className="family-indicators" aria-label={content.indicatorsAriaLabel}>
            {content.indicators.map(indicator => (
              <div className="family-indicator" key={indicator.label}>
                <strong>{indicator.value}</strong>
                <span>{indicator.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="family-native-tags">
          {content.tags.map(tag => <span key={tag}>{tag}</span>)}
        </div>
      </div>
    </section>
  )
}

export default function AdvisorAndLocalDeals({ advisor, localDeals }) {
  return (
    <>
      <AdvisorShowcase advisor={advisor} />
      <PromotionsSection content={localDeals.promotions} />
      <LocalOffersSection content={localDeals.localOffers} />
      <FamilySection content={localDeals.family} />
    </>
  )
}
