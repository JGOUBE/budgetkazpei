import { useCallback, useEffect, useMemo, useState } from "react"
import { countMonthlyReceipts } from "../services/receiptService"
import { getScanPlan, getScanPlanLabel, SCAN_LIMITS } from "../../../config/scanLimits"
import { getScanUsage } from "../../../services/scan/scanUsageService"
import { getPlanScanPolicy, normalizePlan } from "../../../config/plans"

export function resolveReceiptQuotaState({
  usage = null,
  fallbackUsed = 0,
  fallbackPlan = "free",
  source = "scan_usage",
} = {}) {
  const plan = normalizePlan(usage?.plan || fallbackPlan || "free")
  const used = Number(usage?.used ?? usage?.aiUsed ?? fallbackUsed ?? 0)
  const policy = getPlanScanPolicy(plan)
  const limit = SCAN_LIMITS[plan]
  const remaining = Math.max(limit - used, 0)
  const reached = remaining <= 0

  return {
    used,
    limit,
    remaining,
    reached,
    isUnlimitedForUser: policy.isUnlimitedForUser,
    isSafetyLimited: policy.isSafetyLimited,
    safetyLimitReached: policy.isSafetyLimited && reached,
    plan,
    planLabel: getScanPlanLabel(plan),
    source,
  }
}

export function formatReceiptQuotaLabelFr(quota) {
  return quota?.isUnlimitedForUser
    ? `Analyses IA illimitées — ${quota.planLabel}`
    : `Analyses IA : ${quota.used} / ${quota.limit} — ${quota.planLabel}`
}

export function useReceiptQuota(userId, isPremium = false, isPremiumPlus = false) {
  const localPlan = getScanPlan(isPremium, isPremiumPlus)
  const fallbackState = useMemo(
    () => resolveReceiptQuotaState({ fallbackPlan: "free", source: "scan_usage" }),
    [],
  )
  const [quotaState, setQuotaState] = useState(fallbackState)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async (options = {}) => {
    const ignore = Boolean(options.ignore)
    if (!userId) {
      const emptyState = resolveReceiptQuotaState({ fallbackPlan: "free", source: "scan_usage" })
      if (!ignore) setQuotaState(emptyState)
      setLoading(false)
      return emptyState
    }

    setLoading(true)

    try {
      try {
        const usage = await getScanUsage({ userId, isPremium, isPremiumPlus })
        const nextState = resolveReceiptQuotaState({
          usage,
          fallbackPlan: "free",
          source: "scan_usage",
        })
        if (!ignore) {
          setQuotaState(nextState)
        }
        return nextState
      } catch {
        const count = await countMonthlyReceipts({ userId })
        const nextState = resolveReceiptQuotaState({
          fallbackUsed: count,
          fallbackPlan: localPlan,
          source: "receipts",
        })
        if (!ignore) {
          setQuotaState(nextState)
        }
        return nextState
      }
    } catch (error) {
      console.error("Erreur quota tickets:", error)
      const emptyState = resolveReceiptQuotaState({ fallbackPlan: "free", source: "scan_usage" })
      if (!ignore) setQuotaState(emptyState)
      return emptyState
    } finally {
      if (!ignore) setLoading(false)
    }
  }, [userId, isPremium, isPremiumPlus, localPlan])

  useEffect(() => {
    let ignore = false

    async function loadQuota() {
      await refresh({ ignore })
    }

    loadQuota()

    return () => {
      ignore = true
    }
  }, [refresh])

  return {
    ...quotaState,
    loading,
    refresh,
  }
}
