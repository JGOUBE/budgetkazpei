import { supabase } from "../supabase"
import { getScanPlan, type ScanPlan } from "../../config/scanLimits"
import { getPlanQuotaExceededCode } from "../../config/plans"

function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

export async function getScanUsage({
  userId,
  isPremium = false,
  isPremiumPlus = false,
}: {
  userId?: string
  isPremium?: boolean
  isPremiumPlus?: boolean
}) {
  const plan = getScanPlan(isPremium, isPremiumPlus)
  if (!userId) return { used: 0, aiUsed: 0, manualUsed: 0, plan }

  const { data, error } = await supabase
    .from("scan_usage")
    .select("scan_count, ai_scan_count, manual_count, plan")
    .eq("user_id", userId)
    .eq("month_key", monthKey())
    .maybeSingle()

  if (error) throw error

  return {
    used: Number(data?.ai_scan_count ?? data?.scan_count ?? 0),
    aiUsed: Number(data?.ai_scan_count || 0),
    manualUsed: Number(data?.manual_count || 0),
    plan: (data?.plan as ScanPlan) || plan,
  }
}

export async function incrementScanUsage({
  userId,
  plan,
  kind,
}: {
  userId?: string
  plan: ScanPlan
  kind: "ai" | "manual"
}) {
  if (!userId) return null

  const { data, error } = await supabase.rpc("increment_scan_usage", {
    p_kind: kind,
  })
  if (error) throw error
  if (data?.allowed === false) {
    throw Object.assign(new Error("scan_quota_exceeded"), {
      code: data.reason || getPlanQuotaExceededCode(data.plan || plan),
      plan: data.plan,
      limit: data.limit,
      remaining: data.remaining,
    })
  }
  return data
}

export async function createScanMetric({
  userId,
  receiptId,
  metrics = {},
  status = "success",
  error,
}: {
  userId?: string
  receiptId?: string | null
  metrics?: Record<string, any>
  status?: "success" | "error"
  error?: { code?: string; message?: string } | null
}) {
  if (!userId) return null

  const isSuccess = metrics.success ?? (status === "success")
  const row = {
    user_id: userId,
    receipt_id: receiptId || null,
    model: metrics.model || "none",
    provider: metrics.provider || "unknown",
    ocr_engine: metrics.ocrEngine || metrics.provider || "unknown",
    ai_used: Boolean(metrics.aiUsed),
    text_ai_used: Boolean(metrics.textAiUsed),
    vision_used: Boolean(metrics.visionUsed),
    fallback_used: Boolean(metrics.fallbackUsed),
    image_initial_bytes: Number(metrics.imageInitialBytes || 0),
    image_compressed_bytes: Number(metrics.imageCompressedBytes || 0),
    ocr_duration_ms: Number(metrics.ocrDurationMs || 0),
    openai_duration_ms: Number(metrics.openaiDurationMs || 0),
    parsing_duration_ms: Number(metrics.parsingDurationMs || 0),
    import_duration_ms: Number(metrics.importDurationMs || 0),
    input_tokens: Number(metrics.inputTokens || 0),
    output_tokens: Number(metrics.outputTokens || 0),
    estimated_cost_eur: Number(metrics.estimatedCostEur || 0),
    scan_level_used: Number(metrics.scanLevelUsed || 1),
    confidence_score: Number(metrics.confidenceScore || 0),
    escalation_reason: metrics.escalationReason || null,
    scan_status: metrics.scanStatus || (status === "success" ? "success" : "failed"),
    items_detected: Number(metrics.itemsDetected || 0),
    receipt_items_created: Number(metrics.receiptItemsCreated || 0),
    shopping_items_created: Number(metrics.shoppingItemsCreated || 0),
    transaction_created: Boolean(metrics.transactionCreated),
    scan_usage_incremented: Boolean(metrics.scanUsageIncremented),
    success: Boolean(isSuccess),
    status,
    error_code: error?.code || null,
    error_message: error?.message || null,
  }

  let { data, error: insertError } = await supabase
    .from("scan_metrics")
    .insert(row)
    .select()
    .single()

  if (insertError && isMissingColumnError(insertError)) {
    const { scan_level_used, confidence_score, escalation_reason, scan_status, ...legacyRow } = row
    const retry = await supabase
      .from("scan_metrics")
      .insert(legacyRow)
      .select()
      .single()
    data = retry.data
    insertError = retry.error
  }

  if (insertError) throw insertError
  return data
}

function isMissingColumnError(error: any) {
  const message = String(error?.message || error?.details || "")
  return error?.code === "PGRST204" || message.includes("Could not find") || message.includes("column")
}
