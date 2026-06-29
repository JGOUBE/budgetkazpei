import { moneyValue } from "./statisticsFormatters"

export function buildStatisticsAdvice(insights: any = {}) {
  const advice = []
  const food = (insights.categories || []).find((cat: any) => cat.id === "alimentaire")

  if (food?.percent > 40) {
    advice.push("Ton alimentation représente une grande part de ton budget ce mois-ci.")
  }

  const lastWeeks = insights.weeklyEvolution || []
  if (lastWeeks.length >= 2 && moneyValue(lastWeeks.at(-1)?.amount) > moneyValue(lastWeeks.at(-2)?.amount)) {
    advice.push("Tes dépenses semblent augmenter sur la dernière semaine.")
  }

  const almostReached = (insights.categories || []).find((cat: any) => {
    return moneyValue(cat.budget) > 0 && moneyValue(cat.depense) / moneyValue(cat.budget) >= 0.9
  })
  if (almostReached) {
    advice.push(`Ton budget ${almostReached.label || almostReached.id} est presque atteint.`)
  }

  if ((insights.courses?.basketAverage || 0) > 0 && (insights.courses?.receiptsCount || 0) >= 3) {
    advice.push("Surveille ton panier moyen : c'est un bon indicateur pour repérer les économies.")
  }

  if (advice.length === 0) {
    advice.push("Continue à saisir tes dépenses : plus il y a de données, plus les conseils deviennent utiles.")
  }

  return advice.slice(0, 4)
}
