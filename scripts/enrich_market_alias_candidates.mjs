import { randomUUID } from "node:crypto"
import { pathToFileURL } from "node:url"
import {
  EXTERNAL_CANDIDATE_THRESHOLDS,
  dedupeExternalCandidates,
  evaluateExternalCandidateMatch,
  sanitizeExternalCandidateRecord,
} from "../src/services/scan/marketExternalCandidateService.js"

const OFF_PRODUCT_FIELDS = [
  "code",
  "product_name",
  "brands",
  "quantity",
  "categories_tags",
  "url",
].join(",")

const OFF_BARCODE_SOURCE = "open_food_facts_barcode"
const OFF_TEXT_SOURCE = "open_food_facts_search"
const OPEN_PRICES_SOURCE = "open_prices"
const OFFICIAL_SOURCE = "official_product_page"
const PROJECT_CONTACT_URL = "https://github.com/JGOUBE/budgetkazpei"
const MARKET_ENRICHMENT_USER_AGENT = `BudgetKazPei/market-external-candidates (+${PROJECT_CONTACT_URL})`
const TRANSIENT_HTTP_STATUSES = new Set([429, 502, 503, 504])
const DEFAULT_RETRY_ATTEMPTS = 3
const DEFAULT_RETRY_BASE_DELAY_MS = 250

export function parseArgs(argv) {
  const args = {
    dryRun: false,
    pageSize: 8,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]
    const next = argv[index + 1]
    if (current === "--raw-label" && next) {
      args.rawLabel = next
      index += 1
    } else if (current === "--barcode" && next) {
      args.barcode = next
      index += 1
    } else if (current === "--brand" && next) {
      args.brand = next
      index += 1
    } else if (current === "--package-format" && next) {
      args.packageFormat = next
      index += 1
    } else if (current === "--category" && next) {
      args.category = next
      index += 1
    } else if (current === "--observed-price" && next) {
      args.observedPrice = Number(next)
      index += 1
    } else if (current === "--store-name" && next) {
      args.storeName = next
      index += 1
    } else if (current === "--store-city" && next) {
      args.storeCity = next
      index += 1
    } else if (current === "--purchase-date" && next) {
      args.purchaseDate = next
      index += 1
    } else if (current === "--page-size" && next) {
      args.pageSize = Math.max(1, Math.min(20, Number(next) || 8))
      index += 1
    } else if (current === "--official-source-name" && next) {
      args.officialSourceName = next
      index += 1
    } else if (current === "--official-source-url" && next) {
      args.officialSourceUrl = next
      index += 1
    } else if (current === "--official-source-id" && next) {
      args.officialSourceId = next
      index += 1
    } else if (current === "--official-product-name" && next) {
      args.officialProductName = next
      index += 1
    } else if (current === "--dry-run") {
      args.dryRun = true
    } else if (current === "--help" || current === "-h") {
      args.help = true
    } else {
      throw new Error(`Unknown argument: ${current}`)
    }
  }

  return args
}

function printHelp() {
  console.log(`Usage:
node scripts/enrich_market_alias_candidates.mjs --raw-label <text> [options]

Options:
  --barcode <digits>              Barcode exact when available.
  --brand <text>                  OCR brand hint.
  --package-format <text>         OCR packaging hint, e.g. "100 g" or "6x72 g".
  --category <text>               OCR/category hint.
  --observed-price <number>       Observed receipt price.
  --store-name <text>             Store or chain hint.
  --store-city <text>             City hint.
  --purchase-date <date>          Observed date YYYY-MM-DD.
  --page-size <n>                 External result limit per source (default: 8).
  --official-source-name <text>   Precise manufacturer or store source label.
  --official-source-url <url>     Official product page URL.
  --official-source-id <text>     Optional stable official source identifier.
  --official-product-name <text>  Canonical label from the official page.
  --dry-run                       Do not write to Supabase staging.
  --help                          Show this help.
`)
}

function env(name) {
  return process.env[name] || ""
}

function baseUrl() {
  const url = env("SUPABASE_URL") || env("VITE_SUPABASE_URL") || env("BKP_TEST_SUPABASE_URL")
  return String(url || "").replace(/\/+$/, "")
}

function serviceRoleKey() {
  return env("SUPABASE_SERVICE_ROLE_KEY") || env("SERVICE_ROLE_KEY") || env("BKP_TEST_SUPABASE_SERVICE_ROLE_KEY")
}

function cleanBarcode(value) {
  const barcode = String(value || "").replace(/\D/g, "")
  return barcode.length >= 8 && barcode.length <= 14 ? barcode : ""
}

function transientDelayMs(attempt, baseDelayMs = DEFAULT_RETRY_BASE_DELAY_MS) {
  return baseDelayMs * (2 ** Math.max(0, attempt - 1))
}

function sleep(ms, dependencies = {}) {
  const setTimeoutImpl = dependencies.setTimeoutImpl || setTimeout
  return new Promise(resolve => {
    setTimeoutImpl(resolve, ms)
  })
}

function createExternalFetchError({
  sourceKey,
  status,
  url,
  attempt,
  body,
  reason,
}) {
  const error = new Error(
    reason || `external_fetch_failed:${sourceKey}:${status ?? "unknown"}:${attempt}:${url}`,
  )
  error.name = "ExternalFetchError"
  error.sourceKey = sourceKey
  error.status = status ?? null
  error.url = url
  error.attempts = attempt
  error.responseBody = body || ""
  return error
}

function isTransientStatus(status) {
  return TRANSIENT_HTTP_STATUSES.has(Number(status))
}

function createEmptySourceReport() {
  return {
    source_strategy: "full_text_fallback",
    sources_succeeded: [],
    sources_unavailable: [],
    attempts_by_source: {},
    attempt_count: 0,
    exact_candidate_found: false,
    barcode_lookup_not_found: false,
  }
}

function appendSucceededSource(report, sourceName) {
  if (!report.sources_succeeded.includes(sourceName)) {
    report.sources_succeeded.push(sourceName)
  }
}

function appendUnavailableSource(report, sourceName, error) {
  report.sources_unavailable.push({
    source: sourceName,
    status: error?.status ?? null,
    attempts: error?.attempts ?? report.attempts_by_source[sourceName] ?? 0,
    reason: error?.message || "unknown_error",
  })
}

export async function fetchJsonWithRetry(url, dependencies = {}, options = {}) {
  const fetchImpl = dependencies.fetchImpl || fetch
  const maxAttempts = Math.max(1, Number(options.maxAttempts || DEFAULT_RETRY_ATTEMPTS))
  const baseDelayMs = Math.max(0, Number(options.baseDelayMs || DEFAULT_RETRY_BASE_DELAY_MS))
  const sourceKey = options.sourceKey || "external_source"
  let attempt = 0
  let lastError = null

  while (attempt < maxAttempts) {
    attempt += 1
    try {
      const response = await fetchImpl(url, {
        headers: {
          "User-Agent": MARKET_ENRICHMENT_USER_AGENT,
          Accept: "application/json",
        },
      })

      if (response.ok) {
        return {
          payload: await response.json(),
          attempts: attempt,
          status: response.status,
        }
      }

      const body = await response.text().catch(() => "")
      lastError = createExternalFetchError({
        sourceKey,
        status: response.status,
        url,
        attempt,
        body,
      })

      if (!isTransientStatus(response.status) || attempt >= maxAttempts) {
        throw lastError
      }
    } catch (error) {
      const normalizedError = error?.name === "ExternalFetchError"
        ? error
        : createExternalFetchError({
          sourceKey,
          status: error?.status ?? null,
          url,
          attempt,
          reason: error?.message || "network_error",
        })

      lastError = normalizedError
      if (!isTransientStatus(normalizedError.status) || attempt >= maxAttempts) {
        throw normalizedError
      }
    }

    await sleep(transientDelayMs(attempt, baseDelayMs), dependencies)
  }

  throw lastError || createExternalFetchError({
    sourceKey,
    status: null,
    url,
    attempt,
    reason: "retry_exhausted",
  })
}

export async function fetchJson(url, dependencies = {}, options = {}) {
  const result = await fetchJsonWithRetry(url, dependencies, options)
  return result.payload
}

export async function fetchOpenFoodFactsBarcodeCandidate(args, dependencies = {}) {
  const barcode = cleanBarcode(args.barcode)
  if (!barcode) {
    return {
      candidates: [],
      exactCandidateFound: false,
      found: false,
      attempts: 0,
      status: null,
      reason: "missing_barcode",
    }
  }

  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${encodeURIComponent(OFF_PRODUCT_FIELDS)}`
  const { payload, attempts, status } = await fetchJsonWithRetry(url, dependencies, {
    sourceKey: OFF_BARCODE_SOURCE,
  })
  const product = payload?.product
  const productBarcode = cleanBarcode(product?.code || barcode)
  const productName = String(product?.product_name || "").trim()

  if (payload?.status !== 1 || !productName) {
    return {
      candidates: [],
      exactCandidateFound: false,
      found: false,
      attempts,
      status,
      reason: "barcode_lookup_not_found",
    }
  }

  const candidate = {
    source_type: "open_food_facts",
    source_name: "open_food_facts",
    source_identifier: String(product.code || barcode),
    source_url: product.url || `https://world.openfoodfacts.org/product/${product.code || barcode}`,
    raw_label: args.rawLabel,
    candidate_canonical_name: productName,
    brand: product.brands || "",
    category: Array.isArray(product.categories_tags) ? product.categories_tags[0] || "" : "",
    package_format: product.quantity || "",
    barcode: product.code || barcode,
    observed_price: args.observedPrice,
    store_name: args.storeName,
    store_city: args.storeCity,
    source_confidence: productBarcode === barcode ? EXTERNAL_CANDIDATE_THRESHOLDS.AUTO_PROMOTE_BARCODE_THRESHOLD : 0.86,
    matching_evidence: {
      source: "barcode_lookup",
      observed_date: args.purchaseDate || null,
      official_api: "https://world.openfoodfacts.org/api/v2/product/{barcode}.json",
      source_strategy: "exact_barcode_lookup",
      barcode_match: productBarcode === barcode,
    },
  }

  return {
    candidates: [candidate],
    exactCandidateFound: productBarcode === barcode,
    found: true,
    attempts,
    status,
    reason: productBarcode === barcode ? "exact_barcode_lookup" : "barcode_mismatch",
  }
}

export async function fetchOpenFoodFactsTextCandidates(args, dependencies = {}) {
  if (!args.rawLabel) {
    return {
      candidates: [],
      attempts: 0,
      status: null,
    }
  }

  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(args.rawLabel)}&search_simple=1&action=process&json=1&page_size=${args.pageSize}`
  const { payload, attempts, status } = await fetchJsonWithRetry(url, dependencies, {
    sourceKey: OFF_TEXT_SOURCE,
  })
  const candidates = []

  for (const product of payload?.products || []) {
    if (!product?.product_name) continue
    candidates.push({
      source_type: "open_food_facts",
      source_name: "open_food_facts",
      source_identifier: String(product.code || product._id || randomUUID()),
      source_url: product.url || `https://world.openfoodfacts.org/product/${product.code || product._id}`,
      raw_label: args.rawLabel,
      candidate_canonical_name: product.product_name,
      brand: product.brands || "",
      category: Array.isArray(product.categories_tags) ? product.categories_tags[0] || "" : "",
      package_format: product.quantity || "",
      barcode: product.code || "",
      observed_price: args.observedPrice,
      store_name: args.storeName,
      store_city: args.storeCity,
      source_confidence: 0.63,
      matching_evidence: {
        source: "legacy_full_text_search",
        observed_date: args.purchaseDate || null,
        official_api: "https://world.openfoodfacts.org/cgi/search.pl",
        stores: product.stores || "",
        source_strategy: "full_text_fallback",
      },
    })
  }

  return {
    candidates,
    attempts,
    status,
  }
}

export async function fetchOpenPrices(args, dependencies = {}) {
  if (!args.barcode && !args.rawLabel) {
    return {
      candidates: [],
      attempts: 0,
      status: null,
    }
  }

  const params = new URLSearchParams({
    size: String(args.pageSize),
  })
  if (args.barcode) {
    params.set("product_code", args.barcode)
  } else if (args.rawLabel) {
    params.set("product_name", args.rawLabel)
  }
  if (args.storeName) {
    params.set("location__osm_name__contains", args.storeName)
  }
  if (args.purchaseDate) {
    params.set("order_by", "-date")
  }

  const { payload, attempts, status } = await fetchJsonWithRetry(
    `https://prices.openfoodfacts.org/api/v1/prices?${params.toString()}`,
    dependencies,
    { sourceKey: OPEN_PRICES_SOURCE },
  )
  const results = Array.isArray(payload?.results) ? payload.results : []

  return {
    candidates: results.map(entry => ({
      source_type: "open_prices",
      source_name: "open_prices",
      source_identifier: String(entry.id || entry.proof_id || randomUUID()),
      source_url: entry.proof?.proof_url || entry.proof?.file_path || `https://prices.openfoodfacts.org/api/v1/prices/${entry.id}`,
      raw_label: args.rawLabel,
      candidate_canonical_name: entry.product_name || entry.product?.product_name || args.rawLabel,
      brand: entry.product?.brands || "",
      category: Array.isArray(entry.product?.categories_tags) ? entry.product.categories_tags[0] || "" : "",
      package_format: [entry.product?.product_quantity, entry.product?.product_quantity_unit].filter(Boolean).join(" ").trim(),
      barcode: entry.product_code || entry.product?.code || "",
      observed_price: entry.price,
      store_name: entry.location?.osm_name || args.storeName || "",
      store_city: entry.location?.osm_address_city || entry.location?.osm_address_postcode || args.storeCity || "",
      source_confidence: 0.69,
      matching_evidence: {
        source: "price_observation",
        proof_id: entry.proof_id || null,
        proof_type: entry.proof?.type || null,
        observed_date: entry.date || args.purchaseDate || null,
        is_reunion: /974|reunion|reunion/i.test(`${entry.location?.osm_address_country || ""} ${entry.location?.osm_address_city || ""} ${entry.location?.osm_name || ""}`),
        official_api: "https://prices.openfoodfacts.org/api/v1/prices",
      },
    })),
    attempts,
    status,
  }
}

export function buildOfficialSourceCandidate(args) {
  if (!args.officialSourceName || !args.officialSourceUrl || !args.officialProductName || !args.rawLabel) {
    return []
  }

  return [{
    source_type: OFFICIAL_SOURCE,
    source_name: args.officialSourceName,
    source_identifier: args.officialSourceId || args.officialSourceUrl,
    source_url: args.officialSourceUrl,
    raw_label: args.rawLabel,
    candidate_canonical_name: args.officialProductName,
    brand: args.brand || "",
    category: args.category || "",
    package_format: args.packageFormat || "",
    barcode: args.barcode || "",
    observed_price: args.observedPrice,
    store_name: args.storeName,
    store_city: args.storeCity,
    source_confidence: 0.74,
    matching_evidence: {
      source: "official_precise_product_page",
      observed_date: args.purchaseDate || null,
      exact_reference_identified: true,
    },
  }]
}

async function collectBarcodeCandidates(args, dependencies, report) {
  try {
    const result = await fetchOpenFoodFactsBarcodeCandidate(args, dependencies)
    report.attempts_by_source[OFF_BARCODE_SOURCE] = result.attempts
    report.attempt_count += result.attempts

    if (result.found) {
      appendSucceededSource(report, OFF_BARCODE_SOURCE)
    } else if (result.reason === "barcode_lookup_not_found") {
      report.barcode_lookup_not_found = true
      console.warn("[market-external-enrich] barcode_lookup_not_found", {
        barcode: cleanBarcode(args.barcode),
        raw_label: args.rawLabel,
      })
    }

    report.exact_candidate_found = Boolean(result.exactCandidateFound)
    return result.candidates
  } catch (error) {
    report.attempts_by_source[OFF_BARCODE_SOURCE] = error?.attempts ?? 0
    report.attempt_count += error?.attempts ?? 0
    if (Number(error?.status) === 404) {
      report.barcode_lookup_not_found = true
      console.warn("[market-external-enrich] barcode_lookup_not_found", {
        barcode: cleanBarcode(args.barcode),
        raw_label: args.rawLabel,
      })
      return []
    }
    appendUnavailableSource(report, OFF_BARCODE_SOURCE, error)
    return []
  }
}

async function collectTextCandidates(args, dependencies, report) {
  try {
    const result = await fetchOpenFoodFactsTextCandidates(args, dependencies)
    report.attempts_by_source[OFF_TEXT_SOURCE] = result.attempts
    report.attempt_count += result.attempts
    appendSucceededSource(report, OFF_TEXT_SOURCE)
    return result.candidates
  } catch (error) {
    report.attempts_by_source[OFF_TEXT_SOURCE] = error?.attempts ?? 0
    report.attempt_count += error?.attempts ?? 0
    appendUnavailableSource(report, OFF_TEXT_SOURCE, error)
    return []
  }
}

async function collectOpenPricesCandidates(args, dependencies, report) {
  try {
    const result = await fetchOpenPrices(args, dependencies)
    report.attempts_by_source[OPEN_PRICES_SOURCE] = result.attempts
    report.attempt_count += result.attempts
    appendSucceededSource(report, OPEN_PRICES_SOURCE)
    return result.candidates
  } catch (error) {
    report.attempts_by_source[OPEN_PRICES_SOURCE] = error?.attempts ?? 0
    report.attempt_count += error?.attempts ?? 0
    appendUnavailableSource(report, OPEN_PRICES_SOURCE, error)
    return []
  }
}

export async function collectExternalCandidatesWithReport(args, dependencies = {}) {
  const report = createEmptySourceReport()
  const candidates = []

  if (args.barcode) {
    candidates.push(...await collectBarcodeCandidates(args, dependencies, report))
  }

  const shouldRunFullTextFallback = !args.barcode || !report.exact_candidate_found
  if (shouldRunFullTextFallback) {
    candidates.push(...await collectTextCandidates(args, dependencies, report))
  }

  candidates.push(...await collectOpenPricesCandidates(args, dependencies, report))

  const officialCandidates = buildOfficialSourceCandidate(args)
  if (officialCandidates.length > 0) {
    report.attempts_by_source[OFFICIAL_SOURCE] = 0
    appendSucceededSource(report, OFFICIAL_SOURCE)
    candidates.push(...officialCandidates)
  }

  report.source_strategy = args.barcode && report.exact_candidate_found
    ? "exact_barcode_lookup"
    : "full_text_fallback"

  return {
    candidates,
    report,
  }
}

export async function collectExternalCandidates(args, dependencies = {}) {
  const result = await collectExternalCandidatesWithReport(args, dependencies)
  return result.candidates
}

export function buildEvaluatedCandidateRows(args, candidates = []) {
  return dedupeExternalCandidates(candidates).map(candidate => sanitizeExternalCandidateRecord(
    evaluateExternalCandidateMatch({
      raw_label: args.rawLabel,
      brand: args.brand,
      package_format: args.packageFormat,
      barcode: args.barcode,
      observed_price: args.observedPrice,
      store_name: args.storeName,
      store_city: args.storeCity,
      candidate,
    }),
  ))
}

export function buildExternalCandidateUpsertPath() {
  return "market_external_product_candidates?on_conflict=source_name,source_identifier,normalized_raw_label,normalized_candidate_name,barcode,store_name,store_city"
}

export async function upsertCandidates(rows, dependencies = {}) {
  const url = dependencies.baseUrl || baseUrl()
  const key = dependencies.serviceRoleKey || serviceRoleKey()
  const fetchImpl = dependencies.fetchImpl || fetch
  if (!url || !key) {
    throw new Error("missing_supabase_service_role_env")
  }

  const response = await fetchImpl(`${url}/rest/v1/${buildExternalCandidateUpsertPath()}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(rows),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`supabase_upsert_failed:${response.status}:${text}`)
  }

  return response.json()
}

export async function runCli(argv = process.argv.slice(2), dependencies = {}) {
  const args = parseArgs(argv)
  if (args.help || !args.rawLabel) {
    printHelp()
    if (!args.help) {
      process.exitCode = 1
    }
    return null
  }

  const { candidates: collected, report } = await collectExternalCandidatesWithReport(args, dependencies)
  const rows = buildEvaluatedCandidateRows(args, collected)

  console.log(JSON.stringify({
    dry_run: args.dryRun,
    source_strategy: report.source_strategy,
    sources_used: report.sources_succeeded,
    sources_succeeded: report.sources_succeeded,
    sources_unavailable: report.sources_unavailable,
    attempts_by_source: report.attempts_by_source,
    attempt_count: report.attempt_count,
    exact_candidate_found: report.exact_candidate_found,
    barcode_lookup_not_found: report.barcode_lookup_not_found,
    thresholds: {
      barcode_exact: `>= ${EXTERNAL_CANDIDATE_THRESHOLDS.AUTO_PROMOTE_BARCODE_THRESHOLD}`,
      exact_name_brand_package: `>= ${EXTERNAL_CANDIDATE_THRESHOLDS.AUTO_PROMOTE_STRONG_THRESHOLD}`,
      suggestion: `>= ${EXTERNAL_CANDIDATE_THRESHOLDS.SUGGESTION_THRESHOLD}`,
    },
    candidates_found: rows.length,
    candidates: rows,
  }, null, 2))

  if (args.dryRun) return {
    rows,
    report,
  }

  const persisted = await upsertCandidates(rows, dependencies)
  console.log(JSON.stringify({
    persisted_count: Array.isArray(persisted) ? persisted.length : 0,
    persisted,
  }, null, 2))
  return {
    persisted,
    report,
  }
}

const isDirectRun = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false

if (isDirectRun) {
  runCli().catch(error => {
    console.error("[market-external-enrich] failed", error)
    process.exitCode = 1
  })
}
