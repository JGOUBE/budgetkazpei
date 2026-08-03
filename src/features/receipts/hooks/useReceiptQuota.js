import { useCallback, useEffect, useMemo, useState } from "react"
import { countMonthlyReceipts } from "../services/receiptService.js"
import { getScanPlan, getScanPlanLabel, SCAN_LIMITS } from "../../../config/scanLimits.ts"
import { getScanUsage } from "../../../services/scan/scanUsageService.ts"
import { getPlanScanPolicy, normalizePlan } from "../../../config/plans.js"

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

export function formatReceiptQuotaLabelKr(quota) {
  return quota?.isUnlimitedForUser
    ? `Analiz IA san limit — ${quota.planLabel}`
    : `Analiz IA : ${quota.used} / ${quota.limit} — ${quota.planLabel}`
}

export function formatReceiptQuotaTicketsLabelFr(quota) {
  return quota?.isUnlimitedForUser
    ? `Premium+ actif — Utilisation du mois : ${quota.used}`
    : `Analyses IA : ${quota.used} / ${quota.limit} — ${quota.planLabel}`
}

export function formatReceiptQuotaTicketsLabelKr(quota) {
  return quota?.isUnlimitedForUser
    ? `Premium+ actif — Itilizasyon sa mwa-la : ${quota.used}`
    : `Analiz IA : ${quota.used} / ${quota.limit} — ${quota.planLabel}`
}

export function getReceiptQuotaBlockingMessage(quota, txt) {
  return quota?.safetyLimitReached ? txt.intensiveUsage : txt.quotaReached
}

export function useReceiptQuota({
  userId,
  isPremium = false,
  isPremiumPlus = false,
  subscriptionLoading = false,
} = {}) {
  const localPlan = getScanPlan(isPremium, isPremiumPlus)
  const fallbackPlan = normalizePlan(localPlan || "free")
  const fallbackState = useMemo(
    () => resolveReceiptQuotaState({
      fallbackPlan,
      source: subscriptionLoading ? "subscription_loading" : "scan_usage",
    }),
    [fallbackPlan, subscriptionLoading],
  )
  const [quotaState, setQuotaState] = useState(fallbackState)
  const [loading, setLoading] = useState(Boolean(subscriptionLoading || userId))

  const refresh = useCallback(async (options = {}) => {
    const ignore = Boolean(options.ignore)

    if (!userId) {
      const emptyState = resolveReceiptQuotaState({ fallbackPlan, source: "scan_usage" })
      if (!ignore) setQuotaState(emptyState)
      setLoading(false)
      return emptyState
    }

    if (subscriptionLoading) {
      const pendingState = resolveReceiptQuotaState({
        fallbackPlan,
        source: "subscription_loading",
      })
      if (!ignore) {
        setQuotaState(pendingState)
        setLoading(true)
      }
      return pendingState
    }

    setLoading(true)

    try {
      try {
        const usage = await getScanUsage({ userId, isPremium, isPremiumPlus })
        const nextState = resolveReceiptQuotaState({
          usage,
          fallbackPlan,
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
          fallbackPlan,
          source: "receipts",
        })
        if (!ignore) {
          setQuotaState(nextState)
        }
        return nextState
      }
    } catch (error) {
      console.error("Erreur quota tickets:", error)
      const emptyState = resolveReceiptQuotaState({
        fallbackPlan,
        source: "scan_usage_error",
      })
      if (!ignore) setQuotaState(emptyState)
      return emptyState
    } finally {
      if (!ignore) setLoading(false)
    }
  }, [userId, isPremium, isPremiumPlus, fallbackPlan, subscriptionLoading])

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
