import { BkIcons } from "../icons-budgetkazpei"
import { LANDING_DEMO_DATA } from "./landingContent"

function BudgetVisual() {
  return (
    <div className="pillar-visual pillar-visual--budget" aria-hidden="true">
      <div className="pillar-visual__score"><strong>{LANDING_DEMO_DATA.score}</strong><span>/ 100</span><em>Correct</em></div>
      <div className="pillar-visual__track"><span /></div>
      <div className="pillar-visual__bars"><i /><i /><i /><i /><i /><i /></div>
    </div>
  )
}

function CoursesVisual() {
  return (
    <div className="pillar-visual pillar-visual--courses" aria-hidden="true">
      <div className="pillar-visual__course-columns">
        <div className="pillar-visual__receipt"><div className="pillar-visual__receipt-head"><BkIcons.receipts size={15} /><span>Ticket vérifié</span><b>{LANDING_DEMO_DATA.latestTicket}</b></div><div className="pillar-visual__receipt-row"><span>Articles reconnus</span><b>8</b></div><div className="pillar-visual__receipt-line" /><div className="pillar-visual__receipt-total"><span>Courses du mois</span><strong>{LANDING_DEMO_DATA.groceries}</strong></div></div>
        <div className="pillar-visual__list"><strong>Ma liste</strong>{LANDING_DEMO_DATA.listItems.slice(0, 3).map(item => <span key={item}><i />{item}</span>)}<b>Partager la liste ↗</b></div>
      </div>
    </div>
  )
}

function AidesVisual() {
  return (
    <div className="pillar-visual pillar-visual--aides" aria-hidden="true">
      <div className="pillar-visual__steps">
        <span className="is-active"><i>1</i><b>À vérifier</b></span>
        <span><i>2</i><b>Documents</b></span>
        <span><i>3</i><b>Prochaine action</b></span>
      </div>
      <div className="pillar-visual__step-line"><span /></div>
      <p>Un parcours plus lisible, sans remplacer l'organisme officiel.</p>
    </div>
  )
}

function AdvisorVisual() {
  return (
    <div className="pillar-visual pillar-visual--advisor" aria-hidden="true">
      <div className="pillar-visual__bubble pillar-visual__bubble--user">Où part mon argent ?</div>
      <div className="pillar-visual__bubble pillar-visual__bubble--assistant">Je regarde votre budget.</div>
      <div className="pillar-visual__context"><span>Budget</span><span>Courses</span><span>Aides</span></div>
    </div>
  )
}

const VISUALS = { budget: BudgetVisual, courses: CoursesVisual, aides: AidesVisual, advisor: AdvisorVisual }

export default function LandingPillar({ benefit, index }) {
  const Icon = BkIcons[benefit.icon] || BkIcons.check
  const Visual = VISUALS[benefit.visual] || BudgetVisual

  return (
    <article className={`landing-pillar landing-pillar--${benefit.visual} landing-pillar--index-${index}`} role="group" aria-label={`${String(index + 1).padStart(2, "0")} · ${benefit.title}`}>
      <div className="landing-pillar__header">
        <span className="landing-pillar__icon" aria-hidden="true"><Icon size={19} /></span>
        <span className="landing-pillar__kicker">{String(index + 1).padStart(2, "0")}</span>
      </div>
      <h3>{benefit.title}</h3>
      <p>{benefit.answer}</p>
      <Visual />
      <div className="landing-pillar__signals" aria-label={benefit.title}>
        {benefit.points.map(point => <span key={point}>{point}</span>)}
      </div>
    </article>
  )
}
