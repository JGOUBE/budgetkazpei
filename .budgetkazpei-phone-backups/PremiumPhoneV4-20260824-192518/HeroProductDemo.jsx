import { BkIcons } from "../icons-budgetkazpei"
import ProductPhoneMockup from "./ProductPhoneMockup"
import { LANDING_REFERENCE_IMAGES } from "./landingReferenceImages"
import { getLandingContent } from "./landingContent"

function ProductSignal({ signal }) {
  const Icon = signal.type === "scan" ? BkIcons.scan : signal.type === "advisor" ? BkIcons.assistant : BkIcons.shopping

  return (
    <div className={`product-signal product-signal--${signal.type}`}>
      <span className="product-signal__icon" aria-hidden="true"><Icon size={15} /></span>
      <span><small>{signal.label}</small><strong>{signal.value}</strong></span>
    </div>
  )
}

function ProductListCard({ card }) {
  if (!card) return null

  return (
    <article className="product-list-card" aria-label={card.title}>
      <div className="product-list-card__head"><span className="product-list-card__icon" aria-hidden="true"><BkIcons.shopping size={14} /></span><strong>{card.title}</strong><span className="product-list-card__count">{card.items.length}</span></div>
      <ul>{card.items.map(item => <li key={item}><span aria-hidden="true" />{item}</li>)}</ul>
      <div className="product-list-card__footer"><span>{card.meta}</span><b>{card.action}<span aria-hidden="true">↗</span></b></div>
    </article>
  )
}

export default function HeroProductDemo({ content }) {
  const sourceCopy = content || getLandingContent("fr").heroDemo
  const copy = { ...sourceCopy, referenceImage: sourceCopy.referenceImage || LANDING_REFERENCE_IMAGES.dashboard }

  return (
    <div className="hero-product-demo" aria-label={copy.ariaLabel}>
      <div className="hero-product-demo__ambient hero-product-demo__ambient--one" aria-hidden="true" />
      <div className="hero-product-demo__ambient hero-product-demo__ambient--two" aria-hidden="true" />
      <div className="hero-product-demo__horizon" aria-hidden="true" />
      <div className="hero-product-demo__stage">
        <div className="hero-product-demo__contact-shadow" aria-hidden="true" />
        <ProductPhoneMockup referenceImage={copy.referenceImage} imageAlt="Tableau de bord BudgetKazPéi" variant="hero" />
        <ProductListCard card={copy.listCard} />
      </div>
      <div className="hero-product-demo__signals">{(copy.signals || []).slice(0, 1).map(signal => <ProductSignal signal={signal} key={signal.type} />)}</div>
      <span className="hero-product-demo__caption">{copy.caption}</span>
    </div>
  )
}

export { ProductListCard, ProductSignal }
