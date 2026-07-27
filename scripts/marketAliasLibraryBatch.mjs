import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import {
  buildCuratedProofAuditEntries,
  buildCuratedProofCandidates,
  buildProgressiveWebQueries,
  inferObservedBrandHint,
  inferObservedPackageHint,
} from "./marketAliasCuratedEvidence.mjs"

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const CACHE_DIR = path.join(REPO_ROOT, ".market-alias-cache")
const CHECKPOINT_DIR = path.join(REPO_ROOT, ".market-alias-checkpoints")
const DEFAULT_LIMIT = 50
const DEFAULT_CONCURRENCY = 2
const DEFAULT_DELAY_MS = 250
const DEFAULT_MAX_RETRIES = 3
const DEFAULT_SUB_BATCH_SIZE = 10
const BATCH_CACHE_VERSION = 4
const APPLY_LIBRARY_ALLOWED_CLASSIFICATIONS = new Set([
  "exact_strong",
  "strong_without_barcode",
  "active_library_ready",
])

const CHAIN_PRIORITY = new Map([
  ["e leclerc", 1],
  ["leader price", 2],
  ["carrefour", 3],
  ["u", 4],
  ["auchan", 5],
  ["gamm vert", 6],
  ["weldom", 7],
])

const FORBIDDEN_REPORT_KEYS = new Set([
  "user_id",
  "userId",
  "receipt_id",
  "receiptId",
  "receipt_item_id",
  "receiptItemId",
  "uuid",
  "email",
  "authorization",
  "bearer",
  "token",
  "anon_key",
  "service_role_key",
  "supabase_db_password",
  "password",
  "storage_path",
  "storage_url",
  "image",
  "image_url",
  "image_path",
  "loyalty_card_number",
  "payment_reference",
])

const SENSITIVE_VALUE_PATTERNS = [
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
  /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i,
  /authorization\s*:/i,
  /bearer\s+[a-z0-9._-]+/i,
  /sb_(?:publishable|secret|service_role|anon)_[a-z0-9_-]+/i,
  /postgres(?:ql)?:\/\/[^ ]+/i,
  /supabase\.co\/storage\/v1\//i,
]

const UUID_VALUE_PATTERN = SENSITIVE_VALUE_PATTERNS[0]

function normalizeText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function normalizePackage(value = "") {
  return normalizeText(value)
    .replace(/\b(\d+)og\b/g, "$10g")
    .replace(/\bgr\b/g, "g")
    .trim()
}

function cleanText(value = "", max = 180) {
  return String(value || "").trim().slice(0, max)
}

function cleanOptionalText(value = "", max = 180) {
  const next = cleanText(value, max)
  return next || null
}

function cleanPrice(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 && number <= 100_000
    ? Number(number.toFixed(2))
    : null
}

function cleanBarcode(value = "") {
  const barcode = String(value || "").replace(/\D/g, "")
  return barcode.length >= 8 && barcode.length <= 14 ? barcode : null
}

function representativeChainKey(chainKey = "") {
  const normalized = normalizeText(chainKey)
  if (normalized.startsWith("gamm vert")) return "gamm vert"
  if (normalized.startsWith("weldom")) return "weldom"
  if (normalized === "super u" || normalized === "hyper u" || normalized === "u") return "u"
  return normalized
}

function priorityRank(chainKey = "") {
  const normalized = representativeChainKey(chainKey)
  return CHAIN_PRIORITY.get(normalized) || 99
}

function csvSplit(line) {
  const cells = []
  let current = ""
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (quoted) {
      if (char === "\"" && line[index + 1] === "\"") {
        current += "\""
        index += 1
      } else if (char === "\"") {
        quoted = false
      } else {
        current += char
      }
      continue
    }
    if (char === "\"") {
      quoted = true
      continue
    }
    if (char === ",") {
      cells.push(current)
      current = ""
      continue
    }
    current += char
  }
  cells.push(current)
  return cells
}

function markdownTableCell(value) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ")
}

function sleep(ms, dependencies = {}) {
  const setTimeoutImpl = dependencies.setTimeoutImpl || setTimeout
  return new Promise(resolve => {
    setTimeoutImpl(resolve, ms)
  })
}

function extractFirstJson(text) {
  const source = String(text || "")
  for (let start = 0; start < source.length; start += 1) {
    const first = source[start]
    if (first !== "{" && first !== "[") continue
    let depth = 0
    let inString = false
    let escaping = false
    for (let index = start; index < source.length; index += 1) {
      const char = source[index]
      if (inString) {
        if (escaping) escaping = false
        else if (char === "\\") escaping = true
        else if (char === "\"") inString = false
        continue
      }
      if (char === "\"") {
        inString = true
        continue
      }
      if (char === "{" || char === "[") depth += 1
      else if (char === "}" || char === "]") {
        depth -= 1
        if (depth === 0) {
          return JSON.parse(source.slice(start, index + 1))
        }
      }
    }
  }
  throw new Error(`unable_to_parse_json_from_cli_output`)
}

function rowsFrom(result) {
  if (Array.isArray(result)) return result
  if (Array.isArray(result?.rows)) return result.rows
  return []
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null
  return JSON.parse(fs.readFileSync(filePath, "utf8"))
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

function safeFileSlug(value = "") {
  const normalized = normalizeText(value).replace(/\s+/g, "-")
  return normalized || createHash("sha1").update(String(value || "")).digest("hex").slice(0, 12)
}

function sanitizePathFragment(value = "") {
  return String(value || "").replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-")
}

function sqlTextLiteral(value = "") {
  return `'${String(value || "").replace(/'/g, "''")}'`
}

function buildCachePath(batchId, normalizedLabel) {
  return path.join(CACHE_DIR, `${sanitizePathFragment(batchId)}-${safeFileSlug(normalizedLabel)}.json`)
}

function buildCheckpointPath(batchId) {
  return path.join(CHECKPOINT_DIR, `${sanitizePathFragment(batchId)}.json`)
}

function allowsUuidInReportTrace(trace = "") {
  return trace.endsWith(".product_id")
    || trace.endsWith(".matched_product_id")
    || trace.endsWith(".reusable_product.id")
}

function ensureSafeReportValue(value, trace = "root") {
  if (value == null) return
  if (typeof value === "string") {
    if (UUID_VALUE_PATTERN.test(value) && allowsUuidInReportTrace(trace)) {
      return
    }
    for (const pattern of SENSITIVE_VALUE_PATTERNS) {
      if (pattern.test(value)) {
        throw new Error(`unsafe_report_value:${trace}`)
      }
    }
    return
  }
  if (typeof value === "number" || typeof value === "boolean") return
  if (Array.isArray(value)) {
    value.forEach((entry, index) => ensureSafeReportValue(entry, `${trace}[${index}]`))
    return
  }
  if (typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (FORBIDDEN_REPORT_KEYS.has(key)) {
        throw new Error(`forbidden_report_key:${trace}.${key}`)
      }
      ensureSafeReportValue(entry, `${trace}.${key}`)
    }
  }
}

function writeSafeTextReport(filePath, text) {
  ensureSafeReportValue(String(text || ""), "markdown")
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${String(text || "").trimEnd()}\n`, "utf8")
}

export function parseBatchFile(filePath) {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath)
  const content = fs.readFileSync(absolutePath, "utf8")
  if (absolutePath.toLowerCase().endsWith(".json")) {
    const parsed = JSON.parse(content)
    const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : []
    return rows.map(normalizeInputBatchRow).filter(Boolean)
  }
  if (absolutePath.toLowerCase().endsWith(".csv")) {
    const lines = content.split(/\r?\n/).filter(Boolean)
    if (!lines.length) return []
    const headers = csvSplit(lines[0]).map(value => normalizeText(value).replace(/\s+/g, "_"))
    return lines.slice(1)
      .map(line => {
        const values = csvSplit(line)
        const row = {}
        headers.forEach((header, index) => {
          row[header] = values[index] ?? ""
        })
        return normalizeInputBatchRow(row)
      })
      .filter(Boolean)
  }
  throw new Error(`unsupported_batch_file_format:${absolutePath}`)
}

function normalizeInputBatchRow(row = {}) {
  const rawLabel = cleanText(
    row.raw_label
    || row.rawLabel
    || row.label
    || row.name
    || "",
    180,
  )
  if (!rawLabel) return null
  return {
    raw_label: rawLabel,
    normalized_raw_label: cleanText(row.normalized_raw_label || row.normalizedRawLabel || normalizeText(rawLabel), 180),
    frequency: Math.max(1, Number(row.frequency || row.count || 1) || 1),
    distinct_receipts: Math.max(1, Number(row.distinct_receipts || row.distinctReceipts || row.frequency || 1) || 1),
    store_chain_key: cleanText(row.store_chain_key || row.storeChainKey || row.chain_key || row.chainKey || "", 120),
    store_name: cleanOptionalText(row.store_name || row.storeName || "", 120),
    store_city: cleanOptionalText(row.store_city || row.storeCity || row.commune || "", 80),
    category_hint: cleanOptionalText(row.category_hint || row.category || "", 120),
    brand_hint: cleanOptionalText(row.brand_hint || row.brand || "", 80),
    package_format_hint: cleanOptionalText(row.package_format_hint || row.package_format || row.packageFormat || "", 80),
    observed_price_min: cleanPrice(row.observed_price_min || row.observedPriceMin || row.price_min || row.priceMin),
    observed_price_max: cleanPrice(row.observed_price_max || row.observedPriceMax || row.price_max || row.priceMax),
    first_observed_at: cleanOptionalText(row.first_observed_at || row.firstObservedAt || row.first_seen_at || "", 40),
    last_observed_at: cleanOptionalText(row.last_observed_at || row.lastObservedAt || row.last_seen_at || "", 40),
    receipts_observed: Math.max(1, Number(row.receipts_observed || row.receiptsObserved || row.distinct_receipts || 1) || 1),
    chain_rank: priorityRank(row.store_chain_key || row.storeChainKey || row.chain_key || row.chainKey || ""),
    source_mode: "file",
  }
}

export function buildDatabaseSelectionSql({ storeChain = "" } = {}) {
  const normalizedStoreChain = representativeChainKey(storeChain)
  const chainFilterSql = normalizedStoreChain
    ? `where aggregated.store_chain_key = ${sqlTextLiteral(normalizedStoreChain)}`
    : ""

  return `
with base_items as (
  select
    trim(coalesce(nullif(receipt_items.corrected_name, ''), nullif(receipt_items.ocr_name, ''), nullif(receipt_items.name, ''), '')) as raw_label,
    public.market_normalize_manual_alias_text(trim(coalesce(nullif(receipt_items.corrected_name, ''), nullif(receipt_items.ocr_name, ''), nullif(receipt_items.name, ''), ''))) as normalized_raw_label,
    coalesce(nullif(receipt_items.brand, ''), nullif(receipt_items.market_brand, ''), '') as brand_hint,
    coalesce(nullif(receipt_items.category, ''), nullif(receipt_items.market_category, ''), '') as category_hint,
    coalesce(nullif(receipt_items.market_package_format, ''), '') as package_format_hint,
    coalesce(receipts.store_name, '') as store_name,
    coalesce(receipts.store_location, '') as store_city,
    public.market_store_chain_key(receipts.store_name) as store_chain_key,
    (
      select case when count(*) = 1 then max(stores.id::text)::uuid else null end
      from public.market_stores stores
      where stores.normalized_store_name = public.market_normalize_text(coalesce(receipts.store_name, ''))
        and (
          public.market_normalize_text(coalesce(receipts.store_location, '')) = ''
          or stores.normalized_city = public.market_normalize_text(coalesce(receipts.store_location, ''))
        )
    ) as store_id,
    receipt_items.receipt_id,
    receipt_items.market_product_id,
    coalesce(receipt_items.market_matched, false) as market_matched,
    case
      when receipt_items.total_price is not null and receipt_items.total_price > 0 then receipt_items.total_price
      when receipt_items.unit_price is not null and receipt_items.unit_price > 0 then receipt_items.unit_price
      else null
    end as observed_price,
    receipt_items.created_at::date as observed_date
  from public.receipt_items
  join public.receipts on receipts.id = receipt_items.receipt_id
  where coalesce(receipt_items.line_type, 'product') = 'product'
),
filtered as (
  select *
  from base_items
  where normalized_raw_label <> ''
    and length(normalized_raw_label) >= 3
    and normalized_raw_label !~ '(?:^| )(total|sous total|reste a payer|net a payer|paiement|carte bleue|cb|ticket|tva|ttc|fidelite|remise|bon achat|consigne)(?: |$)'
    and raw_label !~ '^\\s*\\d{8,14}\\s*$'
),
variant_counts as (
  select
    normalized_raw_label,
    raw_label,
    count(*)::int as variant_count
  from filtered
  group by normalized_raw_label, raw_label
),
chain_counts as (
  select
    normalized_raw_label,
    store_chain_key,
    count(*)::int as chain_count
  from filtered
  group by normalized_raw_label, store_chain_key
),
ranked_labels as (
  select
    filtered.*,
    row_number() over (
      partition by filtered.normalized_raw_label
      order by variant_counts.variant_count desc, length(filtered.raw_label) desc, filtered.raw_label asc
    ) as raw_label_rank,
    row_number() over (
      partition by filtered.normalized_raw_label
      order by chain_counts.chain_count desc, filtered.store_chain_key asc
    ) as chain_rank
  from filtered
  join variant_counts
    on variant_counts.normalized_raw_label = filtered.normalized_raw_label
   and variant_counts.raw_label = filtered.raw_label
  join chain_counts
    on chain_counts.normalized_raw_label = filtered.normalized_raw_label
   and chain_counts.store_chain_key = filtered.store_chain_key
),
aggregated as (
  select
    normalized_raw_label,
    max(raw_label) filter (where raw_label_rank = 1) as raw_label,
    count(*)::int as frequency,
    count(distinct receipt_id)::int as distinct_receipts,
    count(distinct nullif(store_chain_key, ''))::int as distinct_chains,
    max(store_chain_key) filter (where chain_rank = 1) as store_chain_key,
    max(store_id::text) filter (where chain_rank = 1)::uuid as store_id,
    max(store_name) filter (where chain_rank = 1) as store_name,
    max(store_city) filter (where chain_rank = 1) as store_city,
    min(nullif(category_hint, '')) as category_hint,
    min(nullif(brand_hint, '')) as brand_hint,
    min(nullif(package_format_hint, '')) as package_format_hint,
    min(observed_price) as observed_price_min,
    max(observed_price) as observed_price_max,
    min(observed_date)::text as first_observed_at,
    max(observed_date)::text as last_observed_at,
    count(*) filter (where market_matched = true and market_product_id is not null)::int as resolved_rows,
    count(distinct market_product_id) filter (where market_matched = true and market_product_id is not null)::int as resolved_product_count,
    max(market_product_id::text) filter (where market_matched = true and market_product_id is not null)::uuid as resolved_product_id
  from ranked_labels
  group by normalized_raw_label
),
coverage as (
  select
    aggregated.*,
    case
      when aggregated.distinct_chains > 1 then 3
      when coalesce(aggregated.store_chain_key, '') <> '' then 2
      else 1
    end as scope_signal,
    case
      when coalesce(aggregated.brand_hint, '') <> '' then 1
      else 0
    end as brand_signal,
    case
      when coalesce(aggregated.package_format_hint, '') <> '' then 1
      else 0
    end as package_signal,
    manual.coverage_type as manual_coverage_type,
    manual.coverage_source as manual_coverage_source,
    manual.coverage_scope as manual_coverage_scope,
    manual.canonical_product as manual_canonical_product,
    standard.coverage_type as standard_coverage_type,
    standard.coverage_source as standard_coverage_source,
    standard.coverage_scope as standard_coverage_scope,
    standard.canonical_product as standard_canonical_product,
    validated.coverage_type as validated_coverage_type,
    validated.coverage_source as validated_coverage_source,
    validated.coverage_scope as validated_coverage_scope,
    validated.canonical_product as validated_canonical_product,
    resolved.coverage_type as resolved_coverage_type,
    resolved.coverage_source as resolved_coverage_source,
    resolved.coverage_scope as resolved_coverage_scope,
    resolved.canonical_product as resolved_canonical_product
  from aggregated
  left join lateral (
    select
      'manual_alias'::text as coverage_type,
      'market_manual_product_aliases'::text as coverage_source,
      aliases.scope::text as coverage_scope,
      coalesce(products.canonical_name, nullif(aliases.corrected_label, ''), aliases.raw_label)::text as canonical_product
    from public.market_manual_product_aliases aliases
    left join public.market_products products
      on products.id = aliases.product_id
    where coalesce(aliases.status, 'active') = 'active'
      and (
        coalesce(nullif(aliases.normalized_raw_label, ''), public.market_normalize_manual_alias_text(aliases.raw_label)) = aggregated.normalized_raw_label
        or coalesce(nullif(aliases.normalized_corrected_label, ''), public.market_normalize_manual_alias_text(aliases.corrected_label)) = aggregated.normalized_raw_label
      )
      and (
        (aliases.scope = 'store' and aggregated.store_id is not null and aliases.store_id = aggregated.store_id)
        or (aliases.scope = 'chain' and aggregated.store_chain_key <> '' and public.market_store_chain_key(aliases.store_chain_key) = aggregated.store_chain_key)
        or aliases.scope = 'global'
      )
    order by
      case aliases.scope when 'store' then 1 when 'chain' then 2 else 3 end asc,
      case when aliases.product_id is not null then 0 else 1 end asc,
      aliases.created_at desc nulls last
    limit 1
  ) manual on true
  left join lateral (
    select
      'standard_alias'::text as coverage_type,
      coalesce(nullif(aliases.source, ''), 'market_product_aliases')::text as coverage_source,
      'global'::text as coverage_scope,
      coalesce(products.canonical_name, aliases.raw_label)::text as canonical_product
    from public.market_product_aliases aliases
    left join public.market_products products
      on products.id = aliases.product_id
    where aliases.normalized_raw_label = aggregated.normalized_raw_label
    order by aliases.created_at desc nulls last
    limit 1
  ) standard on true
  left join lateral (
    select
      'validated_external_candidate'::text as coverage_type,
      'market_external_product_candidates'::text as coverage_source,
      'global'::text as coverage_scope,
      coalesce(candidates.candidate_canonical_name, candidates.raw_label)::text as canonical_product
    from public.market_external_product_candidates candidates
    where candidates.normalized_raw_label = aggregated.normalized_raw_label
      and candidates.status = 'validated'
    order by candidates.last_seen_at desc nulls last, candidates.first_seen_at desc nulls last
    limit 1
  ) validated on true
  left join lateral (
    select
      'resolved_product'::text as coverage_type,
      'receipt_items'::text as coverage_source,
      case
        when aggregated.distinct_chains > 1 then 'global'
        when coalesce(aggregated.store_chain_key, '') <> '' then 'chain'
        else 'store'
      end::text as coverage_scope,
      coalesce(products.canonical_name, aggregated.raw_label)::text as canonical_product
    from public.market_products products
    where aggregated.resolved_rows > 0
      and aggregated.resolved_product_count = 1
      and products.id = aggregated.resolved_product_id
    union all
    select
      'resolved_product'::text,
      'receipt_items'::text,
      case
        when aggregated.distinct_chains > 1 then 'global'
        when coalesce(aggregated.store_chain_key, '') <> '' then 'chain'
        else 'store'
      end::text,
      aggregated.raw_label::text
    where aggregated.resolved_rows > 0
      and aggregated.resolved_product_count <> 1
    limit 1
  ) resolved on true
  ${chainFilterSql}
)
select
  coverage.*,
  coalesce(
    coverage.manual_coverage_type,
    coverage.standard_coverage_type,
    coverage.resolved_coverage_type,
    coverage.validated_coverage_type
  ) as coverage_type,
  coalesce(
    coverage.manual_coverage_source,
    coverage.standard_coverage_source,
    coverage.resolved_coverage_source,
    coverage.validated_coverage_source
  ) as coverage_source,
  coalesce(
    coverage.manual_coverage_scope,
    coverage.standard_coverage_scope,
    coverage.resolved_coverage_scope,
    coverage.validated_coverage_scope
  ) as coverage_scope,
  coalesce(
    coverage.manual_canonical_product,
    coverage.standard_canonical_product,
    coverage.resolved_canonical_product,
    coverage.validated_canonical_product
  ) as canonical_product,
  case
    when coverage.manual_coverage_type is not null
      or coverage.standard_coverage_type is not null
      or coverage.resolved_coverage_type is not null
      or coverage.validated_coverage_type is not null
      then 'excluded_already_covered'
    else 'selected_unknown'
  end as selection_status,
  case
    when coverage.manual_coverage_type is not null then 'active_manual_alias_already_covers_label_in_scope'
    when coverage.standard_coverage_type is not null then 'active_standard_alias_already_covers_label'
    when coverage.resolved_coverage_type is not null then 'receipt_items_already_resolved'
    when coverage.validated_coverage_type is not null then 'validated_external_candidate_already_exists'
    else null
  end as exclusion_reason
from coverage
order by
  case public.market_store_chain_key(coverage.store_name)
    when 'e leclerc' then 1
    when 'leader price' then 2
    when 'carrefour' then 3
    when 'u' then 4
    when 'auchan' then 5
    else 99
  end asc,
  coverage.frequency desc,
  coverage.brand_signal desc,
  coverage.package_signal desc,
  coverage.distinct_receipts desc,
  coverage.raw_label asc;
`.trim()
}

function sanitizeCoverageEntry(row = {}) {
  return {
    raw_label: cleanText(row.raw_label, 180),
    coverage_type: cleanOptionalText(row.coverage_type, 80),
    coverage_source: cleanOptionalText(row.coverage_source, 120),
    scope: cleanOptionalText(row.coverage_scope, 40),
    canonical_product: cleanOptionalText(row.canonical_product, 180),
    exclusion_reason: cleanOptionalText(row.exclusion_reason, 180),
  }
}

export function partitionCoverageRows(rows = [], { limit = DEFAULT_LIMIT, offset = 0 } = {}) {
  const safeOffset = Math.max(0, Number(offset) || 0)
  const safeLimit = Math.max(1, Number(limit) || DEFAULT_LIMIT)
  const excludedAlreadyCovered = (rows || [])
    .filter(row => row.selection_status === "excluded_already_covered")
    .map(sanitizeCoverageEntry)
  const selectedUnknownRows = (rows || [])
    .filter(row => row.selection_status !== "excluded_already_covered")
    .slice(safeOffset, safeOffset + safeLimit)

  return {
    selectedItems: selectedUnknownRows.map(row => ({
      raw_label: cleanText(row.raw_label, 180),
      normalized_raw_label: cleanText(row.normalized_raw_label, 180),
      frequency: Number(row.frequency || 0),
      distinct_receipts: Number(row.distinct_receipts || 0),
      distinct_chains: Number(row.distinct_chains || 0),
      store_chain_key: cleanText(row.store_chain_key, 120),
      store_id: cleanOptionalText(row.store_id, 80),
      store_name: cleanOptionalText(row.store_name, 120),
      store_city: cleanOptionalText(row.store_city, 80),
      category_hint: cleanOptionalText(row.category_hint, 120),
      brand_hint: cleanOptionalText(row.brand_hint, 80),
      package_format_hint: cleanOptionalText(row.package_format_hint, 80),
      observed_price_min: cleanPrice(row.observed_price_min),
      observed_price_max: cleanPrice(row.observed_price_max),
      first_observed_at: cleanOptionalText(row.first_observed_at, 40),
      last_observed_at: cleanOptionalText(row.last_observed_at, 40),
      chain_rank: priorityRank(row.store_chain_key),
      source_mode: "database",
    })),
    excludedAlreadyCovered,
  }
}

export function buildCoverageByChainSql() {
  return `
with base_items as (
  select
    public.market_store_chain_key(receipts.store_name) as chain_key,
    public.market_normalize_manual_alias_text(trim(coalesce(nullif(receipt_items.corrected_name, ''), nullif(receipt_items.ocr_name, ''), nullif(receipt_items.name, ''), ''))) as normalized_raw_label,
    receipt_items.market_product_id,
    coalesce(receipt_items.market_matched, false) as market_matched
  from public.receipt_items
  join public.receipts on receipts.id = receipt_items.receipt_id
  where coalesce(receipt_items.line_type, 'product') = 'product'
),
item_stats as (
  select
    chain_key,
    count(distinct normalized_raw_label)::int as raw_labels_distinct,
    count(distinct normalized_raw_label) filter (where market_matched = true and market_product_id is not null)::int as products_known
  from base_items
  where normalized_raw_label <> ''
  group by chain_key
),
manual_stats as (
  select
    coalesce(nullif(store_chain_key, ''), 'global') as chain_key,
    count(*) filter (where status = 'active')::int as manual_aliases
  from public.market_manual_product_aliases
  group by 1
),
candidate_stats as (
  select
    coalesce(public.market_store_chain_key(store_name), 'global') as chain_key,
    count(*) filter (where status = 'candidate')::int as cases_in_review
  from public.market_external_product_candidates
  group by 1
)
select
  item_stats.chain_key,
  item_stats.raw_labels_distinct,
  coalesce(manual_stats.manual_aliases, 0) as manual_aliases,
  (select count(*)::int from public.market_product_aliases) as active_aliases,
  item_stats.products_known,
  greatest(item_stats.raw_labels_distinct - item_stats.products_known, 0) as unknown_labels,
  coalesce(candidate_stats.cases_in_review, 0) as cases_in_review
from item_stats
left join manual_stats on manual_stats.chain_key = item_stats.chain_key
left join candidate_stats on candidate_stats.chain_key = item_stats.chain_key
where item_stats.chain_key <> ''
order by
  case item_stats.chain_key
    when 'e leclerc' then 1
    when 'leader price' then 2
    when 'carrefour' then 3
    when 'u' then 4
    when 'auchan' then 5
    when 'gamm vert' then 6
    when 'weldom' then 7
    else 99
  end asc,
  item_stats.raw_labels_distinct desc;
`.trim()
}

function runLinkedSql(sql, label = "query", dependencies = {}) {
  const executor = dependencies.runLinkedSql
  if (executor) {
    return executor(sql, label)
  }
  const tempSqlPath = path.join(
    REPO_ROOT,
    ".market-alias-cache",
    `${sanitizePathFragment(label)}-${Date.now()}-${Math.random().toString(16).slice(2)}.sql`,
  )
  fs.mkdirSync(path.dirname(tempSqlPath), { recursive: true })
  fs.writeFileSync(tempSqlPath, `${String(sql || "").trim()}\n`, "utf8")
  const result = spawnSync("powershell.exe", [
    "-NoProfile",
    "-Command",
    "supabase.cmd db query --linked --output json --file $env:BKP_MARKET_ALIAS_SQL_FILE",
  ], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024,
    env: {
      ...process.env,
      BKP_MARKET_ALIAS_SQL_FILE: tempSqlPath,
    },
  })
  try {
    fs.unlinkSync(tempSqlPath)
  } catch {
    // Best effort cleanup for local temp SQL files.
  }

  if (result.status !== 0) {
    throw new Error(`[${label}] linked_sql_failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`)
  }
  return extractFirstJson(result.stdout || result.stderr)
}

function fetchRest(pathname, { method = "GET", body, headers = {} } = {}, dependencies = {}) {
  const fetchImpl = dependencies.fetchImpl || fetch
  const baseUrl = String(dependencies.baseUrl || "").replace(/\/+$/, "")
  const serviceRoleKey = String(dependencies.serviceRoleKey || "")
  if (!baseUrl || !serviceRoleKey) {
    throw new Error("missing_supabase_service_role_env")
  }
  return fetchImpl(`${baseUrl}/rest/v1/${pathname}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

async function fetchJsonRest(pathname, options = {}, dependencies = {}) {
  const response = await fetchRest(pathname, options, dependencies)
  if (!response.ok) {
    throw new Error(`rest_failed:${pathname}:${response.status}:${await response.text()}`)
  }
  if (response.status === 204) return null
  return response.json()
}

function buildProductSnapshotSql() {
  return `
select
  id,
  canonical_name,
  normalized_name,
  brand,
  normalized_brand,
  category,
  subcategory,
  package_format,
  barcode,
  product_key
from public.market_products
order by canonical_name asc;
`.trim()
}

function buildManualAliasFamilySql({ storeChain = "" } = {}) {
  const normalizedStoreChain = representativeChainKey(storeChain)
  return `
select
  aliases.id,
  aliases.product_id,
  aliases.raw_label,
  aliases.corrected_label,
  coalesce(nullif(aliases.normalized_raw_label, ''), public.market_normalize_manual_alias_text(aliases.raw_label)) as normalized_raw_label,
  coalesce(nullif(aliases.normalized_corrected_label, ''), public.market_normalize_manual_alias_text(aliases.corrected_label)) as normalized_corrected_label,
  aliases.scope,
  aliases.store_id,
  public.market_store_chain_key(coalesce(aliases.store_chain_key, '')) as store_chain_key,
  coalesce(aliases.status, 'active') as status,
  aliases.confidence,
  coalesce(products.canonical_name, aliases.corrected_label, aliases.raw_label) as canonical_name,
  coalesce(products.package_format, aliases.package_format, '') as package_format,
  coalesce(products.brand, aliases.brand, '') as brand
from public.market_manual_product_aliases aliases
left join public.market_products products
  on products.id = aliases.product_id
where coalesce(aliases.status, 'active') = 'active'
  and (
    aliases.scope = 'global'
    or (aliases.scope = 'chain' and public.market_store_chain_key(coalesce(aliases.store_chain_key, '')) = ${sqlTextLiteral(normalizedStoreChain)})
    or (aliases.scope = 'store' and public.market_store_chain_key(coalesce(aliases.store_chain_key, '')) = ${sqlTextLiteral(normalizedStoreChain)})
  )
order by aliases.raw_label asc;
`.trim()
}

export function inferAliasScope(item = {}) {
  const distinctChains = Number(item.distinct_chains || 0)
  if (distinctChains > 1) return "global"
  if (cleanText(item.store_chain_key, 120)) return "chain"
  return "store"
}

function brandExact(left, right) {
  const normalizedLeft = normalizeText(left)
  const normalizedRight = normalizeText(right)
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight)
}

function packageExact(left, right) {
  const normalizedLeft = normalizePackage(left)
  const normalizedRight = normalizePackage(right)
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight)
}

export function findReusableProduct(candidate = {}, products = []) {
  const candidateBarcode = cleanBarcode(candidate.barcode)
  if (candidateBarcode) {
    const exactByBarcode = products.find(product => cleanBarcode(product.barcode) === candidateBarcode)
    if (exactByBarcode) {
      return {
        product: exactByBarcode,
        reason: "barcode_exact",
      }
    }
  }

  const normalizedCandidateName = normalizeText(candidate.candidate_canonical_name)
  const normalizedCandidateBrand = normalizeText(candidate.brand)
  const normalizedCandidatePackage = normalizePackage(candidate.package_format)

  const exactMatches = products.filter(product => {
    if (normalizeText(product.normalized_name || product.canonical_name) !== normalizedCandidateName) return false
    if (normalizedCandidateBrand && normalizeText(product.normalized_brand || product.brand) !== normalizedCandidateBrand) return false
    if (normalizedCandidatePackage && normalizePackage(product.package_format) !== normalizedCandidatePackage) return false
    return true
  })

  if (exactMatches.length === 1) {
    return {
      product: exactMatches[0],
      reason: "name_brand_package_exact",
    }
  }

  const closeMatches = products.filter(product => {
    if (normalizeText(product.normalized_name || product.canonical_name) !== normalizedCandidateName) return false
    if (normalizedCandidateBrand && normalizeText(product.normalized_brand || product.brand) !== normalizedCandidateBrand) return false
    return true
  })

  if (closeMatches.length === 1) {
    return {
      product: closeMatches[0],
      reason: normalizedCandidatePackage ? "name_brand_exact_package_missing" : "name_brand_exact",
    }
  }

  return null
}

function normalizeManualAliasVariant(value = "") {
  return normalizeText(
    String(value || "")
      .replace(/\b(\d+)OG\b/gi, "$10G")
      .replace(/\bASSORT\b/gi, "ASSORTIMENT")
      .replace(/\bBANANES\b/gi, "BANANE")
      .replace(/\bCOP\b/gi, " ")
      .replace(/\bJARDEN\b/gi, "JARDIN"),
  )
}

function extractManualAliasPackage(value = "") {
  const normalized = normalizeManualAliasVariant(value)
  const packageMatch = normalized.match(/\b(\d+(?:[.,]\d+)?)\s*(kg|g|gr|ml|cl|l)\b/)
  if (!packageMatch) return ""
  return `${packageMatch[1].replace(",", ".")} ${packageMatch[2] === "gr" ? "g" : packageMatch[2]}`
}

function manualAliasBigrams(value = "") {
  const compact = normalizeManualAliasVariant(value).replace(/\s+/g, " ").trim()
  if (compact.length < 2) return compact ? [compact] : []
  const grams = []
  for (let index = 0; index < compact.length - 1; index += 1) {
    grams.push(compact.slice(index, index + 2))
  }
  return grams
}

function manualAliasSimilarity(leftValue = "", rightValue = "") {
  const left = manualAliasBigrams(leftValue)
  const right = manualAliasBigrams(rightValue)
  if (!left.length || !right.length) return 0
  const counts = new Map()
  for (const gram of right) {
    counts.set(gram, (counts.get(gram) || 0) + 1)
  }
  let overlap = 0
  for (const gram of left) {
    const count = counts.get(gram) || 0
    if (count > 0) {
      counts.set(gram, count - 1)
      overlap += 1
    }
  }
  return Number((((2 * overlap) / (left.length + right.length)) || 0).toFixed(4))
}

function manualAliasScopeAppliesToItem(alias = {}, item = {}) {
  if (alias.scope === "global") return true
  if (alias.scope === "chain") {
    return representativeChainKey(alias.store_chain_key) !== ""
      && representativeChainKey(alias.store_chain_key) === representativeChainKey(item.store_chain_key)
  }
  if (alias.scope === "store") {
    return Boolean(alias.store_id && item.store_id && alias.store_id === item.store_id)
  }
  return false
}

function sanitizeManualAliasFamilyRows(rows = []) {
  return rows.map(row => ({
    id: cleanOptionalText(row.id, 80),
    product_id: cleanOptionalText(row.product_id, 80),
    raw_label: cleanText(row.raw_label, 180),
    corrected_label: cleanOptionalText(row.corrected_label, 180),
    normalized_raw_label: cleanText(row.normalized_raw_label, 180),
    normalized_corrected_label: cleanOptionalText(row.normalized_corrected_label, 180),
    scope: cleanText(row.scope, 20),
    store_id: cleanOptionalText(row.store_id, 80),
    store_chain_key: cleanOptionalText(row.store_chain_key, 120),
    status: cleanText(row.status, 20),
    confidence: Number(row.confidence || 0),
    canonical_name: cleanOptionalText(row.canonical_name, 180),
    package_format: cleanOptionalText(row.package_format, 80),
    brand: cleanOptionalText(row.brand, 80),
  }))
}

export function buildDerivedManualAliasFamilyCandidates(item = {}, manualAliases = []) {
  const rawVariant = cleanText(item.raw_label, 180)
  const normalizedVariant = normalizeManualAliasVariant(item.normalized_raw_label || rawVariant)
  const observedPackage = extractManualAliasPackage(item.package_format_hint || rawVariant)
  const applicableAliases = (manualAliases || []).filter(alias => manualAliasScopeAppliesToItem(alias, item))

  const rankedMatches = applicableAliases
    .map(alias => {
      const aliasTexts = [
        alias.normalized_raw_label,
        alias.normalized_corrected_label,
        normalizeManualAliasVariant(alias.corrected_label),
        normalizeManualAliasVariant(alias.canonical_name),
      ].filter(Boolean)
      const similarity = aliasTexts.reduce(
        (best, candidateText) => Math.max(best, manualAliasSimilarity(normalizedVariant, candidateText)),
        0,
      )
      const canonicalPackage = extractManualAliasPackage(alias.package_format || alias.canonical_name || alias.corrected_label || "")
      return {
        alias,
        similarity,
        canonicalPackage,
        safePackageMatch: !observedPackage || !canonicalPackage || normalizePackage(observedPackage) === normalizePackage(canonicalPackage),
      }
    })
    .filter(match => match.similarity >= 0.82)
    .sort((left, right) => right.similarity - left.similarity)

  if (!rankedMatches.length) return []

  const uniqueProductKeys = Array.from(new Set(
    rankedMatches.map(match => match.alias.product_id || normalizeText(match.alias.canonical_name || match.alias.corrected_label || match.alias.raw_label)),
  ))

  const buildCandidate = (match, overrides = {}) => ({
    source_type: "derived_manual_alias_family",
    source_name: "derived_from_manual_alias_family",
    source_identifier: `manual-family:${normalizeText(match.alias.raw_label)}`,
    source_url: null,
    raw_label: rawVariant,
    candidate_canonical_name: match.alias.canonical_name || match.alias.corrected_label || match.alias.raw_label,
    brand: match.alias.brand || null,
    category: item.category_hint || null,
    package_format: match.canonicalPackage || match.alias.package_format || null,
    barcode: null,
    observed_price: item.observed_price_min ?? item.observed_price_max ?? null,
    store_name: item.store_name || "",
    store_city: item.store_city || "",
    source_confidence: overrides.source_confidence ?? 0.94,
    matching_evidence: {
      source: "manual_alias_family",
      source_kind: "derived_manual_alias_family",
      checked_at: "2026-07-27",
      unique_product: uniqueProductKeys.length === 1,
      safe_package_match: match.safePackageMatch,
      manual_family_similarity: match.similarity,
      source_alias_label: match.alias.raw_label,
      source_corrected_label: match.alias.corrected_label || null,
      source_scope: match.alias.scope,
      source_chain_key: match.alias.store_chain_key || null,
      source_canonical_name: match.alias.canonical_name || null,
      justification: overrides.justification || "derived_from_manual_alias_family",
      priority_source: "manual_alias_family",
    },
    ...overrides,
  })

  if (uniqueProductKeys.length > 1) {
    return rankedMatches.slice(0, 2).map(match => buildCandidate(match, {
      source_confidence: 0.86,
      justification: "multiple_manual_alias_products_match_variant",
    }))
  }

  const bestMatch = rankedMatches[0]
  if (!bestMatch.safePackageMatch) {
    return [buildCandidate(bestMatch, {
      source_confidence: 0.72,
      justification: "manual_alias_family_package_divergence",
    })]
  }

  return [buildCandidate(bestMatch)]
}

function candidateSortValue(candidate = {}) {
  const classRank = (() => {
    switch (candidate.classification) {
      case "exact_strong":
        return 6
      case "strong_without_barcode":
        return 5
      case "active_library_ready":
        return 4
      case "suggestion":
        return 3
      case "ambiguous":
        return 2
      case "rejected":
        return 1
      default:
        return 0
    }
  })()
  return classRank * 10 + Number(candidate.source_confidence || 0)
}

function classifyCandidateRows(rows = []) {
  if (!rows.length) {
    return {
      classification: "not_found",
      rankedRows: [],
      ambiguityReasons: [],
    }
  }

  const rankedRows = [...rows]
    .map(row => ({ ...row }))
    .sort((left, right) => Number(right.source_confidence || 0) - Number(left.source_confidence || 0))

  const top = rankedRows[0]
  const closeTop = rankedRows.filter(row => Math.abs(Number(row.source_confidence || 0) - Number(top.source_confidence || 0)) <= 0.03)
  const distinctTopProducts = new Set(
    closeTop.map(row => normalizeText(row.candidate_canonical_name)).filter(Boolean),
  )

  let classification = "suggestion"
  const explicitContradictionReasons = new Set([
    "manual_alias_priority",
    "validated_user_correction_conflict",
    "brand_conflict",
    "barcode_mismatch",
  ])
  const manualReviewReasons = new Set([
    "generic_label",
    "chain_private_label_without_ticket_brand",
  ])

  if (top.match_level === "exact_strong") classification = "exact_strong"
  else if (top.match_level === "strong_without_barcode") classification = "strong_without_barcode"
  else if (top.match_level === "rejected" && explicitContradictionReasons.has(top.skip_reason)) classification = "rejected"
  else if (distinctTopProducts.size > 1) classification = "ambiguous"
  else if (manualReviewReasons.has(top.skip_reason)) classification = "ambiguous"
  else if (Number(top.source_confidence || 0) >= 0.78) classification = "suggestion"
  else classification = "not_found"

  if ((classification === "suggestion" || classification === "strong_without_barcode") && Number(top.source_confidence || 0) >= 0.91 && distinctTopProducts.size === 1) {
    classification = "active_library_ready"
  }
  if (distinctTopProducts.size > 1 && Number(top.source_confidence || 0) >= 0.78) {
    classification = "ambiguous"
  }
  if (top.skip_reason === "package_conflict") {
    classification = "ambiguous"
  }

  const ambiguityReasons = []
  if (distinctTopProducts.size > 1) ambiguityReasons.push("multiple_plausible_products")
  if (top.skip_reason) ambiguityReasons.push(top.skip_reason)

  rankedRows[0] = {
    ...top,
    classification,
  }

  return {
    classification,
    rankedRows,
    ambiguityReasons,
  }
}

function buildNewProductProposal(item = {}, candidate = {}) {
  const packageFormat = cleanOptionalText(candidate.package_format || item.package_format_hint, 80)
  const normalizedName = normalizeText(candidate.candidate_canonical_name)
  const normalizedBrand = normalizeText(candidate.brand)
  return {
    canonical_name: cleanText(candidate.candidate_canonical_name, 180),
    normalized_name: normalizedName,
    brand: cleanOptionalText(candidate.brand, 80),
    normalized_brand: normalizedBrand,
    category: cleanText(candidate.category || item.category_hint || "alimentaire", 120),
    subcategory: null,
    unit_type: null,
    package_size_value: null,
    package_size_unit: null,
    package_count: null,
    package_format: packageFormat,
    barcode: cleanBarcode(candidate.barcode),
    product_key: [normalizedName, normalizedBrand, normalizePackage(packageFormat)].filter(Boolean).join("::").slice(0, 220),
  }
}

function buildLibraryAliasPayload(item = {}, candidate = {}, reusableProduct = null) {
  const scope = inferAliasScope(item)
  const aliasSource = candidate.source_name === "derived_from_manual_alias_family"
    ? "derived_from_manual_alias_family"
    : `external_library:${candidate.source_name}`
  return {
    product_id: reusableProduct?.product?.id || null,
    raw_label: cleanText(item.raw_label, 180),
    normalized_raw_label: cleanText(item.normalized_raw_label, 180),
    source: cleanText(aliasSource, 80),
    confidence: Number(Number(candidate.source_confidence || 0).toFixed(4)),
    scope,
    store_id: scope === "store" ? item.store_id || null : null,
    store_chain_key: scope === "chain" ? cleanText(item.store_chain_key, 120) : null,
    status: "active",
    evidence: {
      candidate_canonical_name: cleanText(candidate.candidate_canonical_name || item.raw_label, 180),
      source_type: candidate.source_type,
      source_name: candidate.source_name,
      source_url: candidate.source_url || null,
      match_level: candidate.match_level || null,
      classification: candidate.classification || null,
      checked_at: new Date().toISOString(),
    },
  }
}

function emptyApplyLibraryResult() {
  return {
    products_created: [],
    products_reused: [],
    aliases_created: [],
    aliases_updated: [],
    skipped: [],
    errors: [],
  }
}

function buildApplyLibraryRpcPayload(report = {}) {
  return (report.items || [])
    .filter(item => item.recommended_action === "library")
    .filter(item => APPLY_LIBRARY_ALLOWED_CLASSIFICATIONS.has(item.classification))
    .filter(item => item.proposed_alias && typeof item.proposed_alias === "object")
    .map(item => {
      const rpcItem = {
        recommended_action: item.recommended_action,
        classification: item.classification,
        proposed_alias: item.proposed_alias,
      }
      if (
        item.proposed_new_product
        && typeof item.proposed_new_product === "object"
        && !Array.isArray(item.proposed_new_product)
      ) {
        rpcItem.proposed_new_product = item.proposed_new_product
      }
      return rpcItem
    })
}

function normalizeApplyLibraryResult(result = {}) {
  return {
    products_created: Array.isArray(result?.products_created) ? result.products_created : [],
    products_reused: Array.isArray(result?.products_reused) ? result.products_reused : [],
    aliases_created: Array.isArray(result?.aliases_created) ? result.aliases_created : [],
    aliases_updated: Array.isArray(result?.aliases_updated) ? result.aliases_updated : [],
    skipped: Array.isArray(result?.skipped) ? result.skipped : [],
    errors: Array.isArray(result?.errors) ? result.errors : [],
  }
}

function buildStagingPayload(item = {}, candidate = {}) {
  return {
    source_type: cleanText(candidate.source_type || "structured_external", 40),
    source_name: cleanText(candidate.source_name || "structured_external", 80),
    source_identifier: cleanOptionalText(candidate.source_identifier, 120),
    source_url: cleanOptionalText(candidate.source_url, 500),
    raw_label: cleanText(item.raw_label, 180),
    normalized_raw_label: cleanText(item.normalized_raw_label, 180),
    candidate_canonical_name: cleanText(candidate.candidate_canonical_name || item.raw_label, 180),
    normalized_candidate_name: cleanText(normalizeText(candidate.candidate_canonical_name || item.raw_label), 180),
    brand: cleanOptionalText(candidate.brand, 80),
    category: cleanOptionalText(candidate.category || item.category_hint, 120),
    package_format: cleanOptionalText(candidate.package_format || item.package_format_hint, 80),
    barcode: cleanBarcode(candidate.barcode),
    observed_price: cleanPrice(item.observed_price_min || item.observed_price_max),
    store_name: cleanOptionalText(item.store_name, 120),
    store_city: cleanOptionalText(item.store_city, 80),
    source_confidence: Number(Number(candidate.source_confidence || 0).toFixed(4)),
    matching_evidence: {
      ...(candidate.matching_evidence || {}),
      classification: candidate.classification || null,
      batch_id: item.batch_id || null,
      frequency: Number(item.frequency || 0),
    },
    status: "candidate",
    matched_product_id: null,
    match_level: candidate.match_level || candidate.classification || null,
    promoted_alias_id: null,
    validation_notes: null,
    first_seen_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
  }
}

function buildWebQueries(item = {}) {
  return buildProgressiveWebQueries(item)
}

function sanitizeCoverageRows(rows = []) {
  return rows.map(row => ({
    chain_key: cleanText(row.chain_key, 120),
    raw_labels_distinct: Number(row.raw_labels_distinct || 0),
    manual_aliases: Number(row.manual_aliases || 0),
    active_aliases: Number(row.active_aliases || 0),
    unknown_labels: Number(row.unknown_labels || 0),
    products_known: Number(row.products_known || 0),
    cases_in_review: Number(row.cases_in_review || 0),
  }))
}

function summarizeBatchResults(items = []) {
  const summary = {
    exact_strong: 0,
    strong_without_barcode: 0,
    active_library_ready: 0,
    suggestions: 0,
    ambiguous: 0,
    rejected: 0,
    not_found: 0,
    source_unavailable: 0,
    network_errors: 0,
  }
  for (const item of items) {
    switch (item.classification) {
      case "exact_strong":
        summary.exact_strong += 1
        break
      case "strong_without_barcode":
        summary.strong_without_barcode += 1
        break
      case "active_library_ready":
        summary.active_library_ready += 1
        break
      case "suggestion":
        summary.suggestions += 1
        break
      case "ambiguous":
        summary.ambiguous += 1
        break
      case "rejected":
        summary.rejected += 1
        break
      case "not_found":
        summary.not_found += 1
        break
      case "source_unavailable":
        summary.source_unavailable += 1
        break
      default:
        break
    }
  }
  return summary
}

function consolidateSourceErrors(items = []) {
  const groups = new Map()
  for (const item of items) {
    for (const source of item.sources_unavailable || []) {
      const key = [
        source.source || "unknown_source",
        source.status ?? "null",
        source.reason || "unknown_error",
      ].join("::")
      const current = groups.get(key) || {
        source: source.source || "unknown_source",
        status: source.status ?? null,
        reason: source.reason || "unknown_error",
        products_affected: 0,
        attempts: 0,
        source_event_count: 0,
        cache_hits: 0,
        raw_labels: [],
      }
      current.products_affected += 1
      current.source_event_count += 1
      current.attempts += Number(source.attempts || item.attempts_by_source?.[source.source] || 0)
      current.cache_hits += item.cache_hit ? 1 : 0
      if (current.raw_labels.length < 10) {
        current.raw_labels.push(item.raw_label)
      }
      groups.set(key, current)
    }
  }
  return Array.from(groups.values()).sort((left, right) => right.products_affected - left.products_affected)
}

function buildMarkdownReport(report = {}) {
  const lines = []
  lines.push(`# Market Alias Library Dry Run`)
  lines.push("")
  lines.push(`- batch_id: ${report.batch_id}`)
  lines.push(`- date: ${report.date}`)
  lines.push(`- source_mode: ${report.source_mode}`)
  lines.push(`- store_chain_filter: ${report.store_chain_filter || ""}`)
  lines.push(`- target_chain: ${report.target_chain || "all"}`)
  lines.push(`- requested_labels: ${report.requested_count || 0}`)
  lines.push(`- selected_labels: ${report.selected_count}`)
  lines.push(`- excluded_already_covered: ${report.excluded_count || 0}`)
  lines.push(`- dry_run: ${report.dry_run}`)
  lines.push("")
  lines.push(`## Summary`)
  lines.push("")
  lines.push(`- exact_strong: ${report.summary?.exact_strong || 0}`)
  lines.push(`- strong_without_barcode: ${report.summary?.strong_without_barcode || 0}`)
  lines.push(`- active_library_ready: ${report.summary?.active_library_ready || 0}`)
  lines.push(`- suggestions: ${report.summary?.suggestions || 0}`)
  lines.push(`- ambiguous: ${report.summary?.ambiguous || 0}`)
  lines.push(`- rejected: ${report.summary?.rejected || 0}`)
  lines.push(`- not_found: ${report.summary?.not_found || 0}`)
  lines.push(`- source_unavailable: ${report.summary?.source_unavailable || 0}`)
  lines.push(`- network_error_groups: ${(report.source_errors || []).length}`)
  lines.push("")
  if ((report.excluded_already_covered || []).length > 0) {
    lines.push(`## Excluded Already Covered`)
    lines.push("")
    lines.push(`| raw_label | coverage_type | source | scope | canonical_product | exclusion_reason |`)
    lines.push(`| --- | --- | --- | --- | --- | --- |`)
    for (const row of report.excluded_already_covered || []) {
      lines.push(`| ${markdownTableCell(row.raw_label)} | ${markdownTableCell(row.coverage_type || "")} | ${markdownTableCell(row.coverage_source || "")} | ${markdownTableCell(row.scope || "")} | ${markdownTableCell(row.canonical_product || "")} | ${markdownTableCell(row.exclusion_reason || "")} |`)
    }
    lines.push("")
  }
  lines.push(`## Batch Labels`)
  lines.push("")
  lines.push(`| raw_label | frequency | chain | category | package | classification | action |`)
  lines.push(`| --- | ---: | --- | --- | --- | --- | --- |`)
  for (const item of report.items || []) {
    lines.push(`| ${markdownTableCell(item.raw_label)} | ${item.frequency} | ${markdownTableCell(item.store_chain_key || item.store_name || "")} | ${markdownTableCell(item.category_hint || "")} | ${markdownTableCell(item.package_format_hint || "")} | ${markdownTableCell(item.classification || "")} | ${markdownTableCell(item.recommended_action || "")} |`)
  }
  lines.push("")
  lines.push(`## Coverage By Chain`)
  lines.push("")
  lines.push(`| chain | raw labels | manual aliases | active aliases | unknown | products known | in review |`)
  lines.push(`| --- | ---: | ---: | ---: | ---: | ---: | ---: |`)
  for (const row of report.coverage_by_chain || []) {
    lines.push(`| ${markdownTableCell(row.chain_key)} | ${row.raw_labels_distinct} | ${row.manual_aliases} | ${row.active_aliases} | ${row.unknown_labels} | ${row.products_known} | ${row.cases_in_review} |`)
  }
  lines.push("")
  if ((report.source_errors || []).length > 0) {
    lines.push(`## Source Errors`)
    lines.push("")
    lines.push(`| source | status | reason | products_affected | attempts | cache_hits | sample labels |`)
    lines.push(`| --- | ---: | --- | ---: | ---: | ---: | --- |`)
    for (const row of report.source_errors || []) {
      lines.push(`| ${markdownTableCell(row.source)} | ${markdownTableCell(row.status ?? "")} | ${markdownTableCell(row.reason)} | ${row.products_affected} | ${row.attempts} | ${row.cache_hits} | ${markdownTableCell((row.raw_labels || []).join(", "))} |`)
    }
    lines.push("")
  }
  if ((report.proof_audit || []).length > 0) {
    lines.push(`## Curated Proof Audit`)
    lines.push("")
    lines.push(`| raw_label | found_name | ticket_brand | source_brand | ticket_package | source_package | domain | checked_at | source_type | classification | justification | source_url | factual_excerpt |`)
    lines.push(`| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |`)
    for (const row of report.proof_audit || []) {
      lines.push(`| ${markdownTableCell(row.raw_label)} | ${markdownTableCell(row.found_name)} | ${markdownTableCell(row.ticket_brand || "")} | ${markdownTableCell(row.source_brand || "")} | ${markdownTableCell(row.ticket_package || "")} | ${markdownTableCell(row.source_package || "")} | ${markdownTableCell(row.domain || "")} | ${markdownTableCell(row.checked_at || "")} | ${markdownTableCell(row.source_type || "")} | ${markdownTableCell(row.classification || "")} | ${markdownTableCell(row.justification || "")} | ${markdownTableCell(row.source_url || "")} | ${markdownTableCell(row.factual_excerpt || "")} |`)
    }
    lines.push("")
  }
  lines.push(`## Commands`)
  lines.push("")
  lines.push("```bash")
  lines.push(report.commands?.dry_run || "")
  lines.push("```")
  lines.push("")
  return lines.join("\n")
}

async function loadBatchRows(args, dependencies = {}) {
  if (args.fromDatabase) {
    const rows = rowsFrom(
      runLinkedSql(
        buildDatabaseSelectionSql({ storeChain: args.storeChain || "" }),
        "load_market_alias_batch_rows",
        dependencies,
      ),
    )
    return partitionCoverageRows(rows, {
      limit: args.limit,
      offset: args.offset,
    })
  }
  if (args.fromFile) {
    return {
      selectedItems: parseBatchFile(args.fromFile).slice(args.offset, args.offset + args.limit),
      excludedAlreadyCovered: [],
    }
  }
  throw new Error("batch_source_required")
}

async function loadCoverageByChain(dependencies = {}) {
  return sanitizeCoverageRows(rowsFrom(runLinkedSql(buildCoverageByChainSql(), "load_market_coverage", dependencies)))
}

async function loadProductSnapshot(dependencies = {}) {
  return rowsFrom(runLinkedSql(buildProductSnapshotSql(), "load_market_products", dependencies))
}

async function loadManualAliasFamilySnapshot(args, dependencies = {}) {
  if (!args.fromDatabase || !args.storeChain) return []
  return sanitizeManualAliasFamilyRows(rowsFrom(
    runLinkedSql(
      buildManualAliasFamilySql({ storeChain: args.storeChain }),
      "load_market_manual_alias_families",
      dependencies,
    ),
  ))
}

function createCheckpoint(batchId, seedItems = []) {
  return {
    batch_id: batchId,
    updated_at: new Date().toISOString(),
    items: seedItems.map(item => ({
      raw_label: item.raw_label,
      normalized_raw_label: item.normalized_raw_label,
      status: "pending",
    })),
  }
}

function updateCheckpoint(checkpoint, itemResult) {
  const items = Array.isArray(checkpoint.items) ? checkpoint.items : []
  const existingIndex = items.findIndex(item => item.normalized_raw_label === itemResult.normalized_raw_label)
  const nextEntry = {
    raw_label: itemResult.raw_label,
    normalized_raw_label: itemResult.normalized_raw_label,
    status: itemResult.status,
    classification: itemResult.classification,
    updated_at: new Date().toISOString(),
  }
  if (existingIndex >= 0) items[existingIndex] = nextEntry
  else items.push(nextEntry)
  checkpoint.items = items
  checkpoint.updated_at = new Date().toISOString()
  return checkpoint
}

function buildSingleLabelArgs(item, args) {
  const inferredBrandHint = inferObservedBrandHint(item)
  const inferredPackageHint = inferObservedPackageHint(item)
  return {
    rawLabel: item.raw_label,
    brand: item.brand_hint || inferredBrandHint || "",
    packageFormat: item.package_format_hint || inferredPackageHint || "",
    category: item.category_hint || "",
    observedPrice: item.observed_price_min ?? item.observed_price_max ?? null,
    storeName: item.store_name || args.storeChain || item.store_chain_key || "",
    storeCity: item.store_city || "",
    pageSize: 8,
    purchaseDate: item.last_observed_at || item.first_observed_at || "",
    maxRetries: args.maxRetries,
    retryBaseDelayMs: args.delayMs,
  }
}

async function processSingleBatchItem(item, args, dependencies, runtime) {
  const cachePath = buildCachePath(args.batchId, item.normalized_raw_label)
  const cached = readJsonIfExists(cachePath)
  if (
    cached?.status === "processed"
    && cached.cache_version === BATCH_CACHE_VERSION
    && cleanText(cached.store_chain_filter || "", 120) === cleanText(args.storeChain || "", 120)
  ) {
    return {
      ...cached,
      cache_hit: true,
    }
  }

  const singleArgs = buildSingleLabelArgs(item, args)
  const { candidates, report } = await runtime.collectExternalCandidatesWithReport(singleArgs, dependencies)
  const curatedProofCandidates = buildCuratedProofCandidates(item)
  const derivedManualFamilyCandidates = buildDerivedManualAliasFamilyCandidates(item, runtime.manualAliasFamilies || [])
  if (curatedProofCandidates.length > 0) {
    report.attempts_by_source.curated_web_proof = 0
    if (!report.sources_succeeded.includes("curated_web_proof")) {
      report.sources_succeeded.push("curated_web_proof")
    }
  }
  if (derivedManualFamilyCandidates.length > 0) {
    report.attempts_by_source.derived_manual_alias_family = 0
    if (!report.sources_succeeded.includes("derived_manual_alias_family")) {
      report.sources_succeeded.push("derived_manual_alias_family")
    }
  }
  const evaluatedRows = runtime.buildEvaluatedCandidateRows(singleArgs, [
    ...candidates,
    ...curatedProofCandidates,
    ...derivedManualFamilyCandidates,
  ])
  let { classification, rankedRows, ambiguityReasons } = classifyCandidateRows(evaluatedRows)
  if (classification === "not_found" && rankedRows.length === 0 && report.sources_succeeded.length === 0 && report.sources_unavailable.length > 0) {
    classification = "source_unavailable"
  }
  const topCandidate = rankedRows[0] || null
  const reusableProduct = topCandidate ? findReusableProduct(topCandidate, runtime.products) : null
  const proposedNewProduct = topCandidate && !reusableProduct && ["exact_strong", "strong_without_barcode", "active_library_ready"].includes(classification)
    ? buildNewProductProposal(item, topCandidate)
    : null
  const plannedAlias = topCandidate && ["exact_strong", "strong_without_barcode", "active_library_ready"].includes(classification)
    ? buildLibraryAliasPayload(item, { ...topCandidate, classification }, reusableProduct)
    : null
  const stagingCandidates = ["suggestion", "ambiguous"].includes(classification)
    ? rankedRows.slice(0, 3).map(candidate => buildStagingPayload(item, { ...candidate, classification }))
    : []

  const recommendedAction = (() => {
    if (plannedAlias && (reusableProduct || proposedNewProduct)) return "library"
    if (stagingCandidates.length > 0) return "staging"
    if (classification === "not_found") return "not_found"
    if (classification === "rejected") return "rejected"
    if (classification === "source_unavailable") return "review"
    return "review"
  })()

  const result = {
    ...item,
    batch_id: args.batchId,
    cache_version: BATCH_CACHE_VERSION,
    store_chain_filter: cleanText(args.storeChain || "", 120),
    status: "processed",
    classification,
    recommended_action: recommendedAction,
    best_candidate: topCandidate,
    candidate_rows: rankedRows,
    ambiguity_reasons: ambiguityReasons,
    reusable_product: reusableProduct
      ? {
        canonical_name: reusableProduct.product.canonical_name,
        reason: reusableProduct.reason,
      }
      : null,
    proposed_new_product: proposedNewProduct,
    proposed_alias: plannedAlias,
    proposed_staging_candidates: stagingCandidates,
    cache_hit: false,
    sources_succeeded: report.sources_succeeded,
    sources_unavailable: report.sources_unavailable,
    attempts_by_source: report.attempts_by_source,
    attempt_count: report.attempt_count,
    source_strategy: report.source_strategy,
    web_search_needed: !["exact_strong", "strong_without_barcode"].includes(classification),
    web_search_queries: buildWebQueries(item),
    retained_urls: rankedRows.map(candidate => candidate.source_url).filter(Boolean).slice(0, 5),
    proof_audit: buildCuratedProofAuditEntries(item, rankedRows, classification),
  }

  ensureSafeReportValue(result, "batch_item")
  writeJson(cachePath, result)
  return result
}

async function runPool(items, worker, concurrency) {
  const results = new Array(items.length)
  let cursor = 0
  const runners = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (cursor < items.length) {
      const currentIndex = cursor
      cursor += 1
      results[currentIndex] = await worker(items[currentIndex], currentIndex)
    }
  })
  await Promise.all(runners)
  return results
}

function chunkItems(items = [], chunkSize = DEFAULT_SUB_BATCH_SIZE) {
  const chunks = []
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize))
  }
  return chunks
}

async function applyLibraryPlan(report, args, dependencies = {}) {
  const payload = buildApplyLibraryRpcPayload(report)
  if (!payload.length) {
    return emptyApplyLibraryResult()
  }

  const rpcResult = await fetchJsonRest("rpc/market_apply_scoped_alias_library", {
    method: "POST",
    body: {
      p_items: payload,
    },
  }, dependencies)

  return normalizeApplyLibraryResult(rpcResult)
}

async function applyStagingPlan(report, dependencies = {}) {
  const payload = (report.items || [])
    .flatMap(item => item.proposed_staging_candidates || [])
  if (!payload.length) {
    return { candidates_created: [] }
  }
  const created = await fetchJsonRest("market_external_product_candidates?on_conflict=source_name,source_identifier,normalized_raw_label,normalized_candidate_name,barcode,store_name,store_city", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: payload,
  }, dependencies)
  return {
    candidates_created: Array.isArray(created) ? created : [],
  }
}

export async function runMarketAliasLibraryBatchCli(args, dependencies = {}, runtime = {}) {
  if (!args.batchId) {
    throw new Error("batch_id_required")
  }
  if (args.applyLibrary && args.applyStaging) {
    throw new Error("apply_library_and_apply_staging_are_mutually_exclusive")
  }
  if (args.fromDatabase && !representativeChainKey(args.storeChain || "")) {
    throw new Error("store_chain_required_for_database_batch")
  }
  args.storeChain = representativeChainKey(args.storeChain || "")

  fs.mkdirSync(CACHE_DIR, { recursive: true })
  fs.mkdirSync(CHECKPOINT_DIR, { recursive: true })

  const batchRows = await loadBatchRows(args, dependencies)
  const selectedItems = batchRows.selectedItems
  const excludedAlreadyCovered = batchRows.excludedAlreadyCovered
  const checkpointPath = buildCheckpointPath(args.batchId)
  const checkpoint = args.resume
    ? readJsonIfExists(checkpointPath) || createCheckpoint(args.batchId, selectedItems)
    : createCheckpoint(args.batchId, selectedItems)
  writeJson(checkpointPath, checkpoint)

  const coverageByChain = await loadCoverageByChain(dependencies)
  const products = await loadProductSnapshot(dependencies)
  const manualAliasFamilies = await loadManualAliasFamilySnapshot(args, dependencies)
  const runtimeContext = {
    ...runtime,
    manualAliasFamilies,
    products,
  }
  const chunkedItems = chunkItems(selectedItems, DEFAULT_SUB_BATCH_SIZE)
  const items = []
  const subBatchStats = []
  for (let index = 0; index < chunkedItems.length; index += 1) {
    const chunk = chunkedItems[index]
    const chunkResults = await runPool(
      chunk,
      async item => {
        try {
          const result = await processSingleBatchItem(item, args, dependencies, runtimeContext)
          updateCheckpoint(checkpoint, result)
          writeJson(checkpointPath, checkpoint)
          if (args.delayMs > 0) {
            await sleep(args.delayMs, dependencies)
          }
          return result
        } catch (error) {
          const failed = {
            ...item,
            status: "failed",
            classification: "source_unavailable",
            recommended_action: "review",
            best_candidate: null,
            candidate_rows: [],
            ambiguity_reasons: [],
            reusable_product: null,
            proposed_new_product: null,
            proposed_alias: null,
            proposed_staging_candidates: [],
            cache_hit: false,
            sources_succeeded: [],
            sources_unavailable: [{
              source: "batch_processor",
              reason: error?.message || "unknown_error",
              attempts: 0,
              status: null,
            }],
            attempts_by_source: {},
            attempt_count: 0,
            source_strategy: "full_text_fallback",
            web_search_needed: true,
            web_search_queries: buildWebQueries(item),
            retained_urls: [],
            proof_audit: [],
          }
          updateCheckpoint(checkpoint, failed)
          writeJson(checkpointPath, checkpoint)
          return failed
        }
      },
      args.concurrency,
    )
    items.push(...chunkResults)
    subBatchStats.push({
      index: index + 1,
      size: chunk.length,
      classifications: summarizeBatchResults(chunkResults),
    })
  }

  const summary = summarizeBatchResults(items)
  const sourceErrors = consolidateSourceErrors(items)
  summary.network_errors = sourceErrors.length
  const coverageProjected = coverageByChain.map(row => ({ ...row }))
  const report = {
    batch_id: args.batchId,
    date: new Date().toISOString(),
    dry_run: Boolean(args.dryRun || (!args.applyLibrary && !args.applyStaging)),
    source_mode: args.fromDatabase ? "database" : "file",
    store_chain_filter: cleanText(args.storeChain || "", 120),
    target_chain: representativeChainKey(args.storeChain || ""),
    requested_count: Math.max(1, Number(args.limit) || DEFAULT_LIMIT),
    selected_count: items.length,
    excluded_count: excludedAlreadyCovered.length,
    selected_chain_keys: Array.from(new Set(items.map(item => item.store_chain_key).filter(Boolean))),
    excluded_already_covered: excludedAlreadyCovered,
    items,
    summary,
    sub_batches: subBatchStats,
    source_errors: sourceErrors,
    coverage_by_chain: coverageByChain,
    coverage_projected: coverageProjected,
    reused_products: items.map(item => item.reusable_product).filter(Boolean),
    proposed_new_products: items.map(item => item.proposed_new_product).filter(Boolean),
    proposed_active_aliases: items.map(item => item.proposed_alias).filter(Boolean),
    staged_candidates: items.flatMap(item => item.proposed_staging_candidates || []),
    ambiguous_items: items.filter(item => item.classification === "ambiguous"),
    rejected_items: items.filter(item => item.classification === "rejected"),
    not_found_items: items.filter(item => item.classification === "not_found"),
    source_unavailable_items: items.filter(item => item.classification === "source_unavailable"),
    proof_audit: items.flatMap(item => item.proof_audit || []),
    web_sources_to_verify: items
      .filter(item => item.web_search_needed)
      .map(item => ({
        raw_label: item.raw_label,
        queries: item.web_search_queries,
      })),
    commands: {
      dry_run: `node scripts/enrich_market_alias_candidates.mjs ${args.fromDatabase ? "--from-database" : `--from-file ${args.fromFile}`}${args.storeChain ? ` --store-chain "${args.storeChain}"` : ""} --limit ${args.limit} --offset ${args.offset} --batch-id ${args.batchId} --dry-run --report ${args.report}`,
    },
    checkpoint_path: path.relative(REPO_ROOT, checkpointPath).replace(/\\/g, "/"),
    cache_dir: path.relative(REPO_ROOT, CACHE_DIR).replace(/\\/g, "/"),
  }

  ensureSafeReportValue(report, "report")

  if (args.report) {
    const absoluteJsonPath = path.isAbsolute(args.report) ? args.report : path.resolve(REPO_ROOT, args.report)
    const absoluteMarkdownPath = absoluteJsonPath.replace(/\.json$/i, ".md")
    writeJson(absoluteJsonPath, report)
    writeSafeTextReport(absoluteMarkdownPath, buildMarkdownReport(report))
    report.report_json = path.relative(REPO_ROOT, absoluteJsonPath).replace(/\\/g, "/")
    report.report_markdown = path.relative(REPO_ROOT, absoluteMarkdownPath).replace(/\\/g, "/")
  }

  if (args.applyLibrary) {
    report.applied = await applyLibraryPlan(report, args, dependencies)
  } else if (args.applyStaging) {
    report.applied = await applyStagingPlan(report, dependencies)
  }

  return report
}

export const __marketAliasLibraryBatchTestUtils = {
  applyLibraryPlan,
  buildApplyLibraryRpcPayload,
  buildCoverageByChainSql,
  buildDatabaseSelectionSql,
  buildCuratedProofCandidates,
  buildCuratedProofAuditEntries,
  buildDerivedManualAliasFamilyCandidates,
  buildLibraryAliasPayload,
  buildNewProductProposal,
  buildStagingPayload,
  buildWebQueries,
  classifyCandidateRows,
  consolidateSourceErrors,
  ensureSafeReportValue,
  findReusableProduct,
  inferAliasScope,
  normalizeApplyLibraryResult,
  normalizeInputBatchRow,
  partitionCoverageRows,
  parseBatchFile,
  representativeChainKey,
  summarizeBatchResults,
}
