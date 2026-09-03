import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createServer } from "vite"

const receiptsPage = readFileSync(join(process.cwd(), "src/features/receipts/pages/ReceiptsPage.jsx"), "utf8")
assert.match(receiptsPage, /Confidentialité du scan/, "Scanner privacy notice must be visible")
assert.match(receiptsPage, /\/privacy#tickets-scanner/, "Scanner privacy notice must link to the relevant policy section")

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
