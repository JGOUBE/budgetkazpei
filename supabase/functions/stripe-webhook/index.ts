import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY")
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")

if (!stripeSecretKey) throw new Error("STRIPE_SECRET_KEY manquant")

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: "2024-06-20",
})

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
)

const PRICE_MAP: Record<
  string,
  { plan: "premium"; period: "monthly" | "yearly" }
> = {
  // Ancien Premium mensuel : conservé pour les abonnements déjà existants.
  "price_1TkkITBQ1hdaYjbCbm0rfH3C": { plan: "premium", period: "monthly" },
  "price_1TkkITBQ1hdaYjbCvaiI0y4e": { plan: "premium", period: "yearly" },

  // Ancien Premium+ : devient le Premium unique à 4,99 €.
  "price_1TkkISBQ1hdaYjbCk7QaDdnu": { plan: "premium", period: "monthly" },
  "price_1TkkIUBQ1hdaYjbCJQwgfJOo": { plan: "premium", period: "yearly" },
}

function response(message: string, status = 200) {
  return new Response(message, { status })
}

function isoFromUnix(value?: number | null) {
  return value ? new Date(value * 1000).toISOString() : null
}

async function customerEmail(customerId: string | null) {
  if (!customerId) return null
  const customer = await stripe.customers.retrieve(customerId)
  return customer.deleted ? null : customer.email
}

async function profileForEmail(email: string) {
  const { data } = await supabase
    .from("profiles")
    .select("id,email")
    .eq("email", email)
    .maybeSingle()

  return data
}

async function syncSubscription(params: {
  email: string
  customerId: string | null
  subscription: Stripe.Subscription
}) {
  const { email, customerId, subscription } = params
  const priceId = subscription.items.data[0]?.price.id || null
  if (!priceId || !PRICE_MAP[priceId]) {
    console.log("Stripe price ignored", { priceId, subscriptionId: subscription.id })
    return
  }

  const { plan, period } = PRICE_MAP[priceId]
  const active = subscription.status === "active" || subscription.status === "trialing"
  const expiresAt = isoFromUnix(subscription.current_period_end)
  const profile = await profileForEmail(email)

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      plan: active ? plan : "free",
      premium: active,
      is_premium: active,
      premium_plus: false,
      billing_source: "stripe",
      subscription_type: active ? period : "free",
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      stripe_subscription_status: subscription.status,
      premium_until: expiresAt,
      premium_started_at: active ? new Date().toISOString() : null,
      premium_cancel_at: active ? null : new Date().toISOString(),
    })
    .eq("email", email)

  if (profileError) throw profileError

  const { error: subscriptionError } = await supabase
    .from("user_subscriptions")
    .upsert(
      {
        user_id: profile?.id || null,
        email,
        plan: active ? plan : "free",
        billing_period: period,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id,
        status: subscription.status,
        billing_source: "stripe",
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "stripe_subscription_id" },
    )

  if (subscriptionError) throw subscriptionError
}

serve(async req => {
  if (req.method !== "POST") return response("method_not_allowed", 405)

  try {
    if (!webhookSecret) {
      console.error("STRIPE_WEBHOOK_SECRET manquant")
      return response("webhook_not_configured", 500)
    }

    const signature = req.headers.get("stripe-signature")
    if (!signature) return response("missing_signature", 400)

    const rawBody = await req.text()
    const event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      webhookSecret,
    )

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session
      const subscriptionId =
        typeof session.subscription === "string" ? session.subscription : null

      if (!subscriptionId) return response("ignored")

      const subscription = await stripe.subscriptions.retrieve(subscriptionId)
      const customerId =
        typeof subscription.customer === "string" ? subscription.customer : null
      const email =
        session.customer_details?.email ||
        session.customer_email ||
        await customerEmail(customerId)

      if (!email) return response("email_not_found", 400)

      await syncSubscription({ email, customerId, subscription })
      return response("ok")
    }

    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const subscription = event.data.object as Stripe.Subscription
      const customerId =
        typeof subscription.customer === "string" ? subscription.customer : null
      const email = await customerEmail(customerId)

      if (!email) return response("email_not_found", 400)

      await syncSubscription({ email, customerId, subscription })
      return response("ok")
    }

    return response("ignored")
  } catch (error) {
    console.error("STRIPE WEBHOOK ERROR:", error)
    return response("error", 400)
  }
})
