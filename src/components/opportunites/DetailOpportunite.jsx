import { useMemo, useState } from "react"

const COLORS = {
  card: "#0F1E38",
  cardLight: "#152444",
  border: "#1E3A5F",
  accent: "#F97316",
  yellow: "#FCD34D",
  cyan: "#23D3D6",
  green: "#22C55E",
  muted: "#8EA4C5",
  text: "#F1F5F9",
  red: "#FB7185",
  purple: "#A78BFA",
}

function normalize(value) {
  return String(value || "").toLowerCase()
}

function analyzeEligibility(item, profile) {
  const title = normalize(item?.title)
  const category = normalize(item?.category)
  const commune = profile?.commune || ""
  const hasChildren =
    Number(profile?.nombre_enfants || profile?.enfants || 0) > 0 ||
    profile?.situation_familiale === "parent" ||
    profile?.situation_familiale === "famille"

  const hasCommune = Boolean(commune)

  let score = 45
  const reasons = []

  if (item?.territory === "Toutes" || item?.territory === commune) {
    score += 15
    reasons.push("L’opportunité correspond à votre zone.")
  }

  if (category === "famille" || title.includes("caf")) {
    if (hasChildren) {
      score += 25
      reasons.push("Votre profil indique une situation familiale pouvant être concernée.")
    } else {
      score += 5
      reasons.push("Certaines aides CAF peuvent dépendre de votre situation familiale et de vos revenus.")
    }
  }

  if (category === "energie" || title.includes("énergie")) {
    score += 15
    reasons.push("Les aides énergie peuvent concerner de nombreux foyers selon le logement et les revenus.")
  }

  if (title.includes("ccas")) {
    if (hasCommune) {
      score += 20
      reasons.push("Votre commune est renseignée, ce qui permet de vous orienter vers le bon CCAS.")
    } else {
      reasons.push("Renseignez votre commune pour mieux cibler le CCAS concerné.")
    }
  }

  if (category === "logement") {
    score += 15
    reasons.push("Les aides logement dépendent souvent de votre situation, revenus et logement.")
  }

  if (item?.is_premium) {
    score += 5
    reasons.push("Cette opportunité fait partie du suivi Premium.")
  }

  const finalScore = Math.min(score, 95)

  if (finalScore >= 75) {
    return {
      level: "forte",
      color: COLORS.green,
      percent: finalScore,
      reasons,
    }
  }

  if (finalScore >= 50) {
    return {
      level: "à vérifier",
      color: COLORS.yellow,
      percent: finalScore,
      reasons,
    }
  }

  return {
    level: "faible",
    color: COLORS.red,
    percent: finalScore,
    reasons,
  }
}

export default function DetailOpportunite({
  item,
  profile,
  isPremium,
  isKreol,
  onBack,
}) {
  const [showEligibility, setShowEligibility] = useState(false)

  if (!item) return null

  const title = isKreol ? item.title_kr || item.title : item.title
  const description = isKreol
    ? item.description_kr || item.description
    : item.description

  const conditions = isKreol
    ? item.conditions_kr || item.conditions
    : item.conditions

  const documents = isKreol
    ? item.documents_kr || item.documents
    : item.documents

  const steps = isKreol
    ? item.steps_kr || item.steps
    : item.steps

  const eligibility = useMemo(
    () => analyzeEligibility(item, profile),
    [item, profile]
  )

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        style={{
          marginBottom: 18,
          background: "rgba(255,255,255,.06)",
          border: `1px solid ${COLORS.border}`,
          borderRadius: 12,
          color: COLORS.text,
          padding: "10px 14px",
          fontWeight: 800,
          cursor: "pointer",
        }}
      >
        ← {isKreol ? "Retour" : "Retour"}
      </button>

      <div
        style={{
          background: `linear-gradient(135deg, ${COLORS.cardLight}, ${COLORS.card})`,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 22,
          padding: 24,
        }}
      >
        <div
          style={{
            color: COLORS.cyan,
            fontSize: 13,
            fontWeight: 900,
            marginBottom: 10,
          }}
        >
          📍 {item.territory || item.commune || (isKreol ? "La Rényon" : "La Réunion")}
        </div>

        <h1
          style={{
            margin: "0 0 12px",
            color: COLORS.yellow,
            fontFamily: "'DM Serif Display', serif",
            fontSize: 36,
          }}
        >
          {title}
        </h1>

        <p
          style={{
            color: COLORS.muted,
            fontSize: 16,
            lineHeight: 1.6,
            marginBottom: 20,
          }}
        >
          {description}
        </p>

        {item.amount && (
          <div
            style={{
              color: COLORS.yellow,
              fontSize: 26,
              fontWeight: 900,
              marginBottom: 20,
            }}
          >
            {item.amount}
          </div>
        )}

        <button
          type="button"
          onClick={() => setShowEligibility(!showEligibility)}
          style={{
            width: "100%",
            marginBottom: 18,
            background: `linear-gradient(135deg, ${COLORS.cyan}, ${COLORS.accent})`,
            color: COLORS.card,
            border: "none",
            borderRadius: 14,
            padding: "14px 16px",
            fontWeight: 900,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          ✨ {isKreol ? "Mi pé avoir droit ?" : "Suis-je éligible ?"}
        </button>

        {showEligibility && (
          <div
            style={{
              background: "rgba(35,211,214,.08)",
              border: `1px solid ${eligibility.color}66`,
              borderRadius: 18,
              padding: 18,
              marginBottom: 18,
            }}
          >
            <div
              style={{
                color: eligibility.color,
                fontWeight: 900,
                fontSize: 15,
                marginBottom: 8,
              }}
            >
              {isKreol ? "Résultat indicatif" : "Résultat indicatif"}
            </div>

            <div
              style={{
                color: COLORS.text,
                fontSize: 22,
                fontWeight: 900,
                marginBottom: 10,
              }}
            >
              {isKreol
                ? `Probabilité : ${eligibility.level}`
                : `Probabilité : ${eligibility.level}`}
            </div>

            <div
              style={{
                height: 9,
                background: "rgba(255,255,255,.08)",
                borderRadius: 999,
                overflow: "hidden",
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  width: `${eligibility.percent}%`,
                  height: "100%",
                  background: eligibility.color,
                }}
              />
            </div>

            <div
              style={{
                color: COLORS.muted,
                fontSize: 13,
                lineHeight: 1.55,
                whiteSpace: "pre-line",
              }}
            >
              {eligibility.reasons.length > 0
                ? eligibility.reasons.map(reason => `• ${reason}`).join("\n")
                : isKreol
                  ? "Aucune analyse disponible pou le moman."
                  : "Aucune analyse disponible pour le moment."}
            </div>

            <div
              style={{
                marginTop: 12,
                color: COLORS.yellow,
                fontSize: 12,
                lineHeight: 1.45,
                fontWeight: 800,
              }}
            >
              {isKreol
                ? "Cette estimation lé indicative. Vérifie toujours su site officiel."
                : "Cette estimation est indicative. Vérifiez toujours les conditions sur le site officiel."}
            </div>
          </div>
        )}

        <InfoBlock
          title={isKreol ? "✅ Kondisyon" : "✅ Conditions"}
          text={conditions || (isKreol ? "Détay pou ajouté." : "Détails à ajouter.")}
        />

        <InfoBlock
          title={isKreol ? "📄 Dokiman pou préparé" : "📄 Documents à prévoir"}
          text={documents || (isKreol ? "Dokiman pou ajouté." : "Documents à ajouter.")}
        />

        <InfoBlock
          title={isKreol ? "➡️ Bann etap pou suiv" : "➡️ Étapes à suivre"}
          text={steps || (isKreol ? "Bann etap pou ajouté." : "Étapes à ajouter.")}
        />

        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            style={{
              display: "block",
              textAlign: "center",
              marginTop: 20,
              textDecoration: "none",
              background: `linear-gradient(135deg, ${COLORS.yellow}, ${COLORS.accent})`,
              color: COLORS.card,
              borderRadius: 14,
              padding: "14px 16px",
              fontWeight: 900,
            }}
          >
            {isKreol ? "Aller su site officiel" : "Aller sur le site officiel"}
          </a>
        )}
      </div>
    </div>
  )
}

function InfoBlock({ title, text }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,.045)",
        border: `1px solid ${COLORS.border}`,
        borderRadius: 16,
        padding: 16,
        marginTop: 14,
      }}
    >
      <h3
        style={{
          margin: "0 0 8px",
          color: COLORS.text,
          fontSize: 16,
        }}
      >
        {title}
      </h3>

      <p
        style={{
          margin: 0,
          color: COLORS.muted,
          fontSize: 14,
          lineHeight: 1.55,
          whiteSpace: "pre-line",
        }}
      >
        {text}
      </p>
    </div>
  )
}