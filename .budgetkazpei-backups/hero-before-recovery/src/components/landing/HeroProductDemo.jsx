import ProductPhoneMockup from "./ProductPhoneMockup"
import { LANDING_REFERENCE_IMAGES } from "./landingReferenceImages"
import { getLandingContent } from "./landingContent"
import { BkIcons } from "../icons-budgetkazpei"

function ProductListCard({ card }) {
  if (!card) return null

  const previewItems = (card.items || []).slice(0, 3)

  return (
    <article className="product-list-card" aria-label={card.title}>
      <div className="product-list-card__head">
        <span className="product-list-card__icon" aria-hidden="true">
          <BkIcons.shopping size={14} />
        </span>
        <strong>{card.title}</strong>
        <span className="product-list-card__count">{card.items?.length || 0}</span>
      </div>

      <ul>
        {previewItems.map((item) => (
          <li key={item}>
            <span aria-hidden="true" />
            {item}
          </li>
        ))}
      </ul>

      <div className="product-list-card__footer">
        <span>{card.meta}</span>
        <b>
          {card.action}
          <span aria-hidden="true">↗</span>
        </b>
      </div>
    </article>
  )
}

export default function HeroProductDemo({ content }) {
  const sourceCopy = content || getLandingContent("fr").heroDemo
  const copy = {
    ...sourceCopy,
    referenceImage: sourceCopy.referenceImage || LANDING_REFERENCE_IMAGES.dashboard,
  }

  return (
    <div className="hero-product-demo" aria-label={copy.ariaLabel}>
      <div className="hero-product-demo__ambient hero-product-demo__ambient--one" aria-hidden="true" />
      <div className="hero-product-demo__ambient hero-product-demo__ambient--two" aria-hidden="true" />
      <div className="hero-product-demo__horizon" aria-hidden="true" />

      <div className="hero-product-demo__stage">
        <div className="hero-product-demo__contact-shadow" aria-hidden="true" />

        <div className="hero-product-demo__phone-wrap">
          <ProductPhoneMockup
            className="hero-product-demo__mockup"
            referenceImage={copy.referenceImage}
            imageAlt="Tableau de bord BudgetKazPéi"
            variant="hero"
          />
        </div>

        <div className="hero-product-demo__card-wrap">
          <ProductListCard card={copy.listCard} />
        </div>
      </div>

      <span className="hero-product-demo__caption">{copy.caption}</span>
    </div>
  )
}

export { ProductListCard }
