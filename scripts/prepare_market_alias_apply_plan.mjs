import fs from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const ALLOWED_CLASSIFICATIONS = new Set([
  "exact_strong",
  "strong_without_barcode",
  "active_library_ready",
])
const ALLOWED_SCOPES = new Set(["global", "chain", "store"])

function cleanText(value = "", max = 500) {
  return String(value ?? "").trim().slice(0, max)
}

function absolutePath(value = "") {
  if (!value) throw new Error("path_required")
  return path.isAbsolute(value) ? value : path.resolve(REPO_ROOT, value)
}

function extractRows(report) {
  if (Array.isArray(report)) return report
  if (Array.isArray(report?.items)) return report.items
  if (Array.isArray(report?.results)) return report.results
  if (Array.isArray(report?.processed_items)) return report.processed_items
  throw new Error("report_items_not_found")
}

function scopeKey(alias = {}) {
  return [
    cleanText(alias.scope, 20),
    cleanText(alias.store_chain_key, 120).toLowerCase(),
    cleanText(alias.store_id, 80).toLowerCase(),
    cleanText(alias.normalized_raw_label || alias.raw_label, 180).toLowerCase(),
  ].join("::")
}

export function classifyApplyPlanRow(row = {}) {
  const classification = cleanText(row.classification, 40)
  const action = cleanText(row.recommended_action, 40)
  const alias = row.proposed_alias
  const ambiguityReasons = Array.isArray(row.ambiguity_reasons)
    ? row.ambiguity_reasons.filter(Boolean)
    : []

  if (!ALLOWED_CLASSIFICATIONS.has(classification)) {
    return { eligible: false, reason: "classification_not_applicable" }
  }
  if (action !== "library") {
    return { eligible: false, reason: "recommended_action_not_library" }
  }
  if (!alias || typeof alias !== "object" || Array.isArray(alias)) {
    return { eligible: false, reason: "missing_proposed_alias" }
  }
  if (ambiguityReasons.length) {
    return { eligible: false, reason: "ambiguity_reasons_present" }
  }

  const rawLabel = cleanText(alias.raw_label || row.raw_label, 180)
  const normalizedRawLabel = cleanText(
    alias.normalized_raw_label || row.normalized_raw_label,
    180,
  )
  const scope = cleanText(alias.scope, 20)
  const status = cleanText(alias.status || "active", 20)
  const confidence = Number(alias.confidence)

  if (!rawLabel || !normalizedRawLabel) {
    return { eligible: false, reason: "missing_alias_label" }
  }
  if (!ALLOWED_SCOPES.has(scope)) {
    return { eligible: false, reason: "invalid_alias_scope" }
  }
  if (scope === "chain" && !cleanText(alias.store_chain_key, 120)) {
    return { eligible: false, reason: "missing_store_chain_key" }
  }
  if (scope === "store" && !cleanText(alias.store_id, 80)) {
    return { eligible: false, reason: "missing_store_id" }
  }
  if (status !== "active") {
    return { eligible: false, reason: "alias_not_active" }
  }
  if (!Number.isFinite(confidence) || confidence < 0.955) {
    return { eligible: false, reason: "confidence_below_apply_threshold" }
  }
  if (!cleanText(alias.source, 80)) {
    return { eligible: false, reason: "missing_alias_source" }
  }

  const item = {
    recommended_action: "library",
    classification,
    proposed_alias: {
      ...alias,
      raw_label: rawLabel,
      normalized_raw_label: normalizedRawLabel,
      confidence,
      status: "active",
    },
  }

  if (row.proposed_new_product != null) {
    if (
      typeof row.proposed_new_product !== "object"
      || Array.isArray(row.proposed_new_product)
    ) {
      return { eligible: false, reason: "proposed_new_product_must_be_object" }
    }
    item.proposed_new_product = row.proposed_new_product
  }

  return {
    eligible: true,
    reason: "",
    scope_key: scopeKey(item.proposed_alias),
    item,
  }
}

export function buildApplyPlan(report, metadata = {}) {
  const rows = extractRows(report)
  const applicableItems = []
  const excludedItems = []
  const seenScopeKeys = new Set()

  for (const row of rows) {
    const result = classifyApplyPlanRow(row)
    if (!result.eligible) {
      excludedItems.push({
        raw_label: cleanText(row?.raw_label, 180),
        classification: cleanText(row?.classification, 40),
        reason: result.reason,
      })
      continue
    }

    if (seenScopeKeys.has(result.scope_key)) {
      throw new Error(`duplicate_applicable_alias:${result.scope_key}`)
    }
    seenScopeKeys.add(result.scope_key)
    applicableItems.push(result.item)
  }

  const excludedByReason = {}
  for (const row of excludedItems) {
    excludedByReason[row.reason] = (excludedByReason[row.reason] || 0) + 1
  }

  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    dry_run_only: true,
    source_report: metadata.source_report || null,
    batch_id: report?.batch_id || metadata.batch_id || null,
    summary: {
      report_item_count: rows.length,
      applicable_count: applicableItems.length,
      excluded_count: excludedItems.length,
      excluded_by_reason: excludedByReason,
      writes_performed: 0,
    },
    rpc_preview: {
      function: "market_apply_scoped_alias_library",
      args: { p_items: applicableItems },
    },
    applicable_items: applicableItems,
    excluded_items: excludedItems,
  }
}

function parseArgs(argv = []) {
  const args = {}
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]
    const next = argv[index + 1]
    if (current === "--report" && next) {
      args.report = next
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

const isDirectRun = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false

if (isDirectRun) {
  try {
    const args = parseArgs(process.argv.slice(2))
    if (args.help) {
      console.log("npm.cmd run market:aliases:plan -- --report <rapport.json> [--output <plan.json>]")
    } else {
      if (!args.report) throw new Error("report_required")
      const reportPath = absolutePath(args.report)
      const report = JSON.parse(fs.readFileSync(reportPath, "utf8"))
      const output = absolutePath(
        args.output || args.report.replace(/\.json$/i, "-apply-plan.json"),
      )
      const plan = buildApplyPlan(report, {
        source_report: args.report.replace(/\\/g, "/"),
      })
      fs.mkdirSync(path.dirname(output), { recursive: true })
      fs.writeFileSync(output, `${JSON.stringify(plan, null, 2)}\n`, "utf8")
      console.log(JSON.stringify({
        output: path.relative(REPO_ROOT, output).replace(/\\/g, "/"),
        summary: plan.summary,
      }, null, 2))
    }
  } catch (error) {
    console.error("[market-alias-apply-plan] failed", error)
    process.exitCode = 1
  }
}