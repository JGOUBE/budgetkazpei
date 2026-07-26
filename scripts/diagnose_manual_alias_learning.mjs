import { randomUUID } from "node:crypto"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const DEFAULT_STORE_NAME = "E.Leclerc"
const DEFAULT_RAW_NAME = "TARAMA DEUFS CABIL,IOOG"
const DEFAULT_CORRECTED_NAME = "Tarama aux \u0153ufs de cabillaud 100 g"
const DEFAULT_TOTAL_AMOUNT = 66.19
const DEFAULT_TOTAL_PRICE = 2.01

function parseArgs(argv) {
  const args = {
    allowGlobal: false,
    createFixture: false,
    keepFixture: false,
    source: "user_manual_correction",
    storeName: DEFAULT_STORE_NAME,
    rawName: DEFAULT_RAW_NAME,
    correctedName: DEFAULT_CORRECTED_NAME,
    totalAmount: DEFAULT_TOTAL_AMOUNT,
    totalPrice: DEFAULT_TOTAL_PRICE,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]
    const next = argv[index + 1]
    if (current === "--receipt-item-id" && next) {
      args.receiptItemId = next
      index += 1
    } else if (current === "--user-id" && next) {
      args.userId = next
      index += 1
    } else if (current === "--store-name" && next) {
      args.storeName = next
      index += 1
    } else if (current === "--raw-name" && next) {
      args.rawName = next
      index += 1
    } else if (current === "--corrected-name" && next) {
      args.correctedName = next
      index += 1
    } else if (current === "--purchase-date" && next) {
      args.purchaseDate = next
      index += 1
    } else if (current === "--source" && next) {
      args.source = next
      index += 1
    } else if (current === "--total-amount" && next) {
      args.totalAmount = Number(next)
      index += 1
    } else if (current === "--total-price" && next) {
      args.totalPrice = Number(next)
      index += 1
    } else if (current === "--allow-global") {
      args.allowGlobal = true
    } else if (current === "--create-fixture") {
      args.createFixture = true
    } else if (current === "--keep-fixture") {
      args.keepFixture = true
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
node scripts/diagnose_manual_alias_learning.mjs [options]

Options:
  --receipt-item-id <uuid>   Diagnose an existing receipt item directly.
  --user-id <uuid>           User id used for auth.uid() simulation or fixture creation.
  --create-fixture           Create a temporary receipt + receipt_item before calling the learner.
  --keep-fixture             Keep the temporary fixture receipt instead of deleting it.
  --store-name <text>        Store name used for discovery or fixture creation.
  --raw-name <text>          OCR/raw product name used for discovery or fixture creation.
  --corrected-name <text>    Corrected product name used for discovery or fixture creation.
  --purchase-date <date>     Purchase date override (YYYY-MM-DD) for fixture creation.
  --total-amount <number>    Receipt total used for discovery or fixture creation.
  --total-price <number>     Item total price used for discovery or fixture creation.
  --source <text>            p_source passed to market_learn_alias_from_receipt_item.
  --allow-global             Pass p_allow_global=true to the learner RPC.
  --help                     Show this help.
`)
}

function sqlLiteral(value) {
  if (value == null) return "null"
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Invalid numeric value: ${value}`)
    return String(value)
  }
  if (typeof value === "boolean") return value ? "true" : "false"
  return `'${String(value).replace(/'/g, "''")}'`
}

function logStep(label, payload) {
  console.log(`\n[manual-alias-diagnose] ${label}`)
  if (payload !== undefined) {
    console.log(JSON.stringify(payload, null, 2))
  }
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
        if (escaping) {
          escaping = false
        } else if (char === "\\") {
          escaping = true
        } else if (char === "\"") {
          inString = false
        }
        continue
      }

      if (char === "\"") {
        inString = true
        continue
      }

      if (char === "{" || char === "[") {
        depth += 1
      } else if (char === "}" || char === "]") {
        depth -= 1
        if (depth === 0) {
          const candidate = source.slice(start, index + 1)
          try {
            return JSON.parse(candidate)
          } catch {
            break
          }
        }
      }
    }
  }

  throw new Error(`Unable to parse JSON from Supabase CLI output:\n${source}`)
}

function runLinkedSql(sql, label = "query") {
  const compactSql = String(sql || "").replace(/\s+/g, " ").trim()
  const result = spawnSync("powershell.exe", [
    "-NoProfile",
    "-Command",
    "$sql = $env:BKP_DIAG_SQL; supabase.cmd db query --linked --output json $sql",
  ], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
    env: {
      ...process.env,
      BKP_DIAG_SQL: compactSql,
    },
  })

  const stdout = String(result.stdout || "")
  const stderr = String(result.stderr || "")
  if (result.status !== 0) {
    throw new Error(`[${label}] supabase db query failed\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`)
  }

  return extractFirstJson(stdout || stderr)
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

function discoverExistingItem(args) {
  if (args.receiptItemId) {
    const result = runLinkedSql(`
select
  receipts.id as receipt_id,
  receipt_items.id as receipt_item_id,
  receipts.user_id,
  receipts.store_name,
  receipts.purchase_date,
  receipts.total_amount,
  receipt_items.ocr_name,
  receipt_items.corrected_name,
  receipt_items.name,
  receipt_items.total_price,
  receipt_items.unit_price,
  receipt_items.item_status,
  receipt_items.market_product_id
from public.receipt_items
join public.receipts on receipts.id = receipt_items.receipt_id
where receipt_items.id = ${sqlLiteral(args.receiptItemId)}
limit 1;
`, "discover_item_by_id")
    return oneRow(result, "discover_item_by_id")
  }

  const result = runLinkedSql(`
select
  receipts.id as receipt_id,
  receipt_items.id as receipt_item_id,
  receipts.user_id,
  receipts.store_name,
  receipts.purchase_date,
  receipts.total_amount,
  receipt_items.ocr_name,
  receipt_items.corrected_name,
  receipt_items.name,
  receipt_items.total_price,
  receipt_items.unit_price,
  receipt_items.item_status,
  receipt_items.market_product_id
from public.receipts
join public.receipt_items on receipt_items.receipt_id = receipts.id
where receipts.store_name = ${sqlLiteral(args.storeName)}
  and receipts.total_amount = ${sqlLiteral(args.totalAmount)}
  and coalesce(receipt_items.ocr_name, receipt_items.name, '') = ${sqlLiteral(args.rawName)}
order by
  case
    when receipt_items.corrected_name is not null
      and receipt_items.item_status in ('user_validated', 'trusted') then 0
    when receipt_items.corrected_name is not null then 1
    else 2
  end,
  receipts.created_at desc
limit 1;
`, "discover_item_by_signature")

  const rows = rowsFrom(result)
  return rows[0] || null
}

function createFixture(args) {
  if (!args.userId) {
    throw new Error("--user-id is required with --create-fixture")
  }

  const purchaseDate = args.purchaseDate || new Date().toISOString().slice(0, 10)
  const receiptId = randomUUID()

  const result = runLinkedSql(`
with inserted_receipt as (
  insert into public.receipts (
    id,
    user_id,
    store_name,
    merchant_name,
    normalized_store_name,
    purchase_date,
    total_amount,
    currency,
    ocr_status,
    validation_status
  )
  values (
    ${sqlLiteral(receiptId)},
    ${sqlLiteral(args.userId)},
    ${sqlLiteral(args.storeName)},
    ${sqlLiteral(args.storeName)},
    ${sqlLiteral("e.leclerc")},
    ${sqlLiteral(purchaseDate)},
    ${sqlLiteral(args.totalAmount)},
    'EUR',
    'success',
    'validated'
  )
  returning id, user_id, store_name, purchase_date, total_amount
),
inserted_item as (
  insert into public.receipt_items (
    receipt_id,
    user_id,
    name,
    ocr_name,
    corrected_name,
    normalized_name,
    quantity,
    unit,
    unit_price,
    total_price,
    category,
    item_status,
    line_type,
    review_status,
    confidence_score
  )
  select
    inserted_receipt.id,
    inserted_receipt.user_id,
    ${sqlLiteral(args.rawName)},
    ${sqlLiteral(args.rawName)},
    ${sqlLiteral(args.correctedName)},
    ${sqlLiteral(args.correctedName.toLowerCase())},
    1,
    'piece',
    ${sqlLiteral(args.totalPrice)},
    ${sqlLiteral(args.totalPrice)},
    'alimentaire',
    'user_validated',
    'product',
    'trusted',
    100
  from inserted_receipt
  returning id as receipt_item_id, receipt_id, user_id, name, ocr_name, corrected_name, total_price, unit_price, item_status, market_product_id
)
select
  inserted_receipt.id as receipt_id,
  inserted_item.receipt_item_id,
  inserted_item.user_id,
  inserted_receipt.store_name,
  inserted_receipt.purchase_date,
  inserted_receipt.total_amount,
  inserted_item.ocr_name,
  inserted_item.corrected_name,
  inserted_item.name,
  inserted_item.total_price,
  inserted_item.unit_price,
  inserted_item.item_status,
  inserted_item.market_product_id
from inserted_receipt
join inserted_item on inserted_item.receipt_id = inserted_receipt.id;
`, "create_fixture")

  return oneRow(result, "create_fixture")
}

function cleanupFixture(receiptId) {
  if (!receiptId) return
  runLinkedSql(`
delete from public.receipts
where id = ${sqlLiteral(receiptId)};
`, "cleanup_fixture")
}

function queryAuthContext(userId) {
  return oneRow(runLinkedSql(`
select
  set_config('request.jwt.claim.sub', ${sqlLiteral(userId)}, true) as configured_sub,
  auth.uid() as auth_uid;
`, "auth_context"), "auth_context")
}

function queryAliasCount({ rawName, correctedName, storeName }) {
  return oneRow(runLinkedSql(`
select count(*)::int as alias_count
from public.market_manual_product_aliases
where normalized_raw_label = public.market_normalize_manual_alias_text(${sqlLiteral(rawName)})
  and normalized_corrected_label = public.market_normalize_manual_alias_text(${sqlLiteral(correctedName)})
  and scope = 'chain'
  and store_chain_key = public.market_store_chain_key(${sqlLiteral(storeName)});
`, "alias_count"), "alias_count")
}

function queryAliasRows({ rawName, correctedName, storeName }) {
  return rowsFrom(runLinkedSql(`
select
  id,
  product_id,
  raw_label,
  corrected_label,
  normalized_raw_label,
  normalized_corrected_label,
  scope,
  store_chain_key,
  confidence,
  validation_count,
  created_at,
  updated_at
from public.market_manual_product_aliases
where normalized_raw_label = public.market_normalize_manual_alias_text(${sqlLiteral(rawName)})
  and normalized_corrected_label = public.market_normalize_manual_alias_text(${sqlLiteral(correctedName)})
  and scope = 'chain'
  and store_chain_key = public.market_store_chain_key(${sqlLiteral(storeName)})
order by updated_at desc, created_at desc
limit 5;
`, "alias_rows"))
}

function runLearner({ userId, receiptItemId, source, allowGlobal }) {
  return oneRow(runLinkedSql(`
select
  set_config('request.jwt.claim.sub', ${sqlLiteral(userId)}, true) as configured_sub,
  auth.uid() as auth_uid,
  public.market_learn_alias_from_receipt_item(
    ${sqlLiteral(receiptItemId)}::uuid,
    ${sqlLiteral(source)},
    ${sqlLiteral(allowGlobal)}
  ) as rpc_result;
`, "learn_alias"), "learn_alias")
}

function runResolver({ rawName, totalPrice, storeName, purchaseDate }) {
  return rowsFrom(runLinkedSql(`
select value
from jsonb_array_elements(
  public.market_resolve_products_with_learned_aliases(
    jsonb_build_array(
      jsonb_build_object(
        'index', 0,
        'raw_name', ${sqlLiteral(rawName)},
        'name', ${sqlLiteral(rawName)},
        'observed_price', ${sqlLiteral(totalPrice)},
        'quantity', 1,
        'store_name', ${sqlLiteral(storeName)},
        'observed_date', ${sqlLiteral(purchaseDate)}
      )
    )
  )
) as value;
`, "resolver_check"))
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printHelp()
    return
  }

  const createdFixtureIds = { receiptId: null }
  try {
    let item = null
    if (args.createFixture) {
      item = createFixture(args)
      createdFixtureIds.receiptId = item.receipt_id
      logStep("fixture_created", item)
    } else {
      item = discoverExistingItem(args)
      if (!item) {
        throw new Error("No matching receipt item found. Use --receipt-item-id or --create-fixture --user-id.")
      }
      logStep("existing_item_selected", item)
    }

    const userId = args.userId || item.user_id
    if (!userId) {
      throw new Error("Unable to determine user id for auth.uid() simulation")
    }

    const rawName = String(item.ocr_name || item.name || args.rawName || "").trim()
    const correctedName = String(item.corrected_name || args.correctedName || "").trim()
    if (!correctedName) {
      throw new Error("Selected receipt item has no corrected_name persisted yet")
    }

    logStep("candidate_snapshot", {
      receipt_item_id: item.receipt_item_id,
      receipt_id: item.receipt_id,
      user_id: userId,
      raw_name: rawName,
      previous_corrected_name: item.corrected_name || null,
      next_corrected_name: correctedName,
      shouldAttempt: rawName !== correctedName,
      skipReason: rawName === correctedName ? "corrected_matches_raw" : "",
      item_status: item.item_status || null,
      total_price: item.total_price || item.unit_price || null,
      total_amount: item.total_amount || null,
      purchase_date: item.purchase_date || null,
      store_name: item.store_name || null,
    })

    const authContext = queryAuthContext(userId)
    logStep("auth_context", {
      configured_sub: authContext.configured_sub,
      auth_uid: authContext.auth_uid,
      auth_uid_matches_user_id: String(authContext.auth_uid || "") === String(userId),
    })

    const beforeCount = queryAliasCount({
      rawName,
      correctedName,
      storeName: item.store_name || args.storeName,
    })
    logStep("alias_count_before", beforeCount)

    const learner = runLearner({
      userId,
      receiptItemId: item.receipt_item_id,
      source: args.source,
      allowGlobal: args.allowGlobal,
    })

    logStep("rpc_result", {
      configured_sub: learner.configured_sub,
      auth_uid: learner.auth_uid,
      http_status: 200,
      rpc_result: learner.rpc_result,
    })

    const afterCount = queryAliasCount({
      rawName,
      correctedName,
      storeName: item.store_name || args.storeName,
    })
    const aliasRows = queryAliasRows({
      rawName,
      correctedName,
      storeName: item.store_name || args.storeName,
    })
    logStep("alias_rows_after", {
      alias_count_before: beforeCount.alias_count,
      alias_count_after: afterCount.alias_count,
      alias_rows: aliasRows,
    })

    const resolverRows = runResolver({
      rawName,
      totalPrice: Number(item.total_price || item.unit_price || args.totalPrice || 0),
      storeName: item.store_name || args.storeName,
      purchaseDate: item.purchase_date || args.purchaseDate || new Date().toISOString().slice(0, 10),
    })
    logStep("resolver_result", resolverRows)

    const summary = {
      receipt_id: item.receipt_id,
      receipt_item_id: item.receipt_item_id,
      user_id: userId,
      rpc_result: learner.rpc_result,
      alias_count_before: beforeCount.alias_count,
      alias_count_after: afterCount.alias_count,
      resolver_result: resolverRows[0]?.value || null,
      created_fixture_receipt_id: createdFixtureIds.receiptId,
    }
    logStep("summary", summary)
  } finally {
    if (args.createFixture && createdFixtureIds.receiptId && !args.keepFixture) {
      cleanupFixture(createdFixtureIds.receiptId)
      logStep("fixture_deleted", { receipt_id: createdFixtureIds.receiptId })
    }
  }
}

await main()
