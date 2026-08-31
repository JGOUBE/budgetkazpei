import { supabase } from "../supabase"
import { buildAssistantAiSummary } from "./assistantInsightsService.js"
import {
  ASSISTANT_INTENTS,
  answerAssistantQuestion,
  buildUnknownAssistantFallback,
} from "./assistantIntentEngine.js"
import { isAssistantKreol, normalizeAssistantLanguage } from "./assistantLanguage.js"

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
    "Tu réponds pour la rubrique Mon assistant de BudgetKazPei.",
    "Retourne uniquement un JSON strict, sans Markdown et sans texte autour.",
    "Schéma obligatoire :",
    '{"fr":"...","kr":"...","actions":[{"type":"open_page","target":"statistics","label_fr":"Voir mes stats","label_kr":"War mes stats"}]}',
    "",
    "Règles :",
    "- réponse courte ;",
    "- chiffres uniquement issus du contexte ;",
    "- aucune invention ;",
    "- aucune garantie d'économie ;",
    "- aucune recommandation financière risquée ;",
    "- kr doit être en kréol réunionnais simple ;",
    "- fr doit être en français correctement accentué ;",
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

  if (parsed && typeof parsed.fr === "string" && typeof parsed.kr === "string") {
    const actions = Array.isArray(parsed.actions) ? parsed.actions as Array<Record<string, string>> : []

    return {
      ...fallback,
      fr: parsed.fr.slice(0, 900),
      kr: parsed.kr.slice(0, 900),
      actions,
      source: "ai",
      confidence: 0.72,
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
    }
  }

  return fallback
}

async function answerWithSecureAi({ question, context, fallback }: { question: string; context: any; fallback: AssistantAnswer }) {
  if (!context?.user?.id) return fallback

  const language = normalizeAssistantLanguage(context.language)
  const summary = buildAssistantAiSummary(context.insights)
  const prompt = buildAiPrompt({
    question,
    summary,
    language: language === "kr" ? "kreol" : "fr",
  })

  const { data, error } = await supabase.functions.invoke("assistant-aisupabase", {
    body: {
      action: "finance_assistant_v2",
      question: prompt,
      originalQuestion: question,
      language: language === "kr" ? "kreol" : "fr",
      isKreol: language === "kr",
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
