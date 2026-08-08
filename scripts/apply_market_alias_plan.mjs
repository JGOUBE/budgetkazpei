import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { fileURLToPath, pathToFileURL } from "node:url"

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const ALLOWED_CLASSIFICATIONS = new Set([
  "exact_strong",
  "strong_without_barcode",
  "active_library_ready",
])

function cleanText(value = "", max = 500) {
  return String(value ?? "").trim().slice(0, max)
}

function absolutePath(value = "") {
  if (!value) throw new Error("path_required")
  return path.isAbsolute(value) ? value : path.resolve(REPO_ROOT, value)
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(absolutePath(filePath), "utf8"))
}

function writeJson(filePath, value) {
  const target = absolutePath(filePath)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, "utf8")
  return target
}

function writeText(filePath, value) {
  const target = absolutePath(filePath)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, `${String(value).trimEnd()}\n`, "utf8")
  return target
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [key, canonicalize(value[key])]),
    )
  }
  return value
}

export function computePlanDigest(plan) {
  const payload = {
    source_report: plan?.source_report || null,
    p_items: plan?.rpc_preview?.args?.p_items || [],
  }
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(payload)))
    .digest("hex")
}

export function buildConfirmationToken(plan) {
  return `APPLY_MARKET_ALIAS_PLAN:${computePlanDigest(plan).slice(0, 20)}`
}

function extractReportRows(report) {
  if (Array.isArray(report)) return report
  if (Array.isArray(report?.items)) return report.items
  if (Array.isArray(report?.results)) return report.results
  if (Array.isArray(report?.processed_items)) return report.processed_items
  throw new Error("source_report_items_not_found")
}

export function validateExecutablePlan(plan) {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    throw new Error("invalid_plan")
  }

  if (plan.dry_run_only !== true) {
    throw new Error("plan_must_come_from_dry_run")
  }

  if (plan?.rpc_preview?.function !== "market_apply_scoped_alias_library") {
    throw new Error("unexpected_rpc_function")
  }

  const items = plan?.rpc_preview?.args?.p_items
  if (!Array.isArray(items)) throw new Error("plan_items_missing")

  if (Number(plan?.summary?.applicable_count) !== items.length) {
    throw new Error("plan_summary_count_mismatch")
  }

  const scopeKeys = new Set()
  for (const item of items) {
    const classification = cleanText(item?.classification, 40)
    const alias = item?.proposed_alias

    if (!ALLOWED_CLASSIFICATIONS.has(classification)) {
      throw new Error(`non_applicable_classification:${classification}`)
    }
    if (item?.recommended_action !== "library") {
      throw new Error("non_library_action")
    }
    if (!alias || typeof alias !== "object" || Array.isArray(alias)) {
      throw new Error("missing_proposed_alias")
    }

    // Phase 2B : application automatique limitÃ©e aux alias d'enseigne.
    if (alias.scope !== "chain") {
      throw new Error(`unsupported_scope:${alias.scope || ""}`)
    }
    if (!cleanText(alias.store_chain_key, 120)) {
      throw new Error("missing_store_chain_key")
    }
    if (!cleanText(alias.normalized_raw_label, 180)) {
      throw new Error("missing_normalized_raw_label")
    }
    if (alias.status !== "active") {
      throw new Error("alias_not_active")
    }
    if (!Number.isFinite(Number(alias.confidence)) || Number(alias.confidence) < 0.955) {
      throw new Error("confidence_below_apply_threshold")
    }

    const scopeKey = [
      alias.scope,
      cleanText(alias.store_chain_key, 120).toLowerCase(),
      cleanText(alias.normalized_raw_label, 180).toLowerCase(),
    ].join("::")

    if (scopeKeys.has(scopeKey)) {
      throw new Error(`duplicate_alias_scope:${scopeKey}`)
    }
    scopeKeys.add(scopeKey)
  }

  return items
}

export function buildExecutionEntries(plan, sourceReport) {
  const items = validateExecutablePlan(plan)
  const rows = extractReportRows(sourceReport)
  const rowMap = new Map()

  for (const row of rows) {
    const key = [
      cleanText(row?.store_chain_key, 120).toLowerCase(),
      cleanText(row?.normalized_raw_label, 180).toLowerCase(),
    ].join("::")
    if (rowMap.has(key)) throw new Error(`duplicate_source_report_row:${key}`)
    rowMap.set(key, row)
  }

  return items.map(item => {
    const alias = item.proposed_alias
    const key = [
      cleanText(alias.store_chain_key, 120).toLowerCase(),
      cleanText(alias.normalized_raw_label, 180).toLowerCase(),
    ].join("::")
    const row = rowMap.get(key)
    if (!row) throw new Error(`source_report_row_missing:${key}`)

    const expectedCount = Number(row.frequency)
    if (!Number.isInteger(expectedCount) || expectedCount < 1) {
      throw new Error(`invalid_expected_count:${key}`)
    }

    return {
      normalized_raw_label: alias.normalized_raw_label,
      store_chain_key: alias.store_chain_key,
      expected_count: expectedCount,
    }
  })
}

function sqlJsonLiteral(value) {
  return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`
}

export function buildAtomicExecutionSql({ plan, sourceReport }) {
  const items = validateExecutablePlan(plan)
  if (!items.length) throw new Error("no_applicable_items")

  const expectations = buildExecutionEntries(plan, sourceReport)

  return `
with
input as (
  select
    ${sqlJsonLiteral(items)} as p_items,
    ${sqlJsonLiteral(expectations)} as expectations
),

rpc as materialized (
  select public.market_apply_scoped_alias_library(input.p_items) as result
  from input
),

rpc_guard as (
  select
    1 / case
      when jsonb_array_length(coalesce(rpc.result -> 'errors', '[]'::jsonb)) = 0
       and jsonb_array_length(coalesce(rpc.result -> 'skipped', '[]'::jsonb)) = 0
      then 1
      else 0
    end as ok
  from rpc
),

expected as (
  select *
  from input,
  jsonb_to_recordset(input.expectations) as rows(
    normalized_raw_label text,
    store_chain_key text,
    expected_count integer
  )
),

resolved_aliases as (
  select
    expected.normalized_raw_label,
    expected.store_chain_key,
    expected.expected_count,
    aliases.product_id
  from expected
  join public.market_product_aliases aliases
    on aliases.normalized_raw_label = expected.normalized_raw_label
   and aliases.scope = 'chain'
   and aliases.store_chain_key = expected.store_chain_key
   and aliases.status = 'active'
),

alias_counts as (
  select
    expected.normalized_raw_label,
    expected.store_chain_key,
    expected.expected_count,
    count(resolved_aliases.product_id)::integer as alias_count
  from expected
  left join resolved_aliases
    on resolved_aliases.normalized_raw_label = expected.normalized_raw_label
   and resolved_aliases.store_chain_key = expected.store_chain_key
  group by
    expected.normalized_raw_label,
    expected.store_chain_key,
    expected.expected_count
),

alias_guard as (
  select
    1 / case
      when count(*) filter (where alias_count <> 1) = 0
      then 1
      else 0
    end as ok
  from alias_counts
),

target_lines as (
  select
    receipt_items.id,
    receipt_items.market_product_id,
    resolved_aliases.normalized_raw_label,
    resolved_aliases.store_chain_key,
    resolved_aliases.expected_count,
    resolved_aliases.product_id
  from resolved_aliases
  join public.receipts receipts
    on public.market_store_chain_key(receipts.store_name)
       = resolved_aliases.store_chain_key
  join public.receipt_items receipt_items
    on receipt_items.receipt_id = receipts.id
   and coalesce(receipt_items.line_type, 'product') = 'product'
   and public.market_normalize_manual_alias_text(
         trim(
           coalesce(
             nullif(receipt_items.corrected_name, ''),
             nullif(receipt_items.ocr_name, ''),
             nullif(receipt_items.name, ''),
             ''
           )
         )
       ) = resolved_aliases.normalized_raw_label
),

line_counts as (
  select
    resolved_aliases.normalized_raw_label,
    resolved_aliases.store_chain_key,
    resolved_aliases.expected_count,
    resolved_aliases.product_id,
    count(target_lines.id)::integer as live_count,
    count(target_lines.id) filter (
      where target_lines.market_product_id is null
    )::integer as unresolved_count,
    count(target_lines.id) filter (
      where target_lines.market_product_id = resolved_aliases.product_id
    )::integer as already_correct_count,
    count(target_lines.id) filter (
      where target_lines.market_product_id is not null
        and target_lines.market_product_id <> resolved_aliases.product_id
    )::integer as conflict_count
  from resolved_aliases
  left join target_lines
    on target_lines.normalized_raw_label = resolved_aliases.normalized_raw_label
   and target_lines.store_chain_key = resolved_aliases.store_chain_key
   and target_lines.product_id = resolved_aliases.product_id
  group by
    resolved_aliases.normalized_raw_label,
    resolved_aliases.store_chain_key,
    resolved_aliases.expected_count,
    resolved_aliases.product_id
),

line_guard as (
  select
    1 / case
      when count(*) filter (
        where live_count <> expected_count
           or conflict_count <> 0
      ) = 0
      then 1
      else 0
    end as ok
  from line_counts
),

all_guards as (
  select
    rpc_guard.ok as rpc_ok,
    alias_guard.ok as alias_ok,
    line_guard.ok as line_ok
  from rpc_guard
  cross join alias_guard
  cross join line_guard
),

updated as (
  update public.receipt_items receipt_items
  set
    market_product_id = target_lines.product_id,
    market_matched = true,
    market_match_type = 'alias_exact',
    market_match_confidence = 1,
    market_canonical_name = products.canonical_name,
    market_brand = products.brand,
    market_category = products.category,
    market_subcategory = products.subcategory,
    market_package_format = products.package_format
  from
    target_lines,
    public.market_products products,
    all_guards
  where receipt_items.id = target_lines.id
    and products.id = target_lines.product_id
    and receipt_items.market_product_id is null
    and all_guards.rpc_ok = 1
    and all_guards.alias_ok = 1
    and all_guards.line_ok = 1
  returning
    receipt_items.id,
    target_lines.normalized_raw_label,
    target_lines.store_chain_key,
    target_lines.product_id
),

updated_counts as (
  select
    normalized_raw_label,
    store_chain_key,
    product_id,
    count(*)::integer as updated_count
  from updated
  group by normalized_raw_label, store_chain_key, product_id
)

select jsonb_build_object(
  'rpc_result', rpc.result,
  'backfill',
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'normalized_raw_label', line_counts.normalized_raw_label,
          'store_chain_key', line_counts.store_chain_key,
          'product_id', line_counts.product_id,
          'expected_count', line_counts.expected_count,
          'live_count', line_counts.live_count,
          'already_correct_count', line_counts.already_correct_count,
          'updated_count', coalesce(updated_counts.updated_count, 0),
          'conflict_count', line_counts.conflict_count
        )
        order by line_counts.normalized_raw_label
      )
      from line_counts
      left join updated_counts
        on updated_counts.normalized_raw_label = line_counts.normalized_raw_label
       and updated_counts.store_chain_key = line_counts.store_chain_key
       and updated_counts.product_id = line_counts.product_id
    ),
    '[]'::jsonb
  )
) as result
from rpc
cross join all_guards;
`.trim()
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
        if (depth === 0) return JSON.parse(source.slice(start, index + 1))
      }
    }
  }
  throw new Error("unable_to_parse_supabase_json")
}

function runLinkedSql(sql, label = "market-alias-apply") {
  const cacheDir = path.join(REPO_ROOT, ".market-alias-cache")
  fs.mkdirSync(cacheDir, { recursive: true })
  const sqlPath = path.join(cacheDir, `${label}-${Date.now()}.sql`)
  fs.writeFileSync(sqlPath, `${sql}\n`, "utf8")

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
        BKP_MARKET_ALIAS_SQL_FILE: sqlPath,
      },
    },
  )

  try {
    fs.unlinkSync(sqlPath)
  } catch {
    // Nettoyage au mieux.
  }

  if (result.status !== 0) {
    throw new Error(
      `linked_sql_failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    )
  }

  return extractFirstJson(result.stdout || result.stderr)
}

function parseArgs(argv = []) {
  const args = {}
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]
    const next = argv[index + 1]

    if (current === "--plan" && next) {
      args.plan = next
      index += 1
    } else if (current === "--source-report" && next) {
      args.sourceReport = next
      index += 1
    } else if (current === "--sql-output" && next) {
      args.sqlOutput = next
      index += 1
    } else if (current === "--result-output" && next) {
      args.resultOutput = next
      index += 1
    } else if (current === "--apply") {
      args.apply = true
    } else if (current === "--confirm" && next) {
      args.confirm = next
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
PrÃ©visualisation :
  npm.cmd run market:aliases:apply-plan -- \
    --plan reports/mon-plan.json \
    --source-report reports/mon-rapport.json

Application rÃ©elle :
  npm.cmd run market:aliases:apply-plan -- \
    --plan reports/mon-plan.json \
    --source-report reports/mon-rapport.json \
    --apply \
    --confirm APPLY_MARKET_ALIAS_PLAN:xxxxxxxxxxxxxxxxxxxx

Sans --apply, aucune commande Supabase n'est exÃ©cutÃ©e.
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
      if (!args.plan) throw new Error("plan_required")
      const plan = readJson(args.plan)
      const sourceReportPath = args.sourceReport || plan.source_report
      if (!sourceReportPath) throw new Error("source_report_required")
      const sourceReport = readJson(sourceReportPath)
      const token = buildConfirmationToken(plan)

      if (!plan?.rpc_preview?.args?.p_items?.length) {
        console.log(JSON.stringify({
          applicable_count: 0,
          writes_performed: 0,
          message: "Aucun Ã©lÃ©ment applicable dans ce plan.",
        }, null, 2))
        process.exit(0)
      }

      const sql = buildAtomicExecutionSql({ plan, sourceReport })
      const defaultSqlOutput = args.plan.replace(/\.json$/i, "-atomic.sql")
      const sqlPath = writeText(args.sqlOutput || defaultSqlOutput, sql)

      if (!args.apply) {
        console.log(JSON.stringify({
          mode: "preview",
          writes_performed: 0,
          confirmation_token: token,
          sql_output: path.relative(REPO_ROOT, sqlPath).replace(/\\/g, "/"),
          applicable_count: plan.rpc_preview.args.p_items.length,
        }, null, 2))
        process.exit(0)
      }

      if (args.confirm !== token) {
        throw new Error(`confirmation_token_mismatch:${token}`)
      }

      const rawResult = runLinkedSql(sql)
      const resultOutput = args.resultOutput
        || args.plan.replace(/\.json$/i, "-execution-result.json")
      const resultPath = writeJson(resultOutput, {
        executed_at: new Date().toISOString(),
        plan_digest: computePlanDigest(plan),
        source_plan: args.plan.replace(/\\/g, "/"),
        source_report: sourceReportPath.replace(/\\/g, "/"),
        result: rawResult,
      })

      console.log(JSON.stringify({
        mode: "applied",
        result_output: path.relative(REPO_ROOT, resultPath).replace(/\\/g, "/"),
        result: rawResult,
      }, null, 2))
    }
  } catch (error) {
    console.error("[market-alias-apply-plan] failed", error)
    process.exitCode = 1
  }
}