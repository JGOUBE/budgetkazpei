// Provider-cost guard. Runs BEFORE OpenAI and never relies on client-supplied
// modes, previous answers or flags to waive the off-topic allowance.
// This module is deliberately plain JS so the Node regression tests can import it.
export const OFFTOPIC_LIMITS = Object.freeze({
  premium: Object.freeze({ day: 3, month: 15 }),
  premium_plus: Object.freeze({ day: 6, month: 30 }),
})

export function normalizeCostTopic(value = "") {
  return String(value || "").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ")
}

const RELEVANT =
  /\b(?:budget|depens(?:e|es)|argent|euro|economie|economiser|economies|loyer|logement|loyers|revenu|salaire|fiche de paie|bulletin de salaire|contrat|charges? fixes?|factures?|rembourser|credit|dettes?|pret bancaire|taux d interet|prix|acheter|achats?|moins cher|comparaison de prix|liste de courses|mes courses|mon panier|ticket de caisse|courses alimentaires|impots?|taxes?|caf|rsa|apl|als|alf|fsl|ccas|mdph|aah|aeeh|are|ass|france travail|pole emploi|allocations?|prestations?|mes aides?|des aides?|une aide|quelles aides?|aides? financieres?|aides? sociales?|aides? au logement|aides? a la formation|subventions?|prime d activite|cheque energie|pass sport|bourse|etudiant|etudes|scolarite|cantine|transport scolaire|formation professionnelle|insertion|emploi|travail|chomage|contrat de travail|demission|licenciement|retraite|pension|mutuelle|assurance maladie|securite sociale|handicap|ma demande|mon dossier|dossier administratif|preparer un dossier|comprendre un courrier|courrier administratif|mon courrier|mon refus|mon recours|demarches? administratives?|droits? sociaux?|mon rendez vous|preparer un courrier|rediger un mail|generer un email|impaye|endettement|devis)\b/

const EXPLICITLY_PLAYFUL =
  /\b(?:blague|devinette|jeu de mots|poeme|raconte une histoire|imagine une histoire|histoire drole|fiction|fictif|licorne|extraterrestre|dragon|magique|le chat president|sur la lune|danse|danser|on danse|meme rigolo)\b/

const SPECIFICALLY_UNRELATED =
  /\b(?:ciel|etoiles?|planetes?|jupiter|saturne|galaxie|dinosaures?|football|match de foot|recette|pates carbonara|capitales?|rois? de france|table de multiplication|conjugaison|theoreme|horoscope|astrologie|cinema|serie televisee|histoire d amour|meteo|temperature a|comete|soleil|animaux|chats?|chiens?)\b/

const REFERENCE_FOLLOWUP =
  /^(?:et |alors |sinon |mais |ensuite|apres|pourquoi\b|comment\b|combien\b|dans combien|quels? documents|quelles? conditions|et pour|et si|comment faire|c est quoi|ca marche|pour cela|et maintenant|je fais quoi|tu peux preciser|peux tu preciser)/

function isMeaningfulRelevant(text) {
  if (!RELEVANT.test(text)) return false
  // Avoid treating a fictional request as a genuine benefits question merely
  // because it contains a finance-related word ("une blague sur l'APL").
  if (EXPLICITLY_PLAYFUL.test(text) && !/\b(?:vrai|reel|reelle|serieux|concret|mes|mon|ma)\b/.test(text)) return false
  // "Pourquoi le ciel est bleu" has no relevant keywords and never inherits CAF.
  return true
}

export function isOffTopicAdvisorQuestion({
  question = "", action = "", previousQuestion = "", previousAt = null, now = Date.now(),
} = {}) {
  const text = normalizeCostTopic(question)
  if (action === "analyze_refusal") return false
  if (!text) return true
  // Explicit creative requests always consume the free-chat allowance, even
  // if they mention a protected topic to make the model invent fictional rules.
  if (EXPLICITLY_PLAYFUL.test(text)) return true
  if (isMeaningfulRelevant(text)) return false
  // Unrelated, self-contained questions may not inherit the last aid topic.
  if (SPECIFICALLY_UNRELATED.test(text)) return true
  const last = normalizeCostTopic(previousQuestion)
  const ageMs = Number(now) - new Date(previousAt || 0).getTime()
  const continuation = REFERENCE_FOLLOWUP.test(text) && text.split(" ").length <= 13
  if (continuation && last && isMeaningfulRelevant(last) &&
      ageMs >= 0 && ageMs <= 2 * 60 * 60 * 1000) return false
  return true
}

// Repetitive greetings can be acknowledged without inference. These responses
// are explicitly LOCAL; no model provider, quota or personal facts involved.
export function getLocalCourtesyAnswer(question = "", language = "fr") {
  const text = normalizeCostTopic(question)
  const kreol = language === "kreol" || language === "kr"
  if (/^(?:bonjour|bonsoir|salut|coucou|hello|slt|hey)$/.test(text)) {
    return kreol
      ? "Bonzour ! Mi lé la pou aide aou avèk out bidzé, bann aides ek démarches."
      : "Bonjour ! Je suis là pour t’aider avec ton budget, les aides et tes démarches."
  }
  if (/^(?:ca va|comment ca va|tu vas bien|vous allez bien)$/.test(text)) {
    return kreol
      ? "Mi lé bien, merci ! Kosa mi pé fé pou aou azordi ?"
      : "Ça va, merci ! Et toi ? Je suis là si tu as une question ou besoin d’un conseil."
  }
  if (/^(?:on danse|ca va on danse|alors on danse|tu veux danser)$/.test(text)) {
    return kreol
      ? "Alé, in ti pas la danse ! Après, si ou vé, nou regarde out bidzé."
      : "Avec plaisir pour un petit pas de danse ! Et quand tu veux, on peut aussi parler budget ou bons plans."
  }
  if (/^(?:merci|merci beaucoup|ok merci|super merci)$/.test(text)) {
    return kreol ? "Ek plaisir !" : "Avec plaisir !"
  }
  return null
}

export function getOffTopicLimits(plan = "premium") {
  return OFFTOPIC_LIMITS[plan] || OFFTOPIC_LIMITS.premium
}

export function getOffTopicLimitAnswer(language = "fr") {
  return language === "kreol"
    ? "Nou la fini lo ti quota kestyon libre pou sa période-la. Pou protéj le coût de BudgetKazPéi, mi répon pa plis kestyon hors sujet pou linstan. Mé ou pé toujours demande a moin bann conseils su out bidzé, out aides, out droits ek démarches."
    : "Tu as atteint la limite des questions libres pour cette période. Pour maîtriser le coût de BudgetKazPeï, je mets en pause les discussions sans rapport avec le budget, les aides ou les démarches. Tu peux continuer à me demander des conseils sur ces sujets sans attendre."
}
