export type ScanPlan = "free" | "premium" | "premium_plus"

export const SCAN_LIMITS: Record<ScanPlan, number> = {
  free: 10,
  premium: 30,
  premium_plus: 100,
}

export function getScanPlan(isPremium = false, isPremiumPlus = false): ScanPlan {
  if (isPremiumPlus) return "premium_plus"
  if (isPremium) return "premium"
  return "free"
}

export function getScanPlanLabel(plan: ScanPlan) {
  if (plan === "premium_plus") return "Premium+"
  if (plan === "premium") return "Premium"
  return "Gratuit"
}
