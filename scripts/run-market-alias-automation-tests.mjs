import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  containsBrandAsWholeToken,
  normalizeAutomationStoreChain,
} from "./marketAliasAutomationRules.mjs"
import {
  buildAutomationSelectionSql,
  summarizeAutomationRows,
} from "./prepare_market_alias_automation_batch.mjs"
import {
  evaluateExternalCandidateMatch,
} from "../src/services/scan/marketExternalCandidateService.js"

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

assert.equal(normalizeAutomationStoreChain("E.Leclerc Saint-Leu"), "e leclerc")
assert.equal(normalizeAutomationStoreChain("Super U"), "u")
assert.equal(normalizeAutomationStoreChain("Leader Price RÃ©union"), "leader price")

assert.equal(containsBrandAsWholeToken("POULAIN SP", "Poulain"), true)
assert.equal(containsBrandAsWholeToken("Biscuits Chamonix LU 250 g", "LU"), true)
assert.equal(containsBrandAsWholeToken("CHAMONIX BELIN 250G", "LU"), false)
assert.equal(containsBrandAsWholeToken("POULET FRAIS ROTI TRADITION", "U"), false)
assert.equal(containsBrandAsWholeToken("POMME ROSTY S MC CAIN 800G", "MC CAIN"), true)


const shortBrandCandidate = evaluateExternalCandidateMatch({
  raw_label: "POULET FRAIS ROTI TRADITION",
  brand: "",
  package_format: "",
  observed_price: 7.5,
  candidate: {
    source_type: "open_food_facts",
    source_name: "open_food_facts",
    raw_label: "POULET FRAIS ROTI TRADITION",
    candidate_canonical_name: "Poulet rÃ´ti U",
    brand: "U",
    observed_price: 7.5,
  },
})
assert.equal(shortBrandCandidate.matching_evidence.brand_score, 0)
assert.equal(shortBrandCandidate.matching_evidence.exact_brand, false)

const wholeTokenBrandCandidate = evaluateExternalCandidateMatch({
  raw_label: "CHAMONIX LU 250G",
  brand: "",
  package_format: "250 g",
  observed_price: 2.5,
  candidate: {
    source_type: "official_product_page",
    source_name: "official",
    raw_label: "CHAMONIX LU 250G",
    candidate_canonical_name: "Biscuits Chamonix LU 250 g",
    brand: "LU",
    package_format: "250 g",
    observed_price: 2.5,
  },
})
assert.equal(wholeTokenBrandCandidate.matching_evidence.brand_score, 1)
assert.equal(wholeTokenBrandCandidate.matching_evidence.exact_brand, true)
const sql = buildAutomationSelectionSql({
  storeChain: "e leclerc",
  limit: 20,
  offset: 5,
})

assert.match(sql, /dedupe_fingerprint/)
assert.match(sql, /count\(distinct dedupe_fingerprint\)::int as distinct_receipts/)
assert.match(sql, /receipt_items\.market_product_id is null/)
assert.match(sql, /market_product_aliases/)
assert.match(sql, /market_manual_product_aliases/)
assert.match(sql, /market_external_product_candidates/)
assert.match(sql, /offset 5/)
assert.match(sql, /limit 20/)

const summary = summarizeAutomationRows([
  {
    frequency: 23,
    registered_receipts: 23,
    distinct_receipts: 11,
    probable_duplicates: 12,
  },
  {
    frequency: 8,
    registered_receipts: 8,
    distinct_receipts: 8,
    probable_duplicates: 0,
  },
], "e leclerc")

assert.deepEqual(summary, {
  store_chain: "e leclerc",
  selected_count: 2,
  raw_line_occurrences: 31,
  registered_receipt_occurrences: 31,
  deduplicated_receipt_occurrences: 19,
  probable_duplicate_occurrences: 12,
})

const runnerSource = fs.readFileSync(
  path.join(REPO_ROOT, "scripts", "run_market_alias_automation.mjs"),
  "utf8",
)

assert.match(runnerSource, /"--dry-run"/)
assert.doesNotMatch(runnerSource, /"--apply-library",/)
assert.match(runnerSource, /phase_1_is_dry_run_only/)

console.log("market alias automation tests: OK")