export type ScanPlan = "free" | "premium" | "premium_plus"

export const SCAN_LIMITS: Record<ScanPlan, number> = {
  free: 1,
  premium: 10,
  premium_plus: 50,
}

export function getScanPlan(isPremium = false, isPremiumPlus = false): ScanPlan {
  if (isPremiumPlus) return "premium_plus"
  if (isPremium) return "premium"
  return "free"
}

export function getScanPlanLabel(plan: ScanPlan) {
  if (plan === "premium_plus") return "Premium+ - analyses IA illimitees"
  if (plan === "premium") return "Premium"
  return "Gratuit"
}
