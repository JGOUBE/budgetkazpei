// utils/format.js
function safeAmount(value) {
  const number = Number(String(value ?? 0).replace(",", "."))
  return Number.isFinite(number) ? number : 0
}

export function formatAmount(amount) {
  const number = safeAmount(amount)
  const sign = number >= 0 ? "+" : ""
  return `${sign}${formatMontant(number)}`
}

export function formatMontant(montant) {
  return `${safeAmount(montant).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} €`
}
