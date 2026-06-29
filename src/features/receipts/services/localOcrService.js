export async function extractReceiptText(file) {
  if (typeof window === "undefined" || typeof window.TextDetector !== "function") {
    return {
      status: "manual",
      text: "",
      reason: "ocr_unavailable",
    }
  }

  try {
    const detector = new window.TextDetector()
    const bitmap = await createImageBitmap(file)
    const blocks = await detector.detect(bitmap)
    const text = (blocks || [])
      .map(block => block.rawValue || "")
      .filter(Boolean)
      .join("\n")

    return {
      status: text ? "success" : "failed",
      text,
      reason: text ? "" : "empty_ocr",
    }
  } catch (error) {
    console.error("OCR local indisponible:", error)
    return {
      status: "failed",
      text: "",
      reason: "ocr_failed",
    }
  }
}
