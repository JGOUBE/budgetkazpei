import { aidSourceStatus } from "./aidesRecommendationQuality.js"

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

export function prepareAdvisorAideContext(aides = [], isKreol = false) {
  return aides.filter(aide => aide && aide.actif !== false).slice(0, 8).map(aide => ({
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
