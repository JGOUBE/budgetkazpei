import { supabase } from "../supabase"
import { PREMIUM_PLUS_SAFETY_MESSAGE } from "../../config/plans"
import type { ReceiptScanError, ReceiptScanResponse } from "./receiptScannerTypes"

export type ReceiptScannerApiOptions = {
  apiUrl?: string
  timeoutMs?: number
  getSession?: () => Promise<any>
  fetchImpl?: typeof fetch
  signal?: AbortSignal
  requestId?: string
}

const DEFAULT_TIMEOUT_MS = 100000
const MAX_CLIENT_UPLOAD_BYTES = 12 * 1024 * 1024
const SUPPORTED_CLIENT_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])
const SAFE_ERROR_MESSAGES: Record<string, string> = {
  invalid_file: "Ajoutez une image de ticket valide.",
  invalid_file_type: "Format non accepté. Utilisez une photo JPEG, PNG ou WebP.",
  file_too_large: "La photo est trop lourde. Reprenez une image plus légère.",
  invalid_image: "L'image ne peut pas être lue. Reprenez la photo ou choisissez une autre image.",
  image_dimensions_invalid: "La photo est trop petite, trop grande ou invalide.",
  image_quality_failed: "La photo n'est pas assez lisible. Reprenez le ticket bien à plat, avec plus de lumière.",
  scan_not_exploitable: "Le ticket n'est pas assez exploitable. Reprenez la photo ou saisissez le ticket manuellement.",
  overlap_not_found: "Les deux photos du ticket ne se recoupent pas assez. Gardez une zone commune visible.",
  images_order_invalid: "Les deux photos semblent dans le mauvais ordre. Inversez haut et bas puis réessayez.",
  images_identical: "Ajoutez deux photos différentes du ticket long.",
  scanner_busy: "Le service de scan est occupé. Réessayez dans quelques instants.",
  processing_timeout: "L'analyse a pris trop de temps. Réessayez avec une photo plus nette ou utilisez la saisie manuelle.",
  authentication_required: "Votre session a expiré. Reconnectez-vous pour scanner ce ticket.",
  authentication_invalid: "Votre session n'est pas acceptée pour ce scan. Reconnectez-vous.",
  forbidden: "Votre compte ne peut pas utiliser ce service pour le moment.",
  quota_exceeded: "Votre quota de scans est atteint.",
  monthly_quota_reached: "Votre quota de scans est atteint.",
  scan_safety_limit_reached: PREMIUM_PLUS_SAFETY_MESSAGE,
  quota_unavailable: "Le contrôle de quota est temporairement indisponible.",
  invalid_response: "Le service de scan a renvoyé une réponse inattendue.",
  internal_scan_error: "Le service de scan a rencontré une erreur technique.",
  network_error: "Le service de scan est momentanément indisponible.",
}

export class ReceiptScannerApiError extends Error {
  scanError: ReceiptScanError
  httpStatus?: number

  constructor(scanError: ReceiptScanError, httpStatus?: number) {
    super(scanError.message)
    this.name = "ReceiptScannerApiError"
    this.scanError = scanError
    this.httpStatus = httpStatus
  }
}

export function getReceiptScannerApiConfig() {
  return {
    apiUrl: String(import.meta.env.VITE_RECEIPT_SCANNER_API_URL || "http://localhost:8080").replace(/\/+$/, ""),
    timeoutMs: Number(import.meta.env.VITE_RECEIPT_SCANNER_REQUEST_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
  }
}

function normalizeTimeout(timeoutMs?: number) {
  const parsed = Number(timeoutMs || 0)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS
}

async function getAccessToken(getSession?: () => Promise<any>) {
  const sessionGetter = getSession || (() => supabase.auth.getSession())
  const { data } = await sessionGetter()
  const token = data?.session?.access_token
  if (!token) {
    throw new ReceiptScannerApiError({
      code: "authentication_required",
      message: SAFE_ERROR_MESSAGES.authentication_required,
      retryable: true,
      technical: false,
    })
  }
  return token
}

function composeAbortSignal(timeoutMs: number, externalSignal?: AbortSignal) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort("timeout"), timeoutMs)

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort(externalSignal.reason || "aborted")
    } else {
      externalSignal.addEventListener("abort", () => {
        controller.abort(externalSignal.reason || "aborted")
      }, { once: true })
    }
  }

  return { signal: controller.signal, cleanup: () => clearTimeout(timer) }
}

function safeErrorMessage(code: string) {
  return SAFE_ERROR_MESSAGES[code] || SAFE_ERROR_MESSAGES.internal_scan_error
}

function mapStructuredError(payload: any, httpStatus?: number): ReceiptScanError {
  const error = payload?.error || {}
  const fallbackCode = httpStatus === 403
    ? "forbidden"
    : httpStatus === 429
      ? "quota_exceeded"
      : "internal_scan_error"
  const code = String(error.code || fallbackCode)
  return {
    code: code as ReceiptScanError["code"],
    message: safeErrorMessage(code),
    retryable: error.retryable !== false,
    scan_id: error.scan_id || null,
    technical: ["internal_scan_error", "scanner_busy", "processing_timeout"].includes(code),
  }
}

function networkError(error: unknown): ReceiptScanError {
  const name = String((error as { name?: string })?.name || "")
  const code = name === "AbortError" ? "processing_timeout" : "network_error"
  return {
    code,
    message: safeErrorMessage(code),
    retryable: true,
    technical: true,
  }
}

function localError(code: ReceiptScanError["code"], retryable = true): ReceiptScannerApiError {
  return new ReceiptScannerApiError({
    code,
    message: safeErrorMessage(code),
    retryable,
    technical: false,
  })
}

function validateImageFile(file: File | null | undefined) {
  if (!(file instanceof File)) throw localError("invalid_file")
  const type = String(file.type || "").split(";")[0].trim().toLowerCase()
  if (!SUPPORTED_CLIENT_IMAGE_TYPES.has(type)) throw localError("invalid_file_type")
  if (Number(file.size || 0) <= 0) throw localError("invalid_image")
  if (Number(file.size || 0) > MAX_CLIENT_UPLOAD_BYTES) throw localError("file_too_large")
}

function sameImageFile(first: File, second: File) {
  return first === second
    || (
      first.name === second.name
      && first.size === second.size
      && first.lastModified === second.lastModified
      && first.type === second.type
    )
}

function isValidScanResponse(payload: any): payload is ReceiptScanResponse {
  return Boolean(
    payload
    && typeof payload.scan_id === "string"
    && ["single", "long_receipt"].includes(payload.mode)
    && ["trusted", "budget_ok_articles_partial", "needs_review", "scan_not_exploitable"].includes(payload.status)
    && typeof payload.exploitable === "boolean"
    && typeof payload.should_record_budget === "boolean"
    && payload.receipt
    && Array.isArray(payload.items)
    && Array.isArray(payload.warnings)
    && Array.isArray(payload.reasons)
  )
}

async function postScan(path: string, formData: FormData, options: ReceiptScannerApiOptions = {}): Promise<ReceiptScanResponse> {
  const config = getReceiptScannerApiConfig()
  const apiUrl = String(options.apiUrl || config.apiUrl).replace(/\/+$/, "")
  const timeoutMs = normalizeTimeout(options.timeoutMs || config.timeoutMs)
  const token = await getAccessToken(options.getSession)
  const fetcher = options.fetchImpl || fetch
  const abort = composeAbortSignal(timeoutMs, options.signal)
  if (!formData.has("scan_id")) {
    formData.append("scan_id", options.requestId || createRequestId())
  }

  try {
    const response = await fetcher(`${apiUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
      signal: abort.signal,
    })

    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      throw new ReceiptScannerApiError(mapStructuredError(payload, response.status), response.status)
    }
    if (!isValidScanResponse(payload)) {
      throw localError("invalid_response")
    }
    return payload
  } catch (error) {
    if (error instanceof ReceiptScannerApiError) throw error
    throw new ReceiptScannerApiError(networkError(error))
  } finally {
    abort.cleanup()
  }
}

function createRequestId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export async function scanSingleReceiptWithApi(file: File, options: ReceiptScannerApiOptions = {}) {
  validateImageFile(file)
  const form = new FormData()
  form.append("image", file)
  return postScan("/scan/single", form, options)
}

export async function scanLongReceiptWithApi(files: { top: File; bottom: File }, options: ReceiptScannerApiOptions = {}) {
  validateImageFile(files?.top)
  validateImageFile(files?.bottom)
  if (sameImageFile(files.top, files.bottom)) {
    throw localError("images_identical")
  }
  const form = new FormData()
  form.append("top_image", files.top)
  form.append("bottom_image", files.bottom)
  return postScan("/scan/long-receipt", form, options)
}
