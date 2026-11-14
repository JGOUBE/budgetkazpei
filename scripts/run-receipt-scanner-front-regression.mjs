import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createServer } from "vite"

const receiptsPage = readFileSync(join(process.cwd(), "src/features/receipts/pages/ReceiptsPage.jsx"), "utf8")
assert.match(receiptsPage, /Confidentialité du scan/, "Scanner privacy notice must be visible")
assert.match(receiptsPage, /\/privacy#tickets-scanner/, "Scanner privacy notice must link to the relevant policy section")

// A trusted scan must enrich the shared catalog only after its shopping history
// has been persisted; errors during learning must not reject the receipt.
const importer = readFileSync(join(process.cwd(), "src/services/scan/receiptImporter.ts"), "utf8")
const persistIndex = importer.indexOf("await syncShoppingItemsFromReceipt(")
const learnIndex = importer.indexOf("await learnSharedShoppingCatalogFromReceipt(receipt.id)")
const marketIndex = importer.indexOf("await syncAnonymizedMarketReceipt(receipt.id)")
assert.ok(persistIndex >= 0 && learnIndex > persistIndex,
  "Shared catalog learning must run after persisted shopping items")
assert.ok(marketIndex > persistIndex,
  "Anonymous market synchronization must run after persisted shopping items")
assert.match(importer, /if \(canFeedShopping\) \{[\s\S]*?try \{[\s\S]*?await learnSharedShoppingCatalogFromReceipt\(receipt\.id\)[\s\S]*?catch \(error\)/,
  "Catalog learning must remain fail-open and limited to trusted food receipts")
assert.match(importer, /await enrichProductDictionary\(\{[\s\S]*?items: smartShoppingEligibleItems/,
  "Knowledge Engine must reuse the safe items, never an undefined variable")


const server = await createServer({
  appType: "custom",
  logLevel: "error",
  server: { middlewareMode: true },
})

try {
  const module = await server.ssrLoadModule("/src/services/scan/receiptScannerFrontRegression.ts")
  const results = await module.runReceiptScannerFrontRegressionFixtures()
  let failed = 0

  for (const result of results) {
    const status = result.passed ? "OK" : "FAIL"
    console.log(`[receipt-scanner-front] ${status} ${result.id}`)
    if (!result.passed) {
      failed += 1
      console.log(JSON.stringify({ expected: result.expected, actual: result.actual }, null, 2))
    }
  }

  if (failed > 0) {
    console.error(`[receipt-scanner-front] ${failed} fixture(s) failed`)
    process.exitCode = 1
  } else {
    console.log(`[receipt-scanner-front] ${results.length} fixture(s) passed`)
  }
} finally {
  await server.close()
}
