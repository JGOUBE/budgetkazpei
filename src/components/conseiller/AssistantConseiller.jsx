import { useEffect, useMemo, useState } from "react"
import {
  Bot,
  Send,
  Trash2,
  Sparkles,
  MessageCircle,
  UserRound,
  ChevronRight,
} from "lucide-react"
import { useRef } from "react"

import { supabase } from "../../services/supabase"
import { REUNION_ORIENTATION } from "../../data/reunionOrientation"
import { createColorAliases } from "../../styles/designSystem"
import { useTheme } from "../../styles/ThemeProvider"
import {
  ADVISOR_PROMPT_EVENT,
  consumeAdvisorHandoff,
} from "../../services/advisorHandoff"
import { useAssistantInsights } from "../../hooks/useAssistantInsights"
import { buildAssistantAiSummary } from "../../services/ai/assistantInsightsService"
import {
  answerAssistantQuestion,
  detectAssistantIntent,
  isBudgetAssistantIntent,
  selectAssistantActionLabel,
  selectAssistantAnswerText,
} from "../../services/ai/assistantIntentEngine"
import { requestAppSectionNavigation } from "../../services/appSectionNavigation"
import { resolveAdvisorLanguage } from "../../services/advisorLanguage"
import { selectAidCandidatesForAdvisor } from "../../services/aidesRanking"
import { prepareAdvisorAideContext } from "../../services/advisorAideContext"
import { buildLocalAidSourceAnswer, isLocalAidSourceRequest } from "../../services/advisorLocalAidAnswer"
import {
  shouldLookupAdvisorAids,
  shouldUseLocalBudgetAnswer,
  resolveAdvisorModeForQuestion,
} from "../../services/advisorQuestionRouter"
import {
  ADVISOR_TURN_TYPES,
  buildAdvisorConversationContext,
  getAdvisorRankingOptions,
  resolveAdvisorBudgetConfirmation,
  resolveAdvisorBudgetNoDataAdvice,
} from "../../services/advisorConversation"

// Public reference catalogue: short-lived cache shared across advisor turns.
// Supabase is queried only when social/aid knowledge is required.
let advisorAidCache = { data: null, until: 0, pending: null }
const ADVISOR_AID_CACHE_MS = 3 * 60 * 1000

const COLORS = createColorAliases({ red: () => "#FB7185" })

const MODE_LABELS = {
  budget_depenses: {
    fr: "Budget et dépenses",
    kreol: "Bidzé ek dépans",
  },
  scan_profil: {
    fr: "Scanner mon profil",
    kreol: "Scan mon profil",
  },
  trouver_aide: {
    fr: "Trouver une aide",
    kreol: "Trouve in aide",
  },
  comprendre_courrier: {
    fr: "Comprendre un courrier",
    kreol: "Comprann in courrier",
  },
  preparer_dossier: {
    fr: "Preparer un dossier",
    kreol: "Prepar in dossier",
  },
  generer_courrier: {
    fr: "Générer un courrier",
    kreol: "Prépar in kourrié",
  },
  generer_email: {
    fr: "Generer un email",
    kreol: "Prepar in email",
  },
  preparer_relance: {
    fr: "Préparer une relance",
    kreol: "Prépar in relance",
  },
  comprendre_refus: {
    fr: "Comprendre un refus",
    kreol: "Comprann in refus",
  },
  preparer_recours: {
    fr: "Preparer un recours",
    kreol: "Prepar in recours",
  },
  preparer_rdv: {
    fr: "Preparer un rendez-vous",
    kreol: "Prepar in rendez-vous",
  },
  general: {
    fr: "Conseiller",
    kreol: "Konseye",
  },
}

const advisorSessionByUser = new Map()

// Public aid catalogue: refresh occasionally, not at every user question.
// Promise sharing prevents concurrent requests from multiplying Supabase reads.
const advisorAidCatalogueCache = { rows: null, expiresAt: 0, pending: null }

function formatAdvisorAnswer(value = "") {
  const text = String(value || "").replace(/\r\n/g, "\n")
  const lines = text.split("\n")
  const nodes = []

  lines.forEach((line, lineIndex) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g).filter(Boolean)
    parts.forEach((part, partIndex) => {
      const strong = /^\*\*[^*]+\*\*$/.test(part)
      nodes.push(strong
        ? <strong key={`${lineIndex}-${partIndex}`}>{part.slice(2, -2)}</strong>
        : <span key={`${lineIndex}-${partIndex}`}>{part.replace(/\*\*/g, "")}</span>)
    })
    if (lineIndex < lines.length - 1) nodes.push(<br key={`br-${lineIndex}`} />)
  })

  return nodes
}

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

function isKreolLanguage(t) {
  if (typeof t !== "function") return false
  const lang = String(t.lang || "").toLowerCase()
  if (lang === "cr" || lang === "kreol") return true
  return normalizeText(t("nav", "dashboard")) === "tablo debor"
}

function formatValue(value, fallback = "Non renseigne") {
  if (value === null || value === undefined || value === "") return fallback
  return value
}

function formatMoney(value, isKreol = false) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) {
    return isKreol ? "Pa renseigne" : "Non renseigne"
  }
  return `${number.toFixed(0).replace(".", ",")} EUR / mois`
}

function formatSituation(value, isKreol = false) {
  const fr = {
    celibataire: "Celibataire",
    couple: "En couple",
    marie: "Marie(e)",
    parent_isole: "Parent isole",
    locataire: "Locataire",
    proprietaire: "Proprietaire",
    heberge: "Heberge gratuitement",
    salarie: "Salarie",
    independant: "Independant",
    demandeur_emploi: "Demandeur d'emploi",
    etudiant: "Etudiant",
    retraite: "Retraite",
  }

  const kreol = {
    celibataire: "Sel",
    couple: "An koup",
    marie: "Marye",
    parent_isole: "Parent tousel",
    locataire: "Lokater",
    proprietaire: "Propriyeter",
    heberge: "Heberge gratwi",
    salarie: "Salarie",
    independant: "Travay pou son kont",
    demandeur_emploi: "Domander d'emploi",
    etudiant: "Etidyan",
    retraite: "Retraite",
  }

  const map = isKreol ? kreol : fr
  return map[value] || formatValue(value, isKreol ? "Pa renseigne" : "Non renseigne")
}

function formatIncomeDetails(details = {}) {
  if (!details || typeof details !== "object") return ""
  const parts = []
  const money = value => {
    const number = Number(String(value ?? 0).replace(",", "."))
    return Number.isFinite(number) && number > 0 ? `${number.toFixed(2).replace(".", ",")} EUR` : ""
  }

  if (money(details.salaire_parent_1)) parts.push(`Salaire parent 1 ${money(details.salaire_parent_1)}`)
  if (money(details.salaire_parent_2)) parts.push(`Salaire parent 2 ${money(details.salaire_parent_2)}`)
  if (money(details.france_travail)) parts.push(`France Travail ${money(details.france_travail)}`)
  if (money(details.autres_revenus)) parts.push(`Autres revenus ${money(details.autres_revenus)}`)
  ;(Array.isArray(details.aides) ? details.aides : []).forEach(aide => {
    if (money(aide.amount)) parts.push(`${aide.label || "Aide"} ${money(aide.amount)}`)
  })

  return parts.join(" ; ")
}

function resolveRevenusDetails(profile = {}, isKreol = false) {
  const details =
    profile?.revenusDetails ??
    profile?.revenus_details ??
    profile?.incomeDetails ??
    profile?.revenus ??
    null

  if (typeof details === "string") return details.trim()

  if (typeof details === "number" && Number.isFinite(details) && details > 0) {
    return formatMoney(details, isKreol)
  }

  if (details && typeof details === "object") {
    const formattedDetails = formatIncomeDetails(details)
    if (formattedDetails) return formattedDetails
  }

  const revenusFoyer = profile?.revenus_foyer ?? profile?.revenusFoyer ?? null
  const revenusText = formatMoney(revenusFoyer, isKreol)
  return revenusText.includes("Non renseigne") || revenusText.includes("Pa renseigne")
    ? ""
    : revenusText
}

function buildProfileSummary(profile = {}, isKreol = false) {
  const revenusDetails = resolveRevenusDetails(profile, isKreol)
  if (isKreol) {
    return [
      `Komin : ${formatValue(profile.commune, "Pa renseigne")}`,
      `Sitiasyon famiy : ${formatSituation(profile.situation_familiale, true)}`,
      `Nomb marmay : ${formatValue(profile.nombre_enfants, "Pa renseigne")}`,
      `Sitiasyon kaz : ${formatSituation(profile.logement, true)}`,
      `Sitiasyon profesyonel : ${formatSituation(profile.situation_professionnelle, true)}`,
      `Laz : ${formatValue(profile.age, "Pa renseigne")}`,
      `Larzan rant dan kaz : ${formatMoney(profile.revenus_foyer, true)}`,
      revenusDetails ? `Detail revenus : ${revenusDetails}` : "",
    ].filter(Boolean).join("\n")
  }

  return [
    `Commune : ${formatValue(profile.commune)}`,
    `Situation familiale : ${formatSituation(profile.situation_familiale)}`,
    `Nombre d'enfants : ${formatValue(profile.nombre_enfants)}`,
    `Logement : ${formatSituation(profile.logement)}`,
    `Situation professionnelle : ${formatSituation(profile.situation_professionnelle)}`,
    `Age : ${formatValue(profile.age)}`,
    `Revenus du foyer : ${formatMoney(profile.revenus_foyer)}`,
    revenusDetails ? `Detail revenus : ${revenusDetails}` : "",
  ].filter(Boolean).join("\n")
}

function getModeLabel(mode = "general", isKreol = false) {
  const entry = MODE_LABELS[mode] || MODE_LABELS.general
  return isKreol ? entry.kreol : entry.fr
}

function buildModeInstruction(mode = "general", isKreol = false) {
  const fr = {
    budget_depenses:
      "Comportement : répondre d'abord à la question avec les chiffres du contexte BudgetAdvisorContext. Ne jamais inventer revenu, dépense, cause, économie, marge ou comparaison. Séparer observation et interprétation, signaler les données manquantes, prioriser les facteurs utiles et proposer au maximum deux actions. Utiliser uniquement reliableSavingsTotal pour une économie personnelle ; un prix promo sans prix historique n'est pas une économie.",
    trouver_aide:
      "Comportement : chercher les aides les plus pertinentes, expliquer pourquoi elles peuvent correspondre, rester prudent, et proposer une seule prochaine action.",
    comprendre_courrier:
      "Comportement : aider a comprendre un courrier administratif uniquement a partir des elements fournis, sans inventer, en distinguant ce qui est ecrit et ce qui reste a verifier.",
    preparer_dossier:
      "Comportement : aider a preparer un dossier concret avec les documents probables, les etapes simples, les informations manquantes et une prochaine action.",
    generer_courrier:
      "Comportement : rediger un courrier administratif structure, poli et pret a copier, sans identite ni information inventee, avec [A completer] si besoin.",
    generer_email:
      "Comportement : rediger un email administratif pret a copier, poli, simple, sans nom/prenom ni situation inventee, avec [A completer] si besoin.",
    preparer_relance:
      "Comportement : rediger une relance courte, polie et factuelle, sans date, reference ou engagement invente, avec [A completer] si besoin.",
    comprendre_refus:
      "Comportement : expliquer uniquement le refus fourni, distinguer ce qui est ecrit de ce qui manque, sans inventer motif, delai ou recours.",
    preparer_recours:
      "Comportement : aider a structurer un recours avec prudence, sans avis juridique, sans garantir l'acceptation, et uniquement selon les faits donnes.",
    preparer_rdv:
      "Comportement : preparer un rendez-vous administratif avec les questions utiles, les documents a apporter, les points a verifier et une phrase simple pour expliquer la situation.",
    general:
      "Comportement : conseiller naturellement l'utilisateur, comprendre son intention reelle, repondre simplement, et proposer une prochaine action utile si pertinent.",
  }

  const kreol = {
    budget_depenses:
      "Komportman : répond dabor kestyon-la avèk chiffres BudgetAdvisorContext. Invente jamais revenus, dépans, cause, lékonomi, marge ou comparaison. Sépare observation ek interprétation, signale donné i manque, priorise facteurs utiles ek propose maximum dé actions. Utilise seulement reliableSavingsTotal pou in lékonomi pèsonèl ; prix promo sans prix historique lé pa in lékonomi.",
    trouver_aide:
      "Komportman : rode bann aides les plus pertinentes, explique poukosa zot i pe correspond, reste prudent, ek propose une seule prochaine action.",
    comprendre_courrier:
      "Komportman : aide comprend in courrier administratif seulement avec sak le fourni, sans inventer, en separant sak le ecrit ek sak faut verifiye.",
    preparer_dossier:
      "Komportman : aide prepar in dossier concret avec dokiman probables, etapes simples, infos manquantes ek prochaine action.",
    generer_courrier:
      "Komportman : redige in kourrie administratif kler, poli ek pret pou kopie, san invente okenn info, avek [A completer] si bizin.",
    generer_email:
      "Komportman : redige in email administratif pret pou copier, poli, simple, sans nom/prenom ni situation inventee, avec [A completer] si besoin.",
    preparer_relance:
      "Komportman : redige in relance courte, polie ek factuelle, sans invente date, reference ou engagement, avec [A completer] si besoin.",
    comprendre_refus:
      "Komportman : explique seulement refus fourni, sépare sak lé écrit ek sak i manque, sans invente motif, delai ou recours.",
    preparer_recours:
      "Komportman : aide structurer in recours avec prudence, sans avis juridique, sans garantir acceptation, seulement selon faits donnes.",
    preparer_rdv:
      "Komportman : prepar in rendez-vous administratif avec kestions utiles, dokiman pou amene, points pou verifiye ek phrase simple pou expliquer situation.",
    general:
      "Komportman : conseille naturellement l'utilisateur, comprend son intention reelle, repond simplement, ek propose une prochaine action utile si pertinent.",
  }

  return (isKreol ? kreol : fr)[mode] || (isKreol ? kreol.general : fr.general)
}

function buildQuestionForAi(question = "", mode = "general", isKreol = false, profile = {}) {
  const cleanQuestion = String(question || "").trim()
  const revenusDetails = resolveRevenusDetails(profile, isKreol)

  return [
    "INTENTION / COMPORTEMENT ATTENDU :",
    buildModeInstruction(mode, isKreol),
    "",
    "MESSAGE UTILISATEUR :",
    cleanQuestion ||
      (isKreol
        ? "Analyse mon profil et propose la prochaine action utile."
        : "Analyse mon profil et propose la prochaine action utile."),
    revenusDetails ? `Detail revenus : ${revenusDetails}` : "",
  ].filter(Boolean).join("\n")
}

function selectAidesForContext(aides = [], profile = {}, conversationContext = {}) {
  return selectAidCandidatesForAdvisor(
    aides,
    profile,
    conversationContext.rankingQuery,
    getAdvisorRankingOptions(conversationContext),
  )
}

export default function AssistantConseiller({
  isMobile,
  t,
  user,
  modes = [],
  quickQuestions = [],
  advancedModes = [],
  access,
  transactions = [],
  historyTransactions,
  recurringCharges,
  budgetTargets = [],
  stats = {},
  byCategory = [],
}) {
  const { themeName } = useTheme()
  const isKreol = isKreolLanguage(t)
  const isLightTheme = themeName === "light"

  const [question, setQuestion] = useState("")
  const [assistantMode, setAssistantMode] = useState("general")
  const [quickQuestionSelected, setQuickQuestionSelected] = useState(false)
  const [showTopicPicker, setShowTopicPicker] = useState(false)
  const [loadingAssistant, setLoadingAssistant] = useState(false)
  const [history, setHistory] = useState(() =>
    user?.id ? advisorSessionByUser.get(user.id)?.history || [] : []
  )
  const [errorMessage, setErrorMessage] = useState("")
  const [pendingMessage, setPendingMessage] = useState(null)
  const [failedMessage, setFailedMessage] = useState(null)
  const [advisorHandoffContext, setAdvisorHandoffContext] = useState(null)
  const messagesEndRef = useRef(null)
  const textareaRef = useRef(null)
  const {
    insights: financialInsights,
    buildForQuestion,
    profile,
    loading: loadingInsights,
    error: financialContextError,
  } = useAssistantInsights({
    userId: user?.id,
    transactions,
    historyTransactions,
    recurringCharges,
    budgetTargets,
    stats,
    byCategory,
  })

  const activeModeLabel = useMemo(() => {
    return getModeLabel(assistantMode, isKreol)
  }, [assistantMode, isKreol])

  const analyzeDisabled =
    loadingInsights ||
    loadingAssistant ||
    !question.trim() ||
    !access?.canUseAdvisor

  useEffect(() => {
    if (!user?.id) return
    advisorSessionByUser.set(user.id, { history })
  }, [history, user?.id])

  useEffect(() => {
    // Leave the introduction and its three choices visible on first open.
    // Auto-scroll only when there is an actual conversation to follow.
    if (history.length === 0 && !pendingMessage && !errorMessage) return
    messagesEndRef.current?.scrollIntoView({
      behavior: "auto",
      block: "end",
    })
  }, [history.length, pendingMessage, loadingAssistant, errorMessage])

  useEffect(() => {
    function handleExternalAssistantPrompt(event) {
      const prompt = String(event?.detail?.prompt || "").trim()
      const mode = String(event?.detail?.mode || "general").trim() || "general"

      if (!prompt) return

      setAssistantMode(mode)
      setQuestion(prompt)
      setAdvisorHandoffContext(event?.detail?.context || null)
      setQuickQuestionSelected(true)
      setErrorMessage("")
      setFailedMessage(null)

      setTimeout(() => {
        const element = document.getElementById("budgetkazpei-assistant-zone")
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "start" })
        }
      }, 80)
    }

    const pendingHandoff = consumeAdvisorHandoff()
    if (pendingHandoff) handleExternalAssistantPrompt({ detail: pendingHandoff })

    window.addEventListener(ADVISOR_PROMPT_EVENT, handleExternalAssistantPrompt)

    return () => {
      window.removeEventListener(ADVISOR_PROMPT_EVENT, handleExternalAssistantPrompt)
    }
  }, [])

  async function fetchAides() {
    if (Array.isArray(advisorAidCache.data) && Date.now() < advisorAidCache.until) {
      return advisorAidCache.data
    }
    if (advisorAidCache.pending) return advisorAidCache.pending

    advisorAidCache.pending = (async () => {
      const pageSize = 500
      const all = []
      // Do not silently truncate the directory as associations are added.
      for (let offset = 0; offset < 5000; offset += pageSize) {
        const { data, error } = await supabase
          .from("aides_reunion")
          .select("id,nom,nom_kreol,description,description_fr,description_kreol,demarches_fr,demarches_kreol,montant_min,montant_max,categorie,condition_logement,condition_profession,condition_famille,commune,lien,lien_officiel,besoin_enfant,besoin_demandeur_emploi,besoin_locataire,besoin_proprietaire,besoin_allocataire_caf,score_priorite,actif")
          .eq("actif", true)
          .order("score_priorite", { ascending: false })
          .order("id", { ascending: true })
          .range(offset, offset + pageSize - 1)
        if (error) throw error
        all.push(...(data || []))
        if (!data || data.length < pageSize) {
          advisorAidCache.data = all
          advisorAidCache.until = Date.now() + ADVISOR_AID_CACHE_MS
          return all
        }
      }
      throw new Error("Catalogue d'aides trop volumineux : pagination à étendre.")
    })()
    try {
      return await advisorAidCache.pending
    } finally {
      advisorAidCache.pending = null
    }
  }

  async function callAssistantAi({
    sentQuestion,
    currentProfile,
    aides,
    mode,
    recentHistory,
    isQuickPreset,
    handoffContext,
    questionInsights,
    detectedIntent,
  }) {
    const interfaceLanguage = isKreol ? "kreol" : "fr"
    const assistantLanguage = resolveAdvisorLanguage({
      message: sentQuestion,
      interfaceLanguage,
    })
    const assistantIsKreol = assistantLanguage === "kreol"
    const conversationContext = buildAdvisorConversationContext({
      question: sentQuestion,
      recentHistory,
      aides,
    })
    const selectedAides = selectAidesForContext(aides, currentProfile, conversationContext)
    const noRelevantAlternative =
      conversationContext.turnType === ADVISOR_TURN_TYPES.REQUEST_ALTERNATIVE &&
      selectedAides.length === 0
    const preparedAides = prepareAdvisorAideContext(
      selectedAides,
      assistantIsKreol,
      conversationContext.rankingQuery,
    )
    const financialContext = buildAssistantAiSummary(questionInsights || financialInsights, detectedIntent)

    const localContext = {
      commune: currentProfile?.commune || "",
      situation_familiale: currentProfile?.situation_familiale || "",
      logement: currentProfile?.logement || "",
      situation_professionnelle: currentProfile?.situation_professionnelle || "",
      nombre_enfants: currentProfile?.nombre_enfants ?? null,
      revenus_foyer: currentProfile?.revenus_foyer ?? null,
      revenus_details: currentProfile?.revenus_details ?? null,
      allocataire_caf: currentProfile?.allocataire_caf ?? null,
      financial: financialContext,
      financial_context_status: financialContextError ? "partially_unavailable" : "available",
      financial_reliability_rules: {
        aggregated_only: true,
        historical_prices_may_have_changed: true,
        product_savings_are_reliable_only: true,
      },
      organismes_locaux_a_verifier: [
        currentProfile?.commune
          ? `CCAS / Mairie de ${currentProfile.commune}`
          : "CCAS / Mairie de la commune",
        "CAF Reunion",
        "Departement de La Reunion",
        "Region Reunion",
        "France Travail Reunion",
      ],
    }

    // Opt-in QA only: a separate server-side admin-restricted function.
    // The live budgetkazpei.re always keeps the production assistant.
    const reviewEnabled = (
      typeof window !== "undefined" &&
      window.location.hostname.endsWith(".budgetkazpei.pages.dev") &&
      new URLSearchParams(window.location.search).get("conseillerBeta") === "1"
    )
    const assistantEndpoint = reviewEnabled
      ? "assistant-aisupabase-review"
      : "assistant-aisupabase"
    const { data, error } = await supabase.functions.invoke(assistantEndpoint, {
      body: {
        question: buildQuestionForAi(sentQuestion, mode, assistantIsKreol, currentProfile),
        originalQuestion: sentQuestion,
        assistantMode: mode,
        assistantModeLabel: getModeLabel(mode, assistantIsKreol),
        modeInstruction: buildModeInstruction(mode, assistantIsKreol),
        language: assistantLanguage,
        interfaceLanguage,
        isKreol: assistantIsKreol,
        isQuickPreset: isQuickPreset || mode === "scan_profil",
        profile: currentProfile,
        profile_summary: buildProfileSummary(currentProfile, assistantIsKreol),
        localContext,
        recommendedAides: preparedAides,
        recommended_aides: preparedAides,
        reunionOrientation: REUNION_ORIENTATION,
        reunion_orientation: REUNION_ORIENTATION,
        advisorHandoffContext: handoffContext || null,
        conversationContext: {
          ...conversationContext,
          noRelevantAlternative,
        },
        recentHistory: (recentHistory || []).map(item => ({
          question: item.question,
          answer: item.answer,
          mode: item.mode,
          source: item.source || null,
          createdAt: item.createdAt,
          conversationContext: item.conversationContext || null,
          recommendedAidIds: item.recommendedAidIds || [],
          recommendedAidNames: item.recommendedAidNames || [],
        })),
      },
    })

    if (error) {
      console.error("Erreur Edge Function assistant-aisupabase:", error)
      return {
        success: false,
        error: error.message || "Erreur assistant IA.",
      }
    }

    return data
      ? { ...data, conversationContext: { ...conversationContext, noRelevantAlternative } }
      : { success: false, error: "Reponse vide." }
  }

  async function handleAnalyze(messageOverride = null) {
    const sentQuestion = String(messageOverride?.question ?? question).trim()
    if (!sentQuestion) return

    const requestedMode = messageOverride?.mode || assistantMode || "general"
    const requestedQuickPreset = Boolean(
      messageOverride?.quickQuestionSelected ?? quickQuestionSelected
    )
    const currentProfile = profile || {}
    const interfaceLanguage = isKreol ? "kreol" : "fr"
    const responseLanguage = resolveAdvisorLanguage({ message: sentQuestion, interfaceLanguage })
    const detectedIntent = detectAssistantIntent(sentQuestion)
    const currentMode = resolveAdvisorModeForQuestion({
      mode: requestedMode,
      question: sentQuestion,
      intent: detectedIntent,
    })
    const questionInsights = buildForQuestion(sentQuestion, responseLanguage)
    // The budget engine is for the user's recorded finances, not for every
    // occurrence of "réduire", "course" or "abonnement" in an unusual question.
    const shouldAnswerLocally = (
      (currentMode === "budget_depenses" || currentMode === "general") &&
      (isBudgetAssistantIntent(detectedIntent) || detectedIntent === "cheapest_stores") &&
      shouldUseLocalBudgetAnswer({
        question: sentQuestion,
        mode: currentMode,
        intent: detectedIntent,
      })
    )

    setLoadingAssistant(true)
    setErrorMessage("")
    setFailedMessage(null)
    setPendingMessage({ question: sentQuestion, mode: currentMode })
    setQuestion("")
    setQuickQuestionSelected(false)

    // A short confirmation should continue the last offer rather than be
    // dismissed as off-topic. Use recorded figures without an AI call.
    const budgetConfirmation = resolveAdvisorBudgetConfirmation({
      question: sentQuestion,
      recentHistory: history,
      insights: questionInsights,
      language: responseLanguage,
      contextUnavailable: Boolean(financialContextError),
    })
    // When the previous budget analysis found no data, answer a straightforward
    // request for saving ideas locally. Detailed or new-topic requests still
    // reach the model under the server-side cost guard.
    const budgetNoDataAdvice = budgetConfirmation ? null : resolveAdvisorBudgetNoDataAdvice({
      question: sentQuestion,
      recentHistory: history,
      language: responseLanguage,
    })
    const localBudgetFollowUp = budgetConfirmation || budgetNoDataAdvice
    if (localBudgetFollowUp) {
      setHistory(prev => [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          question: sentQuestion,
          answer: localBudgetFollowUp.answer,
          actions: localBudgetFollowUp.actions,
          language: localBudgetFollowUp.language,
          mode: localBudgetFollowUp.mode,
          intent: localBudgetFollowUp.intent,
          source: localBudgetFollowUp.source,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ].slice(0, 6))
      setLoadingAssistant(false)
      setPendingMessage(null)
      setAssistantMode("general")
      setAdvisorHandoffContext(null)
      return
    }

    if (shouldAnswerLocally) {
      const localResult = answerAssistantQuestion({ question: sentQuestion, insights: questionInsights })
      const answer = selectAssistantAnswerText(localResult, responseLanguage)
      setHistory(prev => [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          question: sentQuestion,
          answer,
          actions: localResult.actions || [],
          language: responseLanguage,
          mode: currentMode,
          intent: localResult.intent,
          source: "local",
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ].slice(0, 6))
      setLoadingAssistant(false)
      setPendingMessage(null)
      setAssistantMode("general")
      setAdvisorHandoffContext(null)
      return
    }

    let result

    try {
      // Avoid injecting a catalogue of 74 social aids into questions about
      // science, cooking, fiction or jokes. Keep aid follow-ups and handoffs.
      const preliminaryContext = buildAdvisorConversationContext({
        question: sentQuestion,
        recentHistory: history,
        aides: [],
      })
      const needAidFacts = shouldLookupAdvisorAids({
        question: sentQuestion,
        mode: currentMode,
        conversationContext: preliminaryContext,
        recentHistory: history,
        handoffContext: advisorHandoffContext,
      }) || isLocalAidSourceRequest(sentQuestion)
      const aides = needAidFacts ? await fetchAides() : []

      // An exact request for an existing aid's reference URL is answered from
      // the catalogue. No model, no backend Edge Function, and no fabricated
      // eligibility or amount. Keep the exchange for natural follow-ups.
      const localAid = ["general", "trouver_aide"].includes(currentMode)
        ? buildLocalAidSourceAnswer({ question: sentQuestion, aides, language: responseLanguage })
        : null
      if (localAid) {
        setHistory(prev => [{
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          question: sentQuestion,
          answer: localAid.answer,
          language: responseLanguage,
          mode: currentMode,
          source: localAid.source,
          conversationContext: preliminaryContext,
          recommendedAidIds: localAid.recommendedAidIds,
          recommendedAidNames: localAid.recommendedAidNames,
          createdAt: new Date().toISOString(),
        }, ...prev].slice(0, 6))
        setLoadingAssistant(false)
        setPendingMessage(null)
        setAssistantMode("general")
        setAdvisorHandoffContext(null)
        return
      }

      result = await callAssistantAi({
        sentQuestion,
        currentProfile,
        aides,
        mode: currentMode,
        recentHistory: history,
        isQuickPreset: requestedQuickPreset,
        handoffContext: advisorHandoffContext,
        questionInsights,
        detectedIntent,
      })
    } catch (error) {
      console.error("Erreur analyse conseiller:", error)
      setLoadingAssistant(false)
      setPendingMessage(null)
      setFailedMessage({
        question: sentQuestion,
        mode: currentMode,
        quickQuestionSelected: requestedQuickPreset,
      })
      setErrorMessage(
        isKreol
          ? "Le konseye le indisponib pou linstan. Reessay in pe plus tar."
          : "Le conseiller est indisponible pour le moment. Réessayez dans quelques instants."
      )
      return
    }

    setLoadingAssistant(false)

    if (!result?.success) {
      setPendingMessage(null)
      setFailedMessage({
        question: sentQuestion,
        mode: currentMode,
        quickQuestionSelected: requestedQuickPreset,
      })
      setErrorMessage(
        result?.error ||
          (isKreol
            ? "Le konseye le indisponib pou linstan."
            : "Le conseiller est indisponible pour le moment.")
      )
      return
    }

    const responseIsKreol = result.language === "kreol"
    const answer =
      result.answer ||
      (responseIsKreol
        ? "Mi na pas reussi generer in repons pou linstan."
        : "Je n'ai pas réussi à générer une réponse pour le moment.")

    setHistory(prev =>
      [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          question: sentQuestion,
          answer,
          actions: result.actions || [],
          language: result.language || (responseIsKreol ? "kreol" : "fr"),
          mode: currentMode,
          source: result.source || (result.openAiCallCount > 0 ? "ai" : null),
          createdAt: new Date().toISOString(),
          conversationContext: result.conversationContext || null,
          recommendedAidIds: result.recommendedAidIds || [],
          recommendedAidNames: result.recommendedAidNames || [],
        },
        ...prev,
      ].slice(0, 6)
    )

    setPendingMessage(null)
    setQuestion("")
    setAssistantMode("general")
    setQuickQuestionSelected(false)
    setAdvisorHandoffContext(null)
  }

  function resetConversation() {
    setQuestion("")
    setAssistantMode("general")
    setQuickQuestionSelected(false)
    setHistory([])
    setErrorMessage("")
    setPendingMessage(null)
    setFailedMessage(null)
    setAdvisorHandoffContext(null)
  }

  function resizeComposer() {
    const textarea = textareaRef.current
    if (!textarea) return
    // Keep a genuine multi-line writing area even for a short question.
    // Grow with longer messages without allowing the keyboard/composer to
    // take over the entire conversation on a small phone.
    const minimumHeight = window.matchMedia("(max-width: 700px)").matches ? 112 : 88
    textarea.style.height = "auto"
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, minimumHeight), 200)}px`
  }

  useEffect(() => {
    // Resize after React applies typed, prefilled or cleared text.
    resizeComposer()
  }, [question])

  function selectSuggestion(mode) {
    setShowTopicPicker(false)
    setAssistantMode(mode.mode)
    setQuestion(mode.prompt)
    setAdvisorHandoffContext(null)
    setQuickQuestionSelected(true)
    setErrorMessage("")
    setFailedMessage(null)
    requestAnimationFrame(() => {
      resizeComposer()
      textareaRef.current?.focus()
    })
  }

  function handleComposerKeyDown(event) {
    if (event.key !== "Enter" || event.shiftKey) return
    event.preventDefault()
    if (!analyzeDisabled) handleAnalyze()
  }

  const chronologicalHistory = [...history].reverse()

  if (modes) {
    return (
      <section id="budgetkazpei-assistant-zone" className="bkp-advisor-chat">
        <header className="bkp-advisor-header">
          <div className="bkp-advisor-identity">
            <span className="bkp-advisor-avatar" aria-hidden="true"><Bot size={22} /></span>
            <div>
              <h2>{isKreol ? "Mon Konseyé" : "Mon Conseiller"}</h2>
              <p><span className="bkp-advisor-online-dot" />{isKreol ? "Bidzé, aides ek démarches" : "Budget, aides et démarches"}</p>
            </div>
          </div>

          <div className="bkp-advisor-header-actions">
            <button
              type="button"
              className="bkp-advisor-reset"
              onClick={resetConversation}
              disabled={loadingAssistant}
              aria-label={isKreol ? "Nouvo kozman" : "Nouvelle conversation"}
            >
              <Trash2 size={16} />
              <span>{isKreol ? "Nouvo kozman" : "Nouvelle conversation"}</span>
            </button>
          </div>
        </header>

        <div className="bkp-advisor-thread" aria-live="polite" aria-busy={loadingAssistant}>
          {chronologicalHistory.length === 0 && !pendingMessage && (
            <div className="bkp-advisor-onboarding">
              <div className="bkp-advisor-intro">
                <h3>{isKreol ? "Koman mi pé aide aou ?" : "Comment puis-je vous aider ?"}</h3>
                <p>{isKreol
                  ? "Poz out kestyon directement, ou choisis in sujet pou démar."
                  : "Posez votre question directement, ou choisissez un sujet pour commencer."}</p>
              </div>

              <div className="bkp-advisor-starters" aria-label={isKreol ? "Sujets pou commencer" : "Sujets pour commencer"}>
                {modes.map(mode => {
                  const Icon = mode.icon
                  return (
                    <button
                      type="button"
                      key={mode.mode}
                      className={`bkp-advisor-starter bkp-advisor-starter--${mode.mode}`}
                      onClick={() => selectSuggestion(mode)}
                    >
                      <Icon size={20} aria-hidden="true" />
                      <span>{mode.title}</span>
                      <ChevronRight size={17} className="bkp-advisor-starter-chevron" aria-hidden="true" />
                    </button>
                  )
                })}
              </div>

              {quickQuestions.length > 0 && (
                <details className="bkp-advisor-quick-details">
                  <summary>{isKreol ? "Kestions rapides su mon bidzé" : "Questions rapides sur mon budget"}</summary>
                  <div className="bkp-advisor-budget-quick" aria-label={isKreol ? "Kestions bidzé" : "Questions budget"}>
                    {quickQuestions.map(mode => (
                      <button type="button" key={mode.prompt} onClick={() => selectSuggestion(mode)}>
                        {mode.title}
                      </button>
                    ))}
                  </div>
                </details>
              )}

              {advancedModes.length > 0 && (
                <details className="bkp-advisor-advanced">
                  <summary>{isKreol ? "Ot zouti pou bann démarches" : "Autres outils pour vos démarches"}</summary>
                  <div>
                    {advancedModes.map(mode => {
                      const Icon = mode.icon
                      return (
                        <button type="button" key={mode.mode} onClick={() => selectSuggestion(mode)}>
                          <Icon size={15} aria-hidden="true" />
                          <span>{mode.title}</span>
                        </button>
                      )
                    })}
                  </div>
                </details>
              )}
            </div>
          )}

          {chronologicalHistory.map(item => (
            <div className="bkp-advisor-exchange" key={item.id}>
              <div className="bkp-advisor-message bkp-advisor-message--user">
                <div className="bkp-advisor-bubble bkp-advisor-bubble--user">
                  {item.mode !== "general" && (
                    <span className="bkp-advisor-mode-label">{getModeLabel(item.mode, isKreol)}</span>
                  )}
                  <p>{item.question}</p>
                </div>
                <span className="bkp-advisor-message-avatar bkp-advisor-message-avatar--user" aria-hidden="true"><UserRound size={17} /></span>
              </div>
              <div className="bkp-advisor-message bkp-advisor-message--assistant">
                <span className="bkp-advisor-message-avatar" aria-hidden="true"><Bot size={18} /></span>
                <div className="bkp-advisor-bubble bkp-advisor-bubble--assistant bkp-advisor-answer">
                  {formatAdvisorAnswer(item.answer)}
                  {Array.isArray(item.actions) && item.actions.length > 0 && (
                    <div className="bkp-advisor-answer-actions">
                      {item.actions.slice(0, 2).map(actionRow => {
                        const label = selectAssistantActionLabel(actionRow, item.language)
                        if (!label || actionRow.type !== "open_page") return null
                        return (
                          <button type="button" key={`${actionRow.target}-${label}`} onClick={() => requestAppSectionNavigation(actionRow.target)}>
                            {label}<ChevronRight size={15} aria-hidden="true" />
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {pendingMessage && (
            <div className="bkp-advisor-exchange">
              <div className="bkp-advisor-message bkp-advisor-message--user">
                <div className="bkp-advisor-bubble bkp-advisor-bubble--user">
                  {pendingMessage.mode !== "general" && (
                    <span className="bkp-advisor-mode-label">{getModeLabel(pendingMessage.mode, isKreol)}</span>
                  )}
                  <p>{pendingMessage.question}</p>
                </div>
                <span className="bkp-advisor-message-avatar bkp-advisor-message-avatar--user" aria-hidden="true"><UserRound size={17} /></span>
              </div>
              <div className="bkp-advisor-message bkp-advisor-message--assistant">
                <span className="bkp-advisor-message-avatar" aria-hidden="true"><Bot size={18} /></span>
                <div className="bkp-advisor-bubble bkp-advisor-bubble--assistant bkp-advisor-typing">
                  <span /><span /><span />
                  <em>{isKreol ? "Le konseye i prépar out réponse…" : "Le conseiller prépare sa réponse…"}</em>
                </div>
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="bkp-advisor-error" role="alert">
              <div><strong>{isKreol ? "In problèm la arrivé" : "Un problème est survenu"}</strong><p>{errorMessage}</p></div>
              {failedMessage && (
                <button type="button" onClick={() => handleAnalyze(failedMessage)} disabled={loadingAssistant}>
                  {isKreol ? "Réessay" : "Réessayer"}
                </button>
              )}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <footer className="bkp-advisor-composer-zone">
          {chronologicalHistory.length > 0 && !pendingMessage && (
            <div className="bkp-advisor-topic-picker">
              <button
                type="button"
                className="bkp-advisor-topic-toggle"
                aria-expanded={showTopicPicker}
                aria-controls="bkp-advisor-topic-choices"
                onClick={() => setShowTopicPicker(open => !open)}
              >
                {isKreol ? "Koz su in ot sujet" : "Aborder un autre sujet"}
                <ChevronRight size={15} aria-hidden="true" />
              </button>
              {showTopicPicker && (
                <div className="bkp-advisor-topic-choices" id="bkp-advisor-topic-choices">
                  {[...modes, ...advancedModes].map(mode => {
                    const Icon = mode.icon
                    return (
                      <button type="button" key={mode.mode} onClick={() => selectSuggestion(mode)}>
                        <Icon size={15} aria-hidden="true" />{mode.title}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          <div className="bkp-advisor-composer">
            <div className="bkp-advisor-composer-copy">
              {assistantMode !== "general" && <span>{activeModeLabel}</span>}
              {quickQuestionSelected && question.trim() && (
                <span className="bkp-advisor-prompt-ready" role="status">
                  {isKreol ? "Kestion prête : modifie ou anvoy." : "Question prête : modifiez-la ou envoyez-la."}
                </span>
              )}
              <textarea
                ref={textareaRef}
                value={question}
                onChange={event => { setQuestion(event.target.value); setQuickQuestionSelected(false) }}
                onKeyDown={handleComposerKeyDown}
                placeholder={isKreol ? "Écris out question isi…" : "Écrivez votre question ici…"}
                aria-label={isKreol ? "Out question pou le conseiller" : "Votre question pour le conseiller"}
                rows={4}
                disabled={loadingAssistant || loadingInsights}
              />
            </div>
            <button type="button" className="bkp-advisor-send" onClick={() => handleAnalyze()} disabled={analyzeDisabled} aria-label={isKreol ? "Anvoy question" : "Envoyer la question"}>
              <Send size={19} />
            </button>
          </div>
          <p className="bkp-advisor-composer-hint">
            {isKreol
              ? "Entrée pou anvoy • Maj + Entrée pou alé à la ligne"
              : "Entrée pour envoyer • Maj + Entrée pour aller à la ligne"}
          </p>
        </footer>
      </section>
    )
  }

  return (
    <section
      id="budgetkazpei-assistant-zone"
      style={{
        background: isLightTheme
          ? "linear-gradient(135deg, #DCEEFE 0%, #FFFFFF 72%)"
          : `linear-gradient(135deg, rgba(35,211,214,.12), ${COLORS.card})`,
        border: isLightTheme ? "1px solid #B7DDF7" : "1px solid rgba(35,211,214,.28)",
        borderRadius: 22,
        padding: isMobile ? 18 : 24,
        boxShadow: isLightTheme ? "0 14px 32px rgba(20,32,51,.07)" : "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <Bot size={24} color={COLORS.cyan} />
        <h3 style={{ color: COLORS.text, margin: 0, fontSize: 20 }}>
          {isKreol ? "Mon konseye Premium" : "Mon conseiller Premium"}
        </h3>
      </div>

      <p style={{ color: isLightTheme ? "#526074" : COLORS.muted, lineHeight: 1.6, marginTop: 0, fontWeight: 720 }}>
        {isKreol
          ? "Choisis in bouton, complète si besoin, puis koz ek mon konseye. Ici, pas de liste doublon : seulement la réponse utile."
          : "Choisissez un bouton, complétez si besoin, puis discutez avec votre conseiller. Ici, pas de doublon : seulement la réponse utile."}
      </p>

      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          background: isLightTheme ? "#EEE7FB" : "rgba(167,139,250,.12)",
          border: isLightTheme ? "1px solid #D8CBF6" : "1px solid rgba(167,139,250,.28)",
          color: isLightTheme ? "#142033" : "#DDD6FE",
          borderRadius: 999,
          padding: "6px 10px",
          fontSize: 12,
          fontWeight: 900,
          marginBottom: 10,
        }}
      >
        <Sparkles size={14} />
        {isKreol ? "Mode choisi :" : "Mode choisi :"} {activeModeLabel}
      </div>

      <textarea
        value={question}
        onChange={event => {
          setQuestion(event.target.value)
          setQuickQuestionSelected(false)
        }}
        placeholder={
          isKreol
            ? "Écris out kestion ou colle out courrier ici..."
            : "Écrivez votre question ou collez votre courrier ici..."
        }
        style={{
          width: "100%",
          minHeight: 130,
          background: isLightTheme ? "#FFFFFF" : COLORS.cardLight,
          border: `1px solid ${isLightTheme ? "#E6EAF0" : COLORS.border}`,
          borderRadius: 14,
          padding: 14,
          color: COLORS.text,
          fontFamily: "inherit",
          resize: "vertical",
          outline: "none",
          boxSizing: "border-box",
        }}
      />

      {errorMessage && (
        <div
          style={{
            marginTop: 10,
            background: "rgba(251,113,133,.10)",
            border: "1px solid rgba(251,113,133,.35)",
            borderRadius: 12,
            padding: 12,
            color: COLORS.red,
            fontWeight: 800,
            fontSize: 13,
            lineHeight: 1.45,
          }}
        >
          {errorMessage}
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
        <button
          type="button"
          onClick={handleAnalyze}
          disabled={analyzeDisabled}
          style={{
            background: analyzeDisabled ? COLORS.muted : COLORS.accent,
            color: "#fff",
            border: "none",
            borderRadius: 12,
            padding: "11px 16px",
            fontWeight: 900,
            cursor: analyzeDisabled ? "not-allowed" : "pointer",
            fontFamily: "inherit",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Send size={16} />
          {loadingInsights || loadingAssistant
            ? isKreol
              ? "Analyse an kour..."
              : "Analyse en cours..."
            : isKreol
              ? "Koz ek mon konseye"
              : "Discuter avec mon conseiller"}
        </button>

        <button
          type="button"
          onClick={resetConversation}
          style={{
            background: isLightTheme ? "#FFFFFF" : "rgba(255,255,255,.06)",
            color: COLORS.text,
            border: isLightTheme ? "1px solid #E6EAF0" : "1px solid rgba(255,255,255,.14)",
            borderRadius: 12,
            padding: "11px 16px",
            fontWeight: 900,
            cursor: "pointer",
            fontFamily: "inherit",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Trash2 size={16} />
          {isKreol ? "Nouvo kestion" : "Nouvelle question"}
        </button>
      </div>

      {history.length > 0 && (
        <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
          <div style={{ color: COLORS.muted, fontSize: 12, fontWeight: 800 }}>
            {isKreol
              ? "Dernières réponses : 6 maximum."
              : "Dernières réponses : 6 maximum."}
          </div>

          {history.map(item => (
            <div
              key={item.id}
              style={{
                background: isLightTheme ? "#DCEEFE" : "rgba(35,211,214,.08)",
                border: isLightTheme ? "1px solid #B7DDF7" : "1px solid rgba(35,211,214,.22)",
                borderRadius: 16,
                padding: 16,
                color: COLORS.text,
                lineHeight: 1.6,
              }}
            >
              <div
                style={{
                  color: COLORS.cyan,
                  fontWeight: 900,
                  marginBottom: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <MessageCircle size={16} />
                {isKreol ? "Répons" : "Réponse"} - {getModeLabel(item.mode, isKreol)}
              </div>

              <div
                style={{
                  background: isLightTheme ? "#FFFFFF" : "rgba(255,255,255,.04)",
                  border: isLightTheme ? "1px solid #E6EAF0" : "1px solid rgba(255,255,255,.08)",
                  borderRadius: 12,
                  padding: 10,
                  color: COLORS.muted,
                  fontSize: 12,
                  marginBottom: 12,
                  whiteSpace: "pre-line",
                }}
              >
                {item.question}
              </div>

              <div style={{ whiteSpace: "pre-line", lineHeight: 1.65 }}>
                {formatAdvisorAnswer(item.answer)}
              </div>
            </div>
          ))}
        </div>
      )}

      {history.length === 0 && (
        <div
          style={{
            marginTop: 14,
            background: isLightTheme ? "#FFF4D9" : "rgba(255,255,255,.04)",
            border: isLightTheme ? "1px solid #F4D88A" : "1px solid rgba(255,255,255,.08)",
            borderRadius: 14,
            padding: 13,
            color: isLightTheme ? "#526074" : COLORS.muted,
            fontSize: 13,
            lineHeight: 1.55,
          }}
        >
          {isKreol
            ? "Choisis in bouton anlèr, puis complète out demande. Le konseye va répondre selon le mode choisi."
            : "Choisissez un bouton au-dessus, puis complétez votre demande. Le conseiller répondra selon le mode choisi."}
        </div>
      )}
    </section>
  )
}
