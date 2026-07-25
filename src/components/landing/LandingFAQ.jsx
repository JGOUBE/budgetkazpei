import { useState } from "react"
import { getLandingContent } from "./landingContent"

export default function LandingFAQ({ content }) {
  const [openIndex, setOpenIndex] = useState(0)
  const copy = content || getLandingContent("fr").faq

  return (
    <div className="landing-shell landing-shell--narrow" id="faq">
      <div className="landing-section-heading">
        <p className="landing-eyebrow">{copy.eyebrow}</p>
        <h2 id="faq-title">{copy.title}</h2>
      </div>

      <div className="landing-faq">
        {copy.items.map(([question, answer], index) => {
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
  )
}
