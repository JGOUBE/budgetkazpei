export function normalizePersonalAlias(value = "") {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim()
}

export function buildPersonalAliasMap(items = []) {
  const candidates = new Map()
  for (const item of items) {
    if (item?.item_status !== "user_validated") continue
    const raw = normalizePersonalAlias(item.ocr_name)
    const corrected = String(item.corrected_name || "").trim()
    const normalizedCorrection = normalizePersonalAlias(corrected)
    if (!raw || !normalizedCorrection || raw === normalizedCorrection) continue
    if (!candidates.has(raw)) candidates.set(raw, new Map())
    const choices = candidates.get(raw)
    const previous = choices.get(normalizedCorrection)
    choices.set(normalizedCorrection, { corrected, count: (previous?.count || 0) + 1 })
  }
  const result = new Map()
  for (const [raw, choices] of candidates.entries()) {
    // Conflicting corrections are deliberately not auto-suggested.
    if (choices.size !== 1) continue
    result.set(raw, [...choices.values()][0].corrected)
  }
  return result
}

export function applyPersonalAliasesToDraft(draft = {}, aliasMap = new Map()) {
  if (!Array.isArray(draft?.items) || !aliasMap.size) return draft
  return {
    ...draft,
    items: draft.items.map(item => {
      if (item?.market_matched === true || item?._pre_save_validated === true) return item
      const original = String(item?.ocr_name || item?.name || "").trim()
      const corrected = aliasMap.get(normalizePersonalAlias(original))
      if (!corrected || normalizePersonalAlias(item?.name) !== normalizePersonalAlias(original)) return item
      return {
        ...item, name: corrected, corrected_name: corrected, normalized_name: "",
        _personal_alias_suggestion: true,
        needs_review: true, review_status: "needs_review",
        item_status: "a_verifier", status: "a_verifier",
      }
    }),
  }
}

