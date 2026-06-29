import { useEffect, useState } from "react"
import { countMonthlyReceipts } from "../services/receiptService"
import { getScanPlan, getScanPlanLabel, SCAN_LIMITS } from "../../../config/scanLimits"
import { getScanUsage } from "../../../services/scan/scanUsageService"

export function useReceiptQuota(userId, isPremium = false, isPremiumPlus = false) {
  const [used, setUsed] = useState(0)
  const [source, setSource] = useState("scan_usage")
  const [loading, setLoading] = useState(true)

  const plan = getScanPlan(isPremium, isPremiumPlus)
  const limit = SCAN_LIMITS[plan]
  const remaining = Math.max(limit - used, 0)
  const reached = remaining <= 0

  useEffect(() => {
    let ignore = false

    async function loadQuota() {
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
    }

    loadQuota()

    return () => {
      ignore = true
    }
  }, [userId, isPremium, isPremiumPlus])

  return {
    used,
    limit,
    remaining,
    reached,
    plan,
    planLabel: getScanPlanLabel(plan),
    source,
    loading,
  }
}
