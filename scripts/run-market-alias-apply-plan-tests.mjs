import assert from "node:assert/strict"
import {
  buildApplyPlan,
  classifyApplyPlanRow,
} from "./prepare_market_alias_apply_plan.mjs"

const reusable = {
  raw_label: "POULAIN SP",
  normalized_raw_label: "poulain sp",
  classification: "active_library_ready",
  recommended_action: "library",
  ambiguity_reasons: [],
  proposed_alias: {
    product_id: "f3061576-1e12-4ee2-8b8f-58919383c104",
    raw_label: "POULAIN SP",
    normalized_raw_label: "poulain sp",
    source: "open_prices",
    confidence: 1,
    scope: "chain",
    store_id: null,
    store_chain_key: "e leclerc",
    status: "active",
  },
  proposed_new_product: null,
}

const newProduct = {
  raw_label: "EXEMPLE PRODUIT 250G",
  normalized_raw_label: "exemple produit 250g",
  classification: "exact_strong",
  recommended_action: "library",
  ambiguity_reasons: [],
  proposed_alias: {
    raw_label: "EXEMPLE PRODUIT 250G",
    normalized_raw_label: "exemple produit 250g",
    source: "open_prices",
    confidence: 0.99,
    scope: "chain",
    store_id: null,
    store_chain_key: "e leclerc",
    status: "active",
  },
  proposed_new_product: {
    product_key: "name|exemple produit 250 g|brand|exemple|size|250.000|unit|g|count|",
    canonical_name: "Exemple produit 250 g",
    normalized_name: "exemple produit 250 g",
    brand: "Exemple",
    normalized_brand: "exemple",
    package_size_value: 250,
    package_size_unit: "g",
    package_format: "250 g",
  },
}

const ambiguous = {
  raw_label: "PRODUIT VAGUE",
  normalized_raw_label: "produit vague",
  classification: "ambiguous",
  recommended_action: "review",
  proposed_alias: null,
}

const reusableResult = classifyApplyPlanRow(reusable)
assert.equal(reusableResult.eligible, true)
assert.equal("proposed_new_product" in reusableResult.item, false)

const newResult = classifyApplyPlanRow(newProduct)
assert.equal(newResult.eligible, true)
assert.deepEqual(newResult.item.proposed_new_product, newProduct.proposed_new_product)

const ambiguousResult = classifyApplyPlanRow(ambiguous)
assert.equal(ambiguousResult.eligible, false)
assert.equal(ambiguousResult.reason, "classification_not_applicable")

const plan = buildApplyPlan({
  batch_id: "fixture-1",
  items: [reusable, newProduct, ambiguous],
}, { source_report: "fixture.json" })

assert.equal(plan.dry_run_only, true)
assert.equal(plan.summary.report_item_count, 3)
assert.equal(plan.summary.applicable_count, 2)
assert.equal(plan.summary.excluded_count, 1)
assert.equal(plan.summary.writes_performed, 0)
assert.equal(plan.rpc_preview.args.p_items.length, 2)

assert.throws(
  () => buildApplyPlan({ items: [reusable, { ...reusable }] }),
  /duplicate_applicable_alias/,
)

const lowConfidence = classifyApplyPlanRow({
  ...reusable,
  proposed_alias: { ...reusable.proposed_alias, confidence: 0.8 },
})
assert.equal(lowConfidence.eligible, false)
assert.equal(lowConfidence.reason, "confidence_below_apply_threshold")

console.log("market alias apply plan tests: OK")