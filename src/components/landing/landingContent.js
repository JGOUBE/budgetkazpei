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

const PLAN_COPY = {
  fr: {
    [PLAN_IDS.free]: {
      name: PLAN_NAMES[PLAN_IDS.free],
      cta: "Créer mon compte",
      intro: "Pour découvrir BudgetKazPéi et commencer à suivre l'essentiel.",
      items: [
        "Budget essentiel",
        "Revenus et dépenses",
        "Statistiques simples",
        "Aides en version essentielle",
        "Accès aux Bons plans locaux",
        PLAN_PUBLIC_SCAN_LABELS[PLAN_IDS.free],
      ],
    },
    [PLAN_IDS.premium]: {
      name: PLAN_NAMES[PLAN_IDS.premium],
      cta: "Voir Premium",
      intro: "Pour mieux suivre son budget et ses habitudes.",
      items: [
        "Tout le Gratuit",
        PLAN_PUBLIC_SCAN_LABELS[PLAN_IDS.premium],
        "Historique et statistiques avancées",
        "Alertes budget",
        "Export PDF",
        "Assistant standard",
      ],
    },
    [PLAN_IDS.premiumPlus]: {
      name: PLAN_NAMES[PLAN_IDS.premiumPlus],
      cta: "Découvrir Premium+",
      intro: "Pour bénéficier d'un accompagnement plus complet.",
      items: [
        "Tout le Premium",
        PLAN_PUBLIC_SCAN_LABELS[PLAN_IDS.premiumPlus],
        "Conseiller renforcé",
        "Suivi des démarches et accompagnement avancé",
        "Conseils personnalisés",
        "Comparaisons intelligentes en cours d'enrichissement",
        "Bons plans personnalisés",
      ],
    },
  },
  kr: {
    [PLAN_IDS.free]: {
      name: "Gratis",
      cta: "Kré mon kont",
      intro: "Pou dékouv BudgetKazPéi ek koumans swiv sak lé esansyèl.",
      items: [
        "Bidjé esansyèl",
        "Larzan i rantre ek dépans",
        "Statistik senp",
        "Èd dann version esansyèl",
        "Aksé bann Bon Plan lokal",
        "Aksé pou dékouv scanner-la",
      ],
    },
    [PLAN_IDS.premium]: {
      name: "Premium",
      cta: "Gad Premium",
      intro: "Pou mieu swiv out bidjé ek out bann labitid.",
      items: [
        "Tout sak lé dann Gratis",
        "10 scans par mwa",
        "Istorik ek statistik avansé",
        "Alèrt bidjé",
        "Èksport PDF",
        "Asistan standar",
      ],
    },
    [PLAN_IDS.premiumPlus]: {
      name: "Premium+",
      cta: "Dékouv Premium+",
      intro: "Pou gagn in lakonpagnman pli konplé.",
      items: [
        "Tout sak lé dann Premium",
        "Scans san limit",
        "Konseyé ranforsé",
        "Swivi bann demars ek lakonpagnman avansé",
        "Konsey pèsonalizé",
        "Konparézon entélizan an kour dann ranforsman",
        "Bon Plan pèsonalizé",
      ],
    },
  },
}

const CONTENT = {
  fr: {
    seo: {
      title: "BudgetKazPéi — Budget, courses, aides et bons plans à La Réunion",
      description:
        "Suivez votre budget, comprenez vos courses, préparez vos démarches et découvrez progressivement les bons plans locaux avec BudgetKazPéi.",
      ogTitle: "BudgetKazPéi — Budget, courses, aides et bons plans à La Réunion",
      ogDescription:
        "Une application locale pour réunir budget, courses, aides, démarches et solutions utiles autour de vous.",
    },
    header: {
      skipLink: "Aller au contenu",
      homeAriaLabel: "Accueil BudgetKazPéi",
      logoAlt: "Logo BudgetKazPéi",
      mainNavigationAriaLabel: "Navigation principale",
      mobileNavigationAriaLabel: "Navigation mobile",
      menuDialogAriaLabel: "Menu BudgetKazPéi",
      menu: "Menu",
      close: "Fermer",
      closeMenuAriaLabel: "Fermer le menu",
      login: "Connexion",
      register: "Créer mon compte",
      dashboard: "Accéder à mon tableau de bord",
      languageButton: "Kréol",
      languageAriaLabel: "Afficher la landing page en créole réunionnais",
    },
    navItems: [
      { label: "Fonctionnalités", href: "#fonctionnalites" },
      { label: "Bons plans", href: "#bons-plans" },
      { label: "Tarifs", href: "#offres" },
    ],
    hero: {
      eyebrow: "BudgetKazPéi à La Réunion",
      title: "Votre budget, vos courses et vos aides. Au même endroit.",
      lead:
        "Suivez vos dépenses, comprenez mieux vos achats, préparez vos démarches et découvrez progressivement les solutions utiles autour de vous, avec une application pensée pour La Réunion.",
      primaryGuest: "Créer mon compte",
      primaryAuthenticated: "Accéder à mon tableau de bord",
      secondary: "Découvrir les fonctionnalités",
    },
    heroDemo: {
      ariaLabel: "Démonstration fictive des parcours BudgetKazPéi",
      topbarTitle: "Vue quotidienne",
      exampleLabel: "Exemple",
      cards: [
        {
          tone: "budget",
          label: "Budget",
          title: "Solde du mois",
          text: "Dépenses classées, catégorie visible et alerte avant dépassement.",
        },
        {
          tone: "courses",
          label: "Courses",
          title: "Ticket reconnu",
          text: "Produits fréquents, habitudes d'achat et comparaison en cours d'enrichissement.",
        },
        {
          tone: "aides",
          label: "Aides",
          title: "Prochaine action",
          text: "Aide possible, document à préparer et statut de démarche.",
        },
        {
          tone: "local",
          label: "Bons plans",
          title: "Près de chez vous",
          text: "Ville, catégorie et service local clairement identifiés.",
        },
      ],
      signals: [
        { label: "Budget", value: "Solde du mois suivi" },
        { label: "Courses", value: "Ticket reconnu" },
        { label: "Aides", value: "Prochaine action" },
        { label: "Local", value: "Bon plan près de vous" },
      ],
    },
    features: {
      eyebrow: "Fonctionnalités",
      title: "Tout votre quotidien dans une seule application.",
      intro:
        "Budget, courses, aides et bons plans avancent ensemble, sans présenter le scanner comme l'ensemble du produit.",
      pillars: [
        {
          title: "Mon budget en clair",
          answer:
            "Visualisez ce qui entre, ce qui sort et ce qu'il vous reste, sans devoir tout suivre dans un tableau.",
          points: ["Revenus et dépenses", "Solde et alertes", "Statistiques"],
          tone: "cream",
          icon: "budget",
        },
        {
          title: "Mes courses mieux comprises",
          answer:
            "Ajoutez vos tickets, retrouvez vos habitudes et préparez progressivement des achats plus adaptés.",
          points: ["Tickets", "Produits fréquents", "Courses intelligentes"],
          tone: "blue",
          icon: "shopping",
        },
        {
          title: "Mes aides et mes démarches",
          answer:
            "Repérez des aides possibles, préparez vos pièces et sachez plus facilement quelle étape effectuer ensuite.",
          points: ["Aides possibles", "Documents", "Prochaine action"],
          tone: "lavender",
          icon: "aides",
        },
        {
          title: "Mes bons plans locaux",
          answer:
            "Découvrez progressivement des professionnels, promotions et services utiles près de chez vous.",
          points: ["Commerces", "Artisans", "Ville et catégorie"],
          tone: "sage",
          icon: "location",
        },
      ],
    },
    productDemo: {
      eyebrow: "Démonstration compacte",
      title: "Trois parcours, une même application.",
      intro:
        "BudgetKazPéi relie le budget, les courses et les démarches dans une lecture simple du quotidien.",
      tabsAriaLabel: "Parcours BudgetKazPéi",
      tabs: [
        {
          id: "budget",
          label: "Budget",
          title: "Un mois plus lisible",
          intro:
            "BudgetKazPéi rapproche vos revenus, dépenses et alertes pour comprendre rapidement où vous en êtes.",
          metrics: [
            ["Solde du mois", "À jour"],
            ["Dépenses", "Classées"],
            ["Répartition", "Visible"],
            ["Alerte", "Avant dépassement"],
          ],
        },
        {
          id: "courses",
          label: "Courses intelligentes",
          title: "Des tickets qui enrichissent vos habitudes",
          intro:
            "Un ticket analysé peut alimenter progressivement vos produits fréquents, vos listes et vos conseils de courses.",
          metrics: [
            ["Ticket analysé", "Total contrôlé"],
            ["Produits", "Regroupés"],
            ["Habitudes", "Enrichies"],
            ["Comparaison", "En cours"],
          ],
          note: "Un ticket difficile peut demander une nouvelle photo ou une correction.",
        },
        {
          id: "aides",
          label: "Aides et démarches",
          title: "Du profil à la prochaine action",
          intro:
            "Le Conseiller aide à préparer une démarche, sans remplacer les organismes officiels.",
          flow: ["Profil", "Aide possible", "Documents", "Prochaine action"],
          note: "La décision finale appartient toujours à l'organisme officiel.",
        },
      ],
    },
    localDeals: {
      eyebrow: "Bons plans locaux",
      title: "Les bons plans autour de chez vous.",
      intro:
        "Retrouvez progressivement des promotions, commerces, artisans et services locaux classés par ville et catégorie.",
      categoriesAriaLabel: "Catégories de bons plans",
      principlesAriaLabel: "Fonctionnement progressif des bons plans",
      categories: [
        "Restaurants et snacks",
        "Boulangeries",
        "Commerces",
        "Artisans",
        "Services",
        "Promotions locales",
      ],
      principles: [
        "Filtre par ville",
        "Filtre par catégorie",
        "Partenaires locaux",
        "Mises en avant limitées",
        "Offres sponsorisées identifiées",
      ],
      professionalTitle: "Vous êtes commerçant, artisan ou professionnel à La Réunion ?",
      professionalText:
        "Proposez votre établissement, une promotion ou un service local pour apparaître dans les Bons plans BudgetKazPéi.",
      contact: "Nous contacter",
    },
    pricing: {
      eyebrow: "Offres",
      title: "Trois niveaux, lisibles en quelques secondes.",
      intro:
        "Commencez simplement, puis choisissez davantage d'accompagnement lorsque cela devient utile.",
      soonLabel: "Bientôt",
      includedAriaLabel: "Inclus",
      unavailableAriaLabel: "Non inclus",
      dashboard: "Accéder à mon tableau de bord",
    },
    faq: {
      eyebrow: "FAQ",
      title: "Questions fréquentes",
      items: [
        [
          "Est-ce gratuit ?",
          "Oui. L'offre gratuite permet de découvrir BudgetKazPéi et de suivre l'essentiel. Les offres Premium ajoutent davantage de suivi et d'accompagnement.",
        ],
        [
          "Comment fonctionne le scanner de tickets ?",
          "Vous ajoutez une photo lisible, BudgetKazPéi prépare les informations, puis vous gardez la main pour vérifier ou corriger.",
        ],
        [
          "Que se passe-t-il si mon ticket est illisible ?",
          "Vous pouvez reprendre la photo, corriger les informations ou ajouter la dépense manuellement.",
        ],
        [
          "Les aides proposées sont-elles garanties ?",
          "Non. BudgetKazPéi aide à préparer vos démarches, mais la décision finale appartient toujours à l'organisme officiel.",
        ],
        [
          "Comment proposer un bon plan ou devenir partenaire ?",
          "Les professionnels peuvent prendre contact avec BudgetKazPéi. Les offres sponsorisées devront toujours être clairement identifiées.",
        ],
      ],
    },
    finalCta: {
      eyebrow: "Premier pas",
      title: "Prenez en main votre budget et votre quotidien.",
      text:
        "Commencez avec les outils essentiels, puis choisissez davantage d'accompagnement seulement lorsque vous en avez besoin.",
      primaryGuest: "Créer mon compte",
      primaryAuthenticated: "Accéder à mon tableau de bord",
      secondary: "Découvrir les offres",
    },
    footer: {
      privacy: "Confidentialité",
      terms: "Conditions",
      deleteAccount: "Suppression du compte",
      navigationAriaLabel: "Liens de pied de page",
    },
  },
  kr: {
    seo: {
      title: "BudgetKazPéi — Bidjé, courses, èd ek Bon Plan La Rényon",
      description:
        "Swiv out bidjé, konpran out courses, prépar out bann demars ek dékouv ti-a-ti bann Bon Plan lokal avèk BudgetKazPéi.",
      ogTitle: "BudgetKazPéi — Bidjé, courses, èd ek Bon Plan La Rényon",
      ogDescription:
        "In aplikasyon lokal pou rasanm bidjé, courses, èd, demars ek bann solisyon itil otour de ou.",
    },
    header: {
      skipLink: "Alé dann konteni",
      homeAriaLabel: "Lakèy BudgetKazPéi",
      logoAlt: "Logo BudgetKazPéi",
      mainNavigationAriaLabel: "Navigasyon prinsipal",
      mobileNavigationAriaLabel: "Navigasyon mobil",
      menuDialogAriaLabel: "Menu BudgetKazPéi",
      menu: "Menu",
      close: "Fèrmé",
      closeMenuAriaLabel: "Fèrm menu-la",
      login: "Koneksyon",
      register: "Kré mon kont",
      dashboard: "Alé su mon tablo débor",
      languageButton: "Français",
      languageAriaLabel: "Afficher la landing page en français",
    },
    navItems: [
      { label: "Fonksionalité", href: "#fonctionnalites" },
      { label: "Bon Plan", href: "#bons-plans" },
      { label: "Tarif", href: "#offres" },
    ],
    hero: {
      eyebrow: "BudgetKazPéi La Rényon",
      title: "Out bidjé, out courses ek out bann èd. Tout dann in sèl landrwa.",
      lead:
        "Swiv out dépans, konpran mieu sak ou asté, prépar out bann demars ek dékouv ti-a-ti bann solisyon itil otour de ou, avèk in aplikasyon pansé pou La Rényon.",
      primaryGuest: "Kré mon kont",
      primaryAuthenticated: "Alé su mon tablo débor",
      secondary: "Dékouv bann fonksionalité",
    },
    heroDemo: {
      ariaLabel: "Egzanp bann parcours BudgetKazPéi",
      topbarTitle: "Gad kotidien",
      exampleLabel: "Egzanp",
      cards: [
        {
          tone: "budget",
          label: "Bidjé",
          title: "Larzan i reste pou mwa-la",
          text: "Dépans lé klasé, katégori lé vizib ek alèrt i ariv avan ou dépassé.",
        },
        {
          tone: "courses",
          label: "Courses",
          title: "Tiké rekonèt",
          text: "Produi souvan asté, labitid d'achat ek konparézon an kour dann ranforsman.",
        },
        {
          tone: "aides",
          label: "Èd",
          title: "Proshin aksyon",
          text: "Èd posib, dokiman pou préparé ek stati out demars.",
        },
        {
          tone: "local",
          label: "Bon Plan",
          title: "Otour de ou",
          text: "Komin, katégori ek servis lokal lé bien idantifyé.",
        },
      ],
      signals: [
        { label: "Bidjé", value: "Larzan i reste lé swivi" },
        { label: "Courses", value: "Tiké rekonèt" },
        { label: "Èd", value: "Proshin aksyon" },
        { label: "Lokal", value: "Bon Plan otour de ou" },
      ],
    },
    features: {
      eyebrow: "Fonksionalité",
      title: "Tout out kotidien dann in sèl aplikasyon.",
      intro:
        "Bidjé, courses, èd ek Bon Plan i avans ansanm, san fé krwar scanner-la sé tout aplikasyon-la.",
      pillars: [
        {
          title: "Mon bidjé lé kler",
          answer:
            "Gad sak i rantre, sak i sort ek sak i reste, san bizin swiv tout dann in tablo.",
          points: ["Larzan i rantre ek dépans", "Larzan i reste ek alèrt", "Statistik"],
          tone: "cream",
          icon: "budget",
        },
        {
          title: "Mi konpran mieu mon courses",
          answer:
            "Azout out bann tiké, retrouv out labitid ek prépar ti-a-ti bann achat pli adapté.",
          points: ["Tiké", "Produi souvan asté", "Courses entélizan"],
          tone: "blue",
          icon: "shopping",
        },
        {
          title: "Mon bann èd ek mon bann demars",
          answer:
            "Trouv bann èd posib, prépar out bann dokiman ek koné pli fasilman kèl etap fé apré.",
          points: ["Èd posib", "Dokiman", "Proshin aksyon"],
          tone: "lavender",
          icon: "aides",
        },
        {
          title: "Mon bann Bon Plan lokal",
          answer:
            "Dékouv ti-a-ti bann professionnel, promosyon ek servis itil otour de ou.",
          points: ["Komers", "Artizan", "Komin ek katégori"],
          tone: "sage",
          icon: "location",
        },
      ],
    },
    productDemo: {
      eyebrow: "Ti démonstrasyon",
      title: "Trois parcours, in sèl aplikasyon.",
      intro:
        "BudgetKazPéi i relie bidjé, courses ek bann demars pou donn aou in vue simple su out kotidien.",
      tabsAriaLabel: "Parcours BudgetKazPéi",
      tabs: [
        {
          id: "budget",
          label: "Bidjé",
          title: "In mwa pli fasil pou konpran",
          intro:
            "BudgetKazPéi i rasanm out larzan i rantre, out dépans ek out bann alèrt pou ou koné vit koté ou lé.",
          metrics: [
            ["Larzan i reste pou mwa-la", "Mizazour"],
            ["Dépans", "Klasé"],
            ["Répartisyon", "Vizib"],
            ["Alèrt", "Avan dépassman"],
          ],
        },
        {
          id: "courses",
          label: "Courses entélizan",
          title: "Bann tiké i ranfors out labitid",
          intro:
            "In tiké analizé i pé alimant ti-a-ti out produi souvan asté, out bann lis ek out konsey courses.",
          metrics: [
            ["Tiké analizé", "Total kontrolé"],
            ["Produi", "Rasanblé"],
            ["Labitid", "Ranforsé"],
            ["Konparézon", "An kour"],
          ],
          note: "Pou in tiké difisil, l'aplikasyon i pé domann in nouvo foto ou in koreksyon.",
        },
        {
          id: "aides",
          label: "Èd ek demars",
          title: "Depi out profil ziska proshin aksyon",
          intro:
            "Konseyé-la i aide aou prépar in demars, san pran plas bann lorganism ofisyèl.",
          flow: ["Profil", "Èd posib", "Dokiman", "Proshin aksyon"],
          note: "Désizyon final i apartien touzour lorganism ofisyèl.",
        },
      ],
    },
    localDeals: {
      eyebrow: "Bon Plan lokal",
      title: "Bann Bon Plan otour de ou.",
      intro:
        "Retrouv ti-a-ti promosyon, komers, artizan ek servis lokal, klasé par komin ek katégori.",
      categoriesAriaLabel: "Katégori bann Bon Plan",
      principlesAriaLabel: "Koman bann Bon Plan va ranpli ti-a-ti",
      categories: [
        "Restoran ek snak",
        "Boulanzri",
        "Komers",
        "Artizan",
        "Servis",
        "Promosyon lokal",
      ],
      principles: [
        "Filtre par komin",
        "Filtre par katégori",
        "Partenèr lokal",
        "Miz an avan limité",
        "Bann offres sponsorisées lé idantifyé",
      ],
      professionalTitle: "Ou lé komersan, artizan ou professionnel La Rényon ?",
      professionalText:
        "Propoz out etablisman, in promosyon ou in servis lokal pou aparèt dann bann Bon Plan BudgetKazPéi.",
      contact: "Kontakt a nou",
    },
    pricing: {
      eyebrow: "Bann offres",
      title: "Trois nivo, fasil pou konpran vitman.",
      intro:
        "Koumans simplement, épi swazi plis lakonpagnman kan ou néna bezoin.",
      soonLabel: "Biento",
      includedAriaLabel: "Lé dann lof",
      unavailableAriaLabel: "Lé pa dann lof",
      dashboard: "Alé su mon tablo débor",
    },
    faq: {
      eyebrow: "FAQ",
      title: "Kestion souvan pozé",
      items: [
        [
          "Lé gratis ?",
          "Wi. Loffre Gratis i permet dékouv BudgetKazPéi ek swiv sak lé esansyèl. Bann offres Premium i azout plis swivi ek lakonpagnman.",
        ],
        [
          "Koman scanner tiké-la i fonksyone ?",
          "Ou azout in foto lizib, BudgetKazPéi i prépar bann linformasyon, épi ou i gard la min pou vérifié ou korijé.",
        ],
        [
          "Kosa i ariv si mon tiké lé pa lizib ?",
          "Ou pé repran foto-la, korij bann linformasyon ou azout dépans-la amain.",
        ],
        [
          "Bann èd propozé lé garanti ?",
          "Non. BudgetKazPéi i aide aou prépar out bann demars, mé désizyon final i apartien touzour lorganism ofisyèl.",
        ],
        [
          "Koman propoz in Bon Plan ou devenir partenèr ?",
          "Bann professionnel i pé pran kontakt avèk BudgetKazPéi. Bann offres sponsorisé va touzour bien idantifyé.",
        ],
      ],
    },
    finalCta: {
      eyebrow: "Premié pa",
      title: "Pran out bidjé ek out kotidien an min.",
      text:
        "Koumans avèk bann zouti esansyèl, épi swazi plis lakonpagnman sèlman kan ou néna bezoin.",
      primaryGuest: "Kré mon kont",
      primaryAuthenticated: "Alé su mon tablo débor",
      secondary: "Dékouv bann lof",
    },
    footer: {
      privacy: "Konfidansyalité",
      terms: "Kondisyon",
      deleteAccount: "Suprim mon kont",
      navigationAriaLabel: "Lien anba paz",
    },
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
      name: copy?.name || PLAN_NAMES[plan.id],
      price: PLAN_PRICES[plan.id],
      cta: copy?.cta || plan.cta,
      intro: copy?.intro || plan.intro,
      items: plan.items.map((item, index) => ({
        ...item,
        text: copy?.items?.[index] || item.text,
      })),
    }
  })
}

export function getLandingContent(language = LANDING_LANGUAGES.fr) {
  const normalizedLanguage = normalizeLandingLanguage(language)
  const content = CONTENT[normalizedLanguage]

  return {
    ...content,
    language: normalizedLanguage,
    pricing: {
      ...content.pricing,
      plans: buildPricingPlans(normalizedLanguage),
    },
  }
}

const frenchContent = getLandingContent(LANDING_LANGUAGES.fr)

// Exports conservés pour éviter de casser d'anciens imports pendant la transition.
export const navItems = frenchContent.navItems
export const heroSignals = frenchContent.heroDemo.signals
export const pillars = frenchContent.features.pillars
export const productTabs = frenchContent.productDemo.tabs
export const localDealCategories = frenchContent.localDeals.categories
export const localDealPrinciples = frenchContent.localDeals.principles
export const pricingPlans = frenchContent.pricing.plans
export const faqs = frenchContent.faq.items

export { PLAN_FEATURE_STATUS }
