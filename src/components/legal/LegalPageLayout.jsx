import { createColorAliases } from "../../styles/designSystem"
import "../../styles/legal.css"

const COLORS = createColorAliases()

const LEGAL_LINKS = [
  { href: "/privacy", label: "Confidentialité" },
  { href: "/mentions-legales", label: "Mentions légales" },
  { href: "/terms", label: "Conditions d’utilisation" },
]

export function LegalSection({ id, eyebrow, title, children }) {
  return (
    <section className="legal-section" id={id}>
      {eyebrow && <p className="legal-section__eyebrow">{eyebrow}</p>}
      <h2>{title}</h2>
      <div className="legal-section__content">{children}</div>
    </section>
  )
}

export function LegalCallout({ tone = "info", children }) {
  return <div className={`legal-callout legal-callout--${tone}`}>{children}</div>
}

export default function LegalPageLayout({ currentPath, title, updatedAt, intro, children }) {
  return (
    <main
      className="legal-page"
      style={{
        "--legal-bg": COLORS.bg,
        "--legal-card": COLORS.card,
        "--legal-card-light": COLORS.cardLight,
        "--legal-border": COLORS.border,
        "--legal-text": COLORS.text,
        "--legal-muted": COLORS.muted,
        "--legal-accent": COLORS.cyan,
        "--legal-warning": COLORS.yellow,
      }}
    >
      <div className="legal-page__shell">
        <header className="legal-header">
          <a className="legal-header__back" href="/">← Retour à BudgetKazPéi</a>
          <nav className="legal-header__nav" aria-label="Informations légales">
            {LEGAL_LINKS.map(link => (
              <a
                key={link.href}
                href={link.href}
                aria-current={currentPath === link.href ? "page" : undefined}
              >
                {link.label}
              </a>
            ))}
          </nav>
        </header>

        <article className="legal-document">
          <div className="legal-document__heading">
            <p className="legal-document__kicker">BudgetKazPéi · Informations légales</p>
            <h1>{title}</h1>
            {intro && <p className="legal-document__intro">{intro}</p>}
            <p className="legal-document__date">Dernière mise à jour : {updatedAt}</p>
          </div>
          <div className="legal-document__sections">{children}</div>
        </article>
      </div>
    </main>
  )
}
