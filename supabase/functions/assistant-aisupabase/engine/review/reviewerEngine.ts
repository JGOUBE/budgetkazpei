import {
  CERTAINTY_FORBIDDEN_PATTERNS,
  DEADLINE_PATTERN,
  MONEY_PATTERN,
  MONEY_RANGE_PATTERN,
} from "../truth/truthRules.ts"

export interface ReviewIssue {
  type: "amount" | "deadline" | "certainty" | "promise"
  value: string
  severity: "low" | "medium" | "high"
}

export interface ReviewResult {
  ok: boolean
  qualityScore: number
  issues: ReviewIssue[]
  revisedAnswer: string
}

function normalize(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}

function removeMoneyClaims(answer: string) {
  let revised = answer

  const moneyRanges = unique(revised.match(MONEY_RANGE_PATTERN) || [])
  const moneyAmounts = unique(revised.match(MONEY_PATTERN) || [])

  for (const value of [...moneyRanges, ...moneyAmounts]) {
    revised = revised.replace(
      value,
      "un montant à vérifier par simulation officielle"
    )
  }

  revised = revised.replace(
    /l['’]apl\s+i\s+p[eé]\s+varier\s+[^.!\n]+[.!\n]?/gi,
    "Le montant de l'APL dépend de plusieurs critères et doit être vérifié avec une simulation officielle. "
  )

  revised = revised.replace(
    /l['’]apl\s+peut\s+varier\s+[^.!\n]+[.!\n]?/gi,
    "Le montant de l'APL dépend de plusieurs critères et doit être vérifié avec une simulation officielle. "
  )

  return revised
}

function softenCertainty(answer: string) {
  return answer
    .replace(/vous avez droit à/gi, "vous pourriez être éligible à")
    .replace(/vous avez droit au/gi, "vous pourriez être éligible au")
    .replace(/vous êtes éligible à/gi, "vous pourriez être éligible à")
    .replace(/vous etes eligible a/gi, "vous pourriez être éligible à")
    .replace(/vous recevrez/gi, "vous pourriez recevoir, sous réserve de validation officielle,")
    .replace(/vous toucherez/gi, "vous pourriez toucher, sous réserve de simulation officielle,")
    .replace(/votre dossier sera accepté/gi, "seul l'organisme peut confirmer l'acceptation du dossier")
    .replace(/votre dossier est accepté/gi, "seul l'organisme peut confirmer l'acceptation du dossier")
    .replace(/automatiquement/gi, "selon la situation et après vérification")
}

function removeDeadlineClaims(answer: string) {
  const deadlines = unique(answer.match(DEADLINE_PATTERN) || [])
  let revised = answer

  for (const value of deadlines) {
    revised = revised.replace(
      value,
      "selon les délais de traitement de l'organisme"
    )
  }

  return revised
}

function detectIssues(answer: string): ReviewIssue[] {
  const issues: ReviewIssue[] = []
  const normalized = normalize(answer)

  const moneyRanges = unique(answer.match(MONEY_RANGE_PATTERN) || [])
  const moneyAmounts = unique(answer.match(MONEY_PATTERN) || [])
  const deadlines = unique(answer.match(DEADLINE_PATTERN) || [])

  for (const value of [...moneyRanges, ...moneyAmounts]) {
    issues.push({
      type: "amount",
      value,
      severity: "high",
    })
  }

  for (const value of deadlines) {
    issues.push({
      type: "deadline",
      value,
      severity: "medium",
    })
  }

  for (const pattern of CERTAINTY_FORBIDDEN_PATTERNS) {
    if (normalized.includes(normalize(pattern))) {
      issues.push({
        type: "certainty",
        value: pattern,
        severity: "high",
      })
    }
  }

  if (
    normalized.includes("sera accepte") ||
    normalized.includes("sera accepté") ||
    normalized.includes("va accepter") ||
    normalized.includes("va etre verse") ||
    normalized.includes("va être versé")
  ) {
    issues.push({
      type: "promise",
      value: "promesse de décision ou de versement",
      severity: "high",
    })
  }

  return issues
}

function calculateQualityScore(issues: ReviewIssue[]) {
  let score = 100

  for (const issue of issues) {
    if (issue.severity === "high") score -= 18
    if (issue.severity === "medium") score -= 10
    if (issue.severity === "low") score -= 5
  }

  return Math.max(0, Math.min(100, score))
}

function addSafetySentenceIfNeeded(answer: string, issues: ReviewIssue[], language: "fr" | "kreol") {
  if (issues.length === 0) return answer

  const hasAmountIssue = issues.some(issue => issue.type === "amount")
  const hasCertaintyIssue = issues.some(issue => issue.type === "certainty" || issue.type === "promise")

  if (language === "kreol") {
    if (hasAmountIssue) {
      return `${answer.trim()}\n\nMi pé pa donn in montant fiable san simulation officielle. Le mieux, c'est fé simulation CAF pou vérifier.`
    }

    if (hasCertaintyIssue) {
      return `${answer.trim()}\n\nPou être sûr, i fo vérifier ek l'organisme concerné.`
    }
  }

  if (hasAmountIssue) {
    return `${answer.trim()}\n\nJe ne peux pas donner un montant fiable sans simulation officielle. Le mieux est de vérifier avec le simulateur de l'organisme concerné.`
  }

  if (hasCertaintyIssue) {
    return `${answer.trim()}\n\nPour confirmer, il faut vérifier directement auprès de l'organisme concerné.`
  }

  return answer
}

export function reviewAssistantAnswer(
  answer: string,
  language: "fr" | "kreol" = "fr",
): ReviewResult {
  const issues = detectIssues(answer)

  let revisedAnswer = answer
  revisedAnswer = removeMoneyClaims(revisedAnswer)
  revisedAnswer = removeDeadlineClaims(revisedAnswer)
  revisedAnswer = softenCertainty(revisedAnswer)
  revisedAnswer = addSafetySentenceIfNeeded(revisedAnswer, issues, language)

  return {
    ok: issues.length === 0,
    qualityScore: calculateQualityScore(issues),
    issues,
    revisedAnswer,
  }
}