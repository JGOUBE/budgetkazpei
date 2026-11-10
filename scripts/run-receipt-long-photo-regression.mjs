import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const path = new URL("../src/features/receipts/pages/ReceiptsPage.jsx", import.meta.url)
const source = readFileSync(path, "utf8")
assert.match(source, /async function normalizeLongTicketPortrait\(file\)/)
assert.match(source, /width > height \* 1\.06/, "Landscape receipt photos must automatically rotate")
assert.match(source, /ctx\.rotate\(Math\.PI \/ 2\)/, "Rotate image bitmap not only its preview")
assert.match(source, /Promise\.all\(images\.map\(normalizeLongTicketPortrait\)\)/, "Gallery photos must all be normalized")
assert.match(source, /const portraitFile = await normalizeLongTicketPortrait\(file\)/, "Captured photos must be normalized")
assert.match(source, /onClick=\{\(\) => rotateLongTicketPart\(index\)\}/, "Provide a manual rotation control per photo")
assert.match(source, /Math\.abs\(linesGapCents\) > 1/, "Ticket and scanned product total discrepancy must be checked")
assert.match(source, /hasLinesGap && \(/, "Show concise discrepancy notice without blocking saving")
console.log("OK: 2/3-photo portrait handling and scan total reconciliation warning")
