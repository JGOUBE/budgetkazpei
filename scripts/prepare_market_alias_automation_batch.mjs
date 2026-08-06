import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath, pathToFileURL } from "node:url"
import {
  normalizeAutomationStoreChain,
} from "./marketAliasAutomationRules.mjs"

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

function sqlTextLiteral(value = "") {
  return `'${String(value || "").replace(/'/g, "''")}'`
}

function sanitizeFilePart(value = "") {
  return String(value || "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "market-alias-automation"
}

function extractFirstJson(text = "") {
  const source = String(text || "")
  for (let start = 0; start < source.length; start += 1) {
    if (source[start] !== "[" && source[start] !== "{") continue
    let depth = 0
    let inString = false
    let escaping = false

    for (let index = start; index < source.length; index += 1) {
      const char = source[index]
      if (inString) {
        if (escaping) escaping = false
        else if (char === "\\") escaping = true
        else if (char === '"') inString = false
        continue
      }

      if (char === '"') {
        inString = true
        continue
      }

      if (char === "[" || char === "{") depth += 1
      else if (char === "]" || char === "}") {
        depth -= 1
        if (depth === 0) {
          return JSON.parse(source.slice(start, index + 1))
        }
      }
    }
  }

  throw new Error("unable_to_parse_supabase_json")
}

function rowsFrom(value) {
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.rows)) return value.rows
  return []
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

function writeMarkdown(filePath, rows, summary) {
  const lines = [
    "# PrÃ©paration automatique des alias",
    "",
    `- chaÃ®ne : ${summary.store_chain}`,
    `- libellÃ©s sÃ©lectionnÃ©s : ${summary.selected_count}`,
    `- lignes brutes concernÃ©es : ${summary.raw_line_occurrences}`,
    `- tickets enregistrÃ©s par libellÃ© : ${summary.registered_receipt_occurrences}`,
    `- tickets distincts probables par libellÃ© : ${summary.deduplicated_receipt_occurrences}`,
    `- doublons probables par libellÃ© : ${summary.probable_duplicate_occurrences}`,
    "- Ã©criture Supabase : aucune",
    "",
    "| LibellÃ© | Lignes | Tickets enregistrÃ©s | Tickets distincts | Doublons probables | Prix min | Prix max |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
  ]

  for (const row of rows) {
    const safeLabel = String(row.raw_label || "").replace(/\|/g, "\\|")
    lines.push(
      `| ${safeLabel} | ${row.frequency || 0} | ${row.registered_receipts || 0} | ${row.distinct_receipts || 0} | ${row.probable_duplicates || 0} | ${row.observed_price_min ?? ""} | ${row.observed_price_max ?? ""} |`,
    )
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8")
}

export function buildAutomationSelectionSql({
  storeChain = "",
  limit = 50,
  offset = 0,
} = {}) {
  const normalizedChain = normalizeAutomationStoreChain(storeChain)
  if (!normalizedChain) throw new Error("store_chain_required")

  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 50))
  const safeOffset = Math.max(0, Number(offset) || 0)
  const chainLiteral = sqlTextLiteral(normalizedChain)

  return `
with receipt_fingerprints as (
  select
    receipts.id as receipt_id,
    md5(
      concat_ws(
        '||',
        coalesce(to_jsonb(receipts) ->> 'user_id', ''),
        public.market_store_chain_key(receipts.store_name),
        coalesce(receipts.purchase_date::text, ''),
        coalesce(
          to_jsonb(receipts) ->> 'total_amount',
          to_jsonb(receipts) ->> 'total',
          ''
        ),
        md5(
          string_agg(
            concat_ws(
              '|',
              public.market_normalize_manual_alias_text(
                trim(
                  coalesce(
                    nullif(receipt_items.corrected_name, ''),
                    nullif(receipt_items.ocr_name, ''),
                    nullif(receipt_items.name, ''),
                    ''
                  )
                )
              ),
              coalesce(receipt_items.quantity::text, ''),
              coalesce(receipt_items.unit_price::text, ''),
              coalesce(receipt_items.total_price::text, ''),
              coalesce(receipt_items.line_type, '')
            ),
            '||'
            order by
              public.market_normalize_manual_alias_text(
                trim(
                  coalesce(
                    nullif(receipt_items.corrected_name, ''),
                    nullif(receipt_items.ocr_name, ''),
                    nullif(receipt_items.name, ''),
                    ''
                  )
                )
              ),
              receipt_items.total_price,
              receipt_items.quantity,
              receipt_items.unit_price
          )
        )
      )
    ) as dedupe_fingerprint
  from public.receipts receipts
  join public.receipt_items receipt_items
    on receipt_items.receipt_id = receipts.id
  where public.market_store_chain_key(receipts.store_name) = ${chainLiteral}
  group by
    receipts.id,
    coalesce(to_jsonb(receipts) ->> 'user_id', ''),
    receipts.store_name,
    receipts.purchase_date,
    coalesce(
      to_jsonb(receipts) ->> 'total_amount',
      to_jsonb(receipts) ->> 'total',
      ''
    )
),
base_items as (
  select
    receipt_items.id as receipt_item_id,
    receipt_items.receipt_id,
    trim(
      coalesce(
        nullif(receipt_items.corrected_name, ''),
        nullif(receipt_items.ocr_name, ''),
        nullif(receipt_items.name, ''),
        ''
      )
    ) as raw_label,
    public.market_normalize_manual_alias_text(
      trim(
        coalesce(
          nullif(receipt_items.corrected_name, ''),
          nullif(receipt_items.ocr_name, ''),
          nullif(receipt_items.name, ''),
          ''
        )
      )
    ) as normalized_raw_label,
    coalesce(nullif(receipt_items.brand, ''), nullif(receipt_items.market_brand, ''), '') as brand_hint,
    coalesce(nullif(receipt_items.category, ''), nullif(receipt_items.market_category, ''), '') as category_hint,
    coalesce(nullif(receipt_items.market_package_format, ''), '') as package_format_hint,
    coalesce(receipts.store_name, '') as store_name,
    coalesce(receipts.store_location, '') as store_city,
    public.market_store_chain_key(receipts.store_name) as store_chain_key,
    case
      when receipt_items.total_price is not null and receipt_items.total_price > 0
        then receipt_items.total_price
      when receipt_items.unit_price is not null and receipt_items.unit_price > 0
        then receipt_items.unit_price
      else null
    end as observed_price,
    receipts.purchase_date as observed_date,
    receipt_fingerprints.dedupe_fingerprint
  from public.receipt_items receipt_items
  join public.receipts receipts
    on receipts.id = receipt_items.receipt_id
  join receipt_fingerprints
    on receipt_fingerprints.receipt_id = receipts.id
  where coalesce(receipt_items.line_type, 'product') = 'product'
    and receipt_items.market_product_id is null
    and public.market_store_chain_key(receipts.store_name) = ${chainLiteral}
),
filtered as (
  select *
  from base_items
  where normalized_raw_label <> ''
    and length(normalized_raw_label) >= 3
    and normalized_raw_label !~
      '(?:^| )(total|sous total|reste a payer|net a payer|paiement|carte bleue|cb|ticket|tva|ttc|fidelite|remise|bon achat|consigne)(?: |$)'
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
ranked as (
  select
    filtered.*,
    row_number() over (
      partition by filtered.normalized_raw_label
      order by
        variant_counts.variant_count desc,
        length(filtered.raw_label) desc,
        filtered.raw_label asc
    ) as raw_label_rank
  from filtered
  join variant_counts
    on variant_counts.normalized_raw_label = filtered.normalized_raw_label
   and variant_counts.raw_label = filtered.raw_label
),
aggregated as (
  select
    normalized_raw_label,
    max(raw_label) filter (where raw_label_rank = 1) as raw_label,
    count(*)::int as frequency,
    count(distinct receipt_id)::int as registered_receipts,
    count(distinct dedupe_fingerprint)::int as distinct_receipts,
    (
      count(distinct receipt_id)
      - count(distinct dedupe_fingerprint)
    )::int as probable_duplicates,
    1::int as distinct_chains,
    max(store_chain_key) as store_chain_key,
    max(store_name) as store_name,
    max(store_city) as store_city,
    case
      when count(distinct nullif(public.market_normalize_text(brand_hint), '')) = 1
        then max(nullif(brand_hint, ''))
      else null
    end as brand_hint,
    case
      when count(distinct nullif(category_hint, '')) = 1
        then max(nullif(category_hint, ''))
      else null
    end as category_hint,
    case
      when count(distinct nullif(package_format_hint, '')) = 1
        then max(nullif(package_format_hint, ''))
      else null
    end as package_format_hint,
    min(observed_price) as observed_price_min,
    max(observed_price) as observed_price_max,
    min(observed_date)::text as first_observed_at,
    max(observed_date)::text as last_observed_at
  from ranked
  group by normalized_raw_label
),
unknown_only as (
  select aggregated.*
  from aggregated
  where not exists (
    select 1
    from public.market_product_aliases aliases
    where aliases.normalized_raw_label = aggregated.normalized_raw_label
      and coalesce(aliases.status, 'active') = 'active'
      and (
        aliases.scope = 'global'
        or (
          aliases.scope = 'chain'
          and public.market_store_chain_key(coalesce(aliases.store_chain_key, ''))
            = aggregated.store_chain_key
        )
      )
  )
  and not exists (
    select 1
    from public.market_manual_product_aliases aliases
    where coalesce(aliases.status, 'active') = 'active'
      and (
        coalesce(
          nullif(aliases.normalized_raw_label, ''),
          public.market_normalize_manual_alias_text(aliases.raw_label)
        ) = aggregated.normalized_raw_label
        or coalesce(
          nullif(aliases.normalized_corrected_label, ''),
          public.market_normalize_manual_alias_text(aliases.corrected_label)
        ) = aggregated.normalized_raw_label
      )
      and (
        aliases.scope = 'global'
        or (
          aliases.scope = 'chain'
          and public.market_store_chain_key(coalesce(aliases.store_chain_key, ''))
            = aggregated.store_chain_key
        )
      )
  )
  and not exists (
    select 1
    from public.market_external_product_candidates candidates
    where candidates.normalized_raw_label = aggregated.normalized_raw_label
      and candidates.status = 'validated'
  )
)
select
  raw_label,
  normalized_raw_label,
  frequency,
  distinct_receipts,
  distinct_receipts as receipts_observed,
  registered_receipts,
  probable_duplicates,
  distinct_chains,
  store_chain_key,
  store_name,
  store_city,
  category_hint,
  brand_hint,
  package_format_hint,
  observed_price_min,
  observed_price_max,
  first_observed_at,
  last_observed_at
from unknown_only
order by
  distinct_receipts desc,
  frequency desc,
  normalized_raw_label asc
offset ${safeOffset}
limit ${safeLimit};
`.trim()
}

function runLinkedSql(sql, label = "market_alias_automation") {
  const tempDir = path.join(REPO_ROOT, ".market-alias-cache")
  fs.mkdirSync(tempDir, { recursive: true })
  const tempPath = path.join(
    tempDir,
    `${sanitizeFilePart(label)}-${Date.now()}.sql`,
  )
  fs.writeFileSync(tempPath, `${sql}\n`, "utf8")

  const result = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      "supabase.cmd db query --linked --output json --file $env:BKP_MARKET_ALIAS_SQL_FILE",
    ],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 30 * 1024 * 1024,
      env: {
        ...process.env,
        BKP_MARKET_ALIAS_SQL_FILE: tempPath,
      },
    },
  )

  try {
    fs.unlinkSync(tempPath)
  } catch {
    // Nettoyage au mieux.
  }

  if (result.status !== 0) {
    throw new Error(
      `linked_sql_failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    )
  }

  return rowsFrom(extractFirstJson(result.stdout || result.stderr))
}

export function summarizeAutomationRows(rows = [], storeChain = "") {
  return {
    store_chain: normalizeAutomationStoreChain(storeChain),
    selected_count: rows.length,
    raw_line_occurrences: rows.reduce(
      (sum, row) => sum + Number(row.frequency || 0),
      0,
    ),
    registered_receipt_occurrences: rows.reduce(
      (sum, row) => sum + Number(row.registered_receipts || 0),
      0,
    ),
    deduplicated_receipt_occurrences: rows.reduce(
      (sum, row) => sum + Number(row.distinct_receipts || 0),
      0,
    ),
    probable_duplicate_occurrences: rows.reduce(
      (sum, row) => sum + Number(row.probable_duplicates || 0),
      0,
    ),
  }
}

export function prepareAutomationBatch({
  storeChain,
  limit = 50,
  offset = 0,
  output,
} = {}) {
  const normalizedChain = normalizeAutomationStoreChain(storeChain)
  if (!normalizedChain) throw new Error("store_chain_required")

  const outputPath = path.isAbsolute(output || "")
    ? output
    : path.resolve(
      REPO_ROOT,
      output || `reports/market-alias-${sanitizeFilePart(normalizedChain)}-input.json`,
    )

  const rows = runLinkedSql(
    buildAutomationSelectionSql({
      storeChain: normalizedChain,
      limit,
      offset,
    }),
    `prepare-${normalizedChain}`,
  )

  const summary = summarizeAutomationRows(rows, normalizedChain)
  writeJson(outputPath, rows)
  writeJson(outputPath.replace(/\.json$/i, ".summary.json"), summary)
  writeMarkdown(outputPath.replace(/\.json$/i, ".summary.md"), rows, summary)

  return {
    rows,
    summary,
    outputPath,
  }
}

function parseArgs(argv = []) {
  const args = {
    limit: 50,
    offset: 0,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]
    const next = argv[index + 1]

    if (current === "--store-chain" && next) {
      args.storeChain = next
      index += 1
    } else if (current === "--limit" && next) {
      args.limit = Math.max(1, Number(next) || 50)
      index += 1
    } else if (current === "--offset" && next) {
      args.offset = Math.max(0, Number(next) || 0)
      index += 1
    } else if (current === "--output" && next) {
      args.output = next
      index += 1
    } else if (current === "--help" || current === "-h") {
      args.help = true
    } else {
      throw new Error(`unknown_argument:${current}`)
    }
  }

  return args
}

function printHelp() {
  console.log(`
Usage:
  node scripts/prepare_market_alias_automation_batch.mjs \
    --store-chain "e leclerc" \
    --limit 50 \
    --output reports/market-alias-auto-input.json

Cette commande :
- lit uniquement la base Supabase liÃ©e ;
- dÃ©duplique les tickets par empreinte de panier ;
- exclut les libellÃ©s dÃ©jÃ  couverts ;
- ne crÃ©e aucun produit, alias ou backfill.
`.trim())
}

const isDirectRun = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false

if (isDirectRun) {
  try {
    const args = parseArgs(process.argv.slice(2))
    if (args.help) {
      printHelp()
    } else {
      const result = prepareAutomationBatch(args)
      console.log(JSON.stringify({
        output: path.relative(REPO_ROOT, result.outputPath).replace(/\\/g, "/"),
        summary: result.summary,
      }, null, 2))
    }
  } catch (error) {
    console.error("[market-alias-automation-prepare] failed", error)
    process.exitCode = 1
  }
}