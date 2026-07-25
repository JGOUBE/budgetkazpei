import { getLandingContent } from "./landingContent"

export default function HeroProductDemo({ content }) {
  const copy = content || getLandingContent("fr").heroDemo

  return (
    <div className="hero-demo" aria-label={copy.ariaLabel}>
      <div className="hero-demo__panel">
        <div className="hero-demo__topbar">
          <span />
          <strong>{copy.topbarTitle}</strong>
          <em>{copy.exampleLabel}</em>
        </div>

        <div className="hero-demo__cards">
          {copy.cards.map(card => (
            <article
              className={`hero-demo__card hero-demo__card--${card.tone}`}
              key={card.tone}
            >
              <span>{card.label}</span>
              <strong>{card.title}</strong>
              <p>{card.text}</p>
            </article>
          ))}
        </div>
      </div>

      <div className="hero-demo__stats">
        {copy.signals.map(item => (
          <div key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}
