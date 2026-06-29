import { buildSavingsInsights } from "../savings/savingsEngine"

function money(value: unknown) {
  return Number(String(value ?? 0).replace(",", ".")) || 0
}

export type FinanceAssistantProvider = {
  name: string
  answer(input: { question: string; context: any }): Promise<string>
}

export class LocalFinanceAssistantProvider implements FinanceAssistantProvider {
  name = "local-rules"

  async answer({ question, context }: { question: string; context: any }) {
    const q = question.toLowerCase()
    const stats = context.stats || {}
    const savings = buildSavingsInsights({
      shoppingItems: context.shoppingItems || [],
      transactions: context.transactions || [],
    })

    if (q.includes("100")) {
      return `Pour économiser 100 €, commence par viser ${Math.ceil(100 / 4)} € par semaine. Les premières pistes détectées : ${savings.suggestions.slice(0, 3).map((item: any) => item.title).join(" ")}`
    }

    if (q.includes("magasin")) {
      return "Regarde la page Mes courses : elle montre où tu achètes le plus et quels magasins reviennent souvent dans tes tickets."
    }

    if (q.includes("alimentation") || q.includes("courses")) {
      return `Tes dépenses du mois sont à ${money(stats.depenses).toFixed(0)} €. Pour l'alimentation, compare les produits fréquents et surveille le panier moyen.`
    }

    if (q.includes("plus") || q.includes("dépens")) {
      return "La hausse vient souvent de trois choses : grosses dépenses ponctuelles, petits achats répétés, ou panier courses plus élevé. Va dans Mes statistiques pour voir l'évolution par semaine."
    }

    return "Je peux t'aider à comprendre tes dépenses, tes magasins, tes produits fréquents et les économies possibles. Pose une question comme : comment économiser 100 € ?"
  }
}

export function getFinanceAssistantProvider(): FinanceAssistantProvider {
  return new LocalFinanceAssistantProvider()
}
