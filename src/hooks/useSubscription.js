import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'

export function useSubscription(userId) {
  const [isPremium, setIsPremium] = useState(false)
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    if (!userId) return

    async function checkPremium() {
      const { data, error } = await supabase
        .from('profiles')
        .select('premium')
        .eq('id', userId)
        .single()

      if (!error && data) setIsPremium(data.premium)
      setLoading(false)
    }

    checkPremium()
  }, [userId])

  async function activatePremium() {
    const { error } = await supabase
      .from('profiles')
      .update({ premium: true })
      .eq('id', userId)

    if (!error) setIsPremium(true)
  }

  return { isPremium, loading, activatePremium }
}
