import { ReceiptScannerApiError, scanLongReceiptWithApi, scanSingleReceiptWithApi } from "./receiptScannerApi"
import {
  canOfferLegacyFallback,
  mapPythonScanToDraft,
} from "./receiptScannerEngine"
import {
  createPythonScanPersistenceState,
  persistPythonScanResult,
} from "./pythonReceiptPersistence"
import type { ReceiptScanResponse } from "./receiptScannerTypes"

type RegressionResult = {
  id: string
  passed: boolean
  expected?: unknown
  actual?: unknown
}

function pass(id: string): RegressionResult {
  return { id, passed: true }
}

function fail(id: string, expected: unknown, actual: unknown): RegressionResult {
  return { id, passed: false, expected, actual }
}

function assertEqual(id: string, actual: unknown, expected: unknown): RegressionResult {
  return Object.is(actual, expected) ? pass(id) : fail(id, expected, actual)
}

function assertTrue(id: string, actual: unknown): RegressionResult {
  return actual === true ? pass(id) : fail(id, true, actual)
}

function assertFalse(id: string, actual: unknown): RegressionResult {
  return actual === false ? pass(id) : fail(id, false, actual)
}

function fakeFile(name: string, options: { type?: string, bytes?: BlobPart[], lastModified?: number } = {}) {
  return new File(options.bytes || ["fake-image"], name, {
    type: options.type || "image/jpeg",
    lastModified: options.lastModified || 1000,
  })
}

function fakeSession(token = "test-access-token") {
  return async () => ({ data: { session: { access_token: token } } })
}

function responseFor(status: ReceiptScanResponse["status"]): ReceiptScanResponse {
  return {
    scan_id: `scan-${status}`,
    mode: "single",
    status,
    exploitable: status !== "scan_not_exploitable",
    should_record_budget: status !== "scan_not_exploitable",
    budget_amount: status === "scan_not_exploitable" ? null : 12.34,
    article_data_mode: status === "trusted" ? "full" : status === "budget_ok_articles_partial" ? "partial" : "blocked",
    should_feed_courses: status === "trusted",
    should_feed_market_database: status === "trusted",
    should_feed_verified_articles: status === "trusted",
    requires_user_validation: status !== "trusted",
    unattributed_amount: status === "budget_ok_articles_partial" ? 1.11 : null,
    receipt: {
      store_name: "Demo Store",
      store_location: "Saint-Leu",
      receipt_date: "2026-07-17",
      receipt_time: "12:00",
      declared_item_count: 1,
      counted_quantity: 1,
      product_line_count: 1,
      items_total: 12.34,
      total: status === "scan_not_exploitable" ? null : 12.34,
    },
    items: status === "scan_not_exploitable" ? [] : [{
      raw_name: "RIZ TEST 1KG",
      canonical_name: "RIZ TEST 1KG",
      quantity: 1,
      unit_price: 12.34,
      total_price: 12.34,
      item_type: "standard",
      ocr_confidence: status === "trusted" ? 0.94 : 0.61,
      needs_review: status !== "trusted",
      eligible_for_courses: status === "trusted",
      eligible_for_market_database: status === "trusted",
    }],
    warnings: [],
    reasons: [],
    diagnostics: {
      engine: "receipt-scanner",
      elapsed_seconds: 0.2,
      token_count: 42,
    },
  }
}

function okFetch(payload: ReceiptScanResponse, sink: any[] = []) {
  return async (url: RequestInfo | URL, init?: RequestInit) => {
    sink.push({ url: String(url), init })
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  }
}

function errorFetch(code: string, technical = false, status = 422) {
  return async () => new Response(JSON.stringify({
    error: {
      code,
      message: `simulated ${code}`,
      retryable: true,
      technical,
    },
  }), {
    status,
    headers: { "content-type": "application/json" },
  })
}

function invalidJsonFetch(payload: any, status = 200) {
  return async () => new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  })
}

function createPersistenceMocks(options: { failAt?: string, delayCreate?: boolean } = {}) {
  const calls: Record<string, any[]> = {
    createReceipt: [],
    upsertReceiptTransaction: [],
    validateReceipt: [],
    syncShoppingItemsFromReceipt: [],
    syncAnonymizedMarketReceipt: [],
    createScanMetric: [],
  }
  let receiptIndex = 0
  const maybeFail = (step: string) => {
    if (options.failAt === step) throw new Error(`simulated_${step}_failure`)
  }
  const waitCreate = () => options.delayCreate
    ? new Promise(resolve => setTimeout(resolve, 10))
    : Promise.resolve()

  return {
    calls,
    services: {
      createReceipt: async (args: any) => {
        calls.createReceipt.push(args)
        maybeFail("createReceipt")
        await waitCreate()
        receiptIndex += 1
        return { id: `receipt-${receiptIndex}`, ...args.draft }
      },
      upsertReceiptTransaction: async (args: any) => {
        calls.upsertReceiptTransaction.push(args)
        maybeFail("upsertReceiptTransaction")
        return { transaction: { id: `transaction-${calls.upsertReceiptTransaction.length}` }, created: true, updated: false, skipReason: "" }
      },
      validateReceipt: async (args: any) => {
        calls.validateReceipt.push(args)
        maybeFail("validateReceipt")
        return { id: args.receiptId, transaction_id: args.transactionId, ...args.draft }
      },
      syncShoppingItemsFromReceipt: async (args: any) => {
        calls.syncShoppingItemsFromReceipt.push(args)
        maybeFail("syncShoppingItemsFromReceipt")
        return (args.items || []).map((item: any, index: number) => ({ id: `shopping-${index + 1}`, ...item }))
      },
      syncAnonymizedMarketReceipt: async (receiptId: string) => {
        calls.syncAnonymizedMarketReceipt.push({ receiptId })
        maybeFail("syncAnonymizedMarketReceipt")
        return { ok: true }
      },
      createScanMetric: async (args: any) => {
        calls.createScanMetric.push(args)
        maybeFail("createScanMetric")
        return { id: `metric-${calls.createScanMetric.length}` }
      },
      now: () => 1000,
    },
  }
}

export async function runReceiptScannerFrontRegressionFixtures(): Promise<RegressionResult[]> {
  const results: RegressionResult[] = []

  const singleCalls: any[] = []
  await scanSingleReceiptWithApi(fakeFile("single.jpg"), {
    apiUrl: "https://scanner.local",
    getSession: fakeSession(),
    fetchImpl: okFetch(responseFor("trusted"), singleCalls) as typeof fetch,
  })
  results.push(assertEqual("single-endpoint", singleCalls[0]?.url, "https://scanner.local/scan/single"))
  results.push(assertEqual("single-auth-header", singleCalls[0]?.init?.headers?.Authorization, "Bearer test-access-token"))
  results.push(assertTrue("single-form-image", singleCalls[0]?.init?.body instanceof FormData && singleCalls[0].init.body.has("image")))
  results.push(assertEqual("single-no-secret-header", singleCalls[0]?.init?.headers?.["x-jwt-secret"], undefined))

  const longCalls: any[] = []
  await scanLongReceiptWithApi({ top: fakeFile("top.jpg"), bottom: fakeFile("bottom.jpg") }, {
    apiUrl: "https://scanner.local/",
    getSession: fakeSession("long-token"),
    fetchImpl: okFetch({ ...responseFor("trusted"), mode: "long_receipt" }, longCalls) as typeof fetch,
  })
  const longForm = longCalls[0]?.init?.body
  results.push(assertEqual("long-endpoint", longCalls[0]?.url, "https://scanner.local/scan/long-receipt"))
  results.push(assertEqual("long-auth-header", longCalls[0]?.init?.headers?.Authorization, "Bearer long-token"))
  results.push(assertTrue("long-form-top-bottom", longForm instanceof FormData && longForm.has("top_image") && longForm.has("bottom_image")))

  try {
    await scanSingleReceiptWithApi(fakeFile("no-session.jpg"), {
      apiUrl: "https://scanner.local",
      getSession: async () => ({ data: { session: null } }),
      fetchImpl: okFetch(responseFor("trusted")) as typeof fetch,
    })
    results.push(fail("auth-required-without-token", "ReceiptScannerApiError", "no error"))
  } catch (error) {
    results.push(assertEqual("auth-required-without-token", (error as ReceiptScannerApiError).scanError?.code, "authentication_required"))
  }

  try {
    await scanSingleReceiptWithApi(fakeFile("network.jpg"), {
      apiUrl: "https://scanner.local",
      getSession: fakeSession(),
      fetchImpl: (async () => {
        throw new TypeError("network down")
      }) as typeof fetch,
    })
    results.push(fail("network-error-classified", "network_error", "no error"))
  } catch (error) {
    results.push(assertEqual("network-error-classified", (error as ReceiptScannerApiError).scanError?.code, "network_error"))
    results.push(assertTrue("network-error-can-offer-legacy", canOfferLegacyFallback(error)))
  }

  try {
    await scanSingleReceiptWithApi(fakeFile("quality.jpg"), {
      apiUrl: "https://scanner.local",
      getSession: fakeSession(),
      fetchImpl: errorFetch("image_quality_failed", false) as typeof fetch,
    })
    results.push(fail("business-error-no-legacy", "image_quality_failed", "no error"))
  } catch (error) {
    results.push(assertEqual("business-error-code", (error as ReceiptScannerApiError).scanError?.code, "image_quality_failed"))
    results.push(assertEqual("business-error-no-legacy", canOfferLegacyFallback(error), false))
  }

  try {
    await scanSingleReceiptWithApi(fakeFile("busy.jpg"), {
      apiUrl: "https://scanner.local",
      getSession: fakeSession(),
      fetchImpl: errorFetch("scanner_busy", true, 503) as typeof fetch,
    })
    results.push(fail("technical-error-legacy-choice", "scanner_busy", "no error"))
  } catch (error) {
    results.push(assertEqual("technical-error-code", (error as ReceiptScannerApiError).scanError?.code, "scanner_busy"))
    results.push(assertTrue("technical-error-legacy-choice", canOfferLegacyFallback(error)))
  }

  const localValidationSink: any[] = []
  try {
    await scanSingleReceiptWithApi(fakeFile("receipt.txt", { type: "text/plain" }), {
      apiUrl: "https://scanner.local",
      getSession: fakeSession(),
      fetchImpl: okFetch(responseFor("trusted"), localValidationSink) as typeof fetch,
    })
    results.push(fail("invalid-mime-blocked-before-network", "invalid_file_type", "no error"))
  } catch (error) {
    results.push(assertEqual("invalid-mime-blocked-before-network", (error as ReceiptScannerApiError).scanError?.code, "invalid_file_type"))
    results.push(assertEqual("invalid-mime-no-network", localValidationSink.length, 0))
  }

  try {
    await scanSingleReceiptWithApi(fakeFile("empty.jpg", { bytes: [] }), {
      apiUrl: "https://scanner.local",
      getSession: fakeSession(),
      fetchImpl: okFetch(responseFor("trusted")) as typeof fetch,
    })
    results.push(fail("empty-image-blocked", "invalid_image", "no error"))
  } catch (error) {
    results.push(assertEqual("empty-image-blocked", (error as ReceiptScannerApiError).scanError?.code, "invalid_image"))
  }

  try {
    await scanSingleReceiptWithApi(fakeFile("huge.jpg", { bytes: [new Uint8Array(12 * 1024 * 1024 + 1)] }), {
      apiUrl: "https://scanner.local",
      getSession: fakeSession(),
      fetchImpl: okFetch(responseFor("trusted")) as typeof fetch,
    })
    results.push(fail("oversized-image-blocked", "file_too_large", "no error"))
  } catch (error) {
    results.push(assertEqual("oversized-image-blocked", (error as ReceiptScannerApiError).scanError?.code, "file_too_large"))
  }

  try {
    await scanLongReceiptWithApi({ top: null as unknown as File, bottom: fakeFile("bottom.jpg") }, {
      apiUrl: "https://scanner.local",
      getSession: fakeSession(),
      fetchImpl: okFetch(responseFor("trusted")) as typeof fetch,
    })
    results.push(fail("long-missing-top-blocked", "invalid_file", "no error"))
  } catch (error) {
    results.push(assertEqual("long-missing-top-blocked", (error as ReceiptScannerApiError).scanError?.code, "invalid_file"))
  }

  try {
    const same = fakeFile("same.jpg")
    await scanLongReceiptWithApi({ top: same, bottom: same }, {
      apiUrl: "https://scanner.local",
      getSession: fakeSession(),
      fetchImpl: okFetch(responseFor("trusted")) as typeof fetch,
    })
    results.push(fail("long-identical-photos-blocked", "images_identical", "no error"))
  } catch (error) {
    results.push(assertEqual("long-identical-photos-blocked", (error as ReceiptScannerApiError).scanError?.code, "images_identical"))
  }

  try {
    await scanLongReceiptWithApi({
      top: fakeFile("bottom.jpg", { lastModified: 2000 }),
      bottom: fakeFile("top.jpg", { lastModified: 3000 }),
    }, {
      apiUrl: "https://scanner.local",
      getSession: fakeSession(),
      fetchImpl: errorFetch("images_order_invalid", false) as typeof fetch,
    })
    results.push(fail("long-reversed-order-business-error", "images_order_invalid", "no error"))
  } catch (error) {
    results.push(assertEqual("long-reversed-order-business-error", (error as ReceiptScannerApiError).scanError?.code, "images_order_invalid"))
    results.push(assertFalse("long-reversed-no-legacy", canOfferLegacyFallback(error)))
  }

  try {
    await scanLongReceiptWithApi({
      top: fakeFile("top-overlap.jpg", { lastModified: 4000 }),
      bottom: fakeFile("bottom-overlap.jpg", { lastModified: 5000 }),
    }, {
      apiUrl: "https://scanner.local",
      getSession: fakeSession(),
      fetchImpl: errorFetch("overlap_not_found", false) as typeof fetch,
    })
    results.push(fail("long-overlap-missing-business-error", "overlap_not_found", "no error"))
  } catch (error) {
    results.push(assertEqual("long-overlap-missing-business-error", (error as ReceiptScannerApiError).scanError?.code, "overlap_not_found"))
    results.push(assertFalse("long-overlap-no-legacy", canOfferLegacyFallback(error)))
  }

  try {
    await scanSingleReceiptWithApi(fakeFile("timeout.jpg"), {
      apiUrl: "https://scanner.local",
      getSession: fakeSession(),
      fetchImpl: (async () => {
        throw new DOMException("aborted", "AbortError")
      }) as typeof fetch,
    })
    results.push(fail("timeout-error-classified", "processing_timeout", "no error"))
  } catch (error) {
    results.push(assertEqual("timeout-error-classified", (error as ReceiptScannerApiError).scanError?.code, "processing_timeout"))
    results.push(assertTrue("timeout-can-offer-legacy", canOfferLegacyFallback(error)))
  }

  try {
    await scanSingleReceiptWithApi(fakeFile("invalid-response.jpg"), {
      apiUrl: "https://scanner.local",
      getSession: fakeSession(),
      fetchImpl: invalidJsonFetch({ ok: true }) as typeof fetch,
    })
    results.push(fail("invalid-response-blocked", "invalid_response", "no error"))
  } catch (error) {
    results.push(assertEqual("invalid-response-blocked", (error as ReceiptScannerApiError).scanError?.code, "invalid_response"))
  }

  try {
    await scanSingleReceiptWithApi(fakeFile("sanitized.jpg"), {
      apiUrl: "https://scanner.local",
      getSession: fakeSession(),
      fetchImpl: errorFetch("authentication_invalid", false, 401) as typeof fetch,
    })
    results.push(fail("backend-message-sanitized", "safe message", "no error"))
  } catch (error) {
    const message = String((error as ReceiptScannerApiError).scanError?.message || "")
    results.push(assertEqual("backend-message-sanitized", message.includes("simulated authentication_invalid"), false))
  }

  const trusted = mapPythonScanToDraft(responseFor("trusted"))
  results.push(assertEqual("trusted-status-map", trusted.scan_status, "budget_ok_articles_ok"))
  results.push(assertEqual("trusted-local-pending", trusted.python_scan_pending_save, true))
  results.push(assertEqual("trusted-courses-feed", trusted.smart_shopping_safe, true))

  const partial = mapPythonScanToDraft(responseFor("budget_ok_articles_partial"))
  results.push(assertEqual("partial-status-map", partial.scan_status, "budget_ok_articles_partial"))
  results.push(assertEqual("partial-courses-blocked", partial.smart_shopping_safe, false))
  results.push(assertEqual("partial-unattributed", partial.python_scan_decision.unattributed_amount, 1.11))

  const discountedLongResponse: ReceiptScanResponse = {
    ...responseFor("budget_ok_articles_partial"),
    mode: "long_receipt",
    budget_amount: 73.99,
    unattributed_amount: 0.2,
    receipt: {
      ...responseFor("budget_ok_articles_partial").receipt,
      declared_item_count: 33,
      counted_quantity: 33,
      product_line_count: 32,
      items_total: 74.04,
      total: 73.99,
      article_total: 74.24,
      immediate_discount_total: 0.25,
      payable_total: 73.99,
    },
  }
  const discountedLongDraft = mapPythonScanToDraft(discountedLongResponse)
  results.push(assertEqual("discounted-long-budget-total", discountedLongDraft.total_amount, 73.99))
  results.push(assertEqual("discounted-long-printed-total", discountedLongDraft.parser_debug.printed_total, 74.24))
  results.push(assertEqual("discounted-long-unattributed", discountedLongDraft.python_scan_decision.unattributed_amount, 0.2))
  results.push(assertEqual("discounted-long-no-courses", discountedLongDraft.smart_shopping_safe, false))

  const needsReview = mapPythonScanToDraft(responseFor("needs_review"))
  results.push(assertEqual("needs-review-status-map", needsReview.scan_status, "budget_needs_review"))
  results.push(assertEqual("needs-review-total-review", needsReview.total_needs_review, false))

  const notExploitable = mapPythonScanToDraft(responseFor("scan_not_exploitable"))
  results.push(assertEqual("not-exploitable-status-map", notExploitable.scan_status, "rejected_scan_not_exploitable"))
  results.push(assertEqual("not-exploitable-no-items", notExploitable.items.length, 0))

  const trustedPersistenceMocks = createPersistenceMocks()
  const trustedDraft = mapPythonScanToDraft(responseFor("trusted"))
  const trustedPersisted = await persistPythonScanResult({
    userId: "user-1",
    draft: trustedDraft,
    items: trustedDraft.items,
    scanMetrics: { provider: "python_receipt_scanner" },
    state: createPythonScanPersistenceState(),
    services: trustedPersistenceMocks.services,
  })
  results.push(assertEqual("persist-trusted-status", trustedPersisted.status, "saved"))
  results.push(assertEqual("persist-trusted-one-ticket", trustedPersistenceMocks.calls.createReceipt.length, 1))
  results.push(assertEqual("persist-trusted-one-transaction", trustedPersistenceMocks.calls.upsertReceiptTransaction.length, 1))
  results.push(assertEqual("persist-trusted-items-saved", trustedPersistenceMocks.calls.validateReceipt[0]?.items?.length, 1))
  results.push(assertEqual("persist-trusted-shopping-fed", trustedPersistenceMocks.calls.syncShoppingItemsFromReceipt.length, 1))
  results.push(assertEqual("persist-trusted-market-service-only", trustedPersistenceMocks.calls.syncAnonymizedMarketReceipt.length, 1))
  results.push(assertEqual("persist-trusted-not-user-validated", trustedPersistenceMocks.calls.validateReceipt[0]?.items?.[0]?.item_status, "trusted"))

  const partialResponse = {
    ...responseFor("budget_ok_articles_partial"),
    budget_amount: 10.5,
    unattributed_amount: 1.84,
  }
  const partialPersistenceMocks = createPersistenceMocks()
  const partialDraft = mapPythonScanToDraft(partialResponse)
  const partialPersisted = await persistPythonScanResult({
    userId: "user-1",
    draft: partialDraft,
    items: partialDraft.items,
    action: "total_only",
    state: createPythonScanPersistenceState(),
    services: partialPersistenceMocks.services,
  })
  results.push(assertEqual("persist-partial-status", partialPersisted.status, "saved"))
  results.push(assertEqual("persist-partial-budget-amount", partialPersistenceMocks.calls.upsertReceiptTransaction[0]?.draft?.total_amount, 10.5))
  results.push(assertEqual("persist-partial-items-kept", partialPersistenceMocks.calls.validateReceipt[0]?.items?.length, 1))
  results.push(assertEqual("persist-partial-items-review", partialPersistenceMocks.calls.validateReceipt[0]?.items?.[0]?.item_status, "a_verifier"))
  results.push(assertEqual("persist-partial-no-shopping", partialPersistenceMocks.calls.syncShoppingItemsFromReceipt.length, 0))
  results.push(assertEqual("persist-partial-no-market", partialPersistenceMocks.calls.syncAnonymizedMarketReceipt.length, 0))
  results.push(assertTrue("persist-partial-unattributed-warning", partialPersisted.warnings.includes("unattributed_amount_not_persisted_schema_unknown")))

  const discountedPersistenceMocks = createPersistenceMocks()
  const discountedPersisted = await persistPythonScanResult({
    userId: "user-1",
    draft: discountedLongDraft,
    items: discountedLongDraft.items,
    action: "total_only",
    state: createPythonScanPersistenceState(),
    services: discountedPersistenceMocks.services,
  })
  results.push(assertEqual("persist-discounted-long-status", discountedPersisted.status, "saved"))
  results.push(assertEqual("persist-discounted-long-budget-amount", discountedPersistenceMocks.calls.upsertReceiptTransaction[0]?.draft?.total_amount, 73.99))
  results.push(assertEqual("persist-discounted-long-no-shopping", discountedPersistenceMocks.calls.syncShoppingItemsFromReceipt.length, 0))
  results.push(assertEqual("persist-discounted-long-no-market", discountedPersistenceMocks.calls.syncAnonymizedMarketReceipt.length, 0))

  const needsReviewPersistenceMocks = createPersistenceMocks()
  const needsReviewPersisted = await persistPythonScanResult({
    userId: "user-1",
    draft: mapPythonScanToDraft(responseFor("needs_review")),
    items: needsReview.items,
    state: createPythonScanPersistenceState(),
    services: needsReviewPersistenceMocks.services,
  })
  results.push(assertEqual("persist-needs-review-skipped", needsReviewPersisted.status, "skipped"))
  results.push(assertEqual("persist-needs-review-no-ticket", needsReviewPersistenceMocks.calls.createReceipt.length, 0))
  results.push(assertEqual("persist-needs-review-no-transaction", needsReviewPersistenceMocks.calls.upsertReceiptTransaction.length, 0))
  results.push(assertEqual("persist-needs-review-no-downstream", needsReviewPersistenceMocks.calls.syncShoppingItemsFromReceipt.length + needsReviewPersistenceMocks.calls.syncAnonymizedMarketReceipt.length, 0))

  const correctedNeedsReviewMocks = createPersistenceMocks()
  const correctedNeedsReviewDraft = {
    ...mapPythonScanToDraft(responseFor("needs_review")),
    total_amount: 12.34,
    total_needs_review: false,
  }
  const correctedNeedsReviewPersisted = await persistPythonScanResult({
    userId: "user-1",
    draft: correctedNeedsReviewDraft,
    items: correctedNeedsReviewDraft.items.map((item: any) => ({
      ...item,
      name: item.name || "RIZ TEST 1KG",
      total_price: 12.34,
      item_status: "user_validated",
      status: "user_validated",
      review_status: "trusted",
      needs_review: false,
    })),
    action: "review",
    state: createPythonScanPersistenceState(),
    services: correctedNeedsReviewMocks.services,
  })
  results.push(assertEqual("persist-corrected-needs-review-saved", correctedNeedsReviewPersisted.status, "saved"))
  results.push(assertEqual("persist-corrected-needs-review-budget", correctedNeedsReviewMocks.calls.upsertReceiptTransaction.length, 1))
  results.push(assertEqual("persist-corrected-needs-review-no-shopping", correctedNeedsReviewMocks.calls.syncShoppingItemsFromReceipt.length, 0))
  results.push(assertEqual("persist-corrected-needs-review-no-market", correctedNeedsReviewMocks.calls.syncAnonymizedMarketReceipt.length, 0))
  results.push(assertTrue("persist-corrected-needs-review-warning", correctedNeedsReviewPersisted.warnings.includes("needs_review_saved_after_explicit_validation")))

  const contradictedTrustedMocks = createPersistenceMocks()
  const contradictedTrustedDraft = {
    ...mapPythonScanToDraft(responseFor("trusted")),
    python_scan_decision: {
      ...mapPythonScanToDraft(responseFor("trusted")).python_scan_decision,
      should_record_budget: false,
    },
  }
  const contradictedTrustedPersisted = await persistPythonScanResult({
    userId: "user-1",
    draft: contradictedTrustedDraft,
    items: contradictedTrustedDraft.items,
    state: createPythonScanPersistenceState(),
    services: contradictedTrustedMocks.services,
  })
  results.push(assertEqual("persist-trusted-contradicted-skipped", contradictedTrustedPersisted.status, "skipped"))
  results.push(assertEqual("persist-trusted-contradicted-no-write", contradictedTrustedMocks.calls.createReceipt.length, 0))

  const notExploitablePersistenceMocks = createPersistenceMocks()
  const notExploitablePersisted = await persistPythonScanResult({
    userId: "user-1",
    draft: notExploitable,
    items: notExploitable.items,
    state: createPythonScanPersistenceState(),
    services: notExploitablePersistenceMocks.services,
  })
  results.push(assertEqual("persist-not-exploitable-skipped", notExploitablePersisted.status, "skipped"))
  results.push(assertEqual("persist-not-exploitable-no-write", notExploitablePersistenceMocks.calls.createReceipt.length, 0))

  const doubleClickMocks = createPersistenceMocks({ delayCreate: true })
  const doubleClickState = createPythonScanPersistenceState()
  const doubleClickDraft = mapPythonScanToDraft(responseFor("trusted"))
  const [firstDoubleClick, secondDoubleClick] = await Promise.all([
    persistPythonScanResult({
      userId: "user-1",
      draft: doubleClickDraft,
      items: doubleClickDraft.items,
      state: doubleClickState,
      services: doubleClickMocks.services,
    }),
    persistPythonScanResult({
      userId: "user-1",
      draft: doubleClickDraft,
      items: doubleClickDraft.items,
      state: doubleClickState,
      services: doubleClickMocks.services,
    }),
  ])
  results.push(assertEqual("persist-double-click-one-ticket", doubleClickMocks.calls.createReceipt.length, 1))
  results.push(assertEqual("persist-double-click-one-transaction", doubleClickMocks.calls.upsertReceiptTransaction.length, 1))
  results.push(assertTrue("persist-double-click-one-saved", [firstDoubleClick.status, secondDoubleClick.status].includes("saved")))
  results.push(assertTrue("persist-double-click-one-ignored", [firstDoubleClick.status, secondDoubleClick.status].includes("duplicate_ignored")))

  const failingMocks = createPersistenceMocks({ failAt: "validateReceipt" })
  const failingDraft = mapPythonScanToDraft(responseFor("trusted"))
  const failedPersistence = await persistPythonScanResult({
    userId: "user-1",
    draft: failingDraft,
    items: failingDraft.items,
    state: createPythonScanPersistenceState(),
    services: failingMocks.services,
  })
  results.push(assertEqual("persist-error-status", failedPersistence.status, "failed"))
  results.push(assertEqual("persist-error-no-shopping-after-failure", failingMocks.calls.syncShoppingItemsFromReceipt.length, 0))
  results.push(assertEqual("persist-error-no-market-after-failure", failingMocks.calls.syncAnonymizedMarketReceipt.length, 0))
  results.push(assertEqual("persist-error-no-success-metric", failingMocks.calls.createScanMetric.length, 0))

  results.push(assertFalse("fallback-after-python-success-not-offered", canOfferLegacyFallback(trustedPersisted)))

  return results
}
