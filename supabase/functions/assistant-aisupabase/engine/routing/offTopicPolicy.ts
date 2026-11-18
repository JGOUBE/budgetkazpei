// Cost scope is decided on the server, never from a client-provided label.
// It does NOT decide official eligibility, safety, or whether advice is correct.
// A conservative fallback treats unrecognized free chat as off-topic.
const normalize = value => String(value || "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ")

const MONEY_AND_BENEFITS = /\b(?:budget|bidze|depens(?:e|es)?|depans|revenu(?:s)?|salaire|pay(?:er|e|e?s)?|factur(?:e|es)?|loyer|charges? fixes?|epargne|economis(?:er|e|es)?|economies|economi|dettes?|credit|debit|rembourser|mensualit(?:e|es)|impots?|taxes?|retraite|assurance|mutuelle|prix|tarif|moins cher|plus cher|magasin|enseigne|courses?|ticket de caisse|achat|panier|alimentation|energie|electricite|eau potable|allocation(?:s)?|prestation(?:s)?|aides? (?:financiere|sociale|au logement|de la caf|publique|pour mon|pour ma)|mes aides|mes droits|quelles aides|aides possibles|trouver une aide|demander une aide|rsa|apl|als|alf|aah|aeeh|ass\b|are\b|caf\b|mdph|ccas|france travail|fsl|bourse|pass sport|prime d activite|crous)\b/
const ADMIN_AND_FINANCIAL_ADVICE = /\b(?:demarch(?:e|es) administrativ(?:e|es)|dossier(?:s)? administratifs?|mon dossier|ma demande d aide|mes droits|mon courrier|ma lettre|ma declaration|mon refus|mon recours|mes justificatifs|mon contrat|mes prestations|mes allocations|ma retraite|mon travail|mon emploi|mon cv|ma formation|recherche d emploi|aide sociale|aides locales|allocataire|surendettement|aide au logement|droit social|consommation|mon fournisseur|mon abonnement)\b/
const PERSONAL_MONEY = /\b(?:mon budget|mes depenses|mes revenus|mon salaire|mon argent|mon loyer|mes achats|mes courses|mes droits|mon credit|mes factures|mes economies|mes aides|ma caf|mes prestations)\b/
const CLEAR_GENERAL_QUERY = /^(?:pourquoi (?:le ciel|la lune|les etoiles|les chats|les chiens|la terre|le soleil)|quelle est la capitale|quel est le president|combien de lunes|raconte(?: moi)? (?:une histoire|une blague)|fais(?: moi)? (?:une blague|une devinette)|invente(?: moi)?|ecris(?: moi)? (?:un poeme|une chanson)|comment(?: ca)? fonctionne (?:une fusee|un volcan)|qui a gagne (?:le match|la coupe))\b/
const PLAYFUL = /\b(?:licornes?|dragons?|extraterrestres?|magique|sorcier|devinettes?|blagues?|danser|on danse|histoires? droles?|poemes?|chansons?|jeu de role|jeux videos?|jeux de mots|fictif|fiction|imagine une planete|chats? presidents?)\b/

// Detect real-life cost, eligibility and administrative questions even when
// the exact wording differs from the usual budget or CAF keywords.
const EXTRA_FINANCE_AND_ADMIN = /\b(?:une aide|des aides|mon aide|aide pour (?:mon |ma |mes |le |la |les )?(?:logement|loyer|enfant|famille|factur|energie|travail|emploi|formation|retraite|sante)|aide a payer|obtenir (?:une|des) aides?|beneficier (?:d une|des) aides?|droit a (?:une|des) aides?|subventions?|fin de mois|reste a vivre|decouvert bancaire|besoin d argent|pas assez d argent|chomage|sans emploi|demandeur d emploi|indemnisation|allocation chomage|mes charges|mon solde|faire des economies|mettre de cote|echelonner (?:un paiement|une dette)|courrier administratif|lettre administrative|email administratif|relance administrative|rendez vous administratif|demarches administratives|trouver un emploi|recherche d emploi|financer une formation|formation professionnelle)\b/
const BUDGET_SHORTCUT = /^(?:que puis je reduire|ou puis je economiser|comment reduire|comment economiser|comment ameliorer mon budget|combien me reste(?: t il)?|ou va mon argent)\b/

const SHORT_CONTINUATION = /^(?:et ensuite|et maintenant|et pour moi|comment faire|comment je fais|combien|pourquoi|c est possible|quelles conditions|pour mon cas|et si|je peux faire quoi|qu est ce que je fais|comment proceder|merci pour ces aides)\b/
const GUARDED_MODES = new Set([
  "budget_depenses","trouver_aide","scan_profil","comprendre_courrier",
  "preparer_dossier","generer_courrier","generer_email",
  "preparer_relance","comprendre_refus","preparer_recours","preparer_rdv",
])

export const ADVISOR_OFFTOPIC_LIMITS = Object.freeze({
  daily: 5,
  monthly: 20,
  hourlyAll: 30,
})

export function classifyAdvisorSpendScope({question = "", mode = "general", action = ""} = {}) {
  const text = normalize(question)
  if (action === "analyze_refusal") return "useful"
  if (!text) return "offtopic"
  // Explicitly independent off-topic questions take precedence over a stale
  // form mode or an irrelevant financial keyword appended to the question.
  if (CLEAR_GENERAL_QUERY.test(text)) return "offtopic"
  if (PLAYFUL.test(text) && !PERSONAL_MONEY.test(text)) return "offtopic"
  if (MONEY_AND_BENEFITS.test(text) || ADMIN_AND_FINANCIAL_ADVICE.test(text) || EXTRA_FINANCE_AND_ADMIN.test(text)) return "useful"
  // A short follow-up to a selected financial/administrative tool remains
  // useful. Longer self-contained unrelated queries cannot spoof this mode.
  if (mode === "budget_depenses" && BUDGET_SHORTCUT.test(text)) return "useful"
  if (GUARDED_MODES.has(mode) && text.split(" ").length <= 7 && SHORT_CONTINUATION.test(text))
    return "useful"
  return "offtopic"
}

// Exact, brief pleasantries only: no template interception of real queries.
const FR_LOCAL = Object.freeze({
  "bonjour": "Bonjour ! Je peux vous aider avec votre budget, vos achats, les aides et les démarches.",
  "salut": "Salut ! Une question sur vos économies, votre budget ou vos aides ?",
  "coucou": "Coucou ! Que souhaitez-vous savoir aujourd'hui ?",
  "bonsoir": "Bonsoir ! Je suis disponible pour vos questions sur BudgetKazPeï.",
  "merci": "Avec plaisir ! Je reste disponible si vous avez une autre question.",
  "merci beaucoup": "Avec plaisir ! N'hésitez pas si vous avez besoin d'aide pour vos démarches.",
  "ca va": "Ça va, merci ! Et vous ? Je peux aussi vous aider à faire le point sur votre budget.",
  "comment ca va": "Ça va, merci ! Comment puis-je vous aider aujourd'hui ?",
  "ca va on danse": "Ça va, merci ! Pour danser, je suis meilleur avec les chiffres qu'avec les pas. On regarde votre budget ou vos économies ?",
  "on danse": "Avec plaisir, en imagination ! Moi, je suis surtout là pour faire avancer vos économies et vos démarches.",
})
const KR_LOCAL = Object.freeze({
  "bonjour": "Bonzour ! Mi pé aide aou pou out bidzé, bann aides ek demars.",
  "salut": "Salut ! Kosa ou vé konèt su out bidzé ou bann aides ?",
  "merci": "Avec plaisir ! Mi reste disponib pou out kestyon.",
  "ca va": "Mi sava, merci ! Kosa mi pé fé pou aou zordi ?",
  "ca va on danse": "Mi sava, merci ! Mi dans mieux avec bann chiffres. Nou regarde out bidzé ou bann lekonomi ?",
})

export function getLocalAdvisorSmallTalk(question = "", language = "fr") {
  const key = normalize(question)
  if (!key || key.length > 40) return null
  if (!Object.prototype.hasOwnProperty.call(FR_LOCAL, key)) return null
  return language === "kreol" ? (KR_LOCAL[key] || FR_LOCAL[key]) : FR_LOCAL[key]
}


const LOCAL_OFFTOPIC_FR = "Je peux surtout vous aider sur votre budget, vos économies, les aides et les démarches. Si vous avez une question dans ces domaines, je suis là pour vous accompagner."
const LOCAL_OFFTOPIC_KR = "Mi lé surtout la pou aide aou su out bidzé, bann lékonomi, bann aides ek bann demars. Si ou nana in kestyon la-désu, mi pé aide aou."

// One neutral, reusable reply to unrelated or playful messages; no AI call.
export function getLocalAdvisorOffTopicResponse(language = "fr") {
  return language === "kreol" ? LOCAL_OFFTOPIC_KR : LOCAL_OFFTOPIC_FR
}

// Short, elliptical follow-ups can refer to a recent financial conversation.
// The server checks the latest persisted exchange, not a client-provided label.
export function isPotentialAdvisorFollowUp(question = "") {
  const text = normalize(question)
  return text.length <= 80 && text.split(" ").length <= 8 &&
    /^(?:et pourquoi|et combien|et comment|et ensuite|et maintenant|et pour moi|comment faire|comment je fais|combien|pourquoi|c est possible|quelles conditions|pour mon cas|et si|je peux faire quoi|qu est ce que je fais|comment proceder|merci pour ces aides)\b/.test(text)
}
