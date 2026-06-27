import type { OpportunityResult } from "./types.ts"
import type { ScoredOpportunity } from "./eligibilityScorer.ts"

function sortByScore(items: ScoredOpportunity[]) {
  return [...items].sort((a, b) => b.score - a.score)
}

export function planOpportunityPriorities(
  scored: ScoredOpportunity[],
): OpportunityResult {
  const highProbability = sortByScore(
    scored.filter(item => item.probability === "high")
  ).map(item => item.aide)

  const mediumProbability = sortByScore(
    scored.filter(item => item.probability === "medium")
  ).map(item => item.aide)

  const lowProbability = sortByScore(
    scored.filter(item => item.probability === "low")
  ).map(item => item.aide)

  return {
    totalDetected: scored.length,
    highProbability,
    mediumProbability,
    lowProbability,
    rejected: [],
  }
}