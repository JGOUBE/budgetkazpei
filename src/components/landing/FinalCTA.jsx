import LandingLink from "./LandingLink"

export default function FinalCTA({ isAuthenticated = false }) {
  return (
    <section className="final-cta" aria-labelledby="final-cta-title">
      <div className="landing-shell final-cta__inner">
        <div>
          <p className="landing-eyebrow">Premier pas</p>
          <h2 id="final-cta-title">Commencez par votre prochain ticket.</h2>
          <p>Ajoutez une dépense, scannez vos courses et laissez BudgetKazPei vous aider à y voir plus clair.</p>
        </div>
        <div className="final-cta__actions">
          <LandingLink href={isAuthenticated ? "/app" : "/register"} className="landing-link-button landing-link-button--primary">
            {isAuthenticated ? "Accéder à mon tableau de bord" : "Essayer gratuitement"}
          </LandingLink>
          <span>Commencez gratuitement, sans carte bancaire.</span>
        </div>
      </div>
    </section>
  )
}
