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
  const legacyPlan = legacyFlags.isPremiumPlus
    ? PLAN_IDS.premiumPlus
    : legacyFlags.isPremium
      ? PLAN_IDS.premium
      : planInput
  const plan = normalizePlan(legacyPlan)
  const canUseAdvisor = plan === PLAN_IDS.premium || plan === PLAN_IDS.premiumPlus
  const canUseAdvancedAdvisorTools = plan === PLAN_IDS.premiumPlus

  return {
    plan,
    canUseAdvisor,
    canUseAdvancedAdvisorTools,
    publicUsageLabel: canUseAdvancedAdvisorTools
      ? "unlimited"
      : canUseAdvisor
        ? "limited"
        : "locked",
    allowedModes: canUseAdvancedAdvisorTools
      ? ADVISOR_MODES
      : canUseAdvisor
        ? STANDARD_ADVISOR_MODES
        : [],
  }
}

export function canUseAdvisorMode(access, mode) {
  return Boolean(access?.allowedModes?.includes(mode))
}
