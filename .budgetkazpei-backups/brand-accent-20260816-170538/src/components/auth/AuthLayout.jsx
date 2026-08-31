import AppLogo from "../AppLogo"
import ThemeToggle from "../ThemeToggle"
import { navigate } from "../../services/authNavigation"
import "../../styles/auth.css"

export default function AuthLayout({
  title,
  subtitle,
  children,
  titleRef,
  sideTitle = "Vos tickets, votre budget, vos démarches.",
  sideText = "Une expérience simple pour retrouver votre espace BudgetKazPei sans rallonger la création du compte.",
}) {
  return (
    <main className="auth-page">
      <div className="auth-shell">
        <section className="auth-side" aria-label="Présentation BudgetKazPei">
          <div className="auth-brand">
            <AppLogo size={52} alt="Logo BudgetKazPei" />
            <span>BudgetKazPei</span>
          </div>
          <div className="auth-side__content">
            <p className="auth-eyebrow">Budget, tickets et démarches</p>
            <h2>{sideTitle}</h2>
            <p>{sideText}</p>
            <div className="auth-proof-list" aria-label="Repères BudgetKazPei">
              <span>Compte sécurisé</span>
              <span>Profil complété plus tard</span>
              <span>Sans carte bancaire pour démarrer</span>
            </div>
          </div>
        </section>

        <section className="auth-panel" aria-labelledby="auth-title">
          <div className="auth-panel__top">
            <button type="button" className="auth-back-link" onClick={() => navigate("/")}>
              Retour accueil
            </button>
            <ThemeToggle compact />
          </div>
          <div className="auth-mobile-brand">
            <AppLogo size={46} alt="Logo BudgetKazPei" />
            <span>BudgetKazPei</span>
          </div>
          <header className="auth-heading">
            <h1 id="auth-title" ref={titleRef} tabIndex={-1}>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </header>
          {children}
        </section>
      </div>
    </main>
  )
}
