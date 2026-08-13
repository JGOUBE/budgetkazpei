import { createClient } from "npm:@supabase/supabase-js@2"
import { runRetentionBatch } from "./retentionPolicy.js"

const BUCKET = "receipt-images"
const PAGE_SIZE = 200

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  })
}

function safeEqual(left: string, right: string) {
  if (!left || !right || left.length !== right.length) return false
  let mismatch = 0
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return mismatch === 0
}

async function readStrictPayload(request: Request) {
  const contentType = String(request.headers.get("content-type") || "").toLowerCase()
  if (!contentType.startsWith("application/json")) {
    return { error: "content_type_must_be_application_json" } as const
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return { error: "invalid_json" } as const
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "invalid_payload" } as const
  }

  const keys = Object.keys(body)
  if (keys.length !== 1 || keys[0] !== "dryRun" || typeof (body as { dryRun?: unknown }).dryRun !== "boolean") {
    return { error: "payload_must_only_contain_boolean_dryRun" } as const
  }

  return { dryRun: (body as { dryRun: boolean }).dryRun } as const
}

Deno.serve(async request => {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405)

  const expectedSecret = Deno.env.get("RECEIPT_IMAGE_RETENTION_SECRET") || ""
  const suppliedSecret = request.headers.get("x-retention-secret") || ""
  if (!safeEqual(suppliedSecret, expectedSecret)) return json({ error: "unauthorized" }, 401)

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "server_configuration_missing" }, 500)

  const payload = await readStrictPayload(request)
  if ("error" in payload) return json({ error: payload.error }, 400)

  const dryRun = payload.dryRun
  const runAt = new Date().toISOString()
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  if (dryRun) {
    const { data, error } = await admin.rpc("receipt_image_retention_audit", { p_now: runAt })
    if (error) return json({ error: "audit_failed", details: error.message }, 500)
    return json({ dryRun: true, runAt, ...(data || {}) })
  }

  const totals = {
    dryRun: false,
    runAt,
    batches: 0,
    receiptsExamined: 0,
    receiptsFinalized: 0,
    trackedImages: 0,
    inlineImages: 0,
    orphanImages: 0,
    storageImagesDeleted: 0,
    failures: [] as unknown[],
  }

  const removeStoragePaths = async (paths: string[]) => {
    const { error } = await admin.storage.from(BUCKET).remove(paths)
    if (error) throw error
  }
  const finalizeReceipt = async (receiptId: string) => {
    const { error } = await admin.rpc("receipt_finalize_image_retention", {
      p_receipt_id: receiptId,
      p_deleted_at: runAt,
    })
    if (error) throw error
  }

  const [{ data: receipts, error: receiptError }, { data: orphans, error: orphanError }] = await Promise.all([
    admin.rpc("receipt_image_retention_candidates", {
      p_now: runAt,
      p_limit: PAGE_SIZE,
      p_offset: 0,
    }),
    admin.rpc("receipt_orphan_image_retention_candidates", {
      p_now: runAt,
      p_limit: PAGE_SIZE,
      p_offset: 0,
    }),
  ])
  if (receiptError) return json({ error: "candidate_query_failed", details: receiptError.message, ...totals }, 500)
  if (orphanError) return json({ error: "orphan_query_failed", details: orphanError.message, ...totals }, 500)

  const batch = await runRetentionBatch({
    receiptCandidates: receipts || [],
    orphanCandidates: orphans || [],
    removeStoragePaths,
    finalizeReceipt,
  })
  totals.batches = (receipts?.length || orphans?.length) ? 1 : 0
  totals.receiptsExamined = batch.receiptsExamined
  totals.receiptsFinalized = batch.receiptsFinalized
  totals.trackedImages = batch.trackedImages
  totals.inlineImages = batch.inlineImages
  totals.orphanImages = batch.orphanImages
  totals.storageImagesDeleted = batch.storageImagesDeleted
  totals.failures.push(...batch.failures)

  return json(totals, totals.failures.length ? 207 : 200)
})
