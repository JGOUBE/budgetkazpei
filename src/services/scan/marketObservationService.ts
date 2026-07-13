import { supabase } from "../supabase"

const MARKET_OBSERVATION_TIMEOUT_MS = 3000

function functionUrl(functionName: string) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  if (!supabaseUrl) throw new Error("missing_supabase_url")
  return `${String(supabaseUrl).replace(/\/+$/, "")}/functions/v1/${functionName}`
}

function anonKey() {
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!key) throw new Error("missing_supabase_anon_key")
  return key
}

async function postMarketObservation(receiptId: string, action: "sync" | "delete") {
  const cleanReceiptId = String(receiptId || "").trim()
  if (!cleanReceiptId) {
    return { ok: false, skipped: true, reason: "missing_receipt_id" }
  }

  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData?.session?.access_token
  if (!token) throw new Error("missing_session")

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), MARKET_OBSERVATION_TIMEOUT_MS)

  try {
    const response = await fetch(functionUrl("market-record-observations"), {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey(),
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        receipt_id: cleanReceiptId,
        action,
      }),
    })

    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(String(body?.error || `market_observation_http_${response.status}`))
    }
    return body
  } finally {
    clearTimeout(timeout)
  }
}

async function safeMarketObservation(receiptId: string, action: "sync" | "delete") {
  try {
    return await postMarketObservation(receiptId, action)
  } catch (error) {
    console.warn(`[market-${action}] anonymous synchronization unavailable`, {
      reason: error instanceof Error ? error.name === "AbortError" ? "timeout" : error.message : "unknown",
    })
    return { ok: false, skipped: true, reason: "market_unavailable" }
  }
}

export async function syncAnonymizedMarketReceipt(receiptId: string) {
  return safeMarketObservation(receiptId, "sync")
}

export async function deleteAnonymizedMarketReceipt(receiptId: string) {
  return safeMarketObservation(receiptId, "delete")
}
