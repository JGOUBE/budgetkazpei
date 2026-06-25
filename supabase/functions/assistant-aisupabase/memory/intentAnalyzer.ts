export type IntentComplexity = "simple" | "complex"

export type IntentAnalysis = {
  complexity: IntentComplexity
  reason: string
  confidence: number
}

const SIMPLE_PATTERNS = [
  /\brsa\b/i,
  /\bapl\b/i,
  /\bfsl\b/i,
  /\bcaf\b/i,
  /\bccas\b/i,
  /\bmdph\b/i,
  /\bfrance travail\b/i,
  /\bprime activite\b/i,
  /\bprime d.activite\b/i,

  /\bmarmay\b/i,
  /\benfant/i,
  /\btravail/i,
  /\bemploi/i,
  /\bchomage/i,
  /\blogement/i,
  /\bloyer/i,
  /\bmaison/i,
  /\bkaz\b/i,

  /\bsaint-leu\b/i,
  /\bsaint pierre\b/i,
  /\bsaint-pierre\b/i,
  /\bsaint paul\b/i,
  /\bsaint-paul\b/i,
]

const COMPLEX_PATTERNS = [
  /\brefus\b/i,
  /\brecours\b/i,
  /\bcourrier\b/i,
  /\bdecision\b/i,
  /\bcontentieux\b/i,
  /\bjustice\b/i,
  /\btribunal\b/i,

  /\bje comprends pas\b/i,
  /\bje ne comprends pas\b/i,
  /\bkoman\b/i,
  /\bkosa\b/i,

  /\bmais\b/i,
  /\bcependant\b/i,
  /\bpourtant\b/i,
  /\balors que\b/i,

  /\bplusieurs\b/i,
  /\bdeux dossiers\b/i,
  /\bplusieurs aides\b/i,

  /\bseparation\b/i,
  /\bdivorce\b/i,
  /\bsuccession\b/i,
]

export function analyzeIntent(
  question = "",
  memory: any = null,
): IntentAnalysis {
  const text = String(question).toLowerCase()

  if (text.length > 350) {
    return {
      complexity: "complex",
      reason: "Long message",
      confidence: 0.95,
    }
  }

  let complexScore = 0
  let simpleScore = 0

  for (const pattern of SIMPLE_PATTERNS) {
    if (pattern.test(text)) simpleScore++
  }

  for (const pattern of COMPLEX_PATTERNS) {
    if (pattern.test(text)) complexScore++
  }

  // Plusieurs sujets dans la même phrase
  if (
    (text.includes("caf") && text.includes("rsa")) ||
    (text.includes("travail") && text.includes("rsa")) ||
    (text.includes("loyer") && text.includes("refus")) ||
    (text.includes("emploi") && text.includes("caf"))
  ) {
    complexScore += 2
  }

  // Si un dossier est déjà actif, une courte précision reste simple
  if (
    memory?.living_case?.active_subject &&
    text.split(/\s+/).length <= 8 &&
    complexScore === 0
  ) {
    return {
      complexity: "simple",
      reason: "Continuation du dossier",
      confidence: 0.95,
    }
  }

  if (complexScore >= 2) {
    return {
      complexity: "complex",
      reason: "Situation complexe",
      confidence: 0.90,
    }
  }

  return {
    complexity: "simple",
    reason: "Information simple",
    confidence: 0.95,
  }
}