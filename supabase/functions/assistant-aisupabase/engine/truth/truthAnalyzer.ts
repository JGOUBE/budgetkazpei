import {
  CERTAINTY_FORBIDDEN_PATTERNS,
  DEADLINE_PATTERN,
  MONEY_PATTERN,
  MONEY_RANGE_PATTERN,
  OFFICIAL_ORGANIZATIONS,
} from "./truthRules.ts"

export type TruthLevel = "confirmed" | "likely" | "unknown" | "forbidden"

export interface TruthReport {
  confidence: number
  confirmed: string[]
  likely: string[]
  unknown: string[]
  forbidden: string[]
  recommendations: string[]
  warnings: string[]
  inventedAmounts: string[]
  inventedDeadlines: string[]
  inventedOrganizations: string[]
  unsupportedClaims: string[]
  profileConflicts: string[]
  certaintyProblems: string[]
}

function normalize(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, " ")
    .replace(/[^a-z0-9\s€.,-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function hasValue(value: unknown) {
  return value !== null && value !== undefined && String(value).trim() !== ""
}

function pushUnique(list: string[], value: string) {
  if (!list.includes(value)) list.push(value)
}

function createEmptyReport(): TruthReport {
  return {
    confidence: 100,
    confirmed: [],
    likely: [],
    unknown: [],
    forbidden: [],
    recommendations: [],
    warnings: [],
    inventedAmounts: [],
    inventedDeadlines: [],
    inventedOrganizations: [],
    unsupportedClaims: [],
    profileConflicts: [],
    certaintyProblems: [],
  }
}

function analyseProfile(report: TruthReport, profile: any = {}) {
  if (hasValue(profile.logement)) {
    pushUnique(report.confirmed, `Logement confirmé : ${profile.logement}`)
  } else {
    pushUnique(report.unknown, "Type de logement inconnu")
    report.confidence -= 5
  }

  if (hasValue(profile.situation_professionnelle)) {
    pushUnique(report.confirmed, `Situation professionnelle confirmée : ${profile.situation_professionnelle}`)
  } else {
    pushUnique(report.unknown, "Situation professionnelle inconnue")
    report.confidence -= 6
  }

  if (hasValue(profile.situation_familiale)) {
    pushUnique(report.confirmed, `Situation familiale confirmée : ${profile.situation_familiale}`)
  }

  if (hasValue(profile.nombre_enfants)) {
    pushUnique(report.confirmed, "Nombre d'enfants confirmé")
  }

  if (hasValue(profile.revenus_foyer)) {
    pushUnique(report.confirmed, "Revenu du foyer connu, mais il ne doit jamais être interprété comme un salaire individuel")
  }
}

function analyseConsistency(report: TruthReport, consistency: any = null) {
  if (!consistency) return

  const contradictions = Array.isArray(consistency.contradictions) ? consistency.contradictions : []
  const missing = Array.isArray(consistency.missing) ? consistency.missing : []
  const suggestions = Array.isArray(consistency.suggestions) ? consistency.suggestions : []

  contradictions.forEach((item: string) => {
    pushUnique(report.profileConflicts, item)
    pushUnique(report.forbidden, "Ne pas trancher si le profil et la demande se contredisent.")
    report.confidence -= 20
  })

  missing.forEach((item: string) => {
    pushUnique(report.unknown, item)
    report.confidence -= 4
  })

  suggestions.forEach((item: string) => {
    pushUnique(report.warnings, item)
    report.confidence -= 5
  })
}

function analyseCertainty(report: TruthReport, text: string) {
  for (const pattern of CERTAINTY_FORBIDDEN_PATTERNS) {
    if (text.includes(normalize(pattern))) {
      pushUnique(report.certaintyProblems, `Formulation trop certaine détectée : "${pattern}"`)
      pushUnique(report.forbidden, "Ne jamais affirmer un droit, une acceptation, un versement ou une éligibilité certaine sans preuve officielle.")
      pushUnique(report.recommendations, "Utiliser une formulation prudente : 'vous pourriez', 'à vérifier', 'selon votre situation'.")
      report.confidence -= 12
    }
  }
}

function analyseAmounts(report: TruthReport, rawText: string) {
  const amounts = rawText.match(MONEY_PATTERN) || []
  const ranges = rawText.match(MONEY_RANGE_PATTERN) || []

  const detected = [...amounts, ...ranges]

  for (const amount of detected) {
    pushUnique(report.inventedAmounts, amount)
    pushUnique(report.forbidden, "Ne jamais donner de montant ou fourchette de montant sans calcul officiel ou source intégrée.")
    pushUnique(report.recommendations, "Pour les montants CAF/APL/RSA, renvoyer vers une simulation officielle.")
    report.confidence -= 15
  }
}

function analyseDeadlines(report: TruthReport, rawText: string) {
  const deadlines = rawText.match(DEADLINE_PATTERN) || []

  for (const deadline of deadlines) {
    pushUnique(report.inventedDeadlines, deadline)
    pushUnique(report.forbidden, "Ne jamais annoncer un délai de traitement sans source officielle.")
    pushUnique(report.recommendations, "Dire que le délai dépend de l'organisme et du dossier.")
    report.confidence -= 10
  }
}

function analyseOrganizations(report: TruthReport, rawText: string) {
  const text = normalize(rawText)

  const knownFound = OFFICIAL_ORGANIZATIONS.filter(org =>
    text.includes(normalize(org))
  )

  knownFound.forEach(org => {
    pushUnique(report.confirmed, `Organisme reconnu : ${org}`)
  })

  if (text.includes("alon") || text.includes("association")) {
    pushUnique(report.warnings, "Organisme ou association locale mentionné : vérifier qu'il existe dans le référentiel BudgetKazPei avant de l'affirmer.")
    report.confidence -= 8
  }
}

function analyseQuestionRisk(report: TruthReport, question = "") {
  const text = normalize(question)

  if (text.includes("combien") || text.includes("gagn combien") || text.includes("montant")) {
    pushUnique(report.forbidden, "Ne pas inventer de montant en réponse à une question de montant.")
    pushUnique(report.recommendations, "Expliquer les critères qui influencent le montant et proposer une simulation officielle.")
    report.confidence -= 8
  }

  if (text.includes("droit") || text.includes("eligible") || text.includes("éligible")) {
    pushUnique(report.recommendations, "Répondre en termes d'éligibilité potentielle, jamais de droit certain.")
  }

  if (text.includes("dossier") && (text.includes("accepte") || text.includes("accepté") || text.includes("refuse") || text.includes("refusé"))) {
    pushUnique(report.forbidden, "Ne jamais confirmer l'état d'un dossier sans courrier, statut officiel ou mémoire confirmée.")
    report.confidence -= 10
  }
}

export function evaluateTruth(
  profile: any = {},
  memory: any = {},
  consistency: any = null,
  question = "",
  draftAnswer = "",
): TruthReport {
  const report = createEmptyReport()
  const normalizedDraft = normalize(draftAnswer)

  analyseProfile(report, profile)
  analyseConsistency(report, consistency)
  analyseQuestionRisk(report, question)

  if (draftAnswer) {
    analyseCertainty(report, normalizedDraft)
    analyseAmounts(report, draftAnswer)
    analyseDeadlines(report, draftAnswer)
    analyseOrganizations(report, draftAnswer)
  }

  if (memory?.stable_facts) {
    pushUnique(report.confirmed, "Mémoire utilisateur disponible")
  }

  pushUnique(report.forbidden, "Ne jamais inventer un montant, un délai, un droit, un organisme ou l'état d'un dossier.")
  pushUnique(report.forbidden, "Ne jamais déduire un salaire individuel à partir du revenu du foyer.")
  pushUnique(report.forbidden, "Ne jamais promettre qu'une aide sera accordée.")

  report.confidence = Math.max(0, Math.min(100, report.confidence))

  return report
}