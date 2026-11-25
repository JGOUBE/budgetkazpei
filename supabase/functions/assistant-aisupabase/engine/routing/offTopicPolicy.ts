// Cost scope is decided on the server, never from a client-provided label.
// It does NOT decide official eligibility, safety, or whether advice is correct.
// A conservative fallback treats unrecognized free chat as off-topic.
const normalize = value => String(value || "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ")

const MONEY_AND_BENEFITS = /\b(?:budget|bidze|depens(?:e|es)?|depans|revenu(?:s)?|salaire|pay(?:er|e|e?s)?|factur(?:e|es)?|loyer|charges? fixes?|epargne|economis(?:er|e|es)?|economies|economi|dettes?|credit|debit|rembourser|mensualit(?:e|es)|impots?|taxes?|retraite|assurance|mutuelle|prix|tarif|moins cher|plus cher|carburant|carburan|mazout|essence|essans|gazole|diesel|plein d essence|transport|deplacements?|pouvoir d achat|vie chere|magasin|enseigne|courses?|ticket de caisse|achat|panier|alimentation|energie|electricite|eau potable|allocation(?:s)?|prestation(?:s)?|aides? (?:financiere|sociale|au logement|de la caf|publique|pour mon|pour ma)|mes aides|mes droits|quelles aides|aides possibles|trouver une aide|demander une aide|rsa|apl|als|alf|aah|aeeh|ass\b|are\b|caf\b|mdph|ccas|france travail|fsl|bourse|pass sport|prime d activite|crous)\b/
const ADMIN_AND_FINANCIAL_ADVICE = /\b(?:demarch(?:e|es) administrativ(?:e|es)|dossier(?:s)? administratifs?|mon dossier|ma demande d aide|mes droits|mon courrier|ma lettre|ma declaration|mon refus|mon recours|mes justificatifs|mon contrat|mes prestations|mes allocations|ma retraite|mon travail|mon emploi|mon cv|ma formation|recherche d emploi|aide sociale|aides locales|allocataire|surendettement|aide au logement|droit social|consommation|mon fournisseur|mon abonnement)\b/
const PERSONAL_MONEY = /\b(?:mon budget|mes depenses|mes revenus|mon salaire|mon argent|mon loyer|mes achats|mes courses|mes droits|mon credit|mes factures|mes economies|mes aides|ma caf|mes prestations)\b/
const CLEAR_GENERAL_QUERY = /^(?:pourquoi (?:le ciel|la lune|les etoiles|les chats|les chiens|la terre|le soleil)|quelle est la capitale|quel est le president|combien de lunes|raconte(?: moi)? (?:une histoire|une blague)|fais(?: moi)? (?:une blague|une devinette)|invente(?: moi)?|ecris(?: moi)? (?:un poeme|une chanson)|comment(?: ca)? fonctionne (?:une fusee|un volcan)|qui a gagne (?:le match|la coupe))\b/
// Avoid classifying common non-financial homonyms as personal spending.
const NON_FINANCIAL_HOMONYMS = /\b(?:courses? de chevaux|courses? a pied|course de velo|panier de basket|panier de basket ball)\b/

const PLAYFUL = /\b(?:licornes?|dragons?|extraterrestres?|magique|sorcier|devinettes?|blagues?|danser|on danse|histoires? droles?|poemes?|chansons?|jeu de role|jeux videos?|jeux de mots|fictif|fiction|imagine une planete|chats? presidents?)\b/

// Detect real-life cost, eligibility and administrative questions even when
// the exact wording differs from the usual budget or CAF keywords.
const EXTRA_FINANCE_AND_ADMIN = /\b(?:une aide|des aides|mon aide|aide pour (?:mon |ma |mes |le |la |les )?(?:logement|loyer|enfant|famille|factur|energie|travail|emploi|formation|retraite|sante)|aide a payer|obtenir (?:une|des) aides?|beneficier (?:d une|des) aides?|droit a (?:une|des) aides?|subventions?|fin de mois|reste a vivre|decouvert bancaire|besoin d argent|pas assez d argent|chomage|sans emploi|demandeur d emploi|indemnisation|allocation chomage|mes charges|mon solde|faire des economies|mettre de cote|echelonner (?:un paiement|une dette)|courrier administratif|lettre administrative|email administratif|relance administrative|rendez vous administratif|demarches administratives|trouver un emploi|recherche d emploi|financer une formation|formation professionnelle)\b/
// Assistance from local associations, CCAS and solidarity collectives is a
// useful advisor request, even without the words "CAF" or "aide financière".
const LOCAL_HELP = /\b(?:epiceries? (?:sociales?|solidaires?)|associations?|collectifs?|entraide|banque alimentaire|restos du coeur|secours populaire|croix rouge|distributions? alimentaires?|travailleur social|assistante sociale|maison des solidarites|colis alimentaires?)\b/
const HELP_INTENT = /\b(?:je cherche|j ai besoin|besoin de|besoin d|ou trouver|ou aller|vers qui|qui peut m aider|comment contacter|comment obtenir|a qui demander|mi cherche|mi besoin|koman trouve|kot mi)\b/
const FOOD_EMERGENCY = /\b(?:plus de quoi manger|pas de quoi manger|rien a manger|plus rien a manger|plus d argent pour manger|mon frigo est vide)\b/
// Financial hardship with food or grocery wording requires social assistance,
// not an off-topic answer or an automatic personal-spending analysis.
const FOOD_HARDSHIP = /\b(?:je (?:n? ?ai|suis)|j ai|on a|nous avons|mi|moin).{0,50}\b(?:pas|plus|du mal|difficile|galere|assez|pou paie).{0,65}\b(?:manger|nourrir|acheter|payer|courses?|repas|nourriture)\b|\b(?:plus assez|pas assez|pas de quoi|plus de quoi|du mal a payer|difficultes? a payer|galere a payer).{0,70}\b(?:manger|nourrir|acheter a manger|mes courses|les courses|repas|nourriture|alimentaire)\b/
const IMPOSSIBLE_TO_BUY_FOOD = /\b(?:je (?:ne )?(?:peux|arrive|parviens|reussis) (?:plus|pas)|je n ai (?:plus|pas) les moyens de).{0,60}\b(?:payer|acheter).{0,32}\b(?:courses?|repas|nourriture|aliments?)\b/
const KREOL_FOOD_HARDSHIP = /\b(?:mi|moin|nou).{0,35}\b(?:pu|pi|pa|gagne pu|arrive pu).{0,45}\b(?:manze|mange|nourriture|achete|acheter|course|repas)\b/
const LOCAL_SUPPORT_QUESTION = /\b(?:quelles? associations?|quels? collectifs?|qui peut nous aider|peuvent m aider|peut m aider|pour m aider|pour nous aider|a qui dois je m adresser|qui contacter|ou je peux aller|besoin de soutien)\b/
const DIRECT_SUPPORT = /\b(?:je suis victime|je subis des violences|je vis des violences|victime de violences|violences conjugales|violences intrafamiliales|mon conjoint me frappe|on me harcele|je suis harcele|besoin de soutien scolaire|besoin d aide aux devoirs|je cherche du soutien scolaire|je recherche du soutien scolaire|mon enfant a des difficultes scolaires|mon enfant a besoin d aide aux devoirs)\b/

const BUDGET_SHORTCUT = /^(?:que puis je reduire|ou puis je economiser|comment reduire|comment economiser|comment ameliorer mon budget|combien me reste(?: t il)?|ou va mon argent)\b/

const ADVISOR_DOCUMENT_TOPICS = /\b(?:refus|refuse|refusee|rejet|rejete|rejetee|recours|notification|courrier|decision administrative)\b/
const ADVISOR_DOCUMENT_MODES = new Set(["comprendre_refus", "comprendre_courrier", "preparer_recours"])

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
  if (NON_FINANCIAL_HOMONYMS.test(text) && !PERSONAL_MONEY.test(text)) return "offtopic"
  if (PLAYFUL.test(text) && !PERSONAL_MONEY.test(text) && !/\b(?:prix|tarif|cout|combien coute|combien coutent|budget|bidze|economies|lekonomi|moins cher|aide financiere|gratuit|gratuite|depenses|depans)\b/.test(text)) return "offtopic"
  if (FOOD_EMERGENCY.test(text) || FOOD_HARDSHIP.test(text) || IMPOSSIBLE_TO_BUY_FOOD.test(text) || KREOL_FOOD_HARDSHIP.test(text) || DIRECT_SUPPORT.test(text) || (LOCAL_HELP.test(text) && (HELP_INTENT.test(text) || LOCAL_SUPPORT_QUESTION.test(text)))) return "useful"
  if (/\b(?:lo bidze|out bidze|mon bidze|nout bidze|lekonomi|leconomie|bann zed|in zed|domann zed|kou de la vi|lavi i kout ser|mi na poin d arzan|mi nana poin d arzan|mi gagne pu paie|mi gagne pu payer|mon bann tik[eé]|mon bann courses|mon bann achats|out bann courses|out bann achats|bann demars|mon kourrie|mon dosie)\b/.test(text)) return "useful"
  if (MONEY_AND_BENEFITS.test(text) || ADMIN_AND_FINANCIAL_ADVICE.test(text) || EXTRA_FINANCE_AND_ADMIN.test(text)) return "useful"
  if (/\b(?:mon alimentation|mes habitudes alimentaires|mon regime alimentaire|ma facon de manger|ce que j achete|ce que je mange|ce que je consomme|mes achats|mes tickets|mes produits achetes|sak mi aste|sak mi achete|out manze)\b/.test(text)) return "useful"
  if (/\b(?:mes habitudes de consommation|habitudes d achats?|produits? (?:reguliers?|frequents?|les plus achetes)|articles? (?:reguliers?|frequents?|les plus achetes)|j achete (?:souvent|regulierement|le plus)|je rachete|mi achete|mi asete|j habite maintenant|j ai demenage|j ai deja essaye)\b/.test(text)) return "useful"
  // A short follow-up to a selected financial/administrative tool remains
  // useful. Longer self-contained unrelated queries cannot spoof this mode.
  if (ADVISOR_DOCUMENT_MODES.has(mode) && ADVISOR_DOCUMENT_TOPICS.test(text)) return "useful"
  if (mode === "budget_depenses" && BUDGET_SHORTCUT.test(text)) return "useful"
  if (GUARDED_MODES.has(mode) && text.split(" ").length <= 7 && SHORT_CONTINUATION.test(text))
    return "useful"
  return "offtopic"
}

// Exact, brief pleasantries only: no template interception of real queries.
const FR_LOCAL = Object.freeze({
  "bonjour": "Bonjour ! Je peux vous aider avec votre budget, vos achats, les aides et les démarches.",
  "bonzour": "Bonjour ! Je peux vous aider avec votre budget, vos achats, les aides et les démarches.",
  "salut": "Salut ! Une question sur vos économies, votre budget ou vos aides ?",
  "coucou": "Coucou ! Comment puis-je vous aider aujourd’hui ?",
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
  "bonzour": "Bonzour ! Mi pé aide aou pou out bidzé, bann aides ek demars.",
  "salut": "Salut ! Kosa ou vé konèt su out bidzé ou bann aides ?",
  "merci": "Avèk plézir ! Mi reste disponib pou out kestyon.",
  "merci beaucoup": "Avèk plézir ! Si ou nana in kestyon, mi lé la.",
  "ca va": "Mi sava, mersi ! Kosa mi pé fé pou aou zordi ?",
  "koman i le": "Mi sava, mersi ! Kosa ou vé konèt zordi ?",
  "mersi": "Avèk plézir ! Mi lé la si ou nana in lot kestyon.",
  "mersi bokou": "Avèk plézir !",
  "bonsoir": "Bonswar ! Kosa mi pé fé pou aou ?",
  "bonswar": "Bonswar ! Kosa mi pé fé pou aou ?",
  "coucou": "Koukou ! Kosa mi pé fé pou aou ?",
  "ca va on danse": "Mi sava, merci ! Mi dans mieux avec bann chiffres. Nou regarde out bidzé ou bann lekonomi ?",
})

export function getLocalAdvisorSmallTalk(question = "", language = "fr") {
  const key = normalize(question)
  if (!key || key.length > 40) return null
  if (["kreol", "kr", "cr"].includes(language)) {
    // No French fallback in KR mode: a short greeting must respect the toggle.
    return KR_LOCAL[key] || null
  }
  return FR_LOCAL[key] || null
}


const LOCAL_OFFTOPIC_FR = "Je peux surtout vous aider sur votre budget, vos économies, les aides et les démarches. Si vous avez une question dans ces domaines, je suis là pour vous accompagner."
const LOCAL_OFFTOPIC_KR = "Mi lé surtout la pou aide aou su out bidzé, bann lékonomi, bann aides ek bann demars. Si ou nana in kestyon la-désu, mi pé aide aou."

// One neutral, reusable reply to unrelated or playful messages; no AI call.
export function getLocalAdvisorOffTopicResponse(language = "fr") {
  return ["kreol", "kr", "cr"].includes(language) ? LOCAL_OFFTOPIC_KR : LOCAL_OFFTOPIC_FR
}

// Natural follow-ups to a real budget observation must never be mistaken for
// an unrelated message simply because the user did not enter expenses.
// These are cautious, general suggestions only: no AI call, no fabricated data.
// The history is not used to authorize extra paid requests or alter access.
export function getLocalAdvisorBudgetNoDataAdvice(
  question = "", recentHistory: unknown = [], language = "fr",
) {
  const text = normalize(question)
  if (!text || text.length > 160 || text.split(" ").length > 31 ||
    !/\b(?:solutions?|solisions?|conseils?|konseys?|astuces?|idees?|lidees?|lide|pistes?|proposes?|proposer|propoz|propoze|recommande(?:s|z|r)?|faire quoi|comment faire|par quoi commencer|autre chose|quoi d autre|et sinon|sinon quoi|alternatives?)\b/.test(text) ||
    /\d|\b(?:personnalise|personnalisee|personnaliser|precis|precise|estimation|estimer|calculer|simulation|ma situation|mon cas|selon mes|selon mon|compte tenu|mon profil|mes contraintes|mes revenus|ma famille|rsa|apl|caf|eligib|recours|chomage|salaire|contrat|recette|gateau|cuisine|meteo|film|chanson|planete|licorne|dragon|poeme|blague)\b/.test(text)) return null

  const history = Array.isArray(recentHistory)
    ? (recentHistory as Record<string, unknown>[]).slice(0, 5) : []
  const noRecordedSpending = /\b(?:je ne trouve pas encore de depenses|pas encore de depenses classees|mi trouv(?:e)? pa(?:s)? ankor bann depans|aucune depense enregistree)\b/
  if (history.some(item => item?.source === "local_budget_followup" &&
      !noRecordedSpending.test(normalize(item?.answer || "")))) return null
  const validSource = new Set(["local_budget_observation", "local_budget_followup", "local_budget_advice"])
  const anchorIndex = history.findIndex((item, index) =>
    index <= 3 && validSource.has(String(item?.source || "")) &&
    history.slice(0, index).every(prior =>
      ["local_offtopic", "local_budget_followup", "local_budget_advice"].includes(String(prior?.source || "")),
    ),
  )
  if (anchorIndex < 0) return null

  const subject = history.slice(anchorIndex).map(item => normalize(item?.question || "")).join(" ")
  const fr = language !== "kreol" && language !== "kr" && language !== "cr"
  const alternative = history.slice(0, anchorIndex + 1).some(item => item?.source === "local_budget_advice") ||
    /\b(?:autre chose|quoi d autre|et sinon|sinon quoi|alternatives?|autres? (?:solutions?|pistes?|idees?))\b/.test(text)
  if (/\b(?:carburant|carburan|karburan|karbiran|mazout|essence|essans|lesans|gazole|gazoil|diesel)\b/.test(subject)) {
    if (alternative) return fr
      ? "Voici d'autres possibilités pour le carburant : vérifiez la pression des pneus selon le constructeur, adoptez une conduite souple et, si possible, évitez les trajets aux heures les plus encombrées. Ce sont des pistes générales, sans économie chiffrée."
      : "Autres pistes carburant : vérifie pression bann pneus, conduit souple, ek évite bann gros bouchons quand possible."
    return fr
      ? "Voici des pistes pour réduire le coût du carburant, même sans historique complet : regroupez les déplacements pour éviter les allers-retours, comparez le prix au litre sans détour coûteux, et envisagez covoiturage ou transports en commun quand c'est possible. Avec votre kilométrage habituel et la consommation du véhicule, je pourrai ensuite estimer vos frais sans inventer de montant."
      : "Minm san dépans anrezistré, groupe out bann trajé, compare bann prix carburant san grand détour, ek regarde si covoiturage ou transport en commun lé possible."
  }
  if (/\b(?:courses?|alimentaire|alimentation)\b/.test(subject)) {
    if (alternative) return fr
      ? "Autres idées pour les courses : comparez les produits de saison quand ils sont avantageux, les formats familiaux au prix unitaire et les portions que vous pourriez congeler. Un grand format n'est pas toujours le meilleur prix."
      : "Autres idées courses : compare produits de saison, prix par unité et bann portions à congeler. Grand format lé pas forcément moins cher."
    return fr
      ? "Même sans historique, préparez une liste selon vos repas, comparez les prix au kilo pour un même format, puis vérifiez vos placards avant de racheter. Avec quelques tickets enregistrés, nous pourrons ensuite chercher les économies adaptées à vos habitudes."
      : "Minm san historique, prépare in liste selon out repas, compare prix au kilo, ek vérifie sak ou nana déjà."
  }
  if (/\b(?:loyer|logement|energie|electricite|assurances?|abonnements?)\b/.test(subject)) {
    if (alternative) return fr
      ? "Autres pistes : vérifiez les frais renouvelés automatiquement, les éventuelles garanties en double et les contrats comparables à prestations équivalentes. Je ne peux pas chiffrer d'économie sans données."
      : "Autres pistes : vérifie bann frais automatiques, garanties en double, ek contrats équivalents."
    return fr
      ? "Sans historique, commencez par noter les factures et charges réellement payées, repérez les abonnements ou garanties en double, puis comparez les offres à conditions équivalentes. Vérifiez aussi les aides possibles sans présumer de vos droits."
      : "San historique, note out bann factures ek charges, vérifie les abonnements en double, ek compare bann offres équivalentes."
  }
  return null
}

// Short, elliptical follow-ups can refer to a recent financial conversation.
// The server checks the latest persisted exchange, not a client-provided label.
export function isPotentialAdvisorFollowUp(question = "") {
  const text = normalize(question)
  if (!text || CLEAR_GENERAL_QUERY.test(text) || PLAYFUL.test(text) ||
    INDEPENDENT_NON_FINANCIAL_TOPIC.test(text)) return false
  return text.length <= 80 && text.split(" ").length <= 8 &&
    /^(?:et pourquoi|et combien|et comment|et ensuite|et maintenant|et pour moi|comment faire|comment je fais|combien|pourquoi|c est possible|quelles conditions|pour mon cas|je peux faire quoi|qu est ce que je fais|comment proceder|merci pour ces aides)\b/.test(text)
}



// A trusted server-stored conversation topic may authorize one short,
// clearly referential follow-up to use the normal (atomically metered) AI
// route. This check NEVER relies on a client-provided mode or topic.
const INDEPENDENT_NON_FINANCIAL_TOPIC =
  /\b(?:recette|gateau|cuisine|soleil|ciel|etoiles?|jupiter|saturne|mars|lune|planete|astronomie|football|rugby|match|sport|meteo|volcans?|plantes?|chats?|chiens?|film|livre|chanson|poeme|blague|acteur|president|histoire de france)\b/
const CONTEXT_REFERENCE =
  /\b(?:ca|sa|li|cela|ceci|celui|celle|encore|ankor|toujours|touzor|le meme|la meme|cette fois|ces prix|ce prix|c est|c etait|se poursuivre|se calmer)\b/
const CONTEXT_OPENING =
  /^(?:oui|wi|non|ok|okay|d accord|alors|mais|donc|du coup|et|ek|ca|sa|li|cela|ceci|c est|est ce que|est ce qu|eske|tu penses|vous pensez|penses tu|pensez vous|crois tu|vous croyez|ou krwar|mi krwar|ou pense|pourquoi|poukoi|comment|koman|kosa|quand|kan|combien|konbien|kombyin|et pourquoi|et comment|et quand|et combien)\b/
const SHORT_ELLIPTICAL = /^(?:et |ek )?(?:pourquoi|poukoi|comment|koman|kosa|combien|konbien|kombyin|quand|kan|et ensuite|et maintenant|et pour moi|la suite|c est certain|est ce certain)\b/

export function isContextualAdvisorFollowUp(question = "") {
  const text = normalize(question)
  if (!text || text.length > 170 || text.split(" ").length > 22) return false
  if (CLEAR_GENERAL_QUERY.test(text) || PLAYFUL.test(text) ||
    INDEPENDENT_NON_FINANCIAL_TOPIC.test(text)) return false
  // Do not misroute a standalone new question because it begins with "Et".
  return CONTEXT_OPENING.test(text) &&
    (CONTEXT_REFERENCE.test(text) || SHORT_ELLIPTICAL.test(text))
}

export function advisorTopicGroupForQuestion(question = "") {
  const text = normalize(question)
  if (/\b(?:carburant|carburan|mazout|essence|essans|gazole|diesel|pompe|plein d essence)\b/.test(text)) return "carburant"
  if (/\b(?:courses?|alimentation|alimentaire|panier|ticket de caisse|magasin)\b/.test(text)) return "courses"
  if (/\b(?:loyer|logement|locataire|bail)\b/.test(text)) return "logement"
  if (/\b(?:electricite|energie|chauffage|climatisation)\b/.test(text)) return "energie"
  if (/\b(?:assurances?|mutuelle|abonnements?)\b/.test(text)) return "assurances"
  if (/\b(?:apl|caf|rsa|aides?|allocations?|prestations?|bourse|prime d activite)\b/.test(text)) return "aides"
  if (/\b(?:demarch|dossier|recours|courrier|contrat|administratif)\b/.test(text)) return "administratif"
  return "budget"
}

export function advisorTrustedTopicLabel(group = "") {
  const labels: Record<string, string> = {
    carburant: "prix et dépenses de carburant",
    courses: "budget courses et produits alimentaires",
    logement: "loyer et dépenses de logement",
    energie: "électricité et dépenses d'énergie",
    assurances: "assurances et abonnements",
    aides: "aides sociales et droits",
    administratif: "démarches et documents administratifs",
    budget: "budget personnel et économies",
  }
  return labels[group] || ""
}

// Only app navigation and existing interface features; not eligibility decisions.
const APP_NAV_INTENT = /\b(?:ou (?:est|sont|se trouve|trouver|retrouver|voir|consulter|ouvrir)|comment (?:acceder|ouvrir|consulter|retrouver|aller|scanner|numeriser|creer|faire|modifier)|je (?:ne )?(?:trouve|retrouve|vois) (?:pas|plus)|c est ou|dans quel(?:le)? (?:rubrique|page|menu))\b/
const APP_NAV_EXCLUDE = /\b(?:calcul(?:e|er|es|ees)?|montant|eligible|eligibilite|conditions?|combien|pourquoi|estimer|simulation|pour mon cas|pour ma situation|dois je|ai je droit)\b/
export function getLocalAdvisorAppGuide(question = "", language = "fr", mode = "general") {
  const text = normalize(question)
  if (mode !== "general" || !text || text.length > 220) return null
  if (/\b(?:regarde|analyse|analyser|examine|d apres|selon|par rapport|a partir de|ce que j achete)\b/.test(text) && /\b(?:achats|courses|tickets|achete)\b/.test(text)) return null
  const nav = APP_NAV_INTENT.test(text)
  const fr = language !== "kreol"
  // Explicit ticket-scanning help, not interpreting ticket content or prices.
  if (/\b(?:scan(?:ner)?|numeriser|photographier|prendre en photo)\b/.test(text) &&
      /\b(?:ticket|recu|facture|achat)\b/.test(text) &&
      !APP_NAV_EXCLUDE.test(text)) {
    return fr
      ? "Depuis l’accueil, ouvrez « Scanner mon ticket ». Ajoutez une photo nette du ticket, vérifiez les articles et les montants reconnus, puis validez. L’écran propose aussi plusieurs photos pour les tickets longs."
      : "Depi l’accueil, ouv « Scanner mon tiké ». Mèt in foto bien lisib, vérifie bann produits ek bann montants, apré valide. Pou in tiké long, ou pé mèt plizyèr fotos."
  }
  if (!nav || APP_NAV_EXCLUDE.test(text)) return null
  if (/\b(?:liste de courses|ma liste|liste courses)\b/.test(text)) {
    return fr
      ? "Depuis l’accueil, ouvrez « Faire ma liste de courses ». Vous pouvez y préparer vos achats et ajouter vos produits."
      : "Depi l’accueil, ouv « Fé mon liste courses ». Ou pé prépar out courses ek azout out produits."
  }
  if (/\b(?:mes economies|economies possibles|comparaisons? de prix)\b/.test(text)) {
    return fr
      ? "Depuis l’accueil, ouvrez « Mes économies ». Vous y retrouverez les comparaisons disponibles pour les produits correctement identifiés, à partir de prix observés qui peuvent avoir changé."
      : "Depi l’accueil, ouv « Mon bann lékonomi ». Ou va trouv bann comparaisons de produits bien rekoné, avèk bann prix observé ki pé avoir changé."
  }
  if (/\b(?:apercu de mes achats|mes achats|habitudes d achat|statistiques d achat)\b/.test(text)) {
    return fr
      ? "Depuis l’accueil, ouvrez « Aperçu de mes achats » pour consulter vos habitudes et les analyses de consommation disponibles."
      : "Depi l’accueil, ouv « Koudzyé su mon bann courses » pou war out bann labitid ek analyses d’achat."
  }
  if (/\b(?:mes aides|aides et droits|mes droits|rubrique aides)\b/.test(text)) {
    return fr
      ? "Depuis l’accueil, ouvrez « Mes aides et mes droits » pour consulter les aides disponibles. Si vous cherchez une aide adaptée à votre situation, je peux examiner votre demande."
      : "Depi l’accueil, ouv « Mon bann èd ek drwa » pou consulter bann aides. Si ou cherche in aide pou out situation, mi pé aide aou."
  }
  if (/\b(?:mon profil|mon compte|mes informations personnelles|modifier mon profil|mettre a jour mon profil)\b/.test(text)) {
    return fr
      ? "Touchez l’icône de profil en haut à droite pour consulter ou actualiser vos informations personnelles dans BudgetKazPeï."
      : "Appuie su l’icône profil en haut à droite pou consulter ou modifier out bann informations dan BudgetKazPeï."
  }
  return null
}


// Static, general financial literacy explanations. Never infer the person's
// eligibility, account balance or future savings from a definition.
export function getLocalAdvisorBudgetBasics(question = "", language = "fr", mode = "general") {
  const text = normalize(question).replace(/ (?:svp|s il vous plait|s il te plait)$/, "")
  if (!["general", "budget_depenses"].includes(mode) || !text || text.length > 105) return null
  const definitions = [
    {
      questions: ["c est quoi un budget", "c est quoi le budget", "qu est ce qu un budget", "qu est ce que le budget", "definition du budget", "kosa i le in bidze", "kosa i le in budget", "kosa sa ve dire bidze"],
      fr: "Un budget sert à comparer vos revenus aux dépenses prévues et déjà réalisées sur une période, souvent le mois. Commencez par les charges fixes, puis les dépenses variables, sans oublier une marge pour les imprévus.",
      kr: "In bidzé i aide aou compare out revenus ek out dépans su in période. Commence par bann sarz fixes, apré bann dépans variables, ek garde in marge pou imprévu.",
    },
    {
      questions: ["c est quoi une charge fixe", "qu est ce qu une charge fixe", "qu est ce que les charges fixes", "definition des charges fixes"],
      fr: "Une charge fixe est une dépense régulière et généralement prévisible : loyer, assurance ou abonnement, par exemple. Elle n'est pas forcément impossible à réduire, mais elle revient habituellement chaque mois.",
      kr: "In sarz fix lé in dépans régulière ek souvent prévisible : loyer, assurance ou abonnement. Li revient souvent chaque mwa.",
    },
    {
      questions: ["c est quoi une depense variable", "qu est ce qu une depense variable", "definition des depenses variables"],
      fr: "Une dépense variable change selon les achats et les périodes, comme les courses, les sorties ou certains frais de transport. La suivre aide à voir quels postes évoluent.",
      kr: "In dépans variable i change selon out achats, comme courses, sorties ou transport. Suivre ali i aide aou voir bann changements.",
    },
    {
      questions: ["c est quoi le reste a vivre", "qu est ce que le reste a vivre", "definition du reste a vivre"],
      fr: "Le reste à vivre est une estimation de l'argent disponible après certaines dépenses, selon la méthode de calcul utilisée. Dans BudgetKazPeï, la marge estimée dépend des revenus, des charges et des dépenses correctement enregistrés ; ce n'est pas nécessairement le solde bancaire réel.",
      kr: "Reste à vivre lé in estimation de larzan disponible apré bann dépans, selon la façon kalkil. Dann BudgetKazPeï, li dépend bann données bien anrezistré, pa forcément solde bank réel.",
    },
    {
      questions: ["c est quoi une economie potentielle", "qu est ce qu une economie potentielle", "definition d une economie potentielle"],
      fr: "Une économie potentielle est une possibilité de dépenser moins, pas une économie déjà réalisée. Pour comparer deux prix, il faut vérifier qu'il s'agit du même produit et du même format ; un ancien prix observé peut avoir changé.",
      kr: "In lékonomi potentielle lé in possibilité dépans moins, pa in lékonomi déjà réalisée. Fo compare minm produit ek minm format, ek bann prix anciens i pé changer.",
    },
    {
      questions: ["que signifie prix observe", "c est quoi un prix observe", "qu est ce qu un prix observe"],
      fr: "Un prix observé est un prix relevé à une date et dans une enseigne précises. Il sert de repère historique, mais ne garantit pas que le produit soit encore vendu à ce prix aujourd'hui.",
      kr: "In prix observé lé in prix noté in jour dann in magasin précis. Lé in repère historique, pa in garantie pou prix zordi.",
    },
    {
      questions: ["comment faire un budget", "comment preparer un budget", "comment construire un budget", "koman mi fe in bidze", "koman mi prepare mon bidze"],
      fr: "Pour préparer un budget mensuel, notez vos revenus, puis vos charges fixes et vos dépenses variables. Comparez le total aux revenus et réservez, si possible, une marge pour les imprévus. Vous pouvez enregistrer ces montants dans BudgetKazPeï pour suivre leur évolution.",
      kr: "Pou prépar out bidzé mensuel, note out revenus, bann sarz fixes ek bann dépans variables. Compare total-la ek out revenus, ek garde in marge si ou pé.",
    },
  ]
  const found = definitions.find(item => item.questions.includes(text))
  return found ? (language === "kreol" ? found.kr : found.fr) : null
}


// This is only a short observation about living costs, not a numerical
// analysis: the response must not imply that user spending was inspected.
export function getLocalAdvisorBudgetObservation(question = "", language = "fr", mode = "general") {
  if (!["general", "budget_depenses"].includes(mode)) return null
  const original = String(question || "")
  const text = normalize(original)
  if (!text || text.length > 165 || text.split(" ").length > 25 ||
      original.includes("?") || original.includes("\n")) return null
  if (!/^(?:je trouve (?:que )?|je constate que |j ai remarque que |j ai l impression que |mi trouv(?:e)? |moin trouv(?:e)? |mwin trouv(?:e)? |c est |ca devient |l |le |la |les |lo |carburan(?:t)? |mazout |mon |ma |mes )/.test(text)) return null
  if (!/\b(?:cher|chere|chers|cheres|ser|trop ser|tro ser|hors de prix|coute cher|coutent cher|revient cher|reviennent cher|trop cher|trop chere|flambe)\b/.test(text)) return null
  if (/\b(?:pas cher|pas chere|pa ser|moins cher|moins chere|bon marche|plus abordable|raisonnable)\b/.test(text)) return null
  if (/\b(?:pourquoi|comment|combien|quel|quels|quelle|quelles|compare|comparer|comparaison|calcule|calculer|prevoir|estimer|montant|prix aujourd hui|prix actuel|prix du litre|aujourd hui|cette semaine|ou trouver|que faire)\b/.test(text)) return null
  const fr = language !== "kreol"
  if (/\b(?:carburant|carburan|mazout|essence|essans|gazole|diesel|plein d essence)\b/.test(text)) {
    return fr
      ? "Le carburant peut peser sur le budget. Nous pouvons comparer vos dépenses de transport enregistrées sur plusieurs périodes, puis regarder des pistes adaptées : regrouper les trajets ou comparer les prix affichés. Souhaitez-vous examiner vos dépenses de carburant ?"
      : "Carburant i pé peser dan bidzé. Nou pé comparer out dépans transport anrezistré su plizyèr périodes ek regarder bann pistes pou économiser. Ou vé regarde out dépans carburant ?"
  }
  if (/\b(?:courses|alimentation|alimentaire|produits alimentaires|manger)\b/.test(text)) {
    return fr
      ? "Les courses peuvent peser sur le budget. Nous pouvons examiner vos achats enregistrés et comparer les prix de produits réellement équivalents, en tenant compte de la date des relevés. Voulez-vous examiner votre budget courses ?"
      : "Bann courses i pé peser dan bidzé. Nou pé regarder out achats anrezistré ek compare prix des minm produits. Ou vé regarde out bidzé courses ?"
  }
  if (/\b(?:loyer|logement)\b/.test(text)) {
    return fr
      ? "Le loyer représente souvent une charge importante. Nous pouvons examiner son poids dans votre budget et les aides au logement possibles, sans supposer que vous y avez droit. Voulez-vous faire le point ?"
      : "Loyer lé souvent in gro sarz. Nou pé regarde out bidzé ek bann aides logement possibles, sans promettre in droit. Ou vé faire le point ?"
  }
  if (/\b(?:electricite|energie|eau|facture|factures)\b/.test(text)) {
    return fr
      ? "Les factures peuvent varier d'une période à l'autre. Nous pouvons comparer celles que vous avez enregistrées et chercher des pistes adaptées, sans inventer de montant. Voulez-vous examiner ces dépenses ?"
      : "Bann factures i pé varier. Nou pé comparer out montants anrezistré ek regarde bann pistes adaptées. Ou vé faire le point ?"
  }
  if (/\b(?:assurance|abonnement|charges fixes)\b/.test(text)) {
    return fr
      ? "Les charges régulières méritent d'être examinées. Nous pouvons comparer vos montants enregistrés et repérer les contrats à vérifier, sans supposer qu'ils sont supprimables. Voulez-vous faire le point ?"
      : "Bann sarz régulières i mérite d'être vérifié. Nou pé comparer out montants anrezistré ek regarde bann contrats. Ou vé faire le point ?"
  }
  return null
}

// Only exact, unaccompanied introduction prompts. Do not mistake a real pasted
// decision for an introduction, and never hallucinate refusal reasons.
export function getLocalAdvisorDocumentIntake(question = "", language = "fr", mode = "general") {
  if (!["comprendre_refus", "comprendre_courrier"].includes(mode)) return null
  const raw = String(question || "")
  const text = normalize(raw)
  if (!text || text.length > 180 || raw.includes("\n")) return null
  const presetRefusal = text === "je vais coller un refus explique uniquement ce qui est ecrit et ce que je dois verifier"
  const presetLetter = text === "je vais coller un courrier administratif aide moi a comprendre ce qui est ecrit et la prochaine action"
  const introduction = /^(?:je vais|je veux|je souhaite|je voudrais) (?:coller|envoyer|transmettre|partager|copier|joindre) (?:un|une|le|la|mon|ma) (?:refus|courrier|lettre|notification|decision)(?: (?:de refus|administratif|administrative))?$/.test(text)
  if (!presetRefusal && !presetLetter && !introduction) return null
  const refusal = mode === "comprendre_refus"
  if (language === "kreol") return refusal
    ? "Ou pé coller texte out refus isi, sans nom, numéro dossier ni coordonnées. Mi va distinguer motif écrit, délais ou recours mentionnés ek bann points à vérifier."
    : "Ou pé coller out courrier isi, sans bann données personnelles. Mi va expliquer sak lé écrit ek prochaine étape utile, sans inventer."
  return refusal
    ? "Collez ici le texte du refus, en masquant si possible votre nom, votre numéro de dossier et vos coordonnées. Je distinguerai les motifs réellement indiqués, les éventuels délais ou recours mentionnés et les points à vérifier."
    : "Collez ici votre courrier administratif, en masquant si possible vos données personnelles. Je vous expliquerai ce qui est écrit, les points à vérifier et la prochaine étape utile, sans inventer d'informations."
}
