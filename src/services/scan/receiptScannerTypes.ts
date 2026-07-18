export type ReceiptScannerEngineMode = "legacy" | "python" | "auto"
export type ReceiptScannerEngineUsed = "legacy" | "python"

export type ReceiptScanStatus =
  | "trusted"
  | "budget_ok_articles_partial"
  | "needs_review"
  | "scan_not_exploitable"

export type ReceiptScanItem = {
  raw_name: string
  canonical_name?: string | null
  quantity: number
  unit_price?: number | null
  total_price: number
  weight_kg?: number | null
  price_per_kg?: number | null
  vat_code?: number | null
  item_type: string
  ocr_confidence?: number | null
  needs_review: boolean
  eligible_for_courses: boolean
  eligible_for_market_database: boolean
}

export type ReceiptScanReceipt = {
  store_name?: string | null
  store_location?: string | null
  receipt_date?: string | null
  receipt_time?: string | null
  declared_item_count?: number | null
  counted_quantity: number
  product_line_count: number
  items_total: number
  total?: number | null
  article_total?: number | null
  immediate_discount_total?: number | null
  payable_total?: number | null
}

export type ReceiptScanDiagnostics = {
  engine: string
  elapsed_seconds: number
  token_count: number
  rotation_degrees?: number | null
  overlap?: {
    used: boolean
    matched_anchor_count?: number | null
    average_similarity?: number | null
  }
}

export type ReceiptScanResponse = {
  scan_id: string
  mode: "single" | "long_receipt"
  status: ReceiptScanStatus
  exploitable: boolean
  should_record_budget: boolean
  budget_amount?: number | null
  article_data_mode: "full" | "partial" | "blocked" | "none"
  should_feed_courses: boolean
  should_feed_market_database: boolean
  should_feed_verified_articles: boolean
  requires_user_validation: boolean
  unattributed_amount?: number | null
  receipt: ReceiptScanReceipt
  items: ReceiptScanItem[]
  warnings: string[]
  reasons: string[]
  diagnostics?: ReceiptScanDiagnostics | null
}

export type ReceiptScanErrorCode =
  | "invalid_file"
  | "invalid_file_type"
  | "file_too_large"
  | "invalid_image"
  | "image_dimensions_invalid"
  | "image_quality_failed"
  | "scan_not_exploitable"
  | "overlap_not_found"
  | "images_order_invalid"
  | "scanner_busy"
  | "processing_timeout"
  | "authentication_required"
  | "authentication_invalid"
  | "forbidden"
  | "quota_exceeded"
  | "monthly_quota_reached"
  | "scan_safety_limit_reached"
  | "quota_unavailable"
  | "images_identical"
  | "invalid_response"
  | "internal_scan_error"
  | "network_error"

export type ReceiptScanError = {
  code: ReceiptScanErrorCode
  message: string
  retryable: boolean
  scan_id?: string | null
  technical?: boolean
}

export type ReceiptScannerResult = {
  engine_used: ReceiptScannerEngineUsed
  receipt: Record<string, any>
  metrics: Record<string, any>
  apiResponse?: ReceiptScanResponse
}
