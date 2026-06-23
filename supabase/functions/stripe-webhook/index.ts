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
    plan: "premium_plus",
    period: "monthly",
  },
  "price_1TkkIUBQ1hdaYjbCJQwgfJOo": {
    plan: "premium_plus",
    period: "yearly",
  },
}

serve(async (req) => {
  try {
    const event = await req.json()

    let email: string | null = null
    let customerId: string | null = null
    let subscriptionId: string | null = null
    let priceId: string | null = null
    let status: string | null = null

    if (event.type === "checkout.session.completed") {
      const session = event.data.object

      email = session.customer_details?.email || session.customer_email || null
      customerId = typeof session.customer === "string" ? session.customer : null
      subscriptionId =
        typeof session.subscription === "string" ? session.subscription : null

      if (subscriptionId) {
        const sub = await stripe.subscriptions.retrieve(subscriptionId)
        priceId = sub.items.data[0]?.price.id ?? null
        status = sub.status
      }
    }

    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated"
    ) {
      const sub = event.data.object

      subscriptionId = sub.id
      customerId = typeof sub.customer === "string" ? sub.customer : null
      priceId = sub.items?.data?.[0]?.price?.id ?? null
      status = sub.status

      if (customerId) {
        const customer = await stripe.customers.retrieve(customerId)

        if (!customer.deleted) {
          email = customer.email
        }
      }
    }

    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object
      customerId = typeof sub.customer === "string" ? sub.customer : null

      if (customerId) {
        const customer = await stripe.customers.retrieve(customerId)

        if (!customer.deleted && customer.email) {
          await supabase
            .from("profiles")
            .update({
              premium: false,
              premium_plus: false,
              subscription_type: "free",
              stripe_subscription_status: "canceled",
              premium_cancel_at: new Date().toISOString(),
            })
            .eq("email", customer.email)
        }
      }

      return new Response("subscription canceled", { status: 200 })
    }

    if (!email || !priceId || !PRICE_MAP[priceId]) {
      console.log("Ignored event", { type: event.type, email, priceId })
      return new Response("ignored", { status: 200 })
    }

    const { plan, period } = PRICE_MAP[priceId]
    const active = status === "active" || status === "trialing"

    await supabase
      .from("profiles")
      .update({
        premium: active,
        premium_plus: active && plan === "premium_plus",
        subscription_type: active ? period : "free",
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        stripe_subscription_status: status,
        premium_started_at: active ? new Date().toISOString() : null,
      })
      .eq("email", email)

    await supabase.from("user_subscriptions").insert({
      email,
      plan: active ? plan : "free",
      billing_period: period,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      status,
      updated_at: new Date().toISOString(),
    })

    return new Response("OK", { status: 200 })
  } catch (error) {
    console.error("STRIPE WEBHOOK ERROR:", error)
    return new Response("ERROR", { status: 500 })
  }
})