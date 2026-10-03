import { ArrowRight } from "lucide-react"
import { BkIcons } from "../components/icons-budgetkazpei"
import { useTheme } from "../styles/ThemeProvider"

const ACTIONS = [
  { id: "shoppingList", fr: "Ma liste de courses", kr: "Ma liste courses", icon: "shopping", light: ["#fff6ed", "#ffd9b6"], dark: ["#4b2918", "#1c2538"], accent: "#ff6a16" },
  { id: "receipts", fr: "Scanner mon ticket", kr: "Scanner mon tiké", icon: "scan", light: ["#eef7ff", "#bcdcff"], dark: ["#082c62", "#101f3d"], accent: "#1479ff" },
  { id: "expense", fr: "Ajouter une dépense", kr: "Azout in dépans", icon: "depenses", light: ["#effff3", "#bcefc9"], dark: ["#073c2c", "#10293a"], accent: "#18a84c" },
  { id: "aides", fr: "Mes aides et mes droits", kr: "Mon bann èd ek mon bann drwa", icon: "aides", light: ["#f7f0ff", "#dbc7ff"], dark: ["#35107b", "#171d3c"], accent: "#7128ff" },
  { id: "conseiller", fr: "Mon conseiller", kr: "Mon konseye", icon: "assistant", light: ["#f8efff", "#d9f4ff"], dark: ["#251d59", "#083a55"], accent: "#00a8d6" },
  { id: "goodDeals", fr: "Les bons plans !", kr: "Bann bon plan !", icon: "deals", light: ["#fff9e8", "#ffe7a8"], dark: ["#4a3510", "#24283b"], accent: "#e5a100" },
]

function firstName(profile, user) {
  const raw = profile?.nom || user?.user_metadata?.name || user?.user_metadata?.full_name || ""
  return String(raw).trim().split(/\s+/)[0] || ""
}

export default function HomePage({ language = "fr", isMobile = false, profile, user, onNavigate, onAddExpense }) {
  const { themeName } = useTheme()
  const dark = themeName === "dark"
  const isKreol = language === "cr" || language === "kreol"
  const name = firstName(profile, user)

  return (
    <main className="bkp-home-reunion-watermark" style={{ width: "100%", maxWidth: 940, margin: "0 auto", padding: isMobile ? "34px 0 22px" : "22px 0 48px" }}>
      <h1 style={{
        margin: isMobile ? "6px 2px 30px" : "8px 2px 30px",
        color: dark ? "#f8fbff" : "#101f4f",
        fontFamily: "'DM Serif Display', serif",
        fontSize: isMobile ? 31 : 38,
        lineHeight: 1.05,
        fontWeight: 400,
      }}>
        {isKreol ? "Byenvini" : "Bienvenue"}{name ? ` ${name} !` : " !"}
      </h1>

      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(2, minmax(0, 1fr))",
        gap: isMobile ? 14 : 20,
      }}>
        {ACTIONS.map((item, index) => {
          const Icon = BkIcons[item.icon]
          const full = index >= ACTIONS.length - 2
          const gradient = dark ? item.dark : item.light
          return (
            <button
              key={item.id}
              type="button"
              onClick={item.id === "expense" ? onAddExpense : () => onNavigate(item.id)}
              style={{
                gridColumn: full ? "1 / -1" : "auto",
                minHeight: full ? (isMobile ? 94 : 112) : (isMobile ? 158 : 176),
                padding: full ? (isMobile ? "14px 16px" : "18px 20px") : (isMobile ? "18px 12px" : "24px 20px"),
                borderRadius: 24,
                border: `1px solid ${dark ? item.accent + "88" : item.accent + "66"}`,
                background: `linear-gradient(145deg, ${gradient[0]}, ${gradient[1]})`,
                color: dark ? "#fff" : "#10204f",
                boxShadow: dark
                  ? `inset 2px 2px 0 rgba(255,255,255,.16), inset -5px -7px 14px rgba(0,0,0,.25), 0 10px 18px rgba(0,0,0,.34), 0 0 18px ${item.accent}28`
                  : `inset 2px 2px 0 rgba(255,255,255,.95), inset -5px -7px 14px rgba(45,62,96,.10), 0 9px 0 rgba(35,49,78,.06), 0 14px 25px rgba(35,49,78,.16)`,
                cursor: "pointer",
                fontFamily: "inherit",
                display: "flex",
                flexDirection: full ? "row" : "column",
                alignItems: "center",
                justifyContent: "center",
                gap: full ? 18 : 12,
                textAlign: "center",
                transition: "transform .16s ease, filter .16s ease",
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-3px)" }}
              onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)" }}
            >
              <span style={{
                width: full ? 48 : 62, height: full ? 48 : 62, borderRadius: "50%",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                background: `linear-gradient(145deg, ${item.accent}, ${item.accent}cc)`,
                color: "#fff", border: "1px solid rgba(255,255,255,.52)",
                boxShadow: dark ? `0 7px 16px ${item.accent}55, inset 0 2px 2px rgba(255,255,255,.25)` : `0 7px 14px ${item.accent}45, inset 0 2px 2px rgba(255,255,255,.55)`,
                flexShrink: 0,
              }}><Icon size={full ? 24 : 29} strokeWidth={2.2} /></span>
              <span style={{ fontSize: isMobile ? 16 : 18, fontWeight: 900, lineHeight: 1.15, maxWidth: 180 }}>
                {isKreol ? item.kr : item.fr}
              </span>
              <span style={{
                width: 35, height: 35, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center",
                background: item.accent, color: "#fff", boxShadow: `0 5px 12px ${item.accent}55`,
              }}><ArrowRight size={19} /></span>
            </button>
          )
        })}
      </div>
    </main>
  )
}
