import type { TruthReport } from "./truthAnalyzer.ts"

function list(items: string[]) {
  return items.length > 0 ? items.map(item => `- ${item}`).join("\n") : "- Aucun"
}

export function buildTruthPrompt(report: TruthReport | null) {
  if (!report) {
    return `
TRUTH ENGINE :
Aucun rapport de fiabilité fourni.
Reste prudent. N'invente aucun montant, droit, organisme, délai ou situation utilisateur.
`.trim()
  }

  return `
TRUTH ENGINE BUDGETKAZPEI

Confiance interne : ${report.confidence} %

Faits confirmés :
${list(report.confirmed)}

Informations probables :
${list(report.likely)}

Informations inconnues :
${list(report.unknown)}

Alertes :
${list(report.warnings)}

Montants détectés à ne pas affirmer sans source :
${list(report.inventedAmounts)}

Délais détectés à ne pas affirmer sans source :
${list(report.inventedDeadlines)}

Organismes à vérifier :
${list(report.inventedOrganizations)}

Conflits avec le profil :
${list(report.profileConflicts)}

Problèmes de certitude :
${list(report.certaintyProblems)}

Interdictions :
${list(report.forbidden)}

Recommandations :
${list(report.recommendations)}

RÈGLES OBLIGATOIRES :
- Ne présente comme certain que ce qui figure dans les faits confirmés.
- Pour toute aide, utilise des formulations prudentes : "vous pourriez", "à vérifier", "selon votre situation".
- Ne dis jamais "vous avez droit à" sans preuve officielle.
- Ne donne jamais de montant ou fourchette de montant sans calcul officiel ou source intégrée.
- Ne confirme jamais qu'un dossier existe, est accepté, refusé ou en cours sans preuve.
- Ne cite pas un organisme local non vérifié comme interlocuteur prioritaire.
- Ne déduis jamais un salaire individuel à partir du revenu du foyer.
- Si une information essentielle manque, pose une seule question utile.
- Si la question porte sur un montant CAF/APL/RSA, propose une simulation officielle plutôt qu'un montant.
`.trim()
}