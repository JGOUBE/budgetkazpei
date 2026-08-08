import assert from "node:assert/strict"
import {
  buildAtomicExecutionSql,
  buildConfirmationToken,
  buildExecutionEntries,
  computePlanDigest,
  validateExecutablePlan,
} from "./apply_market_alias_plan.mjs"

const item = {
  recommended_action: "library",
  classification: "active_library_ready",
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
    evidence: {
      classification: "active_library_ready",
    },
  },
}

const plan = {
  dry_run_only: true,
  source_report: "reports/fixture-report.json",
  summary: {
    applicable_count: 1,
  },
  rpc_preview: {
    function: "market_apply_scoped_alias_library",
    args: {
      p_items: [item],
    },
  },
}

const report = {
  items: [
    {
      raw_label: "POULAIN SP",
      normalized_raw_label: "poulain sp",
      store_chain_key: "e leclerc",
      frequency: 8,
    },
  ],
}

assert.equal(validateExecutablePlan(plan).length, 1)
assert.deepEqual(buildExecutionEntries(plan, report), [
  {
    normalized_raw_label: "poulain sp",
    store_chain_key: "e leclerc",
    expected_count: 8,
  },
])

const digest = computePlanDigest(plan)
assert.match(digest, /^[0-9a-f]{64}$/)
assert.equal(
  buildConfirmationToken(plan),
  `APPLY_MARKET_ALIAS_PLAN:${digest.slice(0, 20)}`,
)

const sql = buildAtomicExecutionSql({ plan, sourceReport: report })
assert.match(sql, /market_apply_scoped_alias_library/)
assert.match(sql, /rpc_guard/)
assert.match(sql, /alias_guard/)
assert.match(sql, /line_guard/)
assert.match(sql, /live_count <> expected_count/)
assert.match(sql, /conflict_count <> 0/)
assert.match(sql, /market_match_type = 'alias_exact'/)
assert.match(sql, /market_product_id is null/)
assert.match(sql, /jsonb_build_object/)

assert.throws(
  () => validateExecutablePlan({
    ...plan,
    rpc_preview: {
      ...plan.rpc_preview,
      args: {
        p_items: [{
          ...item,
          proposed_alias: {
            ...item.proposed_alias,
            scope: "global",
          },
        }],
      },
    },
  }),
  /unsupported_scope/,
)

assert.throws(
  () => buildExecutionEntries(plan, {
    items: [{
      ...report.items[0],
      frequency: 0,
    }],
  }),
  /invalid_expected_count/,
)

assert.throws(
  () => validateExecutablePlan({
    ...plan,
    summary: {
      applicable_count: 2,
    },
  }),
  /plan_summary_count_mismatch/,
)

console.log("market alias atomic apply tests: OK")