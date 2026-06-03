import { useEffect, useState } from "react"
import { supabase } from "../services/supabase"

export function useSubscription(userId) {
  const [isPremium, setIsPremium] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function checkPremium() {
      if (!userId) {
        if (mounted) {
          setIsPremium(false)
          setLoading(false)
        }
        return
      }

      setLoading(true)

      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("premium")
          .eq("id", userId)
          .maybeSingle()

        if (!mounted) return

        if (error) {
          console.error("Erreur useSubscription:", error.message)
          setIsPremium(false)
        } else {
          setIsPremium(Boolean(data?.premium))
        }
      } catch (err) {
        console.error("Erreur useSubscription:", err)
        if (mounted) setIsPremium(false)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    checkPremium()

    return () => {
      mounted = false
    }
  }, [userId])

  async function activatePremium() {
    if (!userId) return

    const { error } = await supabase
      .from("profiles")
      .update({ premium: true })
      .eq("id", userId)

    if (!error) {
      setIsPremium(true)
    } else {
      console.error("Erreur activatePremium:", error.message)
    }
  }

  return {
    isPremium,
    loading,
    activatePremium,
  }
}