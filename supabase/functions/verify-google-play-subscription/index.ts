import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { importPKCS8, SignJWT } from "https://esm.sh/jose@5.9.6"

const PACKAGE_NAME = "com.budgetkazpei.app"
const PREMIUM_PRODUCT_ID = "budgetkazpei_premium"
const PREMIUM_BASE_PLANS = new Set(["monthly", "yearly"])

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

async function getGoogleAccessToken() {
  const raw = Deno.env.get("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON")
  if (!raw) throw new Error("google_play_service_account_missing")

  const serviceAccount = JSON.parse(raw)
  if (!serviceAccount?.client_email || !serviceAccount?.private_key) {
    throw new Error("google_play_service_account_invalid")
  }

  const now = Math.floor(Date.now() / 1000)
  const privateKey = await importPKCS8(serviceAccount.private_key, "RS256")
  const assertion = await new SignJWT({
    scope: "https://www.googleapis.com/auth/androidpublisher",
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(serviceAccount.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey)

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  })

  if (!response.ok) {
    console.error("Google OAuth error", response.status, await response.text())
    throw new Error("google_play_oauth_failed")
  }

  const payload = await response.json()
  if (!payload?.access_token) throw new Error("google_play_oauth_token_missing")
  return payload.access_token as string
}

async function getSubscriptionFromGoogle(purchaseToken: string) {
  const accessToken = await getGoogleAccessToken()
  const endpoint =
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(PACKAGE_NAME)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`

  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) {
    console.error("Google Play verification error", response.status, await response.text())
    if (response.status === 404) return null
    throw new Error("google_play_verification_failed")
  }

  return await response.json()
}

function resolveEntitlement(subscription: any, expectedProductId: string, expectedBasePlanId: string) {
  const lineItems = Array.isArray(subscription?.lineItems) ? subscription.lineItems : []
  const lineItem = lineItems.find((item: any) =>
    item?.productId === expectedProductId &&
    item?.offerDetails?.basePlanId === expectedBasePlanId
  )

  if (!lineItem?.expiryTime) {
    return { active: false, expiresAt: null, latestOrderId: null }
  }

  const expiresAt = new Date(lineItem.expiryTime)
  const notExpired = Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() > Date.now()
  const entitledStates = new Set([
    "SUBSCRIPTION_STATE_ACTIVE",
    "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
    "SUBSCRIPTION_STATE_CANCELED",
  ])

  return {
    active: notExpired && entitledStates.has(String(subscription?.subscriptionState || "")),
    expiresAt: Number.isFinite(expiresAt.getTime()) ? expiresAt.toISOString() : null,
    latestOrderId: lineItem?.latestSuccessfulOrderId || subscription?.latestOrderId || null,
  }
}

serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405)

  try {
    const authHeader = req.headers.get("Authorization") || ""
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : ""
    if (!token) return json({ error: "authentication_required" }, 401)

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    )

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token)
    const user = authData?.user
    if (authError || !user?.id || !user.email) {
      return json({ error: "invalid_session" }, 401)
    }

    const body = await req.json().catch(() => ({}))
    const purchaseToken = String(body?.purchaseToken || "").trim()
    const productId = String(body?.productId || "").trim()
    const basePlanId = String(body?.basePlanId || "").trim()

    if (!purchaseToken || productId !== PREMIUM_PRODUCT_ID || !PREMIUM_BASE_PLANS.has(basePlanId)) {
      return json({ error: "invalid_purchase_payload" }, 400)
    }

    const subscription = await getSubscriptionFromGoogle(purchaseToken)
    if (!subscription) return json({ error: "purchase_not_found" }, 404)

    const entitlement = resolveEntitlement(subscription, productId, basePlanId)
    const status = entitlement.active ? "active" : "inactive"
    const billingPeriod = basePlanId === "yearly" ? "yearly" : "monthly"
    const now = new Date().toISOString()

    const row = {
      user_id: user.id,
      email: user.email,
      plan: entitlement.active ? "premium" : "free",
      billing_period: billingPeriod,
      status,
      billing_source: "google_play",
      google_play_purchase_token: purchaseToken,
      google_play_product_id: productId,
      google_play_base_plan_id: basePlanId,
      expires_at: entitlement.expiresAt,
      latest_order_id: entitlement.latestOrderId,
      updated_at: now,
    }

    const { data: existing, error: lookupError } = await supabaseAdmin
      .from("user_subscriptions")
      .select("id")
      .eq("billing_source", "google_play")
      .eq("google_play_purchase_token", purchaseToken)
      .maybeSingle()

    if (lookupError) throw lookupError

    const subscriptionWrite = existing?.id
      ? supabaseAdmin.from("user_subscriptions").update(row).eq("id", existing.id)
      : supabaseAdmin.from("user_subscriptions").insert(row)

    const { error: subscriptionError } = await subscriptionWrite
    if (subscriptionError) throw subscriptionError

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({
        premium: entitlement.active,
        premium_plus: false,
        subscription_type: entitlement.active ? billingPeriod : "free",
      })
      .eq("id", user.id)

    if (profileError) throw profileError

    return json({
      ok: true,
      plan: entitlement.active ? "premium" : "free",
      status,
      billingPeriod,
      expiresAt: entitlement.expiresAt,
    })
  } catch (error) {
    console.error("GOOGLE PLAY VERIFY ERROR", error)
    return json({ error: "google_play_verification_internal_error" }, 500)
  }
})
