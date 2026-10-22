import { PLAN_IDS, normalizePlan } from "./plans.js"

export const STANDARD_ADVISOR_MODES = Object.freeze([
  "general",
  "budget_depenses",
  "scan_profil",
  "trouver_aide",
  "comprendre_courrier",
])

export const ADVANCED_ADVISOR_MODES = Object.freeze([
  "preparer_dossier",
  "generer_courrier",
  "generer_email",
  "preparer_relance",
  "comprendre_refus",
  "preparer_recours",
  "preparer_rdv",
])

export const ADVISOR_MODES = Object.freeze([
  ...STANDARD_ADVISOR_MODES,
  ...ADVANCED_ADVISOR_MODES,
])

export function getAdvisorAccess(planInput, legacyFlags = {}) {
  const legacyPlan = legacyFlags.isPremiumPlus || legacyFlags.isPremium
    ? PLAN_IDS.premium
    : planInput
  const plan = normalizePlan(legacyPlan)
  const canUseAdvisor = plan === PLAN_IDS.premium
  const canUseAdvancedAdvisorTools = canUseAdvisor

  return {
    plan,
    canUseAdvisor,
    canUseAdvancedAdvisorTools,
    publicUsageLabel: canUseAdvisor ? "included" : "locked",
    allowedModes: canUseAdvisor ? ADVISOR_MODES : [],
  }
}

export function canUseAdvisorMode(access, mode) {
  return Boolean(access?.allowedModes?.includes(mode))
}
