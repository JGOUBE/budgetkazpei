import { findPrimaryAidTopicIds, normalizeAidTopicText } from "./aidTopics.js"

// Heuristics are deliberately conservative: they decide whether to retrieve
// personal budget/aid data, NEVER what factual answer the model should give.
// A general question should remain general, even during an aid conversation.
const SELF_CONTAINED_STARTS = /^(?:pourquoi|comment|combien|quel(?:le|les|s)?|qu(?:e| est ce qu| est ce que)|est ce que|peux tu|pourrais tu|explique|raconte|imagine|invente|ecris|ecrit|aide moi|donne moi|sais tu|qui |ou |quand |c est quoi|parle moi de|parle moi du|kosa|koman|poukoi|konbien|kombyin)\b/
const REFERENTIAL = /\b(?:ca|cela|cette aide|cet organisme|ce dossier|ce courrier|la meme aide|celui ci|celle ci|en beneficier|en profiter|l obtenir|la demander|le demander|ce montant|ses conditions|cette demarche|ce sujet|combien de temps faut il attendre|combien de jours pour recevoir|quel delai|dans combien de temps|et ensuite|et pour|et alors)\b/
const CREATIVE = /\b(?:imagine|invente|raconte une histoire|raconte moi une histoire|fiction|fictif|farfelu|farfelue|extraterrestre|dragon|licorne|magique|super heros|voyage dans le temps|sur la lune|lune en fromage|si les chats|si mon chat|chat president|lune.*fromage|si (?:la |le |les |mon |ma |un |une )?(?:lune|licorne|extraterrestre)|hypothese absurde)\b/
const AID_REQUEST = /\b(?:aides? financieres?|aides? sociales?|aides? pour|des aides|aides\b|une aide|montant de l aide|allocations?|subventions?|droit aux aides|droits sociaux|prestations? sociales?|caf|rsa|apl|fsl|ccas|mdph|prime d activite|cheque energie|pass sport|aide au logement|demande d aide|demander une aide|eligible a une aide)\b/
const PERSONAL_BUDGET = /\b(?:mon budget|mes budgets|mes depenses|ma depense|mon loyer|mon abonnement|mes revenus|mon revenu|mes charges|mes abonnements|mes economies|mes achats|ma liste de courses|mon panier|mes courses|mon argent|ma marge|combien j ai depense|combien je depense|ma facture|mes factures|reste t il|me reste|j ai paye|je paie|je depense|me coute|ai je depense|j ai depense|je gagne|euros? par mois|depenses alimentaires)\b/
// Wording for explicit personal breakdowns, including statements without "dépenses".
const PERSONAL_DISTRIBUTION = /\b(?:mes principales depenses|mes plus grosses depenses|mes (?:trois|3) (?:principaux|plus gros) postes|mes postes de depenses|repartition de mon budget|repartition de mes depenses|part de mes depenses|pourcentage de mes depenses)\b/
const NON_FINANCIAL = /\b(?:pollution|soleil|etoiles?|jupiter|saturne|planetes?|galaxie|animaux?|chats?|chiens?|football|course a pied|courses de chevaux|course de velo|basket ball|panier de basket|cuisson|cuisine|recette|plantes?|volcans?|vagues?|marees?|fantomes?|super pouvoirs?|licornes?|dinosaures?|conjugaison|poemes?|rime|humour|blague)\b/

export function looksPlayfulOrFictionalQuestion(question = "") {
  return CREATIVE.test(normalizeAidTopicText(question))
}

export function isSelfContainedNewQuestion(question = "") {
  const text = normalizeAidTopicText(question)
  if (!text) return false
  if (looksPlayfulOrFictionalQuestion(question)) return true
  if (/\b(?:nouveau sujet|autre question|changeons de sujet|sans rapport|rien a voir|parlons de)\b/.test(text)) return true
  if (REFERENTIAL.test(text)) return false
  // Brief complete requests can name an independent topic in just four words:
  // "Parle-moi du soleil", "C'est quoi un volcan ?", "Kosa i lé volcan ?".
  if (/^(?:parle moi (?:de|du|des)|c est quoi|kosa i le|kosa le|koman marche)\s+(?:(?:le|la|les|un|une|in|du|de)\s+)?[a-z]{4,}\b/.test(text)) {
    return true
  }
  if (!SELF_CONTAINED_STARTS.test(text)) {
    // Many fully explicit statements are not interrogatives: "Je voudrais
    // une recette de gâteau", "Explique-moi le fonctionnement d'un volcan".
    return /^(?:je (?:voudrais|veux|souhaite|cherche)|parle moi de|fais moi|montre moi)\b/.test(text)
      && text.split(" ").length >= 5
  }
  const tokens = text.split(" ")
  if (tokens.length < 5) return false
  // "Combien pour l'APL ?" is still an aid follow-up, whereas "Combien de
  // lunes a Jupiter ?" is a complete question.
  return true
}

export function shouldUseLocalBudgetAnswer({question = "",mode = "general",intent = "unknown"} = {}) {
  if (intent === "unknown") return false
  if (looksPlayfulOrFictionalQuestion(question)) return false
  const text = normalizeAidTopicText(question)
  const personal = PERSONAL_BUDGET.test(text) || PERSONAL_DISTRIBUTION.test(text)
  // Strongly non-financial wording should never trigger a budget answer just
  // because it contains generic words like réduire, cours(es) or abonnement.
  // A date or a generic word like "courses" is not proof of a personal
  // budget request. A self-contained question about science or sport wins
  // over a stale budget tab, unless it explicitly asks about recorded costs.
  if (NON_FINANCIAL.test(text) && !/\b(?:mon budget|mes depenses|mes revenus|mes achats|combien j ai depense|je paie)\b/.test(text)) return false
  if (personal) return true
  const specificallyFinancial = /\b(?:argent|budget|cout|prix|depens|economis|factur|achats?|cher|paye|payer|abonnement|loyer|credit|revenu|salaire)\b/.test(text)
  return mode === "budget_depenses" && specificallyFinancial
}

export function shouldLookupAdvisorAids({
  question = "",mode = "general",conversationContext = {},recentHistory = [],handoffContext = null,
} = {}) {
  if (looksPlayfulOrFictionalQuestion(question)) return false
  const text = normalizeAidTopicText(question)
  const explicitAid = AID_REQUEST.test(text)
  if (mode === "scan_profil") return true
  // A new, self-contained question takes priority over a previous aid tab or
  // handoff. Otherwise "Aide-moi à comprendre la relativité" can retrieve
  // CAF facts simply because the user was looking at Aides before.
  if (isSelfContainedNewQuestion(question) && !explicitAid) return false
  if (mode === "trouver_aide" && (!isSelfContainedNewQuestion(question) || explicitAid)) return true
  if (explicitAid) return true
  if (handoffContext && Object.keys(handoffContext).length > 0) return true
  const previousRecommended = (Array.isArray(recentHistory)?recentHistory:[]).some(item =>
    (item?.recommendedAidIds?.length||0)>0 || (item?.recommendedAidNames?.length||0)>0)
  const types = new Set(["REQUEST_ALTERNATIVE","ASK_DETAILS","NEXT_STEP","FOLLOW_UP"])
  const activeTopics = conversationContext?.activeTopic?.domains || []
  if (previousRecommended && activeTopics.length>0 &&
      types.has(conversationContext?.turnType) &&
      !isSelfContainedNewQuestion(question)) return true
  return false
}

export function advisorQuestionKind(question = "",conversationContext = {}) {
  if (looksPlayfulOrFictionalQuestion(question)) return "playful"
  if (conversationContext.turnType === "FOLLOW_UP" && !isSelfContainedNewQuestion(question)) return "follow_up"
  if (shouldLookupAdvisorAids({question,conversationContext})) return "aids"
  return "general"
}

export function resolveAdvisorModeForQuestion({
  mode = "general",question = "",intent = "unknown",
} = {}) {
  // A user is allowed to change subjects without pressing a "general" tab.
  // This never changes advanced premium mode authorization.
  if (!isSelfContainedNewQuestion(question)) return mode
  if (mode === "budget_depenses" &&
      !shouldUseLocalBudgetAnswer({ question,mode,intent })) return "general"
  if (mode === "trouver_aide" &&
      (looksPlayfulOrFictionalQuestion(question) || !AID_REQUEST.test(normalizeAidTopicText(question)))) return "general"
  return mode
}
