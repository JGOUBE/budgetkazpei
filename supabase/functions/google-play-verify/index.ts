import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { JWT } from "npm:google-auth-library@9.15.1"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function json(payload: Record<string, unknown>, status = 200) {
  return Response.json(payload, { status, headers: corsHeaders })
}

function parseServiceAccount() {
  const raw = Deno.env.get("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON")
  if (!raw) throw new Error("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON manquant")
  const parsed = JSON.parse(raw)
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("Compte de service Google Play invalide")
  }
  return parsed
}

async function getAndroidPublisherToken() {
  const serviceAccount = parseServiceAccount()
  const auth = new JWT({
    email: serviceAccount.client_email,
    key: serviceAccount.private_key,
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  })
  const token = await auth.getAccessToken()
  if (!token.token) throw new Error("Impossible d'obtenir le jeton Android Publisher")
  return token.token
}

function isEntitled(subscription: any) {
  const entitledStates = new Set([
    "SUBSCRIPTION_STATE_ACTIVE",
    "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
    "SUBSCRIPTION_STATE_CANCELED",
  ])

  if (!entitledStates.has(String(subscription?.subscriptionState || ""))) return false

  const expiries = Array.isArray(subscription?.lineItems)
    ? subscription.lineItems
        .map((line: any) => Date.parse(line?.expiryTime || ""))
        .filter((value: number) => Number.isFinite(value))
    : []

  return expiries.length > 0 && Math.max(...expiries) > Date.now()
}

function latestExpiry(subscription: any) {
  const values = Array.isArray(subscription?.lineItems)
    ? subscription.lineItems
        .map((line: any) => line?.expiryTime)
        .filter(Boolean)
    : []
  return values.sort().at(-1) || null
}

function detectedBasePlanId(subscription: any) {
  const line = Array.isArray(subscription?.lineItems) ? subscription.lineItems[0] : null
  return line?.offerDetails?.basePlanId || null
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405)

  try {
    const authorization = req.headers.get("Authorization") || ""
    if (!authorization.startsWith("Bearer ")) return json({ error: "authentication_required" }, 401)

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY")!

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    })
    const admin = createClient(supabaseUrl, serviceRoleKey)

    const { data: userData, error: userError } = await userClient.auth.getUser()
    const user = userData?.user
    if (userError || !user?.id || !user.email) return json({ error: "authentication_required" }, 401)

    const body = await req.json()
    const purchaseToken = String(body?.purchaseToken || "").trim()
    const requestedProductId = String(body?.productId || "").trim()
    const requestedBasePlanId = String(body?.basePlanId || "").trim() || null

    const packageName = Deno.env.get("GOOGLE_PLAY_PACKAGE_NAME") || "com.budgetkazpei.app"
    const premiumProductId =
      Deno.env.get("GOOGLE_PLAY_PREMIUM_PRODUCT_ID") || "budgetkazpei_premium"

    if (!purchaseToken) return json({ error: "purchase_token_required" }, 400)
    if (requestedProductId !== premiumProductId) return json({ error: "invalid_product" }, 400)

    const accessToken = await getAndroidPublisherToken()
    const endpoint =
      `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`

    const googleResponse = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!googleResponse.ok) {
      const errorText = await googleResponse.text()
      console.error("GOOGLE_PLAY_VERIFY_FAILED", googleResponse.status, errorText)
      return json({ error: "google_play_verification_failed" }, 400)
    }

    const subscription = await googleResponse.json()
    const productIds = Array.isArray(subscription?.lineItems)
      ? subscription.lineItems.map((line: any) => line?.productId).filter(Boolean)
      : []

    if (!productIds.includes(premiumProductId)) {
      return json({ error: "purchase_does_not_match_premium" }, 400)
    }

    const entitled = isEntitled(subscription)
    const expiry = latestExpiry(subscription)
    const basePlanId = detectedBasePlanId(subscription) || requestedBasePlanId
    const billingPeriod = basePlanId === "yearly" ? "yearly" : "monthly"
    const state = String(subscription?.subscriptionState || "unknown")
    const latestOrderId = subscription?.latestOrderId || body?.orderId || null

    const profileUpdate = {
      premium: entitled,
      is_premium: entitled,
      premium_plus: false,
      plan: entitled ? "premium" : "free",
      subscription_type: entitled ? billingPeriod : "free",
      billing_source: "google_play",
      premium_until: expiry,
      premium_started_at: entitled ? new Date().toISOString() : null,
      premium_cancel_at: entitled ? null : new Date().toISOString(),
    }

    const { error: profileError } = await admin
      .from("profiles")
      .update(profileUpdate)
      .eq("id", user.id)

    if (profileError) throw profileError

    const { error: subscriptionError } = await admin
      .from("user_subscriptions")
      .upsert(
        {
          user_id: user.id,
          email: user.email,
          plan: entitled ? "premium" : "free",
          billing_period: billingPeriod,
          status: entitled ? "active" : state.toLowerCase(),
          billing_source: "google_play",
          google_play_purchase_token: purchaseToken,
          google_play_product_id: premiumProductId,
          google_play_base_plan_id: basePlanId,
          expires_at: expiry,
          latest_order_id: latestOrderId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "google_play_purchase_token" },
      )

    if (subscriptionError) throw subscriptionError

    // L'accusé de réception n'est tenté qu'après activation du droit Premium.
    if (entitled && subscription?.acknowledgementState !== "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED") {
      const acknowledgeEndpoint =
        `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/subscriptions/${encodeURIComponent(premiumProductId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`
      const acknowledgeResponse = await fetch(acknowledgeEndpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      })

      if (!acknowledgeResponse.ok) {
        console.warn("GOOGLE_PLAY_ACKNOWLEDGE_FAILED", acknowledgeResponse.status)
      }
    }

    return json({
      premium: entitled,
      plan: entitled ? "premium" : "free",
      billingSource: "google_play",
      billingPeriod,
      expiresAt: expiry,
      state,
    })
  } catch (error) {
    console.error("GOOGLE_PLAY_VERIFY_ERROR", error)
    return json({ error: "google_play_verify_internal_error" }, 500)
  }
})
