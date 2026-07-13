export function normalizeText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function money(value: unknown) {
  const number = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(number) ? number : 0;
}

export function isEligibleMarketReceiptItem(item: Record<string, unknown>) {
  const name = String(item.corrected_name || item.name || "").trim();
  const quantityValue = item.quantity == null || item.quantity === "" ? 1 : item.quantity;
  return String(item.item_status || "") === "user_validated"
    && String(item.line_type || "product") === "product"
    && name.length > 0
    && money(item.total_price) > 0
    && money(quantityValue) > 0;
}

export function aliasLabelLooksSafe(value = "") {
  const clean = normalizeText(value);
  if (!clean) return false;
  if (/\b(total|sous total|reste a payer|net a payer|paiement|carte bleue|cb|tva|ttc|caisse|fidelite)\b/.test(clean)) {
    return false;
  }
  if (/\b\d+[,.]\d{2}\b/.test(value)) return false;
  if (/\s[123]\s*$/.test(value) && !/\b(x\s*[123]|[123]\s*x)\b/i.test(value)) return false;
  return true;
}

export function isResolvedMarketProduct(resolution: Record<string, unknown> | undefined | null) {
  return Boolean(resolution?.market_matched === true && resolution.market_product_id);
}
