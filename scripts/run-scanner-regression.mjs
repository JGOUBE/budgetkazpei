import { createServer } from "vite"

const server = await createServer({
  appType: "custom",
  logLevel: "error",
  server: { middlewareMode: true },
})

try {
  const module = await server.ssrLoadModule("/src/services/scan/scannerRegressionFixtures.ts")
  const results = module.runScannerRegressionFixtures()
  let failed = 0

  for (const result of results) {
    const status = result.passed ? "OK" : "FAIL"
    console.log(`[scanner-regression] ${status} ${result.id}`)
    if (!result.passed) {
      failed += 1
      console.log(JSON.stringify({ expected: result.expected, actual: result.actual }, null, 2))
    }
  }

  if (failed > 0) {
    console.error(`[scanner-regression] ${failed} fixture(s) failed`)
    process.exitCode = 1
  } else {
    console.log(`[scanner-regression] ${results.length} fixture(s) passed`)
  }
} finally {
  await server.close()
}
