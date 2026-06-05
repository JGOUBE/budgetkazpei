import { useState } from "react"
import { Bot, Lock, Send, Sparkles } from "lucide-react"

const COLORS = {
  card: "#0F1E38",
  cardLight: "#152444",
  border: "#1E3A5F",
  accent: "#F97316",
  yellow: "#FCD34D",
  cyan: "#23D3D6",
  text: "#F1F5F9",
  muted: "#8EA4C5",
}

export default function AssistantAides({ isPremium, isMobile, t }) {
  const [question, setQuestion] = useState("")
  const [response, setResponse] = useState("")

  function handleAnalyze() {
    if (!question.trim()) return

    setResponse(
      "D'après votre situation, BudgetKazPei vous conseille de vérifier en priorité : CAF, APL, Prime d’activité, chèque énergie, CCAS de votre commune et aides Région Réunion. Cette première analyse sera bientôt enrichie par l’IA Premium."
    )
  }

  if (!isPremium) {
    return (
      <section
        style={{
          background: `linear-gradient(135deg, rgba(252,211,77,.18), ${COLORS.card})`,
          border: `1px solid rgba(252,211,77,.35)`,
          borderRadius: 22,
          padding: isMobile ? 18 : 24,
        }}
      >
        <Lock size={26} color={COLORS.yellow} />

        <h3 style={{ color: COLORS.text, margin: "12px 0 8px" }}>
          🤖 Assistant IA Premium
        </h3>

        <p style={{ color: COLORS.muted, lineHeight: 1.6, margin: 0 }}>
          Débloquez Premium pour obtenir une analyse personnalisée de vos aides,
          droits et dispositifs disponibles à La Réunion.
        </p>

        <button
          type="button"
          onClick={() => alert("Disponible avec Premium")}
          style={{
            marginTop: 16,
            background: COLORS.yellow,
            color: "#0A1628",
            border: "none",
            borderRadius: 12,
            padding: "11px 16px",
            fontWeight: 900,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Débloquer Premium
        </button>
      </section>
    )
  }

  return (
    <section
      style={{
        background: `linear-gradient(135deg, rgba(35,211,214,.16), ${COLORS.card})`,
        border: `1px solid rgba(35,211,214,.32)`,
        borderRadius: 22,
        padding: isMobile ? 18 : 24,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Bot size={26} color={COLORS.cyan} />
        <h3 style={{ color: COLORS.text, margin: 0 }}>
          Assistant IA BudgetKazPei
        </h3>
      </div>

      <p style={{ color: COLORS.muted, lineHeight: 1.6 }}>
        Posez une question sur vos aides, droits ou votre situation.
      </p>

      <textarea
        value={question}
        onChange={e => setQuestion(e.target.value)}
        placeholder="Ex : Je suis parent isolé avec 2 enfants à Saint-Leu, quelles aides puis-je vérifier ?"
        style={{
          width: "100%",
          minHeight: 100,
          background: COLORS.cardLight,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 14,
          padding: 14,
          color: COLORS.text,
          fontFamily: "inherit",
          resize: "vertical",
          outline: "none",
        }}
      />

      <button
        type="button"
        onClick={handleAnalyze}
        style={{
          marginTop: 12,
          background: COLORS.accent,
          color: "#fff",
          border: "none",
          borderRadius: 12,
          padding: "11px 16px",
          fontWeight: 900,
          cursor: "pointer",
          fontFamily: "inherit",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Send size={16} />
        Analyser ma situation
      </button>

      {response && (
        <div
          style={{
            marginTop: 16,
            background: "rgba(255,255,255,.05)",
            border: `1px solid ${COLORS.border}`,
            borderRadius: 16,
            padding: 16,
            color: COLORS.text,
            lineHeight: 1.6,
          }}
        >
          <div style={{ color: COLORS.cyan, fontWeight: 900, marginBottom: 8 }}>
            <Sparkles size={16} /> Réponse de l’assistant
          </div>
          {response}
        </div>
      )}
    </section>
  )
}