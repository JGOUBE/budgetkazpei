import { supabase } from "../supabase"
import { buildAssistantAiSummary } from "./assistantInsightsService.js"
import {
  ASSISTANT_INTENTS,
  answerAssistantQuestion,
  buildUnknownAssistantFallback,
} from "./assistantIntentEngine.js"
import { isAssistantKreol, normalizeAssistantLanguage } from "./assistantLanguage.js"
import { resolveAdvisorLanguage } from "../advisorLanguage.js"

type AssistantAnswer = {
  fr: string
  kr: string
  intent: string
  confidence: number
  dataUsed: Record<string, number>
  transparency: {
    fr: string
    kr: string
  }
  actions: Array<Record<string, string>>
  source: string
  responseLanguage?: "fr" | "kreol"
}

export type FinanceAssistantProvider = {
  name: string
  answer(input: { question: string; context: any }): Promise<AssistantAnswer>
}

function parseJsonAnswer(value: unknown) {
  if (!value) return null
  if (typeof value === "object") return value as Record<string, unknown>

  const raw = String(value).trim()
  const withoutFence = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim()

  const start = withoutFence.indexOf("{")
  const end = withoutFence.lastIndexOf("}")
  const candidate = start >= 0 && end > start ? withoutFence.slice(start, end + 1) : withoutFence

  try {
    return JSON.parse(candidate)
  } catch (_) {
    return null
  }
}

function buildAiPrompt({ question, summary, language }: { question: string; summary: any; language: string }) {
  return [
    "Tu réponds pour la rubrique Mon assistant de BudgetKazPéi.",
    "Retourne uniquement un JSON strict, sans Markdown et sans texte autour.",
    "Schéma obligatoire :",
    '{"answer":"...","actions":[{"type":"open_page","target":"statistics","label_fr":"Voir mes stats","label_kr":"War mes stats"}]}',
    "",
    "Règles :",
    "- réponse courte ;",
    "- chiffres uniquement issus du contexte ;",
    "- aucune invention ;",
    "- aucune garantie d'économie ;",
    "- aucune recommandation financière risquée ;",
    `- answer doit être entièrement en ${language === "kreol" ? "créole réunionnais simple" : "français correctement accentué"}, sans mélange spontané ;`,
    "- deux ou trois recommandations maximum.",
    "",
    `Langue active : ${language}`,
    `Question : ${question}`,
    "Contexte agrégé :",
    JSON.stringify(summary, null, 2),
  ].join("\n")
}

function normalizeAiAnswer(parsed: Record<string, unknown> | null, fallback: AssistantAnswer, language: string, rawText = ""): AssistantAnswer {
  const activeIsKreol = isAssistantKreol(language)

  if (parsed && typeof parsed.answer === "string") {
    const actions = Array.isArray(parsed.actions) ? parsed.actions as Array<Record<string, string>> : []

    return {
      ...fallback,
      fr: activeIsKreol ? fallback.fr : parsed.answer.slice(0, 900),
      kr: activeIsKreol ? parsed.answer.slice(0, 900) : fallback.kr,
      actions,
      source: "ai",
      confidence: 0.72,
      responseLanguage: activeIsKreol ? "kreol" : "fr",
    }
  }

  if (parsed && typeof parsed.fr === "string" && typeof parsed.kr === "string") {
    const actions = Array.isArray(parsed.actions) ? parsed.actions as Array<Record<string, string>> : []

    return {
      ...fallback,
      fr: parsed.fr.slice(0, 900),
      kr: parsed.kr.slice(0, 900),
      actions,
      source: "ai",
      confidence: 0.72,
      responseLanguage: activeIsKreol ? "kreol" : "fr",
    }
  }

  const cleanRaw = String(rawText || "").trim()
  if (cleanRaw) {
    return {
      ...fallback,
      fr: activeIsKreol ? fallback.fr : cleanRaw.slice(0, 900),
      kr: activeIsKreol ? cleanRaw.slice(0, 900) : fallback.kr,
      source: "ai",
      confidence: 0.55,
      responseLanguage: activeIsKreol ? "kreol" : "fr",
    }
  }

  return {
    ...fallback,
    responseLanguage: activeIsKreol ? "kreol" : "fr",
  }
}

async function answerWithSecureAi({ question, context, fallback }: { question: string; context: any; fallback: AssistantAnswer }) {
  if (!context?.user?.id) return fallback

  const interfaceLanguage = normalizeAssistantLanguage(context.language) === "kr" ? "kreol" : "fr"
  const language = resolveAdvisorLanguage({
    message: question,
    interfaceLanguage,
  })
  const summary = buildAssistantAiSummary(context.insights)
  const prompt = buildAiPrompt({
    question,
    summary,
    language,
  })

  const { data, error } = await supabase.functions.invoke("assistant-aisupabase", {
    body: {
      action: "finance_assistant_v2",
      question: prompt,
      originalQuestion: question,
      language,
      interfaceLanguage,
      isKreol: language === "kreol",
      isQuickPreset: false,
      profile: context.profile || {},
      subscription_plan: context.profile?.plan || context.profile?.subscription_plan || "free",
      localContext: summary,
    },
  })

  if (error || !data?.success) {
    return fallback
  }

  const parsed = parseJsonAnswer(data.financeAnswer || data.answer)
  return normalizeAiAnswer(parsed, fallback, language, data.answer)
}

export class LocalFinanceAssistantProvider implements FinanceAssistantProvider {
  name = "local-first-finance-assistant"

  async answer({ question, context }: { question: string; context: any }) {
    const fallback = answerAssistantQuestion({
      question,
      insights: context.insights,
    }) as AssistantAnswer

    if (fallback.intent !== ASSISTANT_INTENTS.UNKNOWN) {
      return fallback
    }

    const unknownFallback = buildUnknownAssistantFallback({
      insights: context.insights,
    }) as AssistantAnswer

    return answerWithSecureAi({
      question,
      context,
      fallback: unknownFallback,
    })
  }
}

export function getFinanceAssistantProvider(): FinanceAssistantProvider {
  return new LocalFinanceAssistantProvider()
}
