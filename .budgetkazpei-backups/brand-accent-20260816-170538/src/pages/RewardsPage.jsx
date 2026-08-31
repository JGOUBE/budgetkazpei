import { useEffect, useMemo, useState } from "react"
import { supabase } from "../services/supabase"
import { buildGamificationState } from "../services/gamification/gamificationEngine"
import { createColorAliases } from "../styles/designSystem"

const COLORS = createColorAliases()
const card = extra => ({ background: `linear-gradient(135deg, ${COLORS.card}, ${COLORS.cardLight})`, border: `1px solid ${COLORS.border}`, borderRadius: 22, padding: 18, ...extra })

const COPY = {
  fr: {
    eyebrow: "Progression",
    title: "Défis & badges",
    intro: "Chaque point affiché vient de vos vraies dépenses, courses et actions enregistrées.",
    howTitle: "Comment ça fonctionne ?",
    steps: [
      "Ajoutez vos dépenses ou vos courses.",
      "BudgetKazPei suit vos progrès automatiquement.",
      "Vous gagnez des points.",
      "Vous débloquez des badges.",
      "Vous progressez vers le niveau suivant.",
    ],
    currentLevel: "Niveau actuel",
    nextLevel: "Prochain niveau",
    challenges: "Défis",
    badges: "Badges",
    unlocked: "Débloqué",
    inProgress: "En cours",
    points: "points",
  },
  kreol: {
    eyebrow: "Progresyon",
    title: "Défi & badges",
    intro: "Chaque point i vien de out vraies dépans, courses ek aksyon anrezistrées.",
    howTitle: "Koman ça i marche ?",
    steps: [
      "Azout out dépans ou out courses.",
      "BudgetKazPei i swiv out progrès otomatikman.",
      "Ou gagn bann points.",
      "Ou débloque bann badges.",
      "Ou avance vers nivo suivant.",
    ],
    currentLevel: "Nivo actuel",
    nextLevel: "Prochain nivo",
    challenges: "Défi",
    badges: "Badges",
    unlocked: "Débloqué",
    inProgress: "An cours",
    points: "points",
  },
}

export default function RewardsPage({ user, transactions = [], stats = {}, isMobile = false, language = "fr" }) {
  const [receipts, setReceipts] = useState([])
  const isKreol = language === "cr" || language === "kreol"
  const copy = isKreol ? COPY.kreol : COPY.fr

  useEffect(() => {
    let ignore = false
    if (!user?.id) return
    supabase
      .from("receipts")
      .select("id, total_amount, purchase_date")
      .eq("user_id", user?.id)
      .then(({ data }) => !ignore && setReceipts(data || []))
    return () => { ignore = true }
  }, [user?.id])

  const state = useMemo(
    () => buildGamificationState({ transactions, receipts, stats, language: isKreol ? "kreol" : "fr" }),
    [transactions, receipts, stats, isKreol],
  )

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={card({ padding: isMobile ? 18 : 24 })}>
        <div style={{ color: COLORS.cyan, fontSize: 13, fontWeight: 950 }}>{copy.eyebrow}</div>
        <h1 style={{ color: COLORS.text, margin: "8px 0", fontFamily: "'DM Serif Display', serif", fontSize: isMobile ? 34 : 42 }}>{copy.title}</h1>
        <div style={{ color: COLORS.muted, lineHeight: 1.55 }}>
          {copy.intro}
        </div>
      </div>

      <div style={card()}>
        <h2 style={titleStyle}>{copy.howTitle}</h2>
        <div style={{ display: "grid", gap: 9, color: COLORS.text, lineHeight: 1.5 }}>
          {copy.steps.map((line, index) => (
            <div key={line} style={{ display: "grid", gridTemplateColumns: "28px 1fr", gap: 8, alignItems: "center" }}>
              <strong style={{ color: COLORS.cyan }}>{index + 1}.</strong>
              <span>{line}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={card()}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
          <div>
            <div style={{ color: COLORS.muted, fontSize: 12, fontWeight: 900 }}>{copy.currentLevel}</div>
            <h2 style={{ ...titleStyle, marginTop: 4 }}>{state.level.current}</h2>
            <div style={{ color: COLORS.muted, lineHeight: 1.45 }}>{state.level.reason}</div>
          </div>
          <div style={{ color: COLORS.yellow, fontWeight: 950, fontSize: 24 }}>{state.points} {copy.points}</div>
        </div>
        <div style={{ color: COLORS.text, marginTop: 14, fontWeight: 900 }}>{copy.nextLevel} : {state.level.next}</div>
        <ProgressBar progress={state.level.progress} />
      </div>

      <div style={card()}>
        <h2 style={titleStyle}>{copy.challenges}</h2>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 12 }}>
          {state.challenges.map(challenge => (
            <ProgressCard key={challenge.id} item={challenge} />
          ))}
        </div>
      </div>

      <div style={card()}>
        <h2 style={titleStyle}>{copy.badges}</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          {state.badges.map(badge => (
            <div key={badge.id} style={{ borderRadius: 16, border: `1px solid ${badge.unlocked ? COLORS.green : COLORS.border}`, background: badge.unlocked ? "rgba(34,197,94,.12)" : "rgba(255,255,255,.05)", padding: 14 }}>
              <div style={{ color: badge.unlocked ? COLORS.green : COLORS.text, fontWeight: 950 }}>
                {badge.label}
              </div>
              <div style={{ color: COLORS.muted, fontSize: 12, marginTop: 6, lineHeight: 1.45 }}>{badge.condition}</div>
              <ProgressBar progress={badge.progress} compact />
              <div style={{ color: badge.unlocked ? COLORS.green : COLORS.yellow, fontSize: 12, fontWeight: 900, marginTop: 8 }}>
                {badge.progress.current} / {badge.progress.target} - {badge.unlocked ? copy.unlocked : copy.inProgress} - {badge.reward}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const titleStyle = { color: COLORS.text, margin: "0 0 12px", fontSize: 20 }

function ProgressCard({ item }) {
  return (
    <div style={{ border: "1px solid rgba(255,255,255,.09)", background: "rgba(255,255,255,.05)", borderRadius: 16, padding: 14 }}>
      <div style={{ color: COLORS.text, fontWeight: 950 }}>{item.title}</div>
      <div style={{ color: COLORS.muted, fontSize: 12, marginTop: 6, lineHeight: 1.45 }}>{item.why}</div>
      <ProgressBar progress={item.progress} />
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", color: COLORS.yellow, fontSize: 12, fontWeight: 900, marginTop: 8 }}>
        <span>{item.progress.current} / {item.progress.target}</span>
        <span>{item.reward}</span>
        <span>{item.duration}</span>
      </div>
    </div>
  )
}

function ProgressBar({ progress, compact = false }) {
  return (
    <div style={{ marginTop: compact ? 10 : 12 }}>
      <div style={{ height: compact ? 7 : 10, borderRadius: 99, background: "rgba(255,255,255,.12)", overflow: "hidden" }}>
        <div style={{ width: `${progress.percent}%`, height: "100%", background: progress.percent >= 100 ? COLORS.green : COLORS.accent, borderRadius: 99 }} />
      </div>
      {!compact && (
        <div style={{ color: COLORS.muted, fontSize: 12, marginTop: 5 }}>
          {progress.percent} %
        </div>
      )}
    </div>
  )
}
