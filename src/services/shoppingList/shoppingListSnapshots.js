import { supabase } from "../supabase"
import {
  cloneShoppingListSnapshotItems,
  isShoppingListSnapshotVisible,
  MANUAL_SAVE_METHOD,
} from "./shoppingListSnapshotModel"
import { deleteShoppingListSnapshotWithClient } from "./shoppingListSnapshotDelete"

const DELETED_SNAPSHOT_SESSION_KEY = "budgetkazpei:deleted-shopping-snapshots"

function getDeletedSnapshotIds(userId) {
  if (!userId || typeof window === "undefined") return new Set()

  try {
    const raw = window.sessionStorage.getItem(`${DELETED_SNAPSHOT_SESSION_KEY}:${userId}`)
    const ids = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(ids) ? ids.filter(Boolean) : [])
  } catch {
    return new Set()
  }
}

function rememberDeletedSnapshot(userId, id) {
  if (!userId || !id || typeof window === "undefined") return

  try {
    const ids = getDeletedSnapshotIds(userId)
    ids.add(id)
    window.sessionStorage.setItem(
      `${DELETED_SNAPSHOT_SESSION_KEY}:${userId}`,
      JSON.stringify([...ids]),
    )
  } catch {
    // sessionStorage is only a UI race guard; backend remains authoritative.
  }
}

function nowIso() {
  return new Date().toISOString()
}

function normalizeSnapshot(row = {}) {
  return {
    id: row.id,
    title: row.title || "Liste de courses BudgetKazPéi",
    items: Array.isArray(row.items) ? row.items : [],
    totalEstimated: Number(row.total_estimated || 0),
    missingPriceCount: Number(row.missing_price_count || 0),
    totalItems: Number(row.total_items || 0),
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    sharedAt: row.shared_at,
    shareMethod: row.share_method,
    status: row.status || "active",
  }
}

export async function expireShoppingListSnapshots({ userId }) {
  if (!userId) return []

  const { error } = await supabase
    .from("shopping_list_snapshots")
    .delete()
    .eq("user_id", userId)
    .lte("expires_at", nowIso())

  if (error) throw error
  return []
}

export async function listShoppingListSnapshots({ userId }) {
  if (!userId) return []

  await expireShoppingListSnapshots({ userId })

  const { data, error } = await supabase
    .from("shopping_list_snapshots")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .gt("expires_at", nowIso())
    .order("created_at", { ascending: false })

  if (error) throw error

  const deletedIds = getDeletedSnapshotIds(userId)

  return (data || [])
    .map(normalizeSnapshot)
    .filter(row => isShoppingListSnapshotVisible(row))
    .filter(row => !deletedIds.has(row.id))
}

export async function saveShoppingListSnapshot({
  userId,
  title = "Liste de courses BudgetKazPéi",
  items = [],
  totalEstimated = 0,
  missingPriceCount = 0,
  totalItems = 0,
  shareMethod = MANUAL_SAVE_METHOD,
}) {
  if (!userId) return null

  const snapshotItems = cloneShoppingListSnapshotItems(items)

  const { data, error } = await supabase
    .from("shopping_list_snapshots")
    .insert({
      user_id: userId,
      title,
      items: snapshotItems,
      total_estimated: Number(totalEstimated || 0),
      missing_price_count: Number(missingPriceCount || 0),
      total_items: Number(totalItems || snapshotItems.length || 0),
      shared_at: shareMethod === MANUAL_SAVE_METHOD ? null : nowIso(),
      share_method: shareMethod,
      status: "active",
    })
    .select("*")
    .single()

  if (error) throw error
  return normalizeSnapshot(data)
}

export async function markShoppingListSnapshotDeleted({ userId, id }) {
  const deletedId = await deleteShoppingListSnapshotWithClient({
    client: supabase,
    userId,
    id,
  })

  rememberDeletedSnapshot(userId, deletedId)
  return deletedId
}
