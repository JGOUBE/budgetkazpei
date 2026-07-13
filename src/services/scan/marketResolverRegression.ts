import { resolveMarketProducts, __marketProductResolverTestUtils } from "./marketProductResolver"
import { resolveMarketDisplayName } from "./marketDisplay"
import { sanitizeFinalReceiptItems } from "./scanEngine"
import { validateParsedReceipt } from "./receiptValidator"
import {
  isEligibleMarketReceiptItem,
  isResolvedMarketProduct,
} from "../../../supabase/functions/market-record-observations/marketRules"

type RegressionResult = {
  id: string
  passed: boolean
  expected: unknown
  actual: unknown
}

function assertEqual(id: string, actual: unknown, expected: unknown): RegressionResult {
  return {
    id,
    passed: JSON.stringify(actual) === JSON.stringify(expected),
    expected,
    actual,
  }
}

function pickStableItemFields(item: any) {
  return {
    name: item.name,
    ocr_name: item.ocr_name,
    corrected_name: item.corrected_name,
    total_price: item.total_price,
    unit_price: item.unit_price,
    quantity: item.quantity,
    promotion: item.promotion,
    confidence_score: item.confidence_score,
    item_status: item.item_status,
    review_status: item.review_status,
    needs_review: item.needs_review,
    status: item.status,
    raw_text: item.raw_text,
    source_line: item.source_line,
  }
}

function baseItem(overrides: Record<string, unknown> = {}) {
  return {
    name: "HUILE LESIEUR TOURNESOL",
    ocr_name: "3265471000110 *HUILE LESIEUR TOURNESOL",
    corrected_name: "HUILE LESIEUR TOURNESOL",
    barcode: "3265471000110",
    total_price: 2.79,
    unit_price: 2.79,
    quantity: 1,
    promotion: true,
    confidence_score: 92,
    item_status: "user_validated",
    review_status: "trusted",
    needs_review: false,
    status: "user_validated",
    raw_text: "(9) 3265471000110 *HUILE LESIEUR TOURNESOL",
    source_line: "(9) 3265471000110 *HUILE LESIEUR TOURNESOL",
    line_type: "product",
    ...overrides,
  }
}

function pouletItem(overrides: Record<string, unknown> = {}) {
  return {
    name: "POULET LE JAUNE",
    ocr_name: "POULET LE JAUNE",
    corrected_name: "POULET LE JAUNE",
    total_price: 7.69,
    unit_price: 7.69,
    quantity: 1,
    promotion: false,
    confidence_score: 91,
    item_status: "trusted",
    review_status: "trusted",
    needs_review: false,
    status: "trusted",
    raw_text: "POULET LE JAUNE 7.69 2",
    source_line: "POULET LE JAUNE 7.69 2",
    line_type: "product",
    ...overrides,
  }
}

function mockDeps({
  responseBody,
  rejectFetch = false,
  timeoutImmediately = false,
  responseDelayMs = 0,
  onFetch,
}: {
  responseBody?: Record<string, unknown>
  rejectFetch?: boolean
  timeoutImmediately?: boolean
  responseDelayMs?: number
  onFetch?: (url: string, init: any) => void
} = {}) {
  let timeoutMs: number | null = null
  let clearCalls = 0
  let aborted = false
  let fetchCalled = false
  const controller = {
    signal: { aborted: false },
    abort() {
      aborted = true
      this.signal.aborted = true
    },
  } as AbortController

  return {
    dependencies: {
      getSession: async () => timeoutImmediately
        ? new Promise(() => undefined)
        : { data: { session: { access_token: "test-token" } } },
      fetchImpl: async (url: any, init: any) => {
        fetchCalled = true
        onFetch?.(String(url), init)
        if (rejectFetch) throw new Error("edge_down")
        if (responseDelayMs > 0) {
          await new Promise(resolve => setTimeout(resolve, responseDelayMs))
        }
        return {
          ok: true,
          json: async () => responseBody || { items: [], resolved: 0, unresolved: 0 },
        } as Response
      },
      setTimeoutImpl: ((callback: () => void, ms: number) => {
        timeoutMs = ms
        if (timeoutImmediately) {
          callback()
          return 1 as any
        }
        return setTimeout(callback, ms) as any
      }) as typeof setTimeout,
      clearTimeoutImpl: ((timer: any) => {
        clearCalls += 1
        clearTimeout(timer)
      }) as typeof clearTimeout,
      createAbortController: () => controller,
      functionUrlImpl: () => "https://example.test/functions/v1/market-resolve-products",
      anonKeyImpl: () => "anon-test-key",
    },
    getState: () => ({ timeoutMs, aborted, fetchCalled, clearCalls }),
  }
}

async function resolveFixture(responseItem: Record<string, unknown>) {
  const deps = mockDeps({
    responseBody: {
      items: [responseItem],
      resolved: responseItem.market_matched ? 1 : 0,
      unresolved: responseItem.market_matched ? 0 : 1,
    },
  })
  return resolveMarketProducts([baseItem()], deps.dependencies)
}

export async function runMarketResolverRegressionFixtures(): Promise<RegressionResult[]> {
  const { applyMarketResolutions, buildMarketResolvePayload } = __marketProductResolverTestUtils
  const originalItem = baseItem()

  const matchedItems = applyMarketResolutions([originalItem], [{
    index: 0,
    market_product_id: "11111111-1111-4111-8111-111111111111",
    market_matched: true,
    market_match_type: "barcode_exact",
    market_match_confidence: 1,
    market_canonical_name: "Huile Lesieur tournesol",
    market_brand: "Lesieur",
    market_category: "epicerie",
    market_subcategory: "huiles",
    market_package_format: "1 l",
    total_price: 0,
    unit_price: 0,
    quantity: 99,
    item_status: "replaced",
    market_unmatched_reason: "ignored_by_front",
  }])

  const aliasResult = await resolveFixture({
    index: 0,
    market_product_id: "22222222-2222-4222-8222-222222222222",
    market_matched: true,
    market_match_type: "alias_exact",
    market_match_confidence: 1,
    market_canonical_name: "Huile Lesieur tournesol",
  })

  const normalizedResult = await resolveFixture({
    index: 0,
    market_product_id: "33333333-3333-4333-8333-333333333333",
    market_matched: true,
    market_match_type: "normalized_name_exact",
    market_match_confidence: 1,
    market_canonical_name: "Huile Lesieur tournesol",
  })

  const ambiguousAliasResult = await resolveFixture({
    index: 0,
    market_matched: false,
    market_unmatched_reason: "ambiguous_alias",
    market_match_type: "normalized_name_exact",
    market_product_id: "should-not-appear",
  })

  const ambiguousNameResult = await resolveFixture({
    index: 0,
    market_matched: false,
    market_unmatched_reason: "ambiguous_normalized_name",
  })

  const unknownResult = await resolveFixture({
    index: 0,
    market_matched: false,
    market_unmatched_reason: "not_found",
  })

  let capturedBody: any = null
  const payloadDeps = mockDeps({
    responseBody: { items: [], resolved: 0, unresolved: 0 },
    onFetch: (_url, init) => {
      capturedBody = JSON.parse(String(init.body || "{}"))
    },
  })
  await resolveMarketProducts([originalItem], payloadDeps.dependencies)

  const timeoutDeps = mockDeps({ timeoutImmediately: true })
  const timeoutResult = await resolveMarketProducts([originalItem], timeoutDeps.dependencies)
  const networkDeps = mockDeps({ rejectFetch: true })
  const networkResult = await resolveMarketProducts([originalItem], networkDeps.dependencies)
  const delayedPouletOriginal = pouletItem({ item_status: "user_validated", status: "user_validated" })
  const delayedWithinBudgetDeps = mockDeps({
    responseDelayMs: 1700,
    responseBody: {
      items: [{
        index: 0,
        market_product_id: "66666666-6666-4666-8666-666666666666",
        market_matched: true,
        market_match_type: "normalized_name_exact",
        market_match_confidence: 1,
        market_canonical_name: "Poulet Le Jaune",
        total_price: 0,
        quantity: 99,
        item_status: "replaced",
        ocr_name: "replaced",
      }],
      resolved: 1,
      unresolved: 0,
    },
  })
  const delayedWithinBudgetResult = await resolveMarketProducts([delayedPouletOriginal], delayedWithinBudgetDeps.dependencies)
  const delayedAfterBudgetDeps = mockDeps({
    responseDelayMs: 1900,
    responseBody: {
      items: [{
        index: 0,
        market_product_id: "77777777-7777-4777-8777-777777777777",
        market_matched: true,
        market_match_type: "normalized_name_exact",
        market_match_confidence: 1,
        market_canonical_name: "Poulet Le Jaune",
      }],
      resolved: 1,
      unresolved: 0,
    },
  })
  const delayedAfterBudgetResult = await resolveMarketProducts([delayedPouletOriginal], delayedAfterBudgetDeps.dependencies)

  const pouletOriginal = pouletItem()
  const pouletResolvedItems = applyMarketResolutions([pouletOriginal], [{
    index: 0,
    market_product_id: "55555555-5555-4555-8555-555555555555",
    market_matched: true,
    market_match_type: "normalized_name_exact",
    market_match_confidence: 1,
    market_canonical_name: "Poulet Le Jaune",
    market_category: "volaille",
  }])
  const pouletDisplay = resolveMarketDisplayName(pouletResolvedItems[0])
  const approximateItems = applyMarketResolutions([
    pouletItem({ name: "COMPUTE POMME", ocr_name: "COMPUTE POMME", corrected_name: "COMPUTE POMME", raw_text: "COMPUTE POMME 2.15", source_line: "COMPUTE POMME 2.15", total_price: 2.15, unit_price: 2.15 }),
    pouletItem({ name: "LENTILLES CUITES", ocr_name: "LENTILLES CUITES", corrected_name: "LENTILLES CUITES", raw_text: "LENTILLES CUITES 1.75", source_line: "LENTILLES CUITES 1.75", total_price: 1.75, unit_price: 1.75 }),
  ], [
    { index: 0, market_matched: false, market_unmatched_reason: "not_found" },
    { index: 1, market_matched: false, market_unmatched_reason: "not_found" },
  ])
  const sanitizedPoulet = sanitizeFinalReceiptItems(pouletResolvedItems, 7.69).items[0]
  const validationAfterMarket = validateParsedReceipt({
    total_amount: 7.69,
    items: [pouletResolvedItems[0]],
  })

  const eligibleCases = [
    ["trusted", isEligibleMarketReceiptItem(baseItem({ item_status: "trusted" })), false],
    ["detected", isEligibleMarketReceiptItem(baseItem({ item_status: "detected" })), false],
    ["a_verifier", isEligibleMarketReceiptItem(baseItem({ item_status: "a_verifier" })), false],
    ["rejected", isEligibleMarketReceiptItem(baseItem({ item_status: "rejected" })), false],
    ["user_validated_product", isEligibleMarketReceiptItem(baseItem()), true],
    ["service_line", isEligibleMarketReceiptItem(baseItem({ line_type: "payment" })), false],
    ["empty_name", isEligibleMarketReceiptItem(baseItem({ name: "", corrected_name: "" })), false],
    ["zero_price", isEligibleMarketReceiptItem(baseItem({ total_price: 0 })), false],
    ["negative_price", isEligibleMarketReceiptItem(baseItem({ total_price: -1 })), false],
    ["zero_quantity", isEligibleMarketReceiptItem(baseItem({ quantity: 0 })), false],
    ["negative_quantity", isEligibleMarketReceiptItem(baseItem({ quantity: -1 })), false],
  ]

  return [
    assertEqual(
      "market-resolver-keeps-existing-scanner-fields",
      pickStableItemFields(matchedItems[0]),
      pickStableItemFields(originalItem),
    ),
    assertEqual(
      "market-resolver-whitelists-only-market-fields",
      {
        stable: pickStableItemFields(matchedItems[0]),
        unknown_reason: matchedItems[0].market_unmatched_reason ?? null,
        product_id: matchedItems[0].market_product_id,
      },
      {
        stable: pickStableItemFields(originalItem),
        unknown_reason: null,
        product_id: "11111111-1111-4111-8111-111111111111",
      },
    ),
    assertEqual("market-resolver-alias-exact", aliasResult.items[0].market_match_type, "alias_exact"),
    assertEqual("market-resolver-normalized-name-exact", normalizedResult.items[0].market_match_type, "normalized_name_exact"),
    assertEqual(
      "market-resolver-ambiguous-alias-refused-without-fallback-fields",
      {
        matched: ambiguousAliasResult.items[0].market_matched,
        product_id: ambiguousAliasResult.items[0].market_product_id ?? null,
        match_type: ambiguousAliasResult.items[0].market_match_type ?? null,
        stable: pickStableItemFields(ambiguousAliasResult.items[0]),
      },
      {
        matched: false,
        product_id: null,
        match_type: null,
        stable: pickStableItemFields(originalItem),
      },
    ),
    assertEqual("market-resolver-ambiguous-normalized-name-refused", ambiguousNameResult.items[0].market_matched, false),
    assertEqual(
      "market-resolver-unknown-product-unchanged",
      {
        matched: unknownResult.items[0].market_matched,
        stable: pickStableItemFields(unknownResult.items[0]),
      },
      {
        matched: false,
        stable: pickStableItemFields(originalItem),
      },
    ),
    assertEqual(
      "market-resolver-payload-excludes-price-quantity-user-data",
      {
        payload: buildMarketResolvePayload([originalItem]),
        sent: capturedBody,
      },
      {
        payload: [{
          index: 0,
          raw_name: "HUILE LESIEUR TOURNESOL",
          barcode: "3265471000110",
        }],
        sent: {
          items: [{
            index: 0,
            raw_name: "HUILE LESIEUR TOURNESOL",
            barcode: "3265471000110",
          }],
        },
      },
    ),
    assertEqual(
      "market-resolver-timeout-1800ms-keeps-original-items",
      {
        timeoutMs: timeoutDeps.getState().timeoutMs,
        aborted: timeoutDeps.getState().aborted,
        fetchCalled: timeoutDeps.getState().fetchCalled,
        clearCalls: timeoutDeps.getState().clearCalls,
        stable: pickStableItemFields(timeoutResult.items[0]),
        timeoutBudget: timeoutResult.diagnostics.timeout_budget_ms,
      },
      {
        timeoutMs: 1800,
        aborted: true,
        fetchCalled: false,
        clearCalls: 1,
        stable: pickStableItemFields(originalItem),
        timeoutBudget: 1800,
      },
    ),
    assertEqual(
      "market-resolver-response-at-1700ms-applies-enrichment",
      {
        timeoutMs: delayedWithinBudgetDeps.getState().timeoutMs,
        aborted: delayedWithinBudgetDeps.getState().aborted,
        clearCalls: delayedWithinBudgetDeps.getState().clearCalls,
        stable: pickStableItemFields(delayedWithinBudgetResult.items[0]),
        market: {
          matched: delayedWithinBudgetResult.items[0].market_matched,
          canonical: delayedWithinBudgetResult.items[0].market_canonical_name,
          match_type: delayedWithinBudgetResult.items[0].market_match_type,
        },
        timeoutBudget: delayedWithinBudgetResult.diagnostics.timeout_budget_ms,
      },
      {
        timeoutMs: 1800,
        aborted: false,
        clearCalls: 1,
        stable: pickStableItemFields(delayedPouletOriginal),
        market: {
          matched: true,
          canonical: "Poulet Le Jaune",
          match_type: "normalized_name_exact",
        },
        timeoutBudget: 1800,
      },
    ),
    assertEqual(
      "market-resolver-response-after-1800ms-falls-back-unchanged",
      {
        timeoutMs: delayedAfterBudgetDeps.getState().timeoutMs,
        aborted: delayedAfterBudgetDeps.getState().aborted,
        clearCalls: delayedAfterBudgetDeps.getState().clearCalls,
        stable: pickStableItemFields(delayedAfterBudgetResult.items[0]),
        canonical: delayedAfterBudgetResult.items[0].market_canonical_name ?? null,
        diagnostics: {
          failed: delayedAfterBudgetResult.diagnostics.failed,
          timeout: delayedAfterBudgetResult.diagnostics.timeout,
          timeoutBudget: delayedAfterBudgetResult.diagnostics.timeout_budget_ms,
        },
      },
      {
        timeoutMs: 1800,
        aborted: true,
        clearCalls: 1,
        stable: pickStableItemFields(delayedPouletOriginal),
        canonical: null,
        diagnostics: {
          failed: true,
          timeout: true,
          timeoutBudget: 1800,
        },
      },
    ),
    assertEqual(
      "market-resolver-network-failure-keeps-original-items",
      pickStableItemFields(networkResult.items[0]),
      pickStableItemFields(originalItem),
    ),
    assertEqual(
      "market-resolver-poulet-exact-keeps-ocr-price-quantity-and-displays-canonical",
      {
        display: pouletDisplay,
        stable: pickStableItemFields(pouletResolvedItems[0]),
        market: {
          matched: pouletResolvedItems[0].market_matched,
          match_type: pouletResolvedItems[0].market_match_type,
          canonical: pouletResolvedItems[0].market_canonical_name,
        },
      },
      {
        display: {
          label: "Poulet Le Jaune",
          source: "market",
          marketRecognized: true,
          canonicalName: "Poulet Le Jaune",
        },
        stable: pickStableItemFields(pouletOriginal),
        market: {
          matched: true,
          match_type: "normalized_name_exact",
          canonical: "Poulet Le Jaune",
        },
      },
    ),
    assertEqual(
      "market-resolver-approximate-labels-remain-unmatched",
      approximateItems.map(item => ({
        name: item.name,
        matched: item.market_matched,
        canonical: item.market_canonical_name ?? null,
      })),
      [
        { name: "COMPUTE POMME", matched: false, canonical: null },
        { name: "LENTILLES CUITES", matched: false, canonical: null },
      ],
    ),
    assertEqual(
      "market-fields-survive-final-sanitization-and-validation",
      {
        sanitized: {
          matched: sanitizedPoulet.market_matched,
          canonical: sanitizedPoulet.market_canonical_name,
          price: sanitizedPoulet.total_price,
          quantity: sanitizedPoulet.quantity,
        },
        validation: validationAfterMarket.valid,
      },
      {
        sanitized: {
          matched: true,
          canonical: "Poulet Le Jaune",
          price: 7.69,
          quantity: 1,
        },
        validation: true,
      },
    ),
    assertEqual(
      "market-observation-eligibility-rules",
      Object.fromEntries(eligibleCases.map(([name, actual]) => [name, actual])),
      Object.fromEntries(eligibleCases.map(([name, _actual, expected]) => [name, expected])),
    ),
    assertEqual(
      "market-observation-unresolved-products-excluded",
      {
        unknown: isResolvedMarketProduct({ market_matched: false }),
        ambiguous: isResolvedMarketProduct({ market_matched: false, market_unmatched_reason: "ambiguous_alias" }),
        resolved: isResolvedMarketProduct({ market_matched: true, market_product_id: "44444444-4444-4444-8444-444444444444" }),
      },
      {
        unknown: false,
        ambiguous: false,
        resolved: true,
      },
    ),
  ]
}