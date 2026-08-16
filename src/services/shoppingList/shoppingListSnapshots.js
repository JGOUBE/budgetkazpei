import { supabase } from "../supabase"

const SNAPSHOT_DAYS = 7

function nowIso() {
  return new Date().toISOString()
}

function expiresAtIso() {
  const date = new Date()
  date.setDate(date.getDate() + SNAPSHOT_DAYS)
  return date.toISOString()
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

  const { data, error } = await supabase
    .from("shopping_list_snapshots")
    .update({ status: "expired" })
    .eq("user_id", userId)
    .eq("status", "active")
    .lt("expires_at", nowIso())
    .select("*")

  if (error) throw error
  return (data || []).map(normalizeSnapshot)
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
  return (data || []).map(normalizeSnapshot)
}

export async function saveShoppingListSnapshot({
  userId,
  title = "Liste de courses BudgetKazPéi",
  items = [],
  totalEstimated = 0,
  missingPriceCount = 0,
  totalItems = 0,
  shareMethod = "copy",
}) {
  if (!userId) return null

  const { data, error } = await supabase
    .from("shopping_list_snapshots")
    .insert({
      user_id: userId,
      title,
      items,
      total_estimated: Number(totalEstimated || 0),
      missing_price_count: Number(missingPriceCount || 0),
      total_items: Number(totalItems || items.length || 0),
      expires_at: expiresAtIso(),
      shared_at: nowIso(),
      share_method: shareMethod,
      status: "active",
    })
    .select("*")
    .single()

  if (error) throw error
  return normalizeSnapshot(data)
}

export async function markShoppingListSnapshotDeleted({ userId, id }) {
  if (!userId || !id) return null

  const { data, error } = await supabase
    .from("shopping_list_snapshots")
    .update({ status: "deleted" })
    .eq("user_id", userId)
    .eq("id", id)
    .select("*")
    .maybeSingle()

  if (error) throw error
  return data ? normalizeSnapshot(data) : null
}
