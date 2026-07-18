import { PLAN_NAMES, PLAN_PRICES, PUBLIC_PLAN_CARDS } from "../../config/plans"

export const navItems = [
  { label: "Fonctionnalités", href: "#fonctionnalites" },
  { label: "Comment ça marche", href: "#demo-scanner" },
  { label: "Tarifs", href: "#offres" },
]

export const heroStats = [
  { label: "Ticket courses", value: "42,80 €" },
  { label: "Budget alimentaire", value: "-42,80 €" },
  { label: "Statut", value: "À vérifier" },
]

export const receiptItems = [
  ["Riz parfumé", "4,90 €"],
  ["Tomates pays", "3,40 €"],
  ["Lait demi-écrémé", "2,15 €"],
]

export const scanSteps = [
  {
    title: "Prenez une photo",
    text: "Photographiez le ticket ou importez une image déjà présente sur votre téléphone.",
    badge: "Photo",
  },
  {
    title: "BudgetKazPei lit le ticket",
    text: "Articles, total et date sont préparés quand la photo est suffisamment lisible.",
    badge: "Lecture",
  },
  {
    title: "Vérifiez avant d'ajouter",
    text: "Vous pouvez corriger un article, ajuster le total ou refuser une information.",
    badge: "Contrôle",
  },
  {
    title: "Le budget se met à jour",
    text: "La dépense rejoint votre mois et nourrit progressivement vos habitudes de courses.",
    badge: "Budget",
  },
]

export const benefits = [
  {
    title: "Mon budget en clair",
    question: "Où part mon argent ce mois-ci ?",
    answer: "Visualisez vos dépenses, vos revenus et ce qu'il vous reste sans ouvrir un tableur.",
    points: ["Dépenses du mois", "Solde lisible", "Alertes simples"],
    tone: "cream",
    icon: "budget",
  },
  {
    title: "Mes tickets sans tout ressaisir",
    question: "Comment éviter de tout taper à la main ?",
    answer: "Scannez vos courses, vérifiez les montants et alimentez votre historique plus vite.",
    points: ["Photo ou import", "Correction possible", "Ticket long accompagné"],
    tone: "blue",
    icon: "scan",
  },
  {
    title: "Mes aides et démarches",
    question: "Quelles aides peuvent concerner ma situation ?",
    answer: "Repérez des aides possibles, préparez vos pièces et suivez vos démarches au même endroit.",
    points: ["Profil", "Documents", "Prochaine action"],
    tone: "lavender",
    icon: "aides",
  },
  {
    title: "Mes courses mieux préparées",
    question: "Quels achats reviennent souvent ?",
    answer: "Avec l'historique validé, BudgetKazPei vous aide à mieux comprendre vos habitudes.",
    points: ["Habitudes", "Postes récurrents", "Conseils progressifs"],
    tone: "sage",
    icon: "shopping",
  },
]

export const howItWorks = [
  {
    title: "Ajoutez ou scannez",
    text: "Entrez une dépense, un revenu ou un ticket de courses.",
  },
  {
    title: "BudgetKazPei analyse",
    text: "Vos montants, catégories et habitudes se regroupent progressivement.",
  },
  {
    title: "Vous gardez le contrôle",
    text: "Vous vérifiez, corrigez, supprimez et décidez quoi faire ensuite.",
  },
]

export const useCases = [
  {
    title: "Après les courses",
    text: "Je scanne mon ticket, je vérifie le total et je vois l'impact sur mon budget du mois.",
  },
  {
    title: "Budget familial",
    text: "Je retrouve mes dépenses alimentaires et les achats qui reviennent souvent.",
  },
  {
    title: "Démarches",
    text: "Je prépare une demande sans oublier les documents et la prochaine action.",
  },
]

export const pricingPlans = PUBLIC_PLAN_CARDS.map(plan => ({
  ...plan,
  name: PLAN_NAMES[plan.id],
  price: PLAN_PRICES[plan.id],
}))

export const faqs = [
  [
    "Est-ce gratuit ?",
    "Oui, vous pouvez commencer gratuitement. Les offres Premium ajoutent des possibilités de suivi et d'accompagnement selon la formule.",
  ],
  [
    "Le scanner fonctionne-t-il avec tous les tickets ?",
    "Non. Il aide quand la photo est lisible, mais un ticket froissé, coupé ou flou peut demander une reprise ou une correction.",
  ],
  [
    "Que se passe-t-il si mon ticket est illisible ?",
    "BudgetKazPei vous laisse reprendre la photo, corriger les informations ou ajouter la dépense manuellement.",
  ],
  [
    "Mes photos sont-elles conservées ?",
    "La landing ne promet pas de durée automatique non confirmée. Consultez la politique de confidentialité pour les règles publiées.",
  ],
  [
    "BudgetKazPei vend-il mes données ?",
    "Non, les informations personnelles ne sont pas revendues aux enseignes. Vous pouvez demander l'accès, la correction ou la suppression.",
  ],
  [
    "Est-ce disponible en créole ?",
    "L'application prévoit une expérience français et créole. Les textes créoles publics doivent rester validés avant publication.",
  ],
  [
    "Les aides proposées sont-elles garanties ?",
    "Non. BudgetKazPei aide à préparer vos démarches, mais la décision finale appartient toujours à l'organisme officiel.",
  ],
  [
    "Courses intelligentes compare-t-il déjà tous les magasins ?",
    "Non. Aujourd'hui, l'application aide à comprendre vos habitudes. Les comparaisons deviendront plus précises avec la base de prix.",
  ],
  [
    "Puis-je ajouter une dépense sans scanner ?",
    "Oui, l'ajout manuel reste disponible quand vous ne voulez pas ou ne pouvez pas scanner.",
  ],
  [
    "Puis-je résilier mon abonnement ?",
    "Oui, la gestion de l'abonnement se fait depuis l'espace prévu par l'offre et les conditions publiées.",
  ],
]
