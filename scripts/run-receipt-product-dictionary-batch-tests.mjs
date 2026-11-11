import assert from "node:assert/strict"
import { createServer } from "vite"

const server = await createServer({ appType: "custom", logLevel: "error", server: { middlewareMode: true } })
try {
  const { buildProductDictionaryBatch } = await server.ssrLoadModule("/src/services/scan/productKnowledgeService.ts")
  const now = "2026-11-11T12:00:00.000Z"
  const candidates = [
    { name: "Riz long 1kg", total_price: 2, confidence_score: 0.7, item_status: "trusted" },
    { name: "Riz long 1kg", total_price: 4, confidence_score: 0.9, item_status: "trusted" },
    { name: "Lait demi écrémé 1 L", total_price: 1.5, confidence_score: 0.8, item_status: "trusted" },
  ]
  const one = buildProductDictionaryBatch({
    userId: "user-1", merchantName: "Leclerc", items: candidates, now,
    existingRows: [{
      user_id: "user-1", normalized_name: "riz long",
      canonical_name: "Riz", ocr_label: "RIZ", merchant_name: "Ancien",
      occurrences: 2, average_price: 3, min_price: 1.5, max_price: 3.5,
      first_seen: "2026-01-01T12:00:00Z", confidence_score: 0.5,
    }],
  })
  assert.equal(one.updated, 3)
  assert.equal(one.skipped, 0)
  assert.equal(one.rows.length, 2, "Duplicate products must share one upsert row")
  const rice = one.rows.find(row => row.normalized_name === "riz long")
  assert.ok(rice)
  assert.equal(rice.occurrences, 4)
  assert.equal(rice.average_price, 3, "Weighted average must include both bought items")
  assert.equal(rice.min_price, 1.5)
  assert.equal(rice.max_price, 4)
  assert.equal(rice.confidence_score, 0.9)
  assert.equal(rice.first_seen, "2026-01-01T12:00:00Z")
  const milk = one.rows.find(row => row.normalized_name === "lait demi ecreme")
  assert.equal(milk?.occurrences, 1)
  assert.equal(milk?.average_price, 1.5)
  assert.equal(milk?.user_id, "user-1")

  const duplicateNew = buildProductDictionaryBatch({
    userId: "user-1", items: [
      {name:"Jus ananas",total_price:2.99,item_status:"trusted"},
      {name:"Jus ananas",total_price:3.99,item_status:"trusted"},
    ],now,
  })
  assert.equal(duplicateNew.rows.length,1)
  assert.equal(duplicateNew.rows[0].occurrences,2)
  assert.equal(duplicateNew.rows[0].average_price,3.49)
  assert.equal(duplicateNew.rows[0].min_price,2.99)
  assert.equal(duplicateNew.rows[0].max_price,3.99)

  const noPrice = buildProductDictionaryBatch({
    userId: "user-1", items: [{name:"Produit sans prix",total_price:0}],now,
  })
  assert.equal(noPrice.rows.length,0)
  assert.equal(noPrice.skipped,1)
  console.log("OK: product dictionary batch preserves repeated-item counts, average, min/max, labels and date")
} finally {
  await server.close()
}
