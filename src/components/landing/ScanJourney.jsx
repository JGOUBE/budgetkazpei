import { useEffect, useState } from "react"
import { getLandingContent } from "./landingContent"

export default function ScanJourney({ content }) {
  const copy = content || getLandingContent("fr").productDemo
  const [activeTab, setActiveTab] = useState(copy.tabs[0].id)
  const active = copy.tabs.find(tab => tab.id === activeTab) || copy.tabs[0]

  useEffect(() => {
    if (!copy.tabs.some(tab => tab.id === activeTab)) {
      setActiveTab(copy.tabs[0].id)
    }
  }, [activeTab, copy.tabs])

  return (
    <section
      className="landing-section landing-section--soft"
      id="demo-produit"
      aria-labelledby="product-demo-title"
    >
      <div className="landing-shell">
        <div className="landing-section-heading">
          <p className="landing-eyebrow">{copy.eyebrow}</p>
          <h2 id="product-demo-title">{copy.title}</h2>
          <p>{copy.intro}</p>
        </div>

        <div className="product-demo">
          <div
            className="product-demo__tabs"
            role="tablist"
            aria-label={copy.tabsAriaLabel}
          >
            {copy.tabs.map(tab => {
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
              {active.note && (
                <p className="product-demo__note">{active.note}</p>
              )}
            </div>

            {active.flow ? (
              <ol className="product-demo__flow">
                {active.flow.map(item => (
                  <li key={item}>{item}</li>
                ))}
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
