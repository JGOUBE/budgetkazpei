import { ArrowRight, CalendarDays, ChevronRight, LockKeyhole } from "lucide-react"
import ProactiveAdvisorNotice from "../components/conseiller/ProactiveAdvisorNotice"
import { BkIcons } from "../components/icons-budgetkazpei"
import { formatMontant } from "../utils/format"

// Accueil BudgetKazPéi — palette minérale contrastée, sans décor ni relief.
// Les routes Courses réutilisent les onglets existants, sans dupliquer les pages.
const ACTIONS = [
  { id: "shoppingList", fr: "Faire ma liste de courses", kr: "Fé mon liste courses", icon: "shopping", color: "#355B34", pale: "#C8E4AA", edge: "#9DC184" },
  { id: "receipts", fr: "Scanner mon ticket", kr: "Scanner mon tiké", icon: "scan", color: "#235774", pale: "#A9DEED", edge: "#83BFCE" },
  { id: "expense", fr: "Ajouter une dépense", kr: "Azout in dépans", icon: "depenses", color: "#344A56", pale: "#CFD6DD", edge: "#AAB9C3" },
  { id: "aides", fr: "Mes aides et mes droits", kr: "Mon bann èd ek drwa", icon: "aides", color: "#395A87", pale: "#C9D9F0", edge: "#9EB8DC" },
  { id: "conseiller", fr: "Mon conseiller", kr: "Mon konseye", icon: "assistant", color: "#286558", pale: "#CCE8E0", edge: "#9DCFC0" },
  { id: "goodDeals", fr: "Mes bons plans", kr: "Mon bann bon plan", icon: "deals", color: "#3E5030", pale: "#C5CEB8", edge: "#9FAE94" },
]

const COURSES = [
  { tab: "overview", fr: "Aperçu de mes achats", kr: "Koudzyé su mon bann courses", hintFr: "Comprendre mes habitudes", hintKr: "Comprann mon bann labitid", icon: "stats", color: "#47594F", pale: "#DDD9D1", edge: "#C3BDB3" },
  { tab: "savings", fr: "Mes économies", kr: "Mon bann lékonomi", hintFr: "Repérer les opportunités", hintKr: "Trouv bann lokazion", icon: "savings", color: "#4B6332", pale: "#E4E4CE", edge: "#C5C9A9" },
]

function getFirstName(profile, user) {
  const raw = profile?.nom || user?.user_metadata?.name || user?.user_metadata?.full_name || ""
  return String(raw).trim().split(/\s+/)[0] || ""
}

export default function HomePage({
  language = "fr",
  isMobile = false,
  profile,
  user,
  isPremium = false,
  budgetStats = {},
  budgetLoading = false,
  onNavigate,
  onAddExpense,
}) {
  const isKreol = ["cr", "kreol", "kr"].includes(String(language).toLowerCase())
  const name = getFirstName(profile, user)
  const income = Number(budgetStats.revenus) || 0
  const spent = Number(budgetStats.depenses) || 0
  const balance = Number(budgetStats.solde)
  const remaining = Number.isFinite(balance) ? balance : income - spent
  const usage = income > 0 ? Math.round(spent / income * 100) : null
  const progress = usage === null ? 0 : Math.min(100, Math.max(0, usage))
  const openCourses = tab => onNavigate(tab === "savings" ? "shoppingSavingsOnly" : "shoppingOverviewOnly")

  return (
    <main className="bkp-home-2026 bkp-home-matcha" style={{ width: "100%", maxWidth: 1020, margin: "0 auto", padding: isMobile ? "22px 16px 40px" : "30px 20px 50px" }}>
      <header className="bkp-home-intro">
        <div className="bkp-home-overline">
          <span>{isKreol ? "OUT LESPAS" : "VOTRE ESPACE"}</span>
          <span className="bkp-home-rule" aria-hidden="true" />
        </div>
        <h1>{isKreol ? "Byenvini" : "Bonjour"}{name ? " " + name : ""}.</h1>
        <p>{isKreol ? "Out bidzé, tout simplement." : "Votre budget, tout simplement."}</p>
      </header>

      <ProactiveAdvisorNotice userId={user?.id} language={language} enabled={isPremium} onNavigate={onNavigate} />

      <nav className="bkp-home-action-grid" aria-label={isKreol ? "Bann aksyon rapides" : "Accès rapides"}>
        {ACTIONS.map(action => {
          const Icon = BkIcons[action.icon]
          const locked = action.id === "conseiller" && !isPremium
          const handleClick = action.id === "expense"
            ? onAddExpense
            : action.id === "shoppingList"
              ? () => onNavigate("shoppingListOnly")
              : () => onNavigate(action.id)
          return (
            <button
              type="button"
              key={action.id}
              className="bkp-home-action bkp-home-matcha-action"
              aria-label={locked ? (isKreol ? "Mon konseye : réservé Premium" : "Mon conseiller : réservé à Premium") : undefined}
              onClick={handleClick}
              style={{
                "--bkp-home-card": action.pale,
                "--bkp-home-edge": action.edge,
                "--bkp-home-accent": action.color,
                "--bkp-home-soft": action.pale,
              }}
            >
              <Icon className="bkp-home-action-icon" size={25} strokeWidth={1.8} aria-hidden="true" />
              <span className="bkp-home-action-divider" aria-hidden="true" />
              <span className="bkp-home-action-title">{isKreol ? action.kr : action.fr}</span>
              {locked && <LockKeyhole size={16} strokeWidth={1.8} aria-label="Premium" />}
              <ChevronRight className="bkp-home-action-arrow" size={19} strokeWidth={1.9} aria-hidden="true" />
            </button>
          )
        })}
      </nav>

      <section className="bkp-home-month" aria-labelledby="bkp-home-month-title">
        <div className="bkp-home-section-heading bkp-home-month-heading">
          <div className="bkp-home-heading-label">
            <CalendarDays size={21} strokeWidth={1.85} aria-hidden="true" />
            <h2 id="bkp-home-month-title">{isKreol ? "Mon bidzé mwa-la" : "Mon budget du mois"}</h2>
          </div>
          <button type="button" className="bkp-home-month-details" onClick={() => onNavigate("statistics")}>
            {isKreol ? "Détay" : "Détails"} <ArrowRight size={15} aria-hidden="true" />
          </button>
        </div>
        <div className="bkp-home-month-data">
          <div className="bkp-home-month-remaining">
            <span>{isKreol ? "Larzan i reste" : "Reste estimé"}</span>
            <strong className={remaining < 0 && !budgetLoading ? "bkp-home-negative" : ""}>
              {budgetLoading ? "—" : income > 0 ? formatMontant(remaining) : isKreol ? "À renseigne" : "À renseigner"}
            </strong>
          </div>
          <div className="bkp-home-month-progress">
            <p>
              {budgetLoading ? (isKreol ? "Kalkil an cour" : "Calcul en cours")
                : usage === null ? (isKreol ? "Renseigne out revenus" : "Renseignez vos revenus")
                  : <><strong>{usage} %</strong> {isKreol ? "du bidzé utilisé" : "du budget utilisé"}</>}
            </p>
            <div
              className="bkp-home-progress-track"
              role="progressbar"
              aria-label={isKreol ? "Bidzé utilisé" : "Budget utilisé"}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={budgetLoading ? 0 : progress}
            >
              <span style={{ width: String(progress) + "%" }} />
            </div>
          </div>
        </div>
      </section>

      <section className="bkp-home-courses" aria-labelledby="bkp-home-courses-title">
        <div className="bkp-home-overline bkp-home-courses-heading">
          <span className="bkp-home-heading-label">
            <BkIcons.shopping size={23} strokeWidth={1.8} aria-hidden="true" />
            <h2 id="bkp-home-courses-title">{isKreol ? "Mon bann courses" : "Mes courses"}</h2>
          </span>
          <span className="bkp-home-rule" aria-hidden="true" />
        </div>
        <div className="bkp-home-course-grid">
          {COURSES.map(item => {
            const Icon = BkIcons[item.icon]
            return (
              <button
                type="button"
                key={item.tab}
                className="bkp-home-course-link"
                onClick={() => openCourses(item.tab)}
                style={{
                  "--bkp-home-card": item.pale,
                  "--bkp-home-accent": item.color,
                  "--bkp-home-edge": item.edge,
                }}
              >
                <Icon className="bkp-home-course-icon" size={25} strokeWidth={1.75} aria-hidden="true" />
                <span className="bkp-home-course-copy">
                  <strong>{isKreol ? item.kr : item.fr}</strong>
                  <span>{isKreol ? item.hintKr : item.hintFr}</span>
                </span>
                <ChevronRight className="bkp-home-course-arrow" size={20} strokeWidth={1.8} aria-hidden="true" />
              </button>
            )
          })}
        </div>
      </section>
    </main>
  )
}
