import type { AssistantMode } from "../../accessPolicy.ts"

// The conservative scope detector protects money, rights, private-budget and
// administrative decisions. It is not a factual classifier for every topic.
// Its only purpose is preventing CAF / official-amount review from rewriting
// a general-knowledge or imaginary answer.
function normalize(value = "") {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ")
}

const FICTIONAL = /\b(?:fiction|fictif|imagine|invente|raconte une histoire|raconte moi une histoire|licorne|extraterrestre|magique|dragon|si les chats|si mon chat|lune.*fromage|chat president|sur la lune)\b/
const BENEFITS = /\b(?:aides? financieres?|aides? sociales?|aides? pour|aides\b|une aide|montant de l aide|droit a l aide\b|allocations?|prestations? sociales?|caf|rsa|apl|fsl|ccas|mdph|aah|are|prime d activite|cheque energie|pass sport|allocation logement|allocataire|eligibilite|eligible aux|droit aux aides)\b/
const PERSONAL_BUDGET = /\b(?:mon budget|mes budgets|ma depense|mes depenses|mes charges|mon loyer|mes revenus|mon revenu|ma marge|mes factures|mes abonnements|mon abonnement|mes achats|mes courses|ma liste de courses|ma liste de courses|mon panier|mes economies|mes dettes|mon credit|mes paiements|mon salaire|combien me reste|combien j ai depense|combien ai je depense|je depense|je paie|je touche comme revenu|je gagne par mois)\b/
const ADMIN = /\b(?:mon dossier|ma demande|mon courrier|mon refus|mon recours|ma declaration|mon contrat|mes justificatifs|mes demarches|rendez vous caf|courrier administratif|lettre administrative|recours administratif)\b/
// Directories of nearby associations and in-kind aid are protected advisor
// knowledge too, not generic small-talk.
const LOCAL_HELP = /\b(?:epicerie (?:sociale|solidaire)|associations?|collectifs?|entraide|banque alimentaire|restos du coeur|secours populaire|croix rouge|distribution alimentaire|travailleur social|assistante sociale|maison des solidarites|colis alimentaire)\b/
const HELP_INTENT = /\b(?:je cherche|j ai besoin|besoin de|besoin d|ou trouver|ou aller|vers qui|qui peut m aider|comment contacter|comment obtenir|a qui (?:demander|dois je m adresser)|qui contacter|quelles? (?:associations?|structures?|epiceries?)|mi cherche|mi besoin|koman trouve|kot mi)\b/
const FOOD_EMERGENCY = /\b(?:plus de quoi manger|pas de quoi manger|rien a manger|plus rien a manger|plus d argent pour manger|mon frigo est vide|plus assez d argent pour (?:acheter (?:a )?)?(?:manger|des courses|de la nourriture)|pas assez d argent pour (?:acheter (?:a )?)?(?:manger|des courses|de la nourriture)|pas les moyens d acheter (?:a )?manger|(?:je|nous|on) n? (?:arrive|peut) plus (?:a )?(?:payer|acheter) (?:de quoi manger|a manger|mes courses))\b/
const DIRECT_SUPPORT = /\b(?:je suis victime|je subis des violences|je vis des violences|victime de violences|violences conjugales|violences intrafamiliales|mon conjoint me frappe|on me harcele|je suis harcele|besoin de soutien scolaire|besoin d aide aux devoirs|je cherche du soutien scolaire|je recherche du soutien scolaire|mon enfant a des difficultes scolaires|mon enfant a besoin d aide aux devoirs)\b/

const GUARDED_MODES = new Set<AssistantMode>([
  "budget_depenses","trouver_aide","preparer_dossier","generer_courrier",
  "generer_email","preparer_relance","comprendre_courrier","comprendre_refus",
  "preparer_recours","preparer_rdv","scan_profil",
])

export function isProtectedAdvisorQuestion({
  question = "",mode = "general",action = "",conversationContext = {},
}: {
  question?: string
  mode?: AssistantMode | string
  action?: string
  conversationContext?: Record<string,unknown>
} = {}): boolean {
  const text = normalize(question)
  if (action === "analyze_refusal") return true
  if (FICTIONAL.test(text)) return false
  if (FOOD_EMERGENCY.test(text) || DIRECT_SUPPORT.test(text) || (LOCAL_HELP.test(text) && HELP_INTENT.test(text))) return true
  if (BENEFITS.test(text) || PERSONAL_BUDGET.test(text) || ADMIN.test(text)) return true
  if (GUARDED_MODES.has(mode as AssistantMode)) return true

  const cc = conversationContext as {
    turnType?: string
    activeTopic?: { domains?: string[] }
    previouslyRecommendedAidIds?: unknown[]
    previouslyRecommendedAidNames?: unknown[]
  }
  const continuation = ["ASK_DETAILS","NEXT_STEP","REQUEST_ALTERNATIVE","FOLLOW_UP"].includes(cc.turnType || "")
  const inheritedAid = Array.isArray(cc.activeTopic?.domains)
    && cc.activeTopic.domains.length > 0
    && ((cc.previouslyRecommendedAidIds?.length || 0)>0 ||
        (cc.previouslyRecommendedAidNames?.length || 0)>0)
  return Boolean(continuation && inheritedAid)
}
