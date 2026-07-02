import { useCallback, useEffect, useState } from "react"
import { countMonthlyReceipts } from "../services/receiptService"
import { getScanPlan, getScanPlanLabel, SCAN_LIMITS } from "../../../config/scanLimits"
import { getScanUsage } from "../../../services/scan/scanUsageService"

export function useReceiptQuota(userId, isPremium = false, isPremiumPlus = false) {
  const [used, setUsed] = useState(0)
  const [source, setSource] = useState("scan_usage")
  const [loading, setLoading] = useState(true)

  const plan = getScanPlan(isPremium, isPremiumPlus)
  const limit = SCAN_LIMITS[plan]
  const remaining = plan === "premium_plus" ? Infinity : Math.max(limit - used, 0)
  const reached = plan !== "premium_plus" && remaining <= 0

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
    plan,
    planLabel: getScanPlanLabel(plan),
    source,
    loading,
    refresh,
  }
}
