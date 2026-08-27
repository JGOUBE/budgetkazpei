export const MANUAL_SAVE_METHOD = "manual_save"

export function cloneShoppingListSnapshotItems(items = []) {
  if (!Array.isArray(items)) return []
  return JSON.parse(JSON.stringify(items))
}

export function isShoppingListSnapshotVisible(snapshot, currentTime = Date.now()) {
  const expiresAt = new Date(snapshot?.expiresAt || snapshot?.expires_at || "").getTime()
  return (snapshot?.status || "active") === "active"
    && Number.isFinite(expiresAt)
    && expiresAt > Number(currentTime)
}
