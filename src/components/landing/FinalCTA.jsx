import LandingLink from "./LandingLink"

export default function FinalCTA({ isAuthenticated = false }) {
  return (
    <div className="landing-shell final-cta" aria-labelledby="final-cta-title">
      <div>
        <p className="landing-eyebrow">Premier pas</p>
        <h2 id="final-cta-title">Prenez en main votre budget et votre quotidien.</h2>
        <p>Commencez avec les outils essentiels, puis choisissez davantage d'accompagnement seulement lorsque vous en avez besoin.</p>
      </div>
      <div className="final-cta__actions">
        <LandingLink href={isAuthenticated ? "/app" : "/register"} className="landing-link-button landing-link-button--primary">
          {isAuthenticated ? "Accéder à mon tableau de bord" : "Créer mon compte"}
        </LandingLink>
        <a className="landing-link-button landing-link-button--ghost" href="#offres">
          Découvrir les offres
        </a>
      </div>
    </div>
  )
}
