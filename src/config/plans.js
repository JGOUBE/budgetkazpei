export const PLAN_IDS = {
  free: "free",
  premium: "premium",
  premiumPlus: "premium_plus",
}

export const PLAN_ORDER = [PLAN_IDS.free, PLAN_IDS.premium, PLAN_IDS.premiumPlus]

export const PLAN_SCAN_LIMITS = {
  [PLAN_IDS.free]: 10,
  [PLAN_IDS.premium]: 30,
  [PLAN_IDS.premiumPlus]: 100,
}

export const PLAN_PRICES = {
  [PLAN_IDS.free]: "0 €",
  [PLAN_IDS.premium]: "2,99 €/mois",
  [PLAN_IDS.premiumPlus]: "4,99 €/mois",
}

export const PLAN_NAMES = {
  [PLAN_IDS.free]: "Gratuit",
  [PLAN_IDS.premium]: "Premium",
  [PLAN_IDS.premiumPlus]: "Premium+",
}

export const PLAN_FEATURE_STATUS = {
  available: "Disponible",
  soon: "Bientôt disponible",
  confirm: "À confirmer",
}

export const PUBLIC_PLAN_CARDS = [
  {
    id: PLAN_IDS.free,
    tone: "cream",
    cta: "Essayer gratuitement",
    href: "/register",
    intro: "Pour commencer à suivre son budget sans complexité.",
    items: [
      { status: PLAN_FEATURE_STATUS.available, text: "Budget essentiel, revenus et dépenses." },
      { status: PLAN_FEATURE_STATUS.available, text: "Ajout manuel et analyse de courses de base." },
      { status: PLAN_FEATURE_STATUS.available, text: "Premiers repères sur vos habitudes." },
    ],
  },
  {
    id: PLAN_IDS.premium,
    tone: "peach",
    cta: "Voir Premium",
    href: "/premium",
    featured: true,
    intro: "Pour renforcer le suivi, les alertes et l'accompagnement quotidien.",
    items: [
      { status: PLAN_FEATURE_STATUS.available, text: "Statistiques renforcées et historique étendu." },
      { status: PLAN_FEATURE_STATUS.available, text: "Alertes budget, exports et suivi plus complet." },
      { status: PLAN_FEATURE_STATUS.available, text: "Assistant standard pour mieux préparer vos démarches." },
    ],
  },
  {
    id: PLAN_IDS.premiumPlus,
    tone: "lavender",
    cta: "Découvrir Premium+",
    href: "/premium",
    intro: "Pour un accompagnement avancé et des fonctions intelligentes clairement identifiées.",
    items: [
      { status: PLAN_FEATURE_STATUS.available, text: "Conseiller renforcé et accompagnement avancé." },
      { status: PLAN_FEATURE_STATUS.available, text: "Suivi des démarches et aide à la préparation." },
      { status: PLAN_FEATURE_STATUS.soon, text: "Prévisions et résumés intelligents." },
    ],
  },
]

export function normalizePlan(value) {
  if (!value || typeof value !== "string") return PLAN_IDS.free

  const cleanValue = value.trim().toLowerCase().replace(/[-\s]+/g, "_")
  if (cleanValue.includes("premium_plus") || cleanValue.includes("premium+")) {
    return PLAN_IDS.premiumPlus
  }
  if (cleanValue.includes("premium")) return PLAN_IDS.premium
  return PLAN_IDS.free
}

export function getPlanFlags(planInput, legacyFlags = {}) {
  if (legacyFlags.isPremiumPlus === true || legacyFlags.premiumPlus === true) {
    return { plan: PLAN_IDS.premiumPlus, isPremium: true, isPremiumPlus: true }
  }

  const plan = normalizePlan(planInput)
  const legacyPremium = legacyFlags.isPremium === true || legacyFlags.premium === true
  const resolvedPlan = legacyPremium && plan === PLAN_IDS.free ? PLAN_IDS.premium : plan

  return {
    plan: resolvedPlan,
    isPremium: resolvedPlan === PLAN_IDS.premium || resolvedPlan === PLAN_IDS.premiumPlus,
    isPremiumPlus: resolvedPlan === PLAN_IDS.premiumPlus,
  }
}

export function getPlanScanLimit(planInput) {
  return PLAN_SCAN_LIMITS[normalizePlan(planInput)]
}

export function getPublicPlanCard(planId) {
  return PUBLIC_PLAN_CARDS.find(plan => plan.id === normalizePlan(planId))
}
