const MAX_SIZE = 1800
const QUALITY = 0.82
const LANDSCAPE_RECEIPT_RATIO = 1.15

export type OptimizedImage = {
  file: File
  width: number
  height: number
  originalWidth: number
  originalHeight: number
  orientation: "portrait" | "landscape"
  rotationApplied: 0 | 90
  compressionQuality: number
  preProcessing: string[]
  segments: OptimizedImageSegment[]
}

export type OptimizedImageSegment = {
  segment: "top" | "middle" | "bottom"
  file: File
  width: number
  height: number
  yStartPercent: number
  yEndPercent: number
  overlapPercent: number
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

  const segmentSpecs: Array<{ segment: OptimizedImageSegment["segment"]; start: number; end: number }> = [
    { segment: "top", start: 0, end: 0.4 },
    { segment: "middle", start: 0.32, end: 0.72 },
    { segment: "bottom", start: 0.64, end: 1 },
  ]

  const segments = await Promise.all(segmentSpecs.map(async spec => {
    const y = Math.max(0, Math.floor(height * spec.start))
    const segmentHeight = Math.max(1, Math.min(height - y, Math.ceil(height * (spec.end - spec.start))))
    const segmentCanvas = document.createElement("canvas")
    segmentCanvas.width = width
    segmentCanvas.height = segmentHeight
    const segmentCtx = segmentCanvas.getContext("2d")
    if (!segmentCtx) throw new Error("canvas_unavailable")
    segmentCtx.imageSmoothingEnabled = true
    segmentCtx.imageSmoothingQuality = "high"
    segmentCtx.drawImage(canvas, 0, y, width, segmentHeight, 0, 0, width, segmentHeight)
    const segmentBlob = await new Promise<Blob>((resolve, reject) => {
      segmentCanvas.toBlob(result => result ? resolve(result) : reject(new Error("image_segment_failed")), "image/jpeg", QUALITY)
    })

    return {
      segment: spec.segment,
      file: new File([segmentBlob], `receipt-${spec.segment}.jpg`, { type: "image/jpeg", lastModified: Date.now() }),
      width,
      height: segmentHeight,
      yStartPercent: spec.start,
      yEndPercent: spec.end,
      overlapPercent: 8,
    }
  }))

  return {
    file: new File([blob], "receipt-optimized.jpg", { type: "image/jpeg", lastModified: Date.now() }),
    width,
    height,
    originalWidth: bitmap.width,
    originalHeight: bitmap.height,
    orientation: shouldRotateToPortrait ? "landscape" : "portrait",
    rotationApplied: shouldRotateToPortrait ? 90 : 0,
    compressionQuality: QUALITY,
    preProcessing: [
      "auto_resize",
      "soft_grayscale",
      "contrast_boost",
      "brightness_boost",
      "soft_deskew_orientation",
      shouldRotateToPortrait ? "landscape_to_portrait_rotation" : "rotation_kept",
    ],
    segments,
  }
}
