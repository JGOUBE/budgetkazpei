const RETAILER_NAMES = Object.freeze({
  "e-leclerc": "E.Leclerc",
  "leader-price": "Leader Price",
  "leader-price-reunion": "Leader Price",
  "carrefour": "Carrefour",
  "carrefour-city": "Carrefour City",
  "carrefour-market": "Carrefour Market",
  "super-u": "Super U",
  "hyper-u": "Hyper U",
  "u-express": "U Express",
  "intermark": "Intermark",
  "intermarche": "Intermarché",
});

export function formatSharedPriceRetailer(price = {}) {
  const slug = String(price?.retailer_slug || "").trim().toLowerCase();
  const retailer = RETAILER_NAMES[slug] || (slug ? slug.replace(/-/g, " ") : "Magasin non précisé");
  const locality = String(price?.locality || "").trim();
  const commune = String(price?.commune || "").trim();
  const where = [locality, commune]
    .filter(value => value && value.toLowerCase() !== "la réunion")
    .filter((value, index, values) => values.findIndex(other => other.toLowerCase() === value.toLowerCase()) === index);
  return [retailer, ...where].join(" · ");
}

export function isSharedPriceHistorical(observedAt, reference = Date.now(), maxAgeDays = 30) {
  const timestamp = new Date(observedAt || "").getTime();
  if (!Number.isFinite(timestamp)) return true;
  const referenceTimestamp = typeof reference === "number" ? reference : new Date(reference).getTime();
  if (!Number.isFinite(referenceTimestamp)) return true;
  return referenceTimestamp - timestamp > maxAgeDays * 24 * 60 * 60 * 1000;
}

export function getSharedPriceStatusLabel(observedAt, reference = Date.now()) {
  return isSharedPriceHistorical(observedAt, reference)
    ? "Prix historique (plus de 30 jours ou date inconnue)"
    : "Prix relevé (disponibilité à confirmer)";
}
