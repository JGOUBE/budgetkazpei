export type AssistantLanguage = "fr" | "kreol"

const KREOL_STRONG_MARKERS = [
  "mi", "moin", "mwin", "bann", "marmay", "zot", "aou", "kosa", "gagn",
  "domann", "koman", "koze", "koz", "travay", "nout", "ankor", "bonzour",
]

const KREOL_WEAK_MARKERS = ["pou", "ek", "dann", "out", "na", "kaz", "pei", "renyon"]

const FRENCH_MARKERS = [
  "je", "vous", "votre", "mes", "des", "les", "une", "pour", "avec", "dans",
  "comment", "pourquoi", "existe", "aide", "aides", "activite", "activites",
  "sportive", "sportives", "enfant", "enfants", "besoin", "voudrais", "souhaite",
  "peux", "pouvez", "quels", "quelle", "quelles", "moi", "preparer", "dossier",
  "connaitre", "faire",
]

function normalizeText(value: unknown = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9+\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function normalizeAdvisorLanguage(value: unknown): AssistantLanguage | null {
  const clean = normalizeText(value)
  if (["kr", "cr", "kreol", "creole"].includes(clean)) return "kreol"
  if (["fr", "francais", "french"].includes(clean)) return "fr"
  return null
}

export function allowsBilingualAdvisorResponse(message: unknown = "") {
  const text = normalizeText(message)
  return /\b(bilingue|deux langues)\b/.test(text) ||
    /\b(francais et (?:le )?(?:kreol|creole)|(?:kreol|creole) et (?:le )?francais)\b/.test(text)
}

export function detectExplicitAdvisorLanguage(message: unknown = ""): AssistantLanguage | null {
  const text = normalizeText(message)
  if (!text) return null

  const actionPattern = /\b(repond|reponds|repondez|tradui|traduis|traduire|ecri|ecris|ecrivez|parle|parlez|formule|formulez|explique|expliquez)\b/
  if (!actionPattern.test(text) && !/^en (?:francais|kreol|creole)\b/.test(text)) return null

  const targets = [
    { language: "fr" as const, index: text.lastIndexOf("en francais") },
    { language: "kreol" as const, index: Math.max(text.lastIndexOf("en kreol"), text.lastIndexOf("en creole")) },
  ].filter(target => target.index >= 0)

  if (targets.length === 0) return null
  return targets.sort((a, b) => b.index - a.index)[0].language
}

export function detectAdvisorMessageLanguage(message: unknown = ""): AssistantLanguage | null {
  const text = normalizeText(message)
  if (!text) return null

  const words = new Set(text.split(" ").filter(Boolean))
  const kreolStrongScore = KREOL_STRONG_MARKERS.reduce((score, marker) => score + (words.has(marker) ? 3 : 0), 0)
  const kreolWeakScore = KREOL_WEAK_MARKERS.reduce((score, marker) => score + (words.has(marker) ? 1 : 0), 0)
  const kreolScore = kreolStrongScore + kreolWeakScore
  const frenchScore = FRENCH_MARKERS.reduce((score, marker) => score + (words.has(marker) ? 1 : 0), 0)

  if (kreolScore >= 3 && kreolScore > frenchScore) return "kreol"
  if (frenchScore >= 2 && frenchScore >= kreolScore) return "fr"
  return null
}

export function resolveAdvisorLanguage({
  message = "",
  interfaceLanguage = "",
  fallbackLanguage = "fr",
}: {
  message?: unknown
  interfaceLanguage?: unknown
  fallbackLanguage?: unknown
} = {}): AssistantLanguage {
  return detectExplicitAdvisorLanguage(message) ||
    detectAdvisorMessageLanguage(message) ||
    normalizeAdvisorLanguage(interfaceLanguage) ||
    normalizeAdvisorLanguage(fallbackLanguage) ||
    "fr"
}

export function selectAdvisorLocalizedContext(context: Record<string, unknown> = {}, language: AssistantLanguage) {
  const pick = (primary: unknown, fallback: unknown) => String(primary || fallback || "").trim()

  return {
    aideId: context.aideId ?? null,
    aideName: language === "kreol"
      ? pick(context.aideNameKreol, context.aideNameFr)
      : pick(context.aideNameFr, context.aideNameKreol),
    category: String(context.category || "").trim(),
    status: String(context.status || "").trim(),
    description: language === "kreol"
      ? pick(context.descriptionKreol, context.descriptionFr || context.description)
      : pick(context.descriptionFr || context.description, context.descriptionKreol),
    steps: language === "kreol"
      ? pick(context.stepsKreol, context.stepsFr || context.steps)
      : pick(context.stepsFr || context.steps, context.stepsKreol),
    addedAt: String(context.addedAt || "").trim(),
  }
}
