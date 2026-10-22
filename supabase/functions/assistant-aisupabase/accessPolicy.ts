export type AdvisorPlan = "free" | "premium"

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

export const ADVISOR_MODES: readonly AssistantMode[] = [
  ...STANDARD_ADVISOR_MODES,
  ...ADVANCED_ADVISOR_MODES,
]

// Internal safety limit only. It is intentionally not marketed as a user-facing quota.
export const ADVISOR_SAFETY_LIMITS: Readonly<Record<AdvisorPlan, number>> = {
  free: 0,
  premium: 250,
}

export function shouldBlockAdvisorUsage(
  planInput: unknown,
  usedInput: unknown,
  consumesExchange = true,
) {
  const plan = normalizeAdvisorPlan(planInput)
  const used = Math.max(0, Number(usedInput) || 0)

  return consumesExchange && plan === "premium" && used >= ADVISOR_SAFETY_LIMITS.premium
}

// Kept for backward-compatible imports. Premium now blocks at the hidden safety limit.
export function shouldMonitorAdvisorUsage(
  planInput: unknown,
  usedInput: unknown,
  consumesExchange = true,
) {
  return shouldBlockAdvisorUsage(planInput, usedInput, consumesExchange)
}

function isTrue(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1"
}

export function normalizeAdvisorPlan(value: unknown): AdvisorPlan {
  const clean = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, "_")

  if (clean.includes("premium_plus") || clean.includes("premium+")) return "premium"
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

  if (subscriptionStatus === "active" || subscriptionStatus === "trialing") {
    return normalizeAdvisorPlan(subscription.plan)
  }

  const profilePlan = normalizeAdvisorPlan(profile.subscription_plan || profile.plan)
  if (profilePlan !== "free") return profilePlan
  if (isTrue(profile.premium_plus) || isTrue(profile.premium) || isTrue(profile.is_premium)) return "premium"
  return "free"
}

export function getAdvisorAccess(planInput: unknown) {
  const plan = normalizeAdvisorPlan(planInput)
  const canUseAdvisor = plan === "premium"

  return {
    plan,
    canUseAdvisor,
    canUseAdvancedAdvisorTools: canUseAdvisor,
    safetyLimit: ADVISOR_SAFETY_LIMITS[plan],
  }
}

export function parseAssistantMode(value: unknown): AssistantMode | null {
  const mode = String(value || "general").trim().toLowerCase().replace(/[\s-]+/g, "_")
  return ADVISOR_MODES.includes(mode as AssistantMode) ? mode as AssistantMode : null
}

export function isAdvancedAdvisorMode(mode: AssistantMode) {
  return ADVANCED_ADVISOR_MODES.includes(mode)
}
