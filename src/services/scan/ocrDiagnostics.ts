export type LocalOcrErrorType =
  | "none"
  | "module_load_failed"
  | "worker_load_failed"
  | "language_data_load_failed"
  | "empty_result"
  | "timeout"
  | "unknown"

function errorMessage(error: unknown) {
  if (!error) return ""
  if (error instanceof Error) return error.message || error.name || ""
  return String(error)
}

export function classifyLocalOcrError(error: unknown): LocalOcrErrorType {
  const message = errorMessage(error).toLowerCase()
  if (!message) return "none"
  if (message.includes("empty_local_ocr") || message.includes("empty_result")) return "empty_result"
  if (message.includes("timeout") || message.includes("timed out")) return "timeout"
  if (
    message.includes("failed to fetch dynamically imported module")
    || message.includes("importing a module script failed")
    || message.includes("tesseract__js.js")
    || message.includes("/node_modules/.vite/deps/")
  ) {
    return "module_load_failed"
  }
  if (
    message.includes("traineddata")
    || message.includes("langpath")
    || message.includes("tessdata")
    || message.includes("language data")
  ) {
    return "language_data_load_failed"
  }
  if (
    message.includes("createworker")
    || message.includes("worker")
    || message.includes("worker script")
  ) {
    return "worker_load_failed"
  }
  return "unknown"
}

export function isTechnicalLocalOcrFailure(errorType: string | null | undefined) {
  return errorType === "module_load_failed"
    || errorType === "worker_load_failed"
    || errorType === "language_data_load_failed"
    || errorType === "timeout"
}
