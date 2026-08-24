import { BkIcons } from "../icons-budgetkazpei"
import LandingLink from "./LandingLink"

function AdvisorScene({ advisor }) {
  const chat = advisor.conversation

  return (
    <div className="advisor-scene">
      <div className="advisor-scene__context" aria-label={advisor.title}>
        {advisor.contextLabels.map((label, index) => (
          <span key={label} className={index === 0 ? "is-active" : ""}>{label}</span>
        ))}
      </div>
      <div className="advisor-scene__connector" aria-hidden="true"><span /></div>
      <div className="advisor-chat">
        <div className="advisor-chat__topbar">
          <span className="advisor-chat__avatar" aria-hidden="true"><BkIcons.assistant size={17} /></span>
          <span><strong>{advisor.chatTitle}</strong><small>{advisor.chatMeta}</small></span>
          <i aria-hidden="true" />
        </div>
        <div className="advisor-chat__messages">
          <div className="advisor-chat__message advisor-chat__message--user">{chat.user}</div>
          <div className="advisor-chat__message advisor-chat__message--assistant">
            <span>{chat.assistant}</span>
            <button type="button">{chat.followup}<span aria-hidden="true">↗</span></button>
          </div>
        </div>
        <div className="advisor-chat__suggestions">
          {advisor.questions.map(question => <span key={question}>{question}</span>)}
        </div>
      </div>
    </div>
  )
}

function PromoCard({ card, index }) {
  const isPrimary = index === 0
  return (
    <article className={`deal-preview deal-preview--${card.tone} ${isPrimary ? "deal-preview--primary" : ""}`}>
      <div className="deal-preview__art" aria-hidden="true">
        <span /><span /><span />
      </div>
      <div className="deal-preview__body">
        <span className="deal-preview__badge">{card.badge}</span>
        <h3>{card.title}</h3>
        <p>{card.text}</p>
        <small>{card.meta}</small>
      </div>
    </article>
  )
}

function DealsScene({ localDeals }) {
  return (
    <div className="deals-scene" id="bons-plans" aria-labelledby="deals-title">
      <div className="deals-scene__heading">
        <div>
          <p className="landing-eyebrow">{localDeals.eyebrow}</p>
          <h2 id="deals-title">{localDeals.title}</h2>
        </div>
        <p>{localDeals.intro}</p>
      </div>

      <div className="deals-scene__promo-heading">
        <div><span className="deals-scene__number">02</span><h3>{localDeals.promoTitle}</h3></div>
        <p>{localDeals.promoText}</p>
      </div>

      <div className="deal-preview-grid">
        {localDeals.promoCards.map((card, index) => <PromoCard card={card} index={index} key={card.badge} />)}
      </div>

      <div className="family-preview">
        <div className="family-preview__art" aria-hidden="true"><span /><span /><span /><span /></div>
        <div>
          <span className="deals-scene__eyebrow">{localDeals.familyTitle}</span>
          <p>{localDeals.familyText}</p>
          <div className="family-preview__tags">{localDeals.familyTags.map(tag => <span key={tag}>{tag}</span>)}</div>
        </div>
      </div>

      <div className="deals-scene__local-line">
        <span>{localDeals.localLabel}</span>
        <div>{localDeals.localTags.map(tag => <span key={tag}>{tag}</span>)}</div>
      </div>
    </div>
  )
}

export default function AdvisorAndLocalDeals({ advisor, localDeals }) {
  return (
    <section className="landing-section landing-value-section" aria-labelledby="advisor-title">
      <div className="landing-shell">
        <div className="advisor-showcase">
          <div className="advisor-showcase__copy">
            <p className="landing-eyebrow">{advisor.eyebrow}</p>
            <h2 id="advisor-title">{advisor.title}</h2>
            <p>{advisor.intro}</p>
            <LandingLink href="/decouvrir" className="landing-link-button landing-link-button--ghost">{advisor.cta}</LandingLink>
          </div>
          <AdvisorScene advisor={advisor} />
        </div>
        <DealsScene localDeals={localDeals} />
      </div>
    </section>
  )
}
