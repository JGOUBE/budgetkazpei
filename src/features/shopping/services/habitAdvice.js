import {
  buildComparableProductIdentity,
  buildReliableSavingsSuggestions,
  evaluateSavingsProductEligibility,
  extractComparablePackage,
} from "../../../services/savings/savingsEngine.ts"
import { normalizeMerchantName } from "./priceHistory.ts"

const SNACK_PATTERN = /\b(?:biscuits?|cookies?|gateaux?|gouters?|madeleines?|barquettes?|sables?|palets?|brownies?|quatre\s+quarts)\b/

function normalize(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function getDistinctPurchaseVisits(items = []) {
  const visits = new Set()
  for (const item of items) {
    const date = String(item.purchase_date || item.created_at || "").slice(0, 10)
    const receipt = item.receipt_id || item.transaction_id || ""
    if (!date && !receipt) continue
    visits.add(receipt ? "receipt:" + receipt : "date:" + date)
  }
  return visits.size
}

/**
 * Conseils calculés à partir des achats de l'utilisateur uniquement.
 * On ne déduit ni quantité consommée, ni régime alimentaire, ni prix actuel.
 * Les propositions de magasins ne proviennent que du moteur de comparaisons
 * fiables de tickets déjà enregistrés, avec date de la dernière observation.
 */

function getProductLabel(item = {}) {
  return String(item.product_name || item.corrected_name || item.normalized_name || "").trim()
}

function money(value) {
  const parsed = Number(String(value ?? 0).replace(",", "."))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function roundAmount(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function validDate(item = {}) {
  const value = item.purchase_date || item.created_at || ""
  const parsed = value ? new Date(value) : null
  return parsed && Number.isFinite(parsed.getTime()) ? parsed.toISOString() : ""
}

/**
 * Repère une dépense cumulée importante, sans l'extrapoler sur une année
 * ni présenter une économie fictive.
 */
function buildRecurringSpendAdvice(items) {
  const groups = new Map()
  for (const item of items) {
    const label = getProductLabel(item)
    const normalized = normalize(label)
    if (!normalized || !validDate(item)) continue
    const key = normalized
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(item)
  }

  return [...groups.values()]
    .map(rows => {
      const visits = getDistinctPurchaseVisits(rows)
      const totalSpent = roundAmount(rows.reduce((sum, row) => sum + money(row.price), 0))
      const latest = [...rows].sort((a, b) => validDate(b).localeCompare(validDate(a)))[0]
      return {
        type: "spending",
        key: "spending:" + normalize(getProductLabel(latest)),
        product: getProductLabel(latest),
        totalSpent,
        purchaseCount: rows.length,
        receiptCount: visits,
      }
    })
    .filter(entry => entry.purchaseCount >= 3 && entry.receiptCount >= 3 && entry.totalSpent >= 12)
    .sort((a, b) => b.totalSpent - a.totalSpent || b.receiptCount - a.receiptCount)[0] || null
}

/**
 * Compare seulement deux lignes de tickets du même magasin, avec
 * désignation ET format identiques connus. Un changement de quantité,
 * de format ou un nom vague ne doit pas être appelé hausse de prix.
 */
function buildObservedPriceIncrease(items) {
  const groups = new Map()
  for (const item of items) {
    const label = getProductLabel(item)
    const date = validDate(item)
    const store = normalizeMerchantName(item.store || "")
    const packageInfo = extractComparablePackage(item)
    const price = money(item.price)
    if (!label || !date || !price || store === "Magasin non renseigne") continue
    if (packageInfo.family === "unknown") continue

    const key = [store, normalize(label), packageInfo.signature].join("|")
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push({ item, label, store, date, price })
  }

  const increases = []
  for (const rows of groups.values()) {
    const distinct = new Set()
    const ordered = rows
      .sort((a, b) => b.date.localeCompare(a.date))
      .filter(row => {
        const receipt = row.item.receipt_id || row.item.transaction_id || row.date.slice(0, 10)
        if (distinct.has(receipt)) return false
        distinct.add(receipt)
        return true
      })
    if (ordered.length < 2) continue

    const latest = ordered[0]
    const previous = ordered[1]
    const latestQty = Number(latest.item.quantity || 0)
    const priorQty = Number(previous.item.quantity || 0)
    if (latestQty !== priorQty || normalize(latest.item.unit || "") !== normalize(previous.item.unit || "")) continue
    const daysApart = (new Date(latest.date).getTime() - new Date(previous.date).getTime()) / 86400000
    if (daysApart < 1) continue
    const increase = roundAmount(latest.price - previous.price)
    const percent = Math.round(100 * increase / previous.price)
    if (increase < 0.15 || percent < 8) continue

    increases.push({
      type: "priceRise",
      key: "price-rise:" + normalize(latest.label) + ":" + normalize(latest.store),
      product: latest.label,
      store: latest.store,
      previousPrice: previous.price,
      latestPrice: latest.price,
      previousDate: previous.date,
      latestDate: latest.date,
      increase,
      percent,
    })
  }

  return increases.sort((a, b) => b.increase - a.increase || b.percent - a.percent)[0] || null
}

export function buildHabitSuggestions(items = []) {
  const eligible = (Array.isArray(items) ? items : []).filter(item =>
    evaluateSavingsProductEligibility(item).eligible && Number(item.price) > 0,
  )
  if (eligible.length === 0) return []

  const suggestions = []
  const identities = new Map()
  for (const item of eligible) {
    const key = buildComparableProductIdentity(item)?.key
    if (!key) continue
    const group = identities.get(key) || []
    group.push(item)
    identities.set(key, group)
  }

  const reliablePrices = buildReliableSavingsSuggestions(eligible)
    .filter(entry => {
      const observations = identities.get(entry.productKey) || []
      return observations.length >= 2 && getDistinctPurchaseVisits(observations) >= 2
    })
    .slice(0, 2)

  for (const entry of reliablePrices) {
    suggestions.push({
      type: "price",
      key: "price:" + entry.productKey,
      product: entry.product,
      store: entry.bestStore,
      referenceStore: entry.referenceStore,
      alternativePrice: entry.alternativePrice,
      referencePrice: entry.referencePrice,
      unitLabel: entry.unitLabel,
      normalizedComparison: entry.normalizedComparison,
      observedAt: entry.lastObservedAt,
      saving: entry.potentialSaving,
    })
  }

  // Même famille, sans confondre le nombre d'achats avec la consommation.
  const snackRows = eligible.filter(item =>
    SNACK_PATTERN.test(normalize(item.product_name || item.corrected_name || item.normalized_name || "")),
  )
  if (snackRows.length >= 3 && getDistinctPurchaseVisits(snackRows) >= 2) {
    suggestions.push({
      type: "habit",
      key: "habit:homemade-snacks",
      purchaseCount: snackRows.length,
    })
  }

  const priceRise = buildObservedPriceIncrease(eligible)
  const repeatSpend = buildRecurringSpendAdvice(eligible)
  // Jusqu'à trois pistes différentes : comparaison historique, évolution,
  // suggestion pratique ou constat budgétaire. Pas de « gain » inventé.
  const choices = [
    suggestions.find(suggestion => suggestion.type === "price"),
    priceRise,
    suggestions.find(suggestion => suggestion.type === "habit"),
    repeatSpend,
  ].filter(Boolean)

  return choices.slice(0, 3)
}
