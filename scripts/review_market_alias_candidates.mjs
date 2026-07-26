import { pathToFileURL } from "node:url"
import {
  buildExternalCandidatePromotion,
  sanitizeExternalCandidateRecord,
} from "../src/services/scan/marketExternalCandidateService.js"

export function parseArgs(argv) {
  const args = {
    dryRun: false,
    status: "validated",
  }

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]
    const next = argv[index + 1]
    if (current === "--candidate-id" && next) {
      args.candidateId = next
      index += 1
    } else if (current === "--status" && next) {
      args.status = next
      index += 1
    } else if (current === "--product-id" && next) {
      args.productId = next
      index += 1
    } else if (current === "--notes" && next) {
      args.notes = next
      index += 1
    } else if (current === "--promote-alias") {
      args.promoteAlias = true
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
node scripts/review_market_alias_candidates.mjs --candidate-id <uuid> [options]

Options:
  --status <candidate|validated|rejected>  Target status (default: validated)
  --product-id <uuid>                      Product id for promotion to active alias.
  --notes <text>                           Validation or rejection notes.
  --promote-alias                          Create or reinforce a market_product_aliases row.
  --dry-run                                Do not write to Supabase.
  --help                                   Show this help.
`)
}

function env(name) {
  return process.env[name] || ""
}

function baseUrl() {
  return String(env("SUPABASE_URL") || env("VITE_SUPABASE_URL") || env("BKP_TEST_SUPABASE_URL") || "").replace(/\/+$/, "")
}

function serviceRoleKey() {
  return env("SUPABASE_SERVICE_ROLE_KEY") || env("SERVICE_ROLE_KEY") || env("BKP_TEST_SUPABASE_SERVICE_ROLE_KEY")
}

export function buildMarketProductAliasUpsertPath() {
  return "market_product_aliases?on_conflict=product_id,normalized_raw_label,source"
}

async function fetchRest(path, options = {}, dependencies = {}) {
  const url = `${dependencies.baseUrl || baseUrl()}/rest/v1/${path}`
  const key = dependencies.serviceRoleKey || serviceRoleKey()
  const fetchImpl = dependencies.fetchImpl || fetch
  if (!(dependencies.baseUrl || baseUrl()) || !key) throw new Error("missing_supabase_service_role_env")

  const response = await fetchImpl(url, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`rest_failed:${response.status}:${text}`)
  }
  if (response.status === 204) return null
  return response.json()
}

export async function getCandidate(candidateId, dependencies = {}) {
  const rows = await fetchRest(`market_external_product_candidates?id=eq.${encodeURIComponent(candidateId)}&select=*`, {}, dependencies)
  const row = Array.isArray(rows) ? rows[0] : null
  if (!row) throw new Error(`candidate_not_found:${candidateId}`)
  return sanitizeExternalCandidateRecord(row)
}

export async function createPromotedAlias(candidate, productId, dependencies = {}) {
  const payload = buildExternalCandidatePromotion({
    candidate,
    product_id: productId,
  })
  const rows = await fetchRest(buildMarketProductAliasUpsertPath(), {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify([payload]),
  }, dependencies)
  return Array.isArray(rows) ? rows[0] || null : null
}

export function buildCandidateReviewUpdatePayload({
  candidate,
  status,
  notes,
  productId,
  promotedAliasId,
  now = new Date().toISOString(),
} = {}) {
  return {
    status,
    validation_notes: notes || candidate?.validation_notes || null,
    updated_at: now,
    last_seen_at: now,
    ...(productId ? { matched_product_id: productId } : {}),
    ...(promotedAliasId ? { promoted_alias_id: promotedAliasId } : {}),
  }
}

export async function updateCandidate(candidateId, payload, dependencies = {}) {
  const rows = await fetchRest(`market_external_product_candidates?id=eq.${encodeURIComponent(candidateId)}`, {
    method: "PATCH",
    headers: {
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  }, dependencies)
  return Array.isArray(rows) ? rows[0] || null : null
}

export async function runCli(argv = process.argv.slice(2), dependencies = {}) {
  const args = parseArgs(argv)
  if (args.help || !args.candidateId) {
    printHelp()
    if (!args.help) {
      process.exitCode = 1
    }
    return null
  }

  const candidate = await getCandidate(args.candidateId, dependencies)
  const productId = args.productId || candidate.matched_product_id || null

  if (args.promoteAlias) {
    if (!productId) {
      throw new Error("product_id_required_for_promotion")
    }
    if (args.status !== "validated") {
      throw new Error("promotion_requires_validated_status")
    }
  }

  const preview = {
    candidate,
    update_payload: buildCandidateReviewUpdatePayload({
      candidate,
      status: args.status,
      notes: args.notes,
      productId,
    }),
    promotion_target_product_id: productId,
    will_promote_alias: Boolean(args.promoteAlias),
  }
  console.log(JSON.stringify(preview, null, 2))

  if (args.dryRun) return preview

  let promotedAlias = null
  if (args.promoteAlias) {
    promotedAlias = await createPromotedAlias(candidate, productId, dependencies)
  }

  const updated = await updateCandidate(
    args.candidateId,
    buildCandidateReviewUpdatePayload({
      candidate,
      status: args.status,
      notes: args.notes,
      productId,
      promotedAliasId: promotedAlias?.id || null,
    }),
    dependencies,
  )

  console.log(JSON.stringify({
    updated,
    promoted_alias: promotedAlias,
  }, null, 2))

  return {
    updated,
    promotedAlias,
  }
}

const isDirectRun = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false

if (isDirectRun) {
  runCli().catch(error => {
    console.error("[market-external-review] failed", error)
    process.exitCode = 1
  })
}
