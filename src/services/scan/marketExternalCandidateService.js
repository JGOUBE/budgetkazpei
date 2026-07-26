const AUTO_PROMOTE_BARCODE_THRESHOLD = 0.985
const AUTO_PROMOTE_STRONG_THRESHOLD = 0.955
const SUGGESTION_THRESHOLD = 0.78

const PERSONAL_DATA_KEYS = new Set([
  "user_id",
  "userId",
  "email",
  "name",
  "full_name",
  "receipt_image_url",
  "receipt_image_path",
  "receipt_number",
  "loyalty_card_number",
  "ticket_number",
  "proof_image_url",
])

const REUNION_HINTS = [
  "reunion",
  "réunion",
  "974",
  "saint denis",
  "saint-denis",
  "saint pierre",
  "saint-pierre",
  "saint paul",
  "saint-paul",
  "saint leu",
  "saint-leu",
  "le tampon",
  "tampon",
  "le port",
  "sainte clotilde",
  "les casernes",
]

function stripDiacritics(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

function normalizeMeasurementToken(token = "") {
  const match = String(token || "").match(/^([ilo0-9]{1,4})(kg|gr|g|ml|cl|l)$/)
  if (!match) return token
  const digits = match[1]
    .replace(/[il]/g, "1")
    .replace(/o/g, "0")
  return `${digits}${match[2]}`
}

function normalizeAliasTokens(tokens = []) {
  const hasFoodContext = tokens.some(token => [
    "tarama",
    "cabillaud",
    "oeuf",
    "oeufs",
    "surimi",
    "thon",
    "poisson",
  ].includes(token))

  return tokens.map(token => {
    if (hasFoodContext && ["deufs", "0eufs", "ceufs", "oeufs"].includes(token)) return "oeufs"
    if (hasFoodContext && ["0euf", "oeuf"].includes(token)) return "oeuf"
    return token
  })
}

export function normalizeExternalAliasText(value = "") {
  const tokens = stripDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(normalizeMeasurementToken)

  return normalizeAliasTokens(tokens).join(" ").trim()
}

function normalizeBrand(value = "") {
  return normalizeExternalAliasText(value).slice(0, 80)
}

function normalizePackageFormat(value = "") {
  return normalizeExternalAliasText(value)
    .replace(/\bgr\b/g, "g")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
}

function cleanBarcode(value = "") {
  const barcode = String(value || "").replace(/\D/g, "")
  return barcode.length >= 8 && barcode.length <= 14 ? barcode : null
}

function cleanText(value = "", max = 180) {
  return String(value || "").trim().slice(0, max)
}

function cleanOptionalText(value = "", max = 180) {
  const next = cleanText(value, max)
  return next || null
}

function cleanPrice(value) {
  const price = Number(value)
  return Number.isFinite(price) && price > 0 && price <= 100_000
    ? Number(price.toFixed(2))
    : null
}

function candidateBigrams(value = "") {
  const compact = normalizeExternalAliasText(value).replace(/\s+/g, " ").trim()
  if (compact.length < 2) return compact ? [compact] : []
  const grams = []
  for (let index = 0; index < compact.length - 1; index += 1) {
    grams.push(compact.slice(index, index + 2))
  }
  return grams
}

function diceSimilarity(leftValue, rightValue) {
  const left = candidateBigrams(leftValue)
  const right = candidateBigrams(rightValue)
  if (!left.length || !right.length) return 0
  const counts = new Map()
  for (const gram of right) counts.set(gram, (counts.get(gram) || 0) + 1)
  let overlap = 0
  for (const gram of left) {
    const count = counts.get(gram) || 0
    if (count > 0) {
      counts.set(gram, count - 1)
      overlap += 1
    }
  }
  return (2 * overlap) / (left.length + right.length)
}

function tokenSimilarity(leftValue, rightValue) {
  const left = normalizeExternalAliasText(leftValue).split(" ").filter(token => token.length >= 2)
  const right = normalizeExternalAliasText(rightValue).split(" ").filter(token => token.length >= 2)
  if (!left.length || !right.length) return 0
  const rightSet = new Set(right)
  const overlap = left.filter(token => rightSet.has(token)).length
  return overlap / Math.max(1, Math.min(left.length, right.length))
}

function lexicalSimilarity(leftValue, rightValue) {
  const dice = diceSimilarity(leftValue, rightValue)
  return Math.max(dice, 0.65 * dice + 0.35 * tokenSimilarity(leftValue, rightValue))
}

function packageScore(leftValue, rightValue) {
  const left = normalizePackageFormat(leftValue)
  const right = normalizePackageFormat(rightValue)
  if (!left || !right) return 0
  if (left === right) return 1
  return lexicalSimilarity(left, right)
}

function brandScore(leftValue, rightValue) {
  const left = normalizeBrand(leftValue)
  const right = normalizeBrand(rightValue)
  if (!left || !right) return 0
  if (left === right) return 1
  return lexicalSimilarity(left, right)
}

function priceScore(leftValue, rightValue) {
  const left = cleanPrice(leftValue)
  const right = cleanPrice(rightValue)
  if (left == null || right == null) return 0
  const delta = Math.abs(left - right)
  if (delta <= 0.03) return 1
  const ratio = delta / Math.max(left, right)
  if (ratio <= 0.12) return 0.8
  if (ratio <= 0.25) return 0.5
  return 0
}

function isReunionText(value = "") {
  const normalized = normalizeExternalAliasText(value)
  return REUNION_HINTS.some(hint => normalized.includes(normalizeExternalAliasText(hint)))
}

function inferReunionPriority(candidate = {}) {
  if (candidate?.matching_evidence?.is_reunion === true) return true
  return [
    candidate.store_name,
    candidate.store_city,
    candidate.source_url,
    candidate.source_identifier,
    candidate.matching_evidence?.location,
  ].some(value => isReunionText(value))
}

function sanitizeMatchingEvidence(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const clean = {}
  for (const [key, rawValue] of Object.entries(value)) {
    if (PERSONAL_DATA_KEYS.has(key)) continue
    if (rawValue == null) continue
    if (typeof rawValue === "string") {
      clean[key] = rawValue.slice(0, 500)
    } else if (typeof rawValue === "number" || typeof rawValue === "boolean") {
      clean[key] = rawValue
    } else if (Array.isArray(rawValue)) {
      clean[key] = rawValue
        .filter(entry => typeof entry === "string" || typeof entry === "number")
        .slice(0, 20)
    } else if (typeof rawValue === "object") {
      clean[key] = sanitizeMatchingEvidence(rawValue)
    }
  }
  return clean
}

export function sanitizeExternalCandidateRecord(input = {}) {
  const sourceType = cleanText(input.source_type || input.sourceType, 40) || "structured_external"
  const sourceName = cleanText(input.source_name || input.sourceName, 80) || "unknown_source"
  const rawLabel = cleanText(input.raw_label || input.rawLabel, 180)
  const canonicalName = cleanText(input.candidate_canonical_name || input.candidateCanonicalName, 180)
  if (!rawLabel || !canonicalName) {
    throw new Error("raw_label_and_candidate_canonical_name_required")
  }

  return {
    id: input.id || null,
    source_type: sourceType,
    source_name: sourceName,
    source_identifier: cleanOptionalText(input.source_identifier || input.sourceIdentifier, 120),
    source_url: cleanOptionalText(input.source_url || input.sourceUrl, 500),
    raw_label: rawLabel,
    normalized_raw_label: normalizeExternalAliasText(rawLabel),
    candidate_canonical_name: canonicalName,
    normalized_candidate_name: normalizeExternalAliasText(canonicalName),
    brand: cleanOptionalText(input.brand, 80),
    category: cleanOptionalText(input.category, 120),
    package_format: cleanOptionalText(input.package_format || input.packageFormat, 80),
    barcode: cleanBarcode(input.barcode),
    observed_price: cleanPrice(input.observed_price ?? input.observedPrice),
    store_name: cleanOptionalText(input.store_name || input.storeName, 120),
    store_city: cleanOptionalText(input.store_city || input.storeCity, 80),
    source_confidence: Math.max(0, Math.min(1, Number(input.source_confidence ?? input.sourceConfidence ?? 0) || 0)),
    matching_evidence: sanitizeMatchingEvidence(input.matching_evidence || input.matchingEvidence || {}),
    status: ["candidate", "validated", "rejected"].includes(String(input.status || "candidate"))
      ? String(input.status || "candidate")
      : "candidate",
    matched_product_id: input.matched_product_id || input.matchedProductId || null,
    match_level: input.match_level || input.matchLevel || null,
    promoted_alias_id: input.promoted_alias_id || input.promotedAliasId || null,
    validation_notes: cleanOptionalText(input.validation_notes || input.validationNotes, 500),
    first_seen_at: input.first_seen_at || input.firstSeenAt || null,
    last_seen_at: input.last_seen_at || input.lastSeenAt || null,
  }
}

function conflictWithValidatedUserCorrection(candidate = {}, context = {}) {
  const userCanonical = cleanText(
    context.validated_user_correction
    || context.validatedUserCorrection
    || context.manual_alias_canonical_name
    || context.manualAliasCanonicalName,
    180,
  )
  if (!userCanonical) return false
  return normalizeExternalAliasText(userCanonical) !== candidate.normalized_candidate_name
}

export function evaluateExternalCandidateMatch({
  raw_label,
  brand,
  package_format,
  barcode,
  observed_price,
  store_name,
  store_city,
  candidate,
  context = {},
} = {}) {
  const safeCandidate = sanitizeExternalCandidateRecord({
    ...candidate,
    raw_label: raw_label || candidate?.raw_label || "",
  })

  if (context.manual_alias_priority === true) {
    return {
      ...safeCandidate,
      source_confidence: 0,
      match_level: "rejected",
      should_auto_promote: false,
      should_apply_automatic_replacement: false,
      skip_reason: "manual_alias_priority",
      matching_evidence: {
        ...safeCandidate.matching_evidence,
        priority_source: "manual_alias",
      },
    }
  }

  if (conflictWithValidatedUserCorrection(safeCandidate, context)) {
    return {
      ...safeCandidate,
      source_confidence: 0,
      match_level: "rejected",
      should_auto_promote: false,
      should_apply_automatic_replacement: false,
      skip_reason: "validated_user_correction_conflict",
      matching_evidence: {
        ...safeCandidate.matching_evidence,
        priority_source: "validated_user_correction",
      },
    }
  }

  const barcodeMatch = cleanBarcode(barcode) && cleanBarcode(barcode) === safeCandidate.barcode
  const barcodeLookupMismatch = Boolean(
    cleanBarcode(barcode)
    && safeCandidate.matching_evidence?.source === "barcode_lookup"
    && safeCandidate.barcode
    && cleanBarcode(barcode) !== safeCandidate.barcode,
  )
  const nameScore = lexicalSimilarity(raw_label, safeCandidate.candidate_canonical_name)
  const exactName = normalizeExternalAliasText(raw_label) === safeCandidate.normalized_candidate_name
  const computedBrandScore = brandScore(brand, safeCandidate.brand)
  const exactBrand = normalizeBrand(brand) !== "" && normalizeBrand(brand) === normalizeBrand(safeCandidate.brand)
  const computedPackageScore = packageScore(package_format, safeCandidate.package_format)
  const exactPackage = normalizePackageFormat(package_format) !== ""
    && normalizePackageFormat(package_format) === normalizePackageFormat(safeCandidate.package_format)
  const computedPriceScore = priceScore(observed_price, safeCandidate.observed_price)
  const reunionPriority = inferReunionPriority({
    ...safeCandidate,
    store_name: safeCandidate.store_name || store_name,
    store_city: safeCandidate.store_city || store_city,
  })

  let confidence = 0.42 * nameScore
    + 0.18 * computedBrandScore
    + 0.18 * computedPackageScore
    + 0.12 * computedPriceScore
    + (reunionPriority ? 0.05 : 0)

  if (exactName) confidence += 0.1
  if (exactBrand) confidence += 0.05
  if (exactPackage) confidence += 0.06
  if (barcodeMatch) confidence = 0.995

  confidence = Math.max(0, Math.min(1, Number(confidence.toFixed(4))))

  let matchLevel = "ambiguous"
  let shouldAutoPromote = false
  let shouldApplyAutomaticReplacement = false
  let skipReason = ""

  if (barcodeLookupMismatch) {
    matchLevel = "ambiguous"
    shouldAutoPromote = false
    shouldApplyAutomaticReplacement = false
    skipReason = "barcode_mismatch"
  } else if (barcodeMatch) {
    matchLevel = "exact_strong"
    shouldAutoPromote = confidence >= AUTO_PROMOTE_BARCODE_THRESHOLD
    shouldApplyAutomaticReplacement = shouldAutoPromote
  } else if (exactName && exactBrand && exactPackage) {
    matchLevel = "exact_strong"
    shouldAutoPromote = confidence >= AUTO_PROMOTE_STRONG_THRESHOLD
    shouldApplyAutomaticReplacement = shouldAutoPromote
  } else if (nameScore >= 0.9 && computedBrandScore >= 0.85 && computedPackageScore >= 0.85) {
    matchLevel = "strong_without_barcode"
    shouldAutoPromote = confidence >= AUTO_PROMOTE_STRONG_THRESHOLD
    shouldApplyAutomaticReplacement = false
  } else if (nameScore < SUGGESTION_THRESHOLD) {
    matchLevel = "rejected"
    skipReason = "below_threshold"
  }

  if (exactName && normalizePackageFormat(package_format) && normalizePackageFormat(safeCandidate.package_format) && !exactPackage) {
    matchLevel = "ambiguous"
    shouldAutoPromote = false
    shouldApplyAutomaticReplacement = false
    skipReason = "package_conflict"
  }

  return {
    ...safeCandidate,
    source_confidence: confidence,
    match_level: matchLevel,
    should_auto_promote: shouldAutoPromote,
    should_apply_automatic_replacement: shouldApplyAutomaticReplacement,
    skip_reason: skipReason,
    matching_evidence: {
      ...safeCandidate.matching_evidence,
      reunion_priority: reunionPriority,
      barcode_match: Boolean(barcodeMatch),
      name_score: Number(nameScore.toFixed(4)),
      brand_score: Number(computedBrandScore.toFixed(4)),
      package_score: Number(computedPackageScore.toFixed(4)),
      price_score: Number(computedPriceScore.toFixed(4)),
      exact_name: exactName,
      exact_brand: exactBrand,
      exact_package: exactPackage,
    },
  }
}

export function dedupeExternalCandidates(candidates = []) {
  const bestByKey = new Map()
  for (const candidate of candidates || []) {
    const safeCandidate = sanitizeExternalCandidateRecord(candidate)
    const key = [
      safeCandidate.source_name,
      safeCandidate.source_identifier || "",
      safeCandidate.normalized_raw_label,
      safeCandidate.normalized_candidate_name,
      safeCandidate.barcode || "",
      safeCandidate.store_name || "",
      safeCandidate.store_city || "",
    ].join("::")
    const current = bestByKey.get(key)
    if (!current || Number(safeCandidate.source_confidence || 0) > Number(current.source_confidence || 0)) {
      bestByKey.set(key, safeCandidate)
    }
  }
  return Array.from(bestByKey.values())
}

export function choosePreferredExternalCandidate(candidates = []) {
  return [...(candidates || [])]
    .map(candidate => sanitizeExternalCandidateRecord(candidate))
    .sort((left, right) => {
      const reunionDelta = Number(inferReunionPriority(right)) - Number(inferReunionPriority(left))
      if (reunionDelta !== 0) return reunionDelta
      return Number(right.source_confidence || 0) - Number(left.source_confidence || 0)
    })[0] || null
}

export function buildExternalCandidatePromotion({
  candidate,
  product_id,
  promoted_source = "external_validated",
} = {}) {
  const safeCandidate = sanitizeExternalCandidateRecord(candidate)
  if (!product_id) throw new Error("product_id_required_for_promotion")

  return {
    product_id,
    raw_label: safeCandidate.raw_label,
    normalized_raw_label: safeCandidate.normalized_raw_label,
    source: `${promoted_source}:${safeCandidate.source_name}`,
    confidence: Number((safeCandidate.source_confidence || 0).toFixed(4)),
  }
}

export const EXTERNAL_CANDIDATE_THRESHOLDS = {
  AUTO_PROMOTE_BARCODE_THRESHOLD,
  AUTO_PROMOTE_STRONG_THRESHOLD,
  SUGGESTION_THRESHOLD,
}

export const __marketExternalCandidateTestUtils = {
  brandScore,
  choosePreferredExternalCandidate,
  dedupeExternalCandidates,
  evaluateExternalCandidateMatch,
  inferReunionPriority,
  lexicalSimilarity,
  normalizeExternalAliasText,
  normalizePackageFormat,
  sanitizeExternalCandidateRecord,
}
