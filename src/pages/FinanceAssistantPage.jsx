import { useEffect, useState } from "react"
import { listShoppingItems } from "../features/shopping/services/shoppingEngine"
import { getFinanceAssistantProvider } from "../services/ai/financeAssistantEngine"

const COLORS = { card: "#0F1E38", cardLight: "#152444", border: "#1E3A5F", accent: "#F97316", cyan: "#23D3D6", muted: "#8EA4C5", text: "#F8FAFC" }
const card = extra => ({ background: `linear-gradient(135deg, ${COLORS.card}, ${COLORS.cardLight})`, border: `1px solid ${COLORS.border}`, borderRadius: 22, padding: 18, ...extra })

const TEXT = {
  fr: {
    eyebrow: "Assistant financier",
    title: "Mon assistant",
    subtitle: "Pose une question sur tes dépenses, magasins, produits ou économies possibles.",
    prompts: [
      "Pourquoi ai-je dépensé plus ce mois-ci ?",
      "Quels magasins me coûtent le moins cher ?",
      "Comment économiser 100 EUR ?",
      "Pourquoi mon budget alimentation augmente ?",
    ],
    placeholder: "Écris ta question...",
    ask: "Demander",
    busy: "Analyse...",
  },
  kreol: {
    eyebrow: "Asistan financier",
    title: "Mon asistan",
    subtitle: "Poz in kestion su out dépans, magasins, produits ou lékonomi possible.",
    prompts: [
      "Poukosa mi dépense plis sa mwa-la ?",
      "Ki magasins i coûte moins cher pou moin ?",
      "Koman économizé 100 EUR ?",
      "Poukosa mon bidzé manzé i augmente ?",
    ],
    placeholder: "Écris out kestion...",
    ask: "Domande",
    busy: "Analiz...",
  },
}

function isKreolLanguage(language = "fr") {
  return ["cr", "kreol", "kr"].includes(String(language || "").toLowerCase())
}

export default function FinanceAssistantPage({ user, transactions = [], stats = {}, isMobile = false, language = "fr" }) {
  const isKreol = isKreolLanguage(language)
  const txt = isKreol ? TEXT.kreol : TEXT.fr
  const [shoppingItems, setShoppingItems] = useState([])
  const [question, setQuestion] = useState("")
  const [answer, setAnswer] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let ignore = false
    listShoppingItems({ userId: user?.id }).then(rows => !ignore && setShoppingItems(rows || [])).catch(() => !ignore && setShoppingItems([]))
    return () => { ignore = true }
  }, [user?.id])

  async function ask(value = question) {
    if (!value.trim()) return
    setBusy(true)
    try {
      const provider = getFinanceAssistantProvider()
      const result = await provider.answer({ question: value, context: { transactions, stats, shoppingItems, language } })
      setAnswer(result)
      setQuestion(value)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={card({ padding: isMobile ? 18 : 24 })}>
        <div style={{ color: COLORS.cyan, fontSize: 13, fontWeight: 950 }}>{txt.eyebrow}</div>
        <h1 style={{ color: COLORS.text, margin: "8px 0", fontFamily: "'DM Serif Display', serif", fontSize: isMobile ? 34 : 42 }}>{txt.title}</h1>
        <div style={{ color: COLORS.muted }}>{txt.subtitle}</div>
      </div>
      <div style={card()}>
        <div style={{ display: "grid", gap: 10 }}>
          {txt.prompts.map(prompt => (
            <button key={prompt} type="button" onClick={() => ask(prompt)} style={{ minHeight: 48, borderRadius: 14, border: `1px solid ${COLORS.border}`, background: "rgba(255,255,255,.06)", color: COLORS.text, fontWeight: 900 }}>{prompt}</button>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr auto", gap: 10, marginTop: 14 }}>
          <input value={question} onChange={e => setQuestion(e.target.value)} placeholder={txt.placeholder} style={{ minHeight: 50, borderRadius: 14, border: `1px solid ${COLORS.border}`, background: COLORS.cardLight, color: COLORS.text, padding: "0 14px" }} />
          <button type="button" disabled={busy} onClick={() => ask()} style={{ minHeight: 50, border: "none", borderRadius: 14, background: busy ? COLORS.muted : COLORS.accent, color: "#fff", fontWeight: 950, padding: "0 16px" }}>{busy ? txt.busy : txt.ask}</button>
        </div>
      </div>
      {answer && <div style={card()}><div style={{ color: COLORS.text, lineHeight: 1.6, fontWeight: 800 }}>{answer}</div></div>}
    </div>
  )
}
