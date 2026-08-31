import AppLogo from "../AppLogo"
import { BkIcons } from "../icons-budgetkazpei"

function AppChrome({ title, action = "+", eyebrow }) {
  return (
    <>
      <div className="product-screen-chrome__status"><span>13:11</span><span>◒ ◇ 87 %</span></div>
      <div className="product-screen-chrome__header">
        <span className="product-screen-chrome__menu" aria-hidden="true">☰</span>
        <div className="product-screen-chrome__brand"><AppLogo size={22} alt="" /><strong>BudgetKazPéi</strong></div>
        <span className="product-screen-chrome__action">{action}</span>
      </div>
      <div className="product-screen-chrome__title">
        {eyebrow && <small>{eyebrow}</small>}
        <strong>{title}</strong>
      </div>
    </>
  )
}

export function CoursesProductScreen() {
  return (
    <div className="product-app-screen product-app-screen--courses" aria-label="Aperçu réel de Mes courses">
      <AppChrome title="Mes courses" eyebrow="Votre espace courses" />
      <div className="product-courses-ticket">
        <div><span>Dernier ticket</span><strong>186,40 €</strong></div>
        <span className="product-screen-pill product-screen-pill--green">Ticket validé</span>
        <small>8 articles reconnus · aujourd'hui</small>
      </div>
      <div className="product-courses-summary"><span>Courses du mois</span><strong>742 €</strong><small>Tickets alimentaires validés</small></div>
      <div className="product-courses-list">
        <div className="product-app-screen__row-heading"><strong>Ma liste de courses</strong><span>5 articles</span></div>
        {["Riz", "Lait", "Yaourts"].map(item => <div className="product-app-screen__row" key={item}><i aria-hidden="true" /><span>{item}</span><small>À prévoir</small></div>)}
        <div className="product-courses-share"><BkIcons.list size={13} /> Partager la liste ↗</div>
        <small className="product-courses-share-meta">WhatsApp · Messages · autres applications</small>
      </div>
    </div>
  )
}

export function AidesProductScreen() {
  return (
    <div className="product-app-screen product-app-screen--aides" aria-label="Aperçu réel de Mes aides et démarches">
      <AppChrome title="Mes aides" eyebrow="Aides & démarches" action="+" />
      <div className="product-aides-hero"><div className="product-aides-hero__icon"><BkIcons.aides size={17} /></div><div><strong>Aides possibles</strong><small>Selon votre situation</small></div></div>
      <div className="product-aide-card product-aide-card--active"><div><span className="product-screen-pill product-screen-pill--peach">À vérifier</span><strong>Sport des enfants</strong><small>Une aide possible à regarder</small></div><b>›</b></div>
      <div className="product-aide-card"><div><span className="product-screen-pill product-screen-pill--blue">Documents</span><strong>Préparer votre dossier</strong><small>Pièces utiles à réunir</small></div><b>›</b></div>
      <div className="product-aides-next"><span>Prochaine action</span><strong>Vérifier les conditions</strong><small>BudgetKazPéi vous aide à préparer, l'organisme décide.</small></div>
    </div>
  )
}

export default function ProductPhoneMockup({
  referenceImage,
  imageAlt = "",
  variant = "left",
  className = "",
  children,
}) {
  const hasReference = Boolean(referenceImage)

  return (
    <div className={`product-phone product-phone--${variant} ${hasReference ? "product-phone--reference" : "product-phone--custom"} ${className}`.trim()}>
      <div className="product-phone__floor-shadow" aria-hidden="true" />
      <div className="product-phone__body">
        <div className="product-phone__back" aria-hidden="true">
          <span className="product-phone__back-glow" />
        </div>

        <div className="product-phone__side product-phone__side--left" aria-hidden="true" />
        <div className="product-phone__side product-phone__side--right" aria-hidden="true" />
        <div className="product-phone__side product-phone__side--top" aria-hidden="true" />
        <div className="product-phone__side product-phone__side--bottom" aria-hidden="true" />

        <span className="product-phone__button product-phone__button--volume" aria-hidden="true" />
        <span className="product-phone__button product-phone__button--power" aria-hidden="true" />

        <div className="product-phone__front">
          <div className="product-phone__bezel">
            <div className="product-phone__screen">
              {hasReference ? <img src={referenceImage} alt={imageAlt} className="product-phone__reference" /> : children}
              <span className="product-phone__glass" aria-hidden="true" />
            </div>
          </div>
          <span className="product-phone__speaker" aria-hidden="true" />
          <span className="product-phone__camera" aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}
