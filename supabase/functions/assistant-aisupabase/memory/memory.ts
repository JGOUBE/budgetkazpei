export type AssistantLanguage = "fr" | "kreol" | string

export type AssistantMemoryRecord = {
  user_id?: string
  memory?: any
  updated_at?: string
}

export type AssistantMemoryTurn = {
  question: string
  answer?: string
  mode?: string
  language?: AssistantLanguage
  topic?: string
  created_at: string
}

export type AssistantStableFacts = {
  commune?: string
  city?: string
  children_count?: number
  has_children?: boolean
  family_situation?: string
  housing_status?: string
  professional_status?: string
  age?: number
  household_income?: number
  caf_recipient?: boolean
  has_disability?: boolean
  has_vehicle?: boolean
  has_driving_license?: boolean
  benefits?: string[]
  goals?: string[]
  current_needs?: string[]
  procedures?: string[]
  blockers?: string[]
  preferences?: string[]
  last_updates?: string[]
}

export type AssistantCaseState = {
  housing?: string
  caf?: string
  ccas?: string
  france_travail?: string
  mdph?: string
  budget?: string
  documents?: string[]
  appointments?: string[]
  refusals?: string[]
}

export type AssistantLivingCaseEvent = {
  date: string
  type: "info" | "need" | "procedure" | "document" | "appointment" | "refusal" | "blocker" | "update" | string
  subject: string
  status?: "active" | "pending" | "done" | "blocked" | "obsolete" | string
  details?: string
  source?: "user" | "assistant" | "profile" | string
}

export type AssistantLivingCase = {
  summary?: string
  active_subject?: string
  active_need?: string
  priority?: string
  next_action?: string
  open_questions?: string[]
  timeline?: AssistantLivingCaseEvent[]
  active_procedures?: string[]
  completed_procedures?: string[]
  blocked_procedures?: string[]
  documents_to_prepare?: string[]
  documents_already_mentioned?: string[]
  do_not_repeat?: string[]
}

export type AssistantMemoryPatch = {
  updated_at: string
  profile?: Record<string, unknown>
  stable_facts?: AssistantStableFacts
  case_state?: AssistantCaseState
  living_case?: AssistantLivingCase
  last_user_subject?: string
  known_facts?: string[]
  recent_topics?: string[]
  already_suggested?: string[]
  user_preferences?: string[]
  conversation_turns?: AssistantMemoryTurn[]
}

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

function countMeaningfulWords(value = "") {
  return normalizeText(value)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length
}

function hasValue(value: unknown) {
  return value !== undefined && value !== null && value !== ""
}

function isTrue(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1" || normalizeText(String(value)) === "oui"
}

function isFalse(value: unknown) {
  return value === false || value === "false" || value === 0 || value === "0" || normalizeText(String(value)) === "non"
}

function toNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function uniqueStrings(values: unknown[], max = 12) {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    const clean = String(value || "").trim()
    if (!clean) continue

    const key = normalizeText(clean)
    if (seen.has(key)) continue

    seen.add(key)
    result.push(clean)

    if (result.length >= max) break
  }

  return result
}

function uniqueConversationTurns(values: unknown[], max = 8) {
  const seen = new Set<string>()
  const result: AssistantMemoryTurn[] = []

  for (const raw of values) {
    const item = raw as Partial<AssistantMemoryTurn>
    const question = String(item?.question || "").trim()
    if (!question || countMeaningfulWords(question) <= 1) continue

    const answer = String(item?.answer || "").trim()
    const key = normalizeText(`${question.slice(0, 180)}|${answer.slice(0, 180)}`)
    if (seen.has(key)) continue

    seen.add(key)
    result.push({
      question: question.slice(0, 600),
      answer: answer ? answer.slice(0, 1200) : undefined,
      mode: item?.mode ? String(item.mode) : undefined,
      language: item?.language ? String(item.language) : undefined,
      topic: item?.topic ? String(item.topic) : summarizeTopic(question),
      created_at: item?.created_at ? String(item.created_at) : new Date().toISOString(),
    })

    if (result.length >= max) break
  }

  return result
}

function formatBoolean(value: unknown) {
  if (isTrue(value)) return "oui"
  if (isFalse(value)) return "non"
  return ""
}

function formatProfileFact(key: string, value: unknown) {
  if (!hasValue(value)) return ""

  const labels: Record<string, string> = {
    commune: "Commune",
    situation_familiale: "Situation familiale",
    nombre_enfants: "Nombre d'enfants",
    logement: "Logement",
    situation_professionnelle: "Situation professionnelle",
    age: "Âge",
    revenus_foyer: "Revenus du foyer",
    allocataire_caf: "Allocataire CAF",
    handicap: "Situation de handicap",
    vehicule: "Véhicule",
    permis: "Permis",
  }

  const label = labels[key] || key
  const booleanValue = formatBoolean(value)

  if (booleanValue) return `${label} : ${booleanValue}`

  if (key === "revenus_foyer") {
    const number = Number(value)
    if (Number.isFinite(number) && number > 0) return `${label} : environ ${number} € / mois`
  }

  return `${label} : ${String(value)}`
}

function addIfMissing(target: string[], value: string) {
  const clean = String(value || "").trim()
  if (!clean) return

  const key = normalizeText(clean)
  if (!target.some((item) => normalizeText(item) === key)) {
    target.push(clean)
  }
}

function extractNumberBeforeWords(text: string, words: string[]) {
  const normalized = normalizeText(text)
  const wordPattern = words.map((w) => normalizeText(w)).join("|")
  const numericMatch = normalized.match(new RegExp(`(?:j'?ai|mi na|moin na|na|avec|ek)?\\s*(\\d+)\\s*(?:${wordPattern})`))
  if (numericMatch?.[1]) return Number(numericMatch[1])

  const writtenNumbers: Record<string, number> = {
    un: 1,
    une: 1,
    in: 1,
    deux: 2,
    de: 2,
    dé: 2,
    trois: 3,
    troi: 3,
    quatre: 4,
    kat: 4,
    cinq: 5,
    sink: 5,
    six: 6,
  }

  for (const [word, number] of Object.entries(writtenNumbers)) {
    const regex = new RegExp(`(?:^|\\s)${normalizeText(word)}\\s+(?:${wordPattern})(?:\\s|$)`)
    if (regex.test(normalized)) return number
  }

  return undefined
}

function extractStableFactsFromProfile(profile: any = {}) {
  const facts: AssistantStableFacts = {}

  if (hasValue(profile.commune)) {
    facts.commune = String(profile.commune)
    facts.city = String(profile.commune)
  }

  if (hasValue(profile.nombre_enfants)) {
    const children = toNumber(profile.nombre_enfants)
    if (children !== undefined) {
      facts.children_count = children
      facts.has_children = children > 0
    }
  }

  if (hasValue(profile.situation_familiale)) facts.family_situation = String(profile.situation_familiale)
  if (hasValue(profile.logement)) facts.housing_status = String(profile.logement)
  if (hasValue(profile.situation_professionnelle)) facts.professional_status = String(profile.situation_professionnelle)

  if (hasValue(profile.age)) {
    const age = toNumber(profile.age)
    if (age !== undefined) facts.age = age
  }

  if (hasValue(profile.revenus_foyer)) {
    const income = toNumber(profile.revenus_foyer)
    if (income !== undefined) facts.household_income = income
  }

  if (hasValue(profile.allocataire_caf)) facts.caf_recipient = isTrue(profile.allocataire_caf)
  if (hasValue(profile.handicap)) facts.has_disability = isTrue(profile.handicap)
  if (hasValue(profile.vehicule)) facts.has_vehicle = isTrue(profile.vehicule)
  if (hasValue(profile.permis)) facts.has_driving_license = isTrue(profile.permis)

  return facts
}

function extractStableFactsFromText(text = "") {
  const normalized = normalizeText(text)
  const facts: AssistantStableFacts = {
    benefits: [],
    goals: [],
    current_needs: [],
    procedures: [],
    blockers: [],
    preferences: [],
    last_updates: [],
  }

  const children = extractNumberBeforeWords(text, ["enfant", "enfants", "marmay", "marmaille", "marmailles", "marmaill"])
  if (children !== undefined) {
    facts.children_count = children
    facts.has_children = children > 0
    addIfMissing(facts.last_updates!, `${children} enfant(s) indiqué(s)`)
  }

  const cityMatch = text.match(/(?:j'habite|je vis|mi habite|mi res|moin habite|moin lé|je suis a|je suis à|mi lé a|mi lé à)\s+([A-Za-zÀ-ÿ' -]{2,40})/i)
  if (cityMatch?.[1]) {
    const city = cityMatch[1].replace(/[.!?,;:].*$/, "").trim()
    if (city) {
      facts.commune = city
      facts.city = city
      addIfMissing(facts.last_updates!, `Commune indiquée : ${city}`)
    }
  }

  if (normalized.includes("rsa") || normalized.includes("revenu de solidarite active")) {
    addIfMissing(facts.benefits!, "RSA")
    addIfMissing(facts.procedures!, "CAF")
    addIfMissing(facts.last_updates!, "RSA mentionné")
  }

  if (normalized.includes("apl") || normalized.includes("aide logement") || normalized.includes("aide au logement")) {
    addIfMissing(facts.benefits!, "APL / aide au logement")
    addIfMissing(facts.goals!, "aide logement")
  }

  if (normalized.includes("prime activite") || normalized.includes("prime d'activite")) {
    addIfMissing(facts.benefits!, "Prime d'activité")
    addIfMissing(facts.procedures!, "CAF")
  }

  if (normalized.includes("aah")) {
    addIfMissing(facts.benefits!, "AAH")
    facts.has_disability = true
    addIfMissing(facts.procedures!, "MDPH")
  }

  if (normalized.includes("caf")) addIfMissing(facts.procedures!, "CAF")
  if (normalized.includes("ccas") || normalized.includes("mairie")) addIfMissing(facts.procedures!, "CCAS / mairie")
  if (normalized.includes("france travail") || normalized.includes("pole emploi") || normalized.includes("pôle emploi")) {
    addIfMissing(facts.procedures!, "France Travail")
  }
  if (normalized.includes("mdph")) addIfMissing(facts.procedures!, "MDPH")

  if (normalized.includes("loyer") || normalized.includes("logement") || normalized.includes("caution") || normalized.includes("impaye")) {
    addIfMissing(facts.goals!, "logement / loyer")
    addIfMissing(facts.current_needs!, "aide pour le logement")
  }

  if (normalized.includes("travail") || normalized.includes("emploi") || normalized.includes("formation")) {
    addIfMissing(facts.goals!, "emploi / formation")
  }

  if (normalized.includes("dette") || normalized.includes("dettes") || normalized.includes("retard") || normalized.includes("impaye")) {
    addIfMissing(facts.blockers!, "retard de paiement ou dette mentionnée")
  }

  if (normalized.includes("refus") || normalized.includes("refuse") || normalized.includes("refusé") || normalized.includes("rejete")) {
    addIfMissing(facts.blockers!, "refus administratif mentionné")
  }

  if (normalized.includes("rendez-vous") || normalized.includes("rdv")) {
    addIfMissing(facts.goals!, "préparer un rendez-vous")
  }

  if (normalized.includes("email") || normalized.includes("mail")) {
    addIfMissing(facts.preferences!, "préférence possible pour un email")
  }

  if (normalized.includes("creole") || normalized.includes("kreol") || normalized.includes("créole")) {
    addIfMissing(facts.preferences!, "réponses en créole réunionnais")
  }

  return cleanEmptyStableFacts(facts)
}

function cleanEmptyStableFacts(facts: AssistantStableFacts) {
  const cleaned: AssistantStableFacts = { ...facts }

  for (const key of ["benefits", "goals", "current_needs", "procedures", "blockers", "preferences", "last_updates"] as const) {
    if (Array.isArray(cleaned[key]) && cleaned[key]!.length === 0) {
      delete cleaned[key]
    }
  }

  return cleaned
}

function extractCaseStateFromText(text = "") {
  const normalized = normalizeText(text)
  const state: AssistantCaseState = {
    documents: [],
    appointments: [],
    refusals: [],
  }

  if (normalized.includes("loyer") || normalized.includes("logement") || normalized.includes("fsl")) {
    state.housing = "Sujet logement/loyer actif"
  }

  if (normalized.includes("caf")) {
    state.caf = "CAF mentionnée"
  }

  if (normalized.includes("ccas") || normalized.includes("mairie")) {
    state.ccas = "CCAS / mairie mentionné"
  }

  if (normalized.includes("france travail") || normalized.includes("pole emploi") || normalized.includes("pôle emploi")) {
    state.france_travail = "France Travail mentionné"
  }

  if (normalized.includes("mdph")) {
    state.mdph = "MDPH mentionnée"
  }

  if (normalized.includes("budget") || normalized.includes("depense") || normalized.includes("dépense")) {
    state.budget = "Sujet budget mentionné"
  }

  const docs = [
    { key: "bail", label: "bail" },
    { key: "quittance", label: "quittances de loyer" },
    { key: "revenu", label: "justificatifs de revenus" },
    { key: "avis d'imposition", label: "avis d'imposition" },
    { key: "piece d'identite", label: "pièce d'identité" },
    { key: "pièce d'identité", label: "pièce d'identité" },
    { key: "rib", label: "RIB" },
  ]

  for (const doc of docs) {
    if (normalized.includes(normalizeText(doc.key))) addIfMissing(state.documents!, doc.label)
  }

  if (normalized.includes("rendez-vous") || normalized.includes("rdv")) {
    addIfMissing(state.appointments!, "rendez-vous administratif mentionné")
  }

  if (normalized.includes("refus") || normalized.includes("refuse") || normalized.includes("rejet")) {
    addIfMissing(state.refusals!, "refus ou rejet mentionné")
  }

  return cleanEmptyCaseState(state)
}

function cleanEmptyCaseState(state: AssistantCaseState) {
  const cleaned: AssistantCaseState = { ...state }

  for (const key of ["documents", "appointments", "refusals"] as const) {
    if (Array.isArray(cleaned[key]) && cleaned[key]!.length === 0) {
      delete cleaned[key]
    }
  }

  return cleaned
}

function mergeStableFacts(current: AssistantStableFacts = {}, patch: AssistantStableFacts = {}) {
  const merged: AssistantStableFacts = {
    ...current,
    ...patch,
    benefits: uniqueStrings([...(current.benefits || []), ...(patch.benefits || [])], 20),
    goals: uniqueStrings([...(current.goals || []), ...(patch.goals || [])], 20),
    current_needs: uniqueStrings([...(patch.current_needs || []), ...(current.current_needs || [])], 12),
    procedures: uniqueStrings([...(current.procedures || []), ...(patch.procedures || [])], 20),
    blockers: uniqueStrings([...(patch.blockers || []), ...(current.blockers || [])], 15),
    preferences: uniqueStrings([...(current.preferences || []), ...(patch.preferences || [])], 15),
    last_updates: uniqueStrings([...(patch.last_updates || []), ...(current.last_updates || [])], 10),
  }

  for (const key of ["benefits", "goals", "current_needs", "procedures", "blockers", "preferences", "last_updates"] as const) {
    if (Array.isArray(merged[key]) && merged[key]!.length === 0) {
      delete merged[key]
    }
  }

  return merged
}

function mergeCaseState(current: AssistantCaseState = {}, patch: AssistantCaseState = {}) {
  const merged: AssistantCaseState = {
    ...current,
    ...patch,
    documents: uniqueStrings([...(current.documents || []), ...(patch.documents || [])], 20),
    appointments: uniqueStrings([...(patch.appointments || []), ...(current.appointments || [])], 10),
    refusals: uniqueStrings([...(patch.refusals || []), ...(current.refusals || [])], 10),
  }

  for (const key of ["documents", "appointments", "refusals"] as const) {
    if (Array.isArray(merged[key]) && merged[key]!.length === 0) {
      delete merged[key]
    }
  }

  return merged
}


function addLivingEvent(events: AssistantLivingCaseEvent[], event: Partial<AssistantLivingCaseEvent>) {
  const subject = String(event.subject || "").trim()
  if (!subject) return

  events.push({
    date: event.date || new Date().toISOString(),
    type: event.type || "info",
    subject: subject.slice(0, 140),
    status: event.status || "active",
    details: event.details ? String(event.details).slice(0, 350) : undefined,
    source: event.source || "user",
  })
}

function uniqueLivingEvents(values: unknown[], max = 25) {
  const seen = new Set<string>()
  const result: AssistantLivingCaseEvent[] = []

  for (const raw of values) {
    const item = raw as Partial<AssistantLivingCaseEvent>
    const subject = String(item?.subject || "").trim()
    if (!subject) continue

    const type = String(item?.type || "info")
    const status = String(item?.status || "active")
    const key = normalizeText(`${type}|${status}|${subject}`)
    if (seen.has(key)) continue

    seen.add(key)
    result.push({
      date: item?.date ? String(item.date) : new Date().toISOString(),
      type,
      subject: subject.slice(0, 140),
      status,
      details: item?.details ? String(item.details).slice(0, 350) : undefined,
      source: item?.source ? String(item.source) : "user",
    })

    if (result.length >= max) break
  }

  return result
}

function eventLine(event: AssistantLivingCaseEvent) {
  const status = event.status ? ` (${event.status})` : ""
  const details = event.details ? ` — ${event.details}` : ""
  return `- ${event.subject}${status}${details}`
}

function extractLivingCaseFromText(text = "", mode = "general", language: AssistantLanguage = "fr") {
  const normalized = normalizeText(text)
  const livingCase: AssistantLivingCase = {
    timeline: [],
    active_procedures: [],
    completed_procedures: [],
    blocked_procedures: [],
    documents_to_prepare: [],
    documents_already_mentioned: [],
    do_not_repeat: [],
    open_questions: [],
  }

  if (normalized.includes("loyer") || normalized.includes("logement") || normalized.includes("kaz") || normalized.includes("caution")) {
    livingCase.active_subject = "logement / loyer"
    livingCase.active_need = "trouver une aide ou une démarche pour le logement"
    livingCase.priority = "sécuriser le logement et éviter l'aggravation des dettes"
    livingCase.next_action = "contacter CAF ou CCAS avec les documents logement"
    addIfMissing(livingCase.active_procedures!, "FSL / aide logement")
    addLivingEvent(livingCase.timeline!, {
      type: "need",
      subject: "Besoin d'aide logement ou loyer",
      status: "active",
      details: "Sujet prioritaire à rattacher aux prochaines précisions courtes.",
      source: "user",
    })
  }

  if (normalized.includes("rsa")) {
    addIfMissing(livingCase.active_procedures!, "CAF / RSA")
    addLivingEvent(livingCase.timeline!, {
      type: "info",
      subject: "RSA mentionné",
      status: "active",
      details: "À utiliser comme contexte financier, sans annoncer de montant non vérifié.",
      source: "user",
    })
  }

  if (normalized.includes("caf")) {
    addIfMissing(livingCase.active_procedures!, "CAF")
    addLivingEvent(livingCase.timeline!, {
      type: "procedure",
      subject: "CAF mentionnée",
      status: "active",
      source: "user",
    })
  }

  if (normalized.includes("ccas") || normalized.includes("mairie")) {
    addIfMissing(livingCase.active_procedures!, "CCAS / mairie")
    addLivingEvent(livingCase.timeline!, {
      type: "procedure",
      subject: "CCAS / mairie mentionné",
      status: "active",
      source: "user",
    })
  }

  if (normalized.includes("envoye") || normalized.includes("envoyé") || normalized.includes("depose") || normalized.includes("déposé") || normalized.includes("demande faite")) {
    addLivingEvent(livingCase.timeline!, {
      type: "procedure",
      subject: "Démarche indiquée comme envoyée ou déposée",
      status: "pending",
      details: "Suivre la réponse de l'organisme plutôt que repartir sur une nouvelle demande.",
      source: "user",
    })
  }

  if (normalized.includes("refus") || normalized.includes("refuse") || normalized.includes("refusé") || normalized.includes("rejete") || normalized.includes("rejeté")) {
    addIfMissing(livingCase.blocked_procedures!, "refus administratif à analyser")
    livingCase.priority = "comprendre le refus avant de relancer une démarche"
    livingCase.next_action = "analyser le courrier ou les motifs du refus"
    addLivingEvent(livingCase.timeline!, {
      type: "refusal",
      subject: "Refus ou rejet mentionné",
      status: "blocked",
      details: "Demander les motifs exacts ou le courrier si nécessaire.",
      source: "user",
    })
  }

  if (normalized.includes("rdv") || normalized.includes("rendez-vous")) {
    addLivingEvent(livingCase.timeline!, {
      type: "appointment",
      subject: "Rendez-vous administratif évoqué",
      status: "pending",
      details: "Préparer questions, documents et phrase simple de situation.",
      source: "user",
    })
  }

  const docs = [
    { key: "bail", label: "bail" },
    { key: "quittance", label: "quittances de loyer" },
    { key: "revenu", label: "justificatifs de revenus" },
    { key: "avis d'imposition", label: "avis d'imposition" },
    { key: "piece d'identite", label: "pièce d'identité" },
    { key: "pièce d'identité", label: "pièce d'identité" },
    { key: "rib", label: "RIB" },
  ]

  for (const doc of docs) {
    if (normalized.includes(normalizeText(doc.key))) {
      addIfMissing(livingCase.documents_already_mentioned!, doc.label)
      addLivingEvent(livingCase.timeline!, {
        type: "document",
        subject: `Document évoqué : ${doc.label}`,
        status: "active",
        source: "user",
      })
    }
  }

  if (mode === "preparer_dossier" || normalized.includes("dossier")) {
    addIfMissing(livingCase.documents_to_prepare!, "documents demandés par l'organisme")
    addLivingEvent(livingCase.timeline!, {
      type: "procedure",
      subject: "Préparation de dossier",
      status: "active",
      source: "user",
    })
  }

  if (normalized.includes("fsl")) addIfMissing(livingCase.do_not_repeat!, "FSL déjà évoqué : ne pas le répéter sans valeur nouvelle")
  if (normalized.includes("apl")) addIfMissing(livingCase.do_not_repeat!, "APL déjà évoquée : ne pas répéter sans précision utile")
  if (normalized.includes("aide retard")) addIfMissing(livingCase.do_not_repeat!, "Aide retard de loyer déjà évoquée")

  for (const key of ["timeline", "active_procedures", "completed_procedures", "blocked_procedures", "documents_to_prepare", "documents_already_mentioned", "do_not_repeat", "open_questions"] as const) {
    if (Array.isArray(livingCase[key]) && livingCase[key]!.length === 0) delete livingCase[key]
  }

  return livingCase
}

function mergeLivingCase(current: AssistantLivingCase = {}, patch: AssistantLivingCase = {}) {
  const merged: AssistantLivingCase = {
    ...current,
    ...patch,
    summary: patch.summary || current.summary,
    active_subject: patch.active_subject || current.active_subject,
    active_need: patch.active_need || current.active_need,
    priority: patch.priority || current.priority,
    next_action: patch.next_action || current.next_action,
    open_questions: uniqueStrings([...(patch.open_questions || []), ...(current.open_questions || [])], 8),
    timeline: uniqueLivingEvents([...(patch.timeline || []), ...(current.timeline || [])], 25),
    active_procedures: uniqueStrings([...(patch.active_procedures || []), ...(current.active_procedures || [])], 15),
    completed_procedures: uniqueStrings([...(patch.completed_procedures || []), ...(current.completed_procedures || [])], 15),
    blocked_procedures: uniqueStrings([...(patch.blocked_procedures || []), ...(current.blocked_procedures || [])], 15),
    documents_to_prepare: uniqueStrings([...(patch.documents_to_prepare || []), ...(current.documents_to_prepare || [])], 20),
    documents_already_mentioned: uniqueStrings([...(patch.documents_already_mentioned || []), ...(current.documents_already_mentioned || [])], 20),
    do_not_repeat: uniqueStrings([...(patch.do_not_repeat || []), ...(current.do_not_repeat || [])], 15),
  }

  const summaryParts = [
    merged.active_subject ? `Sujet actif : ${merged.active_subject}` : "",
    merged.active_need ? `Besoin : ${merged.active_need}` : "",
    merged.priority ? `Priorité : ${merged.priority}` : "",
  ].filter(Boolean)

  if (!merged.summary && summaryParts.length > 0) {
    merged.summary = summaryParts.join(". ")
  }

  for (const key of ["open_questions", "timeline", "active_procedures", "completed_procedures", "blocked_procedures", "documents_to_prepare", "documents_already_mentioned", "do_not_repeat"] as const) {
    if (Array.isArray(merged[key]) && merged[key]!.length === 0) delete merged[key]
  }

  return merged
}

function formatLivingCase(livingCase: AssistantLivingCase = {}) {
  const lines: string[] = []

  if (livingCase.summary) lines.push(`- Résumé vivant : ${livingCase.summary}`)
  if (livingCase.active_subject) lines.push(`- Sujet actif : ${livingCase.active_subject}`)
  if (livingCase.active_need) lines.push(`- Besoin actif : ${livingCase.active_need}`)
  if (livingCase.priority) lines.push(`- Priorité actuelle : ${livingCase.priority}`)
  if (livingCase.next_action) lines.push(`- Prochaine action à privilégier : ${livingCase.next_action}`)
  if (livingCase.active_procedures?.length) lines.push(`- Démarches actives : ${livingCase.active_procedures.join(", ")}`)
  if (livingCase.completed_procedures?.length) lines.push(`- Démarches terminées : ${livingCase.completed_procedures.join(", ")}`)
  if (livingCase.blocked_procedures?.length) lines.push(`- Démarches bloquées : ${livingCase.blocked_procedures.join(", ")}`)
  if (livingCase.documents_to_prepare?.length) lines.push(`- Documents à préparer : ${livingCase.documents_to_prepare.join(", ")}`)
  if (livingCase.documents_already_mentioned?.length) lines.push(`- Documents déjà évoqués : ${livingCase.documents_already_mentioned.join(", ")}`)
  if (livingCase.open_questions?.length) lines.push(`- Questions ouvertes : ${livingCase.open_questions.join(" ; ")}`)
  if (livingCase.do_not_repeat?.length) lines.push(`- À éviter de répéter sans nouvelle valeur : ${livingCase.do_not_repeat.join(" ; ")}`)

  if (livingCase.timeline?.length) {
    lines.push("- Chronologie utile :")
    for (const event of livingCase.timeline.slice(0, 8)) {
      lines.push(`  ${eventLine(event)}`)
    }
  }

  return lines
}

function extractRecentHistoryTurns(body: any): AssistantMemoryTurn[] {
  const recentHistory = Array.isArray(body?.recentHistory) ? body.recentHistory : []

  return recentHistory.slice(0, 6).map((item: any) => {
    const question = String(item?.question || "").trim()
    const answer = String(item?.answer || "").trim()

    return {
      question: question.slice(0, 600),
      answer: answer ? answer.slice(0, 1200) : undefined,
      mode: item?.mode ? String(item.mode) : undefined,
      language: item?.language ? String(item.language) : undefined,
      topic: summarizeTopic(question),
      created_at: item?.createdAt || item?.created_at || new Date().toISOString(),
    }
  })
}

function buildCurrentTurn(
  body: any,
  answer = "",
  mode = "general",
  language: AssistantLanguage = "fr",
): AssistantMemoryTurn | null {
  const question = String(body?.originalQuestion || body?.question || body?.refusalText || "").trim()
  if (!question || countMeaningfulWords(question) <= 1) return null

  return {
    question: question.slice(0, 600),
    answer: String(answer || "").trim().slice(0, 1200) || undefined,
    mode,
    language,
    topic: summarizeTopic(question),
    created_at: new Date().toISOString(),
  }
}

export function extractMemoryPatch(
  body: any,
  answer = "",
  mode = "general",
  language: AssistantLanguage = "fr",
): AssistantMemoryPatch {
  const profile = body?.profile || {}
  const question = String(body?.originalQuestion || body?.question || body?.refusalText || "").trim()
  const textForExtraction = `${question}\n${answer}`

  const patch: AssistantMemoryPatch = {
    updated_at: new Date().toISOString(),
  }

  const usefulProfileFields = [
    "commune",
    "situation_familiale",
    "nombre_enfants",
    "logement",
    "situation_professionnelle",
    "age",
    "revenus_foyer",
    "allocataire_caf",
    "handicap",
    "vehicule",
    "permis",
  ]

  const rememberedProfile: Record<string, unknown> = {}

  for (const key of usefulProfileFields) {
    if (hasValue(profile[key])) {
      rememberedProfile[key] = profile[key]
    }
  }

  if (Object.keys(rememberedProfile).length > 0) {
    patch.profile = rememberedProfile
  }

  const profileFacts = extractStableFactsFromProfile(profile)
  const textFacts = extractStableFactsFromText(textForExtraction)
  patch.stable_facts = mergeStableFacts(profileFacts, textFacts)

  const caseState = extractCaseStateFromText(textForExtraction)
  if (Object.keys(caseState).length > 0) {
    patch.case_state = caseState
  }

  const livingCase = extractLivingCaseFromText(textForExtraction, mode, language)
  if (Object.keys(livingCase).length > 0) {
    patch.living_case = livingCase
  }

  if (question && countMeaningfulWords(question) > 2) {
    patch.last_user_subject = question.slice(0, 500)
    patch.recent_topics = [summarizeTopic(question)]
  }

  const suggested = extractSuggestedAidesFromText(`${question}\n${answer}`)
  if (suggested.length > 0) {
    patch.already_suggested = suggested
  }

  const currentTurn = buildCurrentTurn(body, answer, mode, language)
  const historyTurns = extractRecentHistoryTurns(body)
  const turns = uniqueConversationTurns([
    ...(currentTurn ? [currentTurn] : []),
    ...historyTurns,
  ], 8)

  if (turns.length > 0) {
    patch.conversation_turns = turns
  }

  return patch
}

export function mergeMemory(
  existingMemory: any = {},
  patch: AssistantMemoryPatch,
) {
  const current = existingMemory?.memory || existingMemory || {}

  const merged = {
    ...current,
    updated_at: patch.updated_at,
    profile: {
      ...(current.profile || {}),
      ...(patch.profile || {}),
    },
    stable_facts: mergeStableFacts(current.stable_facts || {}, patch.stable_facts || {}),
    case_state: mergeCaseState(current.case_state || {}, patch.case_state || {}),
    living_case: mergeLivingCase(current.living_case || {}, patch.living_case || {}),
    last_user_subject: patch.last_user_subject || current.last_user_subject || "",
    known_facts: uniqueStrings([
      ...(current.known_facts || []),
      ...(patch.known_facts || []),
    ], 20),
    recent_topics: uniqueStrings([
      ...(patch.recent_topics || []),
      ...(current.recent_topics || []),
    ], 10),
    already_suggested: uniqueStrings([
      ...(current.already_suggested || []),
      ...(patch.already_suggested || []),
    ], 20),
    user_preferences: uniqueStrings([
      ...(current.user_preferences || []),
      ...(patch.user_preferences || []),
      ...(patch.stable_facts?.preferences || []),
    ], 15),
    conversation_turns: uniqueConversationTurns([
      ...(patch.conversation_turns || []),
      ...(current.conversation_turns || []),
    ], 8),
  }

  return merged
}

function formatConversationTurn(turn: AssistantMemoryTurn, index: number) {
  const lines: string[] = []

  lines.push(`Échange ${index + 1} :`)
  lines.push(`- Utilisateur : ${String(turn.question || "").slice(0, 350)}`)

  if (turn.answer) {
    lines.push(`- Conseiller : ${String(turn.answer).slice(0, 500)}`)
  }

  if (turn.topic) {
    lines.push(`- Sujet compris : ${turn.topic}`)
  }

  return lines.join("\n")
}

function formatStableFacts(facts: AssistantStableFacts = {}) {
  const lines: string[] = []

  if (facts.commune || facts.city) lines.push(`- Commune connue : ${facts.commune || facts.city}`)
  if (facts.children_count !== undefined) lines.push(`- Enfants : ${facts.children_count}`)
  if (facts.family_situation) lines.push(`- Situation familiale : ${facts.family_situation}`)
  if (facts.housing_status) lines.push(`- Logement : ${facts.housing_status}`)
  if (facts.professional_status) lines.push(`- Situation professionnelle : ${facts.professional_status}`)
  if (facts.household_income !== undefined) lines.push(`- Revenus du foyer : environ ${facts.household_income} € / mois`)
  if (facts.caf_recipient !== undefined) lines.push(`- Allocataire CAF : ${facts.caf_recipient ? "oui" : "non"}`)
  if (facts.has_disability !== undefined) lines.push(`- Handicap : ${facts.has_disability ? "oui" : "non"}`)
  if (facts.benefits?.length) lines.push(`- Aides/prestations mentionnées : ${facts.benefits.join(", ")}`)
  if (facts.goals?.length) lines.push(`- Objectifs/demandes en cours : ${facts.goals.join(", ")}`)
  if (facts.current_needs?.length) lines.push(`- Besoins actuels : ${facts.current_needs.join(", ")}`)
  if (facts.procedures?.length) lines.push(`- Organismes/démarches déjà évoqués : ${facts.procedures.join(", ")}`)
  if (facts.blockers?.length) lines.push(`- Blocages ou risques : ${facts.blockers.join(", ")}`)
  if (facts.preferences?.length) lines.push(`- Préférences : ${facts.preferences.join(", ")}`)
  if (facts.last_updates?.length) lines.push(`- Dernières infos apprises : ${facts.last_updates.slice(0, 5).join(" ; ")}`)

  return lines
}

function formatCaseState(caseState: AssistantCaseState = {}) {
  const lines: string[] = []

  if (caseState.housing) lines.push(`- Logement : ${caseState.housing}`)
  if (caseState.caf) lines.push(`- CAF : ${caseState.caf}`)
  if (caseState.ccas) lines.push(`- CCAS/Mairie : ${caseState.ccas}`)
  if (caseState.france_travail) lines.push(`- France Travail : ${caseState.france_travail}`)
  if (caseState.mdph) lines.push(`- MDPH : ${caseState.mdph}`)
  if (caseState.budget) lines.push(`- Budget : ${caseState.budget}`)
  if (caseState.documents?.length) lines.push(`- Documents déjà évoqués : ${caseState.documents.join(", ")}`)
  if (caseState.appointments?.length) lines.push(`- Rendez-vous : ${caseState.appointments.join(", ")}`)
  if (caseState.refusals?.length) lines.push(`- Refus/rejets : ${caseState.refusals.join(", ")}`)

  return lines
}

export function buildMemoryPrompt(memoryRecord: AssistantMemoryRecord | any = null) {
  const memory = memoryRecord?.memory || memoryRecord || {}

  const profile = memory?.profile || {}
  const stableFacts = memory?.stable_facts || {}
  const caseState = memory?.case_state || {}
  const livingCase = memory?.living_case || {}
  const knownFacts = Array.isArray(memory?.known_facts) ? memory.known_facts : []
  const recentTopics = Array.isArray(memory?.recent_topics) ? memory.recent_topics : []
  const alreadySuggested = Array.isArray(memory?.already_suggested) ? memory.already_suggested : []
  const userPreferences = Array.isArray(memory?.user_preferences) ? memory.user_preferences : []
  const conversationTurns = Array.isArray(memory?.conversation_turns) ? memory.conversation_turns : []

  const profileFacts = Object.entries(profile)
    .map(([key, value]) => formatProfileFact(key, value))
    .filter(Boolean)

  const stableFactLines = formatStableFacts(stableFacts)
  const caseStateLines = formatCaseState(caseState)
  const livingCaseLines = formatLivingCase(livingCase)

  const lines: string[] = []

  lines.push("MÉMOIRE ÉVOLUTIVE BUDGETKAZPEI")
  lines.push("Utilise ces éléments pour répondre avec continuité, sans réciter la mémoire ni révéler son stockage.")
  lines.push("Important : utilise seulement les informations pertinentes pour la demande actuelle. Ne rappelle pas tout le profil à chaque réponse.")

  if (livingCaseLines.length > 0) {
    lines.push("")
    lines.push("Mémoire vivante du dossier :")
    for (const item of livingCaseLines.slice(0, 22)) {
      lines.push(item)
    }
    lines.push("Utilise cette mémoire pour continuer le dossier : si la demande actuelle ajoute une précision, mets à jour ton conseil au lieu de recommencer.")
  }

  if (stableFactLines.length > 0) {
    lines.push("")
    lines.push("Faits durables connus :")
    for (const fact of stableFactLines.slice(0, 16)) {
      lines.push(fact)
    }
  }

  if (caseStateLines.length > 0) {
    lines.push("")
    lines.push("État des démarches ou dossiers :")
    for (const item of caseStateLines.slice(0, 12)) {
      lines.push(item)
    }
  }

  if (profileFacts.length > 0) {
    lines.push("")
    lines.push("Profil BudgetKazPei disponible :")
    for (const fact of profileFacts.slice(0, 8)) {
      lines.push(`- ${fact}`)
    }
  }

  if (knownFacts.length > 0) {
    lines.push("")
    lines.push("Informations déjà connues :")
    for (const fact of knownFacts.slice(0, 8)) {
      lines.push(`- ${fact}`)
    }
  }

  if (recentTopics.length > 0) {
    lines.push("")
    lines.push("Sujets récents :")
    for (const topic of recentTopics.slice(0, 6)) {
      lines.push(`- ${topic}`)
    }
  }

  if (conversationTurns.length > 0) {
    lines.push("")
    lines.push("Derniers échanges utiles à relier à la demande actuelle :")
    for (const [index, turn] of conversationTurns.slice(0, 5).entries()) {
      lines.push(formatConversationTurn(turn, index))
    }
    lines.push("Si la nouvelle demande est courte, vague, ou ajoute une précision, rattache-la au dernier sujet pertinent au lieu de repartir de zéro.")
  }

  if (alreadySuggested.length > 0) {
    lines.push("")
    lines.push("Aides ou pistes déjà évoquées :")
    for (const item of alreadySuggested.slice(0, 8)) {
      lines.push(`- ${item}`)
    }
    lines.push("Évite de répéter exactement les mêmes pistes. Si tu dois les reprendre, explique ce que la nouvelle information change.")
  }

  if (userPreferences.length > 0) {
    lines.push("")
    lines.push("Préférences utilisateur :")
    for (const pref of userPreferences.slice(0, 6)) {
      lines.push(`- ${pref}`)
    }
  }

  if (memory?.last_user_subject) {
    lines.push("")
    lines.push(`Dernier sujet important : ${String(memory.last_user_subject).slice(0, 300)}`)
  }

  lines.push("")
  lines.push("Règles mémoire :")
  lines.push("- Ne redemande pas une information déjà connue sauf si elle est probablement obsolète ou contradictoire.")
  lines.push("- Si une nouvelle information contredit une ancienne, privilégie la plus récente et reste prudent.")
  lines.push("- La mémoire enrichit la réponse, mais ne doit jamais devenir un résumé complet du dossier.")
  lines.push("- Pour une demande courte comme 'et si...', 'oui', 'j'ai deux enfants', rattache la phrase au dernier sujet utile.")
  lines.push("- Si un dossier est bloqué/refusé/envoyé/en attente, adapte la prochaine action à cet état au lieu de conseiller une démarche comme si elle n'avait jamais commencé.")
  lines.push("- Ne répète pas FSL/APL/CAF/CCAS mécaniquement : explique ce qui change avec la nouvelle information, ou propose l'étape suivante du dossier.")

  return lines.join("\n").trim()
}

export function buildConversationMemory(memoryRecord: AssistantMemoryRecord | any = null) {
  return buildMemoryPrompt(memoryRecord)
}

export async function loadAssistantMemory(supabaseAdmin: any, userId: string) {
  try {
    const { data, error } = await supabaseAdmin
      .from("assistant_memory")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle()

    if (error) {
      console.log("Assistant memory ignored:", error.message)
      return null
    }

    return data || null
  } catch (error) {
    console.log("Assistant memory unavailable:", String(error))
    return null
  }
}

export async function saveAssistantMemory(
  supabaseAdmin: any,
  userId: string,
  body: any,
  existingMemory: any = null,
  answer = "",
  mode = "general",
  language: AssistantLanguage = "fr",
) {
  try {
    const patch = extractMemoryPatch(body, answer, mode, language)
    const mergedMemory = mergeMemory(existingMemory, patch)

    const { error } = await supabaseAdmin
      .from("assistant_memory")
      .upsert(
        {
          user_id: userId,
          memory: mergedMemory,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      )

    if (error) {
      console.log("Assistant memory save ignored:", error.message)
    }

    return mergedMemory
  } catch (error) {
    console.log("Assistant memory save unavailable:", String(error))
    return null
  }
}

export function summarizeTopic(text = "") {
  const clean = String(text || "").trim()
  if (!clean) return ""

  const normalized = normalizeText(clean)

  if (normalized.includes("loyer") || normalized.includes("logement") || normalized.includes("apl")) {
    return "Recherche d'aide liée au logement ou au loyer"
  }

  if (
    normalized.includes("enfant") ||
    normalized.includes("marmay") ||
    normalized.includes("marmaille") ||
    normalized.includes("marmaill") ||
    normalized.includes("garde")
  ) {
    return "Précision sur les enfants ou la situation familiale"
  }

  if (normalized.includes("caf") || normalized.includes("rsa") || normalized.includes("prime activite")) {
    return "Question liée à la CAF, au RSA ou à la prime d'activité"
  }

  if (normalized.includes("courrier") || normalized.includes("refus") || normalized.includes("recours")) {
    return "Compréhension d'un courrier, refus ou recours administratif"
  }

  if (normalized.includes("emploi") || normalized.includes("travail") || normalized.includes("france travail")) {
    return "Question liée à l'emploi ou à France Travail"
  }

  if (normalized.includes("email") || normalized.includes("mail")) {
    return "Rédaction d'un email administratif"
  }

  if (normalized.includes("rendez") || normalized.includes("rdv")) {
    return "Préparation d'un rendez-vous administratif"
  }

  return clean.slice(0, 160)
}

export function extractSuggestedAidesFromText(text = "") {
  const normalized = normalizeText(text)

  const aides = [
    { key: "apl", label: "APL / aide au logement" },
    { key: "als", label: "ALS" },
    { key: "alf", label: "ALF" },
    { key: "fsl", label: "FSL" },
    { key: "rsa", label: "RSA" },
    { key: "prime activite", label: "Prime d'activité" },
    { key: "ccas", label: "CCAS / mairie" },
    { key: "action logement", label: "Action Logement" },
    { key: "caf", label: "CAF Réunion" },
    { key: "departement", label: "Département de La Réunion" },
    { key: "region", label: "Région Réunion" },
    { key: "france travail", label: "France Travail Réunion" },
    { key: "cgss", label: "CGSS" },
    { key: "mdph", label: "MDPH" },
  ]

  return aides
    .filter((aide) => normalized.includes(aide.key))
    .map((aide) => aide.label)
}
