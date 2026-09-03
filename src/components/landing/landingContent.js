import {
  PLAN_FEATURE_STATUS,
  PLAN_IDS,
  PLAN_NAMES,
  PLAN_PRICES,
  PLAN_PUBLIC_SCAN_LABELS,
  PUBLIC_PLAN_CARDS,
} from "../../config/plans"

export const LANDING_LANGUAGES = {
  fr: "fr",
  kr: "kr",
}

export const LANDING_DEMO_DATA = {
  revenues: "3 450 €",
  expenses: "2 180 €",
  remaining: "1 270 €",
  score: "82",
  groceries: "742 €",
  latestTicket: "186,40 €",
  increase: "+118 €",
  listItems: ["Riz", "Lait", "Yaourts", "Poulet", "Lessive"],
}

// Les plans restent disponibles pour la page dédiée aux offres. La home ne les
// affiche volontairement pas : elle renvoie vers cette page avec un message
// simple, « Gratuit pour commencer ».
const PLAN_COPY = {
  fr: {
    [PLAN_IDS.free]: {
      name: PLAN_NAMES[PLAN_IDS.free], cta: "Créer mon compte",
      intro: "Pour découvrir BudgetKazPéi et commencer à suivre l'essentiel.",
      items: ["Sans publicité", "Budget essentiel", "Revenus et dépenses", "Statistiques simples", "Aides essentielles et Bons plans locaux", PLAN_PUBLIC_SCAN_LABELS[PLAN_IDS.free], "Conseiller BudgetKazPéi à découvrir avec Premium"],
    },
    [PLAN_IDS.premium]: {
      name: PLAN_NAMES[PLAN_IDS.premium], cta: "Découvrir Premium",
      intro: "BudgetKazPéi me conseille au quotidien.",
      items: ["Tout le Gratuit", PLAN_PUBLIC_SCAN_LABELS[PLAN_IDS.premium], "Historique et statistiques avancées", "Alertes budget et export PDF", "Conseiller BudgetKazPéi — utilisation limitée"],
    },
    [PLAN_IDS.premiumPlus]: {
      name: PLAN_NAMES[PLAN_IDS.premiumPlus], cta: "Découvrir Premium+",
      intro: "BudgetKazPéi m'accompagne dans mes actions concrètes.",
      items: ["Tout le Premium", PLAN_PUBLIC_SCAN_LABELS[PLAN_IDS.premiumPlus], "Conseiller BudgetKazPéi+ — utilisation illimitée", "Accompagnement avancé des démarches", "Dossiers, courriers, emails, relances et rendez-vous", "Compréhension des refus et préparation des recours"],
    },
  },
  kr: {
    [PLAN_IDS.free]: {
      name: "Gratis", cta: "Kré mon kont",
      intro: "Pou dékouv BudgetKazPéi ek koumans swiv sak lé esansyèl.",
      items: ["San piblisité", "Bidjé esansyèl", "Larzan i rantre ek dépans", "Statistik senp", "Èd esansyèl ek bann Bon Plan lokal", "Aksé pou dékouv scanner-la", "Konseyé BudgetKazPéi pou dékouv dann Premium"],
    },
    [PLAN_IDS.premium]: {
      name: "Premium", cta: "Dékouv Premium",
      intro: "BudgetKazPéi i konsey amwin dann mon kotidien.",
      items: ["Tout sak lé dann Gratis", "10 scans par mwa", "Istorik ek statistik avansé", "Alèrt bidjé ek èksport PDF", "Konseyé BudgetKazPéi — itilizasion limité"],
    },
    [PLAN_IDS.premiumPlus]: {
      name: "Premium+", cta: "Dékouv Premium+",
      intro: "BudgetKazPéi i akonpagn amwin dann mon bann aksion konkrè.",
      items: ["Tout sak lé dann Premium", "Scans san limit", "Konseyé BudgetKazPéi+ — itilizasion san limit", "Lakonpagnman avansé pou bann demars", "Dosyé, kourrié, email, relans ek randévou", "Konprann bann refi ek prépar bann rekour"],
    },
  },
}

const CONTENT = {
  fr: {
    seo: {
      title: "BudgetKazPéi — Budget, courses, aides et bons plans à La Réunion",
      description: "Suivez votre budget, vos courses, vos aides et vos démarches avec une application pensée pour le quotidien à La Réunion.",
      ogTitle: "BudgetKazPéi — Budget, courses, aides et bons plans à La Réunion",
      ogDescription: "Une application locale pour mieux gérer son pouvoir d'achat et son quotidien.",
    },
    header: {
      skipLink: "Aller au contenu", homeAriaLabel: "Accueil BudgetKazPéi", logoAlt: "Logo BudgetKazPéi",
      mainNavigationAriaLabel: "Navigation principale", mobileNavigationAriaLabel: "Navigation mobile",
      menuDialogAriaLabel: "Menu BudgetKazPéi", menu: "Menu", close: "Fermer", closeMenuAriaLabel: "Fermer le menu",
      login: "Connexion", register: "Créer mon compte", dashboard: "Accéder à BudgetKazPéi",
      languageButton: "Kréol", languageAriaLabel: "Afficher la landing page en créole réunionnais",
    },
    navItems: [
      { label: "Fonctionnalités", href: "#fonctionnalites" },
      { label: "Conseiller", href: "#conseiller" },
      { label: "Bons plans", href: "#bons-plans" },
    ],
    summaryAriaLabel: "Les cinq univers BudgetKazPéi", summaryItems: [["01", "Mon budget"], ["02", "Mes courses"], ["03", "Mes aides"], ["04", "Mon Conseiller"], ["05", "Bons plans locaux"]],
    hero: {
      eyebrow: "BudgetKazPéi · La Réunion",
      title: "Votre budget, vos courses et vos aides. Au même endroit.",
      lead: "Suivez vos dépenses, scannez vos tickets, préparez vos courses et trouvez des aides utiles à La Réunion.",
      mobileLead: "Budget, tickets, listes de courses, aides et bons plans utiles à La Réunion.",
      localLine: "Pensé pour La Réunion · Français & kréol réunionnais",
      mobileLocalLine: "Français · Kréol réunionnais",
      primaryGuest: "Créer mon compte gratuitement", primaryAuthenticated: "Accéder à BudgetKazPéi",
      secondary: "Découvrir l'application",
    },
    heroDemo: {
      ariaLabel: "Aperçu du vrai tableau de bord BudgetKazPéi", appLabel: "Tableau de bord", monthLabel: "Août 2026",
      greeting: "Bonjour", scoreLabel: "Score BudgetKazPéi", score: "82", scoreStatus: "Correct",
      balanceLabel: "Solde du mois", balance: LANDING_DEMO_DATA.remaining, balanceMeta: "Solde disponible",
      stats: [["Revenus", LANDING_DEMO_DATA.revenues], ["Dépenses", LANDING_DEMO_DATA.expenses], ["Reste", LANDING_DEMO_DATA.remaining]],
      categoryTitle: "Courses du mois", categoryLabel: `Hausse vs mois précédent ${LANDING_DEMO_DATA.increase}`, categoryValue: LANDING_DEMO_DATA.groceries,
      recentTitle: "Derniers mouvements", transactions: [["Dernier ticket", `− ${LANDING_DEMO_DATA.latestTicket}`, "Aujourd'hui"], ["Revenu", `+ ${LANDING_DEMO_DATA.revenues}`, "Ce mois"]], viewAll: "Voir tout",
      signals: [
        { type: "scan", label: "Ticket analysé", value: LANDING_DEMO_DATA.latestTicket },
        { type: "list", label: "Liste de courses", value: "Prête à partager" },
        { type: "advisor", label: "Conseiller", value: "Hausse expliquée" },
      ],
      listCard: { title: "Ma liste de courses", items: LANDING_DEMO_DATA.listItems, action: "Partager la liste", meta: "WhatsApp · Messages · autres applications" },
      caption: "Produit BudgetKazPéi · aperçu du tableau de bord",
    },
    features: {
      eyebrow: "Votre quotidien, simplifié", title: "Tout ce qu’il vous faut, au même endroit.",
      intro: "Budget, courses, aides et démarches réunis dans une application claire, pensée pour le quotidien à La Réunion.", ariaLabel: "Les fonctionnalités de BudgetKazPéi",
      pillars: [
        { eyebrow: "Mon budget", title: "Gardez votre budget sous contrôle.", answer: "Voyez en un coup d’œil où part votre argent.", points: ["Alimentaire · 33 %", "Logement · 51 %"], tone: "cream", icon: "budget", visual: "budget", fragment: { ariaLabel: "Répartition des dépenses", title: "Répartition des dépenses", hint: "", categories: [{ label: "alimentaire", percent: "33 %", amount: "346,54 €", color: "#ff7012" }, { label: "logement", percent: "51 %", amount: "529,50 €", color: "#3eb7ed" }, { label: "énergie", percent: "11 %", amount: "115,00 €", color: "#ffd04a" }] } },
        { eyebrow: "Mes courses", title: "Préparer ses courses devient plus simple.", answer: "Tickets et liste de courses, au même endroit.", points: ["Liste de courses", "Partage rapide"], tone: "blue", icon: "shopping", visual: "courses", fragment: { ticketLabel: "Dernier ticket", ticketValue: "186,40 €", listTitle: "Ma liste de courses", listItems: ["Riz", "Lait", "Yaourts", "Poulet", "Lessive"], itemStatus: "À prévoir", share: "Partager la liste", shareMeta: "WhatsApp · Messages · autres applications", itemCountSuffix: "articles" } },
        { title: "Mes aides & démarches", answer: "Repérez les aides utiles et suivez vos démarches.", points: ["Documents", "Prochaine action"], tone: "lavender", icon: "aides", visual: "aides", fragment: { steps: ["À vérifier", "Documents", "Envoyé"], activeStep: 1, nextLabel: "Prochaine action", next: "Vérifier les conditions", nextMeta: "BudgetKazPéi vous aide à préparer, l'organisme décide." } },
        { title: "Mon Conseiller BudgetKazPéi", answer: "Un Conseiller qui s'appuie sur les informations disponibles dans l'application.", points: ["Comprendre", "Avancer"], tone: "sage", icon: "assistant", visual: "advisor" },
      ],
    },
    advisor: {
      eyebrow: "Conseiller BudgetKazPéi", title: "Des réponses utiles pour avancer.",
      intro: "Le conseiller s’appuie sur les informations disponibles dans BudgetKazPéi pour vous aider dans vos démarches.",
      conversation: {
        user: "Quelles aides existent pour les activités sportives pour mes enfants\u00a0?",
        assistant: "BudgetKazPéi peut vous aider à repérer les aides qui peuvent concerner vos enfants : Pass’Sport, aides de la CAF et aides locales selon votre commune. Vérifiez ensuite votre éligibilité auprès des organismes concernés et préparez votre démarche à partir des sources officielles.",
      },
      phoneAlt: "Conseiller BudgetKazPéi affiché sur le smartphone de l'application",
      contextLabels: ["Budget", "Courses", "Aides", "Démarches"], contextAriaLabel: "Contexte disponible dans BudgetKazPéi",
    },
    localDeals: {
      promotions: {
        eyebrow: "Promos près de chez vous", title: "Les promotions près de chez vous.", text: "Retrouvez les promotions disponibles autour de votre commune.",
        cards: [
          { icon: "catalog", badge: "Près de chez vous", title: "Promotions du moment", text: "Consultez les offres disponibles dans BudgetKazPéi.", meta: "Selon les données disponibles dans votre secteur", tone: "peach" },
          { icon: "shopping", badge: "Recherche rapide", title: "Produit, marque ou enseigne", text: "Trouvez plus vite une promotion qui vous intéresse.", meta: "Recherche et filtres dans l’application", tone: "blue" },
        ],
      },
      localOffers: {
        eyebrow: "Autour de vous", title: "Les bons plans autour de vous.", text: "Repérez commerces, services et bons plans dans votre secteur.", categoriesAriaLabel: "Types d’offres locales",
        categories: [
          { icon: "commerces", label: "Commerces" }, { icon: "artisans", label: "Artisans" }, { icon: "restaurants", label: "Restaurants & snacks" }, { icon: "services", label: "Services" },
        ],
      },
      family: {
        eyebrow: "Sorties & famille", title: "Des idées de sorties en famille.", text: "Événements et activités à découvrir près de chez vous.",
        event: { label: "Événement", title: "Exposition Les Engagés du sucre", location: "Musée Stella Matutina · Saint-Leu", period: "15 novembre 2025 → 4 avril 2027" },
        indicatorsAriaLabel: "Loisirs disponibles", indicators: [{ value: "24", label: "Événements à venir" }, { value: "80", label: "Activités disponibles toute l’année" }],
        tags: ["Sortie à petit budget", "Activité à repérer", "Gratuit ou accessible"],
      },
    },
    finalCta: {
      eyebrow: "Pensé pour La Réunion", title: "Le quotidien péi, au même endroit.",
      text: "Budget, courses, aides et bons plans dans une application pensée pour La Réunion.",
      languageLine: "Français & Kréol réunionnais", freeLabel: "Gratuit pour commencer",
      primaryGuest: "Créer mon compte gratuitement", primaryAuthenticated: "Accéder à BudgetKazPéi", secondary: "Découvrir les offres",
    },
    pricing: {
      eyebrow: "Offres", title: "Des offres pour aller plus loin.", intro: "Commencez avec l'essentiel, puis découvrez les offres dédiées.",
      soonLabel: "Bientôt", includedAriaLabel: "Inclus", lockedAriaLabel: "Disponible avec Premium", unavailableAriaLabel: "Non inclus", dashboard: "Accéder à BudgetKazPéi",
    },
    faq: {
      eyebrow: "FAQ", title: "Questions fréquentes",
      items: [["Est-ce gratuit ?", "Oui. L'offre gratuite permet de découvrir BudgetKazPéi et de suivre l'essentiel."], ["Les aides sont-elles garanties ?", "Non. La décision finale appartient toujours à l'organisme officiel."], ["Que faire si un ticket est mal lu ?", "Vous pouvez reprendre la photo, corriger les informations ou ajouter la dépense manuellement."]],
    },
    footer: { privacy: "Confidentialité", legalNotices: "Mentions légales", terms: "Conditions", deleteAccount: "Suppression du compte", contact: "Contact", navigationAriaLabel: "Liens de pied de page" },
  },
  kr: {
    seo: {
      title: "BudgetKazPéi — Bidjé, courses, èd ek Bon Plan La Rényon",
      description: "Swiv out bidjé, out courses, bann èd ek bann demars avek in aplikasyon pansé pou la vi La Rényon.",
      ogTitle: "BudgetKazPéi — Bidjé, courses, èd ek Bon Plan La Rényon", ogDescription: "In aplikasyon lokal pou aide aou gère out larzan ek out kotidien.",
    },
    header: {
      skipLink: "Alé dann konteni", homeAriaLabel: "Lakèy BudgetKazPéi", logoAlt: "Logo BudgetKazPéi",
      mainNavigationAriaLabel: "Navigasyon prinsipal", mobileNavigationAriaLabel: "Navigasyon mobil", menuDialogAriaLabel: "Menu BudgetKazPéi",
      menu: "Menu", close: "Fèrmé", closeMenuAriaLabel: "Fèrm menu-la", login: "Koneksyon", register: "Kré mon kont", dashboard: "Alé dann BudgetKazPéi",
      languageButton: "Français", languageAriaLabel: "Afficher la landing page en français",
    },
    navItems: [{ label: "Fonksionalité", href: "#fonctionnalites" }, { label: "Konseyé", href: "#conseiller" }, { label: "Bon Plan", href: "#bons-plans" }],
    summaryAriaLabel: "Senk l'univers BudgetKazPéi", summaryItems: [["01", "Mon bidjé"], ["02", "Mon bann courses"], ["03", "Mon bann èd"], ["04", "Mon Konseyé"], ["05", "Bon Plan lokal"]],
    hero: {
      eyebrow: "BudgetKazPéi · La Rényon", title: "Out bidjé, out courses ek out bann èd. Tout dann in sèl landrwa.",
      lead: "Swiv out dépans, scan out bann tiké, prépar out courses ek trouv bann èd itil La Rényon.", mobileLead: "Bidjé, tiké, listes courses, bann èd ek bann Bon Plan itil La Rényon.", localLine: "Fait pou La Rényon · Français ek kréol rényoné", mobileLocalLine: "Français · Kréol rényoné",
      primaryGuest: "Kré mon kont gratis", primaryAuthenticated: "Alé dann BudgetKazPéi", secondary: "Dékouv l'application",
    },
    heroDemo: {
      ariaLabel: "Egzanp éditorial tablo débor BudgetKazPéi", appLabel: "Tablo débor", monthLabel: "Out 2026", greeting: "Bonzour",
      scoreLabel: "Score BudgetKazPéi", score: "82", scoreStatus: "Korek", balanceLabel: "Larzan i reste", balance: "1 240 €", balanceMeta: "Larzan disponib",
      stats: [["Larzan rantre", "+ 1 850 €"], ["Dépans", "620 €"], ["Reste", "1 240 €"]], categoryTitle: "Dépans par kategori", categoryLabel: "Manzé", categoryValue: "280 €",
      recentTitle: "Dernyé mouvman", transactions: [["Courses", "− 84,20 €", "Zordi"], ["Larzan rantre", "+ 1 850 €", "Lo mwa-la"]], viewAll: "Gad tout",
      signals: [
        { type: "scan", label: "Tiké analizé", value: LANDING_DEMO_DATA.latestTicket },
        { type: "advisor", label: "Konseyé", value: "In aksyon itil trouvé" },
      ],
      caption: "Produit BudgetKazPéi · egzanp tablo débor",
    },
    features: {
      eyebrow: "Out kotidien, simplifié", title: "Tout sak ou néna besoin, dann in sèl landrwa.", intro: "Bidjé, courses, èd ek demars rasanblé dann in aplikasyon klèr, pansé pou la vi La Rényon.", ariaLabel: "Bann fonksionalité BudgetKazPéi",
      pillars: [
        { eyebrow: "Mon bidjé", title: "Gard out bidjé anba kontrol.", answer: "Gad an in sèl kou d’œil kot out larzan i sava.", points: ["Manzé · 33 %", "Lozman · 51 %"], tone: "cream", icon: "budget", visual: "budget", fragment: { ariaLabel: "Koman dépans i reparti", title: "Koman dépans i reparti", hint: "", categories: [{ label: "manzé", percent: "33 %", amount: "346,54 €", color: "#ff7012" }, { label: "lozman", percent: "51 %", amount: "529,50 €", color: "#3eb7ed" }, { label: "énerzi", percent: "11 %", amount: "115,00 €", color: "#ffd04a" }] } },
        { eyebrow: "Mon bann courses", title: "Prépar out courses i devien pli senp.", answer: "Tiké ek list courses, dann in sèl landrwa.", points: ["List courses", "Partaz vit"], tone: "blue", icon: "shopping", visual: "courses", fragment: { ticketLabel: "Dernyé tiké", ticketValue: "84,20 €", listTitle: "Mon list courses", listItems: ["Riz", "Lait", "Yaourts", "Poulet", "Lessive"], itemStatus: "Pou prévoir", share: "Partaz la list", shareMeta: "WhatsApp · Messages · bann ot aplikasyon", itemCountSuffix: "artik" } },
        { title: "Mon bann èd ek demars", answer: "Repèr bann èd itil ek suiv out bann demars.", points: ["Dokiman", "Proshin aksyon"], tone: "lavender", icon: "aides", visual: "aides", fragment: { steps: ["A vérifier", "Dokiman", "Envoyé"], activeStep: 1, nextLabel: "Proshin aksyon", next: "Vérifié bann kondisyon", nextMeta: "BudgetKazPéi i aide aou prépar, organisme-la i désid." } },
        { title: "Mon Konseyé BudgetKazPéi", answer: "In Konseyé i servi bann ransèyman disponib dann aplikasyon-la.", points: ["Konpran", "Avansé"], tone: "sage", icon: "assistant", visual: "advisor" },
      ],
    },
    advisor: {
      eyebrow: "Konseyé BudgetKazPéi", title: "Bann répons itil pou avansé.", intro: "Li servi bann ransèyman disponib dann BudgetKazPéi pou aide aou dann out bann demars.",
      phoneAlt: "Konseyé BudgetKazPéi affiché dann smartphone aplikasyon-la", conversation: { user: "Kèl èd i existe pou bann aktivité sportif pou mon bann marmay\u00a0?", assistant: "BudgetKazPéi i pé aide aou trouv bann èd pou out bann marmay : Pass’Sport, bann èd CAF ek bann èd lokal selon out kominn. Apré, vérifié si ou lé éligib kot bann organismes concerné ek prépar out demars avek bann sous officiel." },
      contextLabels: ["Bidjé", "Courses", "Èd", "Demars"], contextAriaLabel: "Kontèks disponib dann BudgetKazPéi",
    },
    localDeals: {
      promotions: {
        eyebrow: "Promosyon près koté ou", title: "Bann promosyon près koté ou.", text: "Retrouv bann promosyon disponib otour out kominn.",
        cards: [
          { icon: "catalog", badge: "Près koté ou", title: "Promosyon dann moman", text: "Gad bann lof disponib dann BudgetKazPéi.", meta: "Selon bann donné disponib dann out sektèr", tone: "peach" },
          { icon: "shopping", badge: "Rod vit", title: "Produit, mark ou enseigne", text: "Trouv pli vit in promosyon ki intéresse aou.", meta: "Rod ek filt dann aplikasyon-la", tone: "blue" },
        ],
      },
      localOffers: {
        eyebrow: "Otour ou", title: "Bann Bon Plan otour ou.", text: "Repèr komers, servis ek Bon Plan dann out sektèr.", categoriesAriaLabel: "Bann kalite lof lokal",
        categories: [
          { icon: "commerces", label: "Komers" }, { icon: "artisans", label: "Artizan" }, { icon: "restaurants", label: "Restoran ek snack" }, { icon: "services", label: "Servis" },
        ],
      },
      family: {
        eyebrow: "Sorti ek famiy", title: "Bann lidé sorti an famiy.", text: "Evennman ek aktivité pou dékouv près koté ou.",
        event: { label: "Evennman", title: "Exposition Les Engagés du sucre", location: "Musée Stella Matutina · Saint-Leu", period: "15 novanm 2025 → 4 avril 2027" },
        indicatorsAriaLabel: "Loisir disponib", indicators: [{ value: "24", label: "Evennman pou vini" }, { value: "80", label: "Aktivité disponib tout l’année" }],
        tags: ["Sorti ti bidjé", "Aktivité pou repéré", "Gratis ou aksesib"],
      },
    },
    finalCta: {
      eyebrow: "Pensé pou La Rényon", title: "La vi péi, dann in sèl landrwa.", text: "Bidjé, courses, èd ek Bon Plan dann in aplikasyon pansé pou La Rényon.", languageLine: "Français ek Kréol rényoné", freeLabel: "Gratis pou koumansé", primaryGuest: "Kré mon kont gratis", primaryAuthenticated: "Alé dann BudgetKazPéi", secondary: "Dékouv bann lof",
    },
    pricing: {
      eyebrow: "Bann lof", title: "Bann lof pou al pli loin.", intro: "Koumans avek l'esansyèl, apré dékouv bann lof dédié.", soonLabel: "Biento", includedAriaLabel: "Inclus", lockedAriaLabel: "Disponib avek Premium", unavailableAriaLabel: "Pa inclus", dashboard: "Alé dann BudgetKazPéi",
    },
    faq: {
      eyebrow: "FAQ", title: "Kestion souvan", items: [["Eske lé gratis ?", "Wi. Lof gratis i permet dékouv BudgetKazPéi ek suiv sak lé esansyèl."], ["Bann èd lé garanti ?", "Non. Lo organisme officiel i pran désizion final."], ["Kosa fé si in tiké lé mal lu ?", "Ou pé repran foto-la, korij bann ransèyman ou azout dépans-la a la min."]],
    },
    footer: { privacy: "Konfidansyalité", legalNotices: "Mansion légal", terms: "Kondisyon", deleteAccount: "Suprim mon kont", contact: "Kontakt", navigationAriaLabel: "Bann lien pié paz" },
  },
}

function normalizeLandingLanguage(language) {
  return language === LANDING_LANGUAGES.kr ? LANDING_LANGUAGES.kr : LANDING_LANGUAGES.fr
}

function buildPricingPlans(language) {
  const normalizedLanguage = normalizeLandingLanguage(language)
  const copyByPlan = PLAN_COPY[normalizedLanguage]

  return PUBLIC_PLAN_CARDS.map(plan => {
    const copy = copyByPlan[plan.id]
    return {
      ...plan,
      name: copy?.name || PLAN_NAMES[plan.id], price: PLAN_PRICES[plan.id], cta: copy?.cta || plan.cta, intro: copy?.intro || plan.intro,
      items: plan.items.map((item, index) => ({ ...item, text: copy?.items?.[index] || item.text })),
    }
  })
}

export function getLandingContent(language = LANDING_LANGUAGES.fr) {
  const normalizedLanguage = normalizeLandingLanguage(language)
  const content = CONTENT[normalizedLanguage]
  return { ...content, language: normalizedLanguage, pricing: { ...content.pricing, plans: buildPricingPlans(normalizedLanguage) } }
}

const frenchContent = getLandingContent(LANDING_LANGUAGES.fr)

// Exports historiques conservés pour la page offres et les éventuels imports.
export const navItems = frenchContent.navItems
export const heroSignals = frenchContent.heroDemo.transactions
export const pillars = frenchContent.features.pillars
export const productTabs = []
export const localDealCategories = frenchContent.localDeals.localOffers.categories.map(category => category.label)
export const localDealPrinciples = frenchContent.localDeals.family.tags
export const pricingPlans = frenchContent.pricing.plans
export const faqs = frenchContent.faq.items

export { PLAN_FEATURE_STATUS }
