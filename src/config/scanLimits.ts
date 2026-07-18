import { PLAN_NAMES, PLAN_SCAN_LIMITS, getPlanFlags, normalizePlan } from "./plans.js"

export type ScanPlan = "free" | "premium" | "premium_plus"

export const SCAN_LIMITS: Record<ScanPlan, number> = PLAN_SCAN_LIMITS

export function getScanPlan(isPremium = false, isPremiumPlus = false): ScanPlan {
  return getPlanFlags("free", { isPremium, isPremiumPlus }).plan as ScanPlan
}

export function getScanPlanLabel(plan: ScanPlan) {
  return PLAN_NAMES[normalizePlan(plan)]
}
