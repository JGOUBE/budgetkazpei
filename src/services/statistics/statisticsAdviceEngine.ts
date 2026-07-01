import { moneyValue } from "./statisticsFormatters"

function isKreolLanguage(language = "fr") {
  return ["cr", "kreol", "kr"].includes(String(language || "").toLowerCase())
}

function categoryLabel(category = "", isKreol = false) {
  const key = String(category || "").toLowerCase()
  const fr: Record<string, string> = {
    alimentaire: "alimentaire",
    logement: "logement",
    energie: "energie",
    transport: "transport",
    loisirs: "loisirs",
    sante: "sante",
    divers: "divers",
  }
  const kreol: Record<string, string> = {
    alimentaire: "manze",
    logement: "kaz",
    energie: "kouran / dilo",
    transport: "transport",
    loisirs: "amizman",
    sante: "lasante",
    divers: "lot depans",
  }
  return (isKreol ? kreol : fr)[key] || category || (isKreol ? "kategori" : "categorie")
}

export function buildStatisticsAdvice(insights: any = {}, language = "fr") {
  const isKreol = isKreolLanguage(language)
  const advice = []
  const food = (insights.categories || []).find((cat: any) => cat.id === "alimentaire")

  if (food?.percent > 40) {
    advice.push(isKreol
      ? "Out depans manze i pran in gran part out bidze mwa-la."
      : "Ton alimentation represente une grande part de ton budget ce mois-ci.")
  }

  const lastWeeks = insights.weeklyEvolution || []
  if (lastWeeks.length >= 2 && moneyValue(lastWeeks.at(-1)?.amount) > moneyValue(lastWeeks.at(-2)?.amount)) {
    advice.push(isKreol
      ? "Out depans i semble augmente su derniere semaine."
      : "Tes depenses semblent augmenter sur la derniere semaine.")
  }

  const almostReached = (insights.categories || []).find((cat: any) => {
    return moneyValue(cat.budget) > 0 && moneyValue(cat.depense) / moneyValue(cat.budget) >= 0.9
  })
  if (almostReached) {
    advice.push(isKreol
      ? `Out bidze ${categoryLabel(almostReached.id || almostReached.label, true)} le presque atteint.`
      : `Ton budget ${categoryLabel(almostReached.id || almostReached.label, false)} est presque atteint.`)
  }

  if ((insights.courses?.basketAverage || 0) > 0 && (insights.courses?.receiptsCount || 0) >= 3) {
    advice.push(isKreol
      ? "Surveille out panier moyen : le in bon indicateur pou trouve lekonomi."
      : "Surveille ton panier moyen : c'est un bon indicateur pour reperer les economies.")
  }

  if (advice.length === 0) {
    advice.push(isKreol
      ? "Continue ajoute out depans : plus nana donnees, plus konsey i devient utile."
      : "Continue a saisir tes depenses : plus il y a de donnees, plus les conseils deviennent utiles.")
  }

  return advice.slice(0, 4)
}
