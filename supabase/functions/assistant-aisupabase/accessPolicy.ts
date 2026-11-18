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
  premium: 1200,
  premium_plus: 1200,
}

export function shouldBlockAdvisorUsage(
  planInput: unknown,
  usedInput: unknown,
  consumesExchange = true,
) {
  const plan = normalizeAdvisorPlan(planInput)
  const used = Math.max(0, Number(usedInput) || 0)

  // The atomic per-user OpenAI budget guard now owns hard limits.
  return false
}

export function shouldMonitorAdvisorUsage(
  planInput: unknown,
  usedInput: unknown,
  consumesExchange = true,
) {
  const plan = normalizeAdvisorPlan(planInput)
  const used = Math.max(0, Number(usedInput) || 0)

  return consumesExchange && plan !== "free" && used >= 960
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

  // A known canceled, unpaid or expired subscription overrides stale profile
  // flags. Only legacy accounts without any subscription record use profile grants.
  if (subscriptionStatus) {
    return ["active", "trialing"].includes(subscriptionStatus)
      ? normalizeAdvisorPlan(subscription.plan)
      : "free"
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
  const canUseAdvancedAdvisorTools = canUseAdvisor

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
