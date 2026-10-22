import { Capacitor, registerPlugin } from "@capacitor/core"
import { supabase } from "../supabase"

type GooglePlayOffer = {
  productId: string
  title?: string
  name?: string
  description?: string
  basePlanId: string
  offerId?: string | null
  offerToken: string
  formattedPrice?: string
  priceAmountMicros?: number
  priceCurrencyCode?: string
  billingPeriod?: string
}

type GooglePlayPurchase = {
  purchaseToken: string
  orderId?: string | null
  products?: string[]
  purchaseState?: number
  acknowledged?: boolean
  autoRenewing?: boolean
  purchaseTime?: number
  status?: "purchased" | "pending"
}

interface GooglePlayBillingPlugin {
  getSubscriptionOffers(options: { productId: string }): Promise<{ offers: GooglePlayOffer[] }>
  purchaseSubscription(options: {
    productId: string
    basePlanId: string
    obfuscatedAccountId?: string
  }): Promise<GooglePlayPurchase>
  restoreSubscriptions(): Promise<{ purchases: GooglePlayPurchase[] }>
}

const GooglePlayBilling = registerPlugin<GooglePlayBillingPlugin>("GooglePlayBilling")

export const GOOGLE_PLAY_PREMIUM_PRODUCT_ID =
  import.meta.env.VITE_GOOGLE_PLAY_PREMIUM_PRODUCT_ID || "budgetkazpei_premium"

export const GOOGLE_PLAY_MONTHLY_BASE_PLAN_ID =
  import.meta.env.VITE_GOOGLE_PLAY_MONTHLY_BASE_PLAN_ID || "monthly"

export const GOOGLE_PLAY_YEARLY_BASE_PLAN_ID =
  import.meta.env.VITE_GOOGLE_PLAY_YEARLY_BASE_PLAN_ID || "yearly"

export function isGooglePlayBillingAvailable() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android"
}

export async function getGooglePlayPremiumOffers() {
  if (!isGooglePlayBillingAvailable()) return []
  const { offers } = await GooglePlayBilling.getSubscriptionOffers({
    productId: GOOGLE_PLAY_PREMIUM_PRODUCT_ID,
  })
  return offers || []
}

async function verifyGooglePlayPurchase(purchase: GooglePlayPurchase, basePlanId?: string) {
  if (!purchase?.purchaseToken) {
    throw new Error("Jeton d'achat Google Play manquant")
  }

  const { data, error } = await supabase.functions.invoke("google-play-verify", {
    body: {
      purchaseToken: purchase.purchaseToken,
      productId: GOOGLE_PLAY_PREMIUM_PRODUCT_ID,
      basePlanId: basePlanId || null,
      orderId: purchase.orderId || null,
    },
  })

  if (error) throw error
  if (!data?.premium) {
    throw new Error(data?.error || "Abonnement Google Play non validé")
  }

  return data
}

export async function purchaseGooglePlayPremium({
  basePlanId,
  userId,
}: {
  basePlanId: string
  userId: string
}) {
  if (!isGooglePlayBillingAvailable()) {
    throw new Error("Google Play Billing est disponible uniquement dans l'application Android")
  }

  const purchase = await GooglePlayBilling.purchaseSubscription({
    productId: GOOGLE_PLAY_PREMIUM_PRODUCT_ID,
    basePlanId,
    obfuscatedAccountId: userId,
  })

  if (purchase.status === "pending") {
    return { pending: true, purchase }
  }

  const verification = await verifyGooglePlayPurchase(purchase, basePlanId)
  return { pending: false, purchase, verification }
}

export async function restoreGooglePlayPremium() {
  if (!isGooglePlayBillingAvailable()) return { restored: false }

  const { purchases } = await GooglePlayBilling.restoreSubscriptions()
  const matching = (purchases || []).find(purchase =>
    purchase.products?.includes(GOOGLE_PLAY_PREMIUM_PRODUCT_ID),
  )

  if (!matching?.purchaseToken) return { restored: false }

  const verification = await verifyGooglePlayPurchase(matching)
  return { restored: Boolean(verification?.premium), verification }
}
