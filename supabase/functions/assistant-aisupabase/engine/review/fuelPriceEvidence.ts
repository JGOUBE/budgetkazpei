// Dated official maximum pump-price observations in La Réunion.
// These are NOT a live price feed. Never use them as today's prices after
// November 2026, or as a comparison for another geography or fuel grade.
// Values are taken from monthly prefecture press releases.
export const VERIFIED_REUNION_FUEL_PRICE_OBSERVATIONS = Object.freeze({
  "2024-11": {
    period: "1er novembre 2024",
    sansPlomb: 1.62,
    gazole: 1.24,
    source: "https://www.reunion.gouv.fr/Actualites/Communique-de-presse/Prix-des-carburants-une-legere-hausse-en-novembre-2024",
  },
  "2026-11": {
    period: "1er novembre 2026",
    sansPlomb: 2.11,
    gazole: 1.69,
    source: "https://www.reunion.gouv.fr/Actualites/Communiques-de-presse/Baisse-de-11-centimes-du-gazole-hausse-du-sans-plomb-de-11-centimes",
  },
})

const normalize = (value: unknown): string => String(value || "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ")

const FUEL = /\b(?:carburant|carburan|karbiran|karburan|mazout|essence|essans|lesans|sans plomb|gazole|gazoil|diesel|prix a la pompe|plein d essence)\b/
const OTHER_GEOGRAPHY = /\b(?:metropole|hexagone|paris|lyon|marseille|bordeaux|toulouse|europe|canada|belgique|suisse|afrique|madagascar|maurice|moris|mayotte|guadeloupe|martinique|guyane)\b/
const HISTORIC_COMPARE = /\b(?:augmente|augmentes|augmentation|hausse|baisse|diminue|evolue|evolution|compare|comparaison|varie|variation|combien|konbien|komien|kombien|kombyin|ogmant(?:e|asion|ation)?|monte|bese|pourcentage|diferans|difference)\b/
const TWO_YEARS = /\b(?:depuis (?:les )?(?:deux|2) (?:derniere?s? )?ans|(?:en|sur|ces|les|depuis) (?:deux|2) ans|(?:deux|2) dernieres? annees?|(?:depi )?(?:deux|de|2) zan|(?:depi )?(?:deux|de|2) an|entre 2024 et 2026|novembre 2024 (?:et|a|versus|vs) novembre 2026|novanm 2024 (?:ek|et|a) novanm 2026)\b/
const PRICE_HISTORY_REQUEST = /\b(?:depuis|depi|en (?:20\d{2}|deux|2) ans|sur (?:deux|2) ans|(?:deux|de|2) zan|entre 20\d{2} et 20\d{2}|evolution|augmente|ogmant(?:e|asion|ation)?|hausse|baisse|bese|variation|diminution|comparaison|novanm 20\d{2})\b/

function formatEuro(value: number): string {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(value)
}
function formatPct(value: number): string {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 1, maximumFractionDigits: 1,
  }).format(value)
}

export function getVerifiedReunionFuelPriceComparison(
  question = "", language = "fr", currentDate: Date = new Date(),
): string | null {
  const text = normalize(question)
  if (!FUEL.test(text) || OTHER_GEOGRAPHY.test(text) ||
      !HISTORIC_COMPARE.test(text) || !TWO_YEARS.test(text)) return null

  const explicitDates = /\b2024\b/.test(text) && /\b2026\b/.test(text)
  const explicitNovember = /\b(?:novembre|novanm)\b/.test(text)
  const reunionDateParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Indian/Reunion", year: "numeric", month: "numeric",
  }).formatToParts(currentDate)
  const reunionYear = Number(reunionDateParts.find(part => part.type === "year")?.value)
  const reunionMonth = Number(reunionDateParts.find(part => part.type === "month")?.value)
  const thisMonth = reunionYear === 2026 && reunionMonth === 11
  // Without an explicit two-month comparison, "the last two years" is only
  // meaningful against the validated November 2026 snapshot during that month.
  if (!thisMonth && !(explicitDates && explicitNovember)) return null

  const old = VERIFIED_REUNION_FUEL_PRICE_OBSERVATIONS["2024-11"]
  const recent = VERIFIED_REUNION_FUEL_PRICE_OBSERVATIONS["2026-11"]
  const spDelta = recent.sansPlomb - old.sansPlomb
  const dieselDelta = recent.gazole - old.gazole
  const spPct = spDelta / old.sansPlomb * 100
  const dieselPct = dieselDelta / old.gazole * 100
  if (language === "kreol" || language === "kr" || language === "cr") {
    return "Dann La Rényon, si nou compare bann pri maksimum la Préfekti la fixé pou novanm 2024 ek novanm 2026 :\n\n" +
      "• Sans-plomb : " + formatEuro(old.sansPlomb) + " € pou in lit → " +
      formatEuro(recent.sansPlomb) + " € pou in lit, soit +" + formatPct(spPct) + " %.\n" +
      "• Gazole : " + formatEuro(old.gazole) + " € pou in lit → " +
      formatEuro(recent.gazole) + " € pou in lit, soit +" + formatPct(dieselPct) + " %.\n\n" +
      "Bann pri-la lé bann maksimum ofisyèl pou dé dates précis. Lé pa in moyenne ni in prédiksion pou domin.\n\n" +
      "Bann sources la Préfekti :\n" + old.source + "\n" + recent.source
  }
  return "À La Réunion, la comparaison des prix maximums officiels entre novembre 2024 et novembre 2026 donne :\n\n" +
    "• Sans-plomb : " + formatEuro(old.sansPlomb) + " € → " +
    formatEuro(recent.sansPlomb) + " €/L, soit +" + formatPct(spPct) +
    " % (+" + formatEuro(spDelta) + " €/L).\n" +
    "• Gazole : " + formatEuro(old.gazole) + " € → " +
    formatEuro(recent.gazole) + " €/L, soit +" + formatPct(dieselPct) +
    " % (+" + formatEuro(dieselDelta) + " €/L).\n\n" +
    "Ce sont des prix maximums réglementés à deux dates, pas les prix moyens payés ni une prévision.\n\n" +
    "Sources officielles :\n" + old.source + "\n" + recent.source
}

// A model without a dated, server-verified price dataset must not fabricate a
// historical percentage, price range or directional trend. Applies AFTER the
// model output, without requesting a costly second completion.
export function reviewUnsupportedFuelPriceHistory({
  question = "", answer = "", language = "fr",
}: {question?: string; answer?: string; language?: string} = {}): string {
  const q = normalize(question)
  const a = String(answer || "")
  if (!FUEL.test(q) || !PRICE_HISTORY_REQUEST.test(q) || !a) return a

  // For historical market prices a model's self-declared citation is not
  // independent evidence. Verified local monthly snapshots take precedence
  // before the model call, and other date ranges have no trusted inputs.
  const unsupportedNumericChange = /\d+(?:[,.]\d+)?\s*(?:%|pour\s*cent|centimes?|euros?|€)/i.test(a)
  const unsupportedTrend = /\b(?:hausse(?:s)?|augment(?:ation|e|ees|es)?|baisse(?:s)?|diminu(?:tion|e|ees|es)?|fortement progresse|ont connu)\b/i.test(a)
  if (!unsupportedNumericChange && !unsupportedTrend) return a

  const prefix = language === "kreol" || language === "kr" || language === "cr"
    ? "Mi pé pa donne in pourcentage fiable sans bann prix maximum officiels pou deux dates comparables. Mi préfère pa invente in évolution."
    : "Je ne peux pas donner une hausse ou une baisse chiffrée fiable pour cette période sans deux relevés officiels comparables. Je préfère ne pas inventer une évolution."
  const isKreol = language === "kreol" || language === "kr" || language === "cr"
  if (OTHER_GEOGRAPHY.test(q)) {
    // No dated evidence for other territories: never switch to Reunion prices
    // or repeat the model's fabricated statistics.
    return prefix + (isKreol
      ? "\n\nPou in lot pays ou in lot vil, fo dé relevés officiels pou dé dates comparables."
      : "\n\nPour ce territoire, une comparaison fiable nécessite deux relevés officiels aux dates concernées.")
  }
  return prefix + (isKreol
    ? "\n\nDann La Rényon, la Préfekti i publie bann pri maksimum chak mwa. Di a moin ki dé mwa ou vé comparer, ek si lé sans-plomb ou gazole. Mi va pas invente bann chiffres.\nBann sources ofisyèl : "
    : "\n\nÀ La Réunion, les prix maximums sont publiés chaque mois par la préfecture. Précisez les deux mois et le carburant (sans-plomb ou gazole) pour une comparaison fondée sur des relevés vérifiés.\nSource officielle : ") +
    "https://www.reunion.gouv.fr/Actions-de-l-Etat/Economie-commerce-exterieur-et-fiscalite-locale/Prix-des-hydrocarbures-a-La-Reunion"
}
