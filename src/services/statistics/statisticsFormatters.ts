export function moneyValue(value: unknown) {
  return Number(String(value ?? 0).replace(",", ".")) || 0
}

export function startOfPeriod(period = "month") {
  const now = new Date()

  if (period === "lastMonth") {
    return new Date(now.getFullYear(), now.getMonth() - 1, 1)
  }

  if (period === "3months") {
    return new Date(now.getFullYear(), now.getMonth() - 2, 1)
  }

  if (period === "6months") {
    return new Date(now.getFullYear(), now.getMonth() - 5, 1)
  }

  return new Date(now.getFullYear(), now.getMonth(), 1)
}

export function endOfPeriod(period = "month") {
  const now = new Date()

  if (period === "lastMonth") {
    return new Date(now.getFullYear(), now.getMonth(), 1)
  }

  return new Date(now.getFullYear(), now.getMonth() + 1, 1)
}

export function isWithinPeriod(dateValue: string, period = "month") {
  if (!dateValue) return false
  const date = new Date(dateValue)
  return date >= startOfPeriod(period) && date < endOfPeriod(period)
}
