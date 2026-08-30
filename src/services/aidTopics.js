export const AID_TOPIC_GROUPS = [
  {
    id: "logement",
    terms: ["logement", "kaz", "loyer", "location", "locataire", "proprietaire", "apl", "fsl", "hebergement"],
  },
  {
    id: "energie",
    terms: ["energie", "kouran", "electricite", "edf", "facture", "eau", "chauffage"],
  },
  {
    id: "emploi",
    terms: ["emploi", "travail", "travay", "chomage", "demandeur emploi", "france travail", "formation", "reprise"],
  },
  {
    id: "famille",
    terms: ["enfant", "enfants", "marmay", "marmailles", "famille", "fami", "parent", "garde", "naissance"],
  },
  {
    id: "mobilite",
    terms: ["mobilite", "deplasman", "transport", "bus", "voiture", "permis", "carburant", "deplacement"],
  },
  {
    id: "scolarite",
    terms: ["scolarite", "ecole", "lekol", "cantine", "bourse", "etudiant", "etudes", "universite", "scolaire"],
  },
  {
    id: "sante",
    terms: ["sante", "soin", "mutuelle", "cgss", "medecin", "handicap", "mdph"],
  },
  {
    id: "sport",
    terms: [
      "sport", "sports", "sportif", "sportive", "club", "clubs", "licence", "licences", "cotisation",
      "judo", "tennis", "surf", "football", "foot", "athletisme", "natation", "rugby",
      "basket", "handball", "karate", "taekwondo", "capoeira",
    ],
  },
  {
    id: "culture_loisirs",
    terms: ["culture", "culturel", "loisir", "loisirs", "cinema", "musee", "musique", "lecture", "pass culture"],
  },
  {
    id: "budget",
    terms: ["budget", "depense", "dette", "credit", "surendettement", "revenu", "alimentaire"],
  },
  {
    id: "demarches",
    terms: ["demarche", "dossier", "formulaire", "document", "justificatif", "administratif", "recours"],
  },
  {
    id: "courrier",
    terms: ["courrier", "lettre", "email", "refus", "relance", "reponse organisme"],
  },
]

export function normalizeAidTopicText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’'`´]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
}

function containsTerm(text, term) {
  const normalizedTerm = normalizeAidTopicText(term)
  if (!normalizedTerm) return false
  return ` ${text} `.includes(` ${normalizedTerm} `)
}

export function findAidTopicIds(value = "") {
  const text = normalizeAidTopicText(value)
  if (!text) return []

  return AID_TOPIC_GROUPS
    .filter(group => group.terms.some(term => containsTerm(text, term)))
    .map(group => group.id)
}

export function findPrimaryAidTopicIds(value = "") {
  const topics = findAidTopicIds(value)
  if (topics.length <= 1) return topics

  const contextualTopics = new Set(["famille", "demarches"])
  const primary = topics.filter(topic => !contextualTopics.has(topic))
  return primary.length > 0 ? primary : topics
}

export function getAidTopicTermsForToken(token = "") {
  const normalizedToken = normalizeAidTopicText(token)
  const group = AID_TOPIC_GROUPS.find(item =>
    item.terms.some(term => normalizeAidTopicText(term) === normalizedToken)
  )
  return group?.terms || [normalizedToken]
}

export function getAidTopicTerms(topicIds = []) {
  const requested = new Set(Array.isArray(topicIds) ? topicIds : [])
  return AID_TOPIC_GROUPS
    .filter(group => requested.has(group.id))
    .flatMap(group => group.terms)
}
