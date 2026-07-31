const APPROVED_STATUSES = new Set(["approved_price", "approved_promotion"])
const REJECTED_STATUSES = new Set(["rejected", "duplicate"])

export function normalizeRetailStatus(status) {
  return String(status || "").trim().toLowerCase()
}

export function hasReferenceProduct(item = {}) {
  return Boolean(String(item?.matched_market_product_id || "").trim())
}

export function getRetailPublishMode(item = {}) {
  return item?.price_type === "promotion" ? "promotion" : "observed_price"
}

export function getRetailApprovalStatusForItem(item = {}) {
  return getRetailPublishMode(item) === "promotion" ? "approved_promotion" : "approved_price"
}

export function canCandidateBeApproved(item = {}, nextStatus = getRetailApprovalStatusForItem(item)) {
  const currentStatus = normalizeRetailStatus(item.status)
  const targetStatus = normalizeRetailStatus(nextStatus)
  const currentPrice = Number(item.current_price || 0)

  if (currentStatus === "published" || REJECTED_STATUSES.has(currentStatus)) return false
  if (!APPROVED_STATUSES.has(targetStatus)) return false
  if (!hasReferenceProduct(item)) return false
  if (!(currentPrice > 0)) return false

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
