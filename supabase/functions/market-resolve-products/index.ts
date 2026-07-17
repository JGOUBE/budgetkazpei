import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_ITEMS = 120;
const MAX_BODY_BYTES = 40_000;
const MAX_NAME_LENGTH = 180;
const MAX_STORE_LENGTH = 120;
const MAX_CITY_LENGTH = 80;
const MAX_BRAND_LENGTH = 80;
const MAX_PACKAGE_LENGTH = 80;
const MAX_ALTERNATE_NAMES = 4;

type AuthResult =
  | { response: Response; userId?: never }
  | { userId: string; response?: never };

type ResolvePayloadItem = {
  index: number;
  raw_name: string;
  barcode: string | null;
  observed_price: number | null;
  brand: string;
  package_format: string;
  alternate_names: string[];
};

type ResolveContext = {
  store_name: string;
  store_city: string;
  observed_date: string | null;
};

type ItemsValidationResult =
  | { error: string; items?: never }
  | { items: ResolvePayloadItem[]; error?: never };

type ContextValidationResult =
  | { error: string; context?: never }
  | { context: ResolveContext; error?: never };

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

async function requireValidUser(
  req: Request,
  supabaseAdmin: ReturnType<typeof createClient>,
): Promise<AuthResult> {
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

function cleanText(value: unknown, maxLength: number) {
  return String(value || "").trim().slice(0, maxLength);
}

function cleanAlternateNames(value: unknown) {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const names: string[] = [];
  for (const rawName of value) {
    if (typeof rawName !== "string") continue;
    if (rawName.trim().length > MAX_NAME_LENGTH) continue;

    const name = cleanText(rawName, MAX_NAME_LENGTH);
    const key = name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

    if (!name || !key || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
    if (names.length >= MAX_ALTERNATE_NAMES) break;
  }

  return names;
}

function cleanObservedPrice(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const price = Number(value);
  return Number.isFinite(price) && price > 0 && price <= 100_000
    ? Number(price.toFixed(2))
    : null;
}

function cleanObservedDate(value: unknown) {
  const raw = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function validateContext(value: unknown): ContextValidationResult {
  if (value === undefined || value === null) {
    return {
      context: {
        store_name: "",
        store_city: "",
        observed_date: null,
      },
    };
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { error: "invalid_context" };
  }

  const context = value as Record<string, unknown>;
  if (Object.keys(context).some((key) =>
    !["store_name", "store_city", "observed_date"].includes(key)
  )) {
    return { error: "forbidden_context_fields" };
  }

  const storeName = cleanText(context.store_name, MAX_STORE_LENGTH);
  const storeCity = cleanText(context.store_city, MAX_CITY_LENGTH);
  const observedDate = cleanObservedDate(context.observed_date);

  if (
    String(context.store_name || "").trim().length > MAX_STORE_LENGTH ||
    String(context.store_city || "").trim().length > MAX_CITY_LENGTH
  ) {
    return { error: "context_field_too_long" };
  }

  if (
    context.observed_date !== undefined &&
    context.observed_date !== null &&
    String(context.observed_date).trim() !== "" &&
    !observedDate
  ) {
    return { error: "invalid_observed_date" };
  }

  return {
    context: {
      store_name: storeName,
      store_city: storeCity,
      observed_date: observedDate,
    },
  };
}

function validateItems(value: unknown): ItemsValidationResult {
  if (!Array.isArray(value)) {
    return { error: "items_must_be_array" };
  }
  if (value.length > MAX_ITEMS) {
    return { error: "too_many_items" };
  }

  const items: ResolvePayloadItem[] = [];
  for (const rawItem of value) {
    const item = rawItem && typeof rawItem === "object"
      ? rawItem as Record<string, unknown>
      : null;
    if (!item) return { error: "invalid_item" };

    if (Object.keys(item).some((key) =>
      ![
        "index",
        "raw_name",
        "barcode",
        "observed_price",
        "brand",
        "package_format",
        "alternate_names",
      ].includes(key)
    )) {
      return { error: "forbidden_item_fields" };
    }

    const index = Number(item.index);
    const rawName = String(item.raw_name || "").trim();
    const barcode = cleanBarcode(item.barcode);
    const observedPrice = cleanObservedPrice(item.observed_price);
    const brand = cleanText(item.brand, MAX_BRAND_LENGTH);
    const packageFormat = cleanText(item.package_format, MAX_PACKAGE_LENGTH);
    const alternateNames = cleanAlternateNames(item.alternate_names);

    if (!Number.isInteger(index) || index < 0) {
      return { error: "invalid_index" };
    }
    if (rawName.length > MAX_NAME_LENGTH) {
      return { error: "raw_name_too_long" };
    }
    if (String(item.brand || "").trim().length > MAX_BRAND_LENGTH) {
      return { error: "brand_too_long" };
    }
    if (String(item.package_format || "").trim().length > MAX_PACKAGE_LENGTH) {
      return { error: "package_format_too_long" };
    }
    if (
      item.alternate_names !== undefined &&
      (!Array.isArray(item.alternate_names) || item.alternate_names.length > MAX_ALTERNATE_NAMES)
    ) {
      return { error: "invalid_alternate_names" };
    }
    if (
      Array.isArray(item.alternate_names) &&
      item.alternate_names.some((name) =>
        typeof name !== "string" || name.trim().length > MAX_NAME_LENGTH
      )
    ) {
      return { error: "invalid_alternate_name" };
    }
    if (
      item.observed_price !== undefined &&
      item.observed_price !== null &&
      item.observed_price !== "" &&
      observedPrice === null
    ) {
      return { error: "invalid_observed_price" };
    }
    if (!rawName && !barcode) {
      items.push({
        index,
        raw_name: "",
        barcode: null,
        observed_price: observedPrice,
        brand,
        package_format: packageFormat,
        alternate_names: alternateNames,
      });
      continue;
    }

    items.push({
      index,
      raw_name: rawName,
      barcode,
      observed_price: observedPrice,
      brand,
      package_format: packageFormat,
      alternate_names: alternateNames,
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
    if (Object.keys(body).some((key) => !["items", "context"].includes(key))) {
      return jsonResponse({ ok: false, error: "forbidden_payload_fields" }, 400);
    }

    const validation = validateItems(body.items);
    if (validation.error) {
      return jsonResponse({ ok: false, error: validation.error }, 400);
    }

    const contextValidation = validateContext(body.context);
    if (contextValidation.error) {
      return jsonResponse({ ok: false, error: contextValidation.error }, 400);
    }

    const rpcItems = validation.items.map((item) => ({
      ...item,
      store_name: contextValidation.context.store_name,
      store_city: contextValidation.context.store_city,
      observed_date: contextValidation.context.observed_date,
    }));

    const { data, error } = await supabaseAdmin.rpc("market_resolve_exact_products", {
      p_items: rpcItems,
    });

    if (error) throw error;

    const items = Array.isArray(data) ? data : [];
    const resolved = items.filter(
      (item: Record<string, unknown>) => item.market_matched === true,
    ).length;
    const contextual = items.filter((item: Record<string, unknown>) =>
      String(item.market_match_type || "").startsWith("contextual_")
    ).length;
    const alternate = items.filter((item: Record<string, unknown>) =>
      String(item.market_match_input_source || "") === "alternate_ocr"
    ).length;
    const exact = resolved - contextual;
    const unresolved = items.length - resolved;

    console.info(
      "[market-resolve] resolved=%s exact=%s contextual=%s alternate=%s unresolved=%s",
      resolved,
      exact,
      contextual,
      alternate,
      unresolved,
    );

    return jsonResponse({
      ok: true,
      items,
      resolved,
      exact,
      contextual,
      alternate,
      unresolved,
    });
  } catch (error) {
    console.warn("[market-resolve] failed", {
      message: error instanceof Error ? error.message : "internal_error",
    });
    return jsonResponse({ ok: false, error: "internal_error" }, 500);
  }
});