export const RECEIPT_IMAGE_RETENTION_DAYS = 7
export const RECEIPT_IMAGE_RETENTION_MS = RECEIPT_IMAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000

export function uniqueStoragePaths(values = []) {
  return [...new Set(values.flatMap(value => Array.isArray(value) ? value : [value])
    .map(value => String(value || "").trim())
    .filter(Boolean))]
}

export function isReceiptImageAvailable(receipt, now = new Date()) {
  if (!receipt || receipt.image_deleted_at) return false
  const expiresAt = new Date(receipt.image_expires_at || "")
  if (!Number.isFinite(expiresAt.getTime())) return false
  return expiresAt.getTime() > new Date(now).getTime()
}

export async function runRetentionBatch({
  receiptCandidates = [],
  orphanCandidates = [],
  dryRun = false,
  removeStoragePaths,
  finalizeReceipt,
} = {}) {
  const result = {
    dryRun: Boolean(dryRun),
    receiptsExamined: receiptCandidates.length,
    receiptsFinalized: 0,
    trackedImages: 0,
    inlineImages: 0,
    orphanImages: orphanCandidates.length,
    storageImagesDeleted: 0,
    failures: [],
  }

  for (const candidate of receiptCandidates) {
    const paths = uniqueStoragePaths(candidate.storage_paths || [])
    result.trackedImages += paths.length
    if (candidate.has_inline_image) result.inlineImages += 1
    if (dryRun) continue

    try {
      if (paths.length) {
        await removeStoragePaths(paths)
        result.storageImagesDeleted += paths.length
      }
      await finalizeReceipt(candidate.receipt_id)
      result.receiptsFinalized += 1
    } catch (error) {
      result.failures.push({
        kind: "receipt",
        receiptId: candidate.receipt_id,
        message: String(error?.message || error),
      })
    }
  }

  const orphanPaths = uniqueStoragePaths(orphanCandidates.map(candidate => candidate.storage_path))
  if (orphanPaths.length && !dryRun) {
    try {
      await removeStoragePaths(orphanPaths)
      result.storageImagesDeleted += orphanPaths.length
    } catch (error) {
      result.failures.push({
        kind: "orphan_batch",
        count: orphanPaths.length,
        message: String(error?.message || error),
      })
    }
  }

  return result
}
