export const RECEIPT_IMAGE_SIGNED_URL_MAX_SECONDS = 600

export function isReceiptRetentionBackendMissing(error) {
  const code = String(error?.code || "").trim().toUpperCase()
  const message = String(error?.message || error?.details || "").toLowerCase()

  return code === "PGRST202"
    || code === "42883"
    || (
      message.includes("receipt_image_remaining_seconds")
      && (
        message.includes("could not find the function")
        || message.includes("does not exist")
        || message.includes("schema cache")
      )
    )
}

export function resolveReceiptImageSigningWindow({ remainingSeconds, retentionError } = {}) {
  if (retentionError) {
    if (isReceiptRetentionBackendMissing(retentionError)) {
      return {
        expiresIn: RECEIPT_IMAGE_SIGNED_URL_MAX_SECONDS,
        retentionBackendAvailable: false,
        reason: "retention_backend_not_deployed",
      }
    }

    return {
      expiresIn: 0,
      retentionBackendAvailable: true,
      reason: "retention_backend_error",
    }
  }

  if (remainingSeconds == null || remainingSeconds === "") {
    return {
      expiresIn: RECEIPT_IMAGE_SIGNED_URL_MAX_SECONDS,
      retentionBackendAvailable: true,
      reason: "retention_information_unavailable",
    }
  }

  const seconds = Number(remainingSeconds)
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return {
      expiresIn: 0,
      retentionBackendAvailable: true,
      reason: "expired_or_unavailable",
    }
  }

  return {
    expiresIn: Math.min(RECEIPT_IMAGE_SIGNED_URL_MAX_SECONDS, Math.max(1, Math.floor(seconds))),
    retentionBackendAvailable: true,
    reason: "available",
  }
}

export async function createCompatibleReceiptImageUrl({
  receiptId,
  imagePath,
  fetchRetentionWindow,
  createSignedUrl,
  onLegacyFallback,
} = {}) {
  if (!receiptId || !imagePath) return ""

  const { data: remainingSeconds, error: retentionError } = await fetchRetentionWindow(receiptId)
  const signingWindow = resolveReceiptImageSigningWindow({ remainingSeconds, retentionError })

  if (["retention_backend_not_deployed", "retention_information_unavailable"].includes(signingWindow.reason)) {
    onLegacyFallback?.({ receiptId, imagePath })
  }
  if (signingWindow.expiresIn <= 0) return ""

  const { data, error } = await createSignedUrl(imagePath, signingWindow.expiresIn)
  if (error) return ""
  return data?.signedUrl || ""
}
