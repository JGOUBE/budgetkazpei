import { normalizeForAssistantMatch } from "./assistantLanguage.js"

const DAY_MS = 24 * 60 * 60 * 1000

function startOfDay(value) {
  const date = new Date(value)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(value, days) {
  const date = new Date(value)
  date.setDate(date.getDate() + days)
  return date
}

function startOfWeek(value) {
  const date = startOfDay(value)
  const mondayOffset = (date.getDay() + 6) % 7
  return addDays(date, -mondayOffset)
}

function formatIsoDate(value) {
  const date = new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function formatLabel(start, endExclusive, language = "fr") {
  const locale = language === "kr" || language === "kreol" ? "fr-RE" : "fr-FR"
  const end = addDays(endExclusive, -1)
  const dateText = value => value
    .toLocaleDateString(locale, { day: "numeric", month: "long" })
    .replace(/^1\s/, "1er ")
  const startText = dateText(start)
  const endText = dateText(end)
  return formatIsoDate(start) === formatIsoDate(end) ? startText : `${startText} → ${endText}`
}

function makeRange(type, start, endExclusive, language) {
  return {
    type,
    start,
    end: endExclusive,
    startDate: formatIsoDate(start),
    endDate: formatIsoDate(endExclusive),
    inclusiveEndDate: formatIsoDate(addDays(endExclusive, -1)),
    label: formatLabel(start, endExclusive, language),
  }
}

function comparableMonthRanges(now, offset, language) {
  const currentStart = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1)
  const isCurrentMonth = offset === 0
  const elapsedDays = isCurrentMonth
    ? Math.max(1, Math.floor((startOfDay(now) - currentStart) / DAY_MS) + 1)
    : Math.round((currentMonthEnd - currentStart) / DAY_MS)
  const currentEnd = isCurrentMonth ? addDays(currentStart, elapsedDays) : currentMonthEnd
  const previousStart = new Date(currentStart.getFullYear(), currentStart.getMonth() - 1, 1)
  const previousMonthEnd = new Date(currentStart.getFullYear(), currentStart.getMonth(), 1)
  const previousEnd = new Date(Math.min(addDays(previousStart, elapsedDays).getTime(), previousMonthEnd.getTime()))

  return {
    current: makeRange(offset === 0 ? "current_month_to_date" : "previous_month", currentStart, currentEnd, language),
    previous: makeRange("previous_comparable_month", previousStart, previousEnd, language),
  }
}

export function resolveBudgetPeriod(question = "", now = new Date(), language = "fr") {
  const today = startOfDay(now)
  const tomorrow = addDays(today, 1)
  const text = normalizeForAssistantMatch(question)

  if (text.includes("30 derniers jours") || text.includes("derniers 30 jours") || text.includes("dernier 30 jours") || text.includes("30 zours")) {
    const currentStart = addDays(tomorrow, -30)
    return {
      current: makeRange("rolling_30_days", currentStart, tomorrow, language),
      previous: makeRange("previous_30_days", addDays(currentStart, -30), currentStart, language),
    }
  }

  if (text.includes("semaine derniere") || text.includes("semen derniere")) {
    const currentEnd = startOfWeek(today)
    const currentStart = addDays(currentEnd, -7)
    return {
      current: makeRange("previous_week", currentStart, currentEnd, language),
      previous: makeRange("week_before_previous", addDays(currentStart, -7), currentStart, language),
    }
  }

  if (text.includes("cette semaine") || text.includes("sa semaine") || text.includes("sa semen")) {
    const currentStart = startOfWeek(today)
    const elapsedDays = Math.floor((today - currentStart) / DAY_MS) + 1
    const previousStart = addDays(currentStart, -7)
    return {
      current: makeRange("current_week_to_date", currentStart, tomorrow, language),
      previous: makeRange("previous_comparable_week", previousStart, addDays(previousStart, elapsedDays), language),
    }
  }

  if (text.includes("aujourd hui") || text.includes("zordi")) {
    return {
      current: makeRange("today", today, tomorrow, language),
      previous: makeRange("previous_day", addDays(today, -1), today, language),
    }
  }

  if (text.includes("mois dernier") || text.includes("mwa dernier")) {
    return comparableMonthRanges(today, -1, language)
  }

  return comparableMonthRanges(today, 0, language)
}

export function dateIsInBudgetRange(value, range) {
  if (!value || !range?.start || !range?.end) return false
  const raw = String(value).slice(0, 10)
  const [year, month, day] = raw.split("-").map(Number)
  const date = Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)
    ? new Date(year, month - 1, day)
    : new Date(value)
  return Number.isFinite(date.getTime()) && date >= range.start && date < range.end
}
