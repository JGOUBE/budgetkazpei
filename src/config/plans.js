export const PLAN_IDS = {
  free: "free",
  premium: "premium",
  premiumPlus: "premium_plus",
}

export const PLAN_ORDER = [PLAN_IDS.free, PLAN_IDS.premium, PLAN_IDS.premiumPlus]

// Valeur provisoire : le quota gratuit reste à valider après mesure du coût réel du service Python.
export const FREE_OPERATIONAL_SCAN_LIMIT = 1
export const PREMIUM_PLUS_SAFETY_SCAN_LIMIT = 50
export const MONTHLY_QUOTA_REACHED_CODE = "monthly_quota_reached"
export const SCAN_SAFETY_LIMIT_REACHED_CODE = "scan_safety_limit_reached"

export const PLAN_SCAN_POLICY = {
  [PLAN_IDS.free]: {
    publicScanLabel: "Accès découverte au scanner",
    commercialScanLimit: null,
    operationalScanLimit: FREE_OPERATIONAL_SCAN_LIMIT,
    isUnlimitedForUser: false,
    isSafetyLimited: false,
    needsCommercialValidation: true,
  },
  [PLAN_IDS.premium]: {
    publicScanLabel: "10 scans par mois",
    commercialScanLimit: 10,
    operationalScanLimit: 10,
    isUnlimitedForUser: false,
    isSafetyLimited: false,
    needsCommercialValidation: false,
  },
  [PLAN_IDS.premiumPlus]: {
    publicScanLabel: "Scans illimités",
    commercialScanLimit: null,
    operationalScanLimit: PREMIUM_PLUS_SAFETY_SCAN_LIMIT,
    isUnlimitedForUser: true,
    isSafetyLimited: true,
    needsCommercialValidation: false,
  },
}

export const PLAN_SCAN_LIMITS = {
  [PLAN_IDS.free]: PLAN_SCAN_POLICY[PLAN_IDS.free].operationalScanLimit,
  [PLAN_IDS.premium]: PLAN_SCAN_POLICY[PLAN_IDS.premium].operationalScanLimit,
  [PLAN_IDS.premiumPlus]: PLAN_SCAN_POLICY[PLAN_IDS.premiumPlus].operationalScanLimit,
}

export const PLAN_PUBLIC_SCAN_LABELS = {
  [PLAN_IDS.free]: PLAN_SCAN_POLICY[PLAN_IDS.free].publicScanLabel,
  [PLAN_IDS.premium]: PLAN_SCAN_POLICY[PLAN_IDS.premium].publicScanLabel,
  [PLAN_IDS.premiumPlus]: PLAN_SCAN_POLICY[PLAN_IDS.premiumPlus].publicScanLabel,
}

export const PREMIUM_PLUS_SAFETY_MESSAGE =
  "Vous avez effectué un nombre inhabituel de scans ce mois-ci. Par sécurité, le scanner est temporairement limité. Contactez-nous si vous avez besoin de continuer."

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
  included: "included",
  locked: "locked",
  soon: "soon",
  unavailable: "unavailable",
}

export const PUBLIC_PLAN_CARDS = [
  {
    id: PLAN_IDS.free,
    tone: "neutral",
    cta: "Créer mon compte",
    href: "/register",
    intro: "Pour découvrir BudgetKazPéi et commencer à suivre l'essentiel.",
    items: [
      { status: PLAN_FEATURE_STATUS.included, text: "Budget essentiel" },
      { status: PLAN_FEATURE_STATUS.included, text: "Revenus et dépenses" },
      { status: PLAN_FEATURE_STATUS.included, text: "Statistiques simples" },
      { status: PLAN_FEATURE_STATUS.included, text: "Aides essentielles et Bons plans locaux" },
      { status: PLAN_FEATURE_STATUS.included, text: PLAN_SCAN_POLICY[PLAN_IDS.free].publicScanLabel },
      { status: PLAN_FEATURE_STATUS.locked, text: "Conseiller BudgetKazPéi à découvrir avec Premium" },
    ],
  },
  {
    id: PLAN_IDS.premium,
    tone: "premium",
    cta: "Découvrir Premium",
    href: "/decouvrir",
    featured: true,
    intro: "BudgetKazPéi me conseille au quotidien.",
    items: [
      { status: PLAN_FEATURE_STATUS.included, text: "Tout le Gratuit" },
      { status: PLAN_FEATURE_STATUS.included, text: PLAN_SCAN_POLICY[PLAN_IDS.premium].publicScanLabel },
      { status: PLAN_FEATURE_STATUS.included, text: "Historique et statistiques avancées" },
      { status: PLAN_FEATURE_STATUS.included, text: "Alertes budget et export PDF" },
      { status: PLAN_FEATURE_STATUS.included, text: "Conseiller BudgetKazPéi — utilisation limitée" },
    ],
  },
  {
    id: PLAN_IDS.premiumPlus,
    tone: "plus",
    cta: "Découvrir Premium+",
    href: "/decouvrir",
    intro: "BudgetKazPéi m'accompagne dans mes actions concrètes.",
    items: [
      { status: PLAN_FEATURE_STATUS.included, text: "Tout le Premium" },
      { status: PLAN_FEATURE_STATUS.included, text: PLAN_SCAN_POLICY[PLAN_IDS.premiumPlus].publicScanLabel },
      { status: PLAN_FEATURE_STATUS.included, text: "Conseiller BudgetKazPéi+ — utilisation illimitée" },
      { status: PLAN_FEATURE_STATUS.included, text: "Accompagnement avancé des démarches" },
      { status: PLAN_FEATURE_STATUS.included, text: "Dossiers, courriers, emails, relances et rendez-vous" },
      { status: PLAN_FEATURE_STATUS.included, text: "Compréhension des refus et préparation des recours" },
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

export function getPlanScanPolicy(planInput) {
  return PLAN_SCAN_POLICY[normalizePlan(planInput)]
}

export function getPlanScanLimit(planInput) {
  return getPlanScanPolicy(planInput).operationalScanLimit
}

export function getPlanPublicScanLabel(planInput) {
  return getPlanScanPolicy(planInput).publicScanLabel
}

export function getPlanQuotaExceededCode(planInput) {
  return getPlanScanPolicy(planInput).isSafetyLimited
    ? SCAN_SAFETY_LIMIT_REACHED_CODE
    : MONTHLY_QUOTA_REACHED_CODE
}

export function getPublicPlanCard(planId) {
  return PUBLIC_PLAN_CARDS.find(plan => plan.id === normalizePlan(planId))
}
