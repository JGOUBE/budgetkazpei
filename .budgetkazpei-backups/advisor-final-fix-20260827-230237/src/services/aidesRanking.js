const SPORT_QUERY_TERMS = [
  "sport",
  "sports",
  "sportif",
  "sportive",
  "club",
  "clubs",
  "licence",
  "licences",
  "cotisation",
  "loisir",
  "loisirs",
  "judo",
  "tennis",
  "surf",
  "football",
  "foot",
  "athletisme",
  "natation",
  "rugby",
  "basket",
  "handball",
  "karate",
  "taekwondo",
  "capoeira",
]

const SPORT_AIDE_TERMS = [
  "sport",
  "sportif",
  "club",
  "licence",
  "pass sport",
  "5000 licences",
  "5 000 licences",
  "cros",
  "loisir",
]

const QUERY_STOP_WORDS = new Set([
  "aide", "aides", "financier", "financiere", "pour", "avec", "dans", "mes", "mon",
  "ma", "de", "des", "du", "le", "la", "les", "un", "une", "aux", "au", "enfant",
  "enfants", "marmay", "famille", "possible", "possibles", "cherche", "trouver",
])

export function normalizeAidRankingText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[â€™'`Â´]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
}

function aidText(aide = {}) {
  return normalizeAidRankingText([
    aide.nom,
    aide.nom_kreol,
    aide.aide_nom,
    aide.categorie,
    aide.description,
    aide.description_fr,
    aide.description_kreol,
    aide.demarches_fr,
    aide.demarches_kreol,
    aide.organisme,
  ].join(" "))
}

function containsAny(text, terms) {
  return terms.some(term => text.includes(normalizeAidRankingText(term)))
}

function questionRelevanceScore(aide, question = "") {
  const query = normalizeAidRankingText(question)
  if (!query) return 0

  const text = aidText(aide)
  let score = 0
  const isSportQuestion = containsAny(query, SPORT_QUERY_TERMS)

  // L'intention de la question doit peser plus lourd qu'un score_priorite gÃ©nÃ©rique.
  if (isSportQuestion && containsAny(text, SPORT_AIDE_TERMS)) score += 220
  if (isSportQuestion && text.includes("pass sport")) score += 35
  if (isSportQuestion && (text.includes("5000 licences") || text.includes("5 000 licences"))) score += 35

  const queryTokens = [...new Set(
    query
      .split(" ")
      .filter(token => token.length >= 3 && !QUERY_STOP_WORDS.has(token))
  )]

  const overlap = queryTokens.filter(token => text.includes(token)).length
  score += Math.min(overlap * 25, 100)

  return score
}

function profileRelevanceScore(aide, profile = {}) {
  let score = Number(aide.score_priorite || 0)
  const commune = normalizeAidRankingText(profile?.commune || "")
  const enfants = Number(profile?.nombre_enfants || 0)
  const logement = normalizeAidRankingText(profile?.logement || "")
  const situationPro = normalizeAidRankingText(profile?.situation_professionnelle || "")
  const text = aidText(aide)

  if (commune && text.includes(commune)) score += 40
  if (enfants > 0 && (aide.besoin_enfant || text.includes("famille") || text.includes("scolaire"))) score += 35
  if (logement === "locataire" && (aide.besoin_locataire || text.includes("logement") || text.includes("apl"))) score += 30
  if (situationPro.includes("demandeur") && (aide.besoin_demandeur_emploi || text.includes("emploi"))) score += 30
  if (aide.besoin_allocataire_caf && profile?.allocataire_caf) score += 20

  return score
}

const FOLLOW_UP_PATTERNS = [
  /^et\b/,
  /^mais\b/,
  /^sinon\b/,
  /^alors\b/,
  /^aussi\b/,
  /\bune autre aide\b/,
  /\bautre aide\b/,
  /\bd autres aides\b/,
  /\bquoi d autre\b/,
  /\bencore une\b/,
  /\by en a d autres\b/,
  /\bil y en a d autres\b/,
  /\bil y a pas une autre\b/,
  /\best ce qu il y en a une autre\b/,
  /\bet pour ca\b/,
  /\bet pour cela\b/,
]

function isAidFollowUpQuestion(question = "") {
  const normalized = normalizeAidRankingText(question)
  if (!normalized) return false
  return FOLLOW_UP_PATTERNS.some(pattern => pattern.test(normalized))
}

export function buildAidRankingQuery(question = "", recentHistory = []) {
  const currentQuestion = String(question || "").trim()
  if (!currentQuestion) return ""

  if (!isAidFollowUpQuestion(currentQuestion)) {
    return currentQuestion
  }

  const previousQuestion = (Array.isArray(recentHistory) ? recentHistory : [])
    .map(item => String(item?.question || "").trim())
    .find(Boolean)

  if (!previousQuestion) {
    return currentQuestion
  }

  return `${previousQuestion} ${currentQuestion}`.trim()
}
export function scoreAidForAdvisor(aide, profile = {}, question = "") {
  return profileRelevanceScore(aide, profile) + questionRelevanceScore(aide, question)
}

export function rankAidesForAdvisor(aides = [], profile = {}, question = "") {
  return [...aides].sort(
    (a, b) => scoreAidForAdvisor(b, profile, question) - scoreAidForAdvisor(a, profile, question)
  )
}