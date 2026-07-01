import { buildSavingsInsights } from "../savings/savingsEngine"

function money(value: unknown) {
  return Number(String(value ?? 0).replace(",", ".")) || 0
}

function isKreolLanguage(language = "fr") {
  return ["cr", "kreol", "kr"].includes(String(language || "").toLowerCase())
}

export type FinanceAssistantProvider = {
  name: string
  answer(input: { question: string; context: any }): Promise<string>
}

export class LocalFinanceAssistantProvider implements FinanceAssistantProvider {
  name = "local-rules"

  async answer({ question, context }: { question: string; context: any }) {
    const language = context.language || "fr"
    const isKreol = isKreolLanguage(language)
    const q = question.toLowerCase()
    const stats = context.stats || {}
    const savings = buildSavingsInsights({
      shoppingItems: context.shoppingItems || [],
      transactions: context.transactions || [],
      language,
    })

    if (q.includes("100")) {
      const weekly = Math.ceil(100 / 4)
      const suggestions = savings.suggestions.slice(0, 3).map((item: any) => item.title).join(" ")
      return isKreol
        ? `Pou economise 100 EUR, commence vise ${weekly} EUR par semaine. Premye pistes trouvees : ${suggestions}`
        : `Pour economiser 100 EUR, commence par viser ${weekly} EUR par semaine. Les premieres pistes detectees : ${suggestions}`
    }

    if (q.includes("magasin")) {
      return isKreol
        ? "Regarde page Mes courses : li montre kot ou achete le plus ek ki magasins i revient souvent dan out tike."
        : "Regarde la page Mes courses : elle montre ou tu achetes le plus et quels magasins reviennent souvent dans tes tickets."
    }

    if (q.includes("alimentation") || q.includes("manze") || q.includes("courses")) {
      const amount = money(stats.depenses).toFixed(0)
      return isKreol
        ? `Out depans mwa-la le a ${amount} EUR. Pou manze, compare bann produits frequents ek surveille panier moyen.`
        : `Tes depenses du mois sont a ${amount} EUR. Pour l'alimentation, compare les produits frequents et surveille le panier moyen.`
    }

    if (q.includes("plus") || q.includes("depens") || q.includes("depense")) {
      return isKreol
        ? "La hausse i vient souvent de trois zafer : grosse depans ponctuelle, petits achats repetes, ou panier courses pli eleve. Va dan Mes stats pou voir evolution par semaine."
        : "La hausse vient souvent de trois choses : grosses depenses ponctuelles, petits achats repetes, ou panier courses plus eleve. Va dans Mes statistiques pour voir l'evolution par semaine."
    }

    return isKreol
      ? "Mi peux aide aou comprendre out depans, magasins, produits frequents ek lekonomi possible. Pose in kestion comme : koman economise 100 EUR ?"
      : "Je peux t'aider a comprendre tes depenses, tes magasins, tes produits frequents et les economies possibles. Pose une question comme : comment economiser 100 EUR ?"
  }
}

export function getFinanceAssistantProvider(): FinanceAssistantProvider {
  return new LocalFinanceAssistantProvider()
}
