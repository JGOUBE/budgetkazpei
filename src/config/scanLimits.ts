import { PLAN_NAMES, PLAN_SCAN_LIMITS, getPlanFlags, normalizePlan } from "./plans.js"

export type ScanPlan = "free" | "premium"

export const SCAN_LIMITS: Record<ScanPlan, number> = {
  free: PLAN_SCAN_LIMITS.free,
  premium: PLAN_SCAN_LIMITS.premium,
}

export function getScanPlan(isPremium = false, isPremiumPlus = false): ScanPlan {
  return getPlanFlags("free", { isPremium, isPremiumPlus }).plan as ScanPlan
}

export function getScanPlanLabel(plan: ScanPlan | string) {
  return PLAN_NAMES[normalizePlan(plan)]
}
