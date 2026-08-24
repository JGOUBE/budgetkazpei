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

// Les plans restent disponibles pour la page dédiée aux offres. La home ne les
// affiche volontairement pas : elle renvoie vers cette page avec un message
// simple, « Gratuit pour commencer ».
const PLAN_COPY = {
  fr: {
    [PLAN_IDS.free]: {
      name: PLAN_NAMES[PLAN_IDS.free], cta: "Créer mon compte",
      intro: "Pour découvrir BudgetKazPéi et commencer à suivre l'essentiel.",
      items: ["Budget essentiel", "Revenus et dépenses", "Statistiques simples", "Aides essentielles et Bons plans locaux", PLAN_PUBLIC_SCAN_LABELS[PLAN_IDS.free], "Conseiller BudgetKazPéi à découvrir avec Premium"],
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
      items: ["Bidjé esansyèl", "Larzan i rantre ek dépans", "Statistik senp", "Èd esansyèl ek bann Bon Plan lokal", "Aksé pou dékouv scanner-la", "Konseyé BudgetKazPéi pou dékouv dann Premium"],
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
    hero: {
      eyebrow: "BudgetKazPéi · La Réunion",
      title: "Votre budget, vos courses et vos aides. Au même endroit.",
      lead: "Suivez vos dépenses, scannez vos tickets, trouvez des aides et profitez des bons plans utiles à La Réunion.",
      localLine: "Pensé pour La Réunion · Français & kréol réunionnais",
      primaryGuest: "Créer mon compte gratuitement", primaryAuthenticated: "Accéder à BudgetKazPéi",
      secondary: "Découvrir l'application",
    },
    heroDemo: {
      ariaLabel: "Aperçu éditorial du tableau de bord BudgetKazPéi", appLabel: "Tableau de bord", monthLabel: "Août 2026",
      greeting: "Bonjour", scoreLabel: "Score BudgetKazPéi", score: "82", scoreStatus: "Correct",
      balanceLabel: "Solde du mois", balance: "1 240 €", balanceMeta: "Solde disponible",
      stats: [["Revenus", "+ 1 850 €"], ["Dépenses", "620 €"], ["Reste", "1 240 €"]],
      categoryTitle: "Dépenses par catégorie", categoryLabel: "Alimentaire", categoryValue: "280 €",
      recentTitle: "Derniers mouvements", transactions: [["Courses", "− 84,20 €", "Aujourd'hui"], ["Revenu", "+ 1 850 €", "Ce mois"]], viewAll: "Voir tout",
      signals: [
        { type: "budget", label: "Budget du mois", value: "1 240 € disponibles" },
        { type: "scan", label: "Ticket analysé", value: "8 articles reconnus" },
        { type: "advisor", label: "Conseiller", value: "Une action utile identifiée" },
      ],
      caption: "Produit BudgetKazPéi · aperçu du tableau de bord",
    },
    features: {
      eyebrow: "Les quatre piliers", title: "Tout votre quotidien dans une seule application.",
      intro: "Un même endroit pour comprendre, agir et avancer.",
      pillars: [
        { title: "Mon budget", answer: "Revenus, dépenses, solde, alertes et statistiques.", points: ["Solde du mois", "Dépenses classées"], tone: "cream", icon: "budget", visual: "budget" },
        { title: "Mes courses", answer: "Tickets de caisse, achats, habitudes de consommation et courses intelligentes.", points: ["Tickets vérifiables", "Historique utile"], tone: "blue", icon: "shopping", visual: "courses" },
        { title: "Mes aides & démarches", answer: "Aides possibles, informations utiles et suivi des démarches.", points: ["Documents", "Prochaine action"], tone: "lavender", icon: "aides", visual: "aides" },
        { title: "Mon Conseiller BudgetKazPéi", answer: "Un Conseiller qui s'appuie sur les informations disponibles dans l'application.", points: ["Comprendre", "Avancer"], tone: "sage", icon: "assistant", visual: "advisor" },
      ],
    },
    advisor: {
      eyebrow: "Conseiller BudgetKazPéi", title: "Un Conseiller qui connaît votre BudgetKazPéi.",
      intro: "Il s'appuie sur les informations disponibles dans l'application pour vous aider à comprendre votre situation et avancer dans votre quotidien.",
      conversation: {
        user: "Où part mon argent ce mois-ci ?",
        assistant: "Vos courses représentent votre plus forte hausse ce mois-ci. Je peux vous montrer les catégories concernées.",
        followup: "Voir les catégories concernées",
      },
      chatTitle: "Conseiller BudgetKazPéi", chatMeta: "À partir de vos informations disponibles",
      questions: ["Quelles aides existent pour le sport de mes enfants ?", "Peux-tu m'aider à préparer cette démarche ?"],
      contextLabels: ["Budget", "Courses", "Aides", "Démarches"],
      cta: "Découvrir les offres",
    },
    localDeals: {
      eyebrow: "Bons plans locaux", title: "Les bons plans près de chez vous",
      intro: "Des informations utiles pour le budget du quotidien, sans fausse carte ni promesse de prix garanti.",
      promoTitle: "Les promos du moment", promoText: "Retrouvez les promotions en cours et les catalogues des enseignes près de chez vous.",
      promoCards: [
        { badge: "PROMO DU MOMENT", title: "Produits du quotidien", text: "Disponible dans votre secteur", meta: "Prix · période · enseigne dans l'application", tone: "peach" },
        { badge: "CATALOGUE", title: "Catalogue de la semaine", text: "Enseignes proches de chez vous", meta: "À consulter dans BudgetKazPéi", tone: "blue" },
      ],
      familyTitle: "Sorties et bons plans famille", familyText: "Des idées de sorties et activités à repérer pour profiter de La Réunion en famille sans faire exploser son budget.",
      familyTags: ["Sortie à petit budget", "Activité à repérer", "Gratuit ou accessible"], localLabel: "Aussi dans l'univers local",
      localTags: ["Commerces", "Artisans", "Restaurants & snacks", "Services"],
    },
    finalCta: {
      eyebrow: "Le quotidien péi, au même endroit", title: "Pensé ici, pour le quotidien péi.",
      text: "Budget, courses, aides, démarches et bons plans réunis dans une application conçue pour le quotidien à La Réunion.",
      languageLine: "Français · Kréol réunionnais", freeLabel: "Gratuit pour commencer",
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
    footer: { privacy: "Confidentialité", terms: "Conditions", deleteAccount: "Suppression du compte", navigationAriaLabel: "Liens de pied de page" },
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
    hero: {
      eyebrow: "BudgetKazPéi · La Rényon", title: "Out bidjé, out courses ek out bann èd. Tout dann in sèl landrwa.",
      lead: "Swiv out dépans, scan out bann tiké, trouv bann èd ek profite bann Bon Plan itil La Rényon.", localLine: "Fait pou La Rényon · Français ek kréol rényoné",
      primaryGuest: "Kré mon kont gratis", primaryAuthenticated: "Alé dann BudgetKazPéi", secondary: "Dékouv l'application",
    },
    heroDemo: {
      ariaLabel: "Egzanp éditorial tablo débor BudgetKazPéi", appLabel: "Tablo débor", monthLabel: "Out 2026", greeting: "Bonzour",
      scoreLabel: "Score BudgetKazPéi", score: "82", scoreStatus: "Korek", balanceLabel: "Larzan i reste", balance: "1 240 €", balanceMeta: "Larzan disponib",
      stats: [["Larzan rantre", "+ 1 850 €"], ["Dépans", "620 €"], ["Reste", "1 240 €"]], categoryTitle: "Dépans par kategori", categoryLabel: "Manzé", categoryValue: "280 €",
      recentTitle: "Dernyé mouvman", transactions: [["Courses", "− 84,20 €", "Zordi"], ["Larzan rantre", "+ 1 850 €", "Lo mwa-la"]], viewAll: "Gad tout",
      signals: [
        { type: "budget", label: "Bidjé pou lo mwa", value: "1 240 € disponib" },
        { type: "scan", label: "Tiké analizé", value: "8 produi rekonèt" },
        { type: "advisor", label: "Konseyé", value: "In aksyon itil trouvé" },
      ],
      caption: "Produit BudgetKazPéi · egzanp tablo débor",
    },
    features: {
      eyebrow: "Katri pilier", title: "Tout out kotidien dann in sèl aplikasyon.", intro: "In sèl landrwa pou konpran, agir ek avansé.",
      pillars: [
        { title: "Mon bidjé", answer: "Larzan i rantre, dépans, larzan i reste, alèrt ek statistik.", points: ["Larzan i reste", "Dépans klasé"], tone: "cream", icon: "budget", visual: "budget" },
        { title: "Mon bann courses", answer: "Bann tiké, bann achat, labitid d'achat ek courses entélizan.", points: ["Tiké vérifiab", "Istorik itil"], tone: "blue", icon: "shopping", visual: "courses" },
        { title: "Mon bann èd ek demars", answer: "Bann èd posib, ransèyman itil ek swiv out bann demars.", points: ["Dokiman", "Proshin aksyon"], tone: "lavender", icon: "aides", visual: "aides" },
        { title: "Mon Konseyé BudgetKazPéi", answer: "In Konseyé i servi bann ransèyman disponib dann aplikasyon-la.", points: ["Konpran", "Avansé"], tone: "sage", icon: "assistant", visual: "advisor" },
      ],
    },
    advisor: {
      eyebrow: "Konseyé BudgetKazPéi", title: "In Konseyé i koné out BudgetKazPéi.", intro: "Li servi bann ransèyman disponib dann aplikasyon-la pou aide aou konpran out sitiasyon ek avans dann out kotidien.",
      conversation: { user: "Kot mon larzan i sava sa mwa-la ?", assistant: "Out courses i représente out pli for ogmantasyon sa mwa-la. Mi pé montre aou bann kategori concerné.", followup: "Gad bann kategori concerné" },
      chatTitle: "Konseyé BudgetKazPéi", chatMeta: "A partir bann ransèyman disponib",
      questions: ["Kèl èd i existe pou lo sport mon bann marmay ?", "Ou pé aide amwin prépar sa demars-la ?"], contextLabels: ["Bidjé", "Courses", "Èd", "Demars"], cta: "Dékouv bann lof",
    },
    localDeals: {
      eyebrow: "Bon Plan lokal", title: "Bann Bon Plan près koté ou", intro: "Bann ransèyman itil pou lo bidjé kotidien, san fausse kart ni promès pri garanti.",
      promoTitle: "Bann promosyon dann moman", promoText: "Retrouv bann promosyon an kour ek bann katalog bann ensegn près koté ou.",
      promoCards: [
        { badge: "PROMO DANN MOMAN", title: "Egzanp ensegn", text: "Produi kotidien", meta: "Donnée démonstrasyon · La Rényon", tone: "peach" },
        { badge: "KATALOG DISPONIB", title: "Egzanp katalog", text: "Périod ek landrwa pou vérifié", meta: "Gad lo katalog dann aplikasyon-la", tone: "blue" },
      ],
      familyTitle: "👨‍👩‍👧‍👦 Sorti ek Bon Plan famiy", familyText: "Bann lidé sorti, aktivité ek Bon Plan pou profite La Rényon an famiy san fé out bidjé eksplozé.", familyTags: ["Sorti famiy", "Aktivité marmay", "Evennman gratis"], localLabel: "Ossi dann l'univers lokal", localTags: ["Komers", "Artizan", "Restoran ek snack", "Servis"],
    },
    finalCta: {
      eyebrow: "La vi péi, dann in sèl landrwa", title: "Fait isi, pou la vi péi.", text: "Bidjé, courses, èd, demars ek Bon Plan rasanblé dann in aplikasyon pansé pou La Rényon.", languageLine: "Français · Kréol rényoné", freeLabel: "Gratis pou koumansé", primaryGuest: "Kré mon kont gratis", primaryAuthenticated: "Alé dann BudgetKazPéi", secondary: "Dékouv bann lof",
    },
    pricing: {
      eyebrow: "Bann lof", title: "Bann lof pou al pli loin.", intro: "Koumans avek l'esansyèl, apré dékouv bann lof dédié.", soonLabel: "Biento", includedAriaLabel: "Inclus", lockedAriaLabel: "Disponib avek Premium", unavailableAriaLabel: "Pa inclus", dashboard: "Alé dann BudgetKazPéi",
    },
    faq: {
      eyebrow: "FAQ", title: "Kestion souvan", items: [["Eske lé gratis ?", "Wi. Lof gratis i permet dékouv BudgetKazPéi ek suiv sak lé esansyèl."], ["Bann èd lé garanti ?", "Non. Lo organisme officiel i pran désizion final."], ["Kosa fé si in tiké lé mal lu ?", "Ou pé repran foto-la, korij bann ransèyman ou azout dépans-la a la min."]],
    },
    footer: { privacy: "Konfidansyalité", terms: "Kondisyon", deleteAccount: "Suprim mon kont", navigationAriaLabel: "Bann lien pié paz" },
  },
}

function normalizeLandingLanguage(language) {
  return language === LANDING_LANGUAGES.kr ? LANDING_LANGUAGES.kr : LANDING_LANGUAGES.fr
}

const NEUTRAL_KR_DEALS = {
  promoCards: [
    { badge: "PROMO DANN MOMAN", title: "Produi kotidien", text: "Disponib dann out landrwa", meta: "Pri · périod · ensegn dann aplikasyon-la", tone: "peach" },
    { badge: "KATALOG", title: "Katalog la semenn", text: "Ensegn pros koté ou", meta: "Pou gad dann BudgetKazPéi", tone: "blue" },
  ],
  familyTitle: "Sorti ek Bon Plan famiy",
  familyText: "Bann lidé sorti ek aktivité pou profite La Rényon an famiy san fé out bidjé eksplozé.",
  familyTags: ["Sorti famiy", "Aktivité marmay", "Gratis ou aksesib"],
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
  const localDeals = normalizedLanguage === LANDING_LANGUAGES.kr
    ? { ...content.localDeals, ...NEUTRAL_KR_DEALS }
    : content.localDeals
  return { ...content, language: normalizedLanguage, localDeals, pricing: { ...content.pricing, plans: buildPricingPlans(normalizedLanguage) } }
}

const frenchContent = getLandingContent(LANDING_LANGUAGES.fr)

// Exports historiques conservés pour la page offres et les éventuels imports.
export const navItems = frenchContent.navItems
export const heroSignals = frenchContent.heroDemo.transactions
export const pillars = frenchContent.features.pillars
export const productTabs = []
export const localDealCategories = frenchContent.localDeals.localTags
export const localDealPrinciples = frenchContent.localDeals.familyTags
export const pricingPlans = frenchContent.pricing.plans
export const faqs = frenchContent.faq.items

export { PLAN_FEATURE_STATUS }
