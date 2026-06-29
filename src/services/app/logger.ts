type LogLevel = "info" | "warn" | "error"

const LOG_PREFIX = "[BudgetKazPei]"

export function appLog(level: LogLevel, message: string, context: Record<string, unknown> = {}) {
  const payload = {
    message,
    context,
    at: new Date().toISOString(),
  }

  if (level === "error") {
    console.error(LOG_PREFIX, payload)
    return
  }

  if (level === "warn") {
    console.warn(LOG_PREFIX, payload)
    return
  }

  console.info(LOG_PREFIX, payload)
}

export function captureError(error: unknown, context: Record<string, unknown> = {}) {
  appLog("error", error instanceof Error ? error.message : String(error), context)
}
