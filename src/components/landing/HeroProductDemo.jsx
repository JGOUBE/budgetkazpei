import { BkIcons } from "../icons-budgetkazpei"
import { getLandingContent } from "./landingContent"
import { LANDING_REFERENCE_IMAGES } from "./landingReferenceImages"

function ProductListCard({ card }) {
  if (!card) return null

  const previewItems = (card.items || []).slice(0, 3)

  return (
    <article className="product-list-card hero-master-list" aria-label={card.title}>
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
          <img className="product-list-card__whatsapp" src="/icons-creole/whatsapp-mark.svg" alt="" aria-hidden="true" />
          {card.action}
          <span aria-hidden="true">↗</span>
        </b>
      </div>
    </article>
  )
}

export default function HeroProductDemo({ content }) {
  const copy = content || getLandingContent("fr").heroDemo

  return (
    <div className="hero-product-demo hero-product-demo--master" aria-label={copy.ariaLabel}>
      <div className="hero-master-scene">
        <div className="hero-master-halo hero-master-halo--one" aria-hidden="true" />
        <div className="hero-master-halo hero-master-halo--two" aria-hidden="true" />

        <img
          className="hero-master-phone"
          src={LANDING_REFERENCE_IMAGES.heroPhone}
          alt="BudgetKazPéi affiché sur un smartphone 3D"
          draggable="false"
        />

        <ProductListCard card={copy.listCard} />
      </div>
    </div>
  )
}

export { ProductListCard }
