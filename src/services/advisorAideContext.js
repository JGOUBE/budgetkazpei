import { aidSourceStatus } from "./aidesRecommendationQuality.js"
import { findAidTopicIds, findPrimaryAidTopicIds } from "./aidTopics.js"

export function formatAdvisorAideAmount(aide = {}) {
  const min = Number(aide.montant_min)
  const max = Number(aide.montant_max)

  if (Number.isFinite(min) && Number.isFinite(max) && min > 0 && max > 0) {
    if (min === max) return `${min} EUR`
    return `${min} a ${max} EUR`
  }

  if (Number.isFinite(max) && max > 0) return `Jusqu'a ${max} EUR`
  if (Number.isFinite(min) && min > 0) return `A partir de ${min} EUR`
  return "Montant variable"
}

// Diversify only when the user actually asks about several subjects
// (e.g. unpaid rent AND returning to work), so one category cannot use up all
// eight slots sent to the model. Never send the entire catalogue to OpenAI.
export function pickRelevantAidKnowledge(aides = [], question = "", limit = 8) {
  const candidates = (Array.isArray(aides) ? aides : []).filter(aide => aide && aide.actif !== false)
  const subjects = findPrimaryAidTopicIds(question)
  if (subjects.length < 2) return candidates.slice(0, limit)
  const chosen = []
  const used = new Set()
  for (const subject of subjects) {
    const primary = candidates.find(aide =>
      !used.has(aide) &&
      findAidTopicIds([aide.nom, aide.categorie, aide.nom_kreol].filter(Boolean).join(" ")).includes(subject))
    const secondary = primary || candidates.find(aide =>
      !used.has(aide) &&
      findAidTopicIds([aide.description_fr, aide.description, aide.description_kreol].filter(Boolean).join(" ")).includes(subject))
    if (secondary) {
      chosen.push(secondary)
      used.add(secondary)
    }
  }
  return [...chosen, ...candidates.filter(aide => !used.has(aide))].slice(0, limit)
}

export function prepareAdvisorAideContext(aides = [], isKreol = false, question = "") {
  return pickRelevantAidKnowledge(aides, question, 8).map(aide => ({
    // Source presence is NOT an eligibility guarantee: the user must confirm
    // current rules and amounts with the authority before any application.
    source_status: aidSourceStatus(aide).label,
    eligibilite_confirmee: false,
    regles_et_montants_a_confirmer: true,
    id: aide.id ?? null,
    nom: aide.nom || aide.aide_nom || "Aide",
    nom_kreol: aide.nom_kreol || aide.nom || "Aide",
    organisme: aide.organisme || "",
    categorie: aide.categorie || "",
    commune: aide.commune || null,
    zone_couverte: aide.zone_couverte || null,
    type_soutien: aide.type_soutien || "a_confirmer",
    derniere_verification: aide.date_verification || null,
    nature_du_soutien_a_confirmer: !aide.type_soutien,
    // A linked source is not evidence that its barème is current.
    bareme_verifie: Boolean(aide.bareme_verifie && aide.date_verification),
    montant: formatAdvisorAideAmount(aide),
    montant_min: aide.montant_min ?? null,
    montant_max: aide.montant_max ?? null,
    description: isKreol
      ? aide.description_kreol || aide.description_fr || aide.description || ""
      : aide.description_fr || aide.description || "",
    demarches: isKreol
      ? aide.demarches_kreol || aide.demarches_fr || ""
      : aide.demarches_fr || "",
    conditions: [
      aide.condition_logement,
      aide.condition_profession,
      aide.condition_famille,
    ].filter(Boolean),
    lien: aidSourceStatus(aide).url,
    lien_officiel: aidSourceStatus({ lien_officiel: aide.lien_officiel }).url,
  }))
}
