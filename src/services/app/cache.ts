const PREFIX = "budgetkazpei:cache:"

export function readCache<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`${PREFIX}${key}`)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return parsed?.value ?? fallback
  } catch {
    return fallback
  }
}

export function writeCache<T>(key: string, value: T) {
  try {
    localStorage.setItem(`${PREFIX}${key}`, JSON.stringify({ value, updated_at: new Date().toISOString() }))
  } catch {
    // Cache is optional.
  }
}
