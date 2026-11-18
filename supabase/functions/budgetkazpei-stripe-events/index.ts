import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

type PriceData = { period: "monthly" | "yearly" }
const PRICE_MAP: Record<string, PriceData> = {
  // Historical subscriptions remain supported, but no longer marketed.
  price_1TkkITBQ1hdaYjbCbm0rfH3C: { period: "monthly" },
  price_1TkkITBQ1hdaYjbCvaiI0y4e: { period: "yearly" },
  price_1TkkISBQ1hdaYjbCk7QaDdnu: { period: "monthly" },
  price_1TkkIUBQ1hdaYjbCJQwgfJOo: { period: "yearly" },
  // Premium annual 49,90 EUR, November 2026.
  price_1Ud6LYBQ1hdaYjbC4exwaAwu: { period: "yearly" },
}
const LINK_MAP: Record<string, PriceData> = {
  plink_1TkkIWBQ1hdaYjbCquZnoXim: { period: "monthly" },
  plink_1TkkIWBQ1hdaYjbCDMiHzzmz: { period: "yearly" },
  plink_1TkkIWBQ1hdaYjbCmZ95g2HN: { period: "monthly" },
  plink_1TkkIWBQ1hdaYjbCwCQBO16A: { period: "yearly" },
  plink_1Ud6LhBQ1hdaYjbCEcp98DWc: { period: "yearly" },
}
const AUTHORIZED_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
])
const reply = (status: number, text: string) =>
  new Response(text, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } })
const asId = (value: unknown): string =>
  typeof value === "string" ? value : value && typeof value === "object" && "id" in value
    ? String((value as { id?: unknown }).id || "") : ""
const asEmail = (value: unknown): string =>
  String(value || "").trim().toLowerCase().slice(0, 255)
const safeInt = (value: unknown): number =>
  Number.isFinite(Number(value)) ? Math.max(0, Math.trunc(Number(value))) : 0

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function verifyStripeSignature(body: string, signature: string, secret: string) {
  const chunks = String(signature || "").split(",").map(x => x.trim())
  const timestamp = Number(chunks.find(x => x.startsWith("t="))?.slice(2))
  const signed = chunks.filter(x => x.startsWith("v1=")).map(x => x.slice(3))
  if (!Number.isSafeInteger(timestamp) || !timestamp || !signed.length) return false
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 300) return false
  const cryptoKey = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" },
    false, ["sign"],
  )
  const mac = new Uint8Array(await crypto.subtle.sign(
    "HMAC", cryptoKey, new TextEncoder().encode(timestamp + "." + body),
  ))
  const expected = Array.from(mac, n => n.toString(16).padStart(2, "0")).join("")
  return signed.some(value => constantTimeEqual(value, expected))
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return reply(405, "Method not allowed")
  const url = Deno.env.get("SUPABASE_URL")
  const roleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY")
  if (!url || !roleKey) return reply(503, "Service unavailable")
  const admin = createClient(url, roleKey, { auth: { persistSession: false } })

  // Retrieve only the signing secret from encrypted Vault; never expose it in
  // HTTP responses or logs. Deny all unsigned or replayed requests.
  const { data: signingSecret, error: vaultError } =
    await admin.rpc("get_budgetkazpei_stripe_signing_secret")
  if (vaultError || !signingSecret) {
    console.error("BKP_STRIPE_SIGNING_SECRET_UNAVAILABLE")
    return reply(503, "Service unavailable")
  }
  const raw = await request.text()
  if (raw.length > 1024 * 1024) return reply(413, "Payload too large")
  if (!await verifyStripeSignature(raw, request.headers.get("stripe-signature") || "",
    String(signingSecret))) return reply(400, "Invalid signature")

  let event: any
  try { event = JSON.parse(raw) } catch { return reply(400, "Invalid payload") }
  if (!event || !String(event.id || "").startsWith("evt_")) return reply(400, "Invalid event")
  if (!AUTHORIZED_EVENTS.has(String(event.type || ""))) return reply(200, "Ignored")
  const { data: replayed } = await admin.from("budgetkazpei_stripe_events")
    .select("event_id").eq("event_id", event.id).maybeSingle()
  if (replayed) return reply(200, "Already processed")

  const payload = event.data?.object || {}
  const checkout = String(event.type).startsWith("checkout.session.")
  const subscriptionId = asId(checkout ? payload.subscription : payload.id)
  const customerId = asId(payload.customer)
  if (!subscriptionId) return reply(200, "Ignored non-subscription checkout")

  let existing: any = null
  const { data: found, error: lookupError } = await admin.from("user_subscriptions")
    .select("id,email,user_id,plan,billing_period,stripe_payment_link,stripe_event_created")
    .eq("stripe_subscription_id", subscriptionId).maybeSingle()
  if (lookupError) return reply(503, "Subscription lookup failed")
  existing = found || null

  const paymentLinkId = asId(checkout ? payload.payment_link : existing?.stripe_payment_link)
  const priceId = asId(checkout ? payload.metadata?.price_id : payload.items?.data?.[0]?.price)
  const mapped = LINK_MAP[paymentLinkId] || PRICE_MAP[priceId] ||
    (existing?.billing_period ? { period: existing.billing_period } : null)
  if (!mapped) return reply(200, "Unrecognized price")

  const email = asEmail(
    checkout ? (payload.customer_details?.email || payload.customer_email) : existing?.email,
  )
  if (!email) {
    // Subscription events may arrive before the checkout event that provides
    // the verified customer email. Stripe retries are safe after checkout.
    return reply(200, "Awaiting checkout identity")
  }
  const incomingCreated = safeInt(event.created)
  if (existing && safeInt(existing.stripe_event_created) > incomingCreated) {
    await admin.from("budgetkazpei_stripe_events").upsert({ event_id: event.id })
    return reply(200, "Superseded event")
  }

  const { data: profileResult, error: profileError } = await admin.from("profiles")
    .select("id").eq("email", email).limit(1).maybeSingle()
  if (profileError) return reply(503, "Account lookup failed")
  const userId = profileResult?.id || existing?.user_id || null
  let status = checkout
    ? (payload.payment_status === "paid" || payload.payment_status === "no_payment_required"
      ? "active" : "incomplete")
    : String(payload.status || (event.type === "customer.subscription.deleted" ? "canceled" : "incomplete"))
  if (event.type === "customer.subscription.deleted") status = "canceled"

  const row = {
    stripe_subscription_id: subscriptionId,
    stripe_customer_id: customerId || existing?.stripe_customer_id || null,
    stripe_payment_link: paymentLinkId || existing?.stripe_payment_link || null,
    email,
    user_id: userId,
    plan: "premium",
    billing_period: mapped.period,
    status,
    billing_source: "stripe",
    stripe_event_created: incomingCreated,
    updated_at: new Date().toISOString(),
  }
  const { error: saveError } = await admin.from("user_subscriptions")
    .upsert(row, { onConflict: "stripe_subscription_id" })
  if (saveError) {
    console.error("BKP_STRIPE_SUBSCRIPTION_STORE_FAILED", saveError.code)
    return reply(503, "Unable to save subscription")
  }

  if (userId) {
    // Never remove access if another paid subscription (including an old Stripe
    // or Play Store plan) is still active.
    const { data: active, error: activeError } = await admin.from("user_subscriptions")
      .select("plan,billing_period,stripe_customer_id,stripe_subscription_id")
      .eq("user_id", userId).in("status", ["active", "trialing"])
      .order("updated_at", { ascending: false }).limit(1)
    if (activeError) return reply(503, "Unable to validate access")
    const selected = Array.isArray(active) ? active[0] : null
    const hasPaid = Boolean(selected)
    const { error: updateError } = await admin.from("profiles").update({
      plan: hasPaid ? "premium" : "free",
      premium: hasPaid,
      premium_plus: false,
      stripe_customer_id: selected?.stripe_customer_id || customerId || null,
      stripe_subscription_id: selected?.stripe_subscription_id || subscriptionId,
      stripe_subscription_status: hasPaid ? "active" : status,
      subscription_type: hasPaid ? selected?.billing_period : "free",
    }).eq("id", userId)
    if (updateError) return reply(503, "Unable to update access")
  }

  const { error: markError } = await admin.from("budgetkazpei_stripe_events")
    .upsert({ event_id: event.id })
  if (markError) return reply(503, "Unable to acknowledge event")
  console.info("BKP_STRIPE_EVENT_PROCESSED", { type: String(event.type), linked: Boolean(userId) })
  return reply(200, "OK")
})
