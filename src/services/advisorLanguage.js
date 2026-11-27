const KREOL_STRONG_MARKERS = [
  "mi", "moin", "mwin", "bann", "marmay", "zot", "aou", "kosa", "gagn",
  "domann", "koman", "koze", "koz", "travay", "nout", "ankor", "bonzour",
  "bidze", "depans", "lekonomi", "mersi", "poukwa", "poukoi", "marmaille", "kourrie", "kombyin",
]

const KREOL_WEAK_MARKERS = ["pou", "ek", "dann", "out", "na", "kaz", "pei", "renyon", "zed", "aste", "pwin", "poin"]

const FRENCH_MARKERS = [
  "je", "vous", "votre", "mes", "des", "les", "une", "pour", "avec", "dans",
  "comment", "pourquoi", "existe", "aide", "aides", "activite", "activites",
  "sportive", "sportives", "enfant", "enfants", "besoin", "voudrais", "souhaite",
  "peux", "pouvez", "quels", "quelle", "quelles", "moi", "preparer", "dossier",
  "connaitre", "faire",
]

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9+\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function normalizeAdvisorLanguage(value) {
  const clean = normalizeText(value)
  if (["kr", "cr", "kreol", "creole"].includes(clean)) return "kreol"
  if (["fr", "francais", "french"].includes(clean)) return "fr"
  return null
}

export function allowsBilingualAdvisorResponse(message = "") {
  const text = normalizeText(message)
  return /\b(bilingue|deux langues)\b/.test(text) ||
    /\b(francais et (?:le )?(?:kreol|creole)|(?:kreol|creole) et (?:le )?francais)\b/.test(text)
}

export function detectExplicitAdvisorLanguage(message = "") {
  const text = normalizeText(message)
  if (!text) return null

  const actionPattern = /\b(repond|reponds|repondez|repon|tradui|traduis|traduire|ecri|ecris|ecrivez|parle|parlez|koz|koze|formule|formulez|explique|expliquez|esplik)\b/
  if (!actionPattern.test(text) && !/^en (?:francais|kreol|creole)\b/.test(text)) return null

  const targets = [
    { language: "fr", index: text.lastIndexOf("en francais") },
    { language: "kreol", index: Math.max(text.lastIndexOf("en kreol"), text.lastIndexOf("en creole")) },
  ].filter(target => target.index >= 0)

  if (targets.length === 0) return null
  return targets.sort((a, b) => b.index - a.index)[0].language
}

export function detectAdvisorMessageLanguage(message = "") {
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

export function resolveAdvisorLanguage({ message = "", interfaceLanguage = "", fallbackLanguage = "fr" } = {}) {
  const explicit = detectExplicitAdvisorLanguage(message)
  const selected = normalizeAdvisorLanguage(interfaceLanguage)
  // KR is an intentional interface choice. Do not silently switch the answer
  // back to French just because a question contains French/administrative terms.
  // A direct "réponds en français" still overrides the selected language.
  return explicit ||
    (selected === "kreol" ? "kreol" : null) ||
    detectAdvisorMessageLanguage(message) ||
    selected ||
    normalizeAdvisorLanguage(fallbackLanguage) ||
    "fr"
}
