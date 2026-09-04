import { useEffect, useMemo, useState } from "react"
import { BkIcons } from "../components/icons-budgetkazpei"
import { loadPublishedGoodDeals } from "../services/retail/retailPromotionService"
import { supabase } from "../services/supabase"
import { createColorAliases } from "../styles/designSystem"
import { useTheme } from "../styles/ThemeProvider"

const COLORS = createColorAliases()
const REUNION_TIME_ZONE = "Indian/Reunion"
const GOOD_DEALS_INTERACTION_STYLES = `
  .good-deals-hoverable,
  .good-deals-card {
    transition: background .16s ease, border-color .16s ease, box-shadow .16s ease, transform .16s ease;
  }

  .good-deals-hoverable:hover {
    background: var(--good-deals-hover-bg) !important;
    border-color: var(--good-deals-hover-border) !important;
    transform: translateY(-1px);
  }

  .good-deals-card:hover {
    background: var(--good-deals-card-hover) !important;
    border-color: var(--good-deals-card-hover-border) !important;
    transform: translateY(-1px);
  }

  .good-deals-primary:hover {
    background: var(--good-deals-primary-hover) !important;
  }
`

const CATEGORY_OPTIONS = [
  { id: "all", fr: "Tous", kr: "Tout", icon: BkIcons.deals },
  { id: "shopping", fr: "Promos & bons prix", kr: "Promo ek bon pri", icon: BkIcons.shopping },
  { id: "food", fr: "Restaurants", kr: "Manzé", icon: BkIcons.food },
  { id: "home", fr: "Maison & services", kr: "Kaz & servis", icon: BkIcons.homeServices },
  { id: "transport", fr: "Transport", kr: "Transport", icon: BkIcons.transport },
  { id: "leisure", fr: "Loisirs & famille", kr: "Sorti & famiy", icon: BkIcons.leisure },
  { id: "local", fr: "Commerces locaux", kr: "Komers lokal", icon: BkIcons.store },
]

const LEISURE_VIEW_OPTIONS = [
  {
    id: "event",
    fr: "Événements à venir",
    kr: "Événman i ariv",
    icon: BkIcons.calendar,
  },
  {
    id: "permanent_leisure",
    fr: "À faire toute l’année",
    kr: "Pou fé toute lanné",
    icon: BkIcons.leisure,
  },
]

const SHOPPING_VIEW_OPTIONS = [
  {
    id: "product_promotion",
    fr: "Promos produits",
    kr: "Promo su produi",
    icon: BkIcons.shopping,
  },
  {
    id: "catalog",
    fr: "Catalogues",
    kr: "Katalog",
    icon: BkIcons.list,
  },
  {
    id: "observed_price",
    fr: "Bons prix repérés",
    kr: "Bon pri nou la trouvé",
    icon: BkIcons.stats,
  },
]

const SHOPPING_PRODUCT_CATEGORY_OPTIONS = [
  { id: "all", fr: "Toutes", kr: "Tout" },
  { id: "food", fr: "Alimentation", kr: "Alimantasyon" },
  { id: "drinks", fr: "Boissons", kr: "Boisson" },
  { id: "fresh", fr: "Frais & viande", kr: "Frai ek vyann" },
  { id: "frozen", fr: "Surgelés", kr: "Surgelé" },
  { id: "hygiene", fr: "Hygiène & beauté", kr: "Izyenn ek boté" },
  { id: "cleaning", fr: "Entretien", kr: "Antretien" },
  { id: "school", fr: "Rentrée & fournitures", kr: "Rantré ek fournitur" },
  { id: "home_equipment", fr: "Maison & équipement", kr: "Kaz ek ekipman" },
  { id: "children", fr: "Vêtements & enfants", kr: "Lenz ek zanfan" },
  { id: "pets", fr: "Animaux", kr: "Zanimo" },
]

const SHOPPING_PRODUCT_CATEGORY_TAGS = {
  food: ["epicerie", "epicerie-sucree", "boulangerie", "cafe", "snacking", "alimentaire"],
  drinks: ["boissons", "boisson", "jus", "soda"],
  fresh: ["viande", "frais", "cremerie", "poisson", "fruits-legumes"],
  frozen: ["surgele", "surgeles"],
  hygiene: ["hygiene", "beaute", "coloration", "soin"],
  cleaning: ["entretien", "lessive", "nettoyage"],
  school: ["fournitures-scolaires", "bureau", "rentree"],
  home_equipment: ["maison", "informatique", "electromenager", "technologie"],
  children: ["vetements-enfants", "enfants", "bebe"],
  pets: ["animaux", "animalerie"],
}


const REUNION_COMMUNES = [
  "La Possession",
  "Le Port",
  "Saint-Paul",
  "Trois-Bassins",
  "Saint-Leu",
  "Les Avirons",
  "L'Étang-Salé",
  "Saint-Louis",
  "Cilaos",
  "Entre-Deux",
  "Saint-Pierre",
  "Le Tampon",
  "Petite-Île",
  "Saint-Joseph",
  "Saint-Philippe",
  "Saint-Denis",
  "Sainte-Marie",
  "Sainte-Suzanne",
  "Saint-André",
  "Bras-Panon",
  "Saint-Benoît",
  "Sainte-Rose",
  "La Plaine-des-Palmistes",
  "Salazie",
]

const EXPLORATION_PLACES = [
  { label: "Mafate", type: "territory", territoryName: "Mafate", microRegion: "ouest" },
  { label: "La Nouvelle", type: "locality", commune: "Saint-Paul", locality: "La Nouvelle", territoryName: "Mafate" },
  { label: "Îlet des Orangers", type: "locality", commune: "Saint-Paul", locality: "Îlet des Orangers", territoryName: "Mafate" },
  { label: "Roche Plate", type: "locality", commune: "Saint-Paul", locality: "Roche Plate", territoryName: "Mafate" },
  { label: "Aurère", type: "locality", commune: "La Possession", locality: "Aurère", territoryName: "Mafate" },
  { label: "Îlet à Bourse", type: "locality", commune: "La Possession", locality: "Îlet à Bourse", territoryName: "Mafate" },
  { label: "Îlet à Malheur", type: "locality", commune: "La Possession", locality: "Îlet à Malheur", territoryName: "Mafate" },
  { label: "Grand Place", type: "locality", commune: "La Possession", locality: "Grand Place", territoryName: "Mafate" },
  { label: "Dos d’Âne", type: "locality", commune: "La Possession", locality: "Dos d’Âne", territoryName: "Porte de Mafate" },
  { label: "Grande Chaloupe", type: "locality", commune: "La Possession", locality: "Grande Chaloupe" },
  { label: "Saint-Gilles-les-Bains", type: "locality", commune: "Saint-Paul", locality: "Saint-Gilles-les-Bains" },
  { label: "L’Ermitage-les-Bains", type: "locality", commune: "Saint-Paul", locality: "L’Ermitage-les-Bains" },
  { label: "Piton Saint-Leu", type: "locality", commune: "Saint-Leu", locality: "Piton Saint-Leu" },
  { label: "Les Colimaçons", type: "locality", commune: "Saint-Leu", locality: "Les Colimaçons" },
  { label: "Cirque de Cilaos", type: "territory", commune: "Cilaos", territoryName: "Cirque de Cilaos", microRegion: "sud" },
  { label: "Les Makes", type: "locality", commune: "Saint-Louis", locality: "Les Makes" },
  { label: "Le Tévelave", type: "locality", commune: "Les Avirons", locality: "Le Tévelave" },
  { label: "La Plaine-des-Cafres", type: "locality", commune: "Le Tampon", locality: "Plaine des Cafres" },
  { label: "Bourg-Murat", type: "locality", commune: "Le Tampon", locality: "Bourg-Murat" },
  { label: "Grande Anse", type: "locality", commune: "Petite-Île", locality: "Grande Anse" },
  { label: "L’Étang-Salé-les-Bains", type: "locality", commune: "L'Étang-Salé", locality: "L’Étang-Salé-les-Bains" },
  { label: "Plaine des Grègues", type: "locality", commune: "Saint-Joseph", locality: "Plaine des Grègues" },
  { label: "Grand Coude", type: "locality", commune: "Saint-Joseph", locality: "Grand Coude" },
  { label: "Terre Sainte", type: "locality", commune: "Saint-Pierre", locality: "Terre Sainte" },
  { label: "Cirque de Salazie", type: "territory", commune: "Salazie", territoryName: "Cirque de Salazie", microRegion: "est" },
  { label: "Hell-Bourg", type: "locality", commune: "Salazie", locality: "Hell-Bourg", territoryName: "Cirque de Salazie" },
  { label: "Grand Îlet", type: "locality", commune: "Salazie", locality: "Grand Îlet", territoryName: "Cirque de Salazie" },
  { label: "Mare à Vieille Place", type: "locality", commune: "Salazie", locality: "Mare à Vieille Place", territoryName: "Cirque de Salazie" },
  { label: "Rivière des Roches", type: "locality", commune: "Saint-Benoît", locality: "Rivière des Roches" },
  { label: "Sainte-Anne", type: "locality", commune: "Saint-Benoît", locality: "Sainte-Anne" },
  { label: "Bois-Blanc", type: "locality", commune: "Sainte-Rose", locality: "Bois-Blanc" },
]

const MICRO_REGIONS = {
  ouest: ["Le Port", "La Possession", "Saint-Paul", "Trois-Bassins", "Saint-Leu"],
  sud: [
    "Les Avirons",
    "L'Étang-Salé",
    "Etang-Salé",
    "Saint-Louis",
    "Cilaos",
    "Entre-Deux",
    "Saint-Pierre",
    "Le Tampon",
    "Petite-Île",
    "Saint-Joseph",
    "Saint-Philippe",
  ],
  nord: ["Saint-Denis", "Sainte-Marie", "Sainte-Suzanne"],
  est: [
    "Saint-André",
    "Bras-Panon",
    "Saint-Benoît",
    "Sainte-Rose",
    "La Plaine-des-Palmistes",
    "Salazie",
  ],
}

const NEARBY_COMMUNES = {
  "le port": ["la possession", "saint-paul"],
  "la possession": ["le port", "saint-paul"],
  "saint-paul": ["le port", "la possession", "trois-bassins"],
  "trois-bassins": ["saint-paul", "saint-leu"],
  "saint-leu": ["trois-bassins", "les avirons", "l'etang-sale", "etang-sale"],
  "les avirons": ["saint-leu", "l'etang-sale", "etang-sale"],
  "l'etang-sale": ["les avirons", "saint-leu", "saint-louis"],
  "etang-sale": ["les avirons", "saint-leu", "saint-louis"],
  "saint-louis": ["l'etang-sale", "etang-sale", "cilaos", "entre-deux", "saint-pierre"],
  cilaos: ["saint-louis"],
  "entre-deux": ["saint-louis", "le tampon"],
  "saint-pierre": ["saint-louis", "le tampon", "petite-ile"],
  "le tampon": ["entre-deux", "saint-pierre", "petite-ile", "saint-joseph"],
  "petite-ile": ["saint-pierre", "le tampon", "saint-joseph"],
  "saint-joseph": ["le tampon", "petite-ile", "saint-philippe"],
  "saint-philippe": ["saint-joseph", "sainte-rose"],
  "saint-denis": ["sainte-marie"],
  "sainte-marie": ["saint-denis", "sainte-suzanne"],
  "sainte-suzanne": ["sainte-marie", "saint-andre"],
  "saint-andre": ["sainte-suzanne", "bras-panon", "salazie"],
  "bras-panon": ["saint-andre", "saint-benoit"],
  "saint-benoit": ["bras-panon", "sainte-rose", "la plaine-des-palmistes"],
  "sainte-rose": ["saint-benoit", "saint-philippe"],
  "la plaine-des-palmistes": ["saint-benoit"],
  salazie: ["saint-andre"],
}

const DEAL_TYPE_LABELS = {
  event: { fr: "Événement", kr: "Événman" },
  free_activity: { fr: "Activité gratuite", kr: "Aktivité gratis" },
  promotion: { fr: "Promotion", kr: "Promo" },
  commercial_offer: { fr: "Offre commerciale", kr: "Lof komersyal" },
  local_service: { fr: "Service local", kr: "Servis lokal" },
  observed_price: { fr: "Prix observé", kr: "Pri observé" },
}

const CONTENT_KIND_LABELS = {
  event: { fr: "Événement", kr: "Événman" },
  permanent_leisure: { fr: "Toute l’année", kr: "Toute lanné" },
  other: { fr: "Bon plan", kr: "Bon plan" },
}

const AVAILABILITY_LABELS = {
  open: { fr: "Ouvert", kr: "Lé ouvert" },
  seasonal: { fr: "Ouverture saisonnière", kr: "Ouvert selon saison" },
  temporarily_closed: { fr: "Fermé temporairement", kr: "Fermé pou linstan" },
  check_before_visit: { fr: "À vérifier avant la visite", kr: "Vérifie avan allé" },
  unknown: { fr: "Disponibilité à confirmer", kr: "Disponibilité pou confirmé" },
}

function isKreolLanguage(language) {
  const value = String(language || "").toLowerCase()
  return value === "cr" || value === "kreol"
}

function normalizePlace(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "'")
    .replace(/^sainte?\s+/, match => match.trim().startsWith("sainte") ? "sainte-" : "saint-")
    .replace(/\s+/g, " ")
    .trim()
}

function normalizeSearchText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function normalizeDealTag(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

function getDealTags(deal = {}) {
  const rawTags = Array.isArray(deal.tags)
    ? deal.tags
    : typeof deal.tags === "string"
      ? deal.tags.split(",")
      : []

  return rawTags
    .map(normalizeDealTag)
    .filter(Boolean)
}

function getShoppingProductCategory(deal = {}) {
  const tags = getDealTags(deal)
  if (tags.length === 0) return ""

  for (const option of SHOPPING_PRODUCT_CATEGORY_OPTIONS) {
    if (option.id === "all") continue

    const expectedTags = SHOPPING_PRODUCT_CATEGORY_TAGS[option.id] || []
    if (expectedTags.some(tag => tags.includes(tag))) {
      return option.id
    }
  }

  return ""
}

function matchesShoppingSearch(deal = {}, search = "") {
  const normalizedSearch = normalizeSearchText(search)
  if (!normalizedSearch) return true

  const conditions = Array.isArray(deal.conditions)
    ? deal.conditions
    : deal.conditions
      ? [deal.conditions]
      : []

  const haystack = [
    deal.title,
    deal.description,
    deal.business_name,
    deal.price_note,
    ...(Array.isArray(deal.tags) ? deal.tags : typeof deal.tags === "string" ? [deal.tags] : []),
    ...conditions,
  ]
    .filter(Boolean)
    .map(normalizeSearchText)
    .join(" ")

  return haystack.includes(normalizedSearch)
}

function openContactPage() {
  if (typeof window === "undefined") return

  window.dispatchEvent(
    new CustomEvent("budgetkazpei:navigate", {
      detail: "contact",
    })
  )

  window.scrollTo({
    top: 0,
    behavior: "smooth",
  })
}

function normalizeCategory(value = "") {
  const category = String(value || "").toLowerCase().trim()

  if (["leisure", "loisirs", "family", "culture", "event", "free_activity"].includes(category)) return "leisure"
  if (["shopping", "courses", "grocery", "supermarket"].includes(category)) return "shopping"
  if (["food", "restaurant", "restaurants", "bakery"].includes(category)) return "food"
  if (["home", "services", "home_services", "artisan", "repair"].includes(category)) return "home"
  if (["transport", "mobility", "fuel"].includes(category)) return "transport"
  if (["local", "local_business", "commerce", "commercial_offer"].includes(category)) return "local"

  return category || "local"
}

function getMicroRegion(commune = "") {
  const normalizedCommune = normalizePlace(commune)

  return Object.entries(MICRO_REGIONS).find(([, communes]) =>
    communes.some(item => normalizePlace(item) === normalizedCommune)
  )?.[0] || ""
}


function buildAreaOptions() {
  const communeOptions = REUNION_COMMUNES.map(commune => ({
    id: `commune:${normalizePlace(commune)}`,
    type: "commune",
    label: commune,
    commune,
    microRegion: getMicroRegion(commune),
  }))

  const placeOptions = EXPLORATION_PLACES.map((place, index) => ({
    id: `${place.type}:${normalizePlace(place.label)}:${index}`,
    microRegion: place.microRegion || getMicroRegion(place.commune || ""),
    ...place,
  }))

  return [
    {
      id: "all:reunion",
      type: "all",
      label: "Toute La Réunion",
      commune: "",
      locality: "",
      territoryName: "",
      microRegion: "",
    },
    ...communeOptions,
    ...placeOptions,
  ]
}

function getAreaSecondaryLabel(area = {}, isKreol = false) {
  if (area.type === "all") return isKreol ? "Toute l’île" : "Toute l’île"
  if (area.type === "territory") {
    return area.commune
      ? `${area.commune} · ${area.territoryName || area.label}`
      : area.territoryName || area.label
  }
  if (area.type === "locality") {
    return [area.commune, area.territoryName].filter(Boolean).join(" · ")
  }
  return isKreol ? "Kominn" : "Commune"
}

function isSameArea(first = {}, second = {}) {
  return first.type === second.type &&
    normalizePlace(first.commune) === normalizePlace(second.commune) &&
    normalizePlace(first.locality) === normalizePlace(second.locality) &&
    normalizePlace(first.territoryName) === normalizePlace(second.territoryName)
}

function placeMatches(value, searchedValue) {
  const normalizedValue = normalizePlace(value)
  const normalizedSearch = normalizePlace(searchedValue)

  if (!normalizedValue || !normalizedSearch) return false

  return normalizedValue === normalizedSearch ||
    normalizedValue.includes(normalizedSearch) ||
    normalizedSearch.includes(normalizedValue)
}

function getDealLocation(deal = {}) {
  return deal.commune || deal.business_commune || deal.city || deal.territory || ""
}

function getDealUrl(deal = {}) {
  return deal.source_url || deal.contact_url || deal.business_website_url || deal.url || ""
}

function getDealEndDate(deal = {}) {
  return deal.ends_at || deal.end_date || ""
}

function getDealStartDate(deal = {}) {
  return deal.starts_at || deal.start_date || ""
}

function getDealContentKind(deal = {}) {
  const explicitKind = String(deal.content_kind || "").toLowerCase().trim()

  if (["event", "permanent_leisure", "promotion", "observed_price"].includes(explicitKind)) {
    return explicitKind
  }

  if (normalizeCategory(deal.category) !== "leisure") return "other"

  if (
    deal.opening_hours_note ||
    deal.availability_status ||
    deal.booking_required !== null && deal.booking_required !== undefined ||
    (!getDealStartDate(deal) && !getDealEndDate(deal))
  ) {
    return "permanent_leisure"
  }

  return "event"
}

function isPermanentLeisure(deal = {}) {
  return getDealContentKind(deal) === "permanent_leisure"
}

function getShoppingDisplayKind(deal = {}) {
  const tags = Array.isArray(deal.tags)
    ? deal.tags.map(tag => String(tag || "").toLowerCase().trim())
    : []

  const explicitKind = getDealContentKind(deal)

  if (explicitKind === "observed_price" || tags.includes("observed_price")) {
    return "observed_price"
  }

  if (
    tags.includes("product_promo") ||
    tags.includes("product-promo") ||
    tags.includes("promo_product")
  ) {
    return "product_promotion"
  }

  return "catalog"
}

function getAvailabilityLabel(value, isKreol) {
  const label = AVAILABILITY_LABELS[String(value || "unknown").toLowerCase()] || AVAILABILITY_LABELS.unknown
  return isKreol ? label.kr : label.fr
}

function getDealTypeLabel(deal, isKreol) {
  const contentKind = getDealContentKind(deal)

  if (contentKind === "permanent_leisure") {
    return isKreol ? CONTENT_KIND_LABELS.permanent_leisure.kr : CONTENT_KIND_LABELS.permanent_leisure.fr
  }

  const label = DEAL_TYPE_LABELS[deal.deal_type] || CONTENT_KIND_LABELS[contentKind] || CONTENT_KIND_LABELS.other
  return isKreol ? label.kr : label.fr
}

function formatDate(value, options = {}) {
  if (!value) return ""

  try {
    return new Intl.DateTimeFormat("fr-FR", {
      timeZone: REUNION_TIME_ZONE,
      day: "numeric",
      month: "long",
      year: "numeric",
      ...options,
    }).format(new Date(value))
  } catch {
    return ""
  }
}

function isSameReunionDay(startValue, endValue) {
  if (!startValue || !endValue) return false

  const formatter = new Intl.DateTimeFormat("fr-CA", {
    timeZone: REUNION_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })

  return formatter.format(new Date(startValue)) === formatter.format(new Date(endValue))
}

function getDealPeriod(deal, isKreol) {
  const startsAt = getDealStartDate(deal)
  const endsAt = getDealEndDate(deal)

  if (startsAt && endsAt && isSameReunionDay(startsAt, endsAt)) {
    return formatDate(startsAt)
  }

  if (startsAt && endsAt) {
    return isKreol
      ? `Depi ${formatDate(startsAt)} ziska ${formatDate(endsAt)}`
      : `Du ${formatDate(startsAt)} au ${formatDate(endsAt)}`
  }

  if (startsAt) {
    return isKreol ? `A partir ${formatDate(startsAt)}` : `À partir du ${formatDate(startsAt)}`
  }

  if (endsAt) {
    return isKreol ? `Ziska ${formatDate(endsAt)}` : `Jusqu'au ${formatDate(endsAt)}`
  }

  return ""
}

function getLastVerificationText(deal, isKreol) {
  const value = deal.last_verified_at || deal.verified_at || deal.updated_at
  if (!value) return ""

  return isKreol
    ? `Dèrnyé vérifikasyon : ${formatDate(value)}`
    : `Dernière vérification : ${formatDate(value)}`
}

function getDealMatch(deal, area = {}) {
  const selectedType = area.type || "commune"
  const normalizedUserCommune = normalizePlace(area.commune)
  const normalizedUserLocality = normalizePlace(area.locality)
  const normalizedTerritory = normalizePlace(area.territoryName)
  const normalizedMicroRegion = normalizePlace(area.microRegion || getMicroRegion(area.commune || ""))

  const dealCommune = normalizePlace(getDealLocation(deal))
  const dealLocality = normalizePlace(deal.locality)
  const dealTerritory = normalizePlace(deal.territory_name)
  const targetedCommunes = (deal.targeted_communes || []).map(normalizePlace)
  const scopeType = String(deal.scope_type || "commune").toLowerCase()
  const dealRegion = normalizePlace(deal.micro_region || getMicroRegion(getDealLocation(deal)))

  if (selectedType === "all") {
    if (scopeType === "island") return { visible: true, rank: 4, group: "island" }
    if (scopeType === "online") return { visible: true, rank: 5, group: "online" }

    const regionRanks = { ouest: 0, sud: 1, nord: 2, est: 3 }
    if (Object.prototype.hasOwnProperty.call(regionRanks, dealRegion)) {
      return { visible: true, rank: regionRanks[dealRegion], group: dealRegion }
    }

    return { visible: true, rank: 6, group: "other" }
  }

  if (selectedType === "territory" && normalizedTerritory && placeMatches(dealTerritory, normalizedTerritory)) {
    return { visible: true, rank: 0, group: "territory" }
  }

  if (selectedType === "locality" && normalizedUserLocality && placeMatches(dealLocality, normalizedUserLocality)) {
    return { visible: true, rank: 0, group: "locality" }
  }

  if (normalizedUserCommune) {
    if (dealCommune === normalizedUserCommune || targetedCommunes.includes(normalizedUserCommune)) {
      const rank = selectedType === "commune" ? 0 : 1
      return { visible: true, rank, group: "local" }
    }

    const nearby = NEARBY_COMMUNES[normalizedUserCommune] || []
    if (scopeType === "nearby" && nearby.includes(dealCommune)) {
      return { visible: true, rank: 2, group: "nearby" }
    }
  }

  if (
    scopeType === "micro_region" &&
    normalizedMicroRegion &&
    dealRegion === normalizedMicroRegion
  ) {
    return { visible: true, rank: 3, group: "region" }
  }

  if (scopeType === "island") return { visible: true, rank: 4, group: "island" }
  if (scopeType === "online") return { visible: true, rank: 5, group: "online" }

  return { visible: false, rank: 99, group: "other" }
}

function getGroupLabel(group, area = {}, isKreol) {
  const commune = area.commune || ""
  const microRegion = area.microRegion || getMicroRegion(commune)

  if (group === "locality") {
    return isKreol ? `Dann ${area.label}` : `À ${area.label}`
  }

  if (group === "territory") {
    return isKreol ? `Dann ${area.territoryName || area.label}` : `Dans ${area.territoryName || area.label}`
  }

  if (group === "local") {
    if (area.type === "locality" || area.type === "territory") {
      return commune
        ? isKreol ? `Ot bon plan dann ${commune}` : `Autres idées dans la commune de ${commune}`
        : isKreol ? "Ot bon plan pa loin" : "Autres idées à proximité"
    }

    return commune
      ? isKreol ? `Dann kominn ${commune}` : `Dans la commune de ${commune}`
      : isKreol ? "Près koté ou" : "Près de chez vous"
  }

  if (group === "nearby") {
    return commune
      ? isKreol ? `Pa loin ${commune}` : `À proximité de ${commune}`
      : isKreol ? "Pa loin koté ou" : "À proximité"
  }

  if (group === "region") {
    const region = microRegion ? `${microRegion.charAt(0).toUpperCase()}${microRegion.slice(1)}` : "La Réunion"
    return isKreol ? `Dann mikro-rézion ${region}` : `Dans la microrégion ${region}`
  }

  if (["ouest", "sud", "nord", "est"].includes(group)) {
    const region = `${group.charAt(0).toUpperCase()}${group.slice(1)}`
    return isKreol ? `Mikro-rézion ${region}` : `Microrégion ${region}`
  }

  if (group === "island") return isKreol ? "Partou La Rényon" : "Partout à La Réunion"
  if (group === "online") return isKreol ? "Disponible an lign" : "Disponible en ligne"

  return isKreol ? "Ot bon plan" : "Autres bons plans"
}

function getGoodDealsThemeStyles() {
  const isDark = COLORS.themeName === "dark"
  const cardShadow = isDark ? "0 18px 42px rgba(0,0,0,.22)" : COLORS.shadow
  const elevatedShadow = isDark ? "0 24px 58px rgba(0,0,0,.32)" : COLORS.shadow

  return {
    isDark,
    heroBackground: isDark
      ? `linear-gradient(135deg, ${COLORS.surface}, ${COLORS.card})`
      : `linear-gradient(135deg, ${COLORS.peachSoft}, ${COLORS.lavenderSoft})`,
    softPanelBackground: isDark
      ? `linear-gradient(135deg, ${COLORS.surface}, ${COLORS.card})`
      : `linear-gradient(135deg, ${COLORS.pastelBlue}, ${COLORS.lavenderSoft})`,
    sectionBackground: isDark ? COLORS.surface : COLORS.card,
    cardBackground: COLORS.card,
    elevatedBackground: isDark ? COLORS.elevated : COLORS.card,
    inputBackground: isDark ? COLORS.input : COLORS.surface,
    buttonBackground: isDark ? COLORS.elevated : COLORS.card,
    selectedBackground: isDark ? COLORS.selected : COLORS.peachSoft,
    hoverBackground: isDark ? COLORS.hover : COLORS.cardLight,
    badgeBackground: isDark ? COLORS.row : COLORS.card,
    warmSoft: isDark ? COLORS.selected : COLORS.peachSoft,
    blueSoft: isDark ? COLORS.blueSoft : COLORS.pastelBlue,
    greenSoft: COLORS.sageSoft,
    yellowSoft: COLORS.yellowSoft,
    purpleSoft: COLORS.lavenderSoft,
    secondaryText: isDark ? COLORS.whiteSoft : COLORS.muted,
    border: isDark ? COLORS.border : COLORS.border,
    borderSubtle: isDark ? COLORS.borderSubtle : COLORS.border,
    cardShadow,
    elevatedShadow,
    hoverVars: {
      "--good-deals-hover-bg": isDark ? COLORS.hover : COLORS.cardLight,
      "--good-deals-hover-border": COLORS.borderStrong,
    },
    cardHoverVars: {
      "--good-deals-card-hover": isDark ? COLORS.cardLight : COLORS.card,
      "--good-deals-card-hover-border": isDark ? COLORS.borderStrong : COLORS.border,
    },
    primaryHoverVars: {
      "--good-deals-primary-hover": COLORS.accentHover,
    },
  }
}


function AreaExplorerDialog({
  open,
  options,
  selectedArea,
  profileCommune,
  isKreol,
  isMobile,
  onClose,
  onSelect,
}) {
  const [query, setQuery] = useState("")

  useEffect(() => {
    if (!open) return undefined

    setQuery("")

    function handleKeyDown(event) {
      if (event.key === "Escape") onClose()
    }

    const previousOverflow = typeof document !== "undefined" ? document.body.style.overflow : ""

    if (typeof document !== "undefined") {
      document.body.style.overflow = "hidden"
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      if (typeof document !== "undefined") {
        document.body.style.overflow = previousOverflow
      }
    }
  }, [onClose, open])

  const filteredOptions = useMemo(() => {
    const normalizedQuery = normalizePlace(query)
    if (!normalizedQuery) return options

    return options.filter(option => {
      const haystack = [
        option.label,
        option.commune,
        option.locality,
        option.territoryName,
        option.microRegion,
      ]
        .filter(Boolean)
        .map(normalizePlace)
        .join(" ")

      return haystack.includes(normalizedQuery)
    })
  }, [options, query])

  if (!open) return null

  const pageTheme = getGoodDealsThemeStyles()

  return (
    <div
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose()
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: COLORS.overlay,
        backdropFilter: "blur(5px)",
        display: "flex",
        alignItems: isMobile ? "flex-end" : "center",
        justifyContent: "center",
        padding: isMobile ? 0 : 24,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={isKreol ? "Explor in ot kominn" : "Explorer une autre commune"}
        style={{
          width: "100%",
          maxWidth: isMobile ? "none" : 720,
          maxHeight: isMobile ? "88dvh" : "82dvh",
          overflow: "hidden",
          background: pageTheme.cardBackground,
          border: `1px solid ${pageTheme.border}`,
          borderRadius: isMobile ? "24px 24px 0 0" : 24,
          boxShadow: pageTheme.elevatedShadow,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: isMobile ? "18px 18px 14px" : "22px 22px 16px",
            borderBottom: `1px solid ${pageTheme.borderSubtle}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
          }}
        >
          <div>
            <div style={{ color: COLORS.accent, fontSize: 12, fontWeight: 950, marginBottom: 6 }}>
              {isKreol ? "Explore La Rényon" : "Explorer La Réunion"}
            </div>
            <div style={{ color: COLORS.text, fontSize: isMobile ? 20 : 24, fontWeight: 950, lineHeight: 1.15 }}>
              {isKreol ? "Rod in kominn, in vilaz ou in teritwar" : "Rechercher une commune, un village ou un territoire"}
            </div>
            <div style={{ color: COLORS.muted, fontSize: 12.5, lineHeight: 1.5, marginTop: 7 }}>
              {profileCommune
                ? isKreol
                  ? `Out profil i reste su ${profileCommune}. Sa recherche-la lé temporaire.`
                  : `Votre profil reste associé à ${profileCommune}. Cette recherche est temporaire.`
                : isKreol
                  ? "Sa choix-la i change pa out profil."
                  : "Cette sélection ne modifie pas votre profil."}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={isKreol ? "Fèrmé" : "Fermer"}
            className="good-deals-hoverable"
            style={{
              ...pageTheme.hoverVars,
              width: 42,
              height: 42,
              minHeight: 42,
              borderRadius: 13,
              border: `1px solid ${pageTheme.border}`,
              background: pageTheme.buttonBackground,
              color: COLORS.text,
              cursor: "pointer",
              fontSize: 24,
              lineHeight: 1,
              fontFamily: "inherit",
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: isMobile ? 16 : 20, overflowY: "auto" }}>
          <input
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={isKreol ? "Ex : Cilaos, Hell-Bourg, Saint-Pierre..." : "Ex. : Cilaos, Hell-Bourg, Saint-Pierre..."}
            autoFocus={!isMobile}
            style={{
              width: "100%",
              minHeight: 50,
              borderRadius: 14,
              border: `1px solid ${pageTheme.border}`,
              background: pageTheme.inputBackground,
              color: COLORS.text,
              padding: "0 14px",
              fontFamily: "inherit",
              fontSize: 14,
              outline: "none",
              marginBottom: 14,
            }}
          />

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 9 }}>
            {filteredOptions.map(option => {
              const active = isSameArea(option, selectedArea)
              const secondaryLabel = getAreaSecondaryLabel(option, isKreol)

              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onSelect(option)}
                  className="good-deals-hoverable"
                  style={{
                    ...pageTheme.hoverVars,
                    minHeight: 64,
                    display: "flex",
                    alignItems: "center",
                    gap: 11,
                    borderRadius: 15,
                    border: active ? `1px solid ${COLORS.accent}77` : `1px solid ${pageTheme.border}`,
                    background: active ? pageTheme.selectedBackground : pageTheme.buttonBackground,
                    color: COLORS.text,
                    padding: "10px 12px",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    textAlign: "left",
                  }}
                >
                  <span
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 12,
                      background: active ? pageTheme.selectedBackground : pageTheme.badgeBackground,
                      border: `1px solid ${active ? COLORS.accent : pageTheme.border}33`,
                      color: active ? COLORS.accent : COLORS.cyan,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <BkIcons.location size={18} />
                  </span>

                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 13.5, fontWeight: 950, lineHeight: 1.25 }}>
                      {option.label}
                    </span>
                    <span style={{ display: "block", color: COLORS.muted, fontSize: 11.5, marginTop: 3, lineHeight: 1.3 }}>
                      {secondaryLabel}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>

          {filteredOptions.length === 0 && (
            <div style={{ color: COLORS.muted, textAlign: "center", padding: "26px 12px", fontSize: 13 }}>
              {isKreol ? "Nou la pa trouvé sa landrwa-la." : "Aucun lieu correspondant n’a été trouvé."}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DealCard({ deal, isKreol }) {
  const pageTheme = getGoodDealsThemeStyles()
  const location = getDealLocation(deal)
  const locality = String(deal.locality || "").trim()
  const territoryName = String(deal.territory_name || "").trim()
  const dealUrl = getDealUrl(deal)
  const period = getDealPeriod(deal, isKreol)
  const displayDescription = deal.display_description ?? String(deal.description || "").trim()
  const displayPriceNote = deal.display_price_note ?? String(deal.price_note || "").trim()
  const freshObservedPromotion = deal.show_fresh_observed_label === true
  const permanentLeisure = isPermanentLeisure(deal)
  const isSponsored = Boolean(deal.is_sponsored || deal.sponsored)
  const isPartner = Boolean(deal.business_is_partner || deal.is_partner || deal.partner)
  const isVerified = Boolean(deal.business_is_verified)
  const lastVerificationText = getLastVerificationText(deal, isKreol)
  const CardIcon = permanentLeisure ? BkIcons.leisure : BkIcons.deals

  return (
    <article
      className="good-deals-card"
      style={{
        ...pageTheme.cardHoverVars,
        background: pageTheme.cardBackground,
        border: `1px solid ${pageTheme.borderSubtle}`,
        borderRadius: 20,
        padding: 18,
        boxShadow: pageTheme.cardShadow,
        display: "flex",
        flexDirection: "column",
        gap: 13,
        minHeight: permanentLeisure ? 330 : 270,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div
          style={{
            width: 46,
            height: 46,
            borderRadius: 15,
            background: permanentLeisure ? pageTheme.greenSoft : pageTheme.warmSoft,
            border: `1px solid ${permanentLeisure ? COLORS.green : COLORS.accent}33`,
            color: permanentLeisure ? COLORS.green : COLORS.accent,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <CardIcon size={22} />
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Badge
            label={getDealTypeLabel(deal, isKreol)}
            color={permanentLeisure ? COLORS.green : COLORS.cyan}
            background={permanentLeisure ? pageTheme.greenSoft : pageTheme.blueSoft}
          />
          {deal.is_free === true && (
            <Badge label={isKreol ? "Gratis" : "Gratuit"} color={COLORS.green} background={pageTheme.greenSoft} />
          )}
          {(isSponsored || isPartner) && (
            <Badge
              label={isSponsored ? "Sponsorisé" : isKreol ? "Partenèr" : "Partenaire"}
              color={isSponsored ? COLORS.yellow : COLORS.green}
              background={isSponsored ? pageTheme.yellowSoft : pageTheme.greenSoft}
            />
          )}
        </div>
      </div>

      <div style={{ minWidth: 0 }}>
        <div style={{ color: COLORS.muted, fontSize: 12, fontWeight: 900, marginBottom: 5 }}>
          {deal.business_name || deal.businessName || deal.store_name || (isKreol ? "Bon plan lokal" : "Bon plan local")}
        </div>

        <h2 style={{ margin: 0, color: COLORS.text, fontSize: 19, lineHeight: 1.2, fontWeight: 950 }}>
          {deal.title}
        </h2>

        {displayDescription && (
          <p style={{ margin: "9px 0 0", color: pageTheme.secondaryText, fontSize: 13, lineHeight: 1.55 }}>
            {displayDescription}
          </p>
        )}
      </div>

      <div style={{ marginTop: "auto", display: "grid", gap: 9 }}>
        {!permanentLeisure && period && (
          <div style={{ display: "flex", alignItems: "center", gap: 7, color: COLORS.text, fontSize: 12, fontWeight: 900 }}>
            <BkIcons.calendar size={15} color={COLORS.purple} />
            {period}
          </div>
        )}

        {!permanentLeisure && freshObservedPromotion && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              alignSelf: "flex-start",
              gap: 7,
              color: COLORS.green,
              background: pageTheme.greenSoft,
              border: `1px solid ${COLORS.green}2e`,
              borderRadius: 999,
              padding: "5px 9px",
              fontSize: 11.5,
              fontWeight: 900,
            }}
          >
            <BkIcons.check size={14} />
            {isKreol ? "Promo nou la observ\u00e9 r\u00e9cemment" : "Promo observ\u00e9e r\u00e9cemment"}
          </div>
        )}

        {(location || locality || territoryName) && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 7, color: COLORS.muted, fontSize: 12, fontWeight: 850 }}>
            <BkIcons.location size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              {[locality, location, territoryName].filter(Boolean).join(" · ")}
            </span>
          </div>
        )}

        {permanentLeisure && deal.opening_hours_note && (
          <InfoLine
            label={isKreol ? "Kan i ouvre" : "Horaires"}
            value={deal.opening_hours_note}
            color={COLORS.cyan}
          />
        )}

        {permanentLeisure && deal.availability_status && (
          <InfoLine
            label={isKreol ? "Disponibilité" : "Disponibilité"}
            value={getAvailabilityLabel(deal.availability_status, isKreol)}
            color={deal.availability_status === "open" ? COLORS.green : COLORS.yellow}
          />
        )}

        {permanentLeisure && deal.booking_required !== null && deal.booking_required !== undefined && (
          <InfoLine
            label={isKreol ? "Rézervasyon" : "Réservation"}
            value={deal.booking_required
              ? isKreol ? "Obligatwar ou conseillé" : "Obligatoire ou conseillée"
              : isKreol ? "Pa obligatwar" : "Non obligatoire"}
            color={deal.booking_required ? COLORS.yellow : COLORS.green}
          />
        )}

        {permanentLeisure && (deal.minimum_age !== null && deal.minimum_age !== undefined || deal.audience) && (
          <InfoLine
            label={isKreol ? "Pou ki moun" : "Public"}
            value={deal.audience || `${isKreol ? "Depi" : "À partir de"} ${deal.minimum_age} ${isKreol ? "an" : "ans"}`}
            color={COLORS.purple}
          />
        )}

        {displayPriceNote && (
          <div style={{ color: COLORS.accent, fontSize: 12.5, lineHeight: 1.45, fontWeight: 950 }}>
            {displayPriceNote}
          </div>
        )}

        {permanentLeisure && deal.access_warning && (
          <div
            style={{
              background: pageTheme.yellowSoft,
              border: `1px solid ${COLORS.yellow}33`,
              borderRadius: 11,
              padding: "9px 10px",
              color: COLORS.text,
              fontSize: 11.5,
              lineHeight: 1.45,
              fontWeight: 800,
            }}
          >
            {deal.access_warning}
          </div>
        )}

        {lastVerificationText && permanentLeisure && (
          <div style={{ color: COLORS.muted, fontSize: 10.5, lineHeight: 1.4 }}>
            {lastVerificationText}
          </div>
        )}

        {isVerified && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: COLORS.green, fontSize: 11, fontWeight: 900 }}>
            <BkIcons.check size={14} />
            {isKreol ? "Source vérifié" : "Source vérifiée"}
          </div>
        )}

        {dealUrl && (
          <button
            type="button"
            onClick={() => window.open(dealUrl, "_blank", "noopener,noreferrer")}
            className="good-deals-primary"
            style={{
              ...pageTheme.primaryHoverVars,
              width: "100%",
              minHeight: 44,
              border: "none",
              borderRadius: 13,
              background: COLORS.accent,
              color: "#fff",
              cursor: "pointer",
              fontFamily: "inherit",
              fontWeight: 950,
            }}
          >
            {permanentLeisure
              ? isKreol ? "Prépar out sorti" : "Préparer la sortie"
              : isKreol ? "Gad bann detay" : "Voir les détails"}
          </button>
        )}
      </div>
    </article>
  )
}

function InfoLine({ label, value, color }) {
  const pageTheme = getGoodDealsThemeStyles()

  if (!value) return null

  return (
    <div style={{ color: COLORS.muted, fontSize: 11.5, lineHeight: 1.45 }}>
      <span style={{ color, fontWeight: 950 }}>{label} : </span>
      <span style={{ color: pageTheme.secondaryText, fontWeight: 800 }}>{value}</span>
    </div>
  )
}

function Badge({ label, color, background }) {
  return (
    <span
      style={{
        borderRadius: 999,
        padding: "6px 9px",
        background,
        border: `1px solid ${color}44`,
        color,
        fontSize: 10,
        fontWeight: 950,
        textTransform: "uppercase",
        letterSpacing: ".04em",
      }}
    >
      {label}
    </span>
  )
}

function CategoryButton({ option, active, isKreol, onClick }) {
  const pageTheme = getGoodDealsThemeStyles()
  const Icon = option.icon

  return (
    <button
      type="button"
      onClick={onClick}
      className="good-deals-hoverable"
      style={{
        ...pageTheme.hoverVars,
        minHeight: 44,
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "0 13px",
        borderRadius: 999,
        border: active ? `1px solid ${COLORS.accent}66` : `1px solid ${pageTheme.border}`,
        background: active ? pageTheme.selectedBackground : pageTheme.buttonBackground,
        color: active ? COLORS.accent : COLORS.text,
        cursor: "pointer",
        fontFamily: "inherit",
        fontSize: 12,
        fontWeight: 950,
        whiteSpace: "nowrap",
      }}
    >
      <Icon size={16} />
      {isKreol ? option.kr : option.fr}
    </button>
  )
}

function LeisureModeSelector({ activeMode, counts, isKreol, isMobile, onChange }) {
  const pageTheme = getGoodDealsThemeStyles()

  return (
    <div
      style={{
        background: pageTheme.sectionBackground,
        border: `1px solid ${pageTheme.border}`,
        borderRadius: 20,
        padding: isMobile ? 14 : 16,
        boxShadow: pageTheme.cardShadow,
      }}
    >
      <div style={{ color: COLORS.text, fontSize: 14, fontWeight: 950, marginBottom: 5 }}>
        {isKreol ? "Kèl kalite sorti ou rode ?" : "Quel type de sortie recherchez-vous ?"}
      </div>
      <div style={{ color: COLORS.muted, fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>
        {isKreol
          ? "Bann événman nana in dat. Bann loisir permanent lé disponible régulièrement toute lanné."
          : "Les événements ont une date précise. Les loisirs permanents sont disponibles régulièrement toute l’année."}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 10 }}>
        {LEISURE_VIEW_OPTIONS.map(option => {
          const Icon = option.icon
          const active = activeMode === option.id
          const count = counts?.[option.id] || 0

          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onChange(option.id)}
              className="good-deals-hoverable"
              style={{
                ...pageTheme.hoverVars,
                minHeight: 64,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "10px 13px",
                borderRadius: 15,
                border: active ? `1px solid ${COLORS.accent}66` : `1px solid ${pageTheme.border}`,
                background: active ? pageTheme.selectedBackground : pageTheme.buttonBackground,
                color: active ? COLORS.accent : COLORS.text,
                cursor: "pointer",
                fontFamily: "inherit",
                textAlign: "left",
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 9, fontSize: 13, fontWeight: 950 }}>
                <Icon size={18} />
                {isKreol ? option.kr : option.fr}
              </span>
              <span
                style={{
                  minWidth: 28,
                  height: 28,
                  padding: "0 8px",
                  borderRadius: 999,
                  background: active ? pageTheme.selectedBackground : pageTheme.badgeBackground,
                  border: `1px solid ${active ? COLORS.accent : pageTheme.border}33`,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 950,
                }}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}


function ShoppingModeSelector({ activeMode, counts, isKreol, isMobile, onChange }) {
  const pageTheme = getGoodDealsThemeStyles()

  return (
    <div
      style={{
        background: pageTheme.sectionBackground,
        border: `1px solid ${pageTheme.border}`,
        borderRadius: 20,
        padding: isMobile ? 14 : 16,
        boxShadow: pageTheme.cardShadow,
      }}
    >
      <div style={{ color: COLORS.text, fontSize: 14, fontWeight: 950, marginBottom: 5 }}>
        {isKreol ? "Kosa ou vé voir ?" : "Que souhaitez-vous consulter ?"}
      </div>

      <div style={{ color: COLORS.muted, fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>
        {isKreol
          ? "Promo produi i montre pri avan ek pri promo. Katalog i regroupe toute bann lof. Bon pri repéré i sorti dan bann tiké anonymizé."
          : "Les promos produits affichent l’ancien prix et le prix promotionnel. Les catalogues regroupent toutes les offres. Les bons prix repérés proviendront des tickets anonymisés."}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: 10 }}>
        {SHOPPING_VIEW_OPTIONS.map(option => {
          const Icon = option.icon
          const active = activeMode === option.id
          const count = counts?.[option.id] || 0

          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onChange(option.id)}
              className="good-deals-hoverable"
              style={{
                ...pageTheme.hoverVars,
                minHeight: 64,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "10px 13px",
                borderRadius: 15,
                border: active ? `1px solid ${COLORS.accent}66` : `1px solid ${pageTheme.border}`,
                background: active ? pageTheme.selectedBackground : pageTheme.buttonBackground,
                color: active ? COLORS.accent : COLORS.text,
                cursor: "pointer",
                fontFamily: "inherit",
                textAlign: "left",
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 9, fontSize: 13, fontWeight: 950 }}>
                <Icon size={18} />
                {isKreol ? option.kr : option.fr}
              </span>

              <span
                style={{
                  minWidth: 28,
                  height: 28,
                  padding: "0 8px",
                  borderRadius: 999,
                  background: active ? pageTheme.selectedBackground : pageTheme.badgeBackground,
                  border: `1px solid ${active ? COLORS.accent : pageTheme.border}33`,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: active ? COLORS.accent : COLORS.muted,
                  fontSize: 11,
                  fontWeight: 950,
                }}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ShoppingProductFilters({
  isKreol,
  isMobile,
  searchValue,
  activeProductCategory,
  categories,
  onSearchChange,
  onCategoryChange,
  onReset,
}) {
  const pageTheme = getGoodDealsThemeStyles()
  const hasActiveFilters = activeProductCategory !== "all" || String(searchValue || "").trim().length > 0

  return (
    <div
      style={{
        background: pageTheme.sectionBackground,
        border: `1px solid ${pageTheme.border}`,
        borderRadius: 20,
        padding: isMobile ? 14 : 16,
        boxShadow: pageTheme.cardShadow,
        overflow: "hidden",
      }}
    >
      <div style={{ color: COLORS.text, fontSize: 14, fontWeight: 950, marginBottom: 5 }}>
        {isKreol ? "Rod ek trie bann promo" : "Rechercher et filtrer les promotions"}
      </div>

      <div style={{ color: COLORS.muted, fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>
        {isKreol
          ? "Rod par produi, mark ou magazin, ek trie bann résilta par kategori."
          : "Recherchez par produit, marque ou enseigne, puis affinez par catégorie."}
      </div>

      <input
        type="search"
        value={searchValue}
        onChange={event => onSearchChange(event.target.value)}
        placeholder={isKreol ? "Rod in produi, in mark ou in magazin…" : "Rechercher un produit, une marque ou une enseigne…"}
        style={{
          width: "100%",
          minHeight: 46,
          borderRadius: 14,
          border: `1px solid ${pageTheme.border}`,
          background: pageTheme.inputBackground,
          color: COLORS.text,
          padding: "0 14px",
          fontFamily: "inherit",
          fontSize: 14,
          outline: "none",
          marginBottom: 12,
          boxSizing: "border-box",
        }}
      />

      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: isMobile ? "nowrap" : "wrap",
          overflowX: isMobile ? "auto" : "visible",
          paddingBottom: isMobile ? 2 : 0,
          WebkitOverflowScrolling: "touch",
        }}
      >
        {categories.map(option => {
          const active = activeProductCategory === option.id

          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onCategoryChange(option.id)}
              className="good-deals-hoverable"
              style={{
                ...pageTheme.hoverVars,
                minHeight: 44,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "0 13px",
                borderRadius: 999,
                border: active ? `1px solid ${COLORS.accent}66` : `1px solid ${pageTheme.border}`,
                background: active ? pageTheme.selectedBackground : pageTheme.buttonBackground,
                color: active ? COLORS.accent : COLORS.text,
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 12,
                fontWeight: 950,
                whiteSpace: "nowrap",
                flex: "0 0 auto",
              }}
            >
              <span>{isKreol ? option.kr : option.fr}</span>
              <span
                style={{
                  minWidth: 28,
                  height: 28,
                  padding: "0 8px",
                  borderRadius: 999,
                  background: active ? pageTheme.selectedBackground : pageTheme.badgeBackground,
                  border: `1px solid ${active ? COLORS.accent : pageTheme.border}33`,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: active ? COLORS.accent : COLORS.muted,
                  fontSize: 11,
                  fontWeight: 950,
                  boxSizing: "border-box",
                }}
              >
                {option.count}
              </span>
            </button>
          )
        })}

        {hasActiveFilters && (
          <button
            type="button"
            onClick={onReset}
            className="good-deals-hoverable"
            style={{
              ...pageTheme.hoverVars,
              minHeight: 44,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 13px",
              borderRadius: 999,
              border: `1px solid ${pageTheme.border}`,
              background: pageTheme.buttonBackground,
              color: COLORS.muted,
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 12,
              fontWeight: 950,
              whiteSpace: "nowrap",
              flex: "0 0 auto",
            }}
          >
            {isKreol ? "Efase bann filt" : "Effacer les filtres"}
          </button>
        )}
      </div>
    </div>
  )
}

function EmptyDealsState({
  commune,
  isKreol,
  isMobile,
  contentKind = "",
  hasShoppingSearchFilters = false,
}) {
  const pageTheme = getGoodDealsThemeStyles()

  return (
    <div
      style={{
        background: pageTheme.cardBackground,
        border: `1px solid ${pageTheme.borderSubtle}`,
        borderRadius: 24,
        padding: isMobile ? 22 : 34,
        boxShadow: pageTheme.cardShadow,
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 66,
          height: 66,
          margin: "0 auto 16px",
          borderRadius: 22,
          background: pageTheme.warmSoft,
          border: `1px solid ${COLORS.accent}33`,
          color: COLORS.accent,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <BkIcons.deals size={32} />
      </div>

      <h2 style={{ margin: 0, color: COLORS.text, fontSize: isMobile ? 21 : 25, fontWeight: 950 }}>
        {hasShoppingSearchFilters
          ? isKreol
            ? "Nou la pa trouvé promo i korespond ek out recherche."
            : "Aucune promotion ne correspond à votre recherche."
          : contentKind === "event"
          ? isKreol ? "Pa na événman vérifié pou linstan" : "Aucun événement vérifié pour le moment"
          : contentKind === "permanent_leisure"
            ? isKreol ? "Bann loisir permanent i ariv" : "Les loisirs permanents arrivent"
            : contentKind === "product_promotion"
              ? isKreol ? "Pa na promo produi vérifié pou linstan" : "Aucune promotion produit vérifiée pour le moment"
              : contentKind === "catalog"
                ? isKreol ? "Pa na katalog vérifié pou linstan" : "Aucun catalogue vérifié pour le moment"
                : contentKind === "observed_price"
                  ? isKreol ? "Bann bon pri repéré i ariv" : "Les bons prix repérés arrivent"
                  : isKreol ? "Bann bon plan i ariv" : "Les premiers bons plans arrivent"}
      </h2>

      <p style={{ margin: "10px auto 0", maxWidth: 620, color: COLORS.muted, fontSize: 14, lineHeight: 1.65 }}>
        {hasShoppingSearchFilters
          ? isKreol
            ? "Chanj out recherche ou efase bann filt pou revoir toute bann promo disponible."
            : "Modifiez votre recherche ou effacez les filtres pour revoir toutes les promotions disponibles."
          : contentKind === "event"
          ? isKreol
            ? `Pou le moman, nana pa événman à venir publié${commune ? ` pou ${commune}` : ""}. Nou afich seulement bann date vérifié.`
            : `Pour le moment, aucun événement à venir n'est publié${commune ? ` pour ${commune}` : ""}. Nous affichons uniquement des dates vérifiées.`
          : contentKind === "permanent_leisure"
            ? isKreol
              ? `Pou le moman, nana pa loisir toute lanné publié${commune ? ` pou ${commune}` : ""}. Nou vérifie horaires, accès ek tarif avan publication.`
              : `Pour le moment, aucun loisir permanent n'est publié${commune ? ` pour ${commune}` : ""}. Nous vérifions les horaires, l'accès et les tarifs avant publication.`
            : contentKind === "product_promotion"
              ? isKreol
                ? `Pou le moman, nana pa promo produi vérifié${commune ? ` pou ${commune}` : ""}. Nou afich seulement pri ek dat sorti dan source officielle.`
                : `Pour le moment, aucune promotion produit vérifiée n'est disponible${commune ? ` pour ${commune}` : ""}. Nous affichons uniquement des prix et dates issus de sources officielles.`
              : contentKind === "catalog"
                ? isKreol
                  ? `Pou le moman, nana pa katalog vérifié${commune ? ` pou ${commune}` : ""}.`
                  : `Pour le moment, aucun catalogue vérifié n'est disponible${commune ? ` pour ${commune}` : ""}.`
                : contentKind === "observed_price"
                  ? isKreol
                    ? "Bann bon pri repéré va aparèt kan nou gagne assez tiké récent ek fiable."
                    : "Les bons prix repérés apparaîtront lorsque nous disposerons d’assez de tickets récents et fiables."
                  : isKreol
                    ? `Pou le moman, nana pa bon plan publié${commune ? ` pou ${commune}` : ""}. Nou préfère afich seulement bann lof vérifié, san invent prix ni promo.`
                    : `Pour le moment, aucun bon plan n'est publié${commune ? ` pour ${commune}` : ""}. Nous préférons afficher uniquement des offres vérifiées, sans inventer de prix ni de promotions.`}
      </p>

      <ContactDealLink commune={commune} isKreol={isKreol} />
    </div>
  )
}

function LoadingDealsState({ isKreol }) {
  const pageTheme = getGoodDealsThemeStyles()

  return (
    <div style={{ background: pageTheme.cardBackground, border: `1px solid ${pageTheme.borderSubtle}`, borderRadius: 22, padding: 28, color: COLORS.muted, textAlign: "center", boxShadow: pageTheme.cardShadow }}>
      {isKreol ? "Nou lé an train rode bann bon plan vérifié..." : "Recherche des bons plans vérifiés..."}
    </div>
  )
}

function ErrorDealsState({ isKreol, onRetry }) {
  const pageTheme = getGoodDealsThemeStyles()

  return (
    <div style={{ background: COLORS.redSoft, border: `1px solid ${COLORS.red}33`, borderRadius: 22, padding: 24, textAlign: "center" }}>
      <div style={{ color: COLORS.text, fontWeight: 950, marginBottom: 8 }}>
        {isKreol ? "Nou la pa réussi charge bann bon plan." : "Impossible de charger les bons plans."}
      </div>
      <button type="button" onClick={onRetry} className="good-deals-primary" style={{ ...pageTheme.primaryHoverVars, border: "none", borderRadius: 12, background: COLORS.accent, color: "#fff", minHeight: 44, padding: "0 14px", cursor: "pointer", fontFamily: "inherit", fontWeight: 950 }}>
        {isKreol ? "Réésaye" : "Réessayer"}
      </button>
    </div>
  )
}

function ContactDealLink({ commune, isKreol, label }) {
  const pageTheme = getGoodDealsThemeStyles()
  const subject = commune
    ? `Bon plan à signaler - ${commune}`
    : "Bon plan à signaler - La Réunion"

  return (
    <button
      type="button"
      onClick={openContactPage}
      className="good-deals-primary"
      style={{
        ...pageTheme.primaryHoverVars,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        minHeight: 46,
        marginTop: 18,
        padding: "0 16px",
        borderRadius: 14,
        border: "none",
        background: COLORS.accent,
        color: "#fff",
        fontWeight: 950,
        fontSize: 13,
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      <BkIcons.contact size={17} />
      {label || (isKreol ? "Signal in bon plan" : "Signaler un bon plan")}
    </button>
  )
}

function LeisureMissingDealNotice({ commune, isKreol, isMobile }) {
  const pageTheme = getGoodDealsThemeStyles()

  return (
    <div
      style={{
        background: pageTheme.softPanelBackground,
        border: `1px solid ${COLORS.cyan}33`,
        borderRadius: 20,
        padding: isMobile ? 18 : 22,
        display: "flex",
        alignItems: isMobile ? "flex-start" : "center",
        justifyContent: "space-between",
        gap: 16,
        flexDirection: isMobile ? "column" : "row",
      }}
    >
      <div style={{ maxWidth: 760 }}>
        <div style={{ color: COLORS.cyan, fontSize: 13, fontWeight: 950, marginBottom: 6 }}>
          {isKreol ? "In sorti i mank ?" : "Un bon plan n'apparaît pas ?"}
        </div>
        <div style={{ color: COLORS.text, fontSize: isMobile ? 17 : 19, fontWeight: 950, lineHeight: 1.3 }}>
          {isKreol
            ? "Contacte a nou pou signal in activité, in sorti famiy ou in événman près koté ou."
            : "Contactez-nous pour signaler une activité, une sortie familiale ou un événement près de chez vous."}
        </div>
        <div style={{ color: COLORS.muted, fontSize: 12.5, lineHeight: 1.55, marginTop: 7 }}>
          {isKreol
            ? "Met lo nom, kominn, dat ek in lien officiel si ou nana. Nou va vérifie avan publication."
            : "Indiquez le nom, la commune, la date et, si possible, un lien officiel. Nous vérifierons l'information avant publication."}
        </div>
      </div>

      <ContactDealLink
        commune={commune}
        isKreol={isKreol}
        label={isKreol ? "Fé a nou konèt" : "Nous le faire savoir"}
      />
    </div>
  )
}

function TrustCard({ icon: Icon, title, text, accent, background }) {
  const pageTheme = getGoodDealsThemeStyles()
  const descriptionColor = pageTheme.isDark ? COLORS.whiteSoft : COLORS.muted

  return (
    <div
      style={{
        background: pageTheme.isDark ? pageTheme.elevatedBackground : background,
        border: `1px solid ${pageTheme.isDark ? `${accent}44` : `${accent}2f`}`,
        borderRadius: 18,
        padding: 16,
        minHeight: 132,
      }}
    >
      <div style={{ color: accent, marginBottom: 10 }}>
        <Icon size={22} />
      </div>
      <div style={{ color: COLORS.text, fontSize: 14, fontWeight: 950, marginBottom: 6 }}>{title}</div>
      <div style={{ color: descriptionColor, fontSize: 12.5, lineHeight: 1.5 }}>{text}</div>
    </div>
  )
}

export default function GoodDealsPage({
  user,
  profile = {},
  isMobile,
  language = "fr",
}) {
  useTheme()
  const pageTheme = getGoodDealsThemeStyles()

  const isKreol = isKreolLanguage(language)
  const [activeCategory, setActiveCategory] = useState("all")
  const [leisureView, setLeisureView] = useState("event")
  const [shoppingView, setShoppingView] = useState("product_promotion")
  const [shoppingProductCategory, setShoppingProductCategory] = useState("all")
  const [shoppingSearch, setShoppingSearch] = useState("")
  const [deals, setDeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [reloadKey, setReloadKey] = useState(0)
  const [selectedArea, setSelectedArea] = useState(null)
  const [showAreaExplorer, setShowAreaExplorer] = useState(false)

  const commune = String(profile?.commune || "").trim()
  const areaOptions = useMemo(() => buildAreaOptions(), [])

  const profileArea = useMemo(() => {
    if (!commune) return areaOptions[0]

    return {
      id: `profile:${normalizePlace(commune)}`,
      type: "commune",
      label: commune,
      commune,
      locality: "",
      territoryName: "",
      microRegion: getMicroRegion(commune),
      isProfileArea: true,
    }
  }, [areaOptions, commune])

  const activeArea = selectedArea || profileArea
  const activeAreaLabel = activeArea.label || activeArea.commune || (isKreol ? "Toute La Rényon" : "Toute La Réunion")
  const activeCommune = activeArea.commune || ""
  const activeMicroRegion = activeArea.microRegion || getMicroRegion(activeCommune)
  const isExploringElsewhere = Boolean(selectedArea)

  function handleAreaSelect(area) {
    const selectedProfileCommune = area.type === "commune" &&
      normalizePlace(area.commune) === normalizePlace(commune)

    setSelectedArea(selectedProfileCommune ? null : area)
    setShowAreaExplorer(false)
  }

  useEffect(() => {
    let ignore = false

    async function loadGoodDeals() {
      setLoading(true)
      setError("")

      try {
        const prepared = await loadPublishedGoodDeals({ client: supabase })

        if (!ignore) setDeals(prepared)
      } catch (loadError) {
        console.error("Erreur chargement bons plans:", loadError)
        if (!ignore) setError(loadError?.message || "load_failed")
      } finally {
        if (!ignore) setLoading(false)
      }
    }

    loadGoodDeals()

    return () => {
      ignore = true
    }
  }, [reloadKey])

  const geographicallyVisibleDeals = useMemo(() => {
    return (deals || [])
      .filter(deal => deal?.is_active !== false)
      .map(deal => ({
        ...deal,
        normalized_category: normalizeCategory(deal.category),
        content_kind_resolved: getDealContentKind(deal),
        match: getDealMatch(deal, {
          ...activeArea,
          commune: activeCommune,
          microRegion: activeMicroRegion,
        }),
      }))
      .filter(deal => deal.match.visible)
  }, [activeArea, activeCommune, activeMicroRegion, deals])

  const leisureCounts = useMemo(() => {
    return geographicallyVisibleDeals
      .filter(deal => deal.normalized_category === "leisure")
      .reduce(
        (counts, deal) => {
          const kind = deal.content_kind_resolved === "permanent_leisure" ? "permanent_leisure" : "event"
          counts[kind] += 1
          return counts
        },
        { event: 0, permanent_leisure: 0 }
      )
  }, [geographicallyVisibleDeals])

  const shoppingCounts = useMemo(() => {
    return geographicallyVisibleDeals
      .filter(deal => deal.normalized_category === "shopping")
      .reduce(
        (counts, deal) => {
          const kind = getShoppingDisplayKind(deal)
          counts[kind] += 1
          return counts
        },
        { product_promotion: 0, catalog: 0, observed_price: 0 }
      )
  }, [geographicallyVisibleDeals])

  const shouldShowShoppingProductFilters = activeCategory === "shopping" &&
    (shoppingView === "product_promotion" || shoppingView === "observed_price")

  useEffect(() => {
    if (activeCategory === "shopping" && shoppingView !== "catalog") return

    setShoppingProductCategory("all")
    setShoppingSearch("")
  }, [activeCategory, shoppingView])

  const shoppingDealsForActiveView = useMemo(() => {
    return geographicallyVisibleDeals
      .filter(deal => deal.normalized_category === "shopping")
      .filter(deal => getShoppingDisplayKind(deal) === shoppingView)
  }, [geographicallyVisibleDeals, shoppingView])

  const shoppingProductCategoryOptions = useMemo(() => {
    const counts = SHOPPING_PRODUCT_CATEGORY_OPTIONS.reduce((acc, option) => {
      acc[option.id] = 0
      return acc
    }, {})

    counts.all = shoppingDealsForActiveView.length

    shoppingDealsForActiveView.forEach(deal => {
      const category = getShoppingProductCategory(deal)
      if (category && Object.prototype.hasOwnProperty.call(counts, category)) {
        counts[category] += 1
      }
    })

    return SHOPPING_PRODUCT_CATEGORY_OPTIONS
      .filter(option => option.id === "all" || counts[option.id] > 0)
      .map(option => ({
        ...option,
        count: counts[option.id] || 0,
      }))
  }, [shoppingDealsForActiveView])

  const hasActiveShoppingSearchFilters = shouldShowShoppingProductFilters &&
    (shoppingProductCategory !== "all" || normalizeSearchText(shoppingSearch).length > 0)

  const visibleDeals = useMemo(() => {
    return geographicallyVisibleDeals
      .filter(deal => activeCategory === "all" || deal.normalized_category === activeCategory)
      .filter(deal => {
        if (activeCategory === "leisure") {
          return deal.content_kind_resolved === leisureView
        }

        if (activeCategory === "shopping") {
          if (getShoppingDisplayKind(deal) !== shoppingView) return false

          if (shoppingView === "catalog") return true

          if (
            shoppingProductCategory !== "all" &&
            getShoppingProductCategory(deal) !== shoppingProductCategory
          ) {
            return false
          }

          return matchesShoppingSearch(deal, shoppingSearch)
        }

        return true
      })
      .sort((a, b) => {
        if (a.match.rank !== b.match.rank) return a.match.rank - b.match.rank
        if (Boolean(a.is_featured) !== Boolean(b.is_featured)) return a.is_featured ? -1 : 1

        if (a.content_kind_resolved === "permanent_leisure" && b.content_kind_resolved === "permanent_leisure") {
          return String(a.title || "").localeCompare(String(b.title || ""), "fr")
        }

        const aDate = getDealStartDate(a) ? new Date(getDealStartDate(a)).getTime() : Number.MAX_SAFE_INTEGER
        const bDate = getDealStartDate(b) ? new Date(getDealStartDate(b)).getTime() : Number.MAX_SAFE_INTEGER
        return aDate - bDate
      })
  }, [
    activeCategory,
    geographicallyVisibleDeals,
    leisureView,
    shoppingProductCategory,
    shoppingSearch,
    shoppingView,
  ])

  const groupedDeals = useMemo(() => {
    const groups = []
    const order = [
      "locality",
      "territory",
      "local",
      "nearby",
      "region",
      "ouest",
      "sud",
      "nord",
      "est",
      "island",
      "online",
      "other",
    ]

    order.forEach(group => {
      const items = visibleDeals.filter(deal => deal.match.group === group)
      if (items.length > 0) groups.push({ group, items })
    })

    return groups
  }, [visibleDeals])

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <style>{GOOD_DEALS_INTERACTION_STYLES}</style>
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          background: pageTheme.heroBackground,
          border: `1px solid ${COLORS.accent}33`,
          borderRadius: isMobile ? 24 : 28,
          padding: isMobile ? 22 : 30,
          boxShadow: pageTheme.elevatedShadow,
        }}
      >
        <div
          style={{
            position: "absolute",
            width: 180,
            height: 180,
            borderRadius: 999,
            background: `${COLORS.accent}12`,
            right: -60,
            top: -70,
          }}
        />

        <div style={{ position: "relative", maxWidth: 760 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: COLORS.accent, fontSize: 12, fontWeight: 950, textTransform: "uppercase", letterSpacing: ".08em" }}>
            <BkIcons.deals size={18} />
            BudgetKazPéi local
          </div>

          <h1 style={{ margin: "12px 0 8px", color: COLORS.text, fontSize: isMobile ? 30 : 42, lineHeight: 1.02, fontWeight: 950 }}>
            {isKreol ? "Mon bann bon plan" : "Mes bons plans"}
          </h1>

          <p style={{ margin: 0, color: pageTheme.secondaryText, fontSize: isMobile ? 14 : 16, lineHeight: 1.65 }}>
            {isKreol
              ? "Trouv bann lof, servis ek bon plan utile près koté ou, sélectionné pou La Rényon."
              : "Découvrez des offres, des services et des bons plans utiles près de chez vous, sélectionnés pour La Réunion."}
          </p>

          <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", marginTop: 16 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                minHeight: 42,
                padding: "0 12px",
                borderRadius: 999,
                background: pageTheme.cardBackground,
                border: `1px solid ${pageTheme.border}`,
                color: COLORS.text,
                fontSize: 12,
                fontWeight: 950,
              }}
            >
              <BkIcons.location size={16} color={COLORS.cyan} />
              <span>{activeAreaLabel}</span>
              {isExploringElsewhere && (
                <span style={{ color: COLORS.accent, fontSize: 10, textTransform: "uppercase", letterSpacing: ".04em" }}>
                  {isKreol ? "Explorasyon" : "Exploration"}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowAreaExplorer(true)}
              className="good-deals-hoverable"
              style={{
                ...pageTheme.hoverVars,
                minHeight: 42,
                padding: "0 13px",
                borderRadius: 999,
                border: `1px solid ${COLORS.cyan}44`,
                background: pageTheme.blueSoft,
                color: COLORS.text,
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 12,
                fontWeight: 950,
              }}
            >
              {isKreol ? "Rod dann in ot kominn" : "Explorer une autre commune"}
            </button>

            {isExploringElsewhere && commune && (
              <button
                type="button"
                onClick={() => setSelectedArea(null)}
                className="good-deals-hoverable"
                style={{
                  ...pageTheme.hoverVars,
                  minHeight: 42,
                  padding: "0 12px",
                  borderRadius: 999,
                  border: `1px solid ${pageTheme.border}`,
                  background: pageTheme.buttonBackground,
                  color: COLORS.muted,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: 11.5,
                  fontWeight: 900,
                }}
              >
                {isKreol ? `Retour ${commune}` : `Revenir à ${commune}`}
              </button>
            )}
          </div>

          {isExploringElsewhere && (
            <div style={{ color: COLORS.muted, fontSize: 11.5, lineHeight: 1.45, marginTop: 9 }}>
              {isKreol
                ? "Sa recherche-la i change pa kominn dann out profil."
                : "Cette exploration est temporaire et ne modifie pas la commune de votre profil."}
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          background: pageTheme.sectionBackground,
          border: `1px solid ${pageTheme.border}`,
          borderRadius: 20,
          padding: 14,
          boxShadow: pageTheme.cardShadow,
        }}
      >
        <div style={{ color: COLORS.text, fontSize: 13, fontWeight: 950, marginBottom: 10 }}>
          {isKreol ? "Filtre par kategori" : "Filtrer par catégorie"}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {CATEGORY_OPTIONS.map(option => (
            <CategoryButton
              key={option.id}
              option={option}
              active={activeCategory === option.id}
              isKreol={isKreol}
              onClick={() => {
                setActiveCategory(option.id)

                if (option.id !== "leisure") {
                  setLeisureView("event")
                }

                if (option.id !== "shopping") {
                  setShoppingView("product_promotion")
                }
              }}
            />
          ))}
        </div>
      </div>

      {activeCategory === "leisure" && (
        <LeisureModeSelector
          activeMode={leisureView}
          counts={leisureCounts}
          isKreol={isKreol}
          isMobile={isMobile}
          onChange={setLeisureView}
        />
      )}

      {activeCategory === "shopping" && (
        <ShoppingModeSelector
          activeMode={shoppingView}
          counts={shoppingCounts}
          isKreol={isKreol}
          isMobile={isMobile}
          onChange={setShoppingView}
        />
      )}

      {shouldShowShoppingProductFilters && (
        <ShoppingProductFilters
          isKreol={isKreol}
          isMobile={isMobile}
          searchValue={shoppingSearch}
          activeProductCategory={shoppingProductCategory}
          categories={shoppingProductCategoryOptions}
          onSearchChange={setShoppingSearch}
          onCategoryChange={setShoppingProductCategory}
          onReset={() => {
            setShoppingProductCategory("all")
            setShoppingSearch("")
          }}
        />
      )}

      {loading ? (
        <LoadingDealsState isKreol={isKreol} />
      ) : error ? (
        <ErrorDealsState isKreol={isKreol} onRetry={() => setReloadKey(key => key + 1)} />
      ) : visibleDeals.length > 0 ? (
        groupedDeals.map(({ group, items }) => (
          <div key={group} style={{ display: "grid", gap: 11 }}>
            <div style={{ color: COLORS.text, fontSize: 17, fontWeight: 950 }}>
              {getGroupLabel(group, { ...activeArea, commune: activeCommune, microRegion: activeMicroRegion }, isKreol)}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: 14 }}>
              {items.map(deal => (
                <DealCard key={deal.id || `${deal.title}-${getDealLocation(deal)}`} deal={deal} isKreol={isKreol} />
              ))}
            </div>
          </div>
        ))
      ) : (
        <EmptyDealsState
          commune={activeAreaLabel}
          isKreol={isKreol}
          isMobile={isMobile}
          hasShoppingSearchFilters={hasActiveShoppingSearchFilters}
          contentKind={
            activeCategory === "leisure"
              ? leisureView
              : activeCategory === "shopping"
                ? shoppingView
                : ""
          }
        />
      )}

      {activeCategory === "leisure" && (
        <LeisureMissingDealNotice commune={activeAreaLabel} isKreol={isKreol} isMobile={isMobile} />
      )}

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 12 }}>
        <TrustCard
          icon={BkIcons.location}
          title={isKreol ? "Près koté ou" : "Près de chez vous"}
          text={isKreol ? "Bann résultats i part depi out kominn, mé ou pé explore nimport ki kominn ou vilaz san change out profil." : "Les résultats partent de votre commune, mais vous pouvez explorer librement une autre commune ou un village sans modifier votre profil."}
          accent={COLORS.cyan}
          background={pageTheme.blueSoft}
        />
        <TrustCard
          icon={BkIcons.check}
          title={isKreol ? "Lof vérifié" : "Offres vérifiées"}
          text={isKreol ? "Nou afich pa promo ni prix san in source fiable." : "Aucune promotion ni aucun prix ne sera affiché sans source fiable."}
          accent={COLORS.green}
          background={pageTheme.greenSoft}
        />
        <TrustCard
          icon={BkIcons.deals}
          title={isKreol ? "Partenariat transparent" : "Partenariats transparents"}
          text={isKreol ? "Bann contenu sponsorisé sera touzour signalé." : "Les contenus sponsorisés seront toujours clairement signalés."}
          accent={COLORS.purple}
          background={pageTheme.purpleSoft}
        />
      </div>

      <div
        style={{
          background: pageTheme.cardBackground,
          border: `1px solid ${pageTheme.borderSubtle}`,
          borderRadius: 22,
          padding: isMobile ? 20 : 24,
          boxShadow: pageTheme.cardShadow,
          display: "flex",
          alignItems: isMobile ? "flex-start" : "center",
          justifyContent: "space-between",
          gap: 18,
          flexDirection: isMobile ? "column" : "row",
        }}
      >
        <div style={{ maxWidth: 720 }}>
          <div style={{ color: COLORS.accent, fontSize: 13, fontWeight: 950, marginBottom: 7 }}>
            {isKreol ? "Ou lé in professionnel ?" : "Vous êtes un professionnel ?"}
          </div>
          <div style={{ color: COLORS.text, fontSize: isMobile ? 20 : 24, fontWeight: 950, lineHeight: 1.15 }}>
            {isKreol ? "Propoz out komers, servis ou in lof utile." : "Proposez votre commerce, votre service ou une offre utile."}
          </div>
          <div style={{ color: COLORS.muted, fontSize: 13, lineHeight: 1.55, marginTop: 8 }}>
            {isKreol
              ? "Chaque demande sera vérifié avant publication. Bann partenariat payant sera signalé clairement."
              : "Chaque demande sera vérifiée avant publication. Les partenariats payants seront clairement signalés."}
          </div>
        </div>

        <button
          type="button"
          onClick={openContactPage}
          className="good-deals-primary"
          style={{
            ...pageTheme.primaryHoverVars,
            minHeight: 46,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "0 16px",
            borderRadius: 14,
            border: "none",
            background: COLORS.accent,
            color: "#fff",
            fontWeight: 950,
            fontSize: 13,
            whiteSpace: "nowrap",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          <BkIcons.contact size={17} />
          {isKreol ? "Contacte a nou" : "Nous contacter"}
        </button>
      </div>

      {user?.email && (
        <div style={{ color: COLORS.muted, fontSize: 11, textAlign: "center" }}>
          {isKreol ? "Rubrik afiché pou" : "Rubrique affichée pour"} {user.email}
        </div>
      )}

      <AreaExplorerDialog
        open={showAreaExplorer}
        options={areaOptions}
        selectedArea={activeArea}
        profileCommune={commune}
        isKreol={isKreol}
        isMobile={isMobile}
        onClose={() => setShowAreaExplorer(false)}
        onSelect={handleAreaSelect}
      />
    </section>
  )
}
