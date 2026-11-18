// Cost scope is decided on the server, never from a client-provided label.
// It does NOT decide official eligibility, safety, or whether advice is correct.
// A conservative fallback treats unrecognized free chat as off-topic.
const normalize = value => String(value || "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ")

const MONEY_AND_BENEFITS = /\b(?:budget|bidze|depens(?:e|es)?|depans|revenu(?:s)?|salaire|pay(?:er|e|e?s)?|factur(?:e|es)?|loyer|charges? fixes?|epargne|economis(?:er|e|es)?|economies|economi|dettes?|credit|debit|rembourser|mensualit(?:e|es)|impots?|taxes?|retraite|assurance|mutuelle|prix|tarif|moins cher|plus cher|carburant|essence|gazole|diesel|plein d essence|transport|deplacements?|pouvoir d achat|vie chere|magasin|enseigne|courses?|ticket de caisse|achat|panier|alimentation|energie|electricite|eau potable|allocation(?:s)?|prestation(?:s)?|aides? (?:financiere|sociale|au logement|de la caf|publique|pour mon|pour ma)|mes aides|mes droits|quelles aides|aides possibles|trouver une aide|demander une aide|rsa|apl|als|alf|aah|aeeh|ass\b|are\b|caf\b|mdph|ccas|france travail|fsl|bourse|pass sport|prime d activite|crous)\b/
const ADMIN_AND_FINANCIAL_ADVICE = /\b(?:demarch(?:e|es) administrativ(?:e|es)|dossier(?:s)? administratifs?|mon dossier|ma demande d aide|mes droits|mon courrier|ma lettre|ma declaration|mon refus|mon recours|mes justificatifs|mon contrat|mes prestations|mes allocations|ma retraite|mon travail|mon emploi|mon cv|ma formation|recherche d emploi|aide sociale|aides locales|allocataire|surendettement|aide au logement|droit social|consommation|mon fournisseur|mon abonnement)\b/
const PERSONAL_MONEY = /\b(?:mon budget|mes depenses|mes revenus|mon salaire|mon argent|mon loyer|mes achats|mes courses|mes droits|mon credit|mes factures|mes economies|mes aides|ma caf|mes prestations)\b/
const CLEAR_GENERAL_QUERY = /^(?:pourquoi (?:le ciel|la lune|les etoiles|les chats|les chiens|la terre|le soleil)|quelle est la capitale|quel est le president|combien de lunes|raconte(?: moi)? (?:une histoire|une blague)|fais(?: moi)? (?:une blague|une devinette)|invente(?: moi)?|ecris(?: moi)? (?:un poeme|une chanson)|comment(?: ca)? fonctionne (?:une fusee|un volcan)|qui a gagne (?:le match|la coupe))\b/
const PLAYFUL = /\b(?:licornes?|dragons?|extraterrestres?|magique|sorcier|devinettes?|blagues?|danser|on danse|histoires? droles?|poemes?|chansons?|jeu de role|jeux videos?|jeux de mots|fictif|fiction|imagine une planete|chats? presidents?)\b/

// Detect real-life cost, eligibility and administrative questions even when
// the exact wording differs from the usual budget or CAF keywords.
const EXTRA_FINANCE_AND_ADMIN = /\b(?:une aide|des aides|mon aide|aide pour (?:mon |ma |mes |le |la |les )?(?:logement|loyer|enfant|famille|factur|energie|travail|emploi|formation|retraite|sante)|aide a payer|obtenir (?:une|des) aides?|beneficier (?:d une|des) aides?|droit a (?:une|des) aides?|subventions?|fin de mois|reste a vivre|decouvert bancaire|besoin d argent|pas assez d argent|chomage|sans emploi|demandeur d emploi|indemnisation|allocation chomage|mes charges|mon solde|faire des economies|mettre de cote|echelonner (?:un paiement|une dette)|courrier administratif|lettre administrative|email administratif|relance administrative|rendez vous administratif|demarches administratives|trouver un emploi|recherche d emploi|financer une formation|formation professionnelle)\b/
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
  if (PLAYFUL.test(text) && !PERSONAL_MONEY.test(text)) return "offtopic"
  if (MONEY_AND_BENEFITS.test(text) || ADMIN_AND_FINANCIAL_ADVICE.test(text) || EXTRA_FINANCE_AND_ADMIN.test(text)) return "useful"
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

// When a prior zero-cost budget answer reports missing data, a natural request
// for saving ideas must not be routed to the unrelated-question fallback.
// This is a conservative local response with no provider call and no invented
// price, eligibility decision, or personal savings calculation.
export function getLocalAdvisorBudgetNoDataAdvice(
  question = "", recentHistory: unknown = [], language = "fr",
) {
  const text = normalize(question)
  if (!text || text.length > 160 || text.split(" ").length > 31 ||
    !/\b(?:solutions?|conseils?|astuces?|idees?|pistes?|proposes?|proposer|recommande(?:s|z|r)?|faire quoi|comment faire|par quoi commencer)\b/.test(text) ||
    /\b(?:rsa|apl|caf|eligib|recours|chomage|salaire|contrat|recette|gateau|meteo|planete|licorne|dragon|poeme|blague)\b/.test(text)) return null

  const history = Array.isArray(recentHistory) ? recentHistory.slice(0, 4) : []
  const prior = history[0] as Record<string, unknown> | undefined
  if (!prior || !prior.question || !prior.answer) return null
  if (!/\b(?:je ne trouve pas encore de depenses|pas encore de depenses classees|mi trouve pas ankor bann depans|aucune depense enregistree)\b/.test(normalize(prior.answer))) return null
  if (prior.source && !["local_budget_followup", "local"].includes(String(prior.source))) return null

  const subject = history.slice(1)
    .map(item => normalize((item as Record<string, unknown>)?.question || "")).join(" ")
  const fr = language !== "kreol" && language !== "kr" && language !== "cr"
  if (/\b(?:carburant|essence|gazole|diesel)\b/.test(subject)) {
    return fr
      ? "Même sans dépenses enregistrées, vous pouvez déjà réduire le coût du carburant : regroupez les déplacements pour éviter les allers-retours, comparez le prix au litre sans détour coûteux, et envisagez covoiturage ou transports en commun quand c'est possible. Avec votre kilométrage habituel et la consommation du véhicule, je pourrai ensuite estimer vos frais sans inventer de montant."
      : "Minm san dépans anrezistré, groupe out bann trajé, compare bann prix carburant san grand détour, ek regarde si covoiturage ou transport en commun lé possible. Donne out kilométraz ek consommation loto pou estime out frais."
  }
  if (/\b(?:courses?|alimentaire|alimentation)\b/.test(subject)) {
    return fr
      ? "Même sans historique, préparez une liste selon vos repas, comparez les prix au kilo pour un même format, puis vérifiez vos placards avant de racheter. Avec quelques tickets enregistrés, nous pourrons ensuite chercher les économies adaptées à vos habitudes."
      : "Minm san historique, prépare in liste selon out repas, compare prix au kilo, ek vérifie sak ou nana déjà. Avec bann tickets, nou pourra mieux cherche bann économies."
  }
  if (/\b(?:loyer|logement|energie|electricite|assurances?|abonnements?)\b/.test(subject)) {
    return fr
      ? "Sans historique, commencez par noter les factures et charges réellement payées, repérez les abonnements ou garanties en double, puis comparez les offres à conditions équivalentes. Vérifiez aussi les aides possibles sans présumer de vos droits. Nous pourrons ensuite chiffrer vos économies avec vos données."
      : "San historique, note out bann factures ek charges, vérifie les abonnements en double, ek compare bann offres équivalentes. Apré nou pourra calculer avec out vrais montants."
  }
  return fr
    ? "Même sans dépenses enregistrées, notez d'abord vos charges fixes, identifiez un achat régulier à comparer et regardez les prix à quantité équivalente. Avec quelques dépenses classées, nous pourrons ensuite personnaliser l'analyse sans inventer de montants."
    : "Minm san dépans anrezistré, note out charges fixes, compare bann prix pou minm quantité, ek classe kèk dépans. Apré nou pourra faire in analyse pli personnelle."
}

// Short, elliptical follow-ups can refer to a recent financial conversation.
// The server checks the latest persisted exchange, not a client-provided label.
export function isPotentialAdvisorFollowUp(question = "") {
  const text = normalize(question)
  return text.length <= 80 && text.split(" ").length <= 8 &&
    /^(?:et pourquoi|et combien|et comment|et ensuite|et maintenant|et pour moi|comment faire|comment je fais|combien|pourquoi|c est possible|quelles conditions|pour mon cas|et si|je peux faire quoi|qu est ce que je fais|comment proceder|merci pour ces aides)\b/.test(text)
}


// Only app navigation and existing interface features; not eligibility decisions.
const APP_NAV_INTENT = /\b(?:ou (?:est|sont|se trouve|trouver|retrouver|voir|consulter|ouvrir)|comment (?:acceder|ouvrir|consulter|retrouver|aller|scanner|numeriser|creer|faire|modifier)|je (?:ne )?(?:trouve|retrouve|vois) (?:pas|plus)|c est ou|dans quel(?:le)? (?:rubrique|page|menu))\b/
const APP_NAV_EXCLUDE = /\b(?:calcul(?:e|er|es|ees)?|montant|eligible|eligibilite|conditions?|combien|pourquoi|estimer|simulation|pour mon cas|pour ma situation|dois je|ai je droit)\b/
export function getLocalAdvisorAppGuide(question = "", language = "fr", mode = "general") {
  const text = normalize(question)
  if (mode !== "general" || !text || text.length > 220) return null
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
      questions: ["c est quoi un budget", "c est quoi le budget", "qu est ce qu un budget", "qu est ce que le budget", "definition du budget"],
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
      questions: ["comment faire un budget", "comment preparer un budget", "comment construire un budget"],
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
  if (!/^(?:je trouve (?:que )?|je constate que |j ai remarque que |j ai l impression que |c est |ca devient |l |le |la |les |mon |ma |mes )/.test(text)) return null
  if (!/\b(?:cher|chere|chers|cheres|hors de prix|coute cher|coutent cher|revient cher|reviennent cher|trop cher|trop chere|flambe)\b/.test(text)) return null
  if (/\b(?:pas cher|pas chere|moins cher|moins chere|bon marche|plus abordable|raisonnable)\b/.test(text)) return null
  if (/\b(?:pourquoi|comment|combien|quel|quels|quelle|quelles|compare|comparer|comparaison|calcule|calculer|prevoir|estimer|montant|prix aujourd hui|prix actuel|prix du litre|aujourd hui|cette semaine|ou trouver|que faire)\b/.test(text)) return null
  const fr = language !== "kreol"
  if (/\b(?:carburant|essence|gazole|diesel|plein d essence)\b/.test(text)) {
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
