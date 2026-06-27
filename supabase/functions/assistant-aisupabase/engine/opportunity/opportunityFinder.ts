import type { OpportunityItem } from "./types.ts"
import type { ProfileAnalysis } from "./profileAnalyzer.ts"

function normalize(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
}

function includesAny(text = "", values: string[]) {
  const normalized = normalize(text)
  return values.some(value => normalized.includes(normalize(value)))
}

function matchesProfileTags(aide: OpportunityItem, analysis: ProfileAnalysis) {
  const text = [
    aide.nom,
    aide.categorie,
    aide.organisme,
    aide.description,
    aide.commune,
    aide.departement,
  ]
    .filter(Boolean)
    .join(" ")

  const matches: string[] = []

  const checks = [
    { tag: "locataire", words: ["logement", "apl", "loyer", "fsl", "location"] },
    { tag: "famille_avec_enfants", words: ["enfant", "famille", "scolaire", "cantine", "garde"] },
    { tag: "demandeur_emploi", words: ["emploi", "chomage", "chômage", "france travail", "formation"] },
    { tag: "salarie", words: ["activité", "activite", "prime", "emploi", "travail"] },
    { tag: "etudiant", words: ["étudiant", "etudiant", "formation", "bourse", "crous"] },
    { tag: "handicap", words: ["handicap", "mdph", "aah", "rqth", "invalidité", "invalidite"] },
    { tag: "retraite", words: ["retraite", "senior", "aspa", "vieillesse"] },
    { tag: "mobilite_a_verifier", words: ["mobilité", "mobilite", "transport", "permis", "voiture"] },
    { tag: "revenus_modestes", words: ["aide", "social", "solidarité", "solidarite", "caf", "rsa"] },
    { tag: "revenus_tres_modestes", words: ["urgence", "alimentaire", "rsa", "ccas", "solidarité", "solidarite"] },
  ]

  for (const check of checks) {
    if (analysis.tags.includes(check.tag) && includesAny(text, check.words)) {
      matches.push(check.tag)
    }
  }

  return matches
}

function matchesLocation(aide: OpportunityItem, analysis: ProfileAnalysis) {
  const aideCommune = normalize(aide.commune)
  const aideDepartement = normalize(aide.departement)
  const userCommune = normalize(analysis.profile.commune)
  const userDepartement = normalize(analysis.profile.departement || "974")

  if (!aideCommune && !aideDepartement) return true
  if (aideCommune && userCommune && aideCommune === userCommune) return true
  if (aideDepartement && userDepartement && aideDepartement === userDepartement) return true
  if (aideDepartement === "974" || aideDepartement === "reunion" || aideDepartement === "la reunion") return true

  return false
}

export interface OpportunityCandidate {
  aide: OpportunityItem
  matchedTags: string[]
  matchedLocation: boolean
  initialReason: string
}

export function findOpportunityCandidates(
  aides: OpportunityItem[],
  analysis: ProfileAnalysis,
): OpportunityCandidate[] {
  const candidates: OpportunityCandidate[] = []

  for (const aide of aides) {
    if (!aide.actif) continue

    const matchedLocation = matchesLocation(aide, analysis)
    if (!matchedLocation) continue

    const matchedTags = matchesProfileTags(aide, analysis)

    const isBroadAid = includesAny(
      `${aide.nom} ${aide.categorie} ${aide.description}`,
      ["caf", "rsa", "apl", "ccas", "solidarité", "solidarite", "logement", "famille", "emploi"]
    )

    if (matchedTags.length === 0 && !isBroadAid) continue

    candidates.push({
      aide,
      matchedTags,
      matchedLocation,
      initialReason:
        matchedTags.length > 0
          ? `Correspond au profil : ${matchedTags.join(", ")}`
          : "Aide générale potentiellement utile à vérifier",
    })
  }

  return candidates
}