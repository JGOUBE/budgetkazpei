import { ArrowUpRight } from "lucide-react"
import { BkIcons } from "../components/icons-budgetkazpei"

// Identité 2026 : couleurs en petites touches, surfaces neutres et aucune décoration de fond.
const ACTIONS = [
  { id: "shoppingList", fr: "Ma liste de courses", kr: "Ma liste courses", subtitle: "Préparer mes achats", icon: "shopping", accent: "#247987", soft: "#E6F3F4" },
  { id: "receipts", fr: "Scanner mon ticket", kr: "Scanner mon tiké", subtitle: "Suivre mes achats", icon: "scan", accent: "#426AA6", soft: "#E9EFF8" },
  { id: "expense", fr: "Ajouter une dépense", kr: "Azout in dépans", subtitle: "Garder le cap", icon: "depenses", accent: "#397C65", soft: "#E7F2EB" },
  { id: "aides", fr: "Mes aides et mes droits", kr: "Mon bann èd ek mon bann drwa", subtitle: "Connaître mes droits", icon: "aides", accent: "#795F8A", soft: "#F1EDF5" },
  { id: "conseiller", fr: "Mon conseiller", kr: "Mon konseye", subtitle: "Trouver des réponses", icon: "assistant", accent: "#4B789D", soft: "#EAF1F7" },
  { id: "goodDeals", fr: "Mes bons plans", kr: "Mon bann bon plan", subtitle: "Acheter plus malin", icon: "deals", accent: "#9A617B", soft: "#F7EDF1" },
]

function firstName(profile, user) {
  const raw = profile?.nom || user?.user_metadata?.name || user?.user_metadata?.full_name || ""
  return String(raw).trim().split(/\s+/)[0] || ""
}

export default function HomePage({ language = "fr", isMobile = false, profile, user, onNavigate, onAddExpense }) {
  const isKreol = language === "cr" || language === "kreol"
  const name = firstName(profile, user)
  return (
    <main className="bkp-home-2026" style={{ width: "100%", maxWidth: 1020, margin: "0 auto", padding: isMobile ? "17px 16px 32px" : "24px 0 46px" }}>
      <header style={{ marginBottom: isMobile ? 26 : 36 }}>
        <p style={{ margin: "0 0 11px", color: "#426AA6", fontSize: 11, fontWeight: 800, letterSpacing: ".11em", textTransform: "uppercase" }}>
          {isKreol ? "Out lespas" : "Votre espace"}
        </p>
        <h1 style={{ margin: 0, color: "#263B42", fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 30 : 39, fontWeight: 750, lineHeight: 1.16, letterSpacing: "-.035em" }}>
          {isKreol ? "Byenvini" : "Bonjour"}{name ? " " + name : ""}.
        </h1>
        <p style={{ margin: "10px 0 0", color: "#65797B", fontSize: isMobile ? 14 : 15, lineHeight: 1.55 }}>
          {isKreol ? "Out bidzé, tout simplement." : "Votre budget, tout simplement."}
        </p>
      </header>

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 15, gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: isMobile ? 17 : 20, fontWeight: 750, letterSpacing: "-.015em", color: "#263B42" }}>
          {isKreol ? "Accès rapides" : "Que souhaitez-vous faire ?"}
        </h2>
      </div>
      <div className="bkp-home-action-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: isMobile ? 11 : 15 }}>
        {ACTIONS.map(item => {
          const Icon = BkIcons[item.icon]
          return (
            <button
              className="bkp-home-action"
              key={item.id}
              type="button"
              onClick={item.id === "expense" ? onAddExpense : () => onNavigate(item.id)}
              style={{
                minWidth: 0,
                minHeight: isMobile ? 145 : 160,
                padding: isMobile ? "17px 15px" : "20px 22px",
                borderRadius: 18,
                border: "1px solid #DEE7E5",
                background: "#FFFFFF",
                "--bkp-home-accent": item.accent,
                "--bkp-home-soft": item.soft,
                color: "#263B42",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 10,
                textAlign: "left",
                fontFamily: "inherit",
                cursor: "pointer",
                boxShadow: "none",
                transition: "background-color .18s ease,border-color .18s ease",
              }}
            >
              <span className="bkp-home-action-icon" style={{ width: 38, height: 38, borderRadius: 11, display: "grid", placeItems: "center", background: item.soft, color: item.accent }}>
                <Icon size={21} strokeWidth={1.9} />
              </span>
              <span style={{ display: "flex", width: "100%", gap: 6, justifyContent: "space-between", alignItems: "flex-end" }}>
                <span style={{ display: "grid", gap: 5, minWidth: 0 }}>
                  <span className="bkp-home-action-title" style={{ color: item.accent, fontSize: isMobile ? 14 : 16, fontWeight: 750, lineHeight: 1.27 }}>
                    {isKreol ? item.kr : item.fr}
                  </span>
                  {!isMobile && <span style={{ color: "#65797B", fontSize: 12 }}>{item.subtitle}</span>}
                </span>
                <ArrowUpRight className="bkp-home-action-arrow" size={18} color={item.accent} style={{ flexShrink: 0 }} />
              </span>
            </button>
          )
        })}
      </div>
    </main>
  )
}
