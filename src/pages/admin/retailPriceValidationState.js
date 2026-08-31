const APPROVED_STATUSES = new Set(["approved_price", "approved_promotion"])
const REJECTED_STATUSES = new Set(["rejected", "duplicate"])
const RETAIL_UNIT_VALUES = ["unite", "bloc", "piece", "kg", "g", "l", "cl", "ml"]
const VOLUME_OR_WEIGHT_UNITS = new Set(["kg", "g", "l", "cl", "ml"])
const PIECE_UNITS = new Set(["unite", "piece"])

export const RETAIL_UNIT_OPTIONS = [
  { value: "", label: "Choisir" },
  { value: "unite", label: "unite" },
  { value: "bloc", label: "bloc" },
  { value: "piece", label: "piece" },
  { value: "kg", label: "kg" },
  { value: "g", label: "g" },
  { value: "l", label: "l" },
  { value: "cl", label: "cl" },
  { value: "ml", label: "ml" },
]

function normalizeRetailUnit(value) {
  return String(value || "").trim().toLowerCase()
}

function normalizeFormatText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

function formatMentionsBloc(format) {
  return /\bblocs?\b/.test(format)
}

function formatMentionsPiece(format) {
  return /\b(?:pieces?|unites?)\b/.test(format)
}

function isAllowedRetailUnit(unit) {
  return unit === "" || RETAIL_UNIT_VALUES.includes(unit)
}

function hasPositiveValue(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0
}

export function normalizeRetailStatus(status) {
  return String(status || "").trim().toLowerCase()
}

export function hasReferenceProduct(item = {}) {
  return Boolean(String(item?.matched_market_product_id || "").trim())
}

export function getRetailPublishMode(item = {}) {
  return item?.price_type === "promotion" ? "promotion" : "observed_price"
}

export function getRetailPromotionPublicationState(item = {}, referenceNow = new Date()) {
  if (item?.price_type !== "promotion" || item?.promotion_proven !== true) {
    return { kind: "not_promotion", message: "Prix observe." }
  }

  const now = referenceNow instanceof Date ? referenceNow.getTime() : Date.parse(referenceNow)
  const startsAt = item?.starts_at ? Date.parse(item.starts_at) : Number.NaN
  const endsAt = item?.ends_at ? Date.parse(item.ends_at) : Number.NaN

  if (Number.isFinite(endsAt) && endsAt < now) {
    return {
      kind: "expired",
      message: "Promotion terminee — le prix sera conserve comme prix observe.",
    }
  }

  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt < startsAt) {
    return {
      kind: "incomplete",
      message: "La periode de promotion est incomplete. Le prix sera enregistre comme prix observe.",
    }
  }

  if (startsAt > now) {
    return {
      kind: "not_active_yet",
      message: "La promotion n'est pas encore active. Le prix sera conserve comme prix observe.",
    }
  }

  return { kind: "active", message: "Promotion active avec une periode commerciale exploitable." }
}

export function getRetailApprovalStatusForItem(item = {}) {
  return getRetailPublishMode(item) === "promotion" ? "approved_promotion" : "approved_price"
}

export function getRetailQuantityValidationErrors(item = {}) {
  const errors = []
  const format = normalizeFormatText(item.package_format)
  const quantityUnit = normalizeRetailUnit(item.quantity_unit)
  const totalQuantityUnit = normalizeRetailUnit(item.total_quantity_unit)
  const unitPriceUnit = normalizeRetailUnit(item.unit_price_unit)
  const packCount = item.pack_count === "" || item.pack_count === null || item.pack_count === undefined
    ? null
    : Number(item.pack_count)

  if (!isAllowedRetailUnit(quantityUnit)) {
    errors.push("L'unite de quantite est invalide.")
  }

  if (!isAllowedRetailUnit(totalQuantityUnit)) {
    errors.push("L'unite de quantite totale est invalide.")
  }

  if (!isAllowedRetailUnit(unitPriceUnit)) {
    errors.push("L'unite du prix unitaire est invalide.")
  }

  if (item.quantity_value !== null && item.quantity_value !== undefined && item.quantity_value !== "" && quantityUnit === "") {
    errors.push("La quantite exige une unite de quantite.")
  }

  if (item.total_quantity_value !== null && item.total_quantity_value !== undefined && item.total_quantity_value !== "" && totalQuantityUnit === "") {
    errors.push("La quantite totale exige une unite de quantite.")
  }

  if (item.unit_price !== null && item.unit_price !== undefined && item.unit_price !== "" && unitPriceUnit === "") {
    errors.push("Le prix unitaire exige une unite.")
  }

  if (packCount !== null && (!Number.isInteger(packCount) || packCount <= 0)) {
    errors.push("Le nombre d'unites du lot doit etre un entier strictement positif.")
  }

  if (formatMentionsBloc(format)) {
    if (VOLUME_OR_WEIGHT_UNITS.has(quantityUnit) || VOLUME_OR_WEIGHT_UNITS.has(totalQuantityUnit)) {
      errors.push("Un format en blocs ne peut pas conserver des quantites en litre, centilitre, millilitre, kilogramme ou gramme.")
    }
    if (unitPriceUnit !== "" && unitPriceUnit !== "bloc") {
      errors.push("Un format en blocs exige une unite de prix unitaire en bloc.")
    }
  }

  if (formatMentionsPiece(format)) {
    if (VOLUME_OR_WEIGHT_UNITS.has(quantityUnit) || VOLUME_OR_WEIGHT_UNITS.has(totalQuantityUnit)) {
      errors.push("Un format en pieces ou en unites ne peut pas conserver des quantites en litre, centilitre, millilitre, kilogramme ou gramme.")
    }
    if (unitPriceUnit !== "" && !PIECE_UNITS.has(unitPriceUnit)) {
      errors.push("Un format en pieces ou en unites exige une unite de prix unitaire en piece ou en unite.")
    }
  }

  if (packCount !== null && packCount > 1 && hasPositiveValue(item.unit_price) && VOLUME_OR_WEIGHT_UNITS.has(unitPriceUnit) && (formatMentionsBloc(format) || formatMentionsPiece(format))) {
    errors.push("Un produit vendu en lot exige une unite de prix unitaire coherente avec le lot.")
  }

  return errors
}

export function canCandidateBeApproved(item = {}, nextStatus = getRetailApprovalStatusForItem(item)) {
  const currentStatus = normalizeRetailStatus(item.status)
  const targetStatus = normalizeRetailStatus(nextStatus)
  const currentPrice = Number(item.current_price || 0)

  if (currentStatus === "published" || REJECTED_STATUSES.has(currentStatus)) return false
  if (!APPROVED_STATUSES.has(targetStatus)) return false
  if (!hasReferenceProduct(item)) return false
  if (!(currentPrice > 0)) return false
  if (getRetailQuantityValidationErrors(item).length > 0) return false

  if (targetStatus === "approved_price") {
    return getRetailPublishMode(item) === "observed_price"
  }

  if (targetStatus === "approved_promotion") {
    return getRetailPublishMode(item) === "promotion" && item?.promotion_proven === true
  }

  return false
}

export function candidateReadyToPublish(item = {}) {
  const approvalStatus = getRetailApprovalStatusForItem(item)
  return normalizeRetailStatus(item.status) === approvalStatus && canCandidateBeApproved(item, approvalStatus)
}

export function getRetailAdminBucket(item = {}) {
  const status = normalizeRetailStatus(item.status)

  if (status === "published") return "published"
  if (REJECTED_STATUSES.has(status)) return "rejected"
  if (candidateReadyToPublish(item)) return "ready"
  return "needs_review"
}

export function getRetailAdminBucketLabel(bucket) {
  if (bucket === "ready") return "Prets a publier"
  if (bucket === "published") return "Publies"
  if (bucket === "rejected") return "Rejetes"
  return "A verifier"
}

export function getRetailProductStateLabel(item = {}) {
  return hasReferenceProduct(item) ? "Produit associe" : "Produit de reference a associer"
}

export function getRetailPublishFunctionName(item = {}) {
  return getRetailPublishMode(item) === "promotion"
    ? "retail_publish_promotion_candidates"
    : "retail_publish_price_candidates"
}
