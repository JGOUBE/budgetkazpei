export type AdvisorPlan = "free" | "premium" | "premium_plus"

export type AssistantMode =
  | "general"
  | "budget_depenses"
  | "scan_profil"
  | "trouver_aide"
  | "comprendre_courrier"
  | "preparer_dossier"
  | "generer_courrier"
  | "generer_email"
  | "preparer_relance"
  | "comprendre_refus"
  | "preparer_recours"
  | "preparer_rdv"

export const STANDARD_ADVISOR_MODES: readonly AssistantMode[] = [
  "general",
  "budget_depenses",
  "scan_profil",
  "trouver_aide",
  "comprendre_courrier",
]

export const ADVANCED_ADVISOR_MODES: readonly AssistantMode[] = [
  "preparer_dossier",
  "generer_courrier",
  "generer_email",
  "preparer_relance",
  "comprendre_refus",
  "preparer_recours",
  "preparer_rdv",
]

export const ADVISOR_SAFETY_LIMITS: Readonly<Record<AdvisorPlan, number>> = {
  free: 0,
  premium: 50,
  premium_plus: 250,
}

function isTrue(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1"
}

export function normalizeAdvisorPlan(value: unknown): AdvisorPlan {
  const clean = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, "_")

  if (clean.includes("premium_plus") || clean.includes("premium+")) return "premium_plus"
  if (clean.includes("premium")) return "premium"
  return "free"
}

export function resolveServerPlan(params: {
  subscription?: Record<string, unknown> | null
  profile?: Record<string, unknown> | null
} = {}): AdvisorPlan {
  const subscription = params.subscription || {}
  const profile = params.profile || {}
  const subscriptionStatus = String(subscription.status || "").toLowerCase()

  if (subscriptionStatus === "active") {
    return normalizeAdvisorPlan(subscription.plan)
  }

  const profilePlan = normalizeAdvisorPlan(profile.subscription_plan || profile.plan)
  if (profilePlan !== "free") return profilePlan
  if (isTrue(profile.premium_plus)) return "premium_plus"
  if (isTrue(profile.premium) || isTrue(profile.is_premium)) return "premium"
  return "free"
}

export function getAdvisorAccess(planInput: unknown) {
  const plan = normalizeAdvisorPlan(planInput)
  const canUseAdvisor = plan === "premium" || plan === "premium_plus"
  const canUseAdvancedAdvisorTools = plan === "premium_plus"

  return {
    plan,
    canUseAdvisor,
    canUseAdvancedAdvisorTools,
    safetyLimit: ADVISOR_SAFETY_LIMITS[plan],
  }
}

export function parseAssistantMode(value: unknown): AssistantMode | null {
  const mode = String(value || "general").trim().toLowerCase().replace(/[\s-]+/g, "_")
  const allowed = [...STANDARD_ADVISOR_MODES, ...ADVANCED_ADVISOR_MODES]
  return allowed.includes(mode as AssistantMode) ? mode as AssistantMode : null
}

export function isAdvancedAdvisorMode(mode: AssistantMode) {
  return ADVANCED_ADVISOR_MODES.includes(mode)
}
