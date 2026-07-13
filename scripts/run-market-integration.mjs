import { randomUUID } from "node:crypto"

const REQUIRED_ENV = [
  "BKP_MARKET_INTEGRATION_TESTS",
  "BKP_TEST_ALLOW_REMOTE_MUTATION",
  "BKP_TEST_SUPABASE_URL",
  "BKP_TEST_SUPABASE_ANON_KEY",
  "BKP_TEST_SUPABASE_SERVICE_ROLE_KEY",
  "BKP_TEST_USER_A_JWT",
  "BKP_TEST_USER_B_JWT",
  "BKP_TEST_MISSING_RECEIPT_ID",
]

const TEST_DATE = "2099-01-01"
const PRODUCT_NAME = "Poulet Le Jaune"
const OCR_NAME = "POULET LE JAUNE"

const SCENARIOS = [
  "missing JWT is rejected",
  "invalid JWT is rejected",
  "RPC execute is denied to authenticated",
  "user B gets same receipt_not_found response as a missing UUID",
  "existing E.Leclerc Les Casernes store is used",
  "existing Poulet Le Jaune product is used",
  "user A can sync owned receipt",
  "anonymized batch and observation are created",
  "correction replaces old observation",
  "item deletion removes anonymized observation and batch",
  "ticket deletion removes anonymized batch",
  "products aliases and stores are preserved",
]

const state = {
  storeId: null,
  productId: null,
  receiptId: null,
  receiptItemIds: [],
}

function missingEnv() {
  return REQUIRED_ENV.filter(name => !process.env[name])
}

function assertSafeTestTarget(url) {
  const value = String(url || "").toLowerCase()
  const local = value.includes("localhost") || value.includes("127.0.0.1")
  if (!local && process.env.BKP_TEST_ALLOW_REMOTE_MUTATION !== "true") {
    throw new Error("Remote mutation tests require BKP_TEST_ALLOW_REMOTE_MUTATION=true")
  }
}

function baseUrl() {
  return process.env.BKP_TEST_SUPABASE_URL.replace(/\/+$/, "")
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function filterValue(value) {
  return encodeURIComponent(String(value))
}

function decodeJwtSubject(jwt) {
  const payload = String(jwt || "").split(".")[1]
  if (!payload) throw new Error("test JWT does not contain a payload")
  const json = JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"))
  if (!json?.sub) throw new Error("test JWT does not contain a subject")
  return json.sub
}

async function restRequest(path, { method = "GET", serviceRole = false, jwt = "", body } = {}) {
  const credential = serviceRole ? process.env.BKP_TEST_SUPABASE_SERVICE_ROLE_KEY : process.env.BKP_TEST_SUPABASE_ANON_KEY
  const response = await fetch(`${baseUrl()}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: credential,
      Authorization: `Bearer ${serviceRole ? process.env.BKP_TEST_SUPABASE_SERVICE_ROLE_KEY : jwt}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await response.text()
  const json = text ? JSON.parse(text) : null
  return { status: response.status, json }
}

async function edgeRequest(functionName, jwt, body) {
  const response = await fetch(`${baseUrl()}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: process.env.BKP_TEST_SUPABASE_ANON_KEY,
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
    },
    body: JSON.stringify(body),
  })
  const json = await response.json().catch(() => ({}))
  return { status: response.status, json }
}

async function serviceInsert(table, body) {
  const result = await restRequest(`${table}?select=*`, { method: "POST", serviceRole: true, body })
  if (result.status < 200 || result.status >= 300 || !Array.isArray(result.json) || !result.json[0]) {
    throw new Error(`insert failed for ${table}`)
  }
  return result.json[0]
}

async function servicePatch(table, query, body) {
  const result = await restRequest(`${table}?${query}&select=*`, { method: "PATCH", serviceRole: true, body })
  if (result.status < 200 || result.status >= 300) throw new Error(`patch failed for ${table}`)
  return Array.isArray(result.json) ? result.json : []
}

async function serviceDelete(table, query) {
  const result = await restRequest(`${table}?${query}`, { method: "DELETE", serviceRole: true })
  if (result.status < 200 || result.status >= 300) throw new Error(`delete failed for ${table}`)
}

async function serviceSelect(table, query) {
  const result = await restRequest(`${table}?${query}`, { serviceRole: true })
  if (result.status < 200 || result.status >= 300 || !Array.isArray(result.json)) {
    throw new Error(`select failed for ${table}`)
  }
  return result.json
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`)
}

async function countRows(table, query) {
  const rows = await serviceSelect(table, `select=id&${query}`)
  return rows.length
}

async function testBatches() {
  return serviceSelect(
    "market_seed_batches",
    `select=id,batch_key,source,observed_date&source=eq.receipt_scan_anonymized&store_id=eq.${state.storeId}&observed_date=eq.${TEST_DATE}&order=created_at.desc`,
  )
}

async function observationRows() {
  return serviceSelect(
    "market_price_observations",
    `select=id,batch_id,price,quantity,batch_item_key,source&store_id=eq.${state.storeId}&product_id=eq.${state.productId}&observed_date=eq.${TEST_DATE}&order=price.asc`,
  )
}

async function insertReceiptItem(price) {
  const userId = decodeJwtSubject(process.env.BKP_TEST_USER_A_JWT)
  const row = await serviceInsert("receipt_items", {
    receipt_id: state.receiptId,
    user_id: userId,
    name: OCR_NAME,
    ocr_name: OCR_NAME,
    corrected_name: PRODUCT_NAME,
    normalized_name: normalizeText(PRODUCT_NAME),
    quantity: 1,
    unit: "piece",
    unit_price: price,
    total_price: price,
    category: "alimentaire",
    item_status: "user_validated",
    line_type: "product",
    confidence_score: 100,
  })
  state.receiptItemIds.push(row.id)
  return row
}

async function setupFixture() {
  const userId = decodeJwtSubject(process.env.BKP_TEST_USER_A_JWT)
  const stores = await serviceSelect(
    "market_stores",
    "select=id&normalized_store_name=eq.e.leclerc&normalized_city=eq.saint%20pierre",
  )
  assertEqual(stores.length, 1, "E.Leclerc Les Casernes store must be unique")
  state.storeId = stores[0].id

  const products = await serviceSelect(
    "market_products",
    `select=id&normalized_name=eq.${filterValue(normalizeText(PRODUCT_NAME))}`,
  )
  assertEqual(products.length, 1, "Poulet Le Jaune product must be unique")
  state.productId = products[0].id

  const receipt = await serviceInsert("receipts", {
    user_id: userId,
    store_name: "E.Leclerc Les Casernes",
    merchant_name: "E.Leclerc Les Casernes",
    normalized_store_name: "e.leclerc",
    store_location: "Saint-Pierre",
    purchase_date: TEST_DATE,
    total_amount: 7.69,
    currency: "EUR",
    ocr_status: "success",
    validation_status: "validated",
    date_status: "detected",
  })
  state.receiptId = receipt.id
  await insertReceiptItem(7.69)
}

async function cleanupTestBatches() {
  if (!state.storeId) return
  const batches = await testBatches().catch(() => [])
  for (const batch of batches) {
    await serviceDelete("market_price_observations", `batch_id=eq.${batch.id}`).catch(() => {})
    await serviceDelete("market_seed_batches", `id=eq.${batch.id}`).catch(() => {})
  }
}

async function cleanupFixture() {
  await cleanupTestBatches()
  if (state.receiptId) await serviceDelete("receipt_items", `receipt_id=eq.${state.receiptId}`).catch(() => {})
  if (state.receiptId) await serviceDelete("receipts", `id=eq.${state.receiptId}`).catch(() => {})
}

function sameNotFound(left, right) {
  return left.status === 404
    && right.status === 404
    && left.json?.error === "receipt_not_found"
    && right.json?.error === "receipt_not_found"
}

async function assertAuthenticatedRpcDenied(functionName, body) {
  const result = await restRequest(`rpc/${functionName}`, {
    method: "POST",
    jwt: process.env.BKP_TEST_USER_A_JWT,
    body,
  })
  assert(result.status < 200 || result.status >= 300, `${functionName} was executable by authenticated`)
}

async function runScenario(name, fn, results) {
  await fn()
  results.push({ name, status: "TESTED_AND_PASSED" })
  console.log(`[market-integration] OK ${name}`)
}

async function syncOwnedReceipt() {
  return edgeRequest("market-record-observations", process.env.BKP_TEST_USER_A_JWT, {
    receipt_id: state.receiptId,
    action: "sync",
  })
}

async function main() {
  const missing = missingEnv()
  if (missing.length > 0 || process.env.BKP_MARKET_INTEGRATION_TESTS !== "true") {
    console.log("[market-integration] PREPARED BUT NOT EXECUTED")
    console.log("[market-integration] Missing explicit test env:", missing.join(", ") || "BKP_MARKET_INTEGRATION_TESTS=true")
    console.log("[market-integration] Scenarios prepared:")
    for (const scenario of SCENARIOS) console.log(`- ${scenario}`)
    process.exitCode = 2
    return
  }

  assertSafeTestTarget(process.env.BKP_TEST_SUPABASE_URL)

  const results = []
  await setupFixture()

  try {
    await runScenario("missing JWT is rejected", async () => {
      const result = await edgeRequest("market-record-observations", "", {
        receipt_id: state.receiptId,
        action: "sync",
      })
      assertEqual(result.status, 401, "missing JWT status")
      assertEqual(result.json?.error, "missing_authorization", "missing JWT error")
    }, results)

    await runScenario("invalid JWT is rejected", async () => {
      const result = await edgeRequest("market-record-observations", "invalid.jwt.value", {
        receipt_id: state.receiptId,
        action: "sync",
      })
      assertEqual(result.status, 401, "invalid JWT status")
      assertEqual(result.json?.error, "invalid_authorization", "invalid JWT error")
    }, results)

    await runScenario("RPC execute is denied to authenticated", async () => {
      await assertAuthenticatedRpcDenied("market_resolve_exact_products", { p_items: [] })
      await assertAuthenticatedRpcDenied("market_sync_anonymized_batch", {
        p_batch_key: "receipt_scan_anonymized:test",
        p_store_id: state.storeId,
        p_observed_date: TEST_DATE,
        p_items: [],
      })
      await assertAuthenticatedRpcDenied("market_delete_anonymized_batch", { p_batch_key: "receipt_scan_anonymized:test" })
    }, results)

    await runScenario("user B gets same receipt_not_found response as a missing UUID", async () => {
      const missingReceipt = await edgeRequest("market-record-observations", process.env.BKP_TEST_USER_B_JWT, {
        receipt_id: process.env.BKP_TEST_MISSING_RECEIPT_ID,
        action: "sync",
      })
      const crossUserReceipt = await edgeRequest("market-record-observations", process.env.BKP_TEST_USER_B_JWT, {
        receipt_id: state.receiptId,
        action: "sync",
      })
      assert(sameNotFound(missingReceipt, crossUserReceipt), "cross-user receipt oracle response differs")
    }, results)

    await runScenario("existing E.Leclerc Les Casernes store is used", async () => {
      assert(Boolean(state.storeId), "store id missing")
    }, results)

    await runScenario("existing Poulet Le Jaune product is used", async () => {
      assert(Boolean(state.productId), "product id missing")
      assert((await countRows("market_product_aliases", `product_id=eq.${state.productId}`)) >= 1, "product alias missing")
    }, results)

    await runScenario("user A can sync owned receipt", async () => {
      const result = await syncOwnedReceipt()
      assertEqual(result.status, 200, "user A sync status")
      assertEqual(result.json?.ok, true, "user A sync ok")
      assertEqual(result.json?.observations_created, 1, "user A sync observations")
    }, results)

    await runScenario("anonymized batch and observation are created", async () => {
      const batches = await testBatches()
      const rows = await observationRows()
      assertEqual(batches.length, 1, "test batch count")
      assertEqual(rows.length, 1, "test observation count")
      assert(String(batches[0].batch_key || "").startsWith("receipt_scan_anonymized:"), "batch key prefix mismatch")
      assert(String(rows[0].batch_item_key || "").startsWith("receipt_item_anonymized:"), "batch item key prefix mismatch")
      assertEqual(Number(rows[0].price), 7.69, "observation price")
      assertEqual(Number(rows[0].quantity), 1, "observation quantity")
    }, results)

    await runScenario("correction replaces old observation", async () => {
      await servicePatch("receipt_items", `id=eq.${state.receiptItemIds[0]}`, {
        unit_price: 8.19,
        total_price: 8.19,
      })
      const result = await syncOwnedReceipt()
      assertEqual(result.status, 200, "correction sync status")
      const rows = await observationRows()
      assertEqual(rows.length, 1, "replacement observation count")
      assertEqual(Number(rows[0].price), 8.19, "replacement price")
    }, results)

    await runScenario("item deletion removes anonymized observation and batch", async () => {
      await serviceDelete("receipt_items", `id=eq.${state.receiptItemIds[0]}`)
      const result = await syncOwnedReceipt()
      assertEqual(result.status, 200, "item deletion sync status")
      assertEqual(result.json?.batch_deleted, true, "item deletion batch deleted")
      assertEqual((await observationRows()).length, 0, "item deletion observation count")
      assertEqual((await testBatches()).length, 0, "item deletion batch count")
    }, results)

    await runScenario("ticket deletion removes anonymized batch", async () => {
      state.receiptItemIds = []
      await insertReceiptItem(7.69)
      await syncOwnedReceipt()
      assertEqual((await observationRows()).length, 1, "delete action setup observation count")
      const result = await edgeRequest("market-record-observations", process.env.BKP_TEST_USER_A_JWT, {
        receipt_id: state.receiptId,
        action: "delete",
      })
      assertEqual(result.status, 200, "delete action status")
      assertEqual(result.json?.batch_deleted, true, "delete action batch deleted")
      assertEqual((await observationRows()).length, 0, "delete action observation count")
      assertEqual((await testBatches()).length, 0, "delete action batch count")
    }, results)

    await runScenario("products aliases and stores are preserved", async () => {
      assertEqual(await countRows("market_stores", `id=eq.${state.storeId}`), 1, "store preserved")
      assertEqual(await countRows("market_products", `id=eq.${state.productId}`), 1, "product preserved")
      assert((await countRows("market_product_aliases", `product_id=eq.${state.productId}`)) >= 1, "alias preserved")
    }, results)

    console.log(`[market-integration] ${results.length} scenario(s) passed`)
  } finally {
    await cleanupFixture()
  }
}

await main()
