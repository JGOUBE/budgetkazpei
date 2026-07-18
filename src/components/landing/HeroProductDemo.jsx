import { heroSignals } from "./landingContent"

export default function HeroProductDemo() {
  return (
    <div className="hero-demo" aria-label="Demonstration fictive des parcours BudgetKazPei">
      <div className="hero-demo__panel">
        <div className="hero-demo__topbar">
          <span />
          <strong>Vue quotidienne</strong>
          <em>Exemple</em>
        </div>

        <div className="hero-demo__cards">
          <article className="hero-demo__card hero-demo__card--budget">
            <span>Budget</span>
            <strong>Solde du mois</strong>
            <p>Dépenses classées, catégorie visible et alerte avant dépassement.</p>
          </article>
          <article className="hero-demo__card hero-demo__card--courses">
            <span>Courses</span>
            <strong>Ticket reconnu</strong>
            <p>Produits fréquents, habitudes d'achat et comparaison en enrichissement.</p>
          </article>
          <article className="hero-demo__card hero-demo__card--aides">
            <span>Aides</span>
            <strong>Prochaine action</strong>
            <p>Aide possible, document à préparer et statut de démarche.</p>
          </article>
          <article className="hero-demo__card hero-demo__card--local">
            <span>Bons plans</span>
            <strong>Pres de chez vous</strong>
            <p>Ville, catégorie et service local clairement identifié.</p>
          </article>
        </div>
      </div>

      <div className="hero-demo__stats">
        {heroSignals.map(item => (
          <div key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}
