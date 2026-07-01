const MAX_SIZE = 1800
const QUALITY = 0.82
const LANDSCAPE_RECEIPT_RATIO = 1.15

export type OptimizedImage = {
  file: File
  width: number
  height: number
}

export async function optimizeReceiptImage(file: File): Promise<OptimizedImage> {
  if (!file || !file.type.startsWith("image/")) {
    throw new Error("invalid_image")
  }

  const bitmap = await createImageBitmap(file)
  const shouldRotateToPortrait = bitmap.width > bitmap.height * LANDSCAPE_RECEIPT_RATIO
  const sourceWidth = shouldRotateToPortrait ? bitmap.height : bitmap.width
  const sourceHeight = shouldRotateToPortrait ? bitmap.width : bitmap.height
  const ratio = Math.min(1, MAX_SIZE / Math.max(sourceWidth, sourceHeight))
  const width = Math.max(1, Math.round(sourceWidth * ratio))
  const height = Math.max(1, Math.round(sourceHeight * ratio))
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("canvas_unavailable")

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"
  ctx.filter = "grayscale(.08) contrast(1.18) brightness(1.06) saturate(.92)"

  if (shouldRotateToPortrait) {
    ctx.translate(width, 0)
    ctx.rotate(Math.PI / 2)
    ctx.drawImage(bitmap, 0, 0, height, width)
  } else {
    ctx.drawImage(bitmap, 0, 0, width, height)
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(result => result ? resolve(result) : reject(new Error("image_optimization_failed")), "image/jpeg", QUALITY)
  })

  return {
    file: new File([blob], "receipt-optimized.jpg", { type: "image/jpeg", lastModified: Date.now() }),
    width,
    height,
  }
}
