import {
  buildComparableProductIdentity,
  buildReliableSavingsSuggestions,
  evaluateSavingsProductEligibility,
} from "../../../services/savings/savingsEngine.ts"

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

  // Une ou deux pistes par écran, pour éviter un nouveau bloc défilant.
  return suggestions.slice(0, 2)
}
