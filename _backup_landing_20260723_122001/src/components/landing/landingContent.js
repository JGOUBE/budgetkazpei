import { PLAN_NAMES, PLAN_PRICES, PUBLIC_PLAN_CARDS } from "../../config/plans"

export const navItems = [
  { label: "Fonctionnalités", href: "#fonctionnalites" },
  { label: "Bons plans", href: "#bons-plans" },
  { label: "Tarifs", href: "#offres" },
]

export const heroSignals = [
  { label: "Budget", value: "Solde du mois suivi" },
  { label: "Courses", value: "Ticket reconnu" },
  { label: "Aides", value: "Prochaine action" },
  { label: "Local", value: "Bon plan près de vous" },
]

export const pillars = [
  {
    title: "Mon budget en clair",
    answer: "Visualisez ce qui entre, ce qui sort et ce qu'il vous reste, sans devoir tout suivre dans un tableau.",
    points: ["Revenus et dépenses", "Solde et alertes", "Statistiques"],
    tone: "cream",
    icon: "budget",
  },
  {
    title: "Mes courses mieux comprises",
    answer: "Ajoutez vos tickets, retrouvez vos habitudes et préparez progressivement des achats plus adaptés.",
    points: ["Tickets", "Produits fréquents", "Courses intelligentes"],
    tone: "blue",
    icon: "shopping",
  },
  {
    title: "Mes aides et mes démarches",
    answer: "Repérez des aides possibles, préparez vos pièces et sachez plus facilement quelle étape effectuer ensuite.",
    points: ["Aides possibles", "Documents", "Prochaine action"],
    tone: "lavender",
    icon: "aides",
  },
  {
    title: "Mes bons plans locaux",
    answer: "Découvrez progressivement des professionnels, promotions et services utiles près de chez vous.",
    points: ["Commerces", "Artisans", "Ville et catégorie"],
    tone: "sage",
    icon: "location",
  },
]

export const productTabs = [
  {
    id: "budget",
    label: "Budget",
    title: "Un mois plus lisible",
    intro: "BudgetKazPei rapproche vos revenus, dépenses et alertes pour comprendre rapidement où vous en êtes.",
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
    intro: "Un ticket analysé peut alimenter vos produits fréquents, vos listes et vos conseils de courses progressivement.",
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
    intro: "Le Conseiller aide à préparer une démarche, sans remplacer les organismes officiels.",
    flow: ["Profil", "Aide possible", "Documents", "Prochaine action"],
    note: "La décision finale appartient toujours à l'organisme officiel.",
  },
]

export const localDealCategories = [
  "Restaurants et snacks",
  "Boulangeries",
  "Commerces",
  "Artisans",
  "Services",
  "Promotions locales",
]

export const localDealPrinciples = [
  "Filtre par ville",
  "Filtre par catégorie",
  "Partenaires locaux",
  "Mises en avant limitées",
  "Offres sponsorisées identifiées",
]

export const pricingPlans = PUBLIC_PLAN_CARDS.map(plan => ({
  ...plan,
  name: PLAN_NAMES[plan.id],
  price: PLAN_PRICES[plan.id],
}))

export const faqs = [
  [
    "Est-ce gratuit ?",
    "Oui. L'offre gratuite permet de découvrir BudgetKazPei et de suivre l'essentiel. Les offres Premium ajoutent plus de suivi et d'accompagnement.",
  ],
  [
    "Comment fonctionne le scanner de tickets ?",
    "Vous ajoutez une photo lisible, BudgetKazPei prépare les informations, puis vous gardez la main pour vérifier ou corriger.",
  ],
  [
    "Que se passe-t-il si mon ticket est illisible ?",
    "Vous pouvez reprendre la photo, corriger les informations ou ajouter la dépense manuellement.",
  ],
  [
    "Les aides proposees sont-elles garanties ?",
    "Non. BudgetKazPei aide à préparer vos démarches, mais la décision finale appartient toujours à l'organisme officiel.",
  ],
  [
    "Comment proposer un bon plan ou devenir partenaire ?",
    "Les professionnels peuvent prendre contact avec BudgetKazPei. Les offres sponsorisées devront toujours être clairement identifiées.",
  ],
]
