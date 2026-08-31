import { BkIcons } from "../icons-budgetkazpei"

function BudgetFragment({ data }) {
  return (
    <figure
      className="pillar-fragment pillar-fragment--budget-screenshot-v2"
      aria-label={data?.ariaLabel || data?.title || "Répartition des dépenses"}
    >
      <img
        src="/landing-reference/budget-spending-details-v2.jpg"
        alt=""
        draggable="false"
      />
    </figure>
  )
}

function CoursesFragment({ data }) {
  return (
    <div className="pillar-fragment pillar-fragment--courses" aria-hidden="true">
      <div className="pillar-fragment__ticket-head"><BkIcons.receipts size={15} /><span>{data.ticketLabel}</span><b>{data.ticketValue}</b></div>
      <div className="pillar-fragment__ticket-line" />
      <div className="pillar-fragment__list-head"><strong>{data.listTitle}</strong><span>{data.listItems.length} {data.itemCountSuffix}</span></div>
      {data.listItems.slice(0, 3).map(item => <div className="pillar-fragment__list-row" key={item}><i />{item}<small>{data.itemStatus}</small></div>)}
      <div className="pillar-fragment__share"><BkIcons.list size={13} />{data.share}</div>
      <small className="pillar-fragment__share-meta">{data.shareMeta}</small>
    </div>
  )
}

function AidesFragment({ data }) {
  return (
    <div className="pillar-fragment pillar-fragment--aides" aria-hidden="true">
      <div className="pillar-fragment__steps">
        {data.steps.map((step, index) => <span className={index === data.activeStep ? "is-active" : ""} key={step}><i>{index + 1}</i><b>{step}</b></span>)}
      </div>
      <div className="pillar-fragment__step-line"><span /></div>
      <div className="pillar-fragment__next"><span>{data.nextLabel}</span><strong>{data.next}</strong><small>{data.nextMeta}</small></div>
    </div>
  )
}

function ProductFragment({ visual, data }) {
  if (visual === "courses") return <CoursesFragment data={data} />
  if (visual === "aides") return <AidesFragment data={data} />
  return <BudgetFragment data={data} />
}

export default function LandingPillar({ benefit, index }) {
  const visual = benefit.visual || "budget"
  const data = benefit.fragment

  return (
    <article className={`landing-feature-slide landing-feature-slide--${visual}`} role="group" aria-label={benefit.title}>
      <div className="landing-feature-slide__visual-wrap">
        <ProductFragment visual={visual} data={data} />
      </div>
      <div className="landing-feature-slide__copy">
        <p className="landing-eyebrow">{benefit.eyebrow || benefit.title}</p>
        <h3>{benefit.title}</h3>
        <p className="landing-feature-slide__phrase">{benefit.answer}</p>
        {!!benefit.points?.length && (
          <div className="landing-feature-slide__proof">
            {benefit.points.map(point => <span key={point}>{point}</span>)}
          </div>
        )}
      </div>
    </article>
  )
}
