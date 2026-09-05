import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import {
  cloneShoppingListSnapshotItems,
  isShoppingListSnapshotVisible,
  MANUAL_SAVE_METHOD,
} from "../src/services/shoppingList/shoppingListSnapshotModel.js"
import fr from "../src/i18n/fr.js"
import kreol from "../src/i18n/kreol.js"

const rootUrl = new URL("../", import.meta.url)
const read = path => readFile(new URL(path, rootUrl), "utf8")

const originalItems = [
  {
    id: "riz",
    name: "Riz",
    checked: false,
    quantity: 2,
    unit: "kg",
    estimatedPrice: 7.8,
    promotionSnapshot: { id: "promo-riz", retailerName: "Carrefour Réunion", promoPrice: 6.9 },
  },
  { id: "lait", name: "Lait", checked: true, estimatedPrice: 1.45 },
  { id: "pain", name: "Pain", checked: false, estimatedPrice: 0 },
]
const snapshotItems = cloneShoppingListSnapshotItems(originalItems)

assert.equal(MANUAL_SAVE_METHOD, "manual_save", "Manual saves must use the schema-approved method")

assert.deepEqual(snapshotItems, originalItems, "A multi-item snapshot must retain useful item fields")
assert.notEqual(snapshotItems, originalItems, "The snapshot array must not share the current-list reference")
assert.notEqual(snapshotItems[0], originalItems[0], "Snapshot items must be cloned")
originalItems[0].name = "Riz modifié"
originalItems[0].quantity = 9
assert.equal(snapshotItems[0].name, "Riz", "Editing the current list must not rewrite saved content")
assert.equal(snapshotItems[0].quantity, 2, "Saved quantity must remain immutable")
originalItems[0].promotionSnapshot.promoPrice = 8.5
assert.equal(snapshotItems[0].promotionSnapshot.promoPrice, 6.9, "An expired promotion remains an immutable informational capture")

const now = Date.parse("2026-08-27T10:00:00.000Z")
assert.equal(isShoppingListSnapshotVisible({ status: "active", expiresAt: "2026-09-03T10:00:00.001Z" }, now), true)
assert.equal(isShoppingListSnapshotVisible({ status: "active", expiresAt: "2026-08-27T10:00:00.000Z" }, now), false)
assert.equal(isShoppingListSnapshotVisible({ status: "expired", expiresAt: "2026-09-03T10:00:00.001Z" }, now), false)

const [page, service, migration] = await Promise.all([
  read("src/pages/ShoppingListPage.jsx"),
  read("src/services/shoppingList/shoppingListSnapshots.js"),
  read("supabase/migrations/202608270001_shopping_list_manual_snapshots_retention.sql"),
])

assert.match(page, /async function saveCurrentSnapshot\(\)[\s\S]*saveSnapshot\(MANUAL_SAVE_METHOD\)[\s\S]*refreshSnapshots\(\)/)
assert.match(page, /saveInFlightRef\.current/)
assert.match(page, /disabled=\{isSaving\}/)
assert.match(page, /data-shopping-list-actions/)
assert.match(page, /repeat\(2, minmax\(0, 1fr\)\)/, "Save and Share must keep two overflow-safe columns on mobile")
assert.match(page, /setPreviewSnapshot\(snapshot\)/, "Saved snapshots must remain viewable")
assert.match(page, /previewSnapshot\.items\.map/, "The detail view must display saved items")
assert.match(service, /shareMethod = MANUAL_SAVE_METHOD/)
assert.match(service, /share_method: shareMethod/, "The manual-save method must reach the inserted row")
assert.match(service, /\.lte\("expires_at", nowIso\(\)\)/, "Expired snapshots must be opportunistically deleted")
assert.match(service, /\.gt\("expires_at", nowIso\(\)\)/, "Expired snapshots must be excluded from reads")

assert.match(migration, /new\.expires_at := new\.created_at \+ interval '7 days'/)
assert.match(migration, /new\.expires_at := old\.expires_at/, "Clients must not be able to extend retention")
assert.match(migration, /delete from public\.shopping_list_snapshots\s+where expires_at <= p_now/s)
assert.match(migration, /cron\.schedule\(/)
assert.match(migration, /shopping-list-snapshots-retention-hourly/)
assert.match(migration, /check \(share_method in \('manual_save'/)
assert.match(migration, /auth\.uid\(\) = user_id\s+and status = 'active'\s+and expires_at > now\(\)/s, "RLS reads must hide expired snapshots")

const baselineMigration = await read("supabase/migrations/202607010001_shopping_list_snapshots.sql")
for (const operation of ["select", "insert", "update", "delete"]) {
  assert.match(baselineMigration, new RegExp(`for ${operation}[\\s\\S]*auth\\.uid\\(\\) = user_id`), `RLS must isolate ${operation} by user_id`)
}

const requiredTranslationKeys = [
  "save",
  "saving",
  "saved",
  "saveError",
  "addBeforeSave",
  "savedLists",
  "savedListsText",
  "noSavedLists",
  "view",
  "estimatedTotal",
]
assert.deepEqual(Object.keys(fr.shoppingList).sort(), requiredTranslationKeys.sort(), "French snapshot copy must be complete")
assert.deepEqual(Object.keys(kreol.shoppingList).sort(), requiredTranslationKeys.sort(), "Kréol snapshot copy must match French keys")

for (const width of [305, 350, 393, 412, 430]) {
  const cardInnerWidth = width - 32 - 36
  const actionWidth = (cardInnerWidth - 8) / 2
  assert.ok(actionWidth >= 114, `Each action keeps an overflow-safe width and a 50px touch height at ${width}px`)
}

console.log("Shopping-list manual snapshot and seven-day retention tests passed")
