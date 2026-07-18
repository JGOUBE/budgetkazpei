import { BkIcons } from "../icons-budgetkazpei"
import { scanSteps } from "./landingContent"

const icons = [BkIcons.receipts, BkIcons.scan, BkIcons.list, BkIcons.dashboard]

export default function ScanJourney() {
  return (
    <section className="landing-section landing-section--soft" id="demo-scanner" aria-labelledby="scanner-title">
      <div className="landing-shell">
        <div className="landing-section-heading">
          <p className="landing-eyebrow">Démonstration scanner</p>
          <h2 id="scanner-title">Photographiez un ticket. BudgetKazPei prépare le reste.</h2>
          <p>
            L'application lit les articles, le total et la date quand c'est possible. Vous gardez toujours
            la main pour vérifier, corriger ou compléter avant d'ajouter la dépense à votre budget.
          </p>
        </div>

        <div className="scan-journey">
          {scanSteps.map((step, index) => {
            const Icon = icons[index]
            return (
              <article className="scan-step" key={step.title}>
                <div className="scan-step__icon" aria-hidden="true">
                  <Icon size={24} />
                </div>
                <span>{step.badge}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </article>
            )
          })}
        </div>

        <div className="scanner-note">
          <strong>Fiabilité honnête :</strong> si une photo est trop difficile à lire, BudgetKazPei vous
          demande de la reprendre ou de corriger les informations. Import d'image, ticket long en deux photos
          et saisie manuelle restent prévus dans le parcours.
        </div>
      </div>
    </section>
  )
}
