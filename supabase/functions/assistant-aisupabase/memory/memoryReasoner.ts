export type MemoryReasonerLanguage = "fr" | "kreol" | string

export type MemoryReasonerInput = {
  openAiKey: string
  model: string
  currentMemory: any
  body: any
  answer: string
  mode: string
  language: MemoryReasonerLanguage
}

export async function buildAiMemoryPatch({
  openAiKey,
  model,
  currentMemory,
  body,
  answer,
  mode,
  language,
}: MemoryReasonerInput) {
  const question = String(body?.originalQuestion || body?.question || body?.refusalText || "").trim()

  if (!openAiKey || !question) {
    return null
  }

  const systemPrompt = `
Tu es le moteur de mémoire de BudgetKazPei.

Ton rôle :
Analyser le dernier échange utilisateur/conseiller et produire une mise à jour JSON de mémoire.

Tu ne réponds pas à l'utilisateur.
Tu ne donnes aucun conseil.
Tu produis uniquement un JSON valide.

RÈGLES IMPORTANTES :
- N'invente jamais une information.
- Ne déduis pas un fait durable si ce n'est pas clairement indiqué.
- Si une information est incertaine, place-la plutôt dans "open_questions" ou "last_updates".
- Si une nouvelle information contredit une ancienne, garde la plus récente et signale le changement.
- Ne stocke jamais nom, prénom, adresse exacte, numéro CAF, téléphone, email, numéro de dossier.
- Ne stocke que ce qui peut aider un futur conseil administratif ou budgétaire.
- Si un refus est mentionné, la prochaine action prioritaire devient comprendre le motif du refus.
- Si une démarche est déjà faite, ne la remets pas comme nouvelle démarche à conseiller.
- Si un dossier est en attente, la prochaine action doit suivre l'état du dossier, pas repartir de zéro.

FORMAT STRICT :
Retourne uniquement un objet JSON avec cette forme :

{
  "stable_facts": {
    "commune": "",
    "children_count": null,
    "family_situation": "",
    "housing_status": "",
    "professional_status": "",
    "household_income": null,
    "caf_recipient": null,
    "benefits": [],
    "goals": [],
    "current_needs": [],
    "procedures": [],
    "blockers": [],
    "preferences": [],
    "last_updates": []
  },
  "case_state": {
    "housing": "",
    "caf": "",
    "ccas": "",
    "france_travail": "",
    "mdph": "",
    "budget": "",
    "documents": [],
    "appointments": [],
    "refusals": []
  },
  "living_case": {
    "summary": "",
    "active_subject": "",
    "active_need": "",
    "priority": "",
    "next_action": "",
    "open_questions": [],
    "active_procedures": [],
    "completed_procedures": [],
    "blocked_procedures": [],
    "documents_to_prepare": [],
    "documents_already_mentioned": [],
    "do_not_repeat": [],
    "timeline": []
  }
}

Dans "timeline", chaque élément doit être :
{
  "date": "ISO_DATE",
  "type": "info|need|procedure|document|appointment|refusal|blocker|update",
  "subject": "",
  "status": "active|pending|done|blocked|obsolete",
  "details": "",
  "source": "user|assistant"
}

Si un champ n'a rien d'utile, mets une chaîne vide, null, ou un tableau vide.
`.trim()

  const userPrompt = `
Mémoire actuelle :
${safeJson(currentMemory || {})}

Dernier mode :
${mode}

Langue :
${language}

Dernière demande utilisateur :
"""
${question}
"""

Dernière réponse du conseiller :
"""
${String(answer || "").slice(0, 4000)}
"""

Analyse cet échange et retourne uniquement le JSON de mise à jour mémoire.
`.trim()

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 1200,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      console.log("Memory reasoner OpenAI ignored:", data?.error?.message || data)
      return null
    }

    const content = data?.choices?.[0]?.message?.content || ""
    const parsed = parseJsonObject(content)

    if (!parsed || typeof parsed !== "object") {
      console.log("Memory reasoner JSON ignored:", content.slice(0, 500))
      return null
    }

    return sanitizeAiMemoryPatch(parsed)
  } catch (error) {
    console.log("Memory reasoner unavailable:", String(error))
    return null
  }
}

function parseJsonObject(value = "") {
  try {
    return JSON.parse(value)
  } catch (_) {
    const match = String(value).match(/\{[\s\S]*\}/)
    if (!match) return null

    try {
      return JSON.parse(match[0])
    } catch (_) {
      return null
    }
  }
}

function sanitizeAiMemoryPatch(raw: any) {
  return {
    stable_facts: sanitizeObject(raw?.stable_facts),
    case_state: sanitizeObject(raw?.case_state),
    living_case: sanitizeLivingCase(raw?.living_case),
  }
}

function sanitizeObject(value: any) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}

  const output: Record<string, unknown> = {}

  for (const [key, rawValue] of Object.entries(value)) {
    if (rawValue === "" || rawValue === undefined) continue

    if (Array.isArray(rawValue)) {
      const cleanArray = rawValue
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .slice(0, 20)

      if (cleanArray.length > 0) output[key] = cleanArray
      continue
    }

    if (rawValue === null) {
      output[key] = null
      continue
    }

    if (typeof rawValue === "number" || typeof rawValue === "boolean") {
      output[key] = rawValue
      continue
    }

    const clean = String(rawValue || "").trim()
    if (clean) output[key] = clean.slice(0, 500)
  }

  return output
}

function sanitizeLivingCase(value: any) {
  const output = sanitizeObject(value)

  if (Array.isArray(value?.timeline)) {
    output.timeline = value.timeline
      .map((event: any) => ({
        date: String(event?.date || new Date().toISOString()).slice(0, 40),
        type: String(event?.type || "info").slice(0, 40),
        subject: String(event?.subject || "").trim().slice(0, 140),
        status: String(event?.status || "active").slice(0, 40),
        details: String(event?.details || "").trim().slice(0, 350),
        source: String(event?.source || "user").slice(0, 40),
      }))
      .filter((event: any) => event.subject)
      .slice(0, 10)
  }

  return output
}

function safeJson(value: unknown, fallback: unknown = {}) {
  try {
    return JSON.stringify(value ?? fallback, null, 2)
  } catch (_) {
    return JSON.stringify(fallback, null, 2)
  }
}