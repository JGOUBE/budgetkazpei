import { resolveMarketProducts, __marketProductResolverTestUtils } from "./marketProductResolver"
import {
  buildExternalCandidatePromotion,
  choosePreferredExternalCandidate,
  dedupeExternalCandidates,
  evaluateExternalCandidateMatch,
  EXTERNAL_CANDIDATE_THRESHOLDS,
  sanitizeExternalCandidateRecord,
} from "./marketExternalCandidateService.js"
import { resolveMarketDisplayName } from "./marketDisplay"
import { sanitizeFinalReceiptItems } from "./scanEngine"
import { validateParsedReceipt } from "./receiptValidator"
import {
  applyReceiptItemDraftToItem,
  applyValidatedReceiptItemDraft,
  buildReceiptItemPersistenceUpdates,
  buildReceiptItemDraftMap,
  buildReceiptItemUpdatePayload,
  createReceiptItemDraft,
  getReceiptItemVisibleName,
  hasReceiptItemDraftChanges,
  hasReceiptItemPendingPersistence,
} from "../../features/receipts/utils/receiptItemEditor"
import {
  buildReceiptHistorySummary,
  buildReceiptSaveFailureUiState,
  buildReceiptSaveSuccessUiState,
  RECEIPT_DETAIL_BUTTON_LABELS,
  RECEIPT_DETAIL_CONFIRMATION_LABELS,
  splitReceiptDetailSavePayload,
} from "../../features/receipts/utils/receiptDetailUx"
import { __receiptServiceTestUtils } from "../../features/receipts/services/receiptService"
import {
  isEligibleMarketReceiptItem,
  isResolvedMarketProduct,
} from "../../../supabase/functions/market-record-observations/marketRules"
import {
  buildEvaluatedCandidateRows,
  buildExternalCandidateUpsertPath,
  buildOfficialSourceCandidate,
  collectExternalCandidates,
  collectExternalCandidatesWithReport,
  runCli as runExternalCandidateCli,
  } from "../../../scripts/enrich_market_alias_candidates.mjs"
import {
  buildCandidateReviewUpdatePayload,
  buildMarketProductAliasUpsertPath,
} from "../../../scripts/review_market_alias_candidates.mjs"
import {
  buildAuditSnapshot,
  buildHistoricalAliasBackfillPlan,
  runCli as runHistoricalAliasBackfillCli,
  sanitizeBackfillReport,
} from "../../../scripts/backfill_market_manual_aliases.mjs"

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

function createJsonResponse(status: number, payload: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload
    },
    async text() {
      return JSON.stringify(payload)
    },
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

function pickSuggestionFields(item: any) {
  return {
    market_suggested: item.market_suggested ?? false,
    market_suggestion_product_id: item.market_suggestion_product_id ?? null,
    market_suggestion_canonical_name: item.market_suggestion_canonical_name ?? null,
    market_suggestion_confidence: item.market_suggestion_confidence ?? null,
    market_suggestion_scope: item.market_suggestion_scope ?? null,
    market_suggestion_reason: item.market_suggestion_reason ?? null,
  }
}

function baseItem(overrides: Record<string, unknown> = {}) {
  return {
    raw_name: "HUILE LESIEUR TOURNESOL",
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
    raw_name: name,
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

function receiptEditorItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "receipt-item-1",
    raw_name: "TARAMA DEUFS CABIL,IOOG",
    ocr_name: "TARAMA DEUFS CABIL,IOOG",
    name: "TARAMA DEUFS CABIL,IOOG",
    corrected_name: "",
    market_canonical_name: "",
    total_price: 2.01,
    category: "alimentaire",
    item_status: "a_verifier",
    review_status: "needs_review",
    needs_review: true,
    ...overrides,
  }
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
    buildOcrAliasAlternateNames,
    normalizeCandidateText,
  } = __marketProductResolverTestUtils
  const {
    attemptManualAliasLearning,
    buildManualAliasLearningCandidate,
    sanitizeReceiptHeaderUpdates,
    sanitizeReceiptItemUpdates,
    buildReceiptItemDbUpdates,
    persistReceiptItemUpdate,
    shouldLearnManualAlias,
  } = __receiptServiceTestUtils

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

  const suggestionResult = await resolveFixture({
    index: 0,
    market_matched: false,
    market_suggested: true,
    market_suggestion_product_id: "55555555-5555-4555-8555-555555555555",
    market_suggestion_canonical_name: "Huile Lesieur tournesol 1 l",
    market_suggestion_confidence: 0.87,
    market_suggestion_scope: "chain",
    market_suggestion_reason: "manual_alias_review_required",
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

  const taramaCorrection = "Tarama aux oeufs de cabillaud 100 g"
  const taramaItem = receiptEditorItem()
  const taramaNormalizedVariants = [
    normalizeCandidateText("TARAMA DEUFS CABIL,I00G"),
    normalizeCandidateText("TARAMA OEUFS CABIL,100G"),
    normalizeCandidateText("TARAMA DEUFS CABIL,IOOG"),
  ]
  const taramaPayload = buildMarketResolvePayload(
    [taramaItem],
    { store_name: "E.Leclerc" },
  )[0]
  const taramaDraft = {
    ...createReceiptItemDraft(taramaItem),
    corrected_name: taramaCorrection,
  }
  const taramaDbUpdates = buildReceiptItemDbUpdates({
    corrected_name: taramaCorrection,
    total_price: 2.01,
    category: "alimentaire",
    item_status: "user_validated",
    review_status: "trusted",
    needs_review: false,
    unknown_frontend_only: "ignored",
  }, taramaItem)
  const taramaApplied = applyReceiptItemDraftToItem(taramaItem, taramaDraft)
  const taramaValidatedLocally = applyValidatedReceiptItemDraft(taramaItem, taramaDraft)
  const taramaPersisted = {
    ...taramaValidatedLocally,
    corrected_name: taramaCorrection,
  }
  const priceOnlyDraft = {
    ...createReceiptItemDraft(receiptEditorItem({ market_canonical_name: "Tarama canonique 100 g" })),
    total_price: 2.5,
  }
  const receiptTotalBefore = 66.19
  const receiptTotalAfter = receiptTotalBefore

  const multiItems = [
    receiptEditorItem(),
    receiptEditorItem({
      id: "receipt-item-2",
      raw_name: "RIZ LOCAL 1KG",
      ocr_name: "RIZ LOCAL 1KG",
      name: "RIZ LOCAL 1KG",
      total_price: 4.2,
    }),
  ]
  const multiDrafts = buildReceiptItemDraftMap(multiItems)
  multiDrafts["receipt-item-1"].corrected_name = taramaCorrection
  multiDrafts["receipt-item-2"].corrected_name = "Riz local long grain 1 kg"
  const cancelledDraft = createReceiptItemDraft(multiItems[1])
  const cancelledAfterLocalValidate = createReceiptItemDraft(multiItems[0])

  const firstValidatedState = receiptEditorItem({
    corrected_name: "",
    item_status: "user_validated",
    review_status: "trusted",
    needs_review: false,
  })
  const firstValidatedSaved = {
    ...firstValidatedState,
    corrected_name: taramaCorrection,
    item_status: "user_validated",
  }
  const unchangedValidatedSaved = {
    ...firstValidatedSaved,
    total_price: 2.01,
  }
  const saveSuccessUi = buildReceiptSaveSuccessUiState({
    rows: [{ id: "receipt-item-1" }, { id: "receipt-item-2" }],
    updatedReceipt: {
      id: "receipt-item-1",
      store_name: "E.Leclerc",
      purchase_date: "2026-07-24",
      total_amount: 66.19,
    },
    confirmationMessage: RECEIPT_DETAIL_CONFIRMATION_LABELS.fr,
  })
  const saveFailureUi = buildReceiptSaveFailureUiState({
    mode: "detail",
    detail: { id: "receipt-item-1" },
    detailImageUrl: "image-url",
    message: "Enregistrement impossible : network_down",
  })
  const splitSavePayload = splitReceiptDetailSavePayload({
    receiptUpdates: null,
    itemUpdates: [{
      itemId: "receipt-item-1",
      updates: { corrected_name: taramaCorrection },
    }],
  })
  const sanitizedReceiptHeaderUpdates = sanitizeReceiptHeaderUpdates({
    store_name: "E.Leclerc",
    purchase_date: "24/07/2026",
    total_amount: "66.19",
    itemUpdates: splitSavePayload.itemUpdates,
    item_updates: splitSavePayload.itemUpdates,
    corrected_name: taramaCorrection,
    raw_name: "TARAMA DEUFS CABIL,IOOG",
    total_price: 2.01,
    category: "alimentaire",
  })
  const sanitizedReceiptItemUpdates = sanitizeReceiptItemUpdates({
    corrected_name: taramaCorrection,
    review_status: "trusted",
    needs_review: false,
    item_status: "user_validated",
    total_price: 2.01,
    category: "alimentaire",
    unknown_frontend_only: "ignored",
  })

  function createReceiptItemPersistenceDependencies({
    responses = [],
  }: {
    responses?: Array<{ data?: any, error?: any }>
  } = {}) {
    const updateCalls: any[] = []
    const learnCalls: any[] = []
    let responseIndex = 0

    const builder = {
      eq(key: string, value: unknown) {
        const currentCall = updateCalls[updateCalls.length - 1]
        currentCall.filters.push([key, value])
        return builder
      },
      select() {
        return builder
      },
      async single() {
        const next = responses[Math.min(responseIndex, Math.max(0, responses.length - 1))] || { data: null, error: null }
        responseIndex += 1
        return {
          data: next.data ?? null,
          error: next.error ?? null,
        }
      },
    }

    return {
      dependencies: {
        supabaseClient: {
          from(table: string) {
            return {
              update(payload: any) {
                updateCalls.push({ table, payload, filters: [] as Array<[string, unknown]> })
                return builder
              },
            }
          },
        },
        learnAliasImpl: async (args: any) => {
          learnCalls.push(args)
          return { ...args.item, alias_rpc_triggered: true }
        },
      },
      getState() {
        return { updateCalls, learnCalls }
      },
    }
  }

  const persistenceSuccessDeps = createReceiptItemPersistenceDependencies({
    responses: [{
      data: {
        id: "receipt-item-1",
        corrected_name: taramaCorrection,
        total_price: 2.01,
        category: "alimentaire",
        item_status: "user_validated",
      },
      error: null,
    }],
  })
  const persistedAfterSuccess = await persistReceiptItemUpdate({
    itemId: "receipt-item-1",
    userId: "user-1",
    updates: taramaDbUpdates,
    previousItem: taramaItem,
    dependencies: persistenceSuccessDeps.dependencies,
  })

  let persistenceFailureErrorCode = ""
  const persistenceFailureDeps = createReceiptItemPersistenceDependencies({
    responses: [{
      data: null,
      error: {
        code: "PGRST400",
        message: "Bad Request",
        details: "Unknown column payload",
        hint: "",
      },
    }],
  })
  try {
    await persistReceiptItemUpdate({
      itemId: "receipt-item-1",
      userId: "user-1",
      updates: taramaDbUpdates,
      previousItem: taramaItem,
      dependencies: {
        ...persistenceFailureDeps.dependencies,
        isMissingColumnErrorImpl: () => false,
      },
    })
  } catch (error: any) {
    persistenceFailureErrorCode = String(error?.code || "")
  }

  const aliasRpcCalls: string[] = []
  const aliasLearningCandidate = buildManualAliasLearningCandidate({
    itemId: "receipt-item-1",
    previousItem: taramaItem,
    item: {
      ...taramaItem,
      corrected_name: taramaCorrection,
      item_status: "user_validated",
      review_status: "trusted",
      needs_review: false,
    },
  })
  const aliasLearningFirstSave = await attemptManualAliasLearning({
    itemId: "receipt-item-1",
    userId: "user-1",
    item: {
      ...taramaItem,
      corrected_name: taramaCorrection,
      item_status: "user_validated",
      review_status: "trusted",
      needs_review: false,
    },
    previousItem: taramaItem,
    candidate: aliasLearningCandidate,
    dependencies: {
      learnAliasRpcImpl: async (itemId: string) => {
        aliasRpcCalls.push(itemId)
        return { ok: true, learned: true, alias_id: "alias-1" }
      },
      refreshReceiptItemImpl: async () => ({
        ...taramaItem,
        corrected_name: taramaCorrection,
        item_status: "user_validated",
      }),
    },
  })
  const aliasLearningSecondCandidate = buildManualAliasLearningCandidate({
    itemId: "receipt-item-1",
    previousItem: {
      ...taramaItem,
      corrected_name: taramaCorrection,
      item_status: "user_validated",
    },
    item: {
      ...taramaItem,
      corrected_name: taramaCorrection,
      item_status: "user_validated",
    },
  })
  const aliasLearningSecondSave = await attemptManualAliasLearning({
    itemId: "receipt-item-1",
    userId: "user-1",
    item: {
      ...taramaItem,
      corrected_name: taramaCorrection,
      item_status: "user_validated",
    },
    previousItem: {
      ...taramaItem,
      corrected_name: taramaCorrection,
      item_status: "user_validated",
    },
    candidate: aliasLearningSecondCandidate,
    dependencies: {
      learnAliasRpcImpl: async (itemId: string) => {
        aliasRpcCalls.push(itemId)
        return { ok: true, learned: true, alias_id: "alias-2" }
      },
      refreshReceiptItemImpl: async () => ({
        ...taramaItem,
        corrected_name: taramaCorrection,
        item_status: "user_validated",
      }),
    },
  })

  const externalArgs = {
    rawLabel: "TARAMA DEUFS CABIL,IOOG",
    brand: "Coraya",
    packageFormat: "100 g",
    barcode: "3270190207900",
    observedPrice: 2.01,
    storeName: "E.Leclerc Les Casernes",
    storeCity: "Saint-Pierre",
    purchaseDate: "2026-07-24",
  }
  const exactBarcodeCandidate = evaluateExternalCandidateMatch({
    raw_label: "Tarama aux oeufs de cabillaud 100 g",
    brand: externalArgs.brand,
    package_format: externalArgs.packageFormat,
    barcode: externalArgs.barcode,
    observed_price: externalArgs.observedPrice,
    store_name: externalArgs.storeName,
    store_city: externalArgs.storeCity,
    candidate: {
      source_type: "open_food_facts",
      source_name: "open_food_facts",
      source_identifier: externalArgs.barcode,
      raw_label: externalArgs.rawLabel,
      candidate_canonical_name: "Tarama aux oeufs de cabillaud 100 g",
      brand: "Coraya",
      package_format: "100 g",
      barcode: externalArgs.barcode,
      observed_price: 2.01,
      store_name: externalArgs.storeName,
      store_city: externalArgs.storeCity,
      source_confidence: 0.86,
      matching_evidence: {
        official_api: "https://world.openfoodfacts.org/api/v2/product/{barcode}.json",
      },
    },
  })
  const packageConflictCandidate = evaluateExternalCandidateMatch({
    raw_label: "Tarama aux oeufs de cabillaud 100 g",
    brand: "Coraya",
    package_format: "100 g",
    observed_price: 2.01,
    store_name: externalArgs.storeName,
    store_city: externalArgs.storeCity,
    candidate: {
      source_type: "open_food_facts",
      source_name: "open_food_facts",
      source_identifier: "pkg-conflict",
      raw_label: externalArgs.rawLabel,
      candidate_canonical_name: "Tarama aux oeufs de cabillaud 100 g",
      brand: "Coraya",
      package_format: "250 g",
      observed_price: 2.01,
      store_name: externalArgs.storeName,
      store_city: externalArgs.storeCity,
      source_confidence: 0.84,
    },
  })
  const reunionCandidate = evaluateExternalCandidateMatch({
    raw_label: "Tarama aux oeufs de cabillaud 100 g",
    brand: "Coraya",
    package_format: "100 g",
    barcode: externalArgs.barcode,
    observed_price: 2.01,
    store_name: externalArgs.storeName,
    store_city: externalArgs.storeCity,
    candidate: {
      source_type: "open_prices",
      source_name: "open_prices",
      source_identifier: "reunion-price-1",
      raw_label: externalArgs.rawLabel,
      candidate_canonical_name: "Tarama aux oeufs de cabillaud 100 g",
      brand: "Coraya",
      package_format: "100 g",
      barcode: externalArgs.barcode,
      observed_price: 2.19,
      store_name: "E.Leclerc Les Casernes",
      store_city: "Saint-Pierre",
      source_confidence: 0.69,
      matching_evidence: {
        is_reunion: true,
      },
    },
  })
  const mainlandCandidate = evaluateExternalCandidateMatch({
    raw_label: "Tarama aux oeufs de cabillaud 100 g",
    brand: "Coraya",
    package_format: "100 g",
    barcode: externalArgs.barcode,
    observed_price: 2.01,
    store_name: "E.Leclerc",
    store_city: "Paris",
    candidate: {
      source_type: "open_prices",
      source_name: "open_prices",
      source_identifier: "mainland-price-1",
      raw_label: externalArgs.rawLabel,
      candidate_canonical_name: "Tarama aux oeufs de cabillaud 100 g",
      brand: "Coraya",
      package_format: "100 g",
      barcode: externalArgs.barcode,
      observed_price: 2.01,
      store_name: "E.Leclerc",
      store_city: "Paris",
      source_confidence: 0.91,
      matching_evidence: {
        is_reunion: false,
      },
    },
  })
  const preferredRegionalCandidate = choosePreferredExternalCandidate([
    mainlandCandidate,
    reunionCandidate,
  ])
  const validatedConflictCandidate = evaluateExternalCandidateMatch({
    raw_label: externalArgs.rawLabel,
    brand: externalArgs.brand,
    package_format: externalArgs.packageFormat,
    observed_price: externalArgs.observedPrice,
    store_name: externalArgs.storeName,
    store_city: externalArgs.storeCity,
    candidate: {
      source_type: "open_food_facts",
      source_name: "open_food_facts",
      source_identifier: "validated-conflict",
      raw_label: externalArgs.rawLabel,
      candidate_canonical_name: "Tarama aperitif 100 g",
      brand: "Coraya",
      package_format: "100 g",
      observed_price: 2.01,
      source_confidence: 0.7,
    },
    context: {
      validated_user_correction: "Tarama aux oeufs de cabillaud 100 g",
    },
  })
  const ambiguousExternalCandidate = evaluateExternalCandidateMatch({
    raw_label: "YAOURT VANILLE",
    brand: "Danone",
    package_format: "125 g",
    observed_price: 1.99,
    candidate: {
      source_type: "open_food_facts",
      source_name: "open_food_facts",
      source_identifier: "ambiguous-1",
      raw_label: "YAOURT VANILLE",
      candidate_canonical_name: "Yaourt vanille",
      brand: "Danone",
      package_format: "",
      observed_price: 1.99,
      source_confidence: 0.63,
    },
  })
  const lowConfidenceCandidate = evaluateExternalCandidateMatch({
    raw_label: "BISCUIT CHOCO",
    brand: "",
    package_format: "",
    observed_price: 1.49,
    candidate: {
      source_type: "open_food_facts",
      source_name: "open_food_facts",
      source_identifier: "low-score-1",
      raw_label: "BISCUIT CHOCO",
      candidate_canonical_name: "Lessive ocean 3 l",
      brand: "",
      package_format: "",
      observed_price: 1.49,
      source_confidence: 0.4,
    },
  })
  const manualAliasPriorityCandidate = evaluateExternalCandidateMatch({
    raw_label: externalArgs.rawLabel,
    candidate: {
      source_type: "open_food_facts",
      source_name: "open_food_facts",
      source_identifier: "manual-priority-1",
      raw_label: externalArgs.rawLabel,
      candidate_canonical_name: "Tarama aux oeufs de cabillaud 100 g",
      source_confidence: 0.9,
    },
    context: {
      manual_alias_priority: true,
    },
  })
  const dedupedCandidates = dedupeExternalCandidates([
    sanitizeExternalCandidateRecord({
      source_type: "open_prices",
      source_name: "open_prices",
      source_identifier: "dup-1",
      raw_label: externalArgs.rawLabel,
      candidate_canonical_name: "Tarama aux oeufs de cabillaud 100 g",
      package_format: "100 g",
      source_confidence: 0.62,
      store_name: externalArgs.storeName,
      store_city: externalArgs.storeCity,
    }),
    sanitizeExternalCandidateRecord({
      source_type: "open_prices",
      source_name: "open_prices",
      source_identifier: "dup-1",
      raw_label: externalArgs.rawLabel,
      candidate_canonical_name: "Tarama aux oeufs de cabillaud 100 g",
      package_format: "100 g",
      source_confidence: 0.88,
      store_name: externalArgs.storeName,
      store_city: externalArgs.storeCity,
    }),
  ])
  const sanitizedProvenanceCandidate = sanitizeExternalCandidateRecord({
    source_type: "open_prices",
    source_name: "open_prices",
    source_identifier: "proof-1",
    source_url: "https://prices.openfoodfacts.org/api/v1/prices/1",
    raw_label: externalArgs.rawLabel,
    candidate_canonical_name: "Tarama aux oeufs de cabillaud 100 g",
    brand: "Coraya",
    package_format: "100 g",
    observed_price: 2.01,
    matching_evidence: {
      proof_id: "proof-1",
      official_api: "https://prices.openfoodfacts.org/api/v1/prices",
      user_id: "secret-user",
      email: "secret@example.com",
      receipt_number: "123456",
      receipt_image_url: "https://private.example.com/ticket.jpg",
    },
  })
  const promotedAliasPayload = buildExternalCandidatePromotion({
    candidate: sanitizedProvenanceCandidate,
    product_id: "99999999-9999-4999-8999-999999999999",
  })
  const reviewRejectedPayload = buildCandidateReviewUpdatePayload({
    candidate: sanitizedProvenanceCandidate,
    status: "rejected",
    notes: "package mismatch",
    productId: "99999999-9999-4999-8999-999999999999",
    now: "2026-07-25T10:00:00.000Z",
  })
  const officialSourceCandidates = buildOfficialSourceCandidate({
    ...externalArgs,
    officialSourceName: "Coraya",
    officialSourceUrl: "https://www.coraya.fr/tarama-cabillaud-100g",
    officialSourceId: "coraya-tarama-100g",
    officialProductName: "Tarama aux oeufs de cabillaud 100 g",
  })
  const candidateRows = buildEvaluatedCandidateRows(externalArgs, [
    {
      source_type: "open_prices",
      source_name: "open_prices",
      source_identifier: "dup-build-1",
      raw_label: externalArgs.rawLabel,
      candidate_canonical_name: "Tarama aux oeufs de cabillaud 100 g",
      brand: "Coraya",
      package_format: "100 g",
      barcode: externalArgs.barcode,
      observed_price: 2.01,
      store_name: externalArgs.storeName,
      store_city: externalArgs.storeCity,
      source_confidence: 0.75,
    },
    {
      source_type: "open_prices",
      source_name: "open_prices",
      source_identifier: "dup-build-1",
      raw_label: externalArgs.rawLabel,
      candidate_canonical_name: "Tarama aux oeufs de cabillaud 100 g",
      brand: "Coraya",
      package_format: "100 g",
      barcode: externalArgs.barcode,
      observed_price: 2.01,
      store_name: externalArgs.storeName,
      store_city: externalArgs.storeCity,
      source_confidence: 0.92,
    },
  ])
  const immediateTimer = (callback: () => void) => {
    callback()
    return 0 as any
  }
  const collectedMissingCandidates = await collectExternalCandidates(externalArgs, {
    fetchImpl: async (url: any) => {
      const asString = String(url)
      if (asString.includes("/api/v2/product/")) {
        return createJsonResponse(200, { status: 0, product: null }) as any
      }
      if (asString.includes("/cgi/search.pl")) {
        return createJsonResponse(200, { products: [] }) as any
      }
      if (asString.includes("/api/v1/prices")) {
        return createJsonResponse(200, { results: [] }) as any
      }
      throw new Error(`unexpected_test_url:${asString}`)
    },
  })
  const exactStrongArgs = {
    rawLabel: "TARAMA AU SAUMON FUME 100G",
    barcode: "3256224193012",
    brand: "U",
    packageFormat: "100 g",
    category: "alimentaire",
    pageSize: 4,
  }
  const exactBarcodeUrls: string[] = []
  const exactBarcodeCollection = await collectExternalCandidatesWithReport(exactStrongArgs, {
    fetchImpl: async (url: any, init: any) => {
      const asString = String(url)
      exactBarcodeUrls.push(asString)
      if (!String(init?.headers?.["User-Agent"] || "").includes("BudgetKazPei/market-external-candidates")) {
        throw new Error("missing_budgetkazpei_user_agent")
      }
      if (asString.includes("/api/v2/product/")) {
        return createJsonResponse(200, {
          status: 1,
          product: {
            code: "3256224193012",
            product_name: "Tarama au saumon fume 100 g",
            brands: "U",
            quantity: "100 g",
            categories_tags: ["en:tarama"],
            url: "https://world.openfoodfacts.org/product/3256224193012",
          },
        }) as any
      }
      if (asString.includes("/cgi/search.pl")) {
        throw new Error("cgi_search_should_not_run_for_exact_barcode")
      }
      if (asString.includes("/api/v1/prices")) {
        return createJsonResponse(200, { results: [] }) as any
      }
      throw new Error(`unexpected_test_url:${asString}`)
    },
  })
  const exactBarcodeRows = buildEvaluatedCandidateRows(exactStrongArgs, exactBarcodeCollection.candidates)
  const barcode404Urls: string[] = []
  const barcode404Collection = await collectExternalCandidatesWithReport(exactStrongArgs, {
    fetchImpl: async (url: any) => {
      const asString = String(url)
      barcode404Urls.push(asString)
      if (asString.includes("/api/v2/product/")) {
        return createJsonResponse(404, { error: "not found" }) as any
      }
      if (asString.includes("/cgi/search.pl")) {
        return createJsonResponse(200, {
          products: [{
            code: "3256224193012",
            product_name: "Tarama au saumon fume 100 g",
            brands: "U",
            quantity: "100 g",
            categories_tags: ["en:tarama"],
            url: "https://world.openfoodfacts.org/product/3256224193012",
          }],
        }) as any
      }
      if (asString.includes("/api/v1/prices")) {
        return createJsonResponse(200, { results: [] }) as any
      }
      throw new Error(`unexpected_test_url:${asString}`)
    },
  })
  let retryAttemptCount = 0
  const barcodeRetryCollection = await collectExternalCandidatesWithReport(exactStrongArgs, {
    fetchImpl: async (url: any) => {
      const asString = String(url)
      if (asString.includes("/api/v2/product/")) {
        retryAttemptCount += 1
        if (retryAttemptCount < 3) {
          return createJsonResponse(503, { error: "temporarily_unavailable" }) as any
        }
        return createJsonResponse(200, {
          status: 1,
          product: {
            code: "3256224193012",
            product_name: "Tarama au saumon fume 100 g",
            brands: "U",
            quantity: "100 g",
            categories_tags: ["en:tarama"],
            url: "https://world.openfoodfacts.org/product/3256224193012",
          },
        }) as any
      }
      if (asString.includes("/cgi/search.pl")) {
        throw new Error("cgi_search_should_not_run_after_retry_success")
      }
      if (asString.includes("/api/v1/prices")) {
        return createJsonResponse(200, { results: [] }) as any
      }
      throw new Error(`unexpected_test_url:${asString}`)
    },
    setTimeoutImpl: immediateTimer as any,
  })
  let unavailableBarcodeAttempts = 0
  const degradedSourceCollection = await collectExternalCandidatesWithReport(exactStrongArgs, {
    fetchImpl: async (url: any) => {
      const asString = String(url)
      if (asString.includes("/api/v2/product/")) {
        unavailableBarcodeAttempts += 1
        return createJsonResponse(503, { error: "temporarily_unavailable" }) as any
      }
      if (asString.includes("/cgi/search.pl")) {
        return createJsonResponse(503, { error: "temporarily_unavailable" }) as any
      }
      if (asString.includes("/api/v1/prices")) {
        return createJsonResponse(200, {
          results: [{
            id: "open-price-1",
            product_name: "Tarama au saumon fume 100 g",
            product_code: "3256224193012",
            price: 2.35,
            product: {
              code: "3256224193012",
              brands: "U",
              product_quantity: "100",
              product_quantity_unit: "g",
              categories_tags: ["en:tarama"],
            },
            location: {
              osm_name: "Hyper U",
              osm_address_city: "Saint-Pierre",
              osm_address_country: "RE",
            },
          }],
        }) as any
      }
      throw new Error(`unexpected_test_url:${asString}`)
    },
    setTimeoutImpl: immediateTimer as any,
  })
  const dryRunUrls: string[] = []
  const dryRunResult = await runExternalCandidateCli([
    "--raw-label", "TARAMA AU SAUMON FUME 100G",
    "--barcode", "3256224193012",
    "--brand", "U",
    "--package-format", "100 g",
    "--category", "alimentaire",
    "--page-size", "4",
    "--dry-run",
  ], {
    fetchImpl: async (url: any) => {
      const asString = String(url)
      dryRunUrls.push(asString)
      if (asString.includes("/api/v2/product/")) {
        return createJsonResponse(200, {
          status: 1,
          product: {
            code: "3256224193012",
            product_name: "Tarama au saumon fume 100 g",
            brands: "U",
            quantity: "100 g",
            categories_tags: ["en:tarama"],
            url: "https://world.openfoodfacts.org/product/3256224193012",
          },
        }) as any
      }
      if (asString.includes("/api/v1/prices")) {
        return createJsonResponse(200, { results: [] }) as any
      }
      if (asString.includes("/rest/v1/market_external_product_candidates")) {
        throw new Error("dry_run_should_not_write")
      }
      throw new Error(`unexpected_test_url:${asString}`)
    },
  })
  const mismatchedBarcodeCollection = await collectExternalCandidatesWithReport(exactStrongArgs, {
    fetchImpl: async (url: any) => {
      const asString = String(url)
      if (asString.includes("/api/v2/product/")) {
        return createJsonResponse(200, {
          status: 1,
          product: {
            code: "9999999999999",
            product_name: "Tarama au saumon fume 100 g",
            brands: "U",
            quantity: "100 g",
            categories_tags: ["en:tarama"],
            url: "https://world.openfoodfacts.org/product/9999999999999",
          },
        }) as any
      }
      if (asString.includes("/cgi/search.pl")) {
        return createJsonResponse(200, { products: [] }) as any
      }
      if (asString.includes("/api/v1/prices")) {
        return createJsonResponse(200, { results: [] }) as any
      }
      throw new Error(`unexpected_test_url:${asString}`)
    },
  })
  const mismatchedBarcodeRows = buildEvaluatedCandidateRows(exactStrongArgs, mismatchedBarcodeCollection.candidates)

  const taramaHistoricalBase = {
    receipt_item_id: "hist-1",
    user_id: "user-1",
    raw_label: "TARAMA DEUFS CABIL,IOOG",
    corrected_label: "Tarama aux oeufs de cabillaud 100 g",
    normalized_raw_label: "tarama oeufs cabil 100g",
    normalized_corrected_label: "tarama aux oeufs de cabillaud 100 g",
    scope_kind: "chain",
    store_chain_key: "e.leclerc",
    store_id: null,
    market_product_id: "product-1",
    market_canonical_name: "Tarama aux oeufs de cabillaud 100 g",
    created_at: "2026-07-25T10:00:00.000Z",
  }
  const taramaHistoricalRows = [
    taramaHistoricalBase,
    {
      ...taramaHistoricalBase,
      receipt_item_id: "hist-2",
      user_id: "user-2",
      created_at: "2026-07-24T10:00:00.000Z",
    },
  ]
  const uniqueHistoricalRows = [{
    receipt_item_id: "hist-3",
    user_id: "user-3",
    raw_label: "PATE CAMPAGNE DEMOULE GENERIQU",
    corrected_label: "Pate campagne demoule generique",
    normalized_raw_label: "pate campagne demoule generiqu",
    normalized_corrected_label: "pate campagne demoule generique",
    scope_kind: "chain",
    store_chain_key: "e.leclerc",
    store_id: null,
    market_product_id: "",
    market_canonical_name: "",
    created_at: "2026-07-25T11:00:00.000Z",
  }]
  const conflictHistoricalRows = [
    {
      receipt_item_id: "hist-4",
      user_id: "user-4",
      raw_label: "CAM PAY 250G CROISES",
      corrected_label: "Camembert Pei 250G CROISES",
      normalized_raw_label: "cam pay 250g croises",
      normalized_corrected_label: "camembert pei 250g croises",
      scope_kind: "chain",
      store_chain_key: "e.leclerc",
      store_id: null,
      market_product_id: "",
      market_canonical_name: "",
      created_at: "2026-07-25T12:00:00.000Z",
    },
    {
      receipt_item_id: "hist-5",
      user_id: "user-5",
      raw_label: "CAM PAY 250G CROISES",
      corrected_label: "CAMEMBERT PAY 250G CROISES",
      normalized_raw_label: "cam pay 250g croises",
      normalized_corrected_label: "camembert pay 250g croises",
      scope_kind: "chain",
      store_chain_key: "e.leclerc",
      store_id: null,
      market_product_id: "",
      market_canonical_name: "",
      created_at: "2026-07-24T12:00:00.000Z",
    },
  ]
  const exactHistoricalAlias = {
    id: "alias-1",
    product_id: "product-1",
    raw_label: "TARAMA DEUFS CABIL,IOOG",
    corrected_label: "Tarama aux oeufs de cabillaud 100 g",
    normalized_raw_label: "tarama oeufs cabil 100g",
    normalized_corrected_label: "tarama aux oeufs de cabillaud 100 g",
    scope: "chain",
    store_id: null,
    store_chain_key: "e.leclerc",
    source: "historical_manual_correction",
    status: "active",
    validation_count: 1,
    confidence: 0.92,
    canonical_name: "Tarama aux oeufs de cabillaud 100 g",
  }
  const duplicateHistoricalPlan = buildHistoricalAliasBackfillPlan({
    historicalRows: taramaHistoricalRows,
    manualAliasRows: [],
  })
  const strengthenedHistoricalPlan = buildHistoricalAliasBackfillPlan({
    historicalRows: taramaHistoricalRows,
    manualAliasRows: [exactHistoricalAlias],
  })
  const idempotentHistoricalPlan = buildHistoricalAliasBackfillPlan({
    historicalRows: taramaHistoricalRows,
    manualAliasRows: [{
      ...exactHistoricalAlias,
      validation_count: 2,
      confidence: 0.995,
    }],
  })
  const conflictHistoricalPlan = buildHistoricalAliasBackfillPlan({
    historicalRows: conflictHistoricalRows,
    manualAliasRows: [],
  })
  const uniqueHistoricalPlan = buildHistoricalAliasBackfillPlan({
    historicalRows: uniqueHistoricalRows,
    manualAliasRows: [],
  })
  const backfillAudit = buildAuditSnapshot({
    receiptItemsTotal: 25,
    correctedNameTotal: 5,
    historicalRows: [...taramaHistoricalRows, ...uniqueHistoricalRows, ...conflictHistoricalRows],
    manualAliasRows: [exactHistoricalAlias],
    marketProductAliasesTotal: 7,
    externalCandidates: [],
  })
  const sanitizedBackfillJson = JSON.stringify(sanitizeBackfillReport({
    items: duplicateHistoricalPlan.planItems,
    userId: "hidden-user",
    receiptItemId: "hidden-item",
  }))
  let historicalDryRunApplyCalls = 0
  const originalConsoleLog = console.log
  console.log = () => {}
  try {
    await runHistoricalAliasBackfillCli(["--dry-run"], {
      loadHistoricalRows: () => taramaHistoricalRows,
      loadManualAliasRows: () => [],
      loadExternalCandidates: () => [],
      loadReceiptItemsTotal: () => 10,
      loadCorrectedNameTotal: () => 2,
      loadMarketProductAliasesTotal: () => 5,
      applyPlanItemsImpl: async () => {
        historicalDryRunApplyCalls += 1
        return []
      },
      writeReportImpl: () => {},
    })
  } finally {
    console.log = originalConsoleLog
  }

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
      "market-resolver-suggestion-preserves-user-visible-fields",
      {
        matched: suggestionResult.items[0].market_matched,
        name: suggestionResult.items[0].name,
        corrected_name: suggestionResult.items[0].corrected_name,
        suggestion: pickSuggestionFields(suggestionResult.items[0]),
        protected: pickProtectedItemFields(suggestionResult.items[0]),
      },
      {
        matched: false,
        name: originalItem.name,
        corrected_name: originalItem.corrected_name,
        suggestion: {
          market_suggested: true,
          market_suggestion_product_id: "55555555-5555-4555-8555-555555555555",
          market_suggestion_canonical_name: "Huile Lesieur tournesol 1 l",
          market_suggestion_confidence: 0.87,
          market_suggestion_scope: "chain",
          market_suggestion_reason: "manual_alias_review_required",
        },
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
      "market-resolver-manual-alias-normalization-converges-ocr-variants",
      taramaNormalizedVariants,
      [
        "tarama oeufs cabil 100g",
        "tarama oeufs cabil 100g",
        "tarama oeufs cabil 100g",
      ],
    ),
    assertEqual(
      "market-resolver-manual-alias-payload-keeps-raw-name-and-safe-ocr-alternates",
      {
        raw_name: taramaPayload.raw_name,
        observed_price: taramaPayload.observed_price,
        alternate_names: taramaPayload.alternate_names,
        helper_alternates: buildOcrAliasAlternateNames("TARAMA DEUFS CABIL,I00G"),
      },
      {
        raw_name: "TARAMA DEUFS CABIL,IOOG",
        observed_price: 2.01,
        alternate_names: [],
        helper_alternates: [
          "TARAMA DEUFS CABIL,100G",
          "TARAMA OEUFS CABIL,I00G",
          "TARAMA OEUFS CABIL,100G",
        ],
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
    assertEqual(
      "receipt-editor-visible-name-priority",
      [
        getReceiptItemVisibleName(receiptEditorItem({ corrected_name: taramaCorrection })),
        getReceiptItemVisibleName(receiptEditorItem({ corrected_name: "", market_canonical_name: "Tarama canonique 100 g" })),
        getReceiptItemVisibleName(receiptEditorItem({ corrected_name: "", market_canonical_name: "", name: "Tarama saisie" })),
        getReceiptItemVisibleName(receiptEditorItem({ corrected_name: "", market_canonical_name: "", name: "", raw_name: "RAW ONLY", ocr_name: "OCR ONLY" })),
      ],
      [
        taramaCorrection,
        "Tarama canonique 100 g",
        "Tarama saisie",
        "RAW ONLY",
      ],
    ),
    assertEqual(
      "receipt-editor-name-change-keeps-raw-price-and-ticket-total",
      {
        payload: buildReceiptItemUpdatePayload(taramaItem, taramaDraft),
        visibleAfterReload: getReceiptItemVisibleName(taramaApplied),
        raw_name: taramaApplied.raw_name,
        ocr_name: taramaApplied.ocr_name,
        total_price: taramaApplied.total_price,
        receipt_total_before: receiptTotalBefore,
        receipt_total_after: receiptTotalAfter,
      },
      {
        payload: {
          corrected_name: taramaCorrection,
          total_price: 2.01,
          category: "alimentaire",
        },
        visibleAfterReload: taramaCorrection,
        raw_name: "TARAMA DEUFS CABIL,IOOG",
        ocr_name: "TARAMA DEUFS CABIL,IOOG",
        total_price: 2.01,
        receipt_total_before: 66.19,
        receipt_total_after: 66.19,
      },
    ),
    assertEqual(
      "receipt-editor-local-validate-keeps-corrected-name-visible-without-touching-raw",
      {
        visible_name: getReceiptItemVisibleName(taramaValidatedLocally),
        corrected_name: taramaValidatedLocally.corrected_name,
        raw_name: taramaValidatedLocally.raw_name,
        item_status: taramaValidatedLocally.item_status,
        review_status: taramaValidatedLocally.review_status,
        needs_review: taramaValidatedLocally.needs_review,
      },
      {
        visible_name: taramaCorrection,
        corrected_name: taramaCorrection,
        raw_name: "TARAMA DEUFS CABIL,IOOG",
        item_status: "user_validated",
        review_status: "trusted",
        needs_review: false,
      },
    ),
    assertEqual(
      "receipt-editor-global-save-payload-comes-only-from-local-validated-state",
      {
        pending: hasReceiptItemPendingPersistence(taramaItem, taramaValidatedLocally),
        payload: buildReceiptItemPersistenceUpdates(taramaItem, taramaValidatedLocally),
      },
      {
        pending: true,
        payload: {
          corrected_name: taramaCorrection,
          item_status: "user_validated",
          review_status: "trusted",
          needs_review: false,
        },
      },
    ),
    assertEqual(
      "receipt-editor-save-payload-with-null-header-keeps-item-updates-outside-receipt-update",
      splitSavePayload,
      {
        receiptUpdates: null,
        itemUpdates: [{
          itemId: "receipt-item-1",
          updates: { corrected_name: taramaCorrection },
        }],
      },
    ),
    assertEqual(
      "receipt-service-sanitizes-receipt-header-updates-without-item-payload-fields",
      sanitizedReceiptHeaderUpdates,
      {
        store_name: "E.Leclerc",
        purchase_date: "2026-07-24",
        total_amount: 66.19,
      },
    ),
    assertEqual(
      "receipt-service-sanitizes-receipt-item-updates-with-real-columns-only",
      {
        dbUpdates: taramaDbUpdates,
        sanitized: sanitizedReceiptItemUpdates,
      },
      {
        dbUpdates: {
          corrected_name: taramaCorrection,
          normalized_name: "tarama aux oeufs de cabillaud",
          total_price: 2.01,
          category: "alimentaire",
          item_status: "user_validated",
        },
        sanitized: {
          corrected_name: taramaCorrection,
          item_status: "user_validated",
          total_price: 2.01,
          category: "alimentaire",
        },
      },
    ),
    assertEqual(
      "receipt-service-update-receipt-items-succeeds-before-alias-rpc",
      {
        table: persistenceSuccessDeps.getState().updateCalls[0]?.table,
        payload: persistenceSuccessDeps.getState().updateCalls[0]?.payload,
        filters: persistenceSuccessDeps.getState().updateCalls[0]?.filters,
        rpcCount: persistenceSuccessDeps.getState().learnCalls.length,
        visible_name: getReceiptItemVisibleName(persistedAfterSuccess),
      },
      {
        table: "receipt_items",
        payload: {
          corrected_name: taramaCorrection,
          normalized_name: "tarama aux oeufs de cabillaud",
          total_price: 2.01,
          category: "alimentaire",
          item_status: "user_validated",
        },
        filters: [["id", "receipt-item-1"], ["user_id", "user-1"]],
        rpcCount: 1,
        visible_name: taramaCorrection,
      },
    ),
    assertEqual(
      "receipt-service-no-alias-rpc-when-receipt-item-update-returns-400",
      {
        errorCode: persistenceFailureErrorCode,
        updateCount: persistenceFailureDeps.getState().updateCalls.length,
        rpcCount: persistenceFailureDeps.getState().learnCalls.length,
      },
      {
        errorCode: "PGRST400",
        updateCount: 1,
        rpcCount: 0,
      },
    ),
    assertEqual(
      "receipt-service-alias-learning-rpc-runs-exactly-once-after-first-successful-save",
      {
        rpcCalls: aliasRpcCalls,
        firstAttempted: aliasLearningFirstSave.attempted,
        firstSkipped: aliasLearningFirstSave.skipped ?? false,
        firstCandidate: aliasLearningCandidate,
      },
      {
        rpcCalls: ["receipt-item-1"],
        firstAttempted: true,
        firstSkipped: false,
        firstCandidate: {
          itemId: "receipt-item-1",
          rawName: "TARAMA DEUFS CABIL,IOOG",
          previousCorrectedName: "TARAMA DEUFS CABIL,IOOG",
          nextCorrectedName: taramaCorrection,
          status: "user_validated",
          shouldAttempt: true,
          skipReason: "",
        },
      },
    ),
    assertEqual(
      "receipt-service-alias-learning-second-identical-save-is-skipped",
      {
        secondAttempted: aliasLearningSecondSave.attempted,
        secondSkipped: aliasLearningSecondSave.skipped,
        secondSkipReason: aliasLearningSecondSave.skipReason,
        totalRpcCalls: aliasRpcCalls,
      },
      {
        secondAttempted: false,
        secondSkipped: true,
        secondSkipReason: "no_change",
        totalRpcCalls: ["receipt-item-1"],
      },
    ),
    assertEqual(
      "receipt-editor-price-only-save-does-not-invent-corrected-name",
      buildReceiptItemUpdatePayload(
        receiptEditorItem({ market_canonical_name: "Tarama canonique 100 g" }),
        priceOnlyDraft,
      ),
      {
        corrected_name: "",
        total_price: 2.5,
        category: "alimentaire",
      },
    ),
    assertEqual(
      "receipt-editor-multi-change-and-cancel",
      {
        dirtyIds: multiItems
          .filter(item => hasReceiptItemDraftChanges(item, multiDrafts[item.id]))
          .map(item => item.id),
        cancelledDirty: hasReceiptItemDraftChanges(multiItems[1], cancelledDraft),
        cancelledValidatedVisible: getReceiptItemVisibleName(applyReceiptItemDraftToItem(multiItems[0], cancelledAfterLocalValidate)),
      },
      {
        dirtyIds: ["receipt-item-1", "receipt-item-2"],
        cancelledDirty: false,
        cancelledValidatedVisible: "TARAMA DEUFS CABIL,IOOG",
      },
    ),
    assertEqual(
      "receipt-editor-persistence-uses-corrected-name-and-preserves-raw",
      {
        corrected_name: taramaApplied.corrected_name,
        visible_name: getReceiptItemVisibleName(taramaApplied),
        raw_name: taramaApplied.raw_name,
        reopened_name: buildReceiptItemDraftMap([taramaPersisted])["receipt-item-1"].corrected_name,
      },
      {
        corrected_name: taramaCorrection,
        visible_name: taramaCorrection,
        raw_name: "TARAMA DEUFS CABIL,IOOG",
        reopened_name: taramaCorrection,
      },
    ),
    assertEqual(
      "receipt-editor-success-save-collapses-to-compact-history-row",
      {
        nextMode: saveSuccessUi.nextMode,
        nextDetail: saveSuccessUi.nextDetail,
        nextDetailImageUrl: saveSuccessUi.nextDetailImageUrl,
        nextMessage: saveSuccessUi.nextMessage,
        compactRow: buildReceiptHistorySummary(saveSuccessUi.nextRows[0], (amount: number) => `${amount.toFixed(2).replace(".", ",")} €`),
      },
      {
        nextMode: "history",
        nextDetail: null,
        nextDetailImageUrl: "",
        nextMessage: RECEIPT_DETAIL_CONFIRMATION_LABELS.fr,
        compactRow: "E.Leclerc · 24/07/2026 · 66,19 €",
      },
    ),
    assertEqual(
      "receipt-editor-failed-save-keeps-editor-open-and-drafts-intact",
      saveFailureUi,
      {
        nextMode: "detail",
        nextDetail: { id: "receipt-item-1" },
        nextDetailImageUrl: "image-url",
        nextMessage: "Enregistrement impossible : network_down",
      },
    ),
    assertEqual(
      "receipt-editor-failed-save-does-not-show-contradictory-success-copy",
      {
        failureMessage: saveFailureUi.nextMessage,
        successMessage: RECEIPT_DETAIL_CONFIRMATION_LABELS.fr,
      },
      {
        failureMessage: "Enregistrement impossible : network_down",
        successMessage: "Modifications du ticket enregistrées.",
      },
    ),
    assertEqual(
      "receipt-editor-fr-and-kreol-copy",
      {
        frButton: RECEIPT_DETAIL_BUTTON_LABELS.fr,
        krButton: RECEIPT_DETAIL_BUTTON_LABELS.kr,
        frConfirm: RECEIPT_DETAIL_CONFIRMATION_LABELS.fr,
        krConfirm: RECEIPT_DETAIL_CONFIRMATION_LABELS.kr,
      },
      {
        frButton: "Enregistrer les modifications du ticket",
        krButton: "Anrezistre bann modifikasion lo tiké",
        frConfirm: "Modifications du ticket enregistrées.",
        krConfirm: "Bann modifikasion lo tiké inn anrezistré.",
      },
    ),
    assertEqual(
      "manual-alias-learning-triggers-once-for-real-validated-change",
      {
        firstSave: shouldLearnManualAlias(firstValidatedSaved, firstValidatedState),
        repeatedSave: shouldLearnManualAlias(unchangedValidatedSaved, firstValidatedSaved),
      },
      {
        firstSave: true,
        repeatedSave: false,
      },
    ),
    assertEqual(
      "manual-alias-learning-skips-unchanged-empty-and-needs-review",
      {
        unchanged: shouldLearnManualAlias(
          receiptEditorItem({
            corrected_name: "TARAMA DEUFS CABIL,IOOG",
            item_status: "user_validated",
            review_status: "trusted",
            needs_review: false,
          }),
          receiptEditorItem({
            corrected_name: "",
            item_status: "user_validated",
            review_status: "trusted",
            needs_review: false,
          }),
        ),
        empty: shouldLearnManualAlias(
          receiptEditorItem({
            corrected_name: "",
            item_status: "user_validated",
            review_status: "trusted",
            needs_review: false,
          }),
          receiptEditorItem({
            corrected_name: "",
            item_status: "user_validated",
            review_status: "trusted",
            needs_review: false,
          }),
        ),
        needsReview: shouldLearnManualAlias(
          receiptEditorItem({
            corrected_name: taramaCorrection,
            item_status: "a_verifier",
            review_status: "needs_review",
            needs_review: true,
          }),
          receiptEditorItem(),
        ),
      },
      {
        unchanged: false,
        empty: false,
        needsReview: false,
      },
    ),
    assertEqual(
      "historical-backfill-unique-correction-is-created",
      {
        action: uniqueHistoricalPlan.planItems[0]?.action ?? null,
        occurrences: uniqueHistoricalPlan.planItems[0]?.occurrences ?? null,
        raw_label: uniqueHistoricalPlan.planItems[0]?.raw_label ?? null,
      },
      {
        action: "created",
        occurrences: 1,
        raw_label: "PATE CAMPAGNE DEMOULE GENERIQU",
      },
    ),
    assertEqual(
      "historical-backfill-repeated-same-raw-label-collapses-to-one-create",
      {
        total_pairs: duplicateHistoricalPlan.summary.total_pairs,
        action: duplicateHistoricalPlan.planItems[0]?.action ?? null,
        occurrences: duplicateHistoricalPlan.planItems[0]?.occurrences ?? null,
      },
      {
        total_pairs: 1,
        action: "created",
        occurrences: 2,
      },
    ),
    assertEqual(
      "historical-backfill-existing-alias-is-strengthened-before-idempotent-rerun",
      {
        first_action: strengthenedHistoricalPlan.planItems[0]?.action ?? null,
        second_action: idempotentHistoricalPlan.planItems[0]?.action ?? null,
        second_reason: idempotentHistoricalPlan.planItems[0]?.reason ?? null,
      },
      {
        first_action: "strengthened",
        second_action: "skipped",
        second_reason: "alias_already_covers_historical_count",
      },
    ),
    assertEqual(
      "historical-backfill-conflicting-corrections-stay-in-review",
      {
        action: conflictHistoricalPlan.planItems[0]?.action ?? null,
        reason: conflictHistoricalPlan.planItems[0]?.reason ?? null,
        variants: conflictHistoricalPlan.planItems[0]?.variants?.length ?? 0,
      },
      {
        action: "conflict",
        reason: "multiple_historical_corrections",
        variants: 2,
      },
    ),
    assertEqual(
      "historical-backfill-report-excludes-personal-data-and-price-mutations",
      {
        has_user_id: sanitizedBackfillJson.includes("user_id") || sanitizedBackfillJson.includes("userId"),
        has_receipt_item_id: sanitizedBackfillJson.includes("receipt_item_id") || sanitizedBackfillJson.includes("receiptItemId"),
        has_total_price: sanitizedBackfillJson.includes("total_price"),
        has_observed_price: sanitizedBackfillJson.includes("observed_price"),
      },
      {
        has_user_id: false,
        has_receipt_item_id: false,
        has_total_price: false,
        has_observed_price: false,
      },
    ),
    assertEqual(
      "historical-backfill-dry-run-never-calls-apply",
      historicalDryRunApplyCalls,
      0,
    ),
    assertEqual(
      "historical-backfill-audit-counts-manual-coverage-without-external-candidates",
      backfillAudit,
      {
        receipt_items_total: 25,
        receipt_items_corrected_name_non_null: 5,
        distinct_raw_to_corrected_pairs: 4,
        market_manual_product_aliases_total: 1,
        market_product_aliases_total: 7,
        market_external_product_candidates_total: 0,
        market_external_product_candidates_by_status: {},
        corrected_pairs_without_active_manual_alias: 3,
        raw_labels_with_conflicting_corrections: 1,
      },
    ),
    assertEqual(
      "market-external-barcode-exact-can-auto-promote-and-apply",
      {
        match_level: exactBarcodeCandidate.match_level,
        confidence: exactBarcodeCandidate.source_confidence,
        should_auto_promote: exactBarcodeCandidate.should_auto_promote,
        should_apply_automatic_replacement: exactBarcodeCandidate.should_apply_automatic_replacement,
        barcode_match: exactBarcodeCandidate.matching_evidence.barcode_match,
      },
      {
        match_level: "exact_strong",
        confidence: 0.995,
        should_auto_promote: true,
        should_apply_automatic_replacement: true,
        barcode_match: true,
      },
    ),
    assertEqual(
      "market-external-package-conflict-stays-ambiguous",
      {
        match_level: packageConflictCandidate.match_level,
        should_auto_promote: packageConflictCandidate.should_auto_promote,
        should_apply_automatic_replacement: packageConflictCandidate.should_apply_automatic_replacement,
        skip_reason: packageConflictCandidate.skip_reason,
      },
      {
        match_level: "ambiguous",
        should_auto_promote: false,
        should_apply_automatic_replacement: false,
        skip_reason: "package_conflict",
      },
    ),
    assertEqual(
      "market-external-reunion-price-variant-keeps-strong-match-and-regional-priority",
      {
        reunion_match_level: reunionCandidate.match_level,
        reunion_price_score: reunionCandidate.matching_evidence.price_score,
        reunion_priority: reunionCandidate.matching_evidence.reunion_priority,
        preferred_source_identifier: preferredRegionalCandidate?.source_identifier ?? null,
      },
      {
        reunion_match_level: "exact_strong",
        reunion_price_score: 0.8,
        reunion_priority: true,
        preferred_source_identifier: "reunion-price-1",
      },
    ),
    assertEqual(
      "market-external-validated-user-correction-remains-priority",
      {
        match_level: validatedConflictCandidate.match_level,
        should_auto_promote: validatedConflictCandidate.should_auto_promote,
        skip_reason: validatedConflictCandidate.skip_reason,
      },
      {
        match_level: "rejected",
        should_auto_promote: false,
        skip_reason: "validated_user_correction_conflict",
      },
    ),
    assertEqual(
      "market-external-ambiguous-source-is-suggestion-only",
      {
        confidence: ambiguousExternalCandidate.source_confidence,
        match_level: ambiguousExternalCandidate.match_level,
        should_auto_promote: ambiguousExternalCandidate.should_auto_promote,
        should_apply_automatic_replacement: ambiguousExternalCandidate.should_apply_automatic_replacement,
      },
      {
        confidence: 0.87,
        match_level: "ambiguous",
        should_auto_promote: false,
        should_apply_automatic_replacement: false,
      },
    ),
    assertEqual(
      "market-external-missing-open-food-facts-product-keeps-empty-collection",
      collectedMissingCandidates,
      [],
    ),
    assertEqual(
      "market-external-review-can-reject-candidate-with-notes",
      reviewRejectedPayload,
      {
        status: "rejected",
        validation_notes: "package mismatch",
        updated_at: "2026-07-25T10:00:00.000Z",
        last_seen_at: "2026-07-25T10:00:00.000Z",
        matched_product_id: "99999999-9999-4999-8999-999999999999",
      },
    ),
    assertEqual(
      "market-external-dedupe-keeps-highest-confidence-candidate",
      {
        count: dedupedCandidates.length,
        best_confidence: dedupedCandidates[0]?.source_confidence ?? null,
      },
      {
        count: 1,
        best_confidence: 0.88,
      },
    ),
    assertEqual(
      "market-external-promotion-builds-active-alias-payload",
      promotedAliasPayload,
      {
        product_id: "99999999-9999-4999-8999-999999999999",
        raw_label: "TARAMA DEUFS CABIL,IOOG",
        normalized_raw_label: "tarama oeufs cabil 100g",
        source: "external_validated:open_prices",
        confidence: 0,
      },
    ),
    assertEqual(
      "market-external-provenance-is-kept-without-personal-data",
      {
        source_type: sanitizedProvenanceCandidate.source_type,
        source_name: sanitizedProvenanceCandidate.source_name,
        source_identifier: sanitizedProvenanceCandidate.source_identifier,
        source_url: sanitizedProvenanceCandidate.source_url,
        matching_evidence: sanitizedProvenanceCandidate.matching_evidence,
      },
      {
        source_type: "open_prices",
        source_name: "open_prices",
        source_identifier: "proof-1",
        source_url: "https://prices.openfoodfacts.org/api/v1/prices/1",
        matching_evidence: {
          proof_id: "proof-1",
          official_api: "https://prices.openfoodfacts.org/api/v1/prices",
        },
      },
    ),
    assertEqual(
      "market-external-low-confidence-never-auto-replaces",
      {
        threshold: EXTERNAL_CANDIDATE_THRESHOLDS.SUGGESTION_THRESHOLD,
        confidence: lowConfidenceCandidate.source_confidence,
        match_level: lowConfidenceCandidate.match_level,
        skip_reason: lowConfidenceCandidate.skip_reason,
        should_apply_automatic_replacement: lowConfidenceCandidate.should_apply_automatic_replacement,
      },
      {
        threshold: 0.78,
        confidence: 0.15,
        match_level: "rejected",
        skip_reason: "below_threshold",
        should_apply_automatic_replacement: false,
      },
    ),
    assertEqual(
      "market-external-manual-alias-priority-beats-external-sources",
      {
        match_level: manualAliasPriorityCandidate.match_level,
        skip_reason: manualAliasPriorityCandidate.skip_reason,
        should_auto_promote: manualAliasPriorityCandidate.should_auto_promote,
      },
      {
        match_level: "rejected",
        skip_reason: "manual_alias_priority",
        should_auto_promote: false,
      },
    ),
    assertEqual(
      "market-external-official-source-builder-adds-controlled-candidate",
      officialSourceCandidates,
      [{
        source_type: "official_product_page",
        source_name: "Coraya",
        source_identifier: "coraya-tarama-100g",
        source_url: "https://www.coraya.fr/tarama-cabillaud-100g",
        raw_label: "TARAMA DEUFS CABIL,IOOG",
        candidate_canonical_name: "Tarama aux oeufs de cabillaud 100 g",
        brand: "Coraya",
        category: "",
        package_format: "100 g",
        barcode: "3270190207900",
        observed_price: 2.01,
        store_name: "E.Leclerc Les Casernes",
        store_city: "Saint-Pierre",
        source_confidence: 0.74,
        matching_evidence: {
          source: "official_precise_product_page",
          observed_date: "2026-07-24",
          exact_reference_identified: true,
        },
      }],
    ),
    assertEqual(
      "market-external-barcode-direct-lookup-does-not-require-cgi-search",
      {
        source_strategy: exactBarcodeCollection.report.source_strategy,
        exact_candidate_found: exactBarcodeCollection.report.exact_candidate_found,
        search_called: exactBarcodeUrls.some(url => url.includes("/cgi/search.pl")),
        succeeded_sources: exactBarcodeCollection.report.sources_succeeded,
      },
      {
        source_strategy: "exact_barcode_lookup",
        exact_candidate_found: true,
        search_called: false,
        succeeded_sources: ["open_food_facts_barcode", "open_prices"],
      },
    ),
    assertEqual(
      "market-external-direct-barcode-result-builds-exact-strong-row",
      {
        match_level: exactBarcodeRows[0]?.match_level ?? null,
        confidence: exactBarcodeRows[0]?.source_confidence ?? null,
        barcode_match: exactBarcodeRows[0]?.matching_evidence?.barcode_match ?? false,
      },
      {
        match_level: "exact_strong",
        confidence: 0.995,
        barcode_match: true,
      },
    ),
    assertEqual(
      "market-external-barcode-404-falls-back-to-text-search",
      {
        barcode_lookup_not_found: barcode404Collection.report.barcode_lookup_not_found,
        source_strategy: barcode404Collection.report.source_strategy,
        search_called: barcode404Urls.some(url => url.includes("/cgi/search.pl")),
        candidate_count: barcode404Collection.candidates.length,
      },
      {
        barcode_lookup_not_found: true,
        source_strategy: "full_text_fallback",
        search_called: true,
        candidate_count: 1,
      },
    ),
    assertEqual(
      "market-external-barcode-retries-on-503-before-success",
      {
        attempts: retryAttemptCount,
        report_attempts: barcodeRetryCollection.report.attempts_by_source.open_food_facts_barcode,
        exact_candidate_found: barcodeRetryCollection.report.exact_candidate_found,
      },
      {
        attempts: 3,
        report_attempts: 3,
        exact_candidate_found: true,
      },
    ),
    assertEqual(
      "market-external-unavailable-direct-source-does-not-block-other-sources",
      {
        exact_candidate_found: degradedSourceCollection.report.exact_candidate_found,
        unavailable_sources: degradedSourceCollection.report.sources_unavailable.map(source => source.source),
        succeeded_sources: degradedSourceCollection.report.sources_succeeded,
        barcode_attempts: unavailableBarcodeAttempts,
        candidate_sources: degradedSourceCollection.candidates.map(candidate => candidate.source_name),
      },
      {
        exact_candidate_found: false,
        unavailable_sources: ["open_food_facts_barcode", "open_food_facts_search"],
        succeeded_sources: ["open_prices"],
        barcode_attempts: 3,
        candidate_sources: ["open_prices"],
      },
    ),
    assertEqual(
      "market-external-dry-run-never-writes-to-supabase",
      {
        dry_run_rows: dryRunResult?.rows?.length ?? 0,
        attempted_write: dryRunUrls.some(url => url.includes("/rest/v1/market_external_product_candidates")),
      },
      {
        dry_run_rows: 1,
        attempted_write: false,
      },
    ),
    assertEqual(
      "market-external-mismatched-barcode-never-becomes-exact-strong",
      {
        source_strategy: mismatchedBarcodeCollection.report.source_strategy,
        exact_candidate_found: mismatchedBarcodeCollection.report.exact_candidate_found,
        match_level: mismatchedBarcodeRows[0]?.match_level ?? null,
        barcode_match: mismatchedBarcodeRows[0]?.matching_evidence?.barcode_match ?? false,
      },
      {
        source_strategy: "full_text_fallback",
        exact_candidate_found: false,
        match_level: "ambiguous",
        barcode_match: false,
      },
    ),
    assertEqual(
      "market-external-evaluated-rows-dedupe-before-staging",
      {
        count: candidateRows.length,
        match_level: candidateRows[0]?.match_level ?? null,
        confidence: candidateRows[0]?.source_confidence ?? null,
      },
      {
        count: 1,
        match_level: "exact_strong",
        confidence: 0.995,
      },
    ),
    assertEqual(
      "market-external-supabase-paths-use-real-conflict-targets",
      {
        candidate_upsert_path: buildExternalCandidateUpsertPath(),
        alias_upsert_path: buildMarketProductAliasUpsertPath(),
      },
      {
        candidate_upsert_path: "market_external_product_candidates?on_conflict=source_name,source_identifier,normalized_raw_label,normalized_candidate_name,barcode,store_name,store_city",
        alias_upsert_path: "market_product_aliases?on_conflict=product_id,normalized_raw_label,source",
      },
    ),
  ]
}
