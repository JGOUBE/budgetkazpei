type QuotaRefreshInput = {
  engineUsed?: unknown
  error?: unknown
}

type ScanMetricsLike = {
  engine_used?: unknown
  engineUsed?: unknown
  provider?: unknown
  aiUsed?: unknown
  ai_used?: unknown
}

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase()
}

function readErrorCode(error: unknown) {
  if (!error || typeof error !== "object") return ""

  const candidate = error as {
    code?: unknown
    status?: unknown
    statusCode?: unknown
    scanError?: {
      code?: unknown
    }
  }

  return normalize(candidate.scanError?.code || candidate.code)
}

function readErrorStatus(error: unknown) {
  if (!error || typeof error !== "object") return null

  const candidate = error as {
    status?: unknown
    statusCode?: unknown
    scanError?: {
      status?: unknown
    }
  }

  const raw = candidate.status ?? candidate.statusCode ?? candidate.scanError?.status
  const parsed = Number(raw)

  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Le service Python réserve et comptabilise déjà le scan côté Supabase.
 * Le frontend ne doit donc pas incrémenter une seconde fois scan_usage.
 *
 * Le moteur historique conserve son ancien comportement :
 * l'incrément frontend reste autorisé uniquement lorsqu'un véritable
 * appel IA est explicitement indiqué dans les métriques.
 */
export function shouldIncrementClientScanUsage(metrics: ScanMetricsLike | null | undefined) {
  if (!metrics) return false

  const engine = normalize(metrics.engine_used || metrics.engineUsed)
  const provider = normalize(metrics.provider)

  if (engine === "python" || provider === "python_receipt_scanner") {
    return false
  }

  return metrics.aiUsed === true
    || metrics.ai_used === true
    || provider.includes("openai")
}

/**
 * Après un scan Python traité, le quota affiché doit être relu depuis Supabase.
 * Il faut aussi le rafraîchir après un refus 429/quota afin que l'interface
 * reflète immédiatement la valeur serveur.
 */
export function shouldRefreshQuotaAfterPythonScan({
  engineUsed,
  error,
}: QuotaRefreshInput = {}) {
  if (normalize(engineUsed) === "python") {
    return true
  }

  const status = readErrorStatus(error)
  const code = readErrorCode(error)

  return status === 429
    || code === "monthly_quota_reached"
    || code === "scan_safety_limit_reached"
    || code === "quota_reached"
}