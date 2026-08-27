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

export interface TrustedAmountClaim {
  name: string
  amounts: number[]
}

function normalizeTrustedClaims(claims: TrustedAmountClaim[] = []) {
  return (Array.isArray(claims) ? claims : [])
    .map(claim => ({
      name: String(claim?.name || "").trim(),
      amounts: Array.from(new Set(
        (Array.isArray(claim?.amounts) ? claim.amounts : [])
          .map(value => Number(value))
          .filter(value => Number.isFinite(value) && value > 0)
      )),
    }))
    .filter(claim => claim.name && claim.amounts.length > 0)
}

function extractMoneyNumbers(value = "") {
  return (String(value || "")
    .replace(/\s+/g, "")
    .replace(/,/g, ".")
    .match(/\d+(?:\.\d+)?/g) || [])
    .map(item => Number(item))
    .filter(item => Number.isFinite(item) && item > 0)
}

function sentenceAroundValue(answer = "", value = "") {
  const index = answer.indexOf(value)
  if (index < 0) return ""

  const before = answer.slice(0, index)
  const after = answer.slice(index + value.length)

  const previousBoundary = Math.max(
    before.lastIndexOf("."),
    before.lastIndexOf("!"),
    before.lastIndexOf("?"),
    before.lastIndexOf("\n")
  )

  const boundaryCandidates = [
    after.indexOf("."),
    after.indexOf("!"),
    after.indexOf("?"),
    after.indexOf("\n"),
  ].filter(position => position >= 0)

  const nextBoundary = boundaryCandidates.length > 0
    ? Math.min(...boundaryCandidates)
    : after.length

  return `${before.slice(previousBoundary + 1)}${value}${after.slice(0, nextBoundary + 1)}`
}

function isTrustedMoneyClaim(
  answer: string,
  value: string,
  trustedAmountClaims: TrustedAmountClaim[] = [],
) {
  const numbers = extractMoneyNumbers(value)
  if (numbers.length === 0) return false

  const sentence = normalize(sentenceAroundValue(answer, value))
  if (!sentence) return false

  return normalizeTrustedClaims(trustedAmountClaims).some(claim => {
    const normalizedName = normalize(claim.name)
    if (!normalizedName || !sentence.includes(normalizedName)) return false

    return numbers.every(number =>
      claim.amounts.some(amount => Math.abs(amount - number) < 0.001)
    )
  })
}
function removeMoneyClaims(answer: string, language: "fr" | "kreol", trustedAmountClaims: TrustedAmountClaim[] = []) {
  let revised = answer
  const amountReplacement = language === "kreol"
    ? "in montant pou vérifié avèk in simulation officielle"
    : "un montant à vérifier par simulation officielle"

  const moneyRanges = unique(revised.match(MONEY_RANGE_PATTERN) || [])
  const moneyAmounts = unique(revised.match(MONEY_PATTERN) || [])

  for (const value of [...moneyRanges, ...moneyAmounts]) {
    if (isTrustedMoneyClaim(answer, value, trustedAmountClaims)) continue

    revised = revised.replace(
      value,
      amountReplacement
    )
  }

  revised = revised.replace(
    /l['’]apl\s+i\s+p[eé]\s+varier\s+[^.!\n]+[.!\n]?/gi,
    language === "kreol"
      ? "Montant l'APL i dépend plusieurs critères et i fo vérifie ali avèk in simulation officielle. "
      : "Le montant de l'APL dépend de plusieurs critères et doit être vérifié avec une simulation officielle. "
  )

  revised = revised.replace(
    /l['’]apl\s+peut\s+varier\s+[^.!\n]+[.!\n]?/gi,
    language === "kreol"
      ? "Montant l'APL i dépend plusieurs critères et i fo vérifie ali avèk in simulation officielle. "
      : "Le montant de l'APL dépend de plusieurs critères et doit être vérifié avec une simulation officielle. "
  )

  return revised
}

function softenCertainty(answer: string, language: "fr" | "kreol") {
  if (language === "kreol") {
    return answer
      .replace(/vous avez droit à/gi, "ou lé peut-être éligible à")
      .replace(/vous avez droit au/gi, "ou lé peut-être éligible au")
      .replace(/vous êtes éligible à/gi, "ou lé peut-être éligible à")
      .replace(/vous etes eligible a/gi, "ou lé peut-être éligible à")
      .replace(/vous recevrez/gi, "ou pourra peut-être recevoir, après validation officielle,")
      .replace(/vous toucherez/gi, "ou pourra peut-être gagne, après simulation officielle,")
      .replace(/votre dossier sera accepté/gi, "seul l'organisme i peut confirme si dossier-la lé accepté")
      .replace(/votre dossier est accepté/gi, "seul l'organisme i peut confirme si dossier-la lé accepté")
      .replace(/automatiquement/gi, "selon out situation et après vérification")
  }

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

function removeDeadlineClaims(answer: string, language: "fr" | "kreol") {
  const deadlines = unique(answer.match(DEADLINE_PATTERN) || [])
  let revised = answer

  for (const value of deadlines) {
    revised = revised.replace(
      value,
      language === "kreol"
        ? "selon délai traitement l'organisme"
        : "selon les délais de traitement de l'organisme"
    )
  }

  return revised
}

function detectIssues(answer: string, trustedAmountClaims: TrustedAmountClaim[] = []): ReviewIssue[] {
  const issues: ReviewIssue[] = []
  const normalized = normalize(answer)

  const moneyRanges = unique(answer.match(MONEY_RANGE_PATTERN) || [])
  const moneyAmounts = unique(answer.match(MONEY_PATTERN) || [])
  const deadlines = unique(answer.match(DEADLINE_PATTERN) || [])

  for (const value of [...moneyRanges, ...moneyAmounts]) {
    if (isTrustedMoneyClaim(answer, value, trustedAmountClaims)) continue

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
  trustedAmountClaims: TrustedAmountClaim[] = [],
): ReviewResult {
  const issues = detectIssues(answer, trustedAmountClaims)

  let revisedAnswer = answer
  revisedAnswer = removeMoneyClaims(revisedAnswer, language, trustedAmountClaims)
  revisedAnswer = removeDeadlineClaims(revisedAnswer, language)
  revisedAnswer = softenCertainty(revisedAnswer, language)
  revisedAnswer = addSafetySentenceIfNeeded(revisedAnswer, issues, language)

  return {
    ok: issues.length === 0,
    qualityScore: calculateQualityScore(issues),
    issues,
    revisedAnswer,
  }
}
