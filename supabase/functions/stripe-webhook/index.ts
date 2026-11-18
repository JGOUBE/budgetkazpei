import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
})

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SERVICE_ROLE_KEY")!
)

const PRICE_MAP: Record<
  string,
  { plan: "premium" | "premium_plus"; period: "monthly" | "yearly" }
> = {
  "price_1TkkITBQ1hdaYjbCbm0rfH3C": {
    plan: "premium",
    period: "monthly",
  },
  "price_1TkkITBQ1hdaYjbCvaiI0y4e": {
    plan: "premium",
    period: "yearly",
  },
  "price_1TkkISBQ1hdaYjbCk7QaDdnu": {
    plan: "premium",
    period: "monthly",
  },
  "price_1TkkIUBQ1hdaYjbCJQwgfJOo": {
    plan: "premium",
    period: "yearly",
  },
  // Single Premium tier annual 49,90 EUR. Legacy IDs are retained for renewals.
  "price_1Ud6LYBQ1hdaYjbC4exwaAwu": {
    plan: "premium",
    period: "yearly",
  },
}

// Legacy Stripe prices continue renewing without converting or recharging customers.
// Current purchases (4.99 monthly / 49.90 annual) are all the same Premium tier.
const PAID_EVENTS = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
])

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 })
  try {
    const event = await req.json()
    if (!PAID_EVENTS.has(String(event?.type || ""))) {
      return new Response("ignored", { status: 200 })
    }

    const eventObject = event?.data?.object || {}
    const subscriptionId = typeof eventObject.subscription === "string"
      ? eventObject.subscription
      : typeof eventObject.id === "string" && eventObject.id.startsWith("sub_")
        ? eventObject.id : null
    if (!subscriptionId) return new Response("subscription missing", { status: 200 })

    // The live Stripe subscription and customer are the source of truth.
    // Never trust the request's claimed customer email or payment status.
    const subscription = await stripe.subscriptions.retrieve(subscriptionId)
    const priceId = subscription.items?.data?.[0]?.price?.id || ""
    const config = PRICE_MAP[priceId]
    if (!config) return new Response("unknown legacy price", { status: 200 })
    const customerId = typeof subscription.customer === "string" ? subscription.customer : null
    if (!customerId) return new Response("customer missing", { status: 200 })
    const customer = await stripe.customers.retrieve(customerId)
    if (customer.deleted || !customer.email) return new Response("email unavailable", { status: 200 })
    const email = customer.email.trim().toLowerCase()
    const active = subscription.status === "active" || subscription.status === "trialing"
    const now = new Date().toISOString()

    const { data: matchingProfile, error: profileLookupError } = await supabase
      .from("profiles").select("id").eq("email", email).maybeSingle()
    if (profileLookupError) throw profileLookupError

    const { error: subscriptionError } = await supabase.from("user_subscriptions").upsert({
      email,
      user_id: matchingProfile?.id || null,
      plan: active ? "premium" : "free",
      billing_period: config.period,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      status: subscription.status,
      updated_at: now,
    }, { onConflict: "stripe_subscription_id" })
    if (subscriptionError) throw subscriptionError

    // An older plan or another concurrent subscription may still be active.
    // Never remove access when only one of multiple subscriptions was cancelled.
    const { data: paidSubscriptions, error: activeError } = await supabase
      .from("user_subscriptions")
      .select("stripe_subscription_id")
      .eq("email", email)
      .in("status", ["active", "trialing"])
      .limit(1)
    if (activeError) throw activeError
    const entitled = Boolean(paidSubscriptions?.length)

    const update = {
      plan: entitled ? "premium" : "free",
      premium: entitled,
      premium_plus: false,
      subscription_type: entitled ? config.period : "free",
      stripe_customer_id: customerId,
      stripe_subscription_id: entitled ? subscriptionId : null,
      stripe_subscription_status: entitled ? "active" : subscription.status,
      ...(entitled ? { premium_started_at: now } : { premium_cancel_at: now }),
    }
    const { error: updateError } = await supabase.from("profiles").update(update).eq("email", email)
    if (updateError) throw updateError

    console.info("BKP_STRIPE_SUBSCRIPTION_SYNC", JSON.stringify({
      eventType: event.type, entitled, knownPrice: true,
    }))
    return new Response("OK", { status: 200 })
  } catch (error) {
    console.error("STRIPE WEBHOOK ERROR", String(error))
    return new Response("ERROR", { status: 500 })
  }
})
