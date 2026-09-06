const DRAFT_PREFIX = "budgetkazpei:shopping-list-draft:"

function storageKey(userId) {
  return `${DRAFT_PREFIX}${String(userId || "anonymous")}`
}

export function loadShoppingListDraft({ userId, storage = globalThis?.sessionStorage } = {}) {
  if (!storage) return []
  try {
    const parsed = JSON.parse(storage.getItem(storageKey(userId)) || "[]")
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveShoppingListDraft({ userId, items = [], storage = globalThis?.sessionStorage } = {}) {
  if (!storage) return false
  try {
    storage.setItem(storageKey(userId), JSON.stringify(Array.isArray(items) ? items : []))
    return true
  } catch {
    return false
  }
}
