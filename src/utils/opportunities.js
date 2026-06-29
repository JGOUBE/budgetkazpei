const COMMUNE_TO_ZONE = {
  "Saint-Leu": "Ouest",
  "Les Avirons": "Ouest",
  "Saint-Paul": "Ouest",
  "Le Port": "Ouest",
  "La Possession": "Ouest",
  "Trois-Bassins": "Ouest",
  "Saint-Denis": "Nord",
  "Sainte-Marie": "Nord",
  "Sainte-Suzanne": "Nord",
  "Saint-Pierre": "Sud",
  "Le Tampon": "Sud",
  "Saint-Louis": "Sud",
  "Etang-Sale": "Sud",
  "Entre-Deux": "Sud",
  "Petite-Ile": "Sud",
  "Saint-Joseph": "Sud",
  "Saint-Philippe": "Sud",
  "Saint-Andre": "Est",
  "Bras-Panon": "Est",
  "Saint-Benoit": "Est",
  "Plaine-des-Palmistes": "Est",
  "Sainte-Rose": "Est",
  Salazie: "Est",
}

export function normalizeOpportunityText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

export function getOpportunityZone(commune = "") {
  const normalizedCommune = normalizeOpportunityText(commune)

  return Object.entries(COMMUNE_TO_ZONE).find(([name]) => {
    return normalizeOpportunityText(name) === normalizedCommune
  })?.[1] || ""
}

export function getAllowedOpportunityTerritories(commune = "") {
  const zone = getOpportunityZone(commune)

  return ["toutes", "la reunion", normalizeOpportunityText(commune), normalizeOpportunityText(zone)].filter(Boolean)
}

export function filterOpportunitiesByTerritory(opportunities = [], commune = "") {
  const allowedTerritories = getAllowedOpportunityTerritories(commune)

  return opportunities.filter(item => {
    const territory = normalizeOpportunityText(item?.territory || "Toutes")
    return allowedTerritories.includes(territory)
  })
}
