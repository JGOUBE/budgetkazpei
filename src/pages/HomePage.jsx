import { BkIcons } from "../components/icons-budgetkazpei"
import { createColorAliases, ds } from "../styles/designSystem"
import { useTheme } from "../styles/ThemeProvider"

const COLORS = createColorAliases()

export default function HomePage({ language = "fr", isMobile = false, onNavigate, onAddExpense }) {
  const { themeName } = useTheme()
  const isKreol = language === "cr" || language === "kreol"

  const actions = [
    {
      id: "shoppingList",
      label: isKreol ? "Ma liste courses" : "Ma liste de courses",
      icon: BkIcons.shopping,
      tone: "rgba(35,211,214,.16)",
      border: "rgba(35,211,214,.42)",
      action: () => onNavigate("shoppingList"),
    },
    {
      id: "receipts",
      label: isKreol ? "Scanner mon tiké" : "Scanner mon ticket",
      icon: BkIcons.scan,
      tone: "rgba(249,115,22,.13)",
      border: "rgba(249,115,22,.38)",
      action: () => onNavigate("receipts"),
    },
    {
      id: "expense",
      label: isKreol ? "Azout in dépans" : "Ajouter une dépense",
      icon: BkIcons.depenses,
      tone: "rgba(34,197,94,.12)",
      border: "rgba(34,197,94,.34)",
      action: onAddExpense,
    },
    {
      id: "aides",
      label: isKreol ? "Mon bann èd ek mon bann drwa" : "Mes aides & mes droits",
      icon: BkIcons.aides,
      tone: "rgba(59,130,246,.11)",
      border: "rgba(59,130,246,.30)",
      action: () => onNavigate("aides"),
    },
    {
      id: "conseiller",
      label: isKreol ? "Mon konseye" : "Mon conseiller",
      icon: BkIcons.assistant,
      tone: "rgba(168,85,247,.11)",
      border: "rgba(168,85,247,.30)",
      action: () => onNavigate("conseiller"),
    },
  ]

  return (
    <main style={{ width: "100%", maxWidth: 980, margin: "0 auto", padding: isMobile ? "8px 0 24px" : "8px 0 48px" }}>
      <h1
        style={{
          margin: isMobile ? "8px 2px 22px" : "8px 2px 28px",
          color: COLORS.text,
          fontFamily: "'DM Serif Display', serif",
          fontSize: isMobile ? 28 : 34,
          fontWeight: 400,
        }}
      >
        {isKreol ? "Akèy" : "Accueil"}
      </h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3, minmax(0, 1fr))",
          gap: isMobile ? 14 : 20,
        }}
      >
        {actions.map((item, index) => {
          const Icon = item.icon
          const lastOnMobile = isMobile && index === actions.length - 1

          return (
            <button
              key={item.id}
              type="button"
              onClick={item.action}
              style={{
                gridColumn: lastOnMobile ? "1 / -1" : "auto",
                minHeight: isMobile ? 138 : 164,
                padding: isMobile ? "20px 14px" : "26px 20px",
                borderRadius: 22,
                border: `1px solid ${item.border}`,
                background: `linear-gradient(145deg, ${item.tone}, ${ds.card})`,
                color: COLORS.text,
                boxShadow: themeName === "light"
                  ? "0 10px 0 rgba(20,32,51,.035), 0 14px 30px rgba(20,32,51,.10), inset 0 1px 0 rgba(255,255,255,.92)"
                  : "0 10px 0 rgba(0,0,0,.12), 0 16px 34px rgba(0,0,0,.26), inset 0 1px 0 rgba(255,255,255,.07)",
                cursor: "pointer",
                fontFamily: "inherit",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 15,
                textAlign: "center",
                transition: "transform .16s ease, box-shadow .16s ease",
              }}
              onMouseEnter={event => {
                event.currentTarget.style.transform = "translateY(-2px)"
              }}
              onMouseLeave={event => {
                event.currentTarget.style.transform = "translateY(0)"
              }}
            >
              <span
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: 17,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: item.tone,
                  border: `1px solid ${item.border}`,
                  color: COLORS.text,
                }}
              >
                <Icon size={27} strokeWidth={2} />
              </span>
              <span style={{ fontSize: isMobile ? 15 : 17, fontWeight: 900, lineHeight: 1.2 }}>
                {item.label}
              </span>
            </button>
          )
        })}
      </div>
    </main>
  )
}
