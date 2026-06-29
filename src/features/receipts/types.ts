export type ReceiptOcrStatus = "pending" | "processing" | "success" | "failed" | "manual"
export type ReceiptValidationStatus = "draft" | "validated" | "deleted"

export type ReceiptItemDraft = {
  id?: string
  name: string
  quantity: number
  unit_price?: number | null
  total_price?: number | null
  category: string
  confidence_score?: number | null
}

export type ReceiptDraft = {
  id?: string
  store_name?: string
  purchase_date?: string
  total_amount?: number
  currency?: "EUR"
  image_path?: string
  ocr_text?: string
  ocr_status?: ReceiptOcrStatus
  ai_used?: boolean
  validation_status?: ReceiptValidationStatus
  items?: ReceiptItemDraft[]
}
