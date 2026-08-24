import ProductPhoneMockup, {
  AidesProductScreen,
  CoursesProductScreen,
} from "./ProductPhoneMockup"
import { LANDING_REFERENCE_IMAGES } from "./landingReferenceImages"

const SCREEN_COPY = {
  courses: { eyebrow: "02 · Mes courses", variant: "right", phrase: "Préparez vos listes, scannez vos tickets et partagez vos courses avec votre famille." },
  aides: { eyebrow: "03 · Mes aides & démarches", variant: "left", phrase: "Repérez les aides possibles et sachez quelle étape préparer ensuite." },
  advisor: { eyebrow: "04 · Mon Conseiller", variant: "right", phrase: "Des réponses basées sur votre quotidien, avec une prochaine action concrète." },
  budget: { eyebrow: "01 · Mon budget", variant: "left", phrase: "Voyez immédiatement ce qui entre, ce qui sort et ce qu’il vous reste." },
}

export default function LandingPillar({ benefit, index }) {
  const visual = benefit.visual || "budget"
  const copy = SCREEN_COPY[visual] || SCREEN_COPY.budget
  const referenceImage = visual === "advisor" ? LANDING_REFERENCE_IMAGES.advisor : visual === "budget" ? LANDING_REFERENCE_IMAGES.dashboard : null

  return (
    <article className={`landing-feature-slide landing-feature-slide--${visual} landing-feature-slide--${copy.variant}`} role="group" aria-label={`${String(index + 1).padStart(2, "0")} · ${benefit.title}`}>
      <div className="landing-feature-slide__phone">
        <ProductPhoneMockup referenceImage={referenceImage} imageAlt={`Écran réel BudgetKazPéi — ${benefit.title}`} variant={copy.variant}>
          {visual === "courses" && <CoursesProductScreen />}
          {visual === "aides" && <AidesProductScreen />}
        </ProductPhoneMockup>
      </div>
      <div className="landing-feature-slide__copy">
        <p className="landing-eyebrow">{copy.eyebrow}</p>
        <h3>{benefit.title}</h3>
        <p className="landing-feature-slide__phrase">{copy.phrase}</p>
        {visual === "advisor" && <div className="landing-feature-slide__quote"><span>« Nos courses ont encore augmenté ce mois-ci. Où part l'argent ? »</span><strong>Vous avez dépensé 742 € en courses ce mois-ci, soit 118 € de plus que le mois dernier.</strong><small>Contexte utilisé · Budget · Courses</small></div>}
        <div className="landing-feature-slide__proof">{benefit.points.map(point => <span key={point}>{point}</span>)}</div>
      </div>
    </article>
  )
}
