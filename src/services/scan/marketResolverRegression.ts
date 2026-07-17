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

function pickProtectedItemFields(item: any) {
  return {
    ocr_name: item.ocr_name,
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

function productItem(
  name: string,
  price: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    name,
    ocr_name: name,
    corrected_name: name,
    total_price: price,
    unit_price: price,
    quantity: 1,
    promotion: false,
    confidence_score: 91,
    item_status: "trusted",
    review_status: "trusted",
    needs_review: false,
    status: "trusted",
    raw_text: `${name} ${price.toFixed(2)}`,
    source_line: `${name} ${price.toFixed(2)}`,
    line_type: "product",
    ...overrides,
  }
}

function pouletItem(overrides: Record<string, unknown> = {}) {
  return productItem("POULET LE JAUNE", 7.69, {
    raw_text: "POULET LE JAUNE 7.69 2",
    source_line: "POULET LE JAUNE 7.69 2",
    ...overrides,
  })
}

function mockDeps({
  responseBody,
  rejectFetch = false,
  timeoutImmediately = false,
  responseDelayMs = 0,
  onFetch,
  extraDependencies = {},
}: {
  responseBody?: Record<string, unknown>
  rejectFetch?: boolean
  timeoutImmediately?: boolean
  responseDelayMs?: number
  onFetch?: (url: string, init: any) => void
  extraDependencies?: Record<string, unknown>
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
          json: async () => responseBody || {
            items: [],
            resolved: 0,
            exact: 0,
            contextual: 0,
            alternate: 0,
            unresolved: 0,
          },
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
      ...extraDependencies,
    },
    getState: () => ({ timeoutMs, aborted, fetchCalled, clearCalls }),
  }
}

async function resolveFixture(responseItem: Record<string, unknown>) {
  const deps = mockDeps({
    responseBody: {
      items: [responseItem],
      resolved: responseItem.market_matched ? 1 : 0,
      exact: responseItem.market_matched ? 1 : 0,
      contextual: 0,
      alternate: 0,
      unresolved: responseItem.market_matched ? 0 : 1,
    },
  })
  return resolveMarketProducts([baseItem()], deps.dependencies)
}

export async function runMarketResolverRegressionFixtures(): Promise<RegressionResult[]> {
  const {
    applyMarketResolutions,
    buildLocalOcrNameCandidates,
    buildMarketResolvePayload,
  } = __marketProductResolverTestUtils

  const originalItem = baseItem()
  const matchedItems = applyMarketResolutions([originalItem], [{
    index: 0,
    market_product_id: "11111111-1111-4111-8111-111111111111",
    market_matched: true,
    market_match_type: "barcode_exact",
    market_match_confidence: 1,
    market_match_input_source: "barcode",
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
    market_match_input_source: "primary_vision",
    market_canonical_name: "Huile Lesieur tournesol",
  })

  const normalizedResult = await resolveFixture({
    index: 0,
    market_product_id: "33333333-3333-4333-8333-333333333333",
    market_matched: true,
    market_match_type: "normalized_name_exact",
    market_match_confidence: 1,
    market_match_input_source: "primary_vision",
    market_canonical_name: "Huile Lesieur tournesol",
  })

  const ambiguousAliasResult = await resolveFixture({
    index: 0,
    market_matched: false,
    market_unmatched_reason: "ambiguous_alias",
    market_match_type: "normalized_name_exact",
    market_product_id: "should-not-appear",
  })

  const unknownResult = await resolveFixture({
    index: 0,
    market_matched: false,
    market_unmatched_reason: "not_found",
  })

  const ticketItems = [
    productItem("TOMATODI NAT", 2.23),
    productItem("COMPOTE POMME", 0.94),
    productItem("LENTILLES CUITES", 1.09),
    pouletItem(),
  ]
  const localOcrText = [
    "TOMALOULT NAT SX2906 re ee",
    "PAIN MIE SAND CFLIET YAH 2.68 2",
    "BURGER CURCUMA X4 2.60 2",
    "COMPUTE POMKE 41006 0.94 2",
    "STICKS SALES 1.48 2",
    "WACED LEGUMES 1.00 1",
    "LENT ILLES CUIS1,2550 1,09 2",
    "POULET LE JAUNE CDOR 7.69 2",
  ].join("\n")
  const localCandidates = buildLocalOcrNameCandidates(ticketItems, localOcrText)

  let capturedExactBody: any = null
  const exactPayloadDeps = mockDeps({
    responseBody: { items: [], resolved: 0, exact: 0, contextual: 0, alternate: 0, unresolved: 0 },
    onFetch: (_url, init) => {
      capturedExactBody = JSON.parse(String(init.body || "{}"))
    },
  })
  await resolveMarketProducts([originalItem], exactPayloadDeps.dependencies)

  let capturedContextBody: any = null
  const contextualPayloadDeps = mockDeps({
    responseBody: { items: [], resolved: 0, exact: 0, contextual: 0, alternate: 0, unresolved: 0 },
    onFetch: (_url, init) => {
      capturedContextBody = JSON.parse(String(init.body || "{}"))
    },
    extraDependencies: {
      context: {
        store_name: "E.Leclerc",
        store_city: "Saint-Pierre",
        observed_date: "2026-07-07",
      },
      localOcrText,
    },
  })
  await resolveMarketProducts(ticketItems, contextualPayloadDeps.dependencies)

  const exactTimeoutDeps = mockDeps({ timeoutImmediately: true })
  const exactTimeoutResult = await resolveMarketProducts([originalItem], exactTimeoutDeps.dependencies)

  const contextualTimeoutDeps = mockDeps({
    timeoutImmediately: true,
    extraDependencies: {
      context: { store_name: "E.Leclerc", store_city: "Saint-Pierre" },
      localOcrText,
    },
  })
  const contextualTimeoutResult = await resolveMarketProducts(
    [ticketItems[0]],
    contextualTimeoutDeps.dependencies,
  )

  const networkDeps = mockDeps({ rejectFetch: true })
  const networkResult = await resolveMarketProducts([originalItem], networkDeps.dependencies)

  const compoteOriginal = productItem("COMPOTE POMME", 0.94)
  const compoteResolved = applyMarketResolutions([compoteOriginal], [{
    index: 0,
    market_product_id: "44444444-4444-4444-8444-444444444444",
    market_matched: true,
    market_match_type: "alias_exact",
    market_match_confidence: 1,
    market_match_input_source: "primary_vision",
    market_canonical_name: "Compote de pomme 4 x 100 g",
  }])[0]

  const lentillesOriginal = productItem("LENTILLES CUITES", 1.09)
  const lentillesResolved = applyMarketResolutions([lentillesOriginal], [{
    index: 0,
    market_product_id: "55555555-5555-4555-8555-555555555555",
    market_matched: true,
    market_match_type: "alias_exact",
    market_match_confidence: 1,
    market_match_input_source: "primary_vision",
    market_canonical_name: "Lentilles cuisinées 265 g",
  }])[0]

  const pouletOriginal = pouletItem()
  const pouletResolved = applyMarketResolutions([pouletOriginal], [{
    index: 0,
    market_product_id: "66666666-6666-4666-8666-666666666666",
    market_matched: true,
    market_match_type: "normalized_name_exact",
    market_match_confidence: 1,
    market_match_input_source: "primary_vision",
    market_canonical_name: "Poulet Le Jaune",
    market_category: "volaille",
  }])[0]

  const tomatodiOriginal = productItem("TOMATODI NAT", 2.23)
  const tomatodiResolved = applyMarketResolutions([tomatodiOriginal], [{
    index: 0,
    market_product_id: "77777777-7777-4777-8777-777777777777",
    market_matched: true,
    market_match_type: "contextual_same_store_alt_ocr",
    market_match_confidence: 0.86,
    market_match_input_source: "alternate_ocr",
    market_canonical_name: "Tomacouli Nature 3 x 200 g",
  }])[0]

  const unmatchedWithAlternate = applyMarketResolutions([compoteOriginal], [{
    index: 0,
    market_matched: false,
    market_unmatched_reason: "not_found",
  }])[0]

  const pouletDisplay = resolveMarketDisplayName(pouletResolved)
  const sanitizedPoulet = sanitizeFinalReceiptItems([pouletResolved], 7.69).items[0]
  const validationAfterMarket = validateParsedReceipt({
    total_amount: 7.69,
    items: [pouletResolved],
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
      "market-resolver-canonical-replacement-preserves-ocr-and-financial-fields",
      {
        name: matchedItems[0].name,
        corrected_name: matchedItems[0].corrected_name,
        protected: pickProtectedItemFields(matchedItems[0]),
      },
      {
        name: "Huile Lesieur tournesol",
        corrected_name: "Huile Lesieur tournesol",
        protected: pickProtectedItemFields(originalItem),
      },
    ),
    assertEqual(
      "market-resolver-whitelists-only-market-fields",
      {
        product_id: matchedItems[0].market_product_id,
        ignored_reason: matchedItems[0].market_unmatched_reason ?? null,
        price: matchedItems[0].total_price,
        quantity: matchedItems[0].quantity,
        status: matchedItems[0].item_status,
      },
      {
        product_id: "11111111-1111-4111-8111-111111111111",
        ignored_reason: null,
        price: 2.79,
        quantity: 1,
        status: "user_validated",
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
        protected: pickProtectedItemFields(ambiguousAliasResult.items[0]),
      },
      {
        matched: false,
        product_id: null,
        match_type: null,
        protected: pickProtectedItemFields(originalItem),
      },
    ),
    assertEqual(
      "market-resolver-unknown-product-unchanged",
      {
        matched: unknownResult.items[0].market_matched,
        name: unknownResult.items[0].name,
        protected: pickProtectedItemFields(unknownResult.items[0]),
      },
      {
        matched: false,
        name: originalItem.name,
        protected: pickProtectedItemFields(originalItem),
      },
    ),
    assertEqual(
      "market-resolver-basic-payload-excludes-context-price-and-alternate-names",
      {
        payload: buildMarketResolvePayload([originalItem]),
        sent: capturedExactBody,
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
      "market-resolver-local-ocr-candidates-are-generic-and-per-item",
      localCandidates.map(names => names.map(name => name.toUpperCase())),
      [
        ["TOMALOULT NAT SX2906 RE EE", "TOMALOULT NAT"],
        ["COMPUTE POMKE 41006", "COMPUTE POMKE"],
        ["LENT ILLES CUIS 50", "LENT ILLES CUIS"],
        ["POULET LE JAUNE CDOR", "POULET JAUNE CDOR"],
      ],
    ),
    assertEqual(
      "market-resolver-contextual-payload-sends-only-safe-candidates-price-and-store",
      capturedContextBody,
      {
        items: [
          {
            index: 0,
            raw_name: "TOMATODI NAT",
            barcode: null,
            observed_price: 2.23,
            brand: "",
            package_format: "",
            alternate_names: ["TOMALOULT NAT SX2906 re ee", "TOMALOULT NAT"],
          },
          {
            index: 1,
            raw_name: "COMPOTE POMME",
            barcode: null,
            observed_price: 0.94,
            brand: "",
            package_format: "",
            alternate_names: ["COMPUTE POMKE 41006", "COMPUTE POMKE"],
          },
          {
            index: 2,
            raw_name: "LENTILLES CUITES",
            barcode: null,
            observed_price: 1.09,
            brand: "",
            package_format: "",
            alternate_names: ["LENT ILLES CUIS 50", "LENT ILLES CUIS"],
          },
          {
            index: 3,
            raw_name: "POULET LE JAUNE",
            barcode: null,
            observed_price: 7.69,
            brand: "",
            package_format: "",
            alternate_names: ["POULET LE JAUNE CDOR", "POULET JAUNE CDOR"],
          },
        ],
        context: {
          store_name: "E.Leclerc",
          store_city: "Saint-Pierre",
          observed_date: "2026-07-07",
        },
      },
    ),
    assertEqual(
      "market-resolver-exact-timeout-remains-1800ms",
      {
        timeoutMs: exactTimeoutDeps.getState().timeoutMs,
        aborted: exactTimeoutDeps.getState().aborted,
        fetchCalled: exactTimeoutDeps.getState().fetchCalled,
        timeoutBudget: exactTimeoutResult.diagnostics.timeout_budget_ms,
      },
      {
        timeoutMs: 1800,
        aborted: true,
        fetchCalled: false,
        timeoutBudget: 1800,
      },
    ),
    assertEqual(
      "market-resolver-contextual-timeout-is-4500ms",
      {
        timeoutMs: contextualTimeoutDeps.getState().timeoutMs,
        aborted: contextualTimeoutDeps.getState().aborted,
        fetchCalled: contextualTimeoutDeps.getState().fetchCalled,
        timeoutBudget: contextualTimeoutResult.diagnostics.timeout_budget_ms,
      },
      {
        timeoutMs: 4500,
        aborted: true,
        fetchCalled: false,
        timeoutBudget: 4500,
      },
    ),
    assertEqual(
      "market-resolver-network-failure-keeps-original-items",
      {
        name: networkResult.items[0].name,
        protected: pickProtectedItemFields(networkResult.items[0]),
      },
      {
        name: originalItem.name,
        protected: pickProtectedItemFields(originalItem),
      },
    ),
    assertEqual(
      "market-resolver-compote-primary-exact-protected-from-local-ocr-regression",
      {
        name: compoteResolved.name,
        ocr_name: compoteResolved.ocr_name,
        match_type: compoteResolved.market_match_type,
        input_source: compoteResolved.market_match_input_source,
        price: compoteResolved.total_price,
      },
      {
        name: "Compote de pomme 4 x 100 g",
        ocr_name: "COMPOTE POMME",
        match_type: "alias_exact",
        input_source: "primary_vision",
        price: 0.94,
      },
    ),
    assertEqual(
      "market-resolver-lentilles-primary-exact-protected",
      {
        name: lentillesResolved.name,
        ocr_name: lentillesResolved.ocr_name,
        match_type: lentillesResolved.market_match_type,
        price: lentillesResolved.total_price,
      },
      {
        name: "Lentilles cuisinées 265 g",
        ocr_name: "LENTILLES CUITES",
        match_type: "alias_exact",
        price: 1.09,
      },
    ),
    assertEqual(
      "market-resolver-poulet-primary-exact-protected",
      {
        display: pouletDisplay,
        name: pouletResolved.name,
        ocr_name: pouletResolved.ocr_name,
        price: pouletResolved.total_price,
        quantity: pouletResolved.quantity,
      },
      {
        display: {
          label: "Poulet Le Jaune",
          source: "market",
          marketRecognized: true,
          canonicalName: "Poulet Le Jaune",
        },
        name: "Poulet Le Jaune",
        ocr_name: "POULET LE JAUNE",
        price: 7.69,
        quantity: 1,
      },
    ),
    assertEqual(
      "market-resolver-tomatodi-can-use-alternate-ocr-only-after-server-match",
      {
        name: tomatodiResolved.name,
        corrected_name: tomatodiResolved.corrected_name,
        ocr_name: tomatodiResolved.ocr_name,
        match_type: tomatodiResolved.market_match_type,
        input_source: tomatodiResolved.market_match_input_source,
        price: tomatodiResolved.total_price,
      },
      {
        name: "Tomacouli Nature 3 x 200 g",
        corrected_name: "Tomacouli Nature 3 x 200 g",
        ocr_name: "TOMATODI NAT",
        match_type: "contextual_same_store_alt_ocr",
        input_source: "alternate_ocr",
        price: 2.23,
      },
    ),
    assertEqual(
      "market-resolver-unmatched-alternate-never-overwrites-primary-name",
      {
        name: unmatchedWithAlternate.name,
        corrected_name: unmatchedWithAlternate.corrected_name,
        ocr_name: unmatchedWithAlternate.ocr_name,
        matched: unmatchedWithAlternate.market_matched,
      },
      {
        name: "COMPOTE POMME",
        corrected_name: "COMPOTE POMME",
        ocr_name: "COMPOTE POMME",
        matched: false,
      },
    ),
    assertEqual(
      "market-fields-survive-final-sanitization-and-validation",
      {
        sanitized: {
          matched: sanitizedPoulet.market_matched,
          canonical: sanitizedPoulet.market_canonical_name,
          name: sanitizedPoulet.name,
          price: sanitizedPoulet.total_price,
          quantity: sanitizedPoulet.quantity,
        },
        validation: validationAfterMarket.valid,
      },
      {
        sanitized: {
          matched: true,
          canonical: "Poulet Le Jaune",
          name: "Poulet Le Jaune",
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
        ambiguous: isResolvedMarketProduct({
          market_matched: false,
          market_unmatched_reason: "ambiguous_contextual_match",
        }),
        resolved: isResolvedMarketProduct({
          market_matched: true,
          market_product_id: "88888888-8888-4888-8888-888888888888",
        }),
      },
      {
        unknown: false,
        ambiguous: false,
        resolved: true,
      },
    ),
  ]
}