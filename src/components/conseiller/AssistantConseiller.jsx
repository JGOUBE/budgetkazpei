import { useEffect, useMemo, useState } from "react"
import {
  Bot,
  Send,
  SearchCheck,
  Trash2,
  Sparkles,
  MessageCircle,
} from "lucide-react"

import { supabase } from "../../services/supabase"
import { REUNION_ORIENTATION } from "../../data/reunionOrientation"

const COLORS = {
  card: "#0F1E38",
  cardLight: "#152444",
  border: "#1E3A5F",
  accent: "#F97316",
  yellow: "#FCD34D",
  cyan: "#23D3D6",
  green: "#22C55E",
  text: "#F1F5F9",
  muted: "#8EA4C5",
  red: "#FB7185",
  purple: "#A78BFA",
}

const AI_USAGE_LIMITS = {
  free: 5,
  premium: 50,
  premium_plus: 250,
}

const MODE_LABELS = {
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
  generer_email: {
    fr: "Generer un email",
    kreol: "Prepar in email",
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

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

function isTrue(value) {
  return value === true || value === "true" || value === 1 || value === "1"
}

function isKreolLanguage(t) {
  if (typeof t !== "function") return false
  return t("nav", "dashboard") === "Tablo debor"
}

function looksLikeKreolText(value = "") {
  const text = ` ${normalizeText(value)} `
  const markers = [
    " mi ",
    " moin",
    " marmay",
    " larzan",
    " zed",
    " zede",
    " zot",
    " aou",
    " out ",
    " ou la ",
    " na ",
    " gagn",
    " kosa",
    " pou ",
    " ek ",
    " dann",
    " kaz",
    " renyon",
    " pei",
    " domann",
    " marmailles",
    " marmaille",
    " koz",
    " koze",
    " aide",
    " led",
  ]

  return markers.some(marker => text.includes(marker))
}

function getCurrentMonthNumber() {
  return new Date().getMonth() + 1
}

function getCurrentYearNumber() {
  return new Date().getFullYear()
}

function getAiPlan(profile = {}, isPremium = false, isPremiumPlus = false) {
  const rawPlan = normalizeText(profile?.subscription_plan || profile?.plan || "")

  if (
    isPremiumPlus ||
    isTrue(profile?.premium_plus) ||
    rawPlan.includes("premium_plus") ||
    rawPlan.includes("premium plus")
  ) {
    return "premium_plus"
  }

  if (
    isPremium ||
    isTrue(profile?.premium) ||
    isTrue(profile?.is_premium) ||
    rawPlan.includes("premium")
  ) {
    return "premium"
  }

  return "free"
}

function getAiPlanLabel(plan = "free") {
  if (plan === "premium_plus") return "Premium+"
  if (plan === "premium") return "Premium"
  return "Gratuit"
}

function countMeaningfulWords(value = "") {
  return normalizeText(value)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length
}

function shouldConsumeAiExchange(message = "", isQuickPreset = false) {
  if (!String(message || "").trim()) return false
  if (isQuickPreset) return false
  return countMeaningfulWords(message) > 2
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
    trouver_aide:
      "Comportement : chercher les aides les plus pertinentes, expliquer pourquoi elles peuvent correspondre, rester prudent, et proposer une seule prochaine action.",
    comprendre_courrier:
      "Comportement : aider a comprendre un courrier administratif uniquement a partir des elements fournis, sans inventer, en distinguant ce qui est ecrit et ce qui reste a verifier.",
    preparer_dossier:
      "Comportement : aider a preparer un dossier concret avec les documents probables, les etapes simples, les informations manquantes et une prochaine action.",
    generer_email:
      "Comportement : rediger un email administratif pret a copier, poli, simple, sans nom/prenom ni situation inventee, avec [A completer] si besoin.",
    preparer_recours:
      "Comportement : aider a structurer un recours avec prudence, sans avis juridique, sans garantir l'acceptation, et uniquement selon les faits donnes.",
    preparer_rdv:
      "Comportement : preparer un rendez-vous administratif avec les questions utiles, les documents a apporter, les points a verifier et une phrase simple pour expliquer la situation.",
    general:
      "Comportement : conseiller naturellement l'utilisateur, comprendre son intention reelle, repondre simplement, et proposer une prochaine action utile si pertinent.",
  }

  const kreol = {
    trouver_aide:
      "Komportman : rode bann aides les plus pertinentes, explique poukosa zot i pe correspond, reste prudent, ek propose une seule prochaine action.",
    comprendre_courrier:
      "Komportman : aide comprend in courrier administratif seulement avec sak le fourni, sans inventer, en separant sak le ecrit ek sak faut verifiye.",
    preparer_dossier:
      "Komportman : aide prepar in dossier concret avec dokiman probables, etapes simples, infos manquantes ek prochaine action.",
    generer_email:
      "Komportman : redige in email administratif pret pou copier, poli, simple, sans nom/prenom ni situation inventee, avec [A completer] si besoin.",
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

function formatAideAmount(aide = {}) {
  const min = Number(aide.montant_min)
  const max = Number(aide.montant_max)

  if (Number.isFinite(min) && Number.isFinite(max) && min > 0 && max > 0) {
    if (min === max) return `${min} EUR`
    return `${min} a ${max} EUR`
  }

  if (Number.isFinite(max) && max > 0) return `Jusqu'a ${max} EUR`
  if (Number.isFinite(min) && min > 0) return `A partir de ${min} EUR`
  return "Montant variable"
}

function prepareAideContext(aides = [], isKreol = false) {
  return aides.slice(0, 8).map(aide => ({
    id: aide.id || null,
    nom: aide.nom || aide.aide_nom || "Aide",
    nom_kreol: aide.nom_kreol || aide.nom || "Aide",
    organisme: aide.organisme || "",
    categorie: aide.categorie || "",
    montant: formatAideAmount(aide),
    description: isKreol
      ? aide.description_kreol || aide.description_fr || aide.description || ""
      : aide.description_fr || aide.description || "",
    demarches: isKreol
      ? aide.demarches_kreol || aide.demarches_fr || ""
      : aide.demarches_fr || "",
    lien_officiel: aide.lien_officiel || aide.lien || "",
  }))
}

function sortAidesForContext(aides = [], profile = {}) {
  const commune = normalizeText(profile?.commune || "")
  const enfants = Number(profile?.nombre_enfants || 0)
  const logement = normalizeText(profile?.logement || "")
  const situationPro = normalizeText(profile?.situation_professionnelle || "")

  return [...aides].sort((a, b) => {
    const score = aide => {
      let value = Number(aide.score_priorite || 0)
      const text = normalizeText(
        `${aide.nom || ""} ${aide.categorie || ""} ${aide.description || ""} ${aide.description_fr || ""} ${aide.organisme || ""}`
      )

      if (commune && text.includes(commune)) value += 40
      if (enfants > 0 && (aide.besoin_enfant || text.includes("famille") || text.includes("scolaire"))) value += 35
      if (logement === "locataire" && (aide.besoin_locataire || text.includes("logement") || text.includes("apl"))) value += 30
      if (situationPro.includes("demandeur") && (aide.besoin_demandeur_emploi || text.includes("emploi"))) value += 30
      if (aide.besoin_allocataire_caf && profile?.allocataire_caf) value += 20

      return value
    }

    return score(b) - score(a)
  })
}

export default function AssistantConseiller({
  isPremium,
  isPremiumPlus,
  isMobile,
  t,
  user,
}) {
  const isKreol = isKreolLanguage(t)

  const [question, setQuestion] = useState("")
  const [assistantMode, setAssistantMode] = useState("general")
  const [quickQuestionSelected, setQuickQuestionSelected] = useState(false)
  const [profile, setProfile] = useState(null)
  const [aiUsage, setAiUsage] = useState(null)
  const [loadingProfile, setLoadingProfile] = useState(false)
  const [loadingAiUsage, setLoadingAiUsage] = useState(false)
  const [loadingAssistant, setLoadingAssistant] = useState(false)
  const [history, setHistory] = useState([])
  const [errorMessage, setErrorMessage] = useState("")

  const aiPlan = getAiPlan(profile, isPremium, isPremiumPlus)
  const aiLimit = AI_USAGE_LIMITS[aiPlan] || AI_USAGE_LIMITS.free
  const aiUsed = Number(aiUsage?.messages_used || 0)
  const aiRemaining = Math.max(0, aiLimit - aiUsed)
  const aiQuotaReached = aiRemaining <= 0
  const currentQuestionConsumesExchange = shouldConsumeAiExchange(question, quickQuestionSelected)

  const activeModeLabel = useMemo(() => {
    return getModeLabel(assistantMode, isKreol)
  }, [assistantMode, isKreol])

  const analyzeDisabled =
    loadingProfile ||
    loadingAssistant ||
    !question.trim() ||
    (currentQuestionConsumesExchange && aiQuotaReached)

  useEffect(() => {
    fetchProfile()
  }, [user?.id])

  useEffect(() => {
    if (profile) {
      fetchAiUsage()
    }
  }, [profile?.id, aiPlan])

  useEffect(() => {
    function handleExternalAssistantPrompt(event) {
      const prompt = String(event?.detail?.prompt || "").trim()
      const mode = String(event?.detail?.mode || "general").trim() || "general"

      if (!prompt) return

      setAssistantMode(mode)
      setQuestion(prompt)
      setQuickQuestionSelected(true)
      setErrorMessage("")

      setTimeout(() => {
        const element = document.getElementById("budgetkazpei-assistant-zone")
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "start" })
        }
      }, 80)
    }

    window.addEventListener("budgetkazpei:assistant-prompt", handleExternalAssistantPrompt)

    return () => {
      window.removeEventListener("budgetkazpei:assistant-prompt", handleExternalAssistantPrompt)
    }
  }, [])

  async function fetchProfile() {
    if (!user?.id) {
      setProfile(null)
      return null
    }

    setLoadingProfile(true)

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle()

    setLoadingProfile(false)

    if (error) {
      console.error("Erreur chargement profil conseiller:", error)
      setProfile(null)
      return null
    }

    setProfile(data || null)
    return data || null
  }

  async function fetchAiUsage() {
    if (!user?.id) return

    setLoadingAiUsage(true)

    const currentMonth = getCurrentMonthNumber()
    const currentYear = getCurrentYearNumber()

    const { data, error } = await supabase
      .from("ai_usage")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle()

    setLoadingAiUsage(false)

    if (error) {
      console.error("Erreur chargement quota IA:", error)
      setAiUsage(null)
      return
    }

    if (!data) {
      setAiUsage({
        messages_used: 0,
        reset_month: currentMonth,
        reset_year: currentYear,
      })
      return
    }

    const savedMonth = Number(data.reset_month || 0)
    const savedYear = Number(data.reset_year || 0)

    if (savedMonth !== currentMonth || savedYear !== currentYear) {
      setAiUsage({
        ...data,
        messages_used: 0,
        reset_month: currentMonth,
        reset_year: currentYear,
      })
      return
    }

    setAiUsage(data)
  }

  async function fetchAides() {
    const { data, error } = await supabase
      .from("aides_reunion")
      .select("*")
      .order("score_priorite", { ascending: false })

    if (error) {
      console.error("Erreur chargement aides conseiller:", error)
      return []
    }

    return data || []
  }

  async function callAssistantAi({
    sentQuestion,
    currentProfile,
    aides,
    mode,
    recentHistory,
  }) {
    const assistantIsKreol = isKreol || looksLikeKreolText(sentQuestion)
    const preparedAides = prepareAideContext(
      sortAidesForContext(aides, currentProfile),
      assistantIsKreol
    )

    const localContext = {
      commune: currentProfile?.commune || "",
      situation_familiale: currentProfile?.situation_familiale || "",
      logement: currentProfile?.logement || "",
      situation_professionnelle: currentProfile?.situation_professionnelle || "",
      nombre_enfants: currentProfile?.nombre_enfants ?? null,
      revenus_foyer: currentProfile?.revenus_foyer ?? null,
      revenus_details: currentProfile?.revenus_details ?? null,
      allocataire_caf: currentProfile?.allocataire_caf ?? null,
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

    const { data, error } = await supabase.functions.invoke("assistant-aisupabase", {
      body: {
        question: buildQuestionForAi(sentQuestion, mode, assistantIsKreol, currentProfile),
        originalQuestion: sentQuestion,
        assistantMode: mode,
        assistantModeLabel: getModeLabel(mode, assistantIsKreol),
        modeInstruction: buildModeInstruction(mode, assistantIsKreol),
        language: assistantIsKreol ? "kreol" : "fr",
        isKreol: assistantIsKreol,
        isQuickPreset: quickQuestionSelected || mode === "scan_profil",
        isPremium,
        isPremiumPlus,
        subscription_plan: isPremiumPlus ? "premium_plus" : isPremium ? "premium" : "free",
        profile: currentProfile,
        profile_summary: buildProfileSummary(currentProfile, assistantIsKreol),
        localContext,
        recommendedAides: preparedAides,
        recommended_aides: preparedAides,
        reunionOrientation: REUNION_ORIENTATION,
        reunion_orientation: REUNION_ORIENTATION,
        recentHistory: (recentHistory || []).map(item => ({
          question: item.question,
          answer: item.answer,
          mode: item.mode,
          createdAt: item.createdAt,
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

    return data || { success: false, error: "Reponse vide." }
  }

  async function handleAnalyze() {
    const sentQuestion = question.trim()
    if (!sentQuestion) return

    let currentProfile

    try {
      currentProfile = profile || (await fetchProfile())
    } catch (error) {
      console.error("Erreur chargement profil conseiller:", error)
      setErrorMessage(
        isKreol
          ? "Inposib sharj out profil pou linstan."
          : "Impossible de charger votre profil pour le moment."
      )
      return
    }

    if (!currentProfile) {
      setErrorMessage(
        isKreol
          ? "Inposib sharj out profil pou linstan."
          : "Impossible de charger votre profil pour le moment."
      )
      return
    }

    if (currentQuestionConsumesExchange && aiQuotaReached) {
      setErrorMessage(
        isKreol
          ? "Ou la utilise tout out kestions pou sa mwa-la."
          : "Vous avez utilise tous vos echanges du mois."
      )
      return
    }

    setLoadingAssistant(true)
    setErrorMessage("")

    const currentMode = assistantMode || "general"
    let result

    try {
      const aides = await fetchAides()

      result = await callAssistantAi({
        sentQuestion,
        currentProfile,
        aides,
        mode: currentMode,
        recentHistory: history,
      })
    } catch (error) {
      console.error("Erreur analyse conseiller:", error)
      setLoadingAssistant(false)
      setErrorMessage(
        isKreol
          ? "Le konseye le indisponib pou linstan. Reessay in pe plus tar."
          : "Le conseiller est indisponible pour le moment. Réessayez dans quelques instants."
      )
      return
    }

    setLoadingAssistant(false)

    if (!result?.success) {
      setErrorMessage(
        result?.error ||
          (isKreol
            ? "Le konseye le indisponib pou linstan."
            : "Le conseiller est indisponible pour le moment.")
      )
      return
    }

    if (result.usage) {
      setAiUsage(result.usage)
    } else {
      await fetchAiUsage()
    }

    const answer =
      result.answer ||
      (isKreol
        ? "Mi na pas reussi generer in repons pou linstan."
        : "Je n'ai pas réussi à générer une réponse pour le moment.")

    setHistory(prev =>
      [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          question: sentQuestion,
          answer,
          mode: currentMode,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ].slice(0, 6)
    )

    setQuestion("")
    setAssistantMode("general")
    setQuickQuestionSelected(false)
  }

  function resetConversation() {
    setQuestion("")
    setAssistantMode("general")
    setQuickQuestionSelected(false)
    setHistory([])
    setErrorMessage("")
  }

  return (
    <section
      id="budgetkazpei-assistant-zone"
      style={{
        background: `linear-gradient(135deg, rgba(35,211,214,.12), ${COLORS.card})`,
        border: "1px solid rgba(35,211,214,.28)",
        borderRadius: 22,
        padding: isMobile ? 18 : 24,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <Bot size={24} color={COLORS.cyan} />
        <h3 style={{ color: COLORS.text, margin: 0, fontSize: 20 }}>
          {isKreol ? "Mon konseye Premium" : "Mon conseiller Premium"}
        </h3>
      </div>

      <p style={{ color: COLORS.muted, lineHeight: 1.6, marginTop: 0 }}>
        {isKreol
          ? "Choisis in bouton, complète si besoin, puis koz ek mon konseye. Ici, pas de liste doublon : seulement la réponse utile."
          : "Choisissez un bouton, complétez si besoin, puis discutez avec votre conseiller. Ici, pas de doublon : seulement la réponse utile."}
      </p>

      <div
        style={{
          background: aiQuotaReached ? "rgba(251,113,133,.10)" : "rgba(34,197,94,.08)",
          border: aiQuotaReached
            ? "1px solid rgba(251,113,133,.35)"
            : "1px solid rgba(34,197,94,.25)",
          borderRadius: 14,
          padding: 12,
          color: COLORS.text,
          display: "grid",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
            fontWeight: 900,
          }}
        >
          <span>
            {isKreol ? "Forfait" : "Forfait"} {getAiPlanLabel(aiPlan)}
          </span>
          <span style={{ color: aiQuotaReached ? COLORS.red : COLORS.green }}>
            {loadingAiUsage
              ? "..."
              : `${aiUsed} / ${aiLimit} ${
                  isKreol ? "kestions utilisees" : "echanges utilises"
                }`}
          </span>
        </div>

        <div
          style={{
            height: 8,
            background: "rgba(255,255,255,.08)",
            borderRadius: 999,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${Math.min(100, Math.max(0, (aiUsed / aiLimit) * 100))}%`,
              height: "100%",
              background: aiQuotaReached ? COLORS.red : COLORS.green,
            }}
          />
        </div>
      </div>

      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          background: "rgba(167,139,250,.12)",
          border: "1px solid rgba(167,139,250,.28)",
          color: "#DDD6FE",
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
          background: COLORS.cardLight,
          border: `1px solid ${COLORS.border}`,
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
          {loadingProfile || loadingAssistant
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
            background: "rgba(255,255,255,.06)",
            color: COLORS.text,
            border: "1px solid rgba(255,255,255,.14)",
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
                background: "rgba(35,211,214,.08)",
                border: "1px solid rgba(35,211,214,.22)",
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
                  background: "rgba(255,255,255,.04)",
                  border: "1px solid rgba(255,255,255,.08)",
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
                {item.answer}
              </div>
            </div>
          ))}
        </div>
      )}

      {history.length === 0 && (
        <div
          style={{
            marginTop: 14,
            background: "rgba(255,255,255,.04)",
            border: "1px solid rgba(255,255,255,.08)",
            borderRadius: 14,
            padding: 13,
            color: COLORS.muted,
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

