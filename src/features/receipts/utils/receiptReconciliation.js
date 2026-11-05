// Ticket totals are authoritative; never reuse a parser's cached estimated_items_sum
// after a user edits line items. Inputs are item line totals, not per-unit prices.
export function computeReceiptVisibleLineSum(items = [], { isExcluded = () => false } = {}) {
  const amounts = (Array.isArray(items) ? items : [])
    .filter(item => !isExcluded(item))
    .map(item => {
      const value = item?.total_price ?? item?.price ?? null;
      if (value === null || value === undefined || value === "") return null;
      const amount = Number(String(value).replace(",", "."));
      return Number.isFinite(amount) && amount > 0 ? amount : null;
    })
    .filter(value => value !== null);
  return {
    count: amounts.length,
    total: Math.round((amounts.reduce((sum, value) => sum + value, 0) + Number.EPSILON) * 100) / 100,
  };
}

export function getReceiptAmountReconciliation({
  items = [], totalAmount, isExcluded = () => false, maxDifference = 0.02,
} = {}) {
  const { count, total } = computeReceiptVisibleLineSum(items, { isExcluded });
  const expected = Number(String(totalAmount ?? "").replace(",", "."));
  if (!(expected > 0) || count === 0) return { count, total, difference: null, mismatch: false };
  const difference = Math.round((total - expected + Number.EPSILON) * 100) / 100;
  return { count, total, difference, mismatch: Math.abs(difference) > maxDifference };
}

export function suggestReceiptCategory(item = {}) {
  const name = String(item?.corrected_name || item?.name || item?.ocr_name || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const current = String(item?.category || "").trim();
  if (current && current !== "alimentaire") return current;
  // Conservative recognizers: only unambiguous hygiene products.
  if (/\b(colgate|dentifrice|brosse a dents|pap[. ]?toil|papier toilette|rouleaux toilette|gel douche|shampooing)\b/.test(name)) {
    return "divers";
  }
  return current || "alimentaire";
}
