import { normalizeAidTopicText } from "./aidTopics.js"

// The Edge Function builds a protected, formatted prompt from this data.
// Send only the facts it actually consumes: repeating the full catalogue,
// orientation directory and previous answers can breach its 32k prompt guard.
const short = (value, max = 240) => String(value ?? "").slice(0, max)
const list = value => Array.isArray(value) ? value : []

export function compactAdvisorAides(aides = []) {
  return list(aides).slice(0, 8).map(aide => ({
    id: aide.id ?? null,
    nom: short(aide.nom, 105),
    nom_kreol: short(aide.nom_kreol, 105),
    organisme: short(aide.organisme, 110),
    categorie: short(aide.categorie, 60),
    type_dispositif: short(aide.type_dispositif, 55),
    commune: short(aide.commune, 75),
    zone_couverte: short(aide.zone_couverte, 115),
    verification_status: short(aide.verification_status, 35),
    source_confirmee: aide.source_confirmee === true,
    date_verification_source: aide.date_verification_source ?? null,
    periode_validite: short(aide.periode_validite, 160),
    eligibilite_confirmee: false,
    regles_et_montants_a_confirmer: true,
    montant: short(aide.montant, 100),
    montant_min: aide.montant_min ?? null,
    montant_max: aide.montant_max ?? null,
    description: short(aide.description, 400),
    demarches: short(aide.demarches, 300),
    conditions: list(aide.conditions).slice(0, 3).map(x => short(x, 150)),
    lien: short(aide.lien, 245),
    lien_officiel: short(aide.lien_officiel, 245),
    source_verification: short(aide.source_verification, 245),
  }))
}

export function selectAdvisorOrientation(orientations = [], question = "") {
  const questionText = normalizeAidTopicText(question)
  // Only current-question matches. The aid catalogue already provides
  // the general Réunion coverage, so never send an unrelated directory.
  if (!questionText) return []
  const matches = list(orientations).map(item => {
    const terms = [
      item.category, item.nom, item.organisme,
      ...list(item.mots_cles),
    ].map(x => normalizeAidTopicText(x)).filter(x => x.length >= 5)
    return { item, score: terms.filter(term => questionText.includes(term)).length }
  }).filter(row => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)

  return matches.map(({ item }) => ({
    nom: short(item.nom, 90),
    organisme: short(item.organisme, 90),
    commune: short(item.commune, 70),
    category: short(item.category, 70),
    description: short(item.description, 280),
    lien_officiel: short(item.lien_officiel, 240),
    confidence: short(item.confidence, 45),
  }))
}

function compactFinancial(financial) {
  if (!financial || typeof financial !== "object") return {}
  if (JSON.stringify(financial).length <= 6500) return financial
  const source = financial.budgetAdvisorContext || {}
  const bounded = {
    period: source.period,
    dataCompleteness: source.dataCompleteness,
    income: source.income,
    expenses: source.expenses,
    currentAvailableMargin: source.currentAvailableMargin,
    remainingAfterFixedExpenses: source.remainingAfterFixedExpenses,
    periodComparison: source.periodComparison,
    grocery: source.grocery,
    spendingByCategory: list(source.spendingByCategory).slice(0, 8),
    recurringCharges: list(source.recurringCharges).slice(0, 8),
    budgetTargets: list(source.budgetTargets).slice(0, 5),
    recentSignificantTransactions: list(source.recentSignificantTransactions).slice(0, 5),
  }
  // Preserve a compact structured summary and avoid attaching receipts.
  return { intent: financial.intent, budgetAdvisorContext: bounded,
    dataUsed: financial.dataUsed || {} }
}

export function buildAdvisorRequestBody(input = {}) {
  const question = String(input.originalQuestion || input.question || "").trim()
  const recentHistory = list(input.recentHistory).slice(0, 4).map(item => ({
    question: short(item.question, 280),
    answer: short(item.answer, 430),
    mode: short(item.mode, 45),
    source: short(item.source, 50),
    conversationContext: item.conversationContext ? {
      turnType: item.conversationContext.turnType,
      activeTopic: item.conversationContext.activeTopic,
    } : null,
    recommendedAidIds: list(item.recommendedAidIds).slice(0, 8),
    recommendedAidNames: list(item.recommendedAidNames).slice(0, 8),
  }))
  return {
    // Do not resend the profile, which is loaded and authenticated server-side.
    question,
    originalQuestion: question,
    assistantMode: input.assistantMode || "general",
    language: input.language || "fr",
    interfaceLanguage: input.interfaceLanguage || "fr",
    isKreol: input.isKreol === true,
    isQuickPreset: input.isQuickPreset === true,
    localContext: {
      commune: input.localContext?.commune || "",
      situation_familiale: input.localContext?.situation_familiale || "",
      logement: input.localContext?.logement || "",
      situation_professionnelle: input.localContext?.situation_professionnelle || "",
      nombre_enfants: input.localContext?.nombre_enfants ?? null,
      revenus_foyer: input.localContext?.revenus_foyer ?? null,
      revenus_details: input.localContext?.revenus_details ?? null,
      allocataire_caf: input.localContext?.allocataire_caf ?? null,
      financial: compactFinancial(input.localContext?.financial),
      financial_context_status: input.localContext?.financial_context_status || "available",
    },
    recommendedAides: compactAdvisorAides(input.recommendedAides),
    reunionOrientation: selectAdvisorOrientation(input.reunionOrientation, question),
    advisorHandoffContext: input.advisorHandoffContext || null,
    conversationContext: input.conversationContext || null,
    recentHistory,
  }
}
