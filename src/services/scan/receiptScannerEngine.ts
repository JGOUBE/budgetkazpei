import { runSmartScan, runSmartScanLongTicket, type ScanEngineOptions } from "./scanEngine"
import { ReceiptScannerApiError, scanLongReceiptWithApi, scanSingleReceiptWithApi, type ReceiptScannerApiOptions } from "./receiptScannerApi"
import type { ReceiptScannerEngineMode, ReceiptScannerResult, ReceiptScanItem, ReceiptScanResponse } from "./receiptScannerTypes"

export function getReceiptScannerEngineMode(): ReceiptScannerEngineMode {
  return "python"
}
export function isTechnicalPythonScannerError(error: unknown) {
  if (!(error instanceof ReceiptScannerApiError)) return false
  return ["network_error", "internal_scan_error", "processing_timeout", "scanner_busy"].includes(error.scanError.code)
}

export function canOfferLegacyFallback(_error: unknown) {
  return false
}
function scanStatusForApi(status: ReceiptScanResponse["status"]) {
  if (status === "trusted") return "budget_ok_articles_ok"
  if (status === "budget_ok_articles_partial") return "budget_ok_articles_partial"
  if (status === "needs_review") return "budget_needs_review"
  return "rejected_scan_not_exploitable"
}

function itemStatus(item: ReceiptScanItem, response: ReceiptScanResponse) {
  if (item.needs_review === true) return "needs_review"

  const explicitlyEligible =
    item.eligible_for_courses === true
    || item.eligible_for_market_database === true

  if (explicitlyEligible) return "trusted"
  if (response.status === "trusted") return "trusted"

  if (
    response.status === "budget_ok_articles_partial"
    && response.should_feed_verified_articles === true
    && item.needs_review === false
  ) {
    return "trusted"
  }

  return "needs_review"
}

export function mapPythonScanToDraft(response: ReceiptScanResponse) {
  const receipt = response.receipt || {}
  const shouldUseItems = response.status !== "scan_not_exploitable"
  const items = shouldUseItems
    ? (response.items || []).map((item, index) => {
        const qualityStatus = itemStatus(item, response)
        const trusted = qualityStatus === "trusted"

        return {
          name: item.canonical_name || item.raw_name || "Produit à vérifier",
          ocr_name: item.raw_name || "",
          corrected_name: item.canonical_name || item.raw_name || "",
          quantity: item.quantity ?? 1,
          unit_price: item.unit_price ?? "",
          total_price: item.total_price ?? "",
          weight_kg: item.weight_kg ?? null,
          price_per_kg: item.price_per_kg ?? null,
          vat_code: item.vat_code ?? null,
          item_type: item.item_type || "standard",
          category: "alimentaire",
          confidence_score: Math.round(Number(item.ocr_confidence || 0) * 100),
          item_quality_score: Math.round(Number(item.ocr_confidence || 0) * 100),
          item_status: trusted ? "trusted" : "a_verifier",
          status: trusted ? "trusted" : "a_verifier",
          review_status: qualityStatus,
          needs_review: !trusted,
          eligible_for_courses: trusted && (
            item.eligible_for_courses === true
            || response.should_feed_courses === true
            || response.should_feed_verified_articles === true
          ),
          eligible_for_market_database: trusted && (
            item.eligible_for_market_database === true
            || response.should_feed_market_database === true
          ),
          source: "python_receipt_scanner",
          source_line_ids: [index],
        }
      })
    : []

  const total = Number(response.budget_amount ?? receipt.payable_total ?? receipt.total ?? 0)
  const printedTotal = Number(receipt.article_total ?? receipt.total ?? response.budget_amount ?? 0)
  const itemsTotal = Number(receipt.items_total ?? 0)
  const hasVerifiedArticlesForCourses = response.should_feed_courses === true
    || response.should_feed_verified_articles === true
  const parserDebug = {
    python_scan_response: true,
    scan_id: response.scan_id,
    final_scan_status: scanStatusForApi(response.status),
    budget_status: response.should_record_budget ? "reliable" : "needs_review",
    items_quality_status: response.article_data_mode,
    smart_shopping_safe: hasVerifiedArticlesForCourses,
    should_feed_market_database: response.should_feed_market_database,
    should_feed_verified_articles: response.should_feed_verified_articles,
    reasons: response.reasons || [],
    warnings: response.warnings || [],
    unattributed_amount: response.unattributed_amount ?? null,
    printed_total: printedTotal || null,
    article_total: receipt.article_total ?? null,
    immediate_discount_total: receipt.immediate_discount_total ?? null,
    payable_total: receipt.payable_total ?? null,
    reconstructed_items_total: itemsTotal || null,
  }

  return {
    store_name: receipt.store_name || "",
    merchant_name: receipt.store_name || "",
    store_location: receipt.store_location || "",
    purchase_date: receipt.receipt_date || new Date().toISOString().slice(0, 10),
    receipt_time: receipt.receipt_time || "",
    total_amount: total,
    currency: "EUR",
    ocr_text: "",
    ocr_status: "python_api",
    ai_used: false,
    validation_status: "draft",
    items,
    expected_items_count: receipt.declared_item_count || receipt.product_line_count || items.length,
    declared_items_count: receipt.declared_item_count || null,
    counted_quantity: receipt.counted_quantity || items.length,
    estimated_items_sum: itemsTotal || null,
    scan_status: scanStatusForApi(response.status),
    final_scan_status: scanStatusForApi(response.status),
    budget_status: response.should_record_budget ? "reliable" : "needs_review",
    items_quality_status: response.article_data_mode,
    total_needs_review: !response.should_record_budget || total <= 0,
    total_source: response.should_record_budget ? "python_api_verified" : "python_api_needs_review",
    smart_shopping_safe: hasVerifiedArticlesForCourses,
    python_scan_pending_save: true,
    python_scan_status: response.status,
    python_scan_id: response.scan_id,
    python_scan_decision: {
      should_record_budget: response.should_record_budget,
      budget_amount: response.budget_amount,
      article_data_mode: response.article_data_mode,
      should_feed_courses: response.should_feed_courses,
      should_feed_market_database: response.should_feed_market_database,
      should_feed_verified_articles: response.should_feed_verified_articles,
      requires_user_validation: response.requires_user_validation,
      unattributed_amount: response.unattributed_amount,
      exploitable: response.exploitable,
    },
    parser_debug: parserDebug,
    warnings: response.warnings || [],
  }
}

function metricsForPython(response: ReceiptScanResponse) {
  return {
    provider: "python_receipt_scanner",
    engine_used: "python",
    scanId: response.scan_id,
    finalScanStatus: scanStatusForApi(response.status),
    pythonStatus: response.status,
    tokenCount: response.diagnostics?.token_count ?? null,
    elapsedSeconds: response.diagnostics?.elapsed_seconds ?? null,
    overlap: response.diagnostics?.overlap ?? null,
    shouldRecordBudget: response.should_record_budget,
    shouldFeedCourses: response.should_feed_courses,
    shouldFeedMarketDatabase: response.should_feed_market_database,
    shouldFeedVerifiedArticles: response.should_feed_verified_articles,
  }
}

export async function scanWithPythonEngine(file: File, options: ReceiptScannerApiOptions = {}): Promise<ReceiptScannerResult> {
  const response = await scanSingleReceiptWithApi(file, options)
  return {
    engine_used: "python",
    receipt: mapPythonScanToDraft(response),
    metrics: metricsForPython(response),
    apiResponse: response,
  }
}

export async function scanLongWithPythonEngine(files: { top: File; bottom: File }, options: ReceiptScannerApiOptions = {}): Promise<ReceiptScannerResult> {
  const response = await scanLongReceiptWithApi(files, options)
  return {
    engine_used: "python",
    receipt: mapPythonScanToDraft(response),
    metrics: metricsForPython(response),
    apiResponse: response,
  }
}

export async function scanWithLegacyEngine(file: File, options: ScanEngineOptions = {}): Promise<ReceiptScannerResult> {
  const scan = await runSmartScan(file, options)
  return {
    ...scan,
    engine_used: "legacy",
    metrics: { ...(scan.metrics || {}), engine_used: "legacy" },
  }
}

export async function scanLongWithLegacyEngine(files: { top: File; bottom: File }, options: ScanEngineOptions = {}): Promise<ReceiptScannerResult> {
  const scan = await runSmartScanLongTicket(files, options)
  return {
    ...scan,
    engine_used: "legacy",
    metrics: { ...(scan.metrics || {}), engine_used: "legacy" },
  }
}

export async function scanReceiptWithConfiguredEngine(file: File, options: ScanEngineOptions & ReceiptScannerApiOptions = {}) {
  return scanWithPythonEngine(file, options)
}
export async function scanLongReceiptWithConfiguredEngine(files: { top: File; bottom: File }, options: ScanEngineOptions & ReceiptScannerApiOptions = {}) {
  return scanLongWithPythonEngine(files, options)
}