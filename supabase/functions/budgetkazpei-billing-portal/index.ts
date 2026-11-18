import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
})

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (request.method !== "POST") return json({ success: false, code: "method_not_allowed" }, 405)

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const adminKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY")
  const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY")
  const token = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return json({ success: false, code: "authentication_required" }, 401)
  if (!supabaseUrl || !adminKey || !stripeSecret) {
    console.error("BKP_BILLING_PORTAL_SERVICE_UNAVAILABLE")
    return json({ success: false, code: "service_unavailable" }, 503)
  }

  try {
    const supabaseAdmin = createClient(supabaseUrl, adminKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !authData?.user) {
      return json({ success: false, code: "authentication_required" }, 401)
    }

    // Stripe customer ids are read from verified server-side subscriptions,
    // never accepted from the client. A paid user must not be sent to a
    // second checkout when clicking "Gérer mon offre".
    const { data: subscriptions, error: subscriptionError } = await supabaseAdmin
      .from("user_subscriptions")
      .select("stripe_customer_id,stripe_subscription_id,status,billing_source,updated_at")
      .eq("user_id", authData.user.id)
      .in("status", ["active", "trialing"])
      .order("updated_at", { ascending: false })
      .limit(20)
    if (subscriptionError) {
      console.error("BKP_BILLING_PORTAL_LOOKUP_ERROR", subscriptionError.code)
      return json({ success: false, code: "service_unavailable" }, 503)
    }

    const current = (subscriptions || []).find(row =>
      typeof row.stripe_customer_id === "string" &&
      row.stripe_customer_id.startsWith("cus_") &&
      typeof row.stripe_subscription_id === "string" &&
      row.stripe_subscription_id.startsWith("sub_") &&
      row.billing_source !== "google_play"
    )
    if (!current) return json({ success: false, code: "no_stripe_subscription" }, 404)

    const requestBody = new URLSearchParams({
      customer: current.stripe_customer_id,
      configuration: "bpc_1Ud6tuBQ1hdaYjbC3il5avGu",
      return_url: "https://budgetkazpei.re/app",
    })
    const response = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + stripeSecret,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: requestBody,
    })
    if (!response.ok) {
      console.error("BKP_BILLING_PORTAL_STRIPE_ERROR", response.status)
      return json({ success: false, code: "service_unavailable" }, 503)
    }
    const result = await response.json()
    const portalUrl = String(result?.url || "")
    if (!portalUrl.startsWith("https://billing.stripe.com/")) {
      console.error("BKP_BILLING_PORTAL_INVALID_URL")
      return json({ success: false, code: "service_unavailable" }, 503)
    }
    return json({ success: true, url: portalUrl })
  } catch (error) {
    console.error("BKP_BILLING_PORTAL_ERROR", String(error).slice(0, 180))
    return json({ success: false, code: "service_unavailable" }, 503)
  }
})
