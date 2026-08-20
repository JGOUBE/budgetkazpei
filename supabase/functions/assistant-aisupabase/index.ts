import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { buildSystemPrompt } from "./prompts/systemPrompt.ts"
import {
  buildMemoryPrompt,
  loadAssistantMemory,
  mergeMemory,
  saveAssistantMemory,
} from "./memory/memory.ts"
import { analyzeIntent } from "./engine/intent/intentAnalyzer.ts"
import { buildAiMemoryPatch } from "./memory/memoryReasoner.ts"
import { checkProfileConsistency } from "./engine/profile/profileConsistency.ts"
import { evaluateTruth } from "./engine/truth/truthAnalyzer.ts"
import { buildTruthPrompt } from "./engine/truth/truthPrompt.ts"
import { reviewAssistantAnswer } from "./engine/review/reviewerEngine.ts"
import {
  getAdvisorAccess,
  isAdvancedAdvisorMode,
  parseAssistantMode,
  resolveServerPlan,
  shouldBlockAdvisorUsage,
  shouldMonitorAdvisorUsage,
  type AssistantMode,
} from "./accessPolicy.ts"
import {
  allowsBilingualAdvisorResponse,
  resolveAdvisorLanguage,
  selectAdvisorLocalizedContext,
  type AssistantLanguage,
} from "./language/languagePolicy.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

type AssistantContext = {
  userId: string
  body: any
  action: string
  mode: AssistantMode
  language: AssistantLanguage
  isKreol: boolean
  allowBilingualResponse: boolean
  question: string
  isQuickPreset: boolean
  consumesExchange: boolean
  profile: Record<string, unknown>
  plan: string
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
  void isQuickPreset
  return countMeaningfulWords(message) > 0
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


function buildConsistencyPrompt(consistency: any = null) {
  if (!consistency || typeof consistency !== "object") {
    return "État : non fourni.\nAucune analyse de cohérence structurée n'a été transmise."
  }

  const state = String(consistency.state || "ok").toUpperCase()
  const missing = Array.isArray(consistency.missing) ? consistency.missing : []
  const contradictions = Array.isArray(consistency.contradictions) ? consistency.contradictions : []
  const suggestions = Array.isArray(consistency.suggestions) ? consistency.suggestions : []

  if (
    state === "OK" &&
    missing.length === 0 &&
    contradictions.length === 0 &&
    suggestions.length === 0
  ) {
    return [
      "État : OK",
      "Aucune contradiction simple n'a été détectée entre le profil et la demande.",
      "Utilise le profil avec prudence sans faire de déduction non justifiée.",
    ].join("\n")
  }

  return [
    `État : ${state}`,
    "",
    "Informations manquantes détectées :",
    missing.length > 0 ? missing.map((item: string) => `- ${item}`).join("\n") : "- Aucune",
    "",
    "Contradictions détectées :",
    contradictions.length > 0
      ? contradictions.map((item: string) => `- ${item}`).join("\n")
      : "- Aucune",
    "",
    "Suggestions de prudence ou de mise à jour :",
    suggestions.length > 0
      ? suggestions.map((item: string) => `- ${item}`).join("\n")
      : "- Aucune",
  ].join("\n")
}

function buildUserPrompt(
  body: any,
  language: AssistantLanguage,
  mode: AssistantMode,
  memory: any = null,
  consistency: any = null,
  truthReport: any = null,
) {
  const originalQuestion = String(body.originalQuestion || body.question || "").trim()
  const profile = body.profile || {}
  const profileSummary = body.profile_summary || ""
  const localContext = body.localContext || body.local_context || {}
  const recommendedAides = body.recommendedAides || body.recommended_aides || []
  const reunionOrientation = body.reunionOrientation || body.reunion_orientation || {}
  const recentHistory = Array.isArray(body.recentHistory) ? body.recentHistory.slice(0, 6) : []
  const localizedHandoffContext = selectAdvisorLocalizedContext(body.advisorHandoffContext || {}, language)
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
  const consistencyPrompt = buildConsistencyPrompt(consistency)
  const truthPrompt = buildTruthPrompt(truthReport)
  const bilingualRequested = allowsBilingualAdvisorResponse(originalQuestion)
  const languageInstruction = bilingualRequested
    ? `LANGUE DE RÉPONSE : l'utilisateur demande explicitement une réponse bilingue ou une traduction. Respecte exactement cette demande et identifie clairement chaque langue.`
    : language === "kreol"
      ? `LANGUE DE SORTIE VERROUILLÉE : créole réunionnais simple uniquement. Garde seulement les noms officiels dans leur forme officielle. N'imite jamais la langue française présente dans la mémoire, l'historique ou le contexte technique.`
      : `LANGUE DE SORTIE VERROUILLÉE : français uniquement. N'emploie aucune tournure créole spontanée. Ignore la langue créole éventuellement présente dans la mémoire, l'historique ou le contexte technique.`

  const label = language === "kreol" ? "Demande utilisateur" : "Demande utilisateur"

  return `
${memoryPrompt}

${languageInstruction}

${label} :
${originalQuestion || body.question || ""}

Mode demandé par l'interface :
${mode}

Résumé du profil affiché par BudgetKazPei (source principale) :
${profileSummary || "Non fourni"}

Profil brut disponible (pour compléter uniquement si nécessaire) :
${safeJson(profile)}

Contexte local utile :
${safeJson(localContext)}

Contexte technique du handoff Aides, déjà sélectionné dans la langue de réponse :
${safeJson(localizedHandoffContext)}

Aides recommandées par BudgetKazPei à prioriser si pertinent :
${safeJson(recommendedAides.slice(0, 8), [])}

Repères locaux BudgetKazPei :
${safeJson(reunionOrientation, {})}

Conversation récente visible dans cette session :
${recentConversationPrompt}

La langue des échanges historiques ci-dessus est seulement du contenu mémorisé. Elle ne détermine jamais la langue de la nouvelle réponse.

ANALYSE DE COHÉRENCE BUDGETKAZPEI :
${consistencyPrompt}

${truthPrompt}

Consignes liées à l'analyse de cohérence :
- Si l'état indique CONTRADICTION, ne tranche pas : signale calmement l'écart et demande confirmation ou mise à jour du profil.
- Si l'état indique MISSING, pose seulement la question indispensable avant de conclure.
- Si l'état indique PROFILE_UPDATE, explique que la situation semble avoir changé et propose de vérifier le profil.
- Ne modifie jamais le profil automatiquement.
- Ne déduis jamais un salaire individuel à partir du revenu du foyer : le revenu du foyer peut inclure salaire, aides, RSA, chômage, pensions ou autres revenus.

Règle de continuité : si la demande actuelle est courte, incomplète ou ressemble à une précision, rattache-la au dernier échange pertinent au lieu de recommencer une réponse générale.

PRIORITÉ DE RAISONNEMENT BUDGETKAZPEI :
- Le profil transmis par BudgetKazPei est la source principale d'information utilisateur.
- Avant de répondre, utilise d'abord le profil connu, puis la mémoire, puis les aides recommandées, puis la demande actuelle.
- Ne redemande jamais une information déjà présente dans le profil ou dans la mémoire.
- Si tu t'appuies sur le profil, montre-le naturellement avec une phrase courte comme "D'après votre profil BudgetKazPei" ou "Compte tenu de votre situation", sans recopier tout le profil.
- Pose une question uniquement si une information indispensable manque réellement pour donner une réponse utile et prudente.
- Si une information du message utilisateur contredit le profil, signale calmement qu'il faut vérifier ou mettre à jour le profil.

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
  const requestedMode = body.assistantMode || body.mode || (action === "analyze_refusal" ? "comprendre_courrier" : action || "general")
  const mode = parseAssistantMode(requestedMode)
  const lastUserMessage = String(body.originalQuestion || body.refusalText || body.question || "")
  const interfaceLanguage = body.interfaceLanguage || body.interface_language || body.language || (body.isKreol === true ? "kreol" : "fr")
  const language = resolveAdvisorLanguage({
    message: lastUserMessage,
    interfaceLanguage,
    fallbackLanguage: "fr",
  })
  const isKreol = language === "kreol"
  const allowBilingualResponse = allowsBilingualAdvisorResponse(lastUserMessage)

  if (!mode) {
    return {
      error: jsonResponse(
        {
          success: false,
          code: "invalid_advisor_mode",
          error: isKreol ? "Mode konseye pa rekonèt." : "Mode du conseiller non reconnu.",
        },
        400,
      ),
    }
  }

  const question = String(body.originalQuestion || body.question || body.refusalText || "")
  const isQuickPreset = body.isQuickPreset === true || mode === "scan_profil"
  const consumesExchange = shouldConsumeAiExchange(question, isQuickPreset)

  const [profileResult, subscriptionResult] = await Promise.all([
    supabaseAdmin.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabaseAdmin
      .from("user_subscriptions")
      .select("plan, status, updated_at")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (profileResult.error) console.log("ADVISOR PROFILE LOAD ERROR", profileResult.error.message)
  if (subscriptionResult.error) console.log("ADVISOR SUBSCRIPTION LOAD ERROR", subscriptionResult.error.message)

  const profile = profileResult.data || {}
  const plan = resolveServerPlan({ profile, subscription: subscriptionResult.data })
  const access = getAdvisorAccess(plan)

  if (!access.canUseAdvisor) {
    return {
      error: jsonResponse(
        {
          success: false,
          code: "advisor_subscription_required",
          error: isKreol
            ? "Konseye BudgetKazPéi lé disponib avèk Premium."
            : "Le Conseiller BudgetKazPéi est disponible avec Premium.",
        },
        403,
      ),
    }
  }

  if ((isAdvancedAdvisorMode(mode) || action === "analyze_refusal") && !access.canUseAdvancedAdvisorTools) {
    return {
      error: jsonResponse(
        {
          success: false,
          code: "advanced_advisor_subscription_required",
          error: isKreol
            ? "Fonksion-la lé réservée pou Premium+."
            : "Cette fonctionnalité est réservée à Premium+.",
        },
        403,
      ),
    }
  }

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

  const usage = await ensureUsageRow(supabaseAdmin, userId)
  const used = Number(usage?.messages_used || 0)

  if (shouldBlockAdvisorUsage(plan, used, consumesExchange)) {
    return {
      error: jsonResponse(
        {
          success: false,
          quotaReached: true,
          code: "advisor_usage_limit_reached",
          error: isKreol
            ? "Out Konseye lé pou in ti moman indisponib. Ou pourra réutiliz ali lo prochain cycle."
            : "Votre Conseiller est temporairement indisponible. Vous pourrez à nouveau l’utiliser lors du prochain cycle.",
        },
        403,
      ),
    }
  }

  if (shouldMonitorAdvisorUsage(plan, used, consumesExchange)) {
    console.warn("ADVISOR_USAGE_MONITORING_THRESHOLD_REACHED", JSON.stringify({ plan, used }))
  }

  const memory = await loadAssistantMemory(supabaseAdmin, userId)
  const trustedBody = {
    ...body,
    profile,
    profile_summary: "",
  }
  delete trustedBody.isPremium
  delete trustedBody.isPremiumPlus
  delete trustedBody.subscription_plan
  delete trustedBody.plan

  const context: AssistantContext = {
    userId,
    body: trustedBody,
    action,
    mode,
    language,
    isKreol,
    allowBilingualResponse,
    question,
    isQuickPreset,
    consumesExchange,
    profile,
    plan,
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

    const consistency =
      context.action === "analyze_refusal"
        ? null
        : checkProfileConsistency(context.profile, context.question)

    const truthReport =
      context.action === "analyze_refusal"
        ? null
        : evaluateTruth(context.profile, context.memory, consistency, context.question)

    const userPrompt =
      context.action === "analyze_refusal"
        ? buildRefusalPrompt(context.body, context.language)
        : buildUserPrompt(
            context.body,
            context.language,
            context.mode,
            context.memory,
            consistency,
            truthReport,
          )

    const systemPrompt = buildSystemPrompt(
      context.language,
      context.action,
      context.mode,
      context.allowBilingualResponse,
    )

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
          consumed: false,
          error: context.isKreol
            ? "L'assistant IA lé indisponib pou linstan."
            : "L'assistant IA est indisponible pour le moment.",
          details: openAiResult.data?.error?.message || "Erreur OpenAI.",
        },
        502,
      )
    }

    const rawAnswer =
      openAiResult.data?.choices?.[0]?.message?.content ||
      (context.isKreol
        ? "Mi na pas réussi générer une réponse pou le moment."
        : "Je n’ai pas réussi à générer une réponse pour le moment.")

    const reviewResult =
      context.action === "analyze_refusal"
        ? {
            ok: true,
            qualityScore: 100,
            issues: [],
            revisedAnswer: rawAnswer,
          }
        : reviewAssistantAnswer(rawAnswer, context.language)

    const answer = reviewResult.revisedAnswer

    if (context.consumesExchange && answer) {
      await incrementUsage(supabaseAdmin, context.userId, context.used)
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
        consumed: context.consumesExchange,
        language: context.language,
        mode: context.mode,
        review: {
          ok: reviewResult.ok,
          qualityScore: reviewResult.qualityScore,
          issues: reviewResult.issues,
        },
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
