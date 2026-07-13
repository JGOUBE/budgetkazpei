import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { aliasLabelLooksSafe, isEligibleMarketReceiptItem, isResolvedMarketProduct, money, normalizeText } from "./marketRules.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_BODY_BYTES = 2_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type AuthResult =
  | { response: Response; userId?: never }
  | { userId: string; token: string; response?: never };

type OwnedReceiptResult =
  | { response: Response; receipt?: never }
  | { receipt: Record<string, unknown>; response?: never };

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function getSupabaseConfig() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey =
    Deno.env.get("SUPABASE_ANON_KEY") ||
    Deno.env.get("ANON_KEY");
  const serviceRoleKey =
    Deno.env.get("SERVICE_ROLE_KEY") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new Error("missing_supabase_configuration");
  }

  return { supabaseUrl, anonKey, serviceRoleKey };
}

function getSupabaseAdmin(config: ReturnType<typeof getSupabaseConfig>) {
  return createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false },
  });
}

function getSupabaseUserClient(config: ReturnType<typeof getSupabaseConfig>, token: string) {
  return createClient(config.supabaseUrl, config.anonKey, {
    auth: { persistSession: false },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}

async function requireValidUser(req: Request, supabaseAdmin: ReturnType<typeof createClient>): Promise<AuthResult> {
  const authHeader = req.headers.get("Authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim() || "";

  if (!token) {
    return { response: jsonResponse({ ok: false, error: "missing_authorization" }, 401) };
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user?.id) {
    return { response: jsonResponse({ ok: false, error: "invalid_authorization" }, 401) };
  }

  return { userId: data.user.id, token };
}

function isReliableDate(receipt: Record<string, unknown>) {
  const purchaseDate = String(receipt.purchase_date || "").slice(0, 10);
  const dateStatus = String(receipt.date_status || "detected").toLowerCase();
  return /^\d{4}-\d{2}-\d{2}$/.test(purchaseDate)
    && dateStatus !== "estimated"
    && dateStatus !== "missing"
    && dateStatus !== "needs_review";
}

async function hmacHex(secret: string, value: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function buildBatchKey(receiptId: string) {
  const secret = Deno.env.get("MARKET_HASH_SECRET") || "";
  if (!secret) throw new Error("missing_market_hash_secret");
  return `receipt_scan_anonymized:${await hmacHex(secret, `receipt:${receiptId}`)}`;
}

async function buildBatchItemKey(itemId: string) {
  const secret = Deno.env.get("MARKET_HASH_SECRET") || "";
  if (!secret) throw new Error("missing_market_hash_secret");
  return `receipt_item_anonymized:${await hmacHex(secret, `receipt_item:${itemId}`)}`;
}

async function readOwnedReceipt(
  supabaseUser: ReturnType<typeof createClient>,
  receiptId: string,
): Promise<OwnedReceiptResult> {
  const { data, error } = await supabaseUser
    .from("receipts")
    .select(`
      id,
      user_id,
      store_name,
      merchant_name,
      normalized_store_name,
      store_location,
      purchase_date,
      date_status,
      receipt_items (
        id,
        name,
        ocr_name,
        corrected_name,
        normalized_name,
        quantity,
        unit,
        unit_price,
        total_price,
        item_status,
        line_type,
        confidence_score
      )
    `)
    .eq("id", receiptId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return { response: jsonResponse({ ok: false, error: "receipt_not_found" }, 404) };
  return { receipt: data };
}

async function resolveStore(supabaseAdmin: ReturnType<typeof createClient>, receipt: Record<string, unknown>) {
  const normalizedStoreName = normalizeText(
    String(receipt.normalized_store_name || receipt.store_name || receipt.merchant_name || ""),
  );
  const normalizedCity = normalizeText(String(receipt.store_location || ""));

  if (!normalizedStoreName) return { storeId: null, reason: "store_unresolved" };

  if (normalizedCity) {
    const { data, error } = await supabaseAdmin
      .from("market_stores")
      .select("id")
      .eq("normalized_store_name", normalizedStoreName)
      .eq("normalized_city", normalizedCity)
      .limit(2);

    if (error) throw error;
    if (Array.isArray(data) && data.length === 1) return { storeId: data[0].id, reason: "" };
    if (Array.isArray(data) && data.length > 1) return { storeId: null, reason: "skipped_store_ambiguous" };
  }

  const { data, error } = await supabaseAdmin
    .from("market_stores")
    .select("id")
    .eq("normalized_store_name", normalizedStoreName)
    .limit(2);

  if (error) throw error;
  if (Array.isArray(data) && data.length === 1) return { storeId: data[0].id, reason: "" };
  if (Array.isArray(data) && data.length > 1) return { storeId: null, reason: "skipped_store_ambiguous" };
  return { storeId: null, reason: "store_unresolved" };
}

async function deleteBatch(supabaseAdmin: ReturnType<typeof createClient>, batchKey: string) {
  const { data, error } = await supabaseAdmin.rpc("market_delete_anonymized_batch", {
    p_batch_key: batchKey,
  });
  if (error) throw error;
  return data || {};
}

async function syncEmptyBatch(
  supabaseAdmin: ReturnType<typeof createClient>,
  batchKey: string,
  reason: string,
) {
  const deleted = await deleteBatch(supabaseAdmin, batchKey);
  return {
    ok: true,
    skipped: true,
    reason,
    ...deleted,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  }

  let config;
  let supabaseAdmin;
  try {
    config = getSupabaseConfig();
    supabaseAdmin = getSupabaseAdmin(config);
  } catch {
    return jsonResponse({ ok: false, error: "server_not_configured" }, 500);
  }

  const auth = await requireValidUser(req, supabaseAdmin);
  if (auth.response) return auth.response;

  try {
    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).length > MAX_BODY_BYTES) {
      return jsonResponse({ ok: false, error: "payload_too_large" }, 400);
    }

    const body = JSON.parse(rawBody || "{}");
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonResponse({ ok: false, error: "invalid_payload" }, 400);
    }
    if (Object.keys(body).some((key) => !["receipt_id", "action"].includes(key))) {
      return jsonResponse({ ok: false, error: "forbidden_payload_fields" }, 400);
    }

    const receiptId = String(body.receipt_id || "").trim();
    const action = String(body.action || "").trim();

    if (!UUID_PATTERN.test(receiptId) || !["sync", "delete"].includes(action)) {
      return jsonResponse({ ok: false, error: "invalid_payload" }, 400);
    }

    const supabaseUser = getSupabaseUserClient(config, auth.token);
    const owned = await readOwnedReceipt(supabaseUser, receiptId);
    if (owned.response) return owned.response;

    const receipt = owned.receipt as Record<string, unknown>;
    const batchKey = await buildBatchKey(receiptId);

    if (action === "delete") {
      const deleted = await deleteBatch(supabaseAdmin, batchKey);
      console.info("[market-delete] batch_deleted=%s", Boolean((deleted as Record<string, unknown>)?.batch_deleted));
      return jsonResponse({ ok: true, ...deleted });
    }

    const storeResolution = await resolveStore(supabaseAdmin, receipt);
    const storeId = storeResolution.storeId;
    if (!storeId) {
      const reason = storeResolution.reason || "store_unresolved";
      const result = await syncEmptyBatch(supabaseAdmin, batchKey, reason);
      console.info("[market-sync] skipped=%s", reason);
      return jsonResponse(result);
    }

    if (!isReliableDate(receipt)) {
      const result = await syncEmptyBatch(supabaseAdmin, batchKey, "date_unreliable");
      console.info("[market-sync] skipped=date_unreliable");
      return jsonResponse(result);
    }

    const receiptItems = Array.isArray(receipt.receipt_items) ? receipt.receipt_items as Record<string, unknown>[] : [];
    const eligibleItems = receiptItems.filter(isEligibleMarketReceiptItem);
    if (eligibleItems.length === 0) {
      const result = await syncEmptyBatch(supabaseAdmin, batchKey, "no_eligible_items");
      console.info("[market-sync] skipped=no_eligible_items");
      return jsonResponse(result);
    }

    const resolutionPayload = eligibleItems.map((item, index) => ({
      index,
      raw_name: String(item.corrected_name || item.name || "").trim(),
      barcode: null,
    }));

    const { data: resolvedData, error: resolveError } = await supabaseAdmin.rpc("market_resolve_exact_products", {
      p_items: resolutionPayload,
    });
    if (resolveError) throw resolveError;

    const resolvedByIndex = new Map<number, Record<string, unknown>>();
    for (const item of Array.isArray(resolvedData) ? resolvedData : []) {
      resolvedByIndex.set(Number(item.index), item as Record<string, unknown>);
    }

    const syncItems = [];
    let unresolved = 0;
    for (let index = 0; index < eligibleItems.length; index += 1) {
      const item = eligibleItems[index];
      const resolution = resolvedByIndex.get(index);
      if (!isResolvedMarketProduct(resolution)) {
        unresolved += 1;
        continue;
      }

      const observedName = String(item.corrected_name || item.name || "").trim();
      const quantity = money(item.quantity == null || item.quantity === "" ? 1 : item.quantity);
      const unitPrice = item.unit_price == null || item.unit_price === "" ? null : money(item.unit_price);
      const unitType = unitPrice ? String(item.unit || "").trim() || null : null;

      syncItems.push({
        batch_item_key: await buildBatchItemKey(String(item.id || "")),
        product_id: resolution.market_product_id,
        observed_name: observedName,
        price: money(item.total_price),
        quantity,
        unit_price: unitPrice && unitType ? unitPrice : null,
        unit_type: unitPrice && unitType ? unitType : null,
        allow_alias: aliasLabelLooksSafe(observedName),
      });
    }

    if (syncItems.length === 0) {
      const result = await syncEmptyBatch(supabaseAdmin, batchKey, "no_resolved_items");
      console.info("[market-sync] created=0 unresolved=%s", unresolved);
      return jsonResponse({ ...result, unresolved });
    }

    const { data: syncData, error: syncError } = await supabaseAdmin.rpc("market_sync_anonymized_batch", {
      p_batch_key: batchKey,
      p_store_id: storeId,
      p_observed_date: String(receipt.purchase_date || "").slice(0, 10),
      p_items: syncItems,
    });
    if (syncError) throw syncError;

    console.info("[market-sync] created=%s unresolved=%s", Number(syncData?.observations_created || 0), unresolved);
    return jsonResponse({
      ok: true,
      unresolved,
      ...syncData,
    });
  } catch (error) {
    console.warn("[market-sync] failed", {
      message: error instanceof Error ? error.message : "internal_error",
    });
    return jsonResponse({ ok: false, error: "internal_error" }, 500);
  }
});
