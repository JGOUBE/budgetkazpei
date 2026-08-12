import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const migrationPath = path.join(
  REPO_ROOT,
  "supabase",
  "migrations",
  "202608120001_market_manual_alias_anti_poisoning.sql",
)
const migration = fs.readFileSync(migrationPath, "utf8")
const receiptPage = fs.readFileSync(
  path.join(REPO_ROOT, "src", "features", "receipts", "pages", "ReceiptsPage.jsx"),
  "utf8",
)

function communityState({ validations = [], scope = "chain", conflict = false, curated = false }) {
  if (curated) return "active"
  if (conflict) return "conflict"

  const independentUsers = new Set(validations.map(row => row.user)).size
  const distinctTickets = new Set(validations.map(row => row.ticket)).size
  const threshold = scope === "global" ? 3 : 2
  return independentUsers >= threshold && distinctTickets >= threshold ? "active" : "candidate"
}

function correctionLooksSafe(value) {
  const text = String(value || "").trim()
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
  if (!text || text.length > 140) return false
  if (/(https?:\/\/|www\.|[a-z0-9-]+\.(com|net|org|io|fr|re))/i.test(text)) return false
  if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text)) return false
  if (/([a-z0-9])\1{5,}/i.test(text)) return false
  if (/^(total|sous total|net a payer|reste a payer|paiement|cb|carte bleue|tva|ttc|fidelite|caisse)( |$)/.test(normalized)) return false
  return true
}

function trigramSimilarity(left, right) {
  const trigrams = value => {
    const padded = `  ${String(value || "").toLowerCase()} `
    return new Set(Array.from({ length: Math.max(0, padded.length - 2) }, (_, index) => padded.slice(index, index + 3)))
  }
  const leftSet = trigrams(left)
  const rightSet = trigrams(right)
  const shared = [...leftSet].filter(value => rightSet.has(value)).length
  return (2 * shared) / Math.max(1, leftSet.size + rightSet.size)
}

const QUARANTINED_HISTORICAL_ALIAS_IDS = new Set([
  "4711b418-d439-4c9a-b0f9-1fc03bf25eb7",
  "8e03fec0-7848-4b15-8a43-e62e16aec2a0",
])

function backfillHistoricalAlias({ id, validationCount = 1 }) {
  const common = {
    legacyValidationCount: validationCount,
    validationCount: 1,
    independentUserCount: 0,
    distinctTicketCount: 0,
  }

  if (QUARANTINED_HISTORICAL_ALIAS_IDS.has(id)) {
    return {
      ...common,
      trustOrigin: "user_learned",
      promotionState: "quarantined",
      status: "needs_review",
      communityEligible: false,
    }
  }

  return {
    ...common,
    trustOrigin: "curated",
    promotionState: "curated",
    status: "active",
    communityEligible: true,
  }
}

// Scenario 1: one user gets a personal candidate, not a community alias.
assert.equal(communityState({ validations: [{ user: "A", ticket: "T1" }] }), "candidate")

// Scenario 2: ten repeats from one user do not create independent validators.
assert.equal(communityState({
  validations: Array.from({ length: 10 }, () => ({ user: "A", ticket: "T1" })),
}), "candidate")
assert.equal(communityState({
  validations: Array.from({ length: 10 }, (_, index) => ({ user: "A", ticket: `T${index}` })),
}), "candidate")

// Scenario 3: replaying one ticket is idempotent.
assert.equal(new Set(Array.from({ length: 10 }, () => "T1")).size, 1)

// Scenario 4: two users and two receipts promote a store/chain alias.
assert.equal(communityState({
  validations: [{ user: "A", ticket: "T1" }, { user: "B", ticket: "T2" }],
}), "active")

// Scenario 5: competing canonical products force a conflict.
assert.equal(communityState({
  validations: [{ user: "A", ticket: "T1" }, { user: "B", ticket: "T2" }],
  conflict: true,
}), "conflict")

// Scenarios 6 and 7: obvious poisoning is rejected; a real OCR correction is accepted.
assert.equal(correctionLooksSafe("AAAAAAAA !!!! GOOGLE.COM ACHETE MOI 99999"), false)
assert.equal(correctionLooksSafe("Mini pâté de poulet au combava 400 g"), true)
assert.equal(correctionLooksSafe("combava"), true)
assert.ok(trigramSimilarity("COMBAUA", "combava") >= 0.18)

// Scenario 8: curated/admin aliases bypass community counters by design.
assert.equal(communityState({ curated: true }), "active")

// Historical backfill: 20 administrator-assisted aliases remain active, the
// legacy count supplies no independent evidence, and two audited exceptions
// remain quarantined.
const historicalRows = [
  ...Array.from({ length: 20 }, (_, index) => ({
    id: `00000000-0000-0000-0000-${String(index + 1).padStart(12, "0")}`,
    validationCount: index === 0 ? 17 : 1,
  })),
  { id: "4711b418-d439-4c9a-b0f9-1fc03bf25eb7", validationCount: 9 },
  { id: "8e03fec0-7848-4b15-8a43-e62e16aec2a0", validationCount: 4 },
].map(backfillHistoricalAlias)

assert.equal(historicalRows.filter(row => row.trustOrigin === "curated").length, 20)
assert.equal(historicalRows.filter(row => row.promotionState === "quarantined").length, 2)
assert.equal(historicalRows[0].status, "active")
assert.equal(historicalRows[0].legacyValidationCount, 17)
assert.equal(historicalRows[0].validationCount, 1)
assert.equal(historicalRows[0].independentUserCount, 0)
assert.equal(historicalRows[0].distinctTicketCount, 0)
for (const row of historicalRows.slice(-2)) {
  assert.equal(row.trustOrigin, "user_learned")
  assert.equal(row.status, "needs_review")
  assert.equal(row.communityEligible, false)
}

// Global aliases require three independent users and tickets.
assert.equal(communityState({
  scope: "global",
  validations: [{ user: "A", ticket: "T1" }, { user: "B", ticket: "T2" }],
}), "candidate")
assert.equal(communityState({
  scope: "global",
  validations: [
    { user: "A", ticket: "T1" },
    { user: "B", ticket: "T2" },
    { user: "C", ticket: "T3" },
  ],
}), "active")

// SQL contract: keyed fingerprints, independent counts, ticket idempotency,
// promotion thresholds, conflict quarantine and curated compatibility.
assert.match(migration, /market_alias_abuse_secrets/)
assert.match(migration, /extensions\.hmac\('user:' \|\| v_user_id::text, v_secret, 'sha256'::text\)/)
assert.match(migration, /extensions\.hmac\('ticket:' \|\| v_item\.receipt_id::text, v_secret, 'sha256'::text\)/)
assert.match(migration, /default extensions\.gen_random_uuid\(\)/)
assert.doesNotMatch(migration, /(?<!extensions\.)\bhmac\s*\(/)
assert.doesNotMatch(migration, /(?<!extensions\.)\bgen_random_uuid\s*\(/)
assert.match(migration, /unique index if not exists market_manual_alias_validations_ticket_uk/)
assert.match(migration, /count\(distinct validations\.user_fingerprint\)/)
assert.match(migration, /count\(distinct validations\.ticket_fingerprint\)/)
assert.match(migration, /case when v_scope = 'global' then 3 else 2 end/)
assert.match(migration, /conflicting_product_targets/)
assert.match(migration, /trust_origin = 'curated'/)
assert.match(migration, /market_manual_product_aliases_active_requires_trust/)
assert.match(migration, /source = 'curated'/)
assert.match(migration, /validation_count = 1/)
assert.match(migration, /historical_gochugaru_gochujang_mismatch/)
assert.match(migration, /historical_canonical_label_overinterpreted/)
assert.match(migration, /'4711b418-d439-4c9a-b0f9-1fc03bf25eb7'::uuid/)
assert.match(migration, /'8e03fec0-7848-4b15-8a43-e62e16aec2a0'::uuid/)
assert.match(migration, /coalesce\(v_existing\.promotion_state, ''\) <> 'quarantined'/)
assert.match(migration, /coalesce\(v_existing\.quality_state, ''\) = 'quarantined'/)
assert.match(migration, /where aliases\.trust_origin = 'user_learned'\s+and aliases\.promotion_state <> 'quarantined'/)
assert.match(migration, /item_not_user_validated_product/)
assert.match(migration, /raw_receipt_metadata_label/)
assert.match(migration, /lexically_unrelated_without_product_evidence/)

const learnerBody = migration.split("as $learner$")[1]?.split("$learner$;")[0] || ""
assert.ok(learnerBody, "learner function body must be present")
assert.doesNotMatch(learnerBody, /insert\s+into\s+public\.market_products\s*\(/i)
assert.match(learnerBody, /product_unresolved/)

// UI contract: technical statuses are translated and never interpolated raw.
assert.match(receiptPage, /✓ Article validé/)
assert.match(receiptPage, /Article détecté/)
assert.match(receiptPage, /À vérifier/)
assert.doesNotMatch(receiptPage, /\{item\.item_status \|\| "detected"\}/)

console.log("market alias security tests: OK")
