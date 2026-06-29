const MAX_IMAGE_SIZE = 1600
const JPEG_QUALITY = 0.78
const MAX_INPUT_BYTES = 12 * 1024 * 1024

export function assertReceiptImage(file) {
  if (!file) throw new Error("missing_file")
  if (!String(file.type || "").startsWith("image/")) throw new Error("invalid_file")
  if (file.size > MAX_INPUT_BYTES) throw new Error("file_too_large")
}

export async function compressReceiptImage(file) {
  assertReceiptImage(file)

  const bitmap = await createImageBitmap(file)
  const ratio = Math.min(1, MAX_IMAGE_SIZE / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * ratio))
  const height = Math.max(1, Math.round(bitmap.height * ratio))
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext("2d")
  ctx.drawImage(bitmap, 0, 0, width, height)

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => {
        if (!blob) {
          reject(new Error("compression_failed"))
          return
        }

        resolve(
          new File([blob], "receipt.jpg", {
            type: "image/jpeg",
            lastModified: Date.now(),
          })
        )
      },
      "image/jpeg",
      JPEG_QUALITY
    )
  })
}
