import { useEffect, useMemo, useState } from "react"
import { listShoppingItems } from "../features/shopping/services/shoppingEngine"
import { buildSavingsInsights } from "../services/savings/savingsEngine"
import { formatMontant } from "../utils/format"

const COLORS = { card: "#0F1E38", cardLight: "#152444", border: "#1E3A5F", accent: "#F97316", green: "#22C55E", cyan: "#23D3D6", muted: "#8EA4C5", text: "#F8FAFC" }
const card = extra => ({ background: `linear-gradient(135deg, ${COLORS.card}, ${COLORS.cardLight})`, border: `1px solid ${COLORS.border}`, borderRadius: 22, padding: 18, ...extra })

const COPY = {
  fr: {
    eyebrow: "Mes économies",
    title: "Cette semaine",
    potential: "Tu aurais pu économiser",
    suggestions: "Suggestions",
    empty: "Scanne quelques tickets pour recevoir des pistes concrètes.",
  },
  kreol: {
    eyebrow: "Mes lekonomi",
    title: "Semen-la",
    potential: "Ou te kapab économizé",
    suggestions: "Bann suggestions",
    empty: "Eskane quelques tiké pou recevoir bann pistes concrètes.",
  },
}

function isKreolLanguage(language) {
  return ["cr", "kreol", "kr"].includes(String(language || "").toLowerCase())
}

export default function SavingsPage({ user, transactions = [], isMobile = false, language = "fr" }) {
  const txt = isKreolLanguage(language) ? COPY.kreol : COPY.fr
  const [shoppingItems, setShoppingItems] = useState([])

  useEffect(() => {
    let ignore = false
    listShoppingItems({ userId: user?.id })
      .then(rows => !ignore && setShoppingItems(rows || []))
      .catch(() => !ignore && setShoppingItems([]))
    return () => { ignore = true }
  }, [user?.id])

  const insights = useMemo(
    () => buildSavingsInsights({ shoppingItems, transactions, language }),
    [shoppingItems, transactions, language],
  )

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={card({ padding: isMobile ? 18 : 24 })}>
        <div style={{ color: COLORS.cyan, fontSize: 13, fontWeight: 950 }}>{txt.eyebrow}</div>
        <h1 style={{ color: COLORS.text, margin: "8px 0 0", fontFamily: "'DM Serif Display', serif", fontSize: isMobile ? 34 : 42 }}>{txt.title}</h1>
        <div style={{ color: COLORS.muted, marginTop: 10 }}>{txt.potential}</div>
        <div style={{ color: COLORS.green, fontSize: 54, fontWeight: 950, fontFamily: "'DM Serif Display', serif" }}>{formatMontant(insights.weeklyPotential)}</div>
      </div>

      <div style={card()}>
        <h2 style={{ color: COLORS.text, margin: "0 0 12px" }}>{txt.suggestions}</h2>
        {insights.suggestions.length === 0 ? (
          <div style={{ color: COLORS.muted }}>{txt.empty}</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {insights.suggestions.map((item, index) => (
              <div key={index} style={{ borderBottom: "1px solid rgba(255,255,255,.08)", paddingBottom: 10 }}>
                <strong style={{ color: COLORS.text }}>{item.title}</strong>
                <div style={{ color: COLORS.muted, marginTop: 4 }}>{item.detail}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
