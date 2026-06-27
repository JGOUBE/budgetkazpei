import type { OpportunityItem } from "./types.ts"
import type { ProfileAnalysis } from "./profileAnalyzer.ts"
import type { OpportunityCandidate } from "./opportunityFinder.ts"

export interface ScoredOpportunity {
  aide: OpportunityItem
  score: number
  probability: "high" | "medium" | "low"
  reasons: string[]
  warnings: string[]
}

function pushUnique(list: string[], value: string) {
  if (!list.includes(value)) list.push(value)
}

export function scoreOpportunity(
  candidate: OpportunityCandidate,
  analysis: ProfileAnalysis,
): ScoredOpportunity {
  let score = 35
  const reasons: string[] = []
  const warnings: string[] = []

  if (candidate.matchedLocation) {
    score += 15
    pushUnique(reasons, "Aide compatible avec la zone connue")
  }

  if (candidate.matchedTags.length > 0) {
    score += candidate.matchedTags.length * 10
    pushUnique(reasons, `Correspondance profil : ${candidate.matchedTags.join(", ")}`)
  }

  if (analysis.missing.length > 0) {
    score -= Math.min(20, analysis.missing.length * 5)
    pushUnique(warnings, `Informations manquantes : ${analysis.missing.join(", ")}`)
  }

  if (analysis.risks.length > 0) {
    score += Math.min(15, analysis.risks.length * 5)
    pushUnique(reasons, `Points de vigilance : ${analysis.risks.join(", ")}`)
  }

  if (
    analysis.tags.includes("locataire") &&
    ["logement", "aide logement", "apl", "fsl"].some(word =>
      `${candidate.aide.nom} ${candidate.aide.categorie} ${candidate.aide.description}`
        .toLowerCase()
        .includes(word)
    )
  ) {
    score += 15
    pushUnique(reasons, "Le profil indique une situation de locataire")
  }

  if (
    analysis.tags.includes("famille_avec_enfants") &&
    `${candidate.aide.nom} ${candidate.aide.categorie} ${candidate.aide.description}`
      .toLowerCase()
      .includes("enfant")
  ) {
    score += 12
    pushUnique(reasons, "Le profil indique un foyer avec enfant(s)")
  }

  if (
    analysis.tags.includes("demandeur_emploi") &&
    `${candidate.aide.nom} ${candidate.aide.categorie} ${candidate.aide.description}`
      .toLowerCase()
      .includes("emploi")
  ) {
    score += 12
    pushUnique(reasons, "Le profil indique une situation liée à l'emploi")
  }

  score = Math.max(0, Math.min(100, score))

  let probability: "high" | "medium" | "low" = "low"

  if (score >= 75) {
    probability = "high"
  } else if (score >= 50) {
    probability = "medium"
  }

  return {
    aide: {
      ...candidate.aide,
      score,
      reason: reasons.join(" | "),
    },
    score,
    probability,
    reasons,
    warnings,
  }
}

export function scoreOpportunities(
  candidates: OpportunityCandidate[],
  analysis: ProfileAnalysis,
): ScoredOpportunity[] {
  return candidates
    .map(candidate => scoreOpportunity(candidate, analysis))
    .sort((a, b) => b.score - a.score)
}