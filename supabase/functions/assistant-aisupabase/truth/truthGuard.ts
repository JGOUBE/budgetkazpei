export type TruthLevel =
  | "confirmed"
  | "likely"
  | "unknown"
  | "forbidden"

export interface TruthReport {
  confidence: number

  confirmed: string[]

  likely: string[]

  unknown: string[]

  forbidden: string[]

  recommendations: string[]
}

function hasValue(value: unknown) {
  return value !== null &&
    value !== undefined &&
    String(value).trim() !== ""
}

function normalize(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

export function evaluateTruth(
  profile: any = {},
  memory: any = {},
  consistency: any = null,
  question = "",
): TruthReport {

  const report: TruthReport = {
    confidence: 100,

    confirmed: [],

    likely: [],

    unknown: [],

    forbidden: [],

    recommendations: [],
  }

  const text = normalize(question)

  //-------------------------------------------------
  // PROFIL
  //-------------------------------------------------

  if (hasValue(profile.logement)) {

    report.confirmed.push(
      `Logement confirmé : ${profile.logement}`
    )

  } else {

    report.unknown.push("Type de logement inconnu")

    report.confidence -= 6

  }

  if (hasValue(profile.situation_professionnelle)) {

    report.confirmed.push(
      `Situation professionnelle confirmée : ${profile.situation_professionnelle}`
    )

  } else {

    report.unknown.push(
      "Situation professionnelle inconnue"
    )

    report.confidence -= 8

  }

  if (hasValue(profile.situation_familiale)) {

    report.confirmed.push(
      `Situation familiale confirmée : ${profile.situation_familiale}`
    )

  }

  if (hasValue(profile.nombre_enfants)) {

    report.confirmed.push(
      `Nombre d'enfants confirmé`
    )

  }

  //-------------------------------------------------
  // MEMORY
  //-------------------------------------------------

  if (memory?.stable_facts) {

    report.confirmed.push(
      "Mémoire utilisateur disponible"
    )

  }

  //-------------------------------------------------
  // CONTRADICTIONS
  //-------------------------------------------------

  if (
    consistency &&
    Array.isArray(consistency.contradictions) &&
    consistency.contradictions.length > 0
  ) {

    report.forbidden.push(
      "Ne jamais raisonner comme si le profil était exact sans demander confirmation."
    )

    report.recommendations.push(
      "Demander une confirmation avant de conclure."
    )

    report.confidence -= 25

  }

  //-------------------------------------------------
  // MISSING
  //-------------------------------------------------

  if (
    consistency &&
    Array.isArray(consistency.missing)
  ) {

    consistency.missing.forEach((item: string) => {

      report.unknown.push(item)

    })

    report.confidence -=
      consistency.missing.length * 4

  }

  //-------------------------------------------------
  // INTERDICTIONS
  //-------------------------------------------------

  report.forbidden.push(
    "Ne jamais affirmer qu'un utilisateur a droit à une aide."
  )

  report.forbidden.push(
    "Ne jamais affirmer qu'un dossier est accepté."
  )

  report.forbidden.push(
    "Ne jamais affirmer qu'un organisme a pris une décision."
  )

  report.forbidden.push(
    "Ne jamais inventer un montant."
  )

  report.forbidden.push(
    "Ne jamais inventer un organisme."
  )

  report.forbidden.push(
    "Ne jamais déduire un salaire individuel à partir du revenu du foyer."
  )

  //-------------------------------------------------
  // CAS SPÉCIAUX
  //-------------------------------------------------

  if (text.includes("smic")) {

    report.forbidden.push(
      "Le revenu du foyer ne correspond pas forcément au SMIC."
    )

  }

  if (
    text.includes("rsa") ||
    text.includes("apl") ||
    text.includes("caf")
  ) {

    report.likely.push(
      "Parler en termes d'éligibilité potentielle."
    )

    report.recommendations.push(
      "Employer 'vous pourriez être éligible' plutôt que 'vous avez droit'."
    )

  }

  //-------------------------------------------------
  // SCORE
  //-------------------------------------------------

  report.confidence = Math.max(
    0,
    Math.min(
      100,
      report.confidence
    )
  )

  return report

}