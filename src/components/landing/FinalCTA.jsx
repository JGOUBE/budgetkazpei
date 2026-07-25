import { getLandingContent } from "./landingContent"
import LandingLink from "./LandingLink"

export default function FinalCTA({ isAuthenticated = false, content }) {
  const copy = content || getLandingContent("fr").finalCta

  return (
    <div className="landing-shell final-cta" aria-labelledby="final-cta-title">
      <div>
        <p className="landing-eyebrow">{copy.eyebrow}</p>
        <h2 id="final-cta-title">{copy.title}</h2>
        <p>{copy.text}</p>
      </div>

      <div className="final-cta__actions">
        <LandingLink
          href={isAuthenticated ? "/app" : "/register"}
          className="landing-link-button landing-link-button--primary"
        >
          {isAuthenticated ? copy.primaryAuthenticated : copy.primaryGuest}
        </LandingLink>

        <a
          className="landing-link-button landing-link-button--ghost"
          href="#offres"
        >
          {copy.secondary}
        </a>
      </div>
    </div>
  )
}
