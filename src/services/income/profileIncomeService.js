import { supabase } from "../supabase"

const PROFILE_INCOME_SOURCE = "profile_income"
const PROFILE_INCOME_LABEL = "Revenus du foyer"

function money(value) {
  return Number(String(value ?? 0).replace(",", ".")) || 0
}

function formatDateYMD(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function getCurrentMonthRange(now = new Date()) {
  return {
    firstDay: formatDateYMD(new Date(now.getFullYear(), now.getMonth(), 1)),
    lastDay: formatDateYMD(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    today: formatDateYMD(now),
  }
}

function cleanAidRows(aides = []) {
  return (Array.isArray(aides) ? aides : [])
    .map((aide, index) => ({
      id: aide.id || `aide-${index + 1}`,
      label: String(aide.label || aide.designation || "").trim(),
      amount: money(aide.amount),
    }))
    .filter(row => row.label || row.amount > 0)
}

export function normalizeIncomeDetails(details = {}, revenusFoyer = 0) {
  const normalized = {
    salaire_parent_1: money(details.salaire_parent_1 ?? details.salary_parent_1),
    salaire_parent_2: money(details.salaire_parent_2 ?? details.salary_parent_2),
    france_travail: money(details.france_travail),
    autres_revenus: money(details.autres_revenus),
    aides: cleanAidRows(details.aides),
  }

  const total = getIncomeDetailsTotal(normalized)

  if (total <= 0 && money(revenusFoyer) > 0) {
    return {
      ...normalized,
      autres_revenus: money(revenusFoyer),
    }
  }

  return normalized
}

export function getIncomeDetailsTotal(details = {}) {
  return (
    money(details.salaire_parent_1) +
    money(details.salaire_parent_2) +
    money(details.france_travail) +
    money(details.autres_revenus) +
    cleanAidRows(details.aides).reduce((sum, aide) => sum + money(aide.amount), 0)
  )
}

export function buildIncomeRows(details = {}, revenusFoyer = 0) {
  const normalized = normalizeIncomeDetails(details, revenusFoyer)
  const rows = []

  if (money(normalized.salaire_parent_1) > 0) {
    rows.push({ label: "Salaire parent 1", amount: money(normalized.salaire_parent_1), icon: "💼" })
  }

  if (money(normalized.salaire_parent_2) > 0) {
    rows.push({ label: "Salaire parent 2", amount: money(normalized.salaire_parent_2), icon: "💼" })
  }

  if (money(normalized.france_travail) > 0) {
    rows.push({ label: "France Travail", amount: money(normalized.france_travail), icon: "🏛️" })
  }

  cleanAidRows(normalized.aides).forEach(aide => {
    if (money(aide.amount) > 0) {
      rows.push({ label: aide.label || "Aide", amount: money(aide.amount), icon: "🤝" })
    }
  })

  if (money(normalized.autres_revenus) > 0) {
    rows.push({ label: rows.length > 0 ? "Autres revenus" : PROFILE_INCOME_LABEL, amount: money(normalized.autres_revenus), icon: "💰" })
  }

  return rows
}

async function listProfileIncomeRows({ userId, firstDay, lastDay }) {
  const { data, error } = await supabase
    .from("transactions")
    .select("id, label, amount, date, source, created_at")
    .eq("user_id", userId)
    .gte("date", firstDay)
    .lte("date", lastDay)
    .or(`source.eq.${PROFILE_INCOME_SOURCE},label.eq.${PROFILE_INCOME_LABEL}`)
    .order("created_at", { ascending: false })

  if (error) throw error
  return data || []
}

async function deleteRows(userId, rows = []) {
  if (rows.length === 0) return

  const { error } = await supabase
    .from("transactions")
    .delete()
    .eq("user_id", userId)
    .in("id", rows.map(row => row.id))

  if (error) throw error
}

async function insertRows({ userId, rows, date }) {
  if (rows.length === 0) return []

  const payload = rows.map(row => ({
    user_id: userId,
    label: row.label,
    category: "revenus",
    amount: money(row.amount),
    date,
    icon: row.icon || "💰",
    source: PROFILE_INCOME_SOURCE,
  }))

  const { data, error } = await supabase
    .from("transactions")
    .insert(payload)
    .select("*")

  if (error) throw error
  return data || []
}

export async function syncProfileIncomeForCurrentMonth({
  userId,
  revenusFoyer,
  revenusDetails,
  mode = "ensure",
} = {}) {
  if (!userId) return { status: "skipped" }

  const rows = buildIncomeRows(revenusDetails, revenusFoyer)
  const { firstDay, lastDay, today } = getCurrentMonthRange()
  const existingRows = await listProfileIncomeRows({ userId, firstDay, lastDay })

  if (rows.length === 0) {
    if (mode === "profile_update") {
      await deleteRows(userId, existingRows)
      return { status: "deleted", count: existingRows.length }
    }
    return { status: "skipped", reason: "no_profile_income" }
  }

  if (mode === "ensure" && existingRows.length > 0) {
    return { status: "preserved", count: existingRows.length }
  }

  await deleteRows(userId, existingRows)
  const data = await insertRows({ userId, rows, date: today })
  return { status: existingRows.length > 0 ? "updated" : "created", count: data.length, data }
}

export async function saveProfileIncomeDetails({ userId, details = {} }) {
  if (!userId) return { error: "missing_user" }

  const normalized = normalizeIncomeDetails(details)
  const total = getIncomeDetailsTotal(normalized)

  const { data, error } = await supabase
    .from("profiles")
    .update({
      revenus_foyer: total,
      revenus_details: normalized,
    })
    .eq("id", userId)
    .select("*")
    .single()

  if (error) throw error

  const sync = await syncProfileIncomeForCurrentMonth({
    userId,
    revenusFoyer: total,
    revenusDetails: normalized,
    mode: "profile_update",
  })

  return { data, sync }
}

export function isProfileIncomeTransaction(transaction = {}) {
  return transaction?.source === PROFILE_INCOME_SOURCE || transaction?.label === PROFILE_INCOME_LABEL
}
