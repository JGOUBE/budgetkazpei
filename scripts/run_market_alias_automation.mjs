import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { prepareAutomationBatch } from "./prepare_market_alias_automation_batch.mjs"
import { normalizeAutomationStoreChain } from "./marketAliasAutomationRules.mjs"

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

function safePart(value = "") {
  return String(value || "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "market-alias-automation"
}

function parseArgs(argv = []) {
  const args = {
    limit: 50,
    offset: 0,
    concurrency: 2,
    delayMs: 250,
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
    } else if (current === "--batch-id" && next) {
      args.batchId = next
      index += 1
    } else if (current === "--concurrency" && next) {
      args.concurrency = Math.max(1, Math.min(2, Number(next) || 2))
      index += 1
    } else if (current === "--delay-ms" && next) {
      args.delayMs = Math.max(0, Number(next) || 250)
      index += 1
    } else if (current === "--apply-library" || current === "--apply-staging") {
      throw new Error("phase_1_is_dry_run_only")
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
  npm.cmd run market:aliases:auto -- \
    --store-chain "e leclerc" \
    --limit 30 \
    --batch-id alias-auto-001

Phase 1 :
- lecture Supabase uniquement ;
- sÃ©lection dÃ©dupliquÃ©e ;
- enrichissement et classement automatique ;
- rapport dry-run ;
- aucune Ã©criture distante.
`.trim())
}

function timestampId() {
  return new Date().toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z")
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printHelp()
    return
  }

  const chain = normalizeAutomationStoreChain(args.storeChain)
  if (!chain) throw new Error("store_chain_required")

  const batchId = args.batchId || `alias-auto-${safePart(chain)}-${timestampId()}`
  const inputPath = path.join(REPO_ROOT, "reports", `${safePart(batchId)}-input.json`)
  const reportPath = path.join(REPO_ROOT, "reports", `${safePart(batchId)}.json`)

  const prepared = prepareAutomationBatch({
    storeChain: chain,
    limit: args.limit,
    offset: args.offset,
    output: inputPath,
  })

  if (!prepared.rows.length) {
    console.log("[market-alias-automation] aucun libellÃ© inconnu sÃ©lectionnÃ©")
    return
  }

  console.log(
    `[market-alias-automation] ${prepared.rows.length} libellÃ©(s) prÃ©parÃ©(s), lancement du classement dry-run...`,
  )

  const commandArgs = [
    path.join(REPO_ROOT, "scripts", "enrich_market_alias_candidates.mjs"),
    "--from-file",
    inputPath,
    "--store-chain",
    chain,
    "--limit",
    String(prepared.rows.length),
    "--offset",
    "0",
    "--batch-id",
    batchId,
    "--dry-run",
    "--report",
    reportPath,
    "--concurrency",
    String(args.concurrency),
    "--delay-ms",
    String(args.delayMs),
  ]

  const result = spawnSync(process.execPath, commandArgs, {
    cwd: REPO_ROOT,
    stdio: "inherit",
    windowsHide: true,
  })

  if (result.status !== 0) {
    throw new Error(`enrichment_dry_run_failed:${result.status ?? "unknown"}`)
  }

  console.log("")
  console.log("[market-alias-automation] terminÃ© sans Ã©criture Supabase")
  console.log(`[market-alias-automation] rapport : ${path.relative(REPO_ROOT, reportPath)}`)
}

main().catch(error => {
  console.error("[market-alias-automation] failed", error)
  process.exitCode = 1
})