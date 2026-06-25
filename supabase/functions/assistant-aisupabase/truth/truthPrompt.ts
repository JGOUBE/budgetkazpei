import type { TruthReport } from "./truthGuard.ts"

export function buildTruthPrompt(report: TruthReport | null) {
  if (!report) {
    return `
TRUTHGUARD :
Aucun rapport de fiabilité fourni.
Reste prudent, n'invente aucun montant, droit, organisme ou situation utilisateur.
`.trim()
  }

  return `
TRUTHGUARD BUDGETKAZPEI

Confiance interne : ${report.confidence} %

Faits confirmés :
${report.confirmed.length > 0 ? report.confirmed.map(item => `- ${item}`).join("\n") : "- Aucun"}

Informations probables :
${report.likely.length > 0 ? report.likely.map(item => `- ${item}`).join("\n") : "- Aucune"}

Informations inconnues :
${report.unknown.length > 0 ? report.unknown.map(item => `- ${item}`).join("\n") : "- Aucune"}

Interdictions :
${report.forbidden.length > 0 ? report.forbidden.map(item => `- ${item}`).join("\n") : "- Aucune"}

Recommandations :
${report.recommendations.length > 0 ? report.recommendations.map(item => `- ${item}`).join("\n") : "- Aucune"}

Règles obligatoires :
- Ne présente comme certain que ce qui figure dans les faits confirmés.
- Pour tout le reste, utilise des formulations prudentes : "à vérifier", "peut-être", "selon votre situation", "vous pourriez".
- Ne dis jamais "vous avez droit à" sans preuve certaine.
- Ne dis jamais qu'un dossier existe, est accepté, refusé ou en cours si ce n'est pas confirmé.
- Ne déduis jamais un salaire individuel à partir du revenu du foyer.
- Si la confiance est basse ou si une information essentielle manque, pose une seule question utile avant de conclure.
`.trim()
}