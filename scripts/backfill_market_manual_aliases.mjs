import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

const FIRST_BATCH_RAW_LABELS = [
  "CHAMONIX BELIN 250G",
  "ASSORT FRAISE BANANES 250G COP",
  "CONFITURE MYRTILLE 370G MR",
  "ARRANGE RDH ANANAS/ROTI TOCL",
  "EAU CILAOS PACK 1L.25 X6",
  "CAM PAY 250G CROISES",
  "PETIT PAIN BLANC K10",
  "CONE PILPA CHOC/PISTACHE 6X72G",
  "POMME ROSTY'S MC CAIN 800G",
  "PITON DES NEIGES VANILLE X12",
  "TARAMA DEUFS CABIL,IOOG",
  "ROQUEFORT AOP L CR NRT,KG",
  "PATE CAMPAGNE DEMOULE GENERIQU",
  "PAVE NATURE POLETTE",
  "POULET FRAIS ROTI TRADITION",
]

const REDACTED_REPORT_KEYS = new Set([
  "userId",
  "receiptItemId",
  "storeId",
  "internal",
  "receipt_id",
  "user_id",
  "store_id",
  "receiptItemId",
])

const SQL_CONTROL_QUERY = `
select
  aliases.raw_label,
  aliases.corrected_label,
  products.canonical_name,
  aliases.source,
  aliases.status,
  aliases.validation_count,
  aliases.confidence,
  aliases.updated_at
from public.market_manual_product_aliases aliases
join public.market_products products on products.id = aliases.product_id
order by aliases.updated_at desc, aliases.validation_count desc, aliases.raw_label asc;
`.trim()

function sqlLiteral(value) {
  if (value == null) return "null"
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Invalid numeric value: ${value}`)
    return String(value)
  }
  if (typeof value === "boolean") return value ? "true" : "false"
  return `'${String(value).replace(/'/g, "''")}'`
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
          const candidate = source.slice(start, index + 1)
          return JSON.parse(candidate)
        }
      }
    }
  }

  throw new Error(`Unable to parse JSON from Supabase CLI output:\n${source}`)
}

function rowsFrom(result) {
  if (Array.isArray(result)) return result
  if (Array.isArray(result?.rows)) return result.rows
  return []
}

function oneRow(result, label) {
  const rows = rowsFrom(result)
  if (!rows[0]) throw new Error(`No row returned for ${label}`)
  return rows[0]
}

export function parseArgs(argv) {
  const args = {
    apply: false,
    dryRun: false,
    limit: null,
    reportPath: "",
  }

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]
    const next = argv[index + 1]

    if (current === "--dry-run") {
      args.dryRun = true
    } else if (current === "--apply") {
      args.apply = true
    } else if (current === "--limit" && next) {
      args.limit = Number(next)
      index += 1
    } else if (current === "--report" && next) {
      args.reportPath = next
      index += 1
    } else if (current === "--help" || current === "-h") {
      args.help = true
    } else {
      throw new Error(`Unknown argument: ${current}`)
    }
  }

  if (!args.apply) args.dryRun = true
  if (!Number.isFinite(args.limit) || args.limit <= 0) args.limit = null

  return args
}

function printHelp() {
  console.log(`Usage:
node scripts/backfill_market_manual_aliases.mjs [options]

Options:
  --dry-run          Analyze historical manual corrections without database writes.
  --apply            Create or reinforce eligible aliases on the linked Supabase project.
  --limit <n>        Limit the number of eligible historical rows analyzed.
  --report <file>    Write a sanitized JSON report to disk.
  --help             Show this help.
`)
}

function runLinkedSql(sql, label = "query") {
  const compactSql = String(sql || "").replace(/\s+/g, " ").trim()
  const result = spawnSync("powershell.exe", [
    "-NoProfile",
    "-Command",
    "$sql = $env:BKP_BACKFILL_SQL; supabase.cmd db query --linked --output json $sql",
  ], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
    env: {
      ...process.env,
      BKP_BACKFILL_SQL: compactSql,
    },
  })

  const stdout = String(result.stdout || "")
  const stderr = String(result.stderr || "")

  if (result.status !== 0) {
    throw new Error(`[${label}] supabase db query failed\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`)
  }

  return extractFirstJson(stdout || stderr)
}

function normalizeTextKey(value) {
  return String(value || "").trim().toLowerCase()
}

function groupBy(items, keyBuilder) {
  const groups = new Map()
  for (const item of items) {
    const key = keyBuilder(item)
    const bucket = groups.get(key)
    if (bucket) bucket.push(item)
    else groups.set(key, [item])
  }
  return groups
}

function buildAliasScopeKey(alias) {
  const scope = String(alias.scope || "")
  if (scope === "chain") return `chain:${String(alias.store_chain_key || "")}`
  if (scope === "store") return `store:${String(alias.store_id || "")}`
  return "global:"
}

function buildRowScopeKey(row) {
  const scopeKind = String(row.scope_kind || "")
  if (scopeKind === "chain") return `chain:${String(row.store_chain_key || "")}`
  if (scopeKind === "store") return `store:${String(row.store_id || "")}`
  return "global:"
}

function pickRepresentativeRow(rows) {
  return [...rows].sort((left, right) => {
    const leftHasProduct = left.market_product_id ? 1 : 0
    const rightHasProduct = right.market_product_id ? 1 : 0
    if (rightHasProduct !== leftHasProduct) return rightHasProduct - leftHasProduct
    return String(right.created_at || "").localeCompare(String(left.created_at || ""))
  })[0]
}

function findExactAlias(aliases, row) {
  const rowScopeKey = buildRowScopeKey(row)
  return aliases.find(alias =>
    buildAliasScopeKey(alias) === rowScopeKey
    && normalizeTextKey(alias.normalized_raw_label) === normalizeTextKey(row.normalized_raw_label)
    && normalizeTextKey(alias.normalized_corrected_label) === normalizeTextKey(row.normalized_corrected_label)
  ) || null
}

function findConflictingAliases(aliases, row) {
  const rowScopeKey = buildRowScopeKey(row)
  return aliases.filter(alias =>
    buildAliasScopeKey(alias) === rowScopeKey
    && normalizeTextKey(alias.normalized_raw_label) === normalizeTextKey(row.normalized_raw_label)
    && normalizeTextKey(alias.normalized_corrected_label) !== normalizeTextKey(row.normalized_corrected_label)
    && String(alias.status || "") !== "rejected"
  )
}

function buildActionFromExistingAlias({ exactAlias, conflictingAliases, representativeRow, occurrences }) {
  if (conflictingAliases.length > 0) {
    return {
      action: "conflict",
      reason: "existing_manual_alias_conflict",
    }
  }

  if (!exactAlias) {
    if (String(representativeRow.scope_kind || "") === "global_disabled") {
      return {
        action: "skipped",
        reason: "global_scope_disabled",
      }
    }

    return {
      action: "created",
      reason: "",
    }
  }

  if (String(exactAlias.status || "") !== "active") {
    return {
      action: "conflict",
      reason: "existing_alias_requires_review",
    }
  }

  if (Number(exactAlias.validation_count || 0) >= occurrences) {
    return {
      action: "skipped",
      reason: "alias_already_covers_historical_count",
    }
  }

  return {
    action: "strengthened",
    reason: "",
  }
}

function buildSanitizedPlanItem(planItem) {
  const {
    internal,
    ...safeItem
  } = planItem
  return safeItem
}

export function sanitizeBackfillReport(report) {
  return JSON.parse(JSON.stringify(report, (key, value) => {
    if (REDACTED_REPORT_KEYS.has(key)) return undefined
    return value
  }))
}

export function buildHistoricalAliasBackfillPlan({
  historicalRows = [],
  manualAliasRows = [],
  firstBatchRawLabels = FIRST_BATCH_RAW_LABELS,
} = {}) {
  const activeOrTrackedAliases = manualAliasRows.filter(alias => String(alias.status || "") !== "")
  const aliasesByRawScope = groupBy(activeOrTrackedAliases, alias => `${normalizeTextKey(alias.normalized_raw_label)}|${buildAliasScopeKey(alias)}`)
  const historicalRawGroups = groupBy(historicalRows, row => normalizeTextKey(row.normalized_raw_label))
  const firstBatchLookup = new Set(firstBatchRawLabels.map(value => String(value || "").trim()))

  const planItems = []

  for (const rowsForRaw of historicalRawGroups.values()) {
    const correctedGroups = groupBy(rowsForRaw, row => normalizeTextKey(row.normalized_corrected_label))
    const rawLabel = pickRepresentativeRow(rowsForRaw).raw_label

    if (correctedGroups.size > 1) {
      const variants = [...correctedGroups.values()]
        .map(rows => ({
          corrected_label: pickRepresentativeRow(rows).corrected_label,
          occurrences: rows.length,
        }))
        .sort((left, right) => right.occurrences - left.occurrences || left.corrected_label.localeCompare(right.corrected_label))

      planItems.push({
        raw_label: rawLabel,
        corrected_label: "",
        canonical_name: "",
        occurrences: rowsForRaw.length,
        alias_exists: false,
        action: "conflict",
        reason: "multiple_historical_corrections",
        status: "needs_review",
        source: "historical_manual_correction",
        first_batch_match: firstBatchLookup.has(rawLabel),
        variants,
        internal: {
          representativeRows: rowsForRaw.map(row => ({
            receiptItemId: row.receipt_item_id,
            userId: row.user_id,
          })),
        },
      })
      continue
    }

    for (const rowsForPair of correctedGroups.values()) {
      const scopeGroups = groupBy(rowsForPair, buildRowScopeKey)
      for (const scopedRows of scopeGroups.values()) {
        const representativeRow = pickRepresentativeRow(scopedRows)
        const aliasScopeKey = `${normalizeTextKey(representativeRow.normalized_raw_label)}|${buildRowScopeKey(representativeRow)}`
        const scopeAliases = aliasesByRawScope.get(aliasScopeKey) || []
        const exactAlias = findExactAlias(scopeAliases, representativeRow)
        const conflictingAliases = findConflictingAliases(scopeAliases, representativeRow)
        const occurrences = scopedRows.length
        const actionInfo = buildActionFromExistingAlias({
          exactAlias,
          conflictingAliases,
          representativeRow,
          occurrences,
        })

        planItems.push({
          raw_label: representativeRow.raw_label,
          corrected_label: representativeRow.corrected_label,
          canonical_name: exactAlias?.canonical_name || representativeRow.market_canonical_name || "",
          occurrences,
          alias_exists: Boolean(exactAlias),
          action: actionInfo.action,
          reason: actionInfo.reason,
          status: exactAlias?.status || (actionInfo.action === "conflict" ? "needs_review" : "active"),
          source: exactAlias?.source || "historical_manual_correction",
          confidence: exactAlias?.confidence ?? null,
          validation_count: exactAlias?.validation_count ?? 0,
          scope: representativeRow.scope_kind,
          first_batch_match: firstBatchLookup.has(representativeRow.raw_label),
          variants: [],
          internal: {
            receiptItemId: representativeRow.receipt_item_id,
            userId: representativeRow.user_id,
            aliasId: exactAlias?.id || "",
            targetValidationCount: Math.max(Number(exactAlias?.validation_count || 0), occurrences),
            scopeKey: buildRowScopeKey(representativeRow),
          },
        })
      }
    }
  }

  const summary = planItems.reduce((accumulator, item) => {
    accumulator.total_pairs += 1
    accumulator[item.action] += 1
    if (item.first_batch_match) accumulator.first_batch_matches += 1
    return accumulator
  }, {
    total_pairs: 0,
    created: 0,
    strengthened: 0,
    conflict: 0,
    skipped: 0,
    first_batch_matches: 0,
  })

  return {
    planItems,
    summary,
  }
}

export function buildAuditSnapshot({
  receiptItemsTotal,
  correctedNameTotal,
  historicalRows = [],
  manualAliasRows = [],
  marketProductAliasesTotal,
  externalCandidates = [],
}) {
  const distinctPairs = new Map()
  const rawConflicts = new Map()

  for (const row of historicalRows) {
    const distinctKey = `${normalizeTextKey(row.raw_label)}|${normalizeTextKey(row.corrected_label)}`
    distinctPairs.set(distinctKey, true)

    const bucket = rawConflicts.get(normalizeTextKey(row.raw_label)) || new Set()
    bucket.add(normalizeTextKey(row.corrected_label))
    rawConflicts.set(normalizeTextKey(row.raw_label), bucket)
  }

  const activeExactPairLookup = new Set(
    manualAliasRows
      .filter(alias => String(alias.status || "") === "active")
      .map(alias => `${normalizeTextKey(alias.normalized_raw_label)}|${normalizeTextKey(alias.normalized_corrected_label)}`),
  )

  const correctedPairsWithoutActiveAlias = [...new Set(historicalRows.map(row =>
    `${normalizeTextKey(row.normalized_raw_label)}|${normalizeTextKey(row.normalized_corrected_label)}`,
  ))].filter(key => !activeExactPairLookup.has(key)).length

  const candidateStatusCounts = externalCandidates.reduce((accumulator, candidate) => {
    const key = String(candidate.status || "")
    accumulator[key] = (accumulator[key] || 0) + 1
    return accumulator
  }, {})

  return {
    receipt_items_total: receiptItemsTotal,
    receipt_items_corrected_name_non_null: correctedNameTotal,
    distinct_raw_to_corrected_pairs: distinctPairs.size,
    market_manual_product_aliases_total: manualAliasRows.length,
    market_product_aliases_total: marketProductAliasesTotal,
    market_external_product_candidates_total: externalCandidates.length,
    market_external_product_candidates_by_status: candidateStatusCounts,
    corrected_pairs_without_active_manual_alias: correctedPairsWithoutActiveAlias,
    raw_labels_with_conflicting_corrections: [...rawConflicts.values()].filter(set => set.size > 1).length,
  }
}

function buildCoverageSummary(audit, planSummary) {
  const totalPairs = Math.max(Number(audit.distinct_raw_to_corrected_pairs || 0), 0)
  const beforeMissing = Math.max(Number(audit.corrected_pairs_without_active_manual_alias || 0), 0)
  const afterMissing = Math.max(beforeMissing - Number(planSummary.created || 0), 0)
  return {
    before_coverage_rate: totalPairs > 0 ? Number(((totalPairs - beforeMissing) / totalPairs).toFixed(3)) : 1,
    after_coverage_rate_dry_run_projection: totalPairs > 0 ? Number(((totalPairs - afterMissing) / totalPairs).toFixed(3)) : 1,
  }
}

function buildStrengthenAliasSql({ aliasId, targetValidationCount }) {
  return `
select
  id,
  validation_count,
  confidence,
  status,
  source,
  updated_at
from (
  update public.market_manual_product_aliases
  set
    validation_count = greatest(validation_count, ${sqlLiteral(targetValidationCount)}),
    last_observed_at = now(),
    updated_at = now()
  where id = ${sqlLiteral(aliasId)}::uuid
  returning id, validation_count, confidence, status, source, updated_at
) strengthened;
`
}

function buildLearnerSql({ userId, receiptItemId }) {
  return `
with auth_context as (
  select set_config('request.jwt.claim.sub', ${sqlLiteral(userId)}, true) as configured_sub
)
select public.market_learn_alias_from_receipt_item(
  ${sqlLiteral(receiptItemId)}::uuid,
  'historical_manual_correction',
  false
) as rpc_result
from auth_context;
`
}

async function applyPlanItems(planItems, dependencies = {}) {
  const queryImpl = dependencies.queryImpl || runLinkedSql
  const applied = []

  for (const item of planItems) {
    if (item.action === "skipped" || item.action === "conflict") {
      applied.push({
        ...item,
        outcome: item.action,
      })
      continue
    }

    if (item.action === "strengthened") {
      const strengthenedRow = oneRow(
        queryImpl(buildStrengthenAliasSql({
          aliasId: item.internal.aliasId,
          targetValidationCount: item.internal.targetValidationCount,
        }), "strengthen_alias"),
        "strengthen_alias",
      )

      applied.push({
        ...item,
        validation_count: Number(strengthenedRow.validation_count || item.validation_count || 0),
        confidence: strengthenedRow.confidence ?? item.confidence ?? null,
        status: strengthenedRow.status || item.status,
        source: strengthenedRow.source || item.source,
        outcome: "strengthened",
      })
      continue
    }

    const learnerRow = oneRow(
      queryImpl(buildLearnerSql({
        userId: item.internal.userId,
        receiptItemId: item.internal.receiptItemId,
      }), "historical_manual_alias_learner"),
      "historical_manual_alias_learner",
    )

    const rpcResult = learnerRow.rpc_result || {}
    if (!rpcResult.ok || !rpcResult.learned) {
      applied.push({
        ...item,
        outcome: "skipped",
        reason: rpcResult.reason || "learner_skipped",
        status: rpcResult.status || item.status,
      })
      continue
    }

    let nextValidationCount = Number(rpcResult.validation_count || 1)
    if (item.internal.targetValidationCount > nextValidationCount && rpcResult.alias_id) {
      const strengthenedRow = oneRow(
        queryImpl(buildStrengthenAliasSql({
          aliasId: rpcResult.alias_id,
          targetValidationCount: item.internal.targetValidationCount,
        }), "strengthen_created_alias"),
        "strengthen_created_alias",
      )
      nextValidationCount = Number(strengthenedRow.validation_count || nextValidationCount)
    }

    applied.push({
      ...item,
      canonical_name: rpcResult.canonical_name || item.canonical_name,
      confidence: rpcResult.confidence ?? item.confidence ?? null,
      validation_count: nextValidationCount,
      status: rpcResult.status || item.status,
      source: "historical_manual_correction",
      outcome: "created",
    })
  }

  return applied
}

function writeReport(reportPath, report) {
  if (!reportPath) return
  const absolutePath = path.isAbsolute(reportPath) ? reportPath : path.resolve(REPO_ROOT, reportPath)
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
  fs.writeFileSync(absolutePath, `${JSON.stringify(report, null, 2)}\n`, "utf8")
}

function loadHistoricalRows(limit = null) {
  const limitClause = limit ? `limit ${Number(limit)}` : ""
  return rowsFrom(runLinkedSql(`
with base_items as (
  select
    receipt_items.id as receipt_item_id,
    receipt_items.user_id,
    trim(coalesce(nullif(receipt_items.ocr_name, ''), nullif(receipt_items.name, ''), '')) as raw_label,
    trim(receipt_items.corrected_name) as corrected_label,
    public.market_normalize_manual_alias_text(trim(coalesce(nullif(receipt_items.ocr_name, ''), nullif(receipt_items.name, ''), ''))) as normalized_raw_label,
    public.market_normalize_manual_alias_text(trim(receipt_items.corrected_name)) as normalized_corrected_label,
    coalesce(receipts.store_name, '') as store_name,
    public.market_store_chain_key(receipts.store_name) as store_chain_key,
    coalesce(receipt_items.item_status, '') as item_status,
    ''::text as review_status,
    receipt_items.market_product_id,
    coalesce(receipt_items.market_canonical_name, '') as market_canonical_name,
    coalesce(receipt_items.brand, '') as brand,
    coalesce(receipt_items.category, '') as category,
    coalesce(receipt_items.market_package_format, '') as market_package_format,
    case
      when receipt_items.total_price is not null and receipt_items.total_price > 0 then receipt_items.total_price
      when receipt_items.unit_price is not null and receipt_items.unit_price > 0 then receipt_items.unit_price
      else null
    end as observed_price,
    receipt_items.created_at,
    (
      select case
        when count(*) = 1 then (array_agg(stores.id order by stores.id))[1]
        else null
      end
      from public.market_stores stores
      where stores.normalized_store_name = public.market_normalize_text(receipts.store_name)
        and (
          public.market_normalize_text(coalesce(receipts.store_location, '')) = ''
          or stores.normalized_city = public.market_normalize_text(receipts.store_location)
        )
    ) as store_id
  from public.receipt_items
  join public.receipts on receipts.id = receipt_items.receipt_id
  where receipt_items.corrected_name is not null
    and btrim(receipt_items.corrected_name) <> ''
    and coalesce(receipt_items.line_type, 'product') = 'product'
    and coalesce(receipt_items.item_status, '') in ('user_validated', 'trusted')
)
select
  *,
  case
    when store_chain_key <> '' then 'chain'
    when store_id is not null then 'store'
    else 'global_disabled'
  end as scope_kind
from base_items
where normalized_raw_label <> ''
  and normalized_corrected_label <> ''
  and normalized_raw_label <> normalized_corrected_label
order by normalized_raw_label asc, normalized_corrected_label asc, created_at desc
${limitClause};
`, "load_historical_rows"))
}

function loadManualAliasRows() {
  return rowsFrom(runLinkedSql(`
select
  aliases.id,
  aliases.product_id,
  aliases.raw_label,
  aliases.corrected_label,
  aliases.normalized_raw_label,
  aliases.normalized_corrected_label,
  aliases.scope,
  aliases.store_id,
  aliases.store_chain_key,
  aliases.source,
  aliases.status,
  aliases.validation_count,
  aliases.confidence,
  aliases.updated_at,
  coalesce(products.canonical_name, '') as canonical_name
from public.market_manual_product_aliases aliases
left join public.market_products products on products.id = aliases.product_id
order by aliases.updated_at desc, aliases.validation_count desc, aliases.raw_label asc;
`, "load_manual_alias_rows"))
}

function loadExternalCandidates() {
  return rowsFrom(runLinkedSql(`
select
  status,
  raw_label,
  candidate_canonical_name,
  source_name,
  source_confidence
from public.market_external_product_candidates
order by updated_at desc, source_confidence desc nulls last;
`, "load_external_candidates"))
}

function loadScalarCount(sql, key, label) {
  return Number(oneRow(runLinkedSql(sql, label), label)?.[key] || 0)
}

function buildReport({ args, audit, plan, appliedItems }) {
  const coverage = buildCoverageSummary(audit, plan.summary)
  const detailedItems = (appliedItems || plan.planItems).map(buildSanitizedPlanItem)
  return sanitizeBackfillReport({
    mode: args.apply ? "apply" : "dry_run",
    generated_at: new Date().toISOString(),
    audit,
    coverage,
    summary: {
      ...plan.summary,
      candidates_rejected: 0,
      suggestions_pending: detailedItems.filter(item => item.action === "conflict").length,
    },
    first_batch: detailedItems.filter(item => item.first_batch_match),
    items: detailedItems,
    control_query: SQL_CONTROL_QUERY,
  })
}

export async function runCli(argv = process.argv.slice(2), dependencies = {}) {
  const args = parseArgs(argv)
  if (args.help) {
    printHelp()
    return { ok: true, help: true }
  }

  const historicalRows = (dependencies.loadHistoricalRows || loadHistoricalRows)(args.limit)
  const manualAliasRows = (dependencies.loadManualAliasRows || loadManualAliasRows)()
  const externalCandidates = (dependencies.loadExternalCandidates || loadExternalCandidates)()
  const receiptItemsTotal = (dependencies.loadReceiptItemsTotal || (() => loadScalarCount(
    `select count(*)::int as receipt_items_total from public.receipt_items;`,
    "receipt_items_total",
    "receipt_items_total",
  )))()
  const correctedNameTotal = (dependencies.loadCorrectedNameTotal || (() => loadScalarCount(
    `select count(*)::int as corrected_name_total from public.receipt_items where corrected_name is not null and btrim(corrected_name) <> '';`,
    "corrected_name_total",
    "corrected_name_total",
  )))()
  const marketProductAliasesTotal = (dependencies.loadMarketProductAliasesTotal || (() => loadScalarCount(
    `select count(*)::int as market_product_aliases_total from public.market_product_aliases;`,
    "market_product_aliases_total",
    "market_product_aliases_total",
  )))()

  const audit = buildAuditSnapshot({
    receiptItemsTotal,
    correctedNameTotal,
    historicalRows,
    manualAliasRows,
    marketProductAliasesTotal,
    externalCandidates,
  })

  const plan = buildHistoricalAliasBackfillPlan({
    historicalRows,
    manualAliasRows,
  })

  const applyPlanItemsImpl = dependencies.applyPlanItemsImpl || applyPlanItems
  const appliedItems = args.apply
    ? await applyPlanItemsImpl(plan.planItems, dependencies)
    : null

  const report = buildReport({
    args,
    audit,
    plan,
    appliedItems,
  })

  const writeReportImpl = dependencies.writeReportImpl || writeReport
  writeReportImpl(args.reportPath, report)
  console.log(JSON.stringify(report, null, 2))

  return {
    ok: true,
    audit,
    plan,
    report,
  }
}

const currentFilePath = fileURLToPath(import.meta.url)
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === currentFilePath

if (isDirectRun) {
  await runCli()
}
