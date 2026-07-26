import { supabase } from "../supabase"

const MARKET_MANUAL_ALIAS_GLOBAL_ENABLED = String(
  import.meta.env?.VITE_MARKET_MANUAL_ALIAS_GLOBAL || "",
).toLowerCase() === "true"

export async function learnManualMarketAliasFromReceiptItem(itemId: string) {
  const cleanItemId = String(itemId || "").trim()
  if (!cleanItemId) {
    return { ok: false, learned: false, reason: "missing_item_id" }
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  const accessToken = sessionData?.session?.access_token || ""
  const sessionUserId = sessionData?.session?.user?.id || null
  const supabaseUrl = String(import.meta.env?.VITE_SUPABASE_URL || "").replace(/\/+$/, "")
  const supabaseAnonKey = String(import.meta.env?.VITE_SUPABASE_ANON_KEY || "")
  const rpcUrl = `${supabaseUrl}/rest/v1/rpc/market_learn_alias_from_receipt_item`
  const requestBody = {
    p_receipt_item_id: cleanItemId,
    p_source: "user_manual_correction",
    p_allow_global: MARKET_MANUAL_ALIAS_GLOBAL_ENABLED,
  }

  console.info("[scanner] alias_learning_service_entry", {
    receipt_item_id: cleanItemId,
    session_user_id_present: Boolean(sessionUserId),
    session_user_id: sessionUserId,
    session_error: sessionError?.message || "",
    rpc_url: rpcUrl,
  })

  if (!supabaseUrl || !supabaseAnonKey) {
    const missingConfigError = new Error("missing_supabase_rpc_configuration")
    console.warn("[scanner] alias_learning_rpc_failed", {
      receipt_item_id: cleanItemId,
      code: "missing_supabase_rpc_configuration",
      message: missingConfigError.message,
      details: "",
      hint: "",
    })
    throw missingConfigError
  }

  if (!accessToken) {
    const missingSessionError = new Error("missing_supabase_session")
    console.warn("[scanner] alias_learning_rpc_failed", {
      receipt_item_id: cleanItemId,
      code: "missing_supabase_session",
      message: missingSessionError.message,
      details: sessionError?.message || "",
      hint: "",
    })
    throw missingSessionError
  }

  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(requestBody),
  })

  const responseText = await response.text()
  let responseJson: any = null
  try {
    responseJson = responseText ? JSON.parse(responseText) : null
  } catch {
    responseJson = null
  }

  console.info("[scanner] alias_learning_rpc_response", {
    receipt_item_id: cleanItemId,
    http_status: response.status,
    ok: response.ok,
    sql_result: responseJson,
    raw_response_text: responseJson ? "" : responseText,
  })

  if (!response.ok) {
    const rpcError: any = new Error(
      responseJson?.message
      || responseJson?.error
      || `rpc_http_${response.status}`,
    )
    rpcError.code = responseJson?.code || `http_${response.status}`
    rpcError.details = responseJson?.details || responseText || ""
    rpcError.hint = responseJson?.hint || ""
    rpcError.httpStatus = response.status
    throw rpcError
  }

  return responseJson || { ok: true, learned: false, reason: "empty_response", result: "skipped" }
}
