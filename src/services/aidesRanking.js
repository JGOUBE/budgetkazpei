import {
  findAidTopicIds,
  findPrimaryAidTopicIds,
  normalizeAidTopicText,
} from "./aidTopics.js"

const QUERY_STOP_WORDS = new Set([
  "aide", "aides", "financier", "financiere", "pour", "avec", "dans", "mes", "mon",
  "ma", "de", "des", "du", "le", "la", "les", "un", "une", "aux", "au", "en",
  "possible", "possibles", "cherche", "trouver", "besoin", "voudrais", "veux", "maintenant",
  "autre", "autres", "chose", "encore", "sinon", "rien", "quoi", "est", "ce", "que",
])

export function normalizeAidRankingText(value = "") {
  return normalizeAidTopicText(value)
}

export function normalizeAidIdentity(value = "") {
  return normalizeAidRankingText(value).replace(/\s+/g, "")
}

function aidName(aide = {}) {
  return String(aide.nom || aide.aide_nom || aide.nameFr || aide.name || "").trim()
}

function aidTextParts(aide = {}) {
  return {
    name: normalizeAidRankingText([
      aide.nom,
      aide.nom_kreol,
      aide.aide_nom,
      aide.nameFr,
      aide.nameKr,
    ].join(" ")),
    category: normalizeAidRankingText(aide.categorie || aide.category || ""),
    description: normalizeAidRankingText([
      aide.description,
      aide.description_fr,
      aide.description_kreol,
      aide.descriptionFr,
      aide.descriptionKr,
    ].join(" ")),
    steps: normalizeAidRankingText([
      aide.demarches,
      aide.demarches_fr,
      aide.demarches_kreol,
      aide.stepsFr,
      aide.stepsKr,
    ].join(" ")),
    conditions: normalizeAidRankingText([
      aide.condition_logement,
      aide.condition_profession,
      aide.condition_famille,
      aide.commune,
    ].join(" ")),
  }
}

function aidText(aide = {}) {
  return Object.values(aidTextParts(aide)).join(" ")
}

function contentTokens(value = "") {
  return [...new Set(
    normalizeAidRankingText(value)
      .split(" ")
      .filter(token => token.length >= 3 && !QUERY_STOP_WORDS.has(token))
  )]
}

export function questionRelevanceScore(aide, question = "") {
  const query = normalizeAidRankingText(question)
  if (!query) return 0

  const parts = aidTextParts(aide)
  const text = Object.values(parts).join(" ")
  const questionTopics = findPrimaryAidTopicIds(query)
  const primaryAidTopics = new Set(findAidTopicIds(`${parts.name} ${parts.category}`))
  const secondaryAidTopics = new Set(findAidTopicIds([
    parts.description,
    parts.conditions,
    parts.steps,
  ].join(" ")))
  const primaryTopicOverlap = questionTopics.filter(topic => primaryAidTopics.has(topic)).length
  const secondaryOnlyTopicOverlap = questionTopics.filter(
    topic => !primaryAidTopics.has(topic) && secondaryAidTopics.has(topic)
  ).length
  const tokens = contentTokens(query)
  const normalizedName = normalizeAidRankingText(aidName(aide))

  // Le nom et la catégorie décrivent le sujet principal de l'aide. Une mention
  // dans une description, une condition ou une démarche reste un signal utile,
  // mais ne doit jamais recevoir le même poids que ce thème principal.
  let score = primaryTopicOverlap * 360 + secondaryOnlyTopicOverlap * 70
  if (normalizedName && ` ${query} `.includes(` ${normalizedName} `)) score += 420

  for (const token of tokens) {
    if (parts.name.split(" ").includes(token)) score += 70
    else if (parts.category.split(" ").includes(token)) score += 60
    else if (parts.description.includes(token)) score += 28
    else if (parts.conditions.includes(token) || parts.steps.includes(token)) score += 18
  }

  if (questionTopics.length > 0 && primaryTopicOverlap === 0 && secondaryOnlyTopicOverlap === 0) score -= 180
  return score
}

export function profileRelevanceScore(aide, profile = {}) {
  let score = Number(aide.score_priorite || 0)
  const commune = normalizeAidRankingText(profile?.commune || "")
  const enfants = Number(profile?.nombre_enfants || 0)
  const logement = normalizeAidRankingText(profile?.logement || "")
  const situationPro = normalizeAidRankingText(profile?.situation_professionnelle || "")
  const text = aidText(aide)

  if (commune && (normalizeAidRankingText(aide.commune) === commune || text.includes(commune))) score += 40
  if (enfants > 0 && (aide.besoin_enfant || text.includes("famille") || text.includes("scolaire"))) score += 35
  if (logement === "locataire" && (aide.besoin_locataire || text.includes("logement") || text.includes("apl"))) score += 30
  if (logement.includes("proprietaire") && aide.besoin_proprietaire) score += 30
  if (situationPro.includes("demandeur") && (aide.besoin_demandeur_emploi || text.includes("emploi"))) score += 30
  if (aide.besoin_allocataire_caf && profile?.allocataire_caf) score += 20

  return score
}

function normalizeIdSet(values = []) {
  return new Set((Array.isArray(values) ? values : []).map(value => String(value)))
}

function normalizeNameSet(values = []) {
  return new Set((Array.isArray(values) ? values : []).map(normalizeAidIdentity).filter(Boolean))
}

function isPreferredAid(aide, preferredIds, preferredNames) {
  return preferredIds.has(String(aide?.id)) || preferredNames.has(normalizeAidIdentity(aidName(aide)))
}

export function scoreAidForAdvisor(aide, profile = {}, question = "", options = {}) {
  const preferredIds = normalizeIdSet(options.preferredAidIds)
  const preferredNames = normalizeNameSet(options.preferredAidNames)
  const preferredBonus = isPreferredAid(aide, preferredIds, preferredNames) ? 500 : 0
  return questionRelevanceScore(aide, question) + profileRelevanceScore(aide, profile) + preferredBonus
}

export function rankAidesForAdvisor(aides = [], profile = {}, question = "", options = {}) {
  const excludedIds = normalizeIdSet(options.excludeIds)
  const excludedNames = normalizeNameSet(options.excludeNames)
  const candidatesByName = new Map()

  for (const aide of Array.isArray(aides) ? aides : []) {
    const identity = normalizeAidIdentity(aidName(aide)) || `id:${String(aide?.id || "")}`
    if (excludedIds.has(String(aide?.id)) || excludedNames.has(identity)) continue

    const current = candidatesByName.get(identity)
    if (!current || scoreAidForAdvisor(aide, profile, question, options) > scoreAidForAdvisor(current, profile, question, options)) {
      candidatesByName.set(identity, aide)
    }
  }

  return [...candidatesByName.values()].sort((a, b) => {
    const totalDifference = scoreAidForAdvisor(b, profile, question, options) - scoreAidForAdvisor(a, profile, question, options)
    if (totalDifference !== 0) return totalDifference
    return questionRelevanceScore(b, question) - questionRelevanceScore(a, question)
  })
}

export function selectAidCandidatesForAdvisor(aides = [], profile = {}, question = "", options = {}) {
  const ranked = rankAidesForAdvisor(aides, profile, question, options)
  const hasActiveTopic = findPrimaryAidTopicIds(question).length > 0
  if (!hasActiveTopic) return ranked

  return ranked.filter(aide => questionRelevanceScore(aide, question) > 0)
}

// Compatibilité avec les appels existants. La reconstruction complète du
// contexte est assurée par buildAdvisorConversationContext().
export function buildAidRankingQuery(question = "", recentHistory = []) {
  const currentQuestion = String(question || "").trim()
  if (!currentQuestion) return ""
  const topics = findPrimaryAidTopicIds(currentQuestion)
  if (topics.length > 0) return currentQuestion

  const previousQuestion = (Array.isArray(recentHistory) ? recentHistory : [])
    .map(item => String(item?.conversationContext?.activeTopic?.query || item?.question || "").trim())
    .find(previous => previous && findPrimaryAidTopicIds(previous).length > 0)
  return previousQuestion ? `${previousQuestion} ${currentQuestion}`.trim() : currentQuestion
}
