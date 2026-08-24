import LandingLink from "./LandingLink"
import ProductPhoneMockup from "./ProductPhoneMockup"
import { LANDING_REFERENCE_IMAGES } from "./landingReferenceImages"

function DealEvidence() {
  return (
    <div className="deal-evidence" aria-label="Contenu réel visible dans Bons plans">
      <div className="deal-evidence__line"><span>BudgetKazPéi Local</span><b>Saint-Leu</b></div>
      <div className="deal-evidence__filters"><span>Promos & bons prix</span><span>Restaurants</span><span>Loisirs & famille</span></div>
      <div className="deal-evidence__event"><span>ÉVÉNEMENT</span><strong>Exposition Les Engagés du sucre</strong><small>Musée Stella Matutina · 15 novembre 2025 → 4 avril 2027</small></div>
      <div className="deal-evidence__counts"><span><b>24</b> événements à venir</span><span><b>80</b> à faire toute l'année</span></div>
    </div>
  )
}

function DealsScene({ localDeals }) {
  return (
    <section className="landing-section landing-deals-section" id="bons-plans" aria-labelledby="deals-title">
      <div className="landing-shell landing-deals-showcase">
        <div className="landing-deals-showcase__phone">
          <ProductPhoneMockup referenceImage={LANDING_REFERENCE_IMAGES.deals} imageAlt="Écran réel BudgetKazPéi Local — Saint-Leu" variant="left" />
          <div className="landing-deals-showcase__detail" aria-hidden="true"><img src={LANDING_REFERENCE_IMAGES.leisure} alt="" /></div>
        </div>
        <div className="landing-deals-showcase__copy">
          <p className="landing-eyebrow">05 · {localDeals.eyebrow}</p>
          <h2 id="deals-title">Les bons plans autour de vous.</h2>
          <p className="landing-deals-showcase__phrase">Retrouvez les offres, événements et loisirs utiles près de votre commune, sans inventer de prix ni de partenariat.</p>
          <DealEvidence />
          <LandingLink href="/decouvrir" className="landing-link-button landing-link-button--ghost">Explorer les promos</LandingLink>
        </div>
      </div>
    </section>
  )
}

export default function AdvisorAndLocalDeals({ localDeals }) {
  return <DealsScene localDeals={localDeals} />
}
