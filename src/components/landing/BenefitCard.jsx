import { BkIcons } from "../icons-budgetkazpei"

export default function BenefitCard({ benefit }) {
  const Icon = BkIcons[benefit.icon] || BkIcons.check

  return (
    <article className={`benefit-card benefit-card--${benefit.tone}`}>
      <div className="benefit-card__icon" aria-hidden="true">
        <Icon size={24} />
      </div>

      <h3>{benefit.title}</h3>
      <p>{benefit.answer}</p>

      <ul>
        {benefit.points.map(point => (
          <li key={point}>{point}</li>
        ))}
      </ul>
    </article>
  )
}
