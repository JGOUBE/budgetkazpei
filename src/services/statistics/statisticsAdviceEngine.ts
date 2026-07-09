import { moneyValue } from "./statisticsFormatters"

function isKreolLanguage(language = "fr") {
  return ["cr", "kreol", "kr"].includes(String(language || "").toLowerCase())
}

function categoryLabel(category = "", isKreol = false) {
  const key = String(category || "").toLowerCase()
  const fr: Record<string, string> = {
    alimentaire: "alimentaire",
    logement: "logement",
    energie: "énergie",
    transport: "transport",
    loisirs: "loisirs",
    sante: "santé",
    divers: "divers",
  }
  const kreol: Record<string, string> = {
    alimentaire: "manzé",
    logement: "kaz",
    energie: "kouran / dilo",
    transport: "transport",
    loisirs: "amizman",
    sante: "lasante",
    divers: "lot dépans",
  }
  return (isKreol ? kreol : fr)[key] || category || (isKreol ? "kategori" : "categorie")
}

export function buildStatisticsAdvice(insights: any = {}, language = "fr") {
  const isKreol = isKreolLanguage(language)
  const advice = []
  const food = (insights.categories || []).find((cat: any) => cat.id === "alimentaire")

  if (food?.percent > 40) {
    advice.push(isKreol
      ? "Out dépans manzé i pran in gran part out bidzé mwa-la."
      : "Ton alimentation représente une grande part de ton budget ce mois-ci.")
  }

  const lastWeeks = insights.weeklyEvolution || []
  if (lastWeeks.length >= 2 && moneyValue(lastWeeks.at(-1)?.amount) > moneyValue(lastWeeks.at(-2)?.amount)) {
    advice.push(isKreol
      ? "Out dépans i semble augmenté su la dernière semaine."
      : "Tes dépenses semblent augmenter sur la dernière semaine.")
  }

  const almostReached = (insights.categories || []).find((cat: any) => {
    return moneyValue(cat.budget) > 0 && moneyValue(cat.depense) / moneyValue(cat.budget) >= 0.9
  })
  if (almostReached) {
    advice.push(isKreol
      ? `Out bidzé ${categoryLabel(almostReached.id || almostReached.label, true)} lé presque atteint.`
      : `Ton budget ${categoryLabel(almostReached.id || almostReached.label, false)} est presque atteint.`)
  }

  if ((insights.courses?.basketAverage || 0) > 0 && (insights.courses?.receiptsCount || 0) >= 3) {
    advice.push(isKreol
      ? "Surveille out panier moyen : lé in bon indicateur pou trouv lékonomi."
      : "Surveille ton panier moyen : c'est un bon indicateur pour repérer les économies.")
  }

  if (advice.length === 0) {
    advice.push(isKreol
      ? "Continue azout out dépans : plus nana donné, plus konsey i devient utile."
      : "Continue à saisir tes dépenses : plus il y a de données, plus les conseils deviennent utiles.")
  }

  return advice.slice(0, 4)
}
