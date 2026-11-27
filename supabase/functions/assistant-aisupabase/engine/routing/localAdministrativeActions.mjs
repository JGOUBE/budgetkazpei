// Exact, generic administrative tasks only: no inference of personal facts,
// eligibility, legal time limits, or submission of any document.
const norm=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim()
const rules=[
  ["status",/^(?:redige|ecris|prepare|propose|fais)(?: moi)? (?:un |une )?(?:mail|email|courrier|lettre) (?:pour (?:connaitre|demander) (?:l avancement|le suivi|le statut|des nouvelles) de mon dossier|de demande de suivi de dossier)$/],
  ["reminder",/^(?:redige|ecris|prepare|propose|fais)(?: moi)? (?:un |une )?(?:mail|email|courrier|lettre|relance) (?:de relance(?: administrative)?|pour relancer (?:mon dossier|ma demande)|administrative de relance)$/],
  ["appointment",/^(?:redige|ecris|prepare|propose|fais)(?: moi)? (?:un |une )?(?:mail|email|courrier|lettre) pour (?:demander|prendre) (?:un )?rendez vous$/],
  ["documents",/^(?:quels justificatifs preparer|quelles pieces preparer|quels documents preparer|comment preparer un dossier) pour une demande d aide$/],
  ["meeting",/^(?:comment preparer un rendez vous administratif|comment preparer un rendez vous avec un travailleur social|comment preparer un rendez vous avec une assistante sociale)$/],
]
export function buildLocalAdministrativeAction({question="",mode="general",language="fr",action=""}={}){
  if(action||!["general","trouver_aide","preparer_dossier","generer_courrier","generer_email","preparer_relance","preparer_rdv"].includes(mode))return null
  if(String(question).length>180||(String(question).match(/\?/g)||[]).length>1)return null
  const key=rules.find(([,regex])=>regex.test(norm(question)))?.[0]
  if(!key)return null
  const kr=language==="kreol"||language==="kr"||language==="cr"
  if(key==="documents")return {kind:key,source:"local_administrative_action",answer:kr?"**Prépar out dossier de demande d'aide**\n\n- Vérifie d'abord la liste exacte des pièces demandées par l'organisme.\n- Prépar, si lé demandé : pièce d'identité, justificatif de domicile, ressources et documents liés à la situation.\n- Garde copie du dossier et preuve de dépôt.\n\nChaque aide nana ses propres conditions : la liste exacte lé à vérifier.":"**Préparer votre demande d'aide**\n\n- Consultez la liste des pièces demandées par l'organisme concerné.\n- Préparez si nécessaire une pièce d'identité, un justificatif de domicile, les justificatifs de ressources et les documents liés à votre situation.\n- Vérifiez la validité des pièces, conservez une copie et la preuve du dépôt.\n\nCette liste est indicative : les justificatifs obligatoires dépendent du dispositif. Ne transmettez vos documents qu'à un canal officiel."}
  if(key==="meeting")return {kind:key,source:"local_administrative_action",answer:kr?"**Prépar out rendez-vous**\n\nNote out besoin principal, bann démarches déjà fé ek bann questions. Amène seulement bann pièces utiles ou demandées. Demande la prochaine étape, les délais annoncés et comment suivre le dossier.":"**Préparer votre rendez-vous**\n\nAvant le rendez-vous, notez votre besoin principal, les démarches déjà effectuées et les questions à poser. Apportez les documents demandés et les justificatifs utiles à votre situation.\n\nPendant l'entretien, demandez quelles options sont possibles, quelles pièces manquent, quelle est la prochaine étape et comment suivre votre dossier.\n\nNotez les réponses et les délais réellement annoncés."}
  const heading=kr?"Voici in modèle en français administratif, à compléter avant envoi.":"Voici un modèle à personnaliser avant envoi."
  const letter=key==="appointment"
    ?"**Objet : Demande de rendez-vous**\n\nMadame, Monsieur,\n\nJe souhaiterais convenir d'un rendez-vous avec votre service au sujet de [objet de la demande].\n\nPourriez-vous m'indiquer vos disponibilités et les documents qu'il serait utile d'apporter ?\n\nJe vous remercie pour votre aide.\n\nCordialement,\n[Nom et prénom]\n[Coordonnées, si nécessaires]"
    :key==="status"
    ?"**Objet : Suivi de mon dossier [référence, si connue]**\n\nMadame, Monsieur,\n\nJe vous contacte au sujet de mon dossier concernant [objet de la demande], transmis le [date, si connue].\n\nPourriez-vous m'indiquer son état d'avancement et me préciser si des informations complémentaires sont nécessaires ?\n\nJe vous remercie pour votre retour.\n\nCordialement,\n[Nom et prénom]"
    :"**Objet : Relance concernant [objet ou référence de la demande]**\n\nMadame, Monsieur,\n\nJe me permets de revenir vers vous au sujet de ma demande concernant [objet], transmise le [date, si connue].\n\nPourriez-vous me préciser où en est son traitement et, si nécessaire, les prochaines étapes ?\n\nJe vous remercie par avance pour votre retour.\n\nCordialement,\n[Nom et prénom]"
  return {kind:key,source:"local_administrative_action",answer:heading+"\n\n"+letter}
}
