import { ADVISOR_MODES } from "../config/advisorAccess"

export const ADVISOR_PROMPT_EVENT = "budgetkazpei:assistant-prompt"
export const ADVISOR_HANDOFF_STORAGE_KEY = "budgetkazpei:advisor-handoff"
const HANDOFF_MAX_AGE_MS = 15 * 60 * 1000

function cleanText(value, maxLength = 1800) {
  return String(value || "").trim().slice(0, maxLength)
}

function sanitizeContext(context = {}) {
  return {
    aideId: context.aideId ?? null,
    aideNameFr: cleanText(context.aideNameFr, 180),
    aideNameKreol: cleanText(context.aideNameKreol, 180),
    category: cleanText(context.category, 100),
    status: cleanText(context.status, 60),
    description: cleanText(context.description, 900),
    steps: cleanText(context.steps, 1200),
    addedAt: cleanText(context.addedAt, 60),
  }
}

export function createAdvisorHandoff({ mode = "general", prompt, context = {} } = {}) {
  const safeMode = ADVISOR_MODES.includes(mode) ? mode : "general"

  return {
    version: 1,
    createdAt: Date.now(),
    mode: safeMode,
    prompt: cleanText(prompt, 5000),
    context: sanitizeContext(context),
  }
}

export function storeAdvisorHandoff(handoff) {
  if (typeof window === "undefined" || !handoff?.prompt) return false

  try {
    window.sessionStorage.setItem(ADVISOR_HANDOFF_STORAGE_KEY, JSON.stringify(handoff))
    return true
  } catch {
    return false
  }
}

export function consumeAdvisorHandoff() {
  if (typeof window === "undefined") return null

  try {
    const raw = window.sessionStorage.getItem(ADVISOR_HANDOFF_STORAGE_KEY)
    window.sessionStorage.removeItem(ADVISOR_HANDOFF_STORAGE_KEY)
    if (!raw) return null

    const handoff = JSON.parse(raw)
    if (!handoff?.prompt || Date.now() - Number(handoff.createdAt || 0) > HANDOFF_MAX_AGE_MS) {
      return null
    }

    return createAdvisorHandoff(handoff)
  } catch {
    return null
  }
}

export function dispatchAdvisorPrompt(handoff) {
  if (typeof window === "undefined" || !handoff?.prompt) return
  window.dispatchEvent(new CustomEvent(ADVISOR_PROMPT_EVENT, { detail: handoff }))
}

export function handoffToAdvisor(payload) {
  if (typeof window === "undefined") return
  const handoff = createAdvisorHandoff(payload)
  storeAdvisorHandoff(handoff)
  dispatchAdvisorPrompt(handoff)
  window.dispatchEvent(new CustomEvent("budgetkazpei:navigate", { detail: "conseiller" }))
}
