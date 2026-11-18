import { findPrimaryAidTopicIds, normalizeAidTopicText } from "./aidTopics.js"
import { normalizeAidIdentity } from "./aidesRanking.js"
import { isSelfContainedNewQuestion, looksPlayfulOrFictionalQuestion } from "./advisorQuestionRouter.js"

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
    // The last turn is the latest context, even when it was general (or a
    // local-budget answer). Never revive a much older aid topic by searching
    // back through unrelated conversations.
    if (question) return { query: question, domains: findPrimaryAidTopicIds(question) }
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
  if (!previousActiveTopic || !text) return ADVISOR_TURN_TYPES.NEW_TOPIC

  // Explicit corrections of aid eligibility stay corrections even when they
  // change the aid topic. The current user message overrides prior assumptions.
  if (includesMarker(text, CORRECTION_MARKERS) && previousDomains.length > 0) {
    return ADVISOR_TURN_TYPES.CORRECTION
  }

  // This guard MUST precede loose "combien/comment/autre" matching. A question
  // about planets after discussing the CAF is not a request for an aid amount.
  if (looksPlayfulOrFictionalQuestion(question) ||
      (currentDomains.length > 0 && !sameTopics(currentDomains,previousDomains)) ||
      isSelfContainedNewQuestion(question)) {
    return ADVISOR_TURN_TYPES.NEW_TOPIC
  }

  // Aid-specific followups inherit an aid topic. Generic conversations also
  // allow natural continuations, but must not be treated as aid requests.
  if (includesMarker(text, ALTERNATIVE_MARKERS)) {
    return previousDomains.length > 0
      ? ADVISOR_TURN_TYPES.REQUEST_ALTERNATIVE
      : ADVISOR_TURN_TYPES.FOLLOW_UP
  }
  if (includesMarker(text, NEXT_STEP_MARKERS)) {
    return previousDomains.length > 0
      ? ADVISOR_TURN_TYPES.NEXT_STEP
      : ADVISOR_TURN_TYPES.FOLLOW_UP
  }
  if (includesMarker(text, DETAIL_MARKERS)) {
    return previousDomains.length > 0
      ? ADVISOR_TURN_TYPES.ASK_DETAILS
      : ADVISOR_TURN_TYPES.FOLLOW_UP
  }

  if (currentDomains.length === 0 || /^(et|mais|alors|aussi|pour)\b/.test(text) ||
      sameTopics(currentDomains,previousDomains)) {
    return ADVISOR_TURN_TYPES.FOLLOW_UP
  }
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


// A Premium advisor must honor its own yes/no invitations. This local
// continuation intentionally uses recorded budget data rather than another AI
// inference; it never labels transport totals as fuel-only purchases.
const ADVISOR_YES = /^(?:oui|oui je veux bien|oui volontiers|oui pourquoi pas|oui fais le|oui regarde|oui allons y|d accord|ok|okay|vas y|allons y|je veux bien|volontiers|avec plaisir|wi)$/
const ADVISOR_BUDGET_TOPICS = [
  { category: "transport", pattern: /\b(?:carburant|essence|gazole|diesel|plein d essence)\b/ },
  { category: "alimentaire", pattern: /\b(?:courses|alimentaire|alimentation)\b/ },
  { category: "logement", pattern: /\b(?:loyer|logement)\b/ },
  { category: "energie", pattern: /\b(?:electricite|energie|factures? d energie)\b/ },
  { category: "assurances", pattern: /\b(?:assurances?|abonnements?|charges fixes)\b/ },
]
const ADVISOR_BUDGET_OFFER = /\b(?:souhaitez vous examiner vos depenses|voulez vous examiner votre budget|voulez vous faire le point|souhaitez vous faire le point|voulez vous examiner ces depenses)\b/

function advisorEuro(amount) {
  const value = Number(amount)
  if (!Number.isFinite(value)) return null
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value)
}

function advisorOpenExpenses() {
  return [{ type: "open_page", target: "depenses", label_fr: "Voir mes dépenses", label_kr: "War mon bann dépans" }]
}

export function resolveAdvisorBudgetConfirmation({
  question = "", recentHistory = [], insights = {}, language = "fr", contextUnavailable = false,
} = {}) {
  const normalized = normalizeAidTopicText(question)
  if (!ADVISOR_YES.test(normalized)) return null
  const previous = Array.isArray(recentHistory) ? recentHistory[0] : null
  if (!previous || !previous.answer || !previous.question) return null
  const priorQuestion = normalizeAidTopicText(previous.question)
  const priorAnswer = normalizeAidTopicText(previous.answer)
  const authenticOffer = previous.source === "local_budget_observation" ||
    (ADVISOR_BUDGET_OFFER.test(priorAnswer) &&
      /\b(?:carburant|essence|gazole|diesel|courses|loyer|logement|factures?|electricite|energie|assurance|abonnement)\b/.test(priorQuestion))
  if (!authenticOffer || !ADVISOR_BUDGET_OFFER.test(priorAnswer)) return null

  const topic = ADVISOR_BUDGET_TOPICS.find(item => item.pattern.test(priorQuestion))
  if (!topic) return null
  const fr = language !== "kreol" && language !== "kr" && language !== "cr"
  const budget = insights?.budgetAdvisorContext || {}
  const entries = Array.isArray(budget.spendingByCategory) ? budget.spendingByCategory : []
  const recorded = entries.find(entry => entry.category === topic.category)
  const transactionsAvailable = !contextUnavailable && insights?.dataAvailability?.transactions !== false
  const lastPeriod = String(budget.period?.label || "").trim()
  const period = lastPeriod ? "sur la période « " + lastPeriod + " »" : "sur la période analysée"
  const details = topic.category === "transport"
    ? "Ce total regroupe les dépenses classées en transport : il ne permet pas d'isoler le carburant si celui-ci n'est pas identifié séparément."
    : "Il s'agit uniquement des dépenses variables classées dans cette catégorie ; les charges fixes peuvent être suivies séparément."
  const detailsKr = topic.category === "transport"
    ? "Total-la i regroupe bann dépans transport. Mi pé pa sépare carburant si li lé pa identifié séparément."
    : "Lé seulement bann dépans variables classées dann catégorie-la. Bann sarz fixes pé être suivies séparément."

  let answer
  if (!transactionsAvailable) {
    answer = fr
      ? "Je ne peux pas vérifier vos dépenses enregistrées pour le moment. Ouvrez « Mes dépenses » pour contrôler vos achats, puis réessayez."
      : "Mi pé pa vérifier out dépenses anrezistré pou l'instant. Ouv « Mes dépenses » pou vérifier, apré réessay."
  } else if (!recorded || !Number.isFinite(Number(recorded.amount)) || Number(recorded.amount) <= 0) {
    answer = fr
      ? "Je ne trouve pas encore de dépenses classées dans cette catégorie " + period + ". Pour pouvoir comparer vos frais, commencez par enregistrer ou classer les achats correspondants dans « Mes dépenses »."
      : "Mi trouve pas ankor bann dépans classées dann catégorie-la " + period + ". Ajoute ou classe bann achats dann « Mes dépenses » pou compare."
  } else {
    const amount = advisorEuro(recorded.amount)
    const prior = Number(recorded.previousAmount)
    const hasPrior = recorded.previousAmount !== null && recorded.previousAmount !== undefined && Number.isFinite(prior)
    const diff = hasPrior ? Number(recorded.amount) - prior : null
    const comparison = diff === null
      ? "Je n'ai pas de montant précédent fiable pour comparer."
      : diff === 0
        ? "Le montant est identique à la période précédente comparable."
        : "Cela représente " + advisorEuro(Math.abs(diff)) + " de " + (diff > 0 ? "plus" : "moins") + " que sur la période précédente comparable."
    const label = topic.category === "transport" ? "transport" :
      topic.category === "alimentaire" ? "courses alimentaires" :
      topic.category === "logement" ? "logement" :
      topic.category === "energie" ? "énergie" : "assurances et abonnements"
    answer = fr
      ? "D'après vos dépenses enregistrées " + period + ", le poste « " + label + " » représente " +
        amount + ". " + comparison + " " + details +
        " Pour aller plus loin, vérifiez le classement des achats concernés dans « Mes dépenses »."
      : "Dapré out dépans anrezistré " + period + ", poste « " + label + " » i représente " +
        amount + ". " + detailsKr + " Pou continuer, vérifie classement out achats dann « Mes dépenses »."
  }
  return {
    answer,
    source: "local_budget_followup",
    mode: "budget_depenses",
    actions: advisorOpenExpenses(),
    intent: "budget_followup",
    language: fr ? "fr" : "kreol",
  }
}


// A follow-up asking for solutions after a missing-data observation is still
// part of the budget conversation. Give actionable, non-numerical advice
// locally: an OpenAI call adds little value until the user provides details.
// Never invent spending totals, pump prices, or a saving estimate.
const ADVISOR_BUDGET_SOLUTION_REQUEST =
  /\b(?:solutions?|conseils?|astuces?|idees?|pistes?|proposes?|proposer|recommande(?:s|z|r)?|faire quoi|faire comment|comment (?:je|on|nous|puis je|peux je) (?:faire|reduire|economiser)|par quoi commencer)\b/
const ADVISOR_BUDGET_NO_DATA =
  /\b(?:je ne trouve pas encore de depenses|pas encore de depenses classees|mi trouve pas ankor bann depans|aucune depense enregistree)\b/

const ADVISOR_NO_DATA_ADVICE = {
  transport: {
    fr: "Même sans dépenses enregistrées, voici trois pistes concrètes pour réduire le coût du carburant : 1. Regroupez plusieurs déplacements pour éviter les allers-retours. 2. Comparez les prix affichés à la pompe, sans faire un détour qui annulerait l'économie. 3. Pour les trajets réguliers, regardez si covoiturage ou transports en commun sont possibles. Si vous me donnez votre kilométrage habituel et la consommation du véhicule, je pourrai estimer le coût de vos trajets sans inventer de chiffres.",
    kr: "Minm san dépans anrezistré, ou pé : 1. Regroupe out trajé pou évite bann aller-retour. 2. Compare bann prix carburant san fé in gran détour. 3. Regarde si covoiturage ou transport en commun lé possible. Donne a moin out kilométraz ek consommation loto pou estime out frais san invente bann chiffres.",
  },
  alimentaire: {
    fr: "Même sans historique, vous pouvez commencer par trois gestes : 1. Préparez une liste à partir des repas prévus. 2. Comparez les prix au kilo ou à l'unité, pour un même format. 3. Vérifiez ce que vous avez déjà avant de racheter. En enregistrant quelques tickets, nous pourrons ensuite repérer vos produits fréquents et comparer des prix réellement observés.",
    kr: "Minm san historique, commence par prépare in liste selon bann repas, compare prix au kilo pou minm format, ek vérifie sak ou nana déjà. Apré kèk tickets, nou pourra mieux regarde out bann achats habituels.",
  },
  logement: {
    fr: "Sans historique, commencez par trois vérifications : 1. Listez le loyer et les charges réellement payées. 2. Repérez les abonnements ou frais annexes évitables. 3. Vérifiez les aides au logement selon votre situation, sans supposer votre éligibilité. Nous pourrons comparer les montants quand vous les aurez enregistrés.",
    kr: "San historique, note loyer ek bann charges réelles, regarde bann frais annexes à évite, ek vérifie bann aides logement selon out situation. Nou pourra comparer quand bann montants sera anrezistré.",
  },
  energie: {
    fr: "Sans historique, trois actions utiles : 1. Notez le montant et la période de votre dernière facture. 2. Repérez les appareils et usages qui consomment le plus. 3. Comparez vos contrats ou tarifs seulement à consommation équivalente. Avec une facture réelle, je pourrai vous aider à examiner les postes de coût.",
    kr: "San historique, note montant ek période out dernière facture, repère bann appareils ki consomme plis, ek compare bann tarifs pour minm consommation. Si ou nana in facture, nou pourra regarde ali.",
  },
  assurances: {
    fr: "Sans historique, vous pouvez déjà : 1. Faire la liste de vos contrats et mensualités. 2. Vérifier les doublons de garanties. 3. Comparer les offres à garanties et franchises équivalentes, en tenant compte des conditions de résiliation. Une fois les montants enregistrés, nous pourrons prioriser les économies possibles.",
    kr: "San historique, liste out bann contrats ek mensualités, vérifie si nana bann garanties en double, ek compare bann offres avec minm garanties. Apré nou pourra chwazi bann économies possibles.",
  },
}
const ADVISOR_GENERIC_NO_DATA_ADVICE = {
  fr: "Même sans dépenses enregistrées, vous pouvez commencer tout de suite : 1. Notez vos charges fixes et vos achats importants. 2. Repérez une dépense que vous pourriez réduire sans vous priver de l'essentiel. 3. Comparez les prix à quantité et qualité équivalentes. Quelques dépenses classées suffiront ensuite à construire une analyse plus personnelle ; je ne vais pas inventer de montants.",
  kr: "Minm san dépans anrezistré, note out bann charges fixes, repère in dépans à réduire, ek compare bann prix pou minm quantité. Avec kèk dépans bien classées, nou pourra fé in analyse pli personnelle san invente bann chiffres.",
}

export function resolveAdvisorBudgetNoDataAdvice({
  question = "", recentHistory = [], language = "fr",
} = {}) {
  const text = normalizeAidTopicText(question)
  // A detailed new question is worth a personalized model response instead.
  if (!text || text.length > 160 || text.split(" ").length > 31 ||
      !ADVISOR_BUDGET_SOLUTION_REQUEST.test(text) ||
      /\d|\b(?:personnalise|personnalisee|personnaliser|precis|precise|estimation|estimer|calculer|simulation|ma situation|mon cas|selon mes|selon mon|compte tenu|mon profil|mes contraintes|mes revenus|mes revenus|ma famille)\b/.test(text) ||
      /\b(?:rsa|apl|caf|eligib|recours|demande administrative|chomage|salaire|contrat|cours de|recette|gateau|cuisine|meteo|film|chanson|planete|licorne|dragon|poeme|blague)\b/.test(text) ||
      looksPlayfulOrFictionalQuestion(question)) return null

  const history = Array.isArray(recentHistory) ? recentHistory.slice(0, 4) : []
  const previous = history[0]
  if (!previous || !previous.answer || !previous.question) return null
  const missingData = ADVISOR_BUDGET_NO_DATA.test(normalizeAidTopicText(previous.answer))
  if (!missingData) return null
  // Source and the assistant's visible no-data message must agree; do not
  // convert unrelated conversations into prewritten financial advice.
  if (previous.source && !["local_budget_followup", "local"].includes(previous.source)) return null

  const previousTopic = history.slice(1).find(item =>
    /(?:carburant|essence|gazole|diesel|courses|alimentation|loyer|logement|electricite|energie|assurances?|abonnements?)/.test(
      normalizeAidTopicText(item?.question),
    ),
  )
  const previousText = normalizeAidTopicText(previousTopic?.question || "")
  const topic = ADVISOR_BUDGET_TOPICS.find(item => item.pattern.test(previousText))
  const answerSet = topic ? ADVISOR_NO_DATA_ADVICE[topic.category] : null
  const kr = language === "kreol" || language === "kr" || language === "cr"
  return {
    answer: answerSet ? (kr ? answerSet.kr : answerSet.fr) :
      (kr ? ADVISOR_GENERIC_NO_DATA_ADVICE.kr : ADVISOR_GENERIC_NO_DATA_ADVICE.fr),
    source: "local_budget_advice",
    mode: "budget_depenses",
    intent: "budget_followup",
    actions: advisorOpenExpenses(),
    language: kr ? "kreol" : "fr",
  }
}
