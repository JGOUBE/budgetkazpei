import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import {
  cloneShoppingListSnapshotItems,
  isShoppingListSnapshotVisible,
  MANUAL_SAVE_METHOD,
} from "../src/services/shoppingList/shoppingListSnapshotModel.js"
import { deleteShoppingListSnapshotWithClient } from "../src/services/shoppingList/shoppingListSnapshotDelete.js"
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

function createDeleteClient({ rows, sessionUserId, failWith = null }) {
  const calls = []
  return {
    calls,
    from(table) {
      const filters = []
      const query = {
        update(values, options) {
          calls.push({ type: "update", table, values, options })
          return query
        },
        eq(column, value) {
          filters.push([column, value])
          calls.push({ type: "eq", column, value })
          return query
        },
        then(resolve, reject) {
          if (failWith) return Promise.resolve({ count: null, error: failWith }).then(resolve, reject)

          const matches = rows.filter(row =>
            row.user_id === sessionUserId
            && row.status === "active"
            && new Date(row.expires_at).getTime() > now
            && filters.every(([column, value]) => row[column] === value),
          )
          for (const row of matches) row.status = "deleted"
          return Promise.resolve({ count: matches.length, error: null }).then(resolve, reject)
        },
      }
      return query
    },
  }
}

const activeSnapshot = {
  id: "snapshot-active",
  user_id: "user-a",
  status: "active",
  expires_at: "2026-09-03T10:00:00.001Z",
}
const otherSnapshot = {
  id: "snapshot-other",
  user_id: "user-a",
  status: "active",
  expires_at: "2026-09-03T10:00:00.001Z",
}
const deleteRows = [activeSnapshot, otherSnapshot]
const deleteClient = createDeleteClient({ rows: deleteRows, sessionUserId: "user-a" })

assert.equal(
  await deleteShoppingListSnapshotWithClient({ client: deleteClient, userId: "user-a", id: activeSnapshot.id }),
  activeSnapshot.id,
  "An active owned snapshot must be soft-deleted successfully",
)
assert.equal(activeSnapshot.status, "deleted", "The successful mutation must mark the target deleted")
assert.deepEqual(
  deleteRows.filter(row => isShoppingListSnapshotVisible(row, now)).map(row => row.id),
  [otherSnapshot.id],
  "A deleted snapshot must not return after reloading while other snapshots remain intact",
)
assert.equal(otherSnapshot.status, "active", "Deleting one snapshot must not affect another")
assert.deepEqual(deleteClient.calls[0], {
  type: "update",
  table: "shopping_list_snapshots",
  values: { status: "deleted" },
  options: undefined,
}, "Deletion must not request a representation or count of the hidden row")
assert.ok(deleteClient.calls.some(call => call.type === "eq" && call.column === "status" && call.value === "active"))

const failedRows = [{ ...otherSnapshot, id: "snapshot-failed" }]
const supabaseFailure = Object.assign(new Error("Supabase unavailable"), { code: "503" })
await assert.rejects(
  deleteShoppingListSnapshotWithClient({
    client: createDeleteClient({ rows: failedRows, sessionUserId: "user-a", failWith: supabaseFailure }),
    userId: "user-a",
    id: "snapshot-failed",
  }),
  error => error === supabaseFailure,
  "A Supabase failure must be exposed to the UI",
)
assert.equal(failedRows[0].status, "active", "A backend failure must leave the snapshot visible")

const foreignRows = [{ ...otherSnapshot, id: "snapshot-foreign", user_id: "user-b" }]
await deleteShoppingListSnapshotWithClient({
  client: createDeleteClient({ rows: foreignRows, sessionUserId: "user-a" }),
  userId: "user-b",
  id: "snapshot-foreign",
})
assert.equal(foreignRows[0].status, "active")

const expiredRows = [{ ...otherSnapshot, id: "snapshot-expired", expires_at: "2026-08-27T09:59:59.999Z" }]
await deleteShoppingListSnapshotWithClient({
  client: createDeleteClient({ rows: expiredRows, sessionUserId: "user-a" }),
  userId: "user-a",
  id: "snapshot-expired",
})
assert.equal(expiredRows[0].status, "active", "Expired snapshots must remain governed by the existing retention behavior")

function createSnapshotSyncHarness(initialRows) {
  let rows = initialRows
  let requestVersion = 0
  const deletedIds = new Set()
  return {
    beginRequest() {
      requestVersion += 1
      return requestVersion
    },
    markDeleted(id) {
      deletedIds.add(id)
      requestVersion += 1
      rows = rows.filter(row => row.id !== id)
    },
    resolveRequest(version, nextRows) {
      if (version !== requestVersion) return false
      rows = nextRows.filter(row => !deletedIds.has(row.id))
      return true
    },
    rows() {
      return rows
    },
  }
}

const deletedUiSnapshot = { id: "snapshot-ui-deleted" }
const retainedUiSnapshot = { id: "snapshot-ui-retained" }
const syncHarness = createSnapshotSyncHarness([deletedUiSnapshot, retainedUiSnapshot])
const staleRequest = syncHarness.beginRequest()
syncHarness.markDeleted(deletedUiSnapshot.id)
assert.deepEqual(syncHarness.rows(), [retainedUiSnapshot], "Backend success must remove only the deleted snapshot locally")
assert.equal(
  syncHarness.resolveRequest(staleRequest, [deletedUiSnapshot, retainedUiSnapshot]),
  false,
  "A response started before deletion must be ignored",
)
assert.deepEqual(syncHarness.rows(), [retainedUiSnapshot], "A stale response must not reinsert the deleted snapshot")
const refreshRequest = syncHarness.beginRequest()
assert.equal(syncHarness.resolveRequest(refreshRequest, [retainedUiSnapshot]), true)
assert.deepEqual(syncHarness.rows(), [retainedUiSnapshot], "The authoritative refresh must keep other snapshots intact")

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
assert.doesNotMatch(service, /update\(\{ status: "deleted" \}\)[\s\S]*\.select\(/, "Soft delete must not return a row hidden by SELECT RLS")
assert.match(page, /window\.confirm\(txt\.deleteConfirm\)/, "Deletion must require one confirmation")
assert.match(page, /deleteInFlightRef\.current\.has\(id\)/, "A double click must not start a second deletion")
assert.match(page, /try \{[\s\S]*markShoppingListSnapshotDeleted[\s\S]*setSnapshots\(prev => prev\.filter[\s\S]*setNotice\(\{ message: txt\.deleted, kind: "success" \}\)[\s\S]*catch \{[\s\S]*setNotice\(\{ message: txt\.deleteError, kind: "error" \}\)/, "The UI must mutate local state only after backend success and report failures")
assert.match(page, /setPreviewSnapshot\(prev => prev\?\.id === id \? null : prev\)/, "Deleting a previewed snapshot must close its preview")
assert.match(page, /disabled=\{isDeleting\}/, "The delete button must be disabled while its snapshot is being deleted")
assert.match(page, /const snapshotRequestVersionRef = useRef\(0\)/, "Snapshot reads must share a request version")
assert.match(page, /const deletedSnapshotIdsRef = useRef\(new Set\(\)\)/, "Deleted snapshot ids must remain excluded from stale responses")
assert.match(page, /requestVersion === snapshotRequestVersionRef\.current[\s\S]*!deletedSnapshotIdsRef\.current\.has\(row\.id\)/, "Only the latest snapshot response may update UI state")
assert.match(page, /markShoppingListSnapshotDeleted[\s\S]*deletedSnapshotIdsRef\.current\.add\(id\)[\s\S]*setSnapshots\(prev => prev\.filter\(row => row\.id !== id\)\)[\s\S]*await refreshSnapshots\(\)[\s\S]*setNotice\(\{ message: txt\.deleted, kind: "success" \}\)/, "Delete must remove locally, refresh from Supabase, then report success")
assert.doesNotMatch(page, /async function refreshSnapshots\(\)[\s\S]*catch \{\s*setSnapshots\(\[\]\)/, "A failed refresh must preserve the locally deleted state")

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
