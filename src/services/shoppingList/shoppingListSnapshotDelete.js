async function findActiveSnapshot({ client, userId, id }) {
  const { data, error } = await client
    .from("shopping_list_snapshots")
    .select("id")
    .eq("user_id", userId)
    .eq("id", id)
    .eq("status", "active")
    .maybeSingle()

  if (error) throw error
  return data?.id || null
}

export async function deleteShoppingListSnapshotWithClient({ client, userId, id }) {
  if (!client || !userId || !id) {
    const error = new Error("Shopping-list snapshot deletion requires a client, user and snapshot id")
    error.code = "shopping_list_snapshot_delete_invalid"
    throw error
  }

  const { error: deleteError } = await client
    .from("shopping_list_snapshots")
    .delete()
    .eq("user_id", userId)
    .eq("id", id)
    .eq("status", "active")

  if (deleteError && import.meta.env?.DEV) {
    console.warn(
      "[Shopping snapshots] physical delete failed, trying soft delete",
      deleteError.code || deleteError.message,
    )
  }

  let stillActive = await findActiveSnapshot({ client, userId, id })
  if (!stillActive) return id

  const { error: updateError } = await client
    .from("shopping_list_snapshots")
    .update({ status: "deleted" })
    .eq("user_id", userId)
    .eq("id", id)
    .eq("status", "active")

  if (updateError) throw updateError

  stillActive = await findActiveSnapshot({ client, userId, id })
  if (!stillActive) return id

  const error = new Error("Shopping-list snapshot deletion was not persisted")
  error.code = "shopping_list_snapshot_delete_not_persisted"
  throw error
}