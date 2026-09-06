export async function deleteShoppingListSnapshotWithClient({ client, userId, id }) {
  if (!client || !userId || !id) {
    const error = new Error("Shopping-list snapshot deletion requires a client, user and snapshot id")
    error.code = "shopping_list_snapshot_delete_invalid"
    throw error
  }

  // Do not request the updated row or an exact count: once marked deleted,
  // SELECT RLS intentionally makes this snapshot invisible to the client.
  const { error } = await client
    .from("shopping_list_snapshots")
    .update({ status: "deleted" })
    .eq("user_id", userId)
    .eq("id", id)
    .eq("status", "active")

  if (error) throw error
  return id
}
