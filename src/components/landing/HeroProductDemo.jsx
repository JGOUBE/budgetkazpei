import { heroStats, receiptItems } from "./landingContent"

export default function HeroProductDemo() {
  return (
    <div className="hero-demo" aria-label="Démonstration fictive du parcours ticket vers budget">
      <div className="hero-demo__phone">
        <div className="hero-demo__topbar">
          <span />
          <strong>Ticket reconnu</strong>
          <em>À vérifier</em>
        </div>
        <div className="hero-demo__receipt">
          <p className="hero-demo__receipt-title">Courses du samedi</p>
          {receiptItems.map(([label, price]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{price}</strong>
            </div>
          ))}
          <div className="hero-demo__total">
            <span>Total détecté</span>
            <strong>42,80 €</strong>
          </div>
        </div>
        <div className="hero-demo__budget-card">
          <span>Budget alimentaire</span>
          <strong>Dépense prête à ajouter</strong>
          <div aria-hidden="true">
            <i style={{ width: "58%" }} />
          </div>
        </div>
      </div>

      <div className="hero-demo__floating hero-demo__floating--scan">
        <span className="landing-dot landing-dot--blue" />
        Photo lisible
      </div>
      <div className="hero-demo__floating hero-demo__floating--budget">
        <span className="landing-dot landing-dot--green" />
        Budget mis à jour
      </div>

      <div className="hero-demo__stats">
        {heroStats.map(item => (
          <div key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}
