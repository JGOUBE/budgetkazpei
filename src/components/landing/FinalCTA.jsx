import { getLandingContent } from "./landingContent"
import LandingLink from "./LandingLink"

export default function FinalCTA({ isAuthenticated = false, content }) {
  const copy = content || getLandingContent("fr").finalCta

  return (
    <section className="landing-shell final-cta" aria-labelledby="final-cta-title">
      <div>
        <p className="landing-eyebrow">{copy.eyebrow}</p>
        <h2 id="final-cta-title">{copy.title}</h2>
        <p>{copy.text}</p>
        <div className="final-cta__proof">
          <span className="final-cta__language"><img src="/icons-creole/drapeau-reunionnais.png" alt="" />{copy.languageLine}</span>
          <strong>{copy.freeLabel}</strong>
        </div>
      </div>

      <div className="final-cta__actions">
        <LandingLink
          href={isAuthenticated ? "/app" : "/register"}
          className="landing-link-button landing-link-button--primary"
        >
          {isAuthenticated ? copy.primaryAuthenticated : copy.primaryGuest}
        </LandingLink>

        <LandingLink
          href="/decouvrir"
          className="landing-link-button landing-link-button--ghost"
        >
          {copy.secondary}
        </LandingLink>
      </div>
    </section>
  )
}
