import { aidSourceStatus, safeAidSourceUrl } from "./aidesRecommendationQuality.js"
import { findAidTopicIds, findPrimaryAidTopicIds } from "./aidTopics.js"

const NON_MONETARY_AID_TYPES = new Set([
  "accompagnement", "aide_alimentaire", "aide_materielle",
  "service_gratuit", "orientation",
])

export function formatAdvisorAideAmount(aide = {}) {
  // A service / association is not necessarily a grant or a cash benefit.
  if (NON_MONETARY_AID_TYPES.has(aide.type_dispositif)) {
    return "Service ou aide matérielle : aucun versement en espèces annoncé"
  }

  const min = Number(aide.montant_min)
  const max = Number(aide.montant_max)
  if (Number.isFinite(min) && Number.isFinite(max) && min > 0 && max > 0) {
    if (min === max) return `${min} EUR`
    return `${min} a ${max} EUR`
  }
  if (Number.isFinite(max) && max > 0) return `Jusqu'a ${max} EUR`
  if (Number.isFinite(min) && min > 0) return `A partir de ${min} EUR`
  return "Montant éventuel non vérifié"
}

// Each response contains a maximum of eight relevant fiches, sampled across
// requested domains. A mixed housing+employment need should not crowd one out.
export function pickRelevantAidKnowledge(aides = [], question = "", limit = 8) {
  const candidates = (Array.isArray(aides) ? aides : [])
    .filter(aide => aide && aide.actif !== false && aide.statut_verification !== "suspendu")
  const domains = findPrimaryAidTopicIds(question)
  if (domains.length < 2) return candidates.slice(0, limit)
  const selected = []
  const used = new Set()
  for (const domain of domains) {
    const matches = aide => !used.has(aide) && findAidTopicIds(
      [aide.nom, aide.categorie, aide.type_dispositif, aide.nom_kreol]
        .filter(Boolean).join(" ")
    ).includes(domain)
    const match = candidates.find(matches) || candidates.find(aide =>
      !used.has(aide) && findAidTopicIds(
        [aide.description_fr, aide.description, aide.description_kreol]
          .filter(Boolean).join(" ")
      ).includes(domain))
    if (match) { selected.push(match); used.add(match) }
  }
  return [...selected, ...candidates.filter(item => !used.has(item))].slice(0, limit)
}

export function prepareAdvisorAideContext(aides = [], isKreol = false, question = "") {
  return pickRelevantAidKnowledge(aides, question, 8).map(aide => {
    const reference = aidSourceStatus(aide)
    const sourceVerification = safeAidSourceUrl(aide.source_verification)
    const nature = aide.type_dispositif || "non_classe"
    const isNonMonetary = NON_MONETARY_AID_TYPES.has(nature)
    const sourceConfirmed = ["source_confirmee", "operateur_reference_2026"]
      .includes(aide.statut_verification)

    return {
      // "Source confirmed" is NOT a guarantee of current eligibility or amounts.
      id: aide.id ?? null,
      nom: aide.nom || aide.aide_nom || "Aide",
      nom_kreol: aide.nom_kreol || aide.nom || "Aide",
      organisme: aide.organisme || "",
      categorie: aide.categorie || "",
      type_dispositif: nature,
      aide_en_especes: isNonMonetary ? false : null,
      commune: aide.commune || "",
      zone_couverte: aide.zone_couverte || "Zone à confirmer auprès de l'organisme",
      source_status: aide.statut_verification || "a_verifier",
      source_reference_disponible: reference.available,
      source_confirmee: sourceConfirmed,
      date_verification_source: aide.date_verification || null,
      periode_validite: aide.periode_validite || null,
      eligibilite_confirmee: false,
      regles_et_montants_a_confirmer: true,
      montant: formatAdvisorAideAmount(aide),
      montant_min: isNonMonetary ? null : aide.montant_min ?? null,
      montant_max: isNonMonetary ? null : aide.montant_max ?? null,
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
      lien: reference.url,
      lien_officiel: safeAidSourceUrl(aide.lien_officiel),
      source_verification: sourceVerification,
    }
  })
}
