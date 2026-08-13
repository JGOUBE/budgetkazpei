import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  isReceiptImageAvailable,
  runRetentionBatch,
} from "../supabase/functions/receipt-image-retention/retentionPolicy.js"
import {
  createCompatibleReceiptImageUrl,
  resolveReceiptImageSigningWindow,
} from "../src/features/receipts/services/receiptImageAvailability.js"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/202608130001_receipt_image_retention.sql"),
  "utf8",
)
const migrationSqlWithoutComments = migration.replace(/--.*$/gm, "")
const receiptService = fs.readFileSync(
  path.join(root, "src/features/receipts/services/receiptService.js"),
  "utf8",
)
const receiptsPage = fs.readFileSync(
  path.join(root, "src/features/receipts/pages/ReceiptsPage.jsx"),
  "utf8",
)
const retentionFunction = fs.readFileSync(
  path.join(root, "supabase/functions/receipt-image-retention/index.ts"),
  "utf8",
)
const retentionCron = fs.readFileSync(
  path.join(root, "supabase/jobs/schedule_receipt_image_retention.sql"),
  "utf8",
)

const uploadedAt = new Date("2026-08-01T10:00:00.000Z")
const expiresAt = new Date(uploadedAt.getTime() + 7 * 24 * 60 * 60 * 1000)
const receiptAtJ6 = {
  id: "receipt-j6",
  image_paths: ["user/receipt-j6.jpg"],
  image_expires_at: expiresAt.toISOString(),
  image_deleted_at: null,
}

assert.equal(
  isReceiptImageAvailable(receiptAtJ6, new Date(uploadedAt.getTime() + 5 * 24 * 60 * 60 * 1000)),
  true,
  "J+5: the original must still be available",
)
assert.equal(
  isReceiptImageAvailable(receiptAtJ6, new Date(uploadedAt.getTime() + 6 * 24 * 60 * 60 * 1000)),
  true,
  "J+6: the original must still be available",
)
assert.equal(
  isReceiptImageAvailable(receiptAtJ6, new Date(expiresAt.getTime() - 1)),
  true,
  "Immediately before J+7: the original must still be available",
)

assert.deepEqual(
  resolveReceiptImageSigningWindow({ remainingSeconds: 600, retentionError: null }),
  { expiresIn: 600, retentionBackendAvailable: true, reason: "available" },
  "J+6: an active retention backend must still authorize a signed URL",
)
assert.deepEqual(
  resolveReceiptImageSigningWindow({
    remainingSeconds: null,
    retentionError: {
      code: "PGRST202",
      message: "Could not find the function public.receipt_image_remaining_seconds in the schema cache",
    },
  }),
  { expiresIn: 600, retentionBackendAvailable: false, reason: "retention_backend_not_deployed" },
  "Before migration: a missing retention RPC must retain legacy image availability",
)
assert.deepEqual(
  resolveReceiptImageSigningWindow({ remainingSeconds: null, retentionError: null }),
  { expiresIn: 600, retentionBackendAvailable: true, reason: "retention_information_unavailable" },
  "Missing retention information must not be interpreted as an expired image",
)
assert.equal(
  resolveReceiptImageSigningWindow({ remainingSeconds: 0, retentionError: null }).expiresIn,
  0,
  "At J+7: a deployed backend returning zero must hide the original",
)
assert.equal(
  resolveReceiptImageSigningWindow({
    remainingSeconds: null,
    retentionError: { code: "PGRST500", message: "Unexpected retention backend failure" },
  }).expiresIn,
  0,
  "A real backend failure must not be mistaken for a missing migration",
)

const transitionSigningCalls = []
const transitionImageUrl = await createCompatibleReceiptImageUrl({
  receiptId: "52ca5181-98b0-4176-b12e-8dbaec5bb436",
  imagePath: "61c658d8-c4c6-4d56-ab42-d49d81e715a7/52ca5181-98b0-4176-b12e-8dbaec5bb436.jpg",
  fetchRetentionWindow: async () => ({
    data: null,
    error: {
      code: "PGRST202",
      message: "Could not find the function public.receipt_image_remaining_seconds in the schema cache",
    },
  }),
  createSignedUrl: async (path, expiresIn) => {
    transitionSigningCalls.push({ path, expiresIn })
    return { data: { signedUrl: "https://signed.example/e-leclerc" }, error: null }
  },
})
assert.equal(transitionImageUrl, "https://signed.example/e-leclerc")
assert.deepEqual(transitionSigningCalls, [{
  path: "61c658d8-c4c6-4d56-ab42-d49d81e715a7/52ca5181-98b0-4176-b12e-8dbaec5bb436.jpg",
  expiresIn: 600,
}], "Before migration, getReceiptImageUrl behavior must sign the historical image_path")

let expiredSigningAttempted = false
const expiredImageUrl = await createCompatibleReceiptImageUrl({
  receiptId: "expired-receipt",
  imagePath: "user/expired.jpg",
  fetchRetentionWindow: async () => ({ data: 0, error: null }),
  createSignedUrl: async () => {
    expiredSigningAttempted = true
    return { data: { signedUrl: "must-not-be-used" }, error: null }
  },
})
assert.equal(expiredImageUrl, "")
assert.equal(expiredSigningAttempted, false, "At J+7, the frontend must not request a signed URL")
assert.equal(
  isReceiptImageAvailable(receiptAtJ6, expiresAt),
  false,
  "At J+7 exactly: the original must no longer be available",
)

const eleclercCreatedAt = new Date("2026-08-08T21:18:55.880Z")
const eleclercExpiresAt = new Date("2026-08-15T21:18:55.880Z")
assert.equal(
  isReceiptImageAvailable({
    id: "52ca5181-98b0-4176-b12e-8dbaec5bb436",
    image_path: "61c658d8-c4c6-4d56-ab42-d49d81e715a7/52ca5181-98b0-4176-b12e-8dbaec5bb436.jpg",
    image_expires_at: eleclercExpiresAt.toISOString(),
    image_deleted_at: null,
  }, new Date("2026-08-12T20:46:00.372Z")),
  true,
  `The E.Leclerc original uploaded at ${eleclercCreatedAt.toISOString()} must be available before its server deadline`,
)

const persistedReceipt = {
  id: "receipt-three-images",
  image_path: "user/top.jpg",
  image_paths: ["user/top.jpg", "user/middle.jpg", "user/bottom.jpg"],
  storage_path: null,
  image_url: null,
  image_expires_at: expiresAt.toISOString(),
  image_deleted_at: null,
  store_name: "Test Market",
  total_amount: 42.5,
  transaction_id: "transaction-kept",
  receipt_items: [
    { id: "item-1", name: "Riz", total_price: 4.2 },
    { id: "item-2", name: "Lait", total_price: 2.1 },
  ],
  market_data: { store_id: "market-store-kept", observations: 2 },
}

const rows = new Map([[persistedReceipt.id, structuredClone(persistedReceipt)]])
const removalCalls = []
const finalizeReceipt = async receiptId => {
  const row = rows.get(receiptId)
  if (!row || row.image_deleted_at) return
  rows.set(receiptId, {
    ...row,
    image_path: null,
    image_paths: [],
    storage_path: null,
    image_url: null,
    image_deleted_at: expiresAt.toISOString(),
    image_deleted_reason: "automatic_7_days_expiry",
  })
}
const removeStoragePaths = async paths => {
  removalCalls.push([...paths])
  // Supabase Storage remove is deliberately treated as successful when an
  // object is already absent, which makes retries idempotent.
}

const firstRun = await runRetentionBatch({
  receiptCandidates: [{
    receipt_id: persistedReceipt.id,
    storage_paths: persistedReceipt.image_paths,
    has_inline_image: false,
  }],
  removeStoragePaths,
  finalizeReceipt,
})

assert.deepEqual(
  removalCalls[0],
  ["user/top.jpg", "user/middle.jpg", "user/bottom.jpg"],
  "A three-photo receipt must purge all three originals",
)
assert.equal(firstRun.storageImagesDeleted, 3)
assert.equal(firstRun.receiptsFinalized, 1)

const twoPhotoRemovalCalls = []
const twoPhotoRun = await runRetentionBatch({
  receiptCandidates: [{
    receipt_id: "receipt-two-images",
    storage_paths: ["user/two-top.jpg", "user/two-bottom.jpg"],
    has_inline_image: false,
  }],
  removeStoragePaths: async paths => twoPhotoRemovalCalls.push([...paths]),
  finalizeReceipt: async () => {},
})
assert.deepEqual(twoPhotoRemovalCalls[0], ["user/two-top.jpg", "user/two-bottom.jpg"])
assert.equal(twoPhotoRun.storageImagesDeleted, 2, "A two-photo receipt must purge both originals")

const retained = rows.get(persistedReceipt.id)
assert.ok(retained, "The receipt row must remain")
assert.deepEqual(retained.receipt_items, persistedReceipt.receipt_items, "All receipt_items must remain")
assert.equal(retained.transaction_id, persistedReceipt.transaction_id, "The transaction link must remain")
assert.deepEqual(retained.market_data, persistedReceipt.market_data, "Market data must remain")
assert.equal(retained.image_path, null)
assert.deepEqual(retained.image_paths, [])

const secondRun = await runRetentionBatch({
  receiptCandidates: [],
  removeStoragePaths,
  finalizeReceipt,
})
assert.equal(secondRun.failures.length, 0, "A cleanup retry must not fail")
assert.equal(secondRun.receiptsFinalized, 0, "A cleanup retry must be a no-op")

const alreadyMissingRun = await runRetentionBatch({
  orphanCandidates: [{ storage_path: "user/already-gone.jpg" }],
  removeStoragePaths,
  finalizeReceipt,
})
assert.equal(alreadyMissingRun.failures.length, 0, "An already deleted object must not fail cleanup")

assert.match(migration, /created_at \+ interval '7 days' > now\(\)/, "Storage access must stop server-side at J+7")
assert.doesNotMatch(migrationSqlWithoutComments, /p_now\s*\+\s*interval/, "Physical cleanup must never delete an original before J+7")
assert.match(migration, /receipt_collect_owned_storage_paths/, "Cleanup paths must stay inside the receipt owner's Storage folder")
assert.match(migration, /v_deadline := v_uploaded_at \+ interval '7 days'/, "Storage retention age must come from storage.objects.created_at")
assert.doesNotMatch(migrationSqlWithoutComments, /purchase_date/, "Image retention must never use the receipt purchase date")
assert.match(migration, /image_path = null[\s\S]*image_paths = '\{\}'::text\[\][\s\S]*image_url = null/, "Finalization must only clear image references")
assert.doesNotMatch(
  migration,
  /delete\s+from\s+public\.(?:receipts|receipt_items|transactions|market_)/i,
  "Retention migration must never delete structured receipt, transaction or market data",
)
assert.match(receiptService, /receipt_image_remaining_seconds/, "The UI must ask the server for remaining lifetime")
assert.match(receiptService, /createCompatibleReceiptImageUrl/, "The UI must use the tested compatibility path before backend deployment")
assert.match(receiptsPage, /getReceiptImageUrl\(data\)/, "Receipt detail must resolve availability from the complete receipt")
assert.match(receiptsPage, /\{imageUrl && \(/, "The original-ticket control must disappear without a signed URL")
assert.match(retentionFunction, /x-retention-secret/, "The Edge Function must require the dedicated retention secret")
assert.match(retentionFunction, /safeEqual\(suppliedSecret, expectedSecret\)/, "The retention secret comparison must be timing-safe")
assert.match(retentionFunction, /payload_must_only_contain_boolean_dryRun/, "The Edge Function payload must be strict")
assert.doesNotMatch(retentionFunction, /body\.now|payload\.now/, "Callers must not override the server retention clock")
assert.match(retentionFunction, /const BUCKET = "receipt-images"/, "Physical deletion must stay scoped to receipt-images")
assert.doesNotMatch(retentionFunction, /\.from\("(?:receipts|receipt_items|transactions|market_)/, "The Edge Function must not delete structured data tables")
assert.match(retentionCron, /'receipt-image-retention-every-5-minutes'/, "The cron job must use the agreed five-minute name")
assert.match(retentionCron, /'\*\/5 \* \* \* \*'/, "The cron job must run every five minutes")
assert.match(retentionCron, /where name = 'project_url'/, "The cron URL must come from Vault")
assert.match(retentionCron, /where name = 'receipt_image_retention_secret'/, "The cron authentication secret must come from Vault")
assert.doesNotMatch(retentionCron, /https:\/\/[a-z0-9-]+\.supabase\.co/, "The cron SQL must not embed the production project URL")

console.log("Receipt image retention tests: OK")
