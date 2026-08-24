import { getLandingContent } from "./landingContent"
import AppLogo from "../AppLogo"
import { BkIcons } from "../icons-budgetkazpei"

function ProductSignal({ signal }) {
  const Icon = signal.type === "scan" ? BkIcons.scan : signal.type === "advisor" ? BkIcons.assistant : signal.type === "list" ? BkIcons.shopping : BkIcons.budget

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
      <ul>
        {card.items.map(item => <li key={item}><span aria-hidden="true" />{item}</li>)}
      </ul>
      <div className="product-list-card__footer"><span>{card.meta}</span><b>{card.action}<span aria-hidden="true">↗</span></b></div>
    </article>
  )
}

function ProductPhoneScreen({ copy }) {
  return (
    <div className="product-phone__screen">
      <div className="product-screen__topbar">
        <span className="product-screen__time">09:41</span>
        <span className="product-screen__notch" aria-hidden="true" />
        <span className="product-screen__status">● ◒</span>
      </div>

      <div className="product-screen__appbar">
        <div className="product-screen__brand"><AppLogo size={24} alt="" /><span>BudgetKazPéi</span></div>
        <span className="product-screen__month">{copy.monthLabel}</span>
      </div>

      <div className="product-screen__greeting">
        <span>{copy.greeting}</span>
        <strong>{copy.appLabel}</strong>
      </div>

      <div className="product-screen__score">
        <div><span>{copy.scoreLabel}</span><strong>{copy.score}<small>/ 100</small></strong></div>
        <em>{copy.scoreStatus}</em>
        <div className="product-screen__score-track"><span /></div>
      </div>

      <div className="product-screen__stats">
        {copy.stats.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
      </div>

      <div className="product-screen__category">
        <div><span>{copy.categoryTitle}</span><strong>{copy.categoryValue}</strong></div>
        <div className="product-screen__category-bars" aria-hidden="true"><i /><i /><i /><i /><i /></div>
        <small>{copy.categoryLabel}</small>
      </div>

      <div className="product-screen__activity">
        <div className="product-screen__activity-heading"><strong>{copy.recentTitle}</strong><span>{copy.viewAll}</span></div>
        {copy.transactions.map(([label, amount, date]) => (
          <div className="product-screen__activity-row" key={`${label}-${amount}`}>
            <span className="product-screen__activity-icon" aria-hidden="true">{label === "Revenu" || label === "Larzan rantre" ? <BkIcons.savings size={12} /> : <BkIcons.receipts size={12} />}</span>
            <span><b>{label}</b><small>{date}</small></span>
            <strong className={amount.startsWith("+") ? "is-positive" : ""}>{amount}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function HeroProductDemo({ content }) {
  const copy = content || getLandingContent("fr").heroDemo

  return (
    <div className="hero-product-demo" aria-label={copy.ariaLabel}>
      <div className="hero-product-demo__ambient hero-product-demo__ambient--one" aria-hidden="true" />
      <div className="hero-product-demo__ambient hero-product-demo__ambient--two" aria-hidden="true" />
      <div className="hero-product-demo__horizon" aria-hidden="true" />
      <div className="hero-product-demo__stage">
        <div className="hero-product-demo__contact-shadow" aria-hidden="true" />
        <div className="hero-product-demo__side-button hero-product-demo__side-button--top" aria-hidden="true" />
        <div className="hero-product-demo__side-button hero-product-demo__side-button--bottom" aria-hidden="true" />
        <article className="hero-product-demo__phone">
          <div className="hero-product-demo__speaker" aria-hidden="true" />
          <ProductPhoneScreen copy={copy} />
        </article>
        <ProductListCard card={copy.listCard} />
      </div>

      <div className="hero-product-demo__signals">
        {(copy.signals || []).map(signal => <ProductSignal signal={signal} key={signal.type} />)}
      </div>
      <span className="hero-product-demo__caption">{copy.caption}</span>
    </div>
  )
}
