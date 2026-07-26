import { supabase } from "../supabase"

const MARKET_RESOLVE_EXACT_TIMEOUT_MS = 1800
const MARKET_RESOLVE_CONTEXT_TIMEOUT_MS = 4500
const MARKET_RESOLVE_MAX_ITEMS = 120
const MARKET_RESOLVE_MAX_ALTERNATE_NAMES = 4
const MARKET_RESOLVE_DEBUG = Boolean(import.meta.env?.DEV || import.meta.env?.VITE_MARKET_DEBUG === "true")

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
  "market_match_input_source",
] as const

const MARKET_SUGGESTION_FIELDS = [
  "market_suggested",
  "market_suggestion_product_id",
  "market_suggestion_canonical_name",
  "market_suggestion_confidence",
  "market_suggestion_scope",
  "market_suggestion_reason",
] as const

type MarketResolution = {
  index: number
  market_matched?: boolean
  [key: string]: unknown
}

export type MarketResolveContext = {
  store_name?: string | null
  store_city?: string | null
  observed_date?: string | null
}

type MarketResolveDependencies = {
  getSession?: () => Promise<any>
  fetchImpl?: typeof fetch
  setTimeoutImpl?: typeof setTimeout
  clearTimeoutImpl?: typeof clearTimeout
  createAbortController?: () => AbortController
  functionUrlImpl?: (functionName: string) => string
  anonKeyImpl?: () => string
  context?: MarketResolveContext
  localOcrText?: string
}

type LocalCandidateLine = {
  index: number
  name: string
  normalized: string
  amounts: number[]
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

function cleanText(value: unknown, maxLength: number) {
  return String(value || "").trim().slice(0, maxLength)
}

function cleanPositivePrice(value: unknown) {
  const price = Number(value)
  return Number.isFinite(price) && price > 0 && price <= 100_000
    ? Number(price.toFixed(2))
    : null
}

function cleanObservedDate(value: unknown) {
  const raw = String(value || "").trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null
}

function cleanContext(context: MarketResolveContext = {}) {
  return {
    store_name: cleanText(context.store_name, 120),
    store_city: cleanText(context.store_city, 80),
    observed_date: cleanObservedDate(context.observed_date),
  }
}

const OCR_FOOD_CONTEXT_TOKENS = new Set([
  "tarama",
  "cabillaud",
  "oeuf",
  "oeufs",
  "nouille",
  "nouilles",
  "pate",
  "pates",
  "ravioli",
  "quiche",
  "cake",
  "surimi",
  "thon",
  "mayonnaise",
  "poisson",
])

function normalizeOcrMeasurementToken(token: string) {
  const match = token.match(/^([ilo0-9]{1,4})(kg|gr|g|ml|cl|l)$/)
  if (!match) return token

  const digits = match[1]
    .replace(/[il]/g, "1")
    .replace(/o/g, "0")
  return `${digits}${match[2]}`
}

function normalizeFoodOcrTokens(tokens: string[]) {
  const hasFoodContext = tokens.some(token => OCR_FOOD_CONTEXT_TOKENS.has(token))
  if (!hasFoodContext) return tokens

  return tokens.map(token => {
    if (["deufs", "ceufs", "0eufs", "oeufs"].includes(token)) return "oeufs"
    if (["0euf", "oeuf"].includes(token)) return "oeuf"
    return token
  })
}

function normalizeAliasLikeText(value: unknown) {
  const base = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  if (!base) return ""

  const normalizedTokens = normalizeFoodOcrTokens(
    base
      .split(" ")
      .filter(Boolean)
      .map(normalizeOcrMeasurementToken),
  )

  return normalizedTokens.join(" ").trim()
}

function normalizeCandidateText(value: unknown) {
  return normalizeAliasLikeText(value)
}

function normalizeCandidateForSimilarity(value: unknown) {
  return normalizeCandidateText(value)
    .replace(/\b\d+(?:g|gr|kg|ml|cl|l|x)?\b/g, " ")
    .replace(/\b(prix|promotion|eur|euro|euros|tva|ttc)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function candidateBigrams(value: string) {
  const compact = value.replace(/\s+/g, " ").trim()
  if (compact.length < 2) return compact ? [compact] : []
  const grams: string[] = []
  for (let index = 0; index < compact.length - 1; index += 1) {
    grams.push(compact.slice(index, index + 2))
  }
  return grams
}

function diceSimilarity(leftValue: unknown, rightValue: unknown) {
  const left = normalizeCandidateForSimilarity(leftValue)
  const right = normalizeCandidateForSimilarity(rightValue)
  if (!left || !right) return 0
  if (left === right) return 1

  const leftBigrams = candidateBigrams(left)
  const rightBigrams = candidateBigrams(right)
  if (!leftBigrams.length || !rightBigrams.length) return 0

  const rightCounts = new Map<string, number>()
  for (const gram of rightBigrams) {
    rightCounts.set(gram, (rightCounts.get(gram) || 0) + 1)
  }

  let intersection = 0
  for (const gram of leftBigrams) {
    const count = rightCounts.get(gram) || 0
    if (count > 0) {
      intersection += 1
      rightCounts.set(gram, count - 1)
    }
  }

  return (2 * intersection) / (leftBigrams.length + rightBigrams.length)
}

function tokenSimilarity(leftValue: unknown, rightValue: unknown) {
  const left = normalizeCandidateForSimilarity(leftValue)
    .split(" ")
    .filter(token => token.length >= 2)
  const right = normalizeCandidateForSimilarity(rightValue)
    .split(" ")
    .filter(token => token.length >= 2)

  if (!left.length || !right.length) return 0
  const rightSet = new Set(right)
  const overlap = left.filter(token => rightSet.has(token)).length
  return overlap / Math.max(1, Math.min(left.length, right.length))
}

function lexicalSimilarity(leftValue: unknown, rightValue: unknown) {
  return Math.max(
    diceSimilarity(leftValue, rightValue),
    0.65 * diceSimilarity(leftValue, rightValue) + 0.35 * tokenSimilarity(leftValue, rightValue),
  )
}

function extractLineAmounts(value: unknown) {
  return Array.from(String(value || "").matchAll(/(-?\d+(?:\s?\d{3})*[,.]\d{2})/g))
    .map(match => Number(String(match[1] || "").replace(/\s/g, "").replace(",", ".")))
    .filter(amount => Number.isFinite(amount) && amount > 0 && amount <= 100_000)
}

function isNonProductCandidateLine(value: unknown) {
  const normalized = normalizeCandidateText(value)
  if (!normalized) return true
  if (/\b(total|reste a payer|net a payer|a payer|carte bleue|cb|especes|tva|ttc|ticket|caisse|telephone|merci|fidelite|articles?)\b/.test(normalized)) {
    return true
  }
  if (/^(epicerie|cremerie|charcuterie|surgeles|volaille|fruits legumes|boulangerie patisserie|traiteur)\b/.test(normalized)) {
    return true
  }
  return false
}

function cleanLocalCandidateName(value: unknown) {
  const raw = String(value || "")
    .replace(/[>|»]+/g, " ")
    .replace(/\b\d{8,14}\b/g, " ")
    .replace(/-?\d+(?:\s?\d{3})*[,.]\d{2}\s*(?:€|eur|euro|euros)?/gi, " ")
    .replace(/\s+[123]\s*$/g, " ")
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/\s+/g, " ")
    .trim()

  if (!raw || isNonProductCandidateLine(raw)) return ""
  const letters = raw.replace(/[^\p{L}]/gu, "")
  return letters.length >= 4 ? raw.slice(0, 180) : ""
}

function buildOcrAliasAlternateNames(value: unknown) {
  const raw = cleanText(value, 180)
  if (!raw) return []

  const variants = new Set<string>()
  const normalizedUnitVariant = raw.replace(/\b([iIlL1][oO0]{2})(kg|gr|g|ml|cl|l)\b/gi, (_match, _digits, unit) => `100${unit.toUpperCase()}`)
  if (normalizedUnitVariant && normalizedUnitVariant !== raw) {
    variants.add(normalizedUnitVariant)
  }

  const hasFoodContext = /\b(tarama|cabillaud|nouille|nouilles|pate|pates|ravioli|quiche|cake|surimi|thon|mayonnaise|poisson)\b/i.test(raw)
  if (hasFoodContext) {
    const oeufsVariant = raw.replace(/\b(?:DEUFS|CEUFS|0EUFS)\b/gi, "OEUFS")
    if (oeufsVariant && oeufsVariant !== raw) {
      variants.add(oeufsVariant)
    }
    const combinedVariant = oeufsVariant.replace(/\b([iIlL1][oO0]{2})(kg|gr|g|ml|cl|l)\b/gi, (_match, _digits, unit) => `100${unit.toUpperCase()}`)
    if (combinedVariant && combinedVariant !== raw) {
      variants.add(combinedVariant)
    }
  }

  return Array.from(variants).slice(0, MARKET_RESOLVE_MAX_ALTERNATE_NAMES)
}

function simplifyLocalCandidateName(value: unknown) {
  const tokens = String(value || "")
    .split(/\s+/)
    .map(token => token.trim())
    .filter(Boolean)
    .filter(token => {
      if (/^\d+[x×]\d+(?:g|gr|kg|ml|cl|l)?$/i.test(token)) return true
      if (/^\d+(?:g|gr|kg|ml|cl|l)$/i.test(token)) return true
      if (/\d/.test(token)) return false
      return token.length >= 3
    })

  return tokens.join(" ").trim().slice(0, 180)
}

function buildLocalCandidateLines(localOcrText = "") {
  return String(localOcrText || "")
    .split(/\r?\n/)
    .map((line, index): LocalCandidateLine | null => {
      const name = cleanLocalCandidateName(line)
      if (!name) return null
      return {
        index,
        name,
        normalized: normalizeCandidateText(name),
        amounts: extractLineAmounts(line),
      }
    })
    .filter(Boolean) as LocalCandidateLine[]
}

export function buildLocalOcrNameCandidates(items: any[] = [], localOcrText = "") {
  const candidateLines = buildLocalCandidateLines(localOcrText)
  if (!candidateLines.length || !items.length) {
    return (items || []).map(() => [] as string[])
  }

  const maxLineIndex = Math.max(1, ...candidateLines.map(line => line.index))
  const maxItemIndex = Math.max(1, items.length - 1)

  return (items || []).map((item, itemIndex) => {
    const primaryName = cleanText(
      item?.corrected_name || item?.name || item?.ocr_name || item?.raw_text,
      180,
    )
    const primaryNormalized = normalizeCandidateText(primaryName)
    const observedPrice = cleanPositivePrice(
      item?.total_price ?? item?.price ?? item?.unit_price,
    )
    const expectedPosition = itemIndex / maxItemIndex

    return candidateLines
      .map(line => {
        const lexical = lexicalSimilarity(primaryName, line.name)
        const tokenOverlap = tokenSimilarity(primaryName, line.name)
        const exactPrice = observedPrice !== null && line.amounts.some(
          amount => Math.abs(amount - observedPrice) <= 0.03,
        )
        const conflictingPrice = observedPrice !== null
          && line.amounts.length > 0
          && !exactPrice
        const linePosition = line.index / maxLineIndex
        const positionScore = 1 - Math.min(1, Math.abs(linePosition - expectedPosition))
        const score = (
          lexical * 0.72
          + (exactPrice ? 0.30 : 0)
          + positionScore * 0.08
          - (conflictingPrice ? 0.42 : 0)
        )

        return {
          ...line,
          lexical,
          tokenOverlap,
          exactPrice,
          conflictingPrice,
          score,
        }
      })
      .filter(candidate => {
        if (!candidate.name || candidate.normalized === primaryNormalized) return false
        if (candidate.conflictingPrice && candidate.lexical < 0.78) return false
        if (candidate.exactPrice) return candidate.lexical >= 0.16 && candidate.score >= 0.40
        if (
          candidate.lexical >= 0.32
          && candidate.tokenOverlap >= 0.25
          && (1 - Math.min(1, Math.abs(candidate.index / maxLineIndex - expectedPosition))) >= 0.85
        ) {
          return candidate.score >= 0.32
        }
        return candidate.lexical >= 0.42 && candidate.score >= 0.46
      })
      .sort((left, right) => right.score - left.score)
      .filter((candidate, index, all) => {
        return all.findIndex(other => other.normalized === candidate.normalized) === index
      })
      .slice(0, MARKET_RESOLVE_MAX_ALTERNATE_NAMES)
      .flatMap(candidate => [candidate.name, simplifyLocalCandidateName(candidate.name)])
      .filter(Boolean)
      .filter((name, index, all) => {
        const normalized = normalizeCandidateText(name)
        return all.findIndex(other => normalizeCandidateText(other) === normalized) === index
      })
      .slice(0, MARKET_RESOLVE_MAX_ALTERNATE_NAMES)
  })
}

function cleanAlternateNames(value: unknown) {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const names: string[] = []

  for (const rawName of value) {
    const name = cleanText(rawName, 180)
    const normalized = normalizeCandidateText(name)
    if (!name || !normalized || seen.has(normalized)) continue
    seen.add(normalized)
    names.push(name)
    if (names.length >= MARKET_RESOLVE_MAX_ALTERNATE_NAMES) break
  }

  return names
}

function abortError() {
  const error = new Error("market_resolve_timeout")
  error.name = "AbortError"
  return error
}

function nowMs() {
  return typeof performance !== "undefined" ? performance.now() : Date.now()
}

export function buildMarketResolvePayload(
  items: any[] = [],
  context?: MarketResolveContext,
  localOcrText = "",
) {
  const includeContextualSignals = Boolean(context)
  const localCandidates = includeContextualSignals
    ? buildLocalOcrNameCandidates(items, localOcrText)
    : (items || []).map(() => [] as string[])

  return (items || []).slice(0, MARKET_RESOLVE_MAX_ITEMS).map((item, index) => {
    const primaryName = cleanText(
      item?.raw_name || item?.ocr_name || item?.corrected_name || item?.name,
      180,
    )
    const explicitAlternateNames = cleanAlternateNames(item?.market_alternate_names)
    const alternateNames = cleanAlternateNames([
      ...explicitAlternateNames,
      ...buildOcrAliasAlternateNames(primaryName),
      ...(localCandidates[index] || []),
    ]).filter(name => normalizeCandidateText(name) !== normalizeCandidateText(primaryName))

    const payload: Record<string, unknown> = {
      index,
      raw_name: primaryName,
      barcode: cleanBarcode(item?.barcode),
    }

    if (includeContextualSignals) {
      payload.observed_price = cleanPositivePrice(
        item?.total_price ?? item?.price ?? item?.unit_price,
      )
      payload.brand = cleanText(item?.brand, 80)
      payload.package_format = cleanText(
        item?.package_format || item?.market_package_format,
        80,
      )
      payload.alternate_names = alternateNames
    }

    return payload
  })
}

export function applyMarketResolutions(
  items: any[] = [],
  resolutions: MarketResolution[] = [],
) {
  const byIndex = new Map<number, MarketResolution>()
  for (const resolution of resolutions || []) {
    byIndex.set(Number(resolution.index), resolution)
  }

  return (items || []).map((item, index) => {
    const resolution = byIndex.get(index)
    if (!resolution) return { ...item, market_matched: false }
    if (resolution.market_matched !== true) {
      const next = { ...item, market_matched: false }
      for (const field of MARKET_SUGGESTION_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(resolution, field)) {
          next[field] = resolution[field]
        }
      }
      return next
    }

    const next = { ...item }
    for (const field of MARKET_ENRICHMENT_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(resolution, field)) {
        next[field] = resolution[field]
      }
    }

    const canonicalName = cleanText(resolution.market_canonical_name, 180)
    if (canonicalName) {
      const originalOcrName = cleanText(
        item?.ocr_name || item?.name || item?.corrected_name,
        180,
      )
      next.ocr_name = originalOcrName || canonicalName
      next.name = canonicalName
      next.corrected_name = canonicalName
      next.normalized_name = normalizeCandidateText(canonicalName)
    }

    if (!Object.prototype.hasOwnProperty.call(next, "market_matched")) {
      next.market_matched = false
    }
    return next
  })
}

async function postMarketResolve(
  payload: Record<string, unknown>,
  timeoutMs = MARKET_RESOLVE_EXACT_TIMEOUT_MS,
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
  const context = dependencies.context
  const timeoutMs = context
    ? MARKET_RESOLVE_CONTEXT_TIMEOUT_MS
    : MARKET_RESOLVE_EXACT_TIMEOUT_MS
  const payloadItems = buildMarketResolvePayload(
    items,
    context,
    dependencies.localOcrText || "",
  ).filter(item => item.raw_name || item.barcode)

  if (payloadItems.length === 0) {
    return {
      items,
      diagnostics: { requested: 0, resolved: 0, unresolved: 0, skipped: true },
    }
  }

  try {
    const data = await postMarketResolve({
      items: payloadItems,
      ...(context ? { context: cleanContext(context) } : {}),
    }, timeoutMs, dependencies)

    const resolutions = Array.isArray(data?.items) ? data.items : []
    const timing = data?.__market_timing || null
    const diagnostics = {
      requested: payloadItems.length,
      resolved: Number(data?.resolved || 0),
      unresolved: Number(data?.unresolved || 0),
      exact: Number(data?.exact || 0),
      contextual: Number(data?.contextual || 0),
      alternate: Number(data?.alternate || 0),
      suggested: Number(data?.suggested || 0),
      ...(timing || {}),
    }

    if (MARKET_RESOLVE_DEBUG) {
      console.info("[market-resolver] result", {
        items: payloadItems.length,
        matched: diagnostics.resolved,
        exact: diagnostics.exact,
        contextual: diagnostics.contextual,
        alternate: diagnostics.alternate,
        suggested: diagnostics.suggested,
        unmatched: diagnostics.unresolved,
        session_ms: diagnostics.session_ms ?? null,
        request_ms: diagnostics.request_ms ?? null,
        total_ms: diagnostics.total_ms ?? null,
        timeout_budget_ms: diagnostics.timeout_budget_ms ?? timeoutMs,
        timeout: false,
      })
    }

    return {
      items: applyMarketResolutions(items, resolutions),
      diagnostics,
    }
  } catch (error) {
    const timeout = error instanceof Error && error.name === "AbortError"
    console.warn("[market-resolve] fallback without enrichment", {
      reason: error instanceof Error ? timeout ? "timeout" : error.message : "unknown",
      timeout_budget_ms: timeoutMs,
    })
    return {
      items,
      diagnostics: {
        requested: payloadItems.length,
        resolved: 0,
        unresolved: payloadItems.length,
        failed: true,
        timeout,
        timeout_budget_ms: timeoutMs,
      },
    }
  }
}

export const __marketProductResolverTestUtils = {
  applyMarketResolutions,
  buildLocalOcrNameCandidates,
  buildMarketResolvePayload,
  buildOcrAliasAlternateNames,
  normalizeCandidateText,
  postMarketResolve,
}
