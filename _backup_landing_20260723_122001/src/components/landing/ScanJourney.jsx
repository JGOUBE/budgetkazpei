import { useState } from "react"
import { productTabs } from "./landingContent"

export default function ScanJourney() {
  const [activeTab, setActiveTab] = useState(productTabs[0].id)
  const active = productTabs.find(tab => tab.id === activeTab) || productTabs[0]

  return (
    <section className="landing-section landing-section--soft" id="demo-produit" aria-labelledby="product-demo-title">
      <div className="landing-shell">
        <div className="landing-section-heading">
          <p className="landing-eyebrow">Demonstration compacte</p>
          <h2 id="product-demo-title">Trois parcours, une même application.</h2>
          <p>
            BudgetKazPei relie le budget, les courses et les démarches dans une lecture simple du quotidien.
          </p>
        </div>

        <div className="product-demo">
          <div className="product-demo__tabs" role="tablist" aria-label="Parcours BudgetKazPei">
            {productTabs.map(tab => {
              const selected = tab.id === active.id
              return (
                <button
                  key={tab.id}
                  id={`product-tab-${tab.id}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`product-panel-${tab.id}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>

          <article
            className="product-demo__panel"
            id={`product-panel-${active.id}`}
            role="tabpanel"
            aria-labelledby={`product-tab-${active.id}`}
          >
            <div>
              <h3>{active.title}</h3>
              <p>{active.intro}</p>
              {active.note && <p className="product-demo__note">{active.note}</p>}
            </div>

            {active.flow ? (
              <ol className="product-demo__flow">
                {active.flow.map(item => <li key={item}>{item}</li>)}
              </ol>
            ) : (
              <div className="product-demo__metrics">
                {active.metrics.map(([label, value]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            )}
          </article>
        </div>
      </div>
    </section>
  )
}
