export async function withRetry<T>(
  fn: () => Promise<T>,
  {
    retries = 2,
    delayMs = 350,
  }: {
    retries?: number
    delayMs?: number
  } = {}
): Promise<T> {
  let lastError: unknown

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1)))
      }
    }
  }

  throw lastError
}
