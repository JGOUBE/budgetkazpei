// A conservative, free-to-run classifier. It neither makes an AI request nor
// claims to determine the user's intentions perfectly. Uncertain follow-ups
// stay available; clearly unrelated open-domain questions have a separate cap.
export const OFFTOPIC_LIMITS = Object.freeze({
  premium: Object.freeze({ daily: 3, monthly: 15 }),
  premium_plus: Object.freeze({ daily: 6, monthly: 30 }),
})

export function normalizeAdvisorScopeText(input = "") {
  return String(input ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ")
    .trim().replace(/\s+/g, " ")
}

const RELEVANT = /\b(?:budget|depens(?:e|es|er)?|economies?|economis(?:er|ation)?|factures?|loyer|logements?|credits?|dettes?|argent|prix|couts?|revenus?|salaires?|paye|paiements?|courses?|tickets?|achats?|epargn|impots?|taxes?|assurances?|mutuelles?|allocations?|rsa|apl|als|alf|aah|aeeh|ass|are|arce|acre|caf|mdph|ccas|fsl|prime d activite|cheque energie|prestations?|subventions?|bourses?|etudiant|formation|emplois?|chomage|retraite|pensions?|demarches?|administratif|administrative|dossier|courrier|formulaire|recours|droits?|organismes?|aides? financieres?|aides? sociales?|aide au logement|aide pour|mes aides|des aides|une aide|mon compte|mes comptes|banque|bancaire|carte bancaire|virement|economique|fiscal|financer|financement|depannages? financiers?|frais|remboursement|mensualites?)\b/

const CLEAR_OUT_OF_SCOPE = /\b(?:blagues?|devinettes?|histoires? droles?|rigoler|humour|meme|danse|danser|dansons|chante|chanter|chanson|poemes?|rimes?|licornes?|dragons?|extraterrestres?|martiens?|magique|magie|fiction|fictif|imaginaire|planetes?|jupiter|saturne|etoiles?|galaxies?|astronomie|soleil|ciel bleu|volcans?|dinosaures?|chats?|chiens?|recettes?|cuisiner|gateau|football|basket|tennis|cinema|films?|series?|acteurs?|chanteurs?|celebrites?|jardinage|plantes?|fleurs?|jeux? video|jeux? de mots|astrologie|horoscope|capitale de|qui a invente|histoire de france|la revolution francaise)\b/

const ROLEPLAY = /^(?:imagine|invente|raconte|ecris|rappelle moi une blague|fais une blague|fais moi rire|jouons|on joue|on danse|tu danses|chante|chante moi)\b/
const FOLLOW_UP = /^(?:et (?:apres|ensuite|pour moi|pour nous)|et alors|comment faire|que faire|pourquoi|combien|explique moi|et si|pourrais je|peux je|est ce possible|quels documents|ou aller|et dans mon cas)\b/

export function getOffTopicLimits(plan = "") {
  return OFFTOPIC_LIMITS[plan] || OFFTOPIC_LIMITS.premium
}

export function localSmallTalkAnswer(question = "", language = "fr") {
  const text = normalizeAdvisorScopeText(question)
  if (!text || text.length > 65) return null
  const kreol = language === "kreol" || language === "kr" || language === "cr"
  if (/^(?:salut|bonjour|bonsoir|coucou|hello|hey|yo)(?: tout le monde| mon conseiller| a toi)?$/.test(text)) {
    return kreol
      ? "Bonzour ! Mi lé la pou aide aou su out bidzé, out aides ek out démarches."
      : "Bonjour ! Je suis là pour vous aider avec votre budget, vos aides et vos démarches."
  }
  if (/^(?:ca va|comment ca va|comment vas tu|tu vas bien|ca roule|tout va bien)(?: on danse| tu danses| alors on danse)?$/.test(text) ||
      /^(?:on danse|tu danses|alors on danse|viens on danse|on peut danser|on va danser)$/.test(text)) {
    const dance = /\bdans/.test(text)
    if (dance) {
      return kreol
        ? "Mi lé en forme ! Pou danse, mi na pas bann pieds, mé mi pé aide aou fé danse out bidzé. Kosa ou vé regarde ?"
        : "Ça va, merci ! Pour danser, je manque un peu de jambes, mais je peux vous aider à faire danser les chiffres de votre budget. On regarde quoi ?"
    }
    return kreol
      ? "Mi lé bien, mersi ! Ek ou ? Si ou vé, nou pé regarde out bidzé ou bann aides."
      : "Ça va, merci ! Et vous ? Si vous avez une question de budget, d'aides ou de démarches, je suis là."
  }
  if (/^(?:merci|merci beaucoup|super merci|ok merci|daccord merci|c est gentil merci)$/.test(text)) {
    return kreol ? "Avèk plaisir ! Mi reste la si ou néna in kestyon."
      : "Avec plaisir ! Je reste disponible si vous avez une autre question."
  }
  return null
}

export function classifyAdvisorQuestionScope({
  question = "", mode = "general", action = "", conversationContext = {},
} = {}) {
  const text = normalizeAdvisorScopeText(question)
  if (!text) return "unknown"
  if (action === "analyze_refusal") return "in_scope"

  // An explicitly playful request is out of scope even if another word
  // happened to mention money; otherwise this guard can be bypassed by
  // appending "APL" to an unrelated request.
  if (ROLEPLAY.test(text) && CLEAR_OUT_OF_SCOPE.test(text)) return "off_topic"
  if (CLEAR_OUT_OF_SCOPE.test(text) && !RELEVANT.test(text)) return "off_topic"
  if (RELEVANT.test(text)) return "in_scope"

  // Administrative workflows have intrinsically relevant follow-ups. The
  // stronger explicit out-of-scope detector above still takes precedence.
  if (mode && mode !== "general" && mode !== "budget_depenses" &&
      mode !== "trouver_aide") return "in_scope"

  const turn = String(conversationContext?.turnType || "").toUpperCase()
  if (["FOLLOW_UP", "NEXT_STEP", "REQUEST_ALTERNATIVE", "ASK_DETAILS"].includes(turn) &&
      FOLLOW_UP.test(text)) return "in_scope"

  // Do not charge an unclear two-word follow-up as an off-topic request.
  if (text.split(" ").length <= 2 && !CLEAR_OUT_OF_SCOPE.test(text)) return "unknown"
  return "off_topic"
}
