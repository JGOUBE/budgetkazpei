import { useMemo, useRef, useState } from "react"
import { Bot, ChevronRight, Loader2, Send } from "lucide-react"
import { useAssistantInsights } from "../hooks/useAssistantInsights"
import { getFinanceAssistantProvider } from "../services/ai/financeAssistantEngine"
import {
  buildUnknownAssistantFallback,
  selectAssistantActionLabel,
  selectAssistantAnswerText,
} from "../services/ai/assistantIntentEngine"
import { isAssistantKreol } from "../services/ai/assistantLanguage"
import { createColorAliases } from "../styles/designSystem"

const COLORS = createColorAliases()

const TEXT = {
  fr: {
    eyebrow: "Assistant financier",
    title: "Mon assistant",
    subtitle: "Pose une question sur tes dépenses, tes magasins, tes produits ou les économies possibles.",
    prompts: [
      "Pourquoi ai-je dépensé plus ce mois-ci ?",
      "Quels magasins me coûtent le moins cher ?",
      "Comment économiser 100 € ?",
      "Pourquoi mon budget alimentation augmente-t-il ?",
    ],
    placeholder: "Écris ta question...",
    ask: "Demander",
    busy: "Analyse en cours…",
    selected: "Question sélectionnée",
    noAnswer: "Je n'ai pas encore assez de données pour répondre précisément. Ajoute quelques dépenses ou scanne davantage de tickets.",
    contextWarning: "Certaines données n'ont pas pu être chargées. La réponse reste limitée aux informations disponibles.",
  },
  kr: {
    eyebrow: "Assistant financier",
    title: "Mon assistant",
    subtitle: "Poz in kestyon su out dépans, magasins, produits ou lékonomi possible.",
    prompts: [
      "Pou kosa mi dépans plis sa mwa-la ?",
      "Ki magazin i kout moins cher pou mwin ?",
      "Koman économiz 100 € ?",
      "Pou kosa mon bidzé manzé i ogmant ?",
    ],
    placeholder: "Écris out kestyon...",
    ask: "Demande",
    busy: "Analiz an kour…",
    selected: "Kestyon choisie",
    noAnswer: "Mi nana pankor assez donné pou réponn bien. Azout quelques dépans ou scanne plis tiké.",
    contextWarning: "Certaines données la pa pu chargé. Répons-la i reste limitée aux infos disponibles.",
  },
}

function card(extra = {}) {
  return {
    background: `linear-gradient(135deg, ${COLORS.card}, ${COLORS.cardLight})`,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    padding: 18,
    ...extra,
  }
}

function navigateTo(target) {
  if (!target || typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent("budgetkazpei:navigate", { detail: target }))
}

export default function FinanceAssistantPage({
  user,
  transactions = [],
  stats = {},
  byCategory = [],
  isMobile = false,
  language = "fr",
}) {
  const isKreol = isAssistantKreol(language)
  const txt = isKreol ? TEXT.kr : TEXT.fr
  const busyRef = useRef(false)
  const [question, setQuestion] = useState("")
  const [selectedPrompt, setSelectedPrompt] = useState("")
  const [answer, setAnswer] = useState(null)
  const [busy, setBusy] = useState(false)

  const {
    insights,
    profile,
    loading: loadingInsights,
    error: contextError,
  } = useAssistantInsights({
    userId: user?.id,
    transactions,
    stats,
    byCategory,
  })

  const provider = useMemo(() => getFinanceAssistantProvider(), [])
  const answerLanguage = answer?.responseLanguage || language
  const answerIsKreol = isAssistantKreol(answerLanguage)
  const answerText = answer ? selectAssistantAnswerText(answer, answerLanguage) : ""
  const transparency = answer
    ? answerIsKreol
      ? answer.transparency?.kr
      : answer.transparency?.fr
    : ""

  const canAsk = question.trim().length > 0 && !busy

  async function ask(value = question) {
    const sentQuestion = String(value || "").trim().slice(0, 500)
    if (!sentQuestion || busyRef.current) return

    busyRef.current = true
    setBusy(true)
    setQuestion(sentQuestion)

    try {
      const result = await provider.answer({
        question: sentQuestion,
        context: {
          user,
          language,
          insights,
          profile,
        },
      })

      setAnswer(result)
    } catch (error) {
      console.error("Erreur assistant financier:", error)
      setAnswer(buildUnknownAssistantFallback({ insights }))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  function handlePrompt(prompt) {
    setSelectedPrompt(prompt)
    setQuestion(prompt)
    ask(prompt)
  }

  function handleKeyDown(event) {
    if (event.key !== "Enter") return
    event.preventDefault()
    ask()
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <section style={card({ padding: isMobile ? 18 : 24 })}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: COLORS.cyan, fontSize: 13, fontWeight: 950 }}>
          <Bot size={18} aria-hidden="true" />
          <span>{txt.eyebrow}</span>
        </div>
        <h1
          style={{
            color: COLORS.text,
            margin: "8px 0",
            fontFamily: "'DM Serif Display', serif",
            fontSize: isMobile ? 34 : 42,
            letterSpacing: 0,
          }}
        >
          {txt.title}
        </h1>
        <div style={{ color: COLORS.muted, lineHeight: 1.55 }}>{txt.subtitle}</div>
      </section>

      <section style={card()}>
        <div style={{ display: "grid", gap: 10 }}>
          {txt.prompts.map(prompt => {
            const active = selectedPrompt === prompt

            return (
              <button
                key={prompt}
                type="button"
                onClick={() => handlePrompt(prompt)}
                disabled={busy}
                aria-pressed={active}
                style={{
                  minHeight: 48,
                  borderRadius: 8,
                  border: active ? `1px solid ${COLORS.cyan}` : `1px solid ${COLORS.border}`,
                  background: active ? "rgba(35,211,214,.14)" : "rgba(255,255,255,.06)",
                  color: COLORS.text,
                  fontWeight: 900,
                  textAlign: "left",
                  padding: "11px 13px",
                  cursor: busy ? "wait" : "pointer",
                  fontFamily: "inherit",
                }}
              >
                {prompt}
              </button>
            )
          })}
        </div>

        {selectedPrompt && (
          <div style={{ color: COLORS.cyan, fontSize: 12, fontWeight: 900, marginTop: 10 }}>
            {txt.selected} : {selectedPrompt}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr auto", gap: 10, marginTop: 14 }}>
          <input
            value={question}
            onChange={event => {
              setQuestion(event.target.value.slice(0, 500))
              setSelectedPrompt("")
            }}
            onKeyDown={handleKeyDown}
            maxLength={500}
            aria-label={txt.placeholder}
            placeholder={txt.placeholder}
            style={{
              minHeight: 50,
              borderRadius: 8,
              border: `1px solid ${COLORS.border}`,
              background: COLORS.cardLight,
              color: COLORS.text,
              padding: "0 14px",
              fontFamily: "inherit",
              outlineColor: COLORS.cyan,
            }}
          />
          <button
            type="button"
            disabled={!canAsk}
            onClick={() => ask()}
            style={{
              minHeight: 50,
              border: "none",
              borderRadius: 8,
              background: canAsk ? COLORS.accent : COLORS.muted,
              color: "#fff",
              fontWeight: 950,
              padding: "0 16px",
              cursor: canAsk ? "pointer" : "not-allowed",
              fontFamily: "inherit",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            {busy ? <Loader2 size={16} aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
            {busy ? txt.busy : txt.ask}
          </button>
        </div>
      </section>

      {(contextError || loadingInsights) && (
        <div
          role="status"
          style={{
            color: contextError ? COLORS.red : COLORS.muted,
            fontSize: 12,
            fontWeight: 800,
            lineHeight: 1.4,
          }}
        >
          {contextError ? txt.contextWarning : txt.busy}
        </div>
      )}

      {answer && (
        <section style={card({ display: "grid", gap: 12 })}>
          <div style={{ color: COLORS.text, lineHeight: 1.65, fontWeight: 800 }}>{answerText || txt.noAnswer}</div>

          {transparency && (
            <div style={{ color: COLORS.muted, fontSize: 12, fontWeight: 800 }}>
              {transparency}
            </div>
          )}

          {Array.isArray(answer.actions) && answer.actions.length > 0 && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {answer.actions.slice(0, 2).map(action => {
                const label = selectAssistantActionLabel(action, answerLanguage)

                if (!label || action.type !== "open_page") return null

                return (
                  <button
                    key={`${action.target}-${label}`}
                    type="button"
                    onClick={() => navigateTo(action.target)}
                    style={{
                      border: `1px solid rgba(35,211,214,.35)`,
                      background: "rgba(35,211,214,.12)",
                      color: COLORS.text,
                      borderRadius: 8,
                      padding: "9px 12px",
                      fontWeight: 900,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      fontFamily: "inherit",
                    }}
                  >
                    {label}
                    <ChevronRight size={16} aria-hidden="true" />
                  </button>
                )
              })}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
