import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_ITEMS = 120;
const MAX_BODY_BYTES = 24_000;
const MAX_NAME_LENGTH = 180;

type AuthResult =
  | { response: Response; userId?: never }
  | { userId: string; response?: never };

type ResolvePayloadItem = {
  index: number;
  raw_name: string;
  barcode: string | null;
};

type ItemsValidationResult =
  | { error: string; items?: never }
  | { items: ResolvePayloadItem[]; error?: never };

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function getSupabaseAdmin() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey =
    Deno.env.get("SERVICE_ROLE_KEY") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("missing_supabase_configuration");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
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

  return { userId: data.user.id };
}

function cleanBarcode(value: unknown) {
  const barcode = String(value || "").replace(/\D/g, "");
  return barcode.length >= 8 && barcode.length <= 14 ? barcode : null;
}

function validateItems(value: unknown): ItemsValidationResult {
  if (!Array.isArray(value)) {
    return { error: "items_must_be_array" };
  }
  if (value.length > MAX_ITEMS) {
    return { error: "too_many_items" };
  }

  const items = [];
  for (const rawItem of value) {
    const item = rawItem && typeof rawItem === "object" ? rawItem as Record<string, unknown> : null;
    if (!item) return { error: "invalid_item" };
    if (Object.keys(item).some((key) => !["index", "raw_name", "barcode"].includes(key))) {
      return { error: "forbidden_item_fields" };
    }

    const index = Number(item.index);
    const rawName = String(item.raw_name || "").trim();
    const barcode = cleanBarcode(item.barcode);

    if (!Number.isInteger(index) || index < 0) {
      return { error: "invalid_index" };
    }
    if (rawName.length > MAX_NAME_LENGTH) {
      return { error: "raw_name_too_long" };
    }
    if (!rawName && !barcode) {
      items.push({ index, raw_name: "", barcode: null });
      continue;
    }

    items.push({
      index,
      raw_name: rawName,
      barcode,
    });
  }

  return { items };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  }

  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
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
    if (Object.keys(body).some((key) => key !== "items")) {
      return jsonResponse({ ok: false, error: "forbidden_payload_fields" }, 400);
    }

    const validation = validateItems(body.items);
    if (validation.error) {
      return jsonResponse({ ok: false, error: validation.error }, 400);
    }

    const { data, error } = await supabaseAdmin.rpc("market_resolve_exact_products", {
      p_items: validation.items,
    });

    if (error) throw error;

    const items = Array.isArray(data) ? data : [];
    const resolved = items.filter((item: Record<string, unknown>) => item.market_matched === true).length;
    const unresolved = items.length - resolved;

    console.info("[market-resolve] resolved=%s unresolved=%s", resolved, unresolved);
    return jsonResponse({
      ok: true,
      items,
      resolved,
      unresolved,
    });
  } catch (error) {
    console.warn("[market-resolve] failed", {
      message: error instanceof Error ? error.message : "internal_error",
    });
    return jsonResponse({ ok: false, error: "internal_error" }, 500);
  }
});
