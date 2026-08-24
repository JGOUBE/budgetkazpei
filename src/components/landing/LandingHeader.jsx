import { useEffect, useRef, useState } from "react"
import AppLogo from "../AppLogo"
import { getLandingContent } from "./landingContent"
import LandingLink from "./LandingLink"

export default function LandingHeader({
  isAuthenticated = false,
  language = "fr",
  onToggleLanguage,
  content,
  navItems,
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuButtonRef = useRef(null)
  const closeButtonRef = useRef(null)
  const fallback = getLandingContent(language)
  const copy = content || fallback.header
  const navigationItems = navItems || fallback.navItems
  const primaryHref = isAuthenticated ? "/app" : "/register"
  const primaryLabel = isAuthenticated ? copy.dashboard : copy.register

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

  function handleLanguageToggle() {
    onToggleLanguage?.()
  }

  return (
    <header className="landing-header">
      <a className="landing-skip-link" href="#contenu">
        {copy.skipLink}
      </a>

      <div className="landing-shell landing-header__inner">
        <LandingLink
          href="/"
          className="landing-brand"
          aria-label={copy.homeAriaLabel}
        >
          <AppLogo size={46} alt={copy.logoAlt} />
          <span>BudgetKazPéi</span>
        </LandingLink>

        <nav className="landing-nav" aria-label={copy.mainNavigationAriaLabel}>
          {navigationItems.map(item => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>

        <div className="landing-header__actions">
          <button
            type="button"
            className="landing-language-button"
            onClick={handleLanguageToggle}
            aria-label={copy.languageAriaLabel}
          >
            {copy.languageButton}
          </button>

          {!isAuthenticated && (
            <LandingLink
              href="/login"
              className="landing-link-button landing-link-button--ghost"
            >
              {copy.login}
            </LandingLink>
          )}

          <LandingLink
            href={primaryHref}
            className="landing-link-button landing-link-button--primary"
          >
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
          {copy.menu}
        </button>
      </div>

      {isMenuOpen && (
        <div className="landing-mobile-menu" id="landing-mobile-menu">
          <div
            className="landing-mobile-menu__panel"
            role="dialog"
            aria-modal="true"
            aria-label={copy.menuDialogAriaLabel}
          >
            <div className="landing-mobile-menu__top">
              <span>BudgetKazPéi</span>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => closeMenu(true)}
              >
                {copy.close}
              </button>
            </div>

            <div className="landing-mobile-menu__settings">
              <button
                type="button"
                className="landing-language-button"
                onClick={handleLanguageToggle}
                aria-label={copy.languageAriaLabel}
              >
                {copy.languageButton}
              </button>
            </div>

            <nav aria-label={copy.mobileNavigationAriaLabel}>
              {navigationItems.map(item => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => closeMenu()}
                >
                  {item.label}
                </a>
              ))}

              {!isAuthenticated && (
                <LandingLink href="/login" onNavigate={() => closeMenu()}>
                  {copy.login}
                </LandingLink>
              )}

              <LandingLink
                href={primaryHref}
                className="landing-link-button landing-link-button--primary"
                onNavigate={() => closeMenu()}
              >
                {primaryLabel}
              </LandingLink>
            </nav>
          </div>

          <button
            type="button"
            className="landing-mobile-menu__backdrop"
            aria-label={copy.closeMenuAriaLabel}
            onClick={() => closeMenu(true)}
          />
        </div>
      )}
    </header>
  )
}
