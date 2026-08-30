import { findPrimaryAidTopicIds, normalizeAidTopicText } from "./aidTopics.js"
import { normalizeAidIdentity } from "./aidesRanking.js"

export const ADVISOR_TURN_TYPES = Object.freeze({
  NEW_TOPIC: "NEW_TOPIC",
  FOLLOW_UP: "FOLLOW_UP",
  REQUEST_ALTERNATIVE: "REQUEST_ALTERNATIVE",
  ASK_DETAILS: "ASK_DETAILS",
  NEXT_STEP: "NEXT_STEP",
  CORRECTION: "CORRECTION",
})

const ALTERNATIVE_MARKERS = [
  "autre aide", "autre chose", "quoi d autre", "rien d autre", "rien d autres",
  "encore une", "encore autre", "et sinon", "sinon", "y en a d autres", "il y a pas une autre",
]
const DETAIL_MARKERS = [
  "combien", "montant", "quelles conditions", "quelle condition", "eligible", "eligibilite",
  "comment faire", "comment je fais", "comment la demander", "comment le demander",
  "ou faire", "ou demander", "demarches", "documents", "justificatifs",
]
const NEXT_STEP_MARKERS = ["et ensuite", "je fais quoi maintenant", "prochaine etape", "quelle suite", "apres ca"]
const CORRECTION_MARKERS = ["en fait", "je corrige", "ce n est pas", "pas exactement", "je voulais dire"]

function includesMarker(text, markers) {
  return markers.some(marker => ` ${text} `.includes(` ${marker} `))
}

function sameTopics(left = [], right = []) {
  if (left.length === 0 || right.length === 0) return false
  return left.some(topic => right.includes(topic))
}

function aidName(aide = {}) {
  return String(aide.nom || aide.aide_nom || aide.nameFr || aide.name || "").trim()
}

function inferAidMentions(answer = "", aides = []) {
  const normalizedAnswer = normalizeAidTopicText(answer)
  if (!normalizedAnswer) return []

  const uniqueAides = new Map()
  for (const aide of Array.isArray(aides) ? aides : []) {
    const name = aidName(aide)
    const identity = normalizeAidIdentity(name)
    if (!name || !identity || uniqueAides.has(identity)) continue
    uniqueAides.set(identity, { id: aide.id, name })
  }

  return [...uniqueAides.values()]
    .map(aide => ({ ...aide, index: normalizedAnswer.indexOf(normalizeAidTopicText(aide.name)) }))
    .filter(aide => aide.index >= 0)
    .sort((a, b) => a.index - b.index)
}

function inferPreviousActiveTopic(history = []) {
  for (const item of history) {
    const stored = item?.conversationContext?.activeTopic
    if (stored?.query) {
      return {
        query: String(stored.query),
        domains: Array.isArray(stored.domains) ? stored.domains : findPrimaryAidTopicIds(stored.query),
      }
    }

    const question = String(item?.question || "").trim()
    const domains = findPrimaryAidTopicIds(question)
    if (question && domains.length > 0) return { query: question, domains }
  }
  return null
}

function collectPreviousRecommendations(history = [], aides = [], activeTopic = null) {
  const ids = []
  const names = []
  const seenIds = new Set()
  const seenNames = new Set()

  const addId = value => {
    if (value === null || value === undefined || String(value).trim() === "") return
    const normalized = String(value)
    if (!seenIds.has(normalized)) {
      seenIds.add(normalized)
      ids.push(value)
    }
  }
  const addName = value => {
    const name = String(value || "").trim()
    const normalized = normalizeAidIdentity(name)
    if (name && normalized && !seenNames.has(normalized)) {
      seenNames.add(normalized)
      names.push(name)
    }
  }

  for (const item of history) {
    const itemTopic = item?.conversationContext?.activeTopic
    if (
      activeTopic?.domains?.length > 0 &&
      itemTopic?.domains?.length > 0 &&
      !sameTopics(activeTopic.domains, itemTopic.domains)
    ) break

    const storedContext = item?.conversationContext || {}
    const storedIds = [
      ...(Array.isArray(storedContext.previouslyRecommendedAidIds) ? storedContext.previouslyRecommendedAidIds : []),
      ...(Array.isArray(item?.recommendedAidIds) ? item.recommendedAidIds : []),
    ]
    const storedNames = [
      ...(Array.isArray(storedContext.previouslyRecommendedAidNames) ? storedContext.previouslyRecommendedAidNames : []),
      ...(Array.isArray(item?.recommendedAidNames) ? item.recommendedAidNames : []),
    ]
    storedIds.forEach(addId)
    storedNames.forEach(addName)

    inferAidMentions(item?.answer, aides).forEach(mention => {
      addId(mention.id)
      addName(mention.name)
    })
  }

  return { ids, names }
}

function getLastRecommendedAid(history = [], aides = []) {
  const latest = history[0]
  if (!latest) return { ids: [], names: [] }

  const storedIds = Array.isArray(latest.recommendedAidIds) ? latest.recommendedAidIds : []
  const storedNames = Array.isArray(latest.recommendedAidNames) ? latest.recommendedAidNames : []
  if (storedIds.length > 0 || storedNames.length > 0) {
    return {
      ids: storedIds.length > 0 ? [storedIds[0]] : [],
      names: storedNames.length > 0 ? [storedNames[0]] : [],
    }
  }

  const firstMention = inferAidMentions(latest.answer, aides)[0]
  return firstMention
    ? { ids: [firstMention.id], names: [firstMention.name] }
    : { ids: [], names: [] }
}

export function classifyAdvisorTurn(question = "", previousActiveTopic = null) {
  const text = normalizeAidTopicText(question)
  const currentDomains = findPrimaryAidTopicIds(text)
  const previousDomains = previousActiveTopic?.domains || []

  if (includesMarker(text, CORRECTION_MARKERS)) return ADVISOR_TURN_TYPES.CORRECTION
  if (includesMarker(text, ALTERNATIVE_MARKERS)) return ADVISOR_TURN_TYPES.REQUEST_ALTERNATIVE
  if (includesMarker(text, DETAIL_MARKERS)) return ADVISOR_TURN_TYPES.ASK_DETAILS
  if (includesMarker(text, NEXT_STEP_MARKERS)) return ADVISOR_TURN_TYPES.NEXT_STEP
  if (!previousActiveTopic) return ADVISOR_TURN_TYPES.NEW_TOPIC
  if (currentDomains.length > 0 && !sameTopics(currentDomains, previousDomains)) return ADVISOR_TURN_TYPES.NEW_TOPIC
  if (/\b(maintenant|nouveau sujet|autre sujet)\b/.test(text)) return ADVISOR_TURN_TYPES.NEW_TOPIC
  if (currentDomains.length === 0 || /^(et|mais|alors|aussi|pour)\b/.test(text)) return ADVISOR_TURN_TYPES.FOLLOW_UP
  return ADVISOR_TURN_TYPES.NEW_TOPIC
}

export function buildAdvisorConversationContext({ question = "", recentHistory = [], aides = [] } = {}) {
  const history = Array.isArray(recentHistory) ? recentHistory : []
  const previousActiveTopic = inferPreviousActiveTopic(history)
  const turnType = classifyAdvisorTurn(question, previousActiveTopic)
  const currentDomains = findPrimaryAidTopicIds(question)
  const startsNewTopic = turnType === ADVISOR_TURN_TYPES.NEW_TOPIC
  const activeTopic = startsNewTopic || !previousActiveTopic
    ? { query: String(question || "").trim(), domains: currentDomains }
    : {
        query: previousActiveTopic.query,
        domains: previousActiveTopic.domains,
      }

  if (turnType === ADVISOR_TURN_TYPES.CORRECTION && currentDomains.length > 0) {
    activeTopic.query = String(question || "").trim()
    activeTopic.domains = currentDomains
  }

  const previous = startsNewTopic
    ? { ids: [], names: [] }
    : collectPreviousRecommendations(history, aides, activeTopic)
  const lastRecommended = getLastRecommendedAid(history, aides)
  const rankingQuery = startsNewTopic
    ? String(question || "").trim()
    : `${activeTopic.query} ${question}`.trim()

  return {
    turnType,
    activeTopic,
    rankingQuery,
    previouslyRecommendedAidIds: previous.ids,
    previouslyRecommendedAidNames: previous.names,
    targetAidIds: [ADVISOR_TURN_TYPES.ASK_DETAILS, ADVISOR_TURN_TYPES.NEXT_STEP].includes(turnType)
      ? lastRecommended.ids
      : [],
    targetAidNames: [ADVISOR_TURN_TYPES.ASK_DETAILS, ADVISOR_TURN_TYPES.NEXT_STEP].includes(turnType)
      ? lastRecommended.names
      : [],
  }
}

export function getAdvisorRankingOptions(conversationContext = {}) {
  const isAlternative = conversationContext.turnType === ADVISOR_TURN_TYPES.REQUEST_ALTERNATIVE
  return {
    excludeIds: isAlternative ? conversationContext.previouslyRecommendedAidIds : [],
    excludeNames: isAlternative ? conversationContext.previouslyRecommendedAidNames : [],
    preferredAidIds: conversationContext.targetAidIds || [],
    preferredAidNames: conversationContext.targetAidNames || [],
  }
}
