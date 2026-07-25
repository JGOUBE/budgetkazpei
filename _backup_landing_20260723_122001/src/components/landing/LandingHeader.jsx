import { useEffect, useRef, useState } from "react"
import AppLogo from "../AppLogo"
import ThemeToggle from "../ThemeToggle"
import { navItems } from "./landingContent"
import LandingLink from "./LandingLink"

export default function LandingHeader({ isAuthenticated = false }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuButtonRef = useRef(null)
  const closeButtonRef = useRef(null)
  const primaryHref = isAuthenticated ? "/app" : "/register"
  const primaryLabel = isAuthenticated ? "Accéder à mon tableau de bord" : "Créer mon compte"

  useEffect(() => {
    if (!isMenuOpen) return undefined

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        closeMenu(true)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    closeButtonRef.current?.focus()
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isMenuOpen])

  function closeMenu(restoreFocus = false) {
    setIsMenuOpen(false)
    if (restoreFocus) {
      requestAnimationFrame(() => menuButtonRef.current?.focus())
    }
  }

  return (
    <header className="landing-header">
      <a className="landing-skip-link" href="#contenu">Aller au contenu</a>
      <div className="landing-shell landing-header__inner">
        <LandingLink href="/" className="landing-brand" aria-label="BudgetKazPei accueil">
          <AppLogo size={46} alt="Logo BudgetKazPei" />
          <span>BudgetKazPei</span>
        </LandingLink>

        <nav className="landing-nav" aria-label="Navigation principale">
          {navItems.map(item => (
            <a key={item.href} href={item.href}>{item.label}</a>
          ))}
        </nav>

        <div className="landing-header__actions">
          <ThemeToggle compact />
          {!isAuthenticated && (
            <LandingLink href="/login" className="landing-link-button landing-link-button--ghost">
              Connexion
            </LandingLink>
          )}
          <LandingLink href={primaryHref} className="landing-link-button landing-link-button--primary">
            {primaryLabel}
          </LandingLink>
        </div>

        <button
          ref={menuButtonRef}
          type="button"
          className="landing-menu-button"
          aria-expanded={isMenuOpen}
          aria-controls="landing-mobile-menu"
          onClick={() => setIsMenuOpen(true)}
        >
          Menu
        </button>
      </div>

      {isMenuOpen && (
        <div className="landing-mobile-menu" id="landing-mobile-menu">
          <div className="landing-mobile-menu__panel" role="dialog" aria-modal="true" aria-label="Menu BudgetKazPei">
            <div className="landing-mobile-menu__top">
              <span>BudgetKazPei</span>
              <button ref={closeButtonRef} type="button" onClick={() => closeMenu(true)}>
                Fermer
              </button>
            </div>
            <nav aria-label="Navigation mobile">
              {navItems.map(item => (
                <a key={item.href} href={item.href} onClick={() => closeMenu()}>{item.label}</a>
              ))}
              {!isAuthenticated && (
                <LandingLink href="/login" onNavigate={() => closeMenu()}>
                  Connexion
                </LandingLink>
              )}
              <LandingLink href={primaryHref} className="landing-link-button landing-link-button--primary" onNavigate={() => closeMenu()}>
                {primaryLabel}
              </LandingLink>
            </nav>
          </div>
          <button type="button" className="landing-mobile-menu__backdrop" aria-label="Fermer le menu" onClick={() => closeMenu(true)} />
        </div>
      )}
    </header>
  )
}
