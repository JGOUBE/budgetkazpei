const MAX_SIZE = 1800
const QUALITY = 0.82

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
  const ratio = Math.min(1, MAX_SIZE / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * ratio))
  const height = Math.max(1, Math.round(bitmap.height * ratio))
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("canvas_unavailable")

  ctx.filter = "contrast(1.08) brightness(1.04) saturate(.95)"
  ctx.drawImage(bitmap, 0, 0, width, height)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(result => result ? resolve(result) : reject(new Error("image_optimization_failed")), "image/jpeg", QUALITY)
  })

  return {
    file: new File([blob], "receipt-optimized.jpg", { type: "image/jpeg", lastModified: Date.now() }),
    width,
    height,
  }
}
