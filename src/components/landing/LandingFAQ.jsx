import { useState } from "react"
import { faqs } from "./landingContent"

export default function LandingFAQ() {
  const [openIndex, setOpenIndex] = useState(0)

  return (
    <section className="landing-section landing-section--soft" id="faq" aria-labelledby="faq-title">
      <div className="landing-shell landing-shell--narrow">
        <div className="landing-section-heading">
          <p className="landing-eyebrow">FAQ</p>
          <h2 id="faq-title">Questions fréquentes</h2>
        </div>

        <div className="landing-faq">
          {faqs.map(([question, answer], index) => {
            const isOpen = openIndex === index
            const panelId = `landing-faq-panel-${index}`
            const buttonId = `landing-faq-button-${index}`

            return (
              <div className="landing-faq__item" key={question}>
                <button
                  id={buttonId}
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => setOpenIndex(isOpen ? -1 : index)}
                >
                  <span>{question}</span>
                  <strong aria-hidden="true">{isOpen ? "−" : "+"}</strong>
                </button>
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  hidden={!isOpen}
                >
                  <p>{answer}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
