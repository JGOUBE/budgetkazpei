import { useMemo, useState } from "react"
import { supabase } from "../../services/supabase"

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

function getText(t, isKreol, section, key, fallback) {
  if (!isKreol) return fallback
  return t?.(section, key) || fallback
}

function analyzeEligibility(item, profile) {
  const title = normalize(item?.title)
  const category = normalize(item?.category)
  const commune = profile?.commune || ""

  const hasChildren =
    Number(profile?.nombre_enfants || profile?.enfants || 0) > 0 ||
    profile?.situation_familiale === "parent" ||
    profile?.situation_familiale === "famille" ||
    profile?.situation_familiale === "parent_isole"

  const hasCommune = Boolean(commune)

  let score = 45
  const reasons = []

  if (item?.territory === "Toutes" || item?.territory === commune) {
    score += 15
    reasons.push("zoneMatch")
  }

  if (category === "famille" || title.includes("caf")) {
    if (hasChildren) {
      score += 25
      reasons.push("familyReason")
    } else {
      score += 5
      reasons.push("cafReason")
    }
  }

  if (category === "energie" || title.includes("énergie")) {
    score += 15
    reasons.push("energyReason")
  }

  if (title.includes("ccas")) {
    if (hasCommune) {
      score += 20
      reasons.push("ccasReason")
    } else {
      reasons.push("communeMissing")
    }
  }

  if (category === "logement") {
    score += 15
    reasons.push("logementReason")
  }

  if (item?.is_premium) {
    score += 5
    reasons.push("premiumReason")
  }

  const finalScore = Math.min(score, 95)

  if (finalScore >= 75) {
    return {
      level: "strong",
      color: COLORS.green,
      percent: finalScore,
      reasons,
    }
  }

  if (finalScore >= 50) {
    return {
      level: "medium",
      color: COLORS.yellow,
      percent: finalScore,
      reasons,
    }
  }

  return {
    level: "weak",
    color: COLORS.red,
    percent: finalScore,
    reasons,
  }
}

function getReasonText(reasonKey, isKreol, t) {
  const fr = {
    zoneMatch: "L’opportunité correspond à votre zone.",
    familyReason:
      "Votre profil indique une situation familiale pouvant être concernée.",
    cafReason:
      "Certaines aides CAF peuvent dépendre de votre situation familiale et de vos revenus.",
    energyReason:
      "Les aides énergie peuvent concerner de nombreux foyers selon le logement et les revenus.",
    ccasReason:
      "Votre commune est renseignée, ce qui permet de vous orienter vers le bon CCAS.",
    communeMissing:
      "Renseignez votre commune pour mieux cibler le CCAS concerné.",
    logementReason:
      "Les aides logement dépendent souvent de votre situation, revenus et logement.",
    premiumReason: "Cette opportunité fait partie du suivi Premium.",
  }

  if (!isKreol) return fr[reasonKey] || reasonKey

  return t?.("eligibility", reasonKey) || fr[reasonKey] || reasonKey
}

function getLevelText(level, isKreol, t) {
  const fr = {
    strong: "forte",
    medium: "à vérifier",
    weak: "faible",
  }

  if (!isKreol) return fr[level] || level

  return t?.("eligibility", level) || fr[level] || level
}

export default function DetailOpportunite({
  item,
  profile,
  isPremium,
  isKreol,
  t,
  onBack,
  onGoDemarches,
}) {
  const [showEligibility, setShowEligibility] = useState(false)
  const [saving, setSaving] = useState(false)

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

  const steps = isKreol ? item.steps_kr || item.steps : item.steps

  const eligibility = useMemo(
    () => analyzeEligibility(item, profile),
    [item, profile]
  )

  const eligibilityLevel = getLevelText(eligibility.level, isKreol, t)

  async function addToDemarches() {
    try {
      setSaving(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        alert(isKreol ? "Ou doit être connecté." : "Vous devez être connecté.")
        return
      }

      const { error } = await supabase.from("aide_demarches").insert({
        user_id: user.id,
        opportunity_id: item.id,
        title: item.title,
        title_kr: item.title_kr,
        status: "a_faire",
      })

      if (error) {
        console.error("Erreur ajout démarche:", error)
        alert(`Erreur lors de l'ajout : ${error.message || "erreur inconnue"}`)
        return
      }

      const goToDemarches = window.confirm(
        isKreol
          ? "✅ Démarche ajoutée. Ou retrouve ali dan Éd & Drwa. Ouvrir maintenant ?"
          : "✅ Démarche ajoutée. Retrouvez-la dans Aides & Droits. Ouvrir maintenant ?"
      )

      if (goToDemarches && onGoDemarches) {
        onGoDemarches()
      }
    } finally {
      setSaving(false)
    }
  }

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
        ← {getText(t, isKreol, "common", "back", "Retour")}
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
          📍{" "}
          {item.territory ||
            item.commune ||
            (isKreol ? "La Rényon" : "La Réunion")}
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
          ✨{" "}
          {getText(
            t,
            isKreol,
            "eligibility",
            "button",
            "Suis-je éligible ?"
          )}
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
              {getText(
                t,
                isKreol,
                "eligibility",
                "resultIndicatif",
                "Résultat indicatif"
              )}
            </div>

            <div
              style={{
                color: COLORS.text,
                fontSize: 22,
                fontWeight: 900,
                marginBottom: 10,
              }}
            >
              {getText(t, isKreol, "eligibility", "probability", "Probabilité")}{" "}
              : {eligibilityLevel}
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
                ? eligibility.reasons
                    .map(reason => `• ${getReasonText(reason, isKreol, t)}`)
                    .join("\n")
                : getText(
                    t,
                    isKreol,
                    "eligibility",
                    "noAnalysis",
                    "Aucune analyse disponible pour le moment."
                  )}
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
              {getText(
                t,
                isKreol,
                "eligibility",
                "disclaimer",
                "Cette estimation est indicative. Vérifiez toujours les conditions sur le site officiel."
              )}
            </div>
          </div>
        )}

        <InfoBlock
          title={getText(
            t,
            isKreol,
            "opportunityDetail",
            "conditions",
            "✅ Conditions"
          )}
          text={
            conditions ||
            getText(
              t,
              isKreol,
              "opportunityDetail",
              "detailsToAdd",
              "Détails à ajouter."
            )
          }
        />

        <InfoBlock
          title={getText(
            t,
            isKreol,
            "opportunityDetail",
            "documents",
            "📄 Documents à prévoir"
          )}
          text={
            documents ||
            getText(
              t,
              isKreol,
              "opportunityDetail",
              "documentsToAdd",
              "Documents à ajouter."
            )
          }
        />

        <InfoBlock
          title={getText(
            t,
            isKreol,
            "opportunityDetail",
            "steps",
            "➡️ Étapes à suivre"
          )}
          text={
            steps ||
            getText(
              t,
              isKreol,
              "opportunityDetail",
              "stepsToAdd",
              "Étapes à ajouter."
            )
          }
        />

        <button
          type="button"
          onClick={addToDemarches}
          disabled={saving}
          style={{
            width: "100%",
            marginTop: 18,
            background: saving
              ? "rgba(142,164,197,.35)"
              : `linear-gradient(135deg, ${COLORS.green}, ${COLORS.cyan})`,
            color: COLORS.card,
            border: "none",
            borderRadius: 14,
            padding: "14px 16px",
            fontWeight: 900,
            cursor: saving ? "not-allowed" : "pointer",
            fontFamily: "inherit",
          }}
        >
          {saving
            ? "Ajout..."
            : isKreol
              ? "➕ Azout dann mes démarches"
              : "➕ Ajouter à mes démarches"}
        </button>

        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            style={{
              display: "block",
              textAlign: "center",
              marginTop: 14,
              textDecoration: "none",
              background: `linear-gradient(135deg, ${COLORS.yellow}, ${COLORS.accent})`,
              color: COLORS.card,
              borderRadius: 14,
              padding: "14px 16px",
              fontWeight: 900,
            }}
          >
            {getText(
              t,
              isKreol,
              "opportunityDetail",
              "officialSite",
              "Aller sur le site officiel"
            )}
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