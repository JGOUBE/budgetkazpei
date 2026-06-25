import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { buildSystemPrompt } from "./prompts/systemPrompt.ts"
import {
  buildMemoryPrompt,
  loadAssistantMemory,
  mergeMemory,
  saveAssistantMemory,
} from "./memory/memory.ts"
import { analyzeIntent } from "./memory/intentAnalyzer.ts"
import { buildAiMemoryPatch } from "./memory/memoryReasoner.ts"

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

type AssistantLanguage = "fr" | "kreol"

type AssistantMode =
  | "general"
  | "trouver_aide"
  | "comprendre_courrier"
  | "preparer_dossier"
  | "generer_email"
  | "preparer_recours"
  | "preparer_rdv"
  | "scan_profil"

type AssistantContext = {
  userId: string
  body: any
  action: string
  mode: AssistantMode
  language: AssistantLanguage
  isKreol: boolean
  question: string
  isQuickPreset: boolean
  consumesExchange: boolean
  profile: Record<string, unknown>
  plan: string
  limit: number
  used: number
  usage: any
  memory: any
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

function safeJson(value: unknown, fallback: unknown = {}) {
  try {
    return JSON.stringify(value ?? fallback, null, 2)
  } catch (_) {
    return JSON.stringify(fallback, null, 2)
  }
}

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return Response.json(payload, {
    status,
    headers: corsHeaders,
  })
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

function getAiPlan(profile: Record<string, unknown> = {}, body: any = {}) {
  const rawPlan = normalizeText(
    String(
      body.subscription_plan ||
        body.plan ||
        profile.subscription_plan ||
        profile.plan ||
        "",
    ),
  )

  if (
    body.isPremiumPlus === true ||
    isTrue(body.isPremiumPlus) ||
    isTrue(profile.premium_plus) ||
    rawPlan.includes("premium_plus") ||
    rawPlan.includes("premium plus")
  ) {
    return "premium_plus"
  }

  if (
    body.isPremium === true ||
    isTrue(body.isPremium) ||
    isTrue(profile.premium) ||
    rawPlan.includes("premium")
  ) {
    return "premium"
  }

  return "free"
}
function looksLikeKreolText(value = "") {
  const text = ` ${normalizeText(value)} `

  const markers = [
    " mi ",
    " moin",
    " marmay",
    " larzan",
    " zed",
    " zede",
    " zot",
    " aou",
    " out ",
    " ou la ",
    " na ",
    " gagn",
    " kosa",
    " pou ",
    " ek ",
    " dann",
    " kaz",
    " renyon",
    " pei",
    " domann",
    " koman",
    " konsey",
    " kourrie",
    " travay",
    " led",
    " lé ",
    " i ",
    " marmailles",
    " marmaille",
    " koz",
    " koze",
    " zéd",
  ]

  return markers.some((marker) => text.includes(marker))
}

function detectAssistantLanguage(body: any): AssistantLanguage {
  const text = [
    body.originalQuestion,
    body.question,
    body.refusalText,
    body.profile_summary,
  ]
    .filter(Boolean)
    .join("\n")

  if (body.isKreol === true) return "kreol"

  if (looksLikeKreolText(text)) return "kreol"

  const explicitLanguage = normalizeText(String(body.language || ""))

  if (explicitLanguage === "kreol" || explicitLanguage === "creole") return "kreol"

  if (
    explicitLanguage === "fr" ||
    explicitLanguage === "francais" ||
    explicitLanguage === "french"
  ) {
    return "fr"
  }

  return "fr"
}

function getAssistantMode(rawMode = ""): AssistantMode {
  const mode = normalizeText(String(rawMode || "general")).replace(/\s+/g, "_")

  if (
    mode === "trouver_aide" ||
    mode === "comprendre_courrier" ||
    mode === "preparer_dossier" ||
    mode === "generer_email" ||
    mode === "preparer_recours" ||
    mode === "preparer_rdv" ||
    mode === "scan_profil"
  ) {
    return mode
  }

  return "general"
}

function buildRefusalPrompt(body: any, language: AssistantLanguage) {
  const refusalText = String(body.refusalText || body.originalQuestion || body.question || "").trim()
  const demarche = body.demarche || {}

  if (language === "kreol") {
    return `
Analyse seulement lo kourrié fourni ci-dessous.

Démarche ou aide concernée dans BudgetKazPei :
${safeJson(demarche)}

Kourrié ou message collé par l'utilisateur :
"""
${refusalText}
"""

Règles obligatoires :
- N'invente jamais rien.
- N'affirme jamais un motif qui n'est pas écrit.
- Ne promets jamais qu'un recours ou une nouvelle demande va marcher.
- Ne donne pas d'avis juridique.
- Ne reprends pas noms, prénoms, adresses, numéros de dossier ou données très personnelles.
- Si une information manque, écris : "Non indiqué dans le courrier".
- Réponds simplement, utilement, avec prudence.

Réponds avec une structure claire :
📄 Résumé du courrier
❌ Motifs explicitement mentionnés
📎 Documents ou informations demandés
🧭 Démarches évoquées dans le courrier
❓ Questions à poser à l'organisme
👉 Prochaine action concrète

Phrase finale si utile :
"Cette analyse aide à comprendre le courrier, mais seule la réponse de l'organisme fait foi."
`.trim()
  }

  return `
Analyse uniquement le courrier fourni ci-dessous.

Aide ou démarche concernée dans BudgetKazPei :
${safeJson(demarche)}

Courrier ou message collé par l'utilisateur :
"""
${refusalText}
"""

Règles obligatoires :
- Ne jamais inventer d'information.
- Ne jamais affirmer un motif qui n'est pas écrit dans le courrier.
- Ne jamais promettre qu'un recours ou une nouvelle demande aboutira.
- Ne pas donner d'avis juridique.
- Ne pas reprendre les noms, prénoms, adresses, numéros de dossier ou données très personnelles si le texte en contient.
- Si une information manque, écrire : "Non indiqué dans le courrier".
- Rester simple, clair, utile et prudent.

Réponds avec une structure claire :
📄 Résumé du courrier
❌ Motifs explicitement mentionnés
📎 Documents ou informations demandés
🧭 Démarches évoquées dans le courrier
❓ Questions à poser à l'organisme
👉 Prochaine action concrète

Phrase finale si utile :
"Cette analyse aide à comprendre le courrier, mais seule la réponse de l'organisme fait foi."
`.trim()
}

function buildUserPrompt(body: any, language: AssistantLanguage, mode: AssistantMode, memory: any = null) {
  const originalQuestion = String(body.originalQuestion || body.question || "").trim()
  const profile = body.profile || {}
  const profileSummary = body.profile_summary || ""
  const localContext = body.localContext || body.local_context || {}
  const recommendedAides = body.recommendedAides || body.recommended_aides || []
  const reunionOrientation = body.reunionOrientation || body.reunion_orientation || {}
  const recentHistory = Array.isArray(body.recentHistory) ? body.recentHistory.slice(0, 6) : []
  const memoryPrompt = buildMemoryPrompt(memory)
  const recentConversationPrompt = recentHistory.length > 0
    ? recentHistory
        .map((item: any, index: number) => {
          const userText = String(item?.question || "").slice(0, 600)
          const answerText = String(item?.answer || "").slice(0, 900)
          return [`Échange récent ${index + 1} :`, `Utilisateur : ${userText}`, answerText ? `Conseiller : ${answerText}` : ""].filter(Boolean).join("\n")
        })
        .join("\n\n")
    : "Aucun échange récent fourni par l'interface."
  const languageInstruction =
    language === "kreol"
      ? `LANGUE OBLIGATOIRE DE RÉPONSE : créole réunionnais simple. Réponds en créole réunionnais, pas en français standard. Tu peux garder les noms officiels des aides en français (CAF, APL, FSL, CCAS), mais les phrases doivent rester en style créole réunionnais naturel.`
      : `LANGUE OBLIGATOIRE DE RÉPONSE : français.`

  const label = language === "kreol" ? "Demande utilisateur" : "Demande utilisateur"

  return `
${memoryPrompt}

${languageInstruction}

${label} :
${originalQuestion || body.question || ""}

Mode demandé par l'interface :
${mode}

Résumé du profil affiché par BudgetKazPei :
${profileSummary || "Non fourni"}

Profil brut disponible :
${safeJson(profile)}

Contexte local utile :
${safeJson(localContext)}

Aides recommandées par BudgetKazPei à prioriser si pertinent :
${safeJson(recommendedAides.slice(0, 8), [])}

Repères locaux BudgetKazPei :
${safeJson(reunionOrientation, {})}

Conversation récente visible dans cette session :
${recentConversationPrompt}

Règle de continuité : si la demande actuelle est courte, incomplète ou ressemble à une précision, rattache-la au dernier échange pertinent au lieu de recommencer une réponse générale.

Consignes de réponse :
- Respecte strictement la langue obligatoire indiquée plus haut.
- Réponds comme le conseiller BudgetKazPei, pas comme un formulaire.
- Utilise le mode comme un comportement, pas comme une structure obligatoire.
- Utilise la mémoire si elle aide, sans la réciter.
- Ne répète pas le profil.
- Ne donne pas plus de 3 pistes principales sauf nécessité.
- Si une information manque, pose une seule question utile.
- Termine par une seule prochaine action concrète quand c'est pertinent.
`.trim()
}

async function saveAssistantConversation(
  supabaseAdmin: any,
  userId: string,
  body: any,
  answer: string,
  consumed: boolean,
  mode: AssistantMode,
  language: AssistantLanguage,
) {
  try {
    const { error } = await supabaseAdmin
      .from("assistant_conversations")
      .insert({
        user_id: userId,
        mode,
        language,
        question: String(body.originalQuestion || body.question || body.refusalText || "").slice(0, 4000),
        answer: answer.slice(0, 8000),
        consumed,
        created_at: new Date().toISOString(),
      })

    if (error) {
      console.log("Assistant conversation save ignored:", error.message)
    }
  } catch (error) {
    console.log("Assistant conversation save unavailable:", String(error))
  }
}


async function saveAiMemoryPatchIfNeeded(params: {
  supabaseAdmin: any
  userId: string
  baseMemory: any
  aiMemoryPatch: any
}) {
  const { supabaseAdmin, userId, baseMemory, aiMemoryPatch } = params

  if (!aiMemoryPatch || typeof aiMemoryPatch !== "object") {
    return baseMemory
  }

  try {
    const mergedMemory = mergeMemory(baseMemory || {}, {
      updated_at: new Date().toISOString(),
      stable_facts: aiMemoryPatch.stable_facts || {},
      case_state: aiMemoryPatch.case_state || {},
      living_case: aiMemoryPatch.living_case || {},
    } as any)

    const { error } = await supabaseAdmin
      .from("assistant_memory")
      .upsert(
        {
          user_id: userId,
          memory: mergedMemory,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      )

    if (error) {
      console.log("AI memory patch save ignored:", error.message)
      return baseMemory
    }

    return mergedMemory
  } catch (error) {
    console.log("AI memory patch save unavailable:", String(error))
    return baseMemory
  }
}

async function ensureUsageRow(supabaseAdmin: any, userId: string) {
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

  return usage
}

async function incrementUsage(supabaseAdmin: any, userId: string, currentUsed: number) {
  const currentMonth = getCurrentMonthNumber()
  const currentYear = getCurrentYearNumber()
  const nextUsed = currentUsed + 1

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

  return {
    usage: updatedUsage,
    used: nextUsed,
  }
}

async function callOpenAi(params: {
  openAiKey: string
  model: string
  systemPrompt: string
  userPrompt: string
  action: string
}) {
  const { openAiKey, model, systemPrompt, userPrompt, action } = params

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: action === "analyze_refusal" ? 0.15 : 0.45,
      max_tokens: action === "analyze_refusal" ? 1300 : 1100,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  })

  const data = await response.json()

  return {
    ok: response.ok,
    status: response.status,
    data,
  }
}

async function buildAssistantContext(params: {
  req: Request
  supabaseAdmin: any
}) {
  const { req, supabaseAdmin } = params

  const authHeader = req.headers.get("Authorization") || ""
  const token = authHeader.replace("Bearer ", "")

  if (!token) {
    return {
      error: jsonResponse(
        {
          success: false,
          error: "Utilisateur non authentifié.",
        },
        401,
      ),
    }
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token)

  if (userError || !userData?.user?.id) {
    return {
      error: jsonResponse(
        {
          success: false,
          error: "Session utilisateur invalide.",
        },
        401,
      ),
    }
  }

  const userId = userData.user.id
  const body = await req.json()

  const action = String(body.action || "")
  const mode = getAssistantMode(body.assistantMode || body.mode || action || "general")
  const language = detectAssistantLanguage(body)
  const isKreol = language === "kreol"

  const question = String(body.originalQuestion || body.question || body.refusalText || "")
  const isQuickPreset = body.isQuickPreset === true || mode === "scan_profil"
  const consumesExchange = shouldConsumeAiExchange(question, isQuickPreset)

  if (action === "analyze_refusal" && question.trim().length < 40) {
    return {
      error: jsonResponse(
        {
          success: false,
          error: isKreol
            ? "Le courrier fourni est trop court pour être analysé."
            : "Le courrier fourni est trop court pour être analysé.",
        },
        400,
      ),
    }
  }

  const profile = body.profile || {}
  const plan = getAiPlan(profile, body)
  const limit = AI_USAGE_LIMITS[plan] || AI_USAGE_LIMITS.free

  const usage = await ensureUsageRow(supabaseAdmin, userId)
  const used = Number(usage?.messages_used || 0)

  if (consumesExchange && used >= limit) {
    return {
      error: jsonResponse(
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
        403,
      ),
    }
  }

  const memory = await loadAssistantMemory(supabaseAdmin, userId)

  const context: AssistantContext = {
    userId,
    body,
    action,
    mode,
    language,
    isKreol,
    question,
    isQuickPreset,
    consumesExchange,
    profile,
    plan,
    limit,
    used,
    usage,
    memory,
  }

  return {
    context,
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    })
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

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

    const contextResult = await buildAssistantContext({
      req,
      supabaseAdmin,
    })

    if (contextResult.error) {
      return contextResult.error
    }

    const context = contextResult.context as AssistantContext

    const userPrompt =
      context.action === "analyze_refusal"
        ? buildRefusalPrompt(context.body, context.language)
        : buildUserPrompt(context.body, context.language, context.mode, context.memory)

    const systemPrompt = buildSystemPrompt(context.language, context.action, context.mode)

    const openAiResult = await callOpenAi({
      openAiKey,
      model,
      systemPrompt,
      userPrompt,
      action: context.action,
    })

    if (!openAiResult.ok) {
      console.log("OPENAI ERROR", JSON.stringify(openAiResult.data))

      return jsonResponse(
        {
          success: false,
          providerError: true,
          plan: context.plan,
          limit: context.limit,
          used: context.used,
          remaining: Math.max(0, context.limit - context.used),
          consumed: false,
          error: context.isKreol
            ? "L'assistant IA lé indisponib pou linstan."
            : "L'assistant IA est indisponible pour le moment.",
          details: openAiResult.data?.error?.message || "Erreur OpenAI.",
        },
        502,
      )
    }

    const answer =
      openAiResult.data?.choices?.[0]?.message?.content ||
      (context.isKreol
        ? "Mi na pas réussi générer une réponse pou le moment."
        : "Je n’ai pas réussi à générer une réponse pour le moment.")

    let finalUsage = context.usage
    let nextUsed = context.used

    if (context.consumesExchange && answer) {
      const usageUpdate = await incrementUsage(supabaseAdmin, context.userId, context.used)
      finalUsage = usageUpdate.usage
      nextUsed = usageUpdate.used
    }

    const savedMemory = await saveAssistantMemory(
      supabaseAdmin,
      context.userId,
      context.body,
      context.memory,
      answer,
      context.mode,
      context.language,
    )

    const intent = analyzeIntent(context.question, savedMemory || context.memory)

    if (intent.complexity === "complex") {
      const aiMemoryPatch = await buildAiMemoryPatch({
        openAiKey,
        model,
        currentMemory: savedMemory || context.memory,
        body: context.body,
        answer,
        mode: context.mode,
        language: context.language,
      })

      await saveAiMemoryPatchIfNeeded({
        supabaseAdmin,
        userId: context.userId,
        baseMemory: savedMemory || context.memory,
        aiMemoryPatch,
      })
    }

    await saveAssistantConversation(
      supabaseAdmin,
      context.userId,
      context.body,
      answer,
      context.consumesExchange,
      context.mode,
      context.language,
    )

    return jsonResponse(
      {
        success: true,
        answer,
        usage: finalUsage,
        plan: context.plan,
        limit: context.limit,
        used: nextUsed,
        remaining: Math.max(0, context.limit - nextUsed),
        consumed: context.consumesExchange,
        language: context.language,
        mode: context.mode,
      },
      200,
    )
  } catch (error) {
    console.log("ASSISTANT AI ERROR", String(error))

    return jsonResponse(
      {
        success: false,
        error: String(error),
      },
      500,
    )
  }
})