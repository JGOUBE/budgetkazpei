import { supabase } from "../supabase"

const MARKET_RESOLVE_TIMEOUT_MS = 1800
const MARKET_RESOLVE_MAX_ITEMS = 120
const MARKET_RESOLVE_DEBUG = Boolean(import.meta.env.DEV || import.meta.env.VITE_MARKET_DEBUG === "true")

const MARKET_ENRICHMENT_FIELDS = [
  "market_product_id",
  "market_matched",
  "market_match_type",
  "market_match_confidence",
  "market_canonical_name",
  "market_brand",
  "market_category",
  "market_subcategory",
  "market_package_format",
] as const

type MarketResolution = {
  index: number
  market_matched?: boolean
  [key: string]: unknown
}

type MarketResolveDependencies = {
  getSession?: () => Promise<any>
  fetchImpl?: typeof fetch
  setTimeoutImpl?: typeof setTimeout
  clearTimeoutImpl?: typeof clearTimeout
  createAbortController?: () => AbortController
  functionUrlImpl?: (functionName: string) => string
  anonKeyImpl?: () => string
}

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

function cleanBarcode(value: unknown) {
  const barcode = String(value || "").replace(/\D/g, "")
  return barcode.length >= 8 && barcode.length <= 14 ? barcode : null
}

function abortError() {
  const error = new Error("market_resolve_timeout")
  error.name = "AbortError"
  return error
}

function nowMs() {
  return typeof performance !== "undefined" ? performance.now() : Date.now()
}

export function buildMarketResolvePayload(items: any[] = []) {
  return (items || []).slice(0, MARKET_RESOLVE_MAX_ITEMS).map((item, index) => ({
    index,
    raw_name: String(item?.corrected_name || item?.name || item?.ocr_name || "").trim().slice(0, 180),
    barcode: cleanBarcode(item?.barcode),
  }))
}

export function applyMarketResolutions(items: any[] = [], resolutions: MarketResolution[] = []) {
  const byIndex = new Map<number, MarketResolution>()
  for (const resolution of resolutions || []) {
    byIndex.set(Number(resolution.index), resolution)
  }

  return (items || []).map((item, index) => {
    const resolution = byIndex.get(index)
    if (!resolution) return { ...item, market_matched: false }
    if (resolution.market_matched !== true) return { ...item, market_matched: false }

    const next = { ...item }
    for (const field of MARKET_ENRICHMENT_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(resolution, field)) {
        next[field] = resolution[field]
      }
    }
    if (!Object.prototype.hasOwnProperty.call(next, "market_matched")) {
      next.market_matched = false
    }
    return next
  })
}

async function postMarketResolve(
  payload: Record<string, unknown>,
  timeoutMs = MARKET_RESOLVE_TIMEOUT_MS,
  dependencies: MarketResolveDependencies = {},
) {
  const getSession = dependencies.getSession || (() => supabase.auth.getSession())
  const fetchImpl = dependencies.fetchImpl || fetch
  const setTimeoutImpl = dependencies.setTimeoutImpl || setTimeout
  const clearTimeoutImpl = dependencies.clearTimeoutImpl || clearTimeout
  const functionUrlImpl = dependencies.functionUrlImpl || functionUrl
  const anonKeyImpl = dependencies.anonKeyImpl || anonKey
  const controller = dependencies.createAbortController?.() || new AbortController()
  let timeout: ReturnType<typeof setTimeout> | null = null
  const startedAt = nowMs()

  try {
    return await Promise.race([
      (async () => {
        const sessionStartedAt = nowMs()
        const { data: sessionData } = await getSession()
        const sessionMs = Math.round(nowMs() - sessionStartedAt)
        const token = sessionData?.session?.access_token
        if (!token) throw new Error("missing_session")

        const requestStartedAt = nowMs()
        const response = await fetchImpl(functionUrlImpl("market-resolve-products"), {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            apikey: anonKeyImpl(),
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        })

        const body = await response.json().catch(() => ({}))
        const requestMs = Math.round(nowMs() - requestStartedAt)
        if (!response.ok) {
          throw new Error(String(body?.error || `market_resolve_http_${response.status}`))
        }
        body.__market_timing = {
          session_ms: sessionMs,
          request_ms: requestMs,
          total_ms: Math.round(nowMs() - startedAt),
          timeout_budget_ms: timeoutMs,
          timeout: false,
        }
        return body
      })(),
      new Promise((_, reject) => {
        timeout = setTimeoutImpl(() => {
          controller.abort()
          reject(abortError())
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timeout) clearTimeoutImpl(timeout)
  }
}

export async function resolveMarketProducts(
  items: any[] = [],
  dependencies: MarketResolveDependencies = {},
) {
  const payloadItems = buildMarketResolvePayload(items)
    .filter(item => item.raw_name || item.barcode)

  if (payloadItems.length === 0) {
    return {
      items,
      diagnostics: { requested: 0, resolved: 0, unresolved: 0, skipped: true },
    }
  }

  try {
    const data = await postMarketResolve({ items: payloadItems }, MARKET_RESOLVE_TIMEOUT_MS, dependencies)
    const resolutions = Array.isArray(data?.items) ? data.items : []
    const timing = data?.__market_timing || null
    const diagnostics = {
      requested: payloadItems.length,
      resolved: Number(data?.resolved || 0),
      unresolved: Number(data?.unresolved || 0),
      ...(timing || {}),
    }
    if (MARKET_RESOLVE_DEBUG) {
      console.info("[market-resolver] result", {
        items: payloadItems.length,
        matched: diagnostics.resolved,
        unmatched: diagnostics.unresolved,
        session_ms: diagnostics.session_ms ?? null,
        request_ms: diagnostics.request_ms ?? null,
        total_ms: diagnostics.total_ms ?? null,
        timeout_budget_ms: diagnostics.timeout_budget_ms ?? MARKET_RESOLVE_TIMEOUT_MS,
        timeout: false,
      })
      console.info(
        `[market-resolver] session_ms=${diagnostics.session_ms ?? "n/a"} request_ms=${diagnostics.request_ms ?? "n/a"} total_ms=${diagnostics.total_ms ?? "n/a"} timeout_budget_ms=${diagnostics.timeout_budget_ms ?? MARKET_RESOLVE_TIMEOUT_MS}`,
      )
    }
    return {
      items: applyMarketResolutions(items, resolutions),
      diagnostics,
    }
  } catch (error) {
    const timeout = error instanceof Error && error.name === "AbortError"
    console.warn("[market-resolve] fallback without enrichment", {
      reason: error instanceof Error ? timeout ? "timeout" : error.message : "unknown",
      timeout_budget_ms: MARKET_RESOLVE_TIMEOUT_MS,
    })
    return {
      items,
      diagnostics: {
        requested: payloadItems.length,
        resolved: 0,
        unresolved: payloadItems.length,
        failed: true,
        timeout,
        timeout_budget_ms: MARKET_RESOLVE_TIMEOUT_MS,
      },
    }
  }
}

export const __marketProductResolverTestUtils = {
  applyMarketResolutions,
  buildMarketResolvePayload,
  postMarketResolve,
}
