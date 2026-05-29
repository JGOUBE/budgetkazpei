// utils/format.js
export function formatAmount(amount) {
  const sign = amount >= 0 ? "+" : "";
  return sign + amount.toFixed(2).replace(".", ",") + " €";
}

export function formatMontant(montant) {
  return montant.toFixed(2).replace(".", ",") + " €";
}