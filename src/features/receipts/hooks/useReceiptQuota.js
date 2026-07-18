import { useCallback, useEffect, useState } from "react"
import { countMonthlyReceipts } from "../services/receiptService"
import { getScanPlan, getScanPlanLabel, SCAN_LIMITS } from "../../../config/scanLimits"
import { getScanUsage } from "../../../services/scan/scanUsageService"
import { getPlanScanPolicy } from "../../../config/plans"

export function useReceiptQuota(userId, isPremium = false, isPremiumPlus = false) {
  const [used, setUsed] = useState(0)
  const [source, setSource] = useState("scan_usage")
  const [loading, setLoading] = useState(true)

  const plan = getScanPlan(isPremium, isPremiumPlus)
  const policy = getPlanScanPolicy(plan)
  const limit = SCAN_LIMITS[plan]
  const remaining = Math.max(limit - used, 0)
  const reached = remaining <= 0
  const isUnlimitedForUser = policy.isUnlimitedForUser
  const isSafetyLimited = policy.isSafetyLimited
  const safetyLimitReached = isSafetyLimited && reached

  const refresh = useCallback(async (options = {}) => {
    const ignore = Boolean(options.ignore)
      if (!userId) {
        setUsed(0)
        setLoading(false)
        return
      }

      setLoading(true)

      try {
        try {
          const usage = await getScanUsage({ userId, isPremium, isPremiumPlus })
          if (!ignore) {
            setUsed(usage.used)
            setSource("scan_usage")
          }
        } catch (usageError) {
          const count = await countMonthlyReceipts({ userId })
          if (!ignore) {
            setUsed(count)
            setSource("receipts")
          }
        }
      } catch (error) {
        console.error("Erreur quota tickets:", error)
        if (!ignore) setUsed(0)
      } finally {
        if (!ignore) setLoading(false)
      }
  }, [userId, isPremium, isPremiumPlus])

  useEffect(() => {
    let ignore = false

    refresh({ ignore })

    return () => {
      ignore = true
    }
  }, [refresh])

  return {
    used,
    limit,
    remaining,
    reached,
    isUnlimitedForUser,
    isSafetyLimited,
    safetyLimitReached,
    plan,
    planLabel: getScanPlanLabel(plan),
    source,
    loading,
    refresh,
  }
}
