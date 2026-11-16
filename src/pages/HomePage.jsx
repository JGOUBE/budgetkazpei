import { ArrowRight } from "lucide-react"
import { BkIcons } from "../components/icons-budgetkazpei"

const ACTIONS = [
  { id: "shoppingList", fr: "Mes courses", kr: "Mon bann courses", detailFr: "Listes et comparaisons", detailKr: "List ek konparézon", icon: "shopping", tone: "lagoon" },
  { id: "receipts", fr: "Scanner un ticket", kr: "Scanner in tiké", detailFr: "Enregistrer mes achats", detailKr: "Anrezistr mon bann acha", icon: "scan", tone: "ocean" },
  { id: "expense", fr: "Ajouter une dépense", kr: "Azout in dépans", detailFr: "Suivre mon quotidien", detailKr: "Suiv mon kotidien", icon: "depenses", tone: "sage" },
  { id: "aides", fr: "Mes aides et mes droits", kr: "Mon bann èd ek drwa", detailFr: "Découvrir mes droits", detailKr: "Dékouv mon bann drwa", icon: "aides", tone: "lavender" },
  { id: "conseiller", fr: "Mon conseiller", kr: "Mon konseye", detailFr: "Des conseils à mon rythme", detailKr: "Bann konsèy pou mwin", icon: "assistant", tone: "sky" },
  { id: "goodDeals", fr: "Les bons plans", kr: "Bann bon plan", detailFr: "Les offres utiles près de moi", detailKr: "Bann bon plan dann mon kartié", icon: "deals", tone: "teal" },
]

function firstName(profile, user) {
  const raw = profile?.nom || user?.user_metadata?.name || user?.user_metadata?.full_name || ""
  return String(raw).trim().split(/\s+/)[0] || ""
}

export default function HomePage({ language = "fr", profile, user, onNavigate, onAddExpense }) {
  const isKreol = language === "cr" || language === "kreol"
  const name = firstName(profile, user)

  return (
    <main className="bkp-2026-home">
      <header className="bkp-2026-home-intro">
        <p className="bkp-2026-eyebrow">{isKreol ? "MON LESPAS" : "MON ESPACE"}</p>
        <h1>{isKreol ? "Byenvini" : "Bonjour"}{name ? ` ${name}` : ""}<span className="bkp-2026-punctuation">.</span></h1>
        <p>{isKreol ? "Mon bidjé, mon bann courses, tout ansanm." : "Votre budget, vos courses et vos économies. Tout au même endroit."}</p>
      </header>

      <section className="bkp-2026-home-actions" aria-label={isKreol ? "Mon bann servis" : "Mes services"}>
        <div className="bkp-2026-section-heading">
          <div>
            <p className="bkp-2026-eyebrow">{isKreol ? "LEZESSANSYÈL" : "L’ESSENTIEL"}</p>
            <h2>{isKreol ? "Kosa ou vé fé zordi ?" : "Que souhaitez-vous faire ?"}</h2>
          </div>
        </div>

        <div className="bkp-2026-action-grid">
          {ACTIONS.map(item => {
            const Icon = BkIcons[item.icon]
            return (
              <button
                className={`bkp-2026-action bkp-2026-tone-${item.tone}`}
                key={item.id}
                type="button"
                onClick={item.id === "expense" ? onAddExpense : () => onNavigate(item.id)}
              >
                <span className="bkp-2026-action-icon"><Icon size={24} strokeWidth={1.8} aria-hidden="true" /></span>
                <span className="bkp-2026-action-copy">
                  <strong>{isKreol ? item.kr : item.fr}</strong>
                  <small>{isKreol ? item.detailKr : item.detailFr}</small>
                </span>
                <ArrowRight className="bkp-2026-action-arrow" size={18} strokeWidth={1.8} aria-hidden="true" />
              </button>
            )
          })}
        </div>
      </section>
    </main>
  )
}
