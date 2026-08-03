function normalizeText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function normalizePackage(value = "") {
  return normalizeText(value)
    .replace(/\b(\d+)og\b/g, "$10g")
    .replace(/\bgr\b/g, "g")
    .replace(/\s+/g, " ")
    .trim()
}

function cleanText(value = "", max = 180) {
  return String(value || "").trim().slice(0, max)
}

function cleanOptionalText(value = "", max = 180) {
  const next = cleanText(value, max)
  return next || null
}

function assertCuratedProof(condition, message) {
  if (!condition) {
    throw new Error(`invalid_curated_market_alias_proof:${message}`)
  }
}

const BRAND_PATTERNS = [
  { label: "McCain", pattern: /\bmc\s*cain\b/i },
  { label: "Belin", pattern: /\bbelin\b/i },
  { label: "LU", pattern: /\blu\b/i },
  { label: "CILAOS", pattern: /\bcilaos\b/i },
  { label: "Notre Jardin", pattern: /\bnotre\s+jard(?:i|e)n\b/i },
  { label: "ECO +", pattern: /\beco\+?\b/i },
  { label: "Les Croises", pattern: /\bcroises\b/i },
  { label: "Pilpa", pattern: /\bpilpa\b/i },
  { label: "Poulain", pattern: /\bpoulain\b/i },
]

const CURATED_WEB_PROOFS = [
  {
    labels: ["eau cilaos pack 1l 25 x6"],
    source_type: "commercial_product_page",
    source_name: "drive_zeclerc_reunion",
    alias_source: "open_prices",
    source_url: "https://www.drivezeclerc.re/portail-st-leu/boissons/992-eau-cilaos-pack-6-x-125l.html",
    source_domain: "drivezeclerc.re",
    source_title: "Eau Cilaos pack 6 x 1,25 L",
    candidate_canonical_name: "Eau Cilaos pack 6 x 1,25 L",
    brand: "CILAOS",
    category: "boissons",
    package_format: "6 x 1,25 l",
    factual_excerpt: "Pack de 6 bouteilles de 1,25 L Cilaos reference sur une page commerciale E.Leclerc Reunion.",
    store_chain_key: "e leclerc",
    matching_evidence: {
      source: "curated_web_proof",
      source_kind: "commercial_exact_page",
      domain: "drivezeclerc.re",
      exact_reference_identified: true,
      checked_at: "2026-07-27",
      justification: "chain_exact_name_brand_package",
    },
  },
  {
    labels: ["lent ile gra oie notre jarden"],
    source_type: "commercial_product_page",
    source_name: "drive_zeclerc_reunion",
    alias_source: "open_prices",
    source_url: "https://www.drivezeclerc.re/les-terrass/epicerie-salee/7904-lentilles-cuisinees-a-la-graisse-d-oie-400-g-notre-jardin.html",
    source_domain: "drivezeclerc.re",
    source_title: "Lentilles cuisinees a la graisse d'oie 400 g Notre Jardin",
    candidate_canonical_name: "Lentilles cuisinees a la graisse d'oie 400 g",
    brand: "Notre Jardin",
    category: "alimentaire",
    package_format: "400 g",
    factual_excerpt: "Reference E.Leclerc Reunion indiquant lentilles cuisinees a la graisse d'oie, marque Notre Jardin, format 400 g.",
    store_chain_key: "e leclerc",
    matching_evidence: {
      source: "curated_web_proof",
      source_kind: "commercial_exact_page",
      domain: "drivezeclerc.re",
      exact_reference_identified: true,
      checked_at: "2026-07-27",
      justification: "chain_exact_name_brand_package",
    },
  },
  {
    labels: ["compote de pomme 4 x 100 g", "compote pomme"],
    source_type: "official_product_page",
    source_name: "e_leclerc",
    alias_source: "open_prices",
    source_url: "https://www.e.leclerc/fp/coupelles-allegees-en-sucres-pomme-4-x-100-g-eco-3450970027847",
    source_domain: "e.leclerc",
    source_title: "Coupelles allegees en sucres pomme 4 x 100 g ECO+",
    candidate_canonical_name: "Compote de pomme 4 x 100 g",
    brand: null,
    category: "alimentaire",
    package_format: "4 x 100 g",
    factual_excerpt: "Page produit E.Leclerc mentionnant coupelles pomme ECO+ par 4 x 100 g.",
    store_chain_key: "e leclerc",
    matching_evidence: {
      source: "curated_web_proof",
      source_kind: "official_exact_page",
      domain: "e.leclerc",
      exact_reference_identified: true,
      checked_at: "2026-07-27",
      raw_brand_hint: "ECO +",
      manual_review_reason: "chain_private_label_without_ticket_brand",
      justification: "exact_name_and_package_but_private_label_brand_missing_on_ticket",
    },
  },
  {
    labels: ["macedoine de legumes 265 g", "maced legumes"],
    source_type: "commercial_product_page",
    source_name: "drive_zeclerc_reunion",
    alias_source: "open_prices",
    source_url: "https://www.drivezeclerc.re/st-benoit/epicerie-salee/8636-macedoine-de-legumes-1-2-265g-pne1058969.html",
    source_domain: "drivezeclerc.re",
    source_title: "Macedoine de legumes 265 g",
    candidate_canonical_name: "Macedoine de legumes 265 g",
    brand: "Notre Jardin",
    category: "alimentaire",
    package_format: "265 g",
    factual_excerpt: "Page commerciale E.Leclerc Reunion mentionnant macedoine de legumes 265 g.",
    store_chain_key: "e leclerc",
    matching_evidence: {
      source: "curated_web_proof",
      source_kind: "commercial_exact_page",
      domain: "drivezeclerc.re",
      exact_reference_identified: true,
      checked_at: "2026-07-27",
      manual_review_reason: "generic_label",
      justification: "generic_label_and_multiple_private_label_variants_in_chain",
    },
  },
  {
    labels: ["sticks sales"],
    source_type: "official_product_page",
    source_name: "e_leclerc",
    source_url: "https://www.e.leclerc/fp/sticks-sales-250-g-eco-3564700016574",
    source_domain: "e.leclerc",
    source_title: "Sticks sales 250 g ECO+",
    candidate_canonical_name: "Sticks sales 250 g",
    brand: "ECO +",
    category: "alimentaire",
    package_format: "250 g",
    factual_excerpt: "Page produit E.Leclerc mentionnant des sticks sales ECO+ en sachet de 250 g.",
    store_chain_key: "e leclerc",
    matching_evidence: {
      source: "curated_web_proof",
      source_kind: "official_exact_page",
      domain: "e.leclerc",
      exact_reference_identified: true,
      checked_at: "2026-07-27",
      manual_review_reason: "generic_label",
      justification: "generic_label_without_ticket_brand_or_unique_variant",
    },
  },
  {
    labels: ["chamonix belin 250g"],
    source_type: "commercial_product_page",
    source_name: "alphaprix",
    source_url: "https://www.alphaprix.com/7956-chamonix-250g-ref-cl104.html",
    source_domain: "alphaprix.com",
    source_title: "Chamonix 250 g",
    candidate_canonical_name: "Chamonix 250 g",
    brand: "LU",
    category: "alimentaire",
    package_format: "250 g",
    factual_excerpt: "Page commerciale Alphaprix indiquant Chamonix 250 g marque LU.",
    matching_evidence: {
      source: "curated_web_proof",
      source_kind: "commercial_exact_page",
      domain: "alphaprix.com",
      exact_reference_identified: true,
      checked_at: "2026-07-27",
      raw_brand_hint: "Belin",
      manual_review_reason: "brand_conflict",
      justification: "source_brand_lu_conflicts_with_raw_label_belin",
    },
  },
]

function validateCuratedProofCatalog() {
  for (const proof of CURATED_WEB_PROOFS) {
    const labels = Array.isArray(proof.labels) ? proof.labels.map(label => normalizeText(label)).filter(Boolean) : []
    const domain = cleanOptionalText(proof.source_domain || proof.matching_evidence?.domain, 120)
    const checkedAt = cleanOptionalText(proof.matching_evidence?.checked_at, 40)
    const sourceUrl = cleanOptionalText(proof.source_url, 500)
    const productName = cleanOptionalText(proof.candidate_canonical_name, 180)
    const sourceName = cleanOptionalText(proof.source_name, 120)
    const manualReviewReason = cleanOptionalText(proof.matching_evidence?.manual_review_reason, 120)

    assertCuratedProof(labels.length > 0, `missing_raw_label:${proof.source_url || proof.source_name || "unknown"}`)
    assertCuratedProof(Boolean(sourceUrl), `missing_source_url:${labels.join(",")}`)
    assertCuratedProof(Boolean(domain), `missing_domain:${labels.join(",")}`)
    assertCuratedProof(Boolean(productName), `missing_product_name:${labels.join(",")}`)
    assertCuratedProof(Boolean(sourceName), `missing_source_name:${labels.join(",")}`)
    assertCuratedProof(Boolean(checkedAt), `missing_checked_at:${labels.join(",")}`)
    assertCuratedProof(
      !(
        proof.matching_evidence?.exact_reference_identified === true
        && manualReviewReason
        && manualReviewReason !== "generic_label"
        && manualReviewReason !== "chain_private_label_without_ticket_brand"
        && manualReviewReason !== "brand_conflict"
      ),
      `high_confidence_unresolved_contradiction:${labels.join(",")}`,
    )
  }
}

validateCuratedProofCatalog()

function extractRawPackageHint(rawLabel = "") {
  const normalized = normalizeText(rawLabel)
    .replace(/\b(\d+)og\b/g, "$10g")
  const packMatch = normalized.match(/\b(\d+)\s*x\s*(\d+(?:[.,]\d+)?)\s*(kg|g|gr|ml|cl|l)\b/)
  if (packMatch) {
    return `${packMatch[1]} x ${packMatch[2].replace(",", ".")} ${packMatch[3] === "gr" ? "g" : packMatch[3]}`
  }
  const invertedPackMatch = normalized.match(/\b(\d+(?:[.,]\d+)?)\s*(kg|g|gr|ml|cl|l)\s*x\s*(\d+)\b/)
  if (invertedPackMatch) {
    return `${invertedPackMatch[3]} x ${invertedPackMatch[1].replace(",", ".")} ${invertedPackMatch[2] === "gr" ? "g" : invertedPackMatch[2]}`
  }
  const unitMatch = normalized.match(/\b(\d+(?:[.,]\d+)?)\s*(kg|g|gr|ml|cl|l)\b/)
  if (unitMatch) {
    return `${unitMatch[1].replace(",", ".")} ${unitMatch[2] === "gr" ? "g" : unitMatch[2]}`
  }
  return ""
}

function correctedOcrVariant(rawLabel = "") {
  return cleanText(
    String(rawLabel || "")
      .replace(/\b(\d+)OG\b/gi, "$10G")
      .replace(/\b25OG\b/gi, "250G")
      .replace(/\b1L\.25\b/gi, "1,25L")
      .replace(/\bDEUFS\b/gi, "OEUFS")
      .replace(/\bJARDEN\b/gi, "JARDIN"),
    180,
  )
}

function coreProductQuery(rawLabel = "", brandHint = "", packageHint = "") {
  const normalized = normalizeText(rawLabel)
    .replace(/\b(?:eco|plus|pack|cop|pne)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  const tokens = normalized
    .split(" ")
    .filter(token => token.length >= 3 && !/^\d/.test(token) && !["x", "kg", "g", "ml", "cl", "l"].includes(token))
  const parts = [
    brandHint,
    tokens.slice(0, 5).join(" "),
    packageHint,
  ].filter(Boolean)
  return cleanText(parts.join(" ").replace(/\s+/g, " "), 180)
}

export function inferObservedBrandHint(item = {}) {
  if (cleanOptionalText(item.brand_hint, 80)) return cleanOptionalText(item.brand_hint, 80)
  const rawLabel = String(item.raw_label || "")
  for (const candidate of CURATED_WEB_PROOFS) {
    const rawBrandHint = candidate.matching_evidence?.raw_brand_hint
    if (rawBrandHint && normalizeText(rawLabel).includes(normalizeText(rawBrandHint))) {
      return rawBrandHint
    }
  }
  for (const brand of BRAND_PATTERNS) {
    if (brand.pattern.test(rawLabel)) return brand.label
  }
  return null
}

export function inferObservedPackageHint(item = {}) {
  return cleanOptionalText(item.package_format_hint, 80) || cleanOptionalText(extractRawPackageHint(item.raw_label), 80)
}

export function buildProgressiveWebQueries(item = {}) {
  const rawLabel = cleanText(item.raw_label, 180)
  const normalizedVariant = cleanText(normalizeText(rawLabel).replace(/\s+/g, " "), 180)
  const correctedVariant = correctedOcrVariant(rawLabel)
  const brandHint = inferObservedBrandHint(item) || ""
  const packageHint = inferObservedPackageHint(item) || ""
  const chainHint = cleanOptionalText(item.store_name || item.store_chain_key, 120) || ""
  const coreQuery = coreProductQuery(rawLabel, brandHint, packageHint)

  return Array.from(new Set([
    rawLabel,
    normalizedVariant,
    correctedVariant,
    coreQuery,
    brandHint && coreProductQuery(rawLabel, brandHint, ""),
    packageHint && coreProductQuery(rawLabel, "", packageHint),
    chainHint && `${chainHint} ${coreQuery || correctedVariant || rawLabel}`.trim(),
    `${coreQuery || correctedVariant || rawLabel} reunion`.trim(),
    `${coreQuery || correctedVariant || rawLabel} site officiel`.trim(),
  ].filter(Boolean))).slice(0, 8)
}

export function buildCuratedProofCandidates(item = {}) {
  const normalizedRawLabel = normalizeText(item.normalized_raw_label || item.raw_label)
  return CURATED_WEB_PROOFS
    .filter(candidate => candidate.labels.some(label => normalizeText(label) === normalizedRawLabel))
    .map(candidate => ({
      alias_source: cleanOptionalText(candidate.alias_source, 80),
      source_type: candidate.source_type,
      source_name: candidate.source_name,
      source_identifier: candidate.source_url,
      source_url: candidate.source_url,
      raw_label: cleanText(item.raw_label, 180),
      candidate_canonical_name: candidate.candidate_canonical_name,
      brand: candidate.brand,
      category: candidate.category,
      package_format: candidate.package_format,
      barcode: null,
      observed_price: item.observed_price_min ?? item.observed_price_max ?? null,
      store_name: item.store_name || "",
      store_city: item.store_city || "",
      source_confidence: 0.74,
      matching_evidence: {
        ...candidate.matching_evidence,
        proof_labels: candidate.labels.map(label => normalizeText(label)),
        proof_match_key: normalizedRawLabel,
        source_domain: candidate.source_domain || candidate.matching_evidence?.domain || null,
        source_title: candidate.source_title || candidate.candidate_canonical_name,
        factual_excerpt: candidate.factual_excerpt || null,
        store_chain_key: candidate.store_chain_key || null,
      },
    }))
}

export function buildCuratedProofAuditEntries(item = {}, rankedRows = [], classification = "not_found") {
  return rankedRows
    .filter(row => row.matching_evidence?.source === "curated_web_proof")
    .map(row => {
      const contradictions = []
      const coherences = []
      const ticketBrand = inferObservedBrandHint(item)
      const ticketPackage = inferObservedPackageHint(item)
      const sourceBrand = cleanOptionalText(row.brand, 80)
      const sourcePackage = cleanOptionalText(row.package_format, 80)

      if (ticketBrand && sourceBrand && normalizeText(ticketBrand) === normalizeText(sourceBrand)) {
        coherences.push("brand_match")
      } else if (ticketBrand && sourceBrand && normalizeText(ticketBrand) !== normalizeText(sourceBrand)) {
        contradictions.push("brand_conflict")
      }

      if (ticketPackage && sourcePackage && normalizePackage(ticketPackage) === normalizePackage(sourcePackage)) {
        coherences.push("package_match")
      } else if (ticketPackage && sourcePackage && normalizePackage(ticketPackage) !== normalizePackage(sourcePackage)) {
        contradictions.push("package_conflict")
      }

      if (Number(row.matching_evidence?.name_score || 0) >= 0.75) {
        coherences.push("name_match")
      }

      return {
        raw_label: item.raw_label,
        found_name: row.candidate_canonical_name,
        ticket_brand: ticketBrand,
        source_brand: sourceBrand,
        ticket_package: ticketPackage,
        source_package: sourcePackage,
        domain: row.matching_evidence?.source_domain || row.matching_evidence?.domain || null,
        checked_at: row.matching_evidence?.checked_at || null,
        factual_excerpt: row.matching_evidence?.factual_excerpt || null,
        source_type: row.matching_evidence?.source_kind || row.source_type,
        coherences,
        contradictions,
        classification,
        justification: row.matching_evidence?.justification || null,
        source_url: row.source_url || null,
      }
    })
}

export const __marketAliasCuratedEvidenceTestUtils = {
  buildCuratedProofCandidates,
  buildCuratedProofAuditEntries,
  buildProgressiveWebQueries,
  inferObservedBrandHint,
  inferObservedPackageHint,
}
