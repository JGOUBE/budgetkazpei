import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const AI_USAGE_LIMITS: Record<string, number> = {
  free: 5,
  premium: 50,
  premium_plus: 250,
}

function normalizeText(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

function isTrue(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1"
}

function getAiPlan(profile: Record<string, unknown> = {}) {
  const rawPlan = normalizeText(String(profile.subscription_plan || profile.plan || ""))

  if (
    isTrue(profile.premium_plus) ||
    rawPlan.includes("premium_plus") ||
    rawPlan.includes("premium plus")
  ) {
    return "premium_plus"
  }

  if (isTrue(profile.premium) || rawPlan.includes("premium")) {
    return "premium"
  }

  return "free"
}

function getCurrentMonthNumber() {
  return new Date().getMonth() + 1
}

function getCurrentYearNumber() {
  return new Date().getFullYear()
}

function countMeaningfulWords(value = "") {
  return normalizeText(value)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length
}

function shouldConsumeAiExchange(message = "", isQuickPreset = false) {
  if (isQuickPreset) return false
  if (!message.trim()) return false
  return countMeaningfulWords(message) > 2
}

function buildSystemPrompt(isKreol: boolean) {
  return isKreol
    ? `Ou lé konseye BudgetKazPei pou La Rényon. Répond an kréol réunionnais simple, mélangé fransé si besoin. Ou dois orient l'utilisateur vers bann aides possibles, expliquer clairement, rester prudent, et rappeler que décision finale dépend organisme officiel.`
    : `Tu es le conseiller BudgetKazPei pour La Réunion. Réponds en français simple, concret et rassurant. Oriente l'utilisateur vers les aides possibles, explique les démarches, reste prudent, et rappelle que la décision finale dépend de l'organisme officiel.`
}

function buildUserPrompt(body: any) {
  return `
Question utilisateur :
${body.question || ""}

Profil utilisateur :
${JSON.stringify(body.profile || {}, null, 2)}

Aides recommandées par BudgetKazPei :
${JSON.stringify((body.recommendedAides || []).slice(0, 8), null, 2)}

Réponds avec :
1. Une réponse courte et humaine.
2. Les aides les plus pertinentes.
3. Pourquoi elles peuvent correspondre.
4. Les documents ou démarches à préparer.
5. Une prochaine action concrète.
`
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const serviceRoleKey =
      Deno.env.get("SERVICE_ROLE_KEY") ||
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

    const openAiKey = Deno.env.get("OPENAI_API_KEY")
    const model = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini"

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Configuration Supabase manquante : SUPABASE_URL ou SERVICE_ROLE_KEY absent.")
    }

    if (!openAiKey) {
      throw new Error("OPENAI_API_KEY manquante.")
    }

    const authHeader = req.headers.get("Authorization") || ""
    const token = authHeader.replace("Bearer ", "")

    if (!token) {
      return Response.json(
        { success: false, error: "Utilisateur non authentifié." },
        { status: 401, headers: corsHeaders }
      )
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token)

    if (userError || !userData?.user?.id) {
      return Response.json(
        { success: false, error: "Session utilisateur invalide." },
        { status: 401, headers: corsHeaders }
      )
    }

    const userId = userData.user.id
    const body = await req.json()

    const question = String(body.question || "")
    const isQuickPreset = body.isQuickPreset === true
    const isKreol = body.isKreol === true
    const consumesExchange = shouldConsumeAiExchange(question, isQuickPreset)

    const profile = body.profile || {}
    const plan = getAiPlan(profile)
    const limit = AI_USAGE_LIMITS[plan] || AI_USAGE_LIMITS.free

    const currentMonth = getCurrentMonthNumber()
    const currentYear = getCurrentYearNumber()

    let { data: usage, error: usageError } = await supabaseAdmin
      .from("ai_usage")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle()

    if (usageError) throw usageError

    if (!usage) {
      const { data: createdUsage, error: createError } = await supabaseAdmin
        .from("ai_usage")
        .insert({
          user_id: userId,
          reset_month: currentMonth,
          reset_year: currentYear,
          messages_used: 0,
          updated_at: new Date().toISOString(),
        })
        .select()
        .maybeSingle()

      if (createError) throw createError
      usage = createdUsage
    }

    const savedMonth = Number(usage?.reset_month || 0)
    const savedYear = Number(usage?.reset_year || 0)

    if (savedMonth !== currentMonth || savedYear !== currentYear) {
      const { data: resetUsage, error: resetError } = await supabaseAdmin
        .from("ai_usage")
        .update({
          reset_month: currentMonth,
          reset_year: currentYear,
          messages_used: 0,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .select()
        .maybeSingle()

      if (resetError) throw resetError
      usage = resetUsage
    }

    const used = Number(usage?.messages_used || 0)

    if (consumesExchange && used >= limit) {
      return Response.json(
        {
          success: false,
          quotaReached: true,
          plan,
          limit,
          used,
          remaining: 0,
          error: isKreol
            ? "Ou la itilize tout out échanges pou sa mwa-la."
            : "Vous avez utilisé tous vos échanges du mois.",
        },
        { status: 403, headers: corsHeaders }
      )
    }

    const openAiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        max_tokens: 900,
        messages: [
          { role: "system", content: buildSystemPrompt(isKreol) },
          { role: "user", content: buildUserPrompt(body) },
        ],
      }),
    })

    const openAiData = await openAiResponse.json()

    if (!openAiResponse.ok) {
      console.log("OPENAI ERROR", JSON.stringify(openAiData))

      return Response.json(
        {
          success: false,
          providerError: true,
          plan,
          limit,
          used,
          remaining: Math.max(0, limit - used),
          consumed: false,
          error: isKreol
            ? "L'assistant IA lé indisponib pou linstan."
            : "L'assistant IA est indisponible pour le moment.",
          details: openAiData?.error?.message || "Erreur OpenAI.",
        },
        { status: 502, headers: corsHeaders }
      )
    }

    let finalUsage = usage
    let nextUsed = used

    const answer =
      openAiData?.choices?.[0]?.message?.content ||
      (isKreol
        ? "Mi na pas réussi générer une réponse pou le moment."
        : "Je n’ai pas réussi à générer une réponse pour le moment.")

    if (consumesExchange && answer) {
      nextUsed = used + 1

      const { data: updatedUsage, error: updateError } = await supabaseAdmin
        .from("ai_usage")
        .update({
          messages_used: nextUsed,
          reset_month: currentMonth,
          reset_year: currentYear,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .select()
        .maybeSingle()

      if (updateError) throw updateError
      finalUsage = updatedUsage
    }

    return Response.json(
      {
        success: true,
        answer,
        usage: finalUsage,
        plan,
        limit,
        used: nextUsed,
        remaining: Math.max(0, limit - nextUsed),
        consumed: consumesExchange,
      },
      { status: 200, headers: corsHeaders }
    )
  } catch (error) {
    console.log("ASSISTANT AI ERROR", String(error))

    return Response.json(
      {
        success: false,
        error: String(error),
      },
      { status: 500, headers: corsHeaders }
    )
  }
})