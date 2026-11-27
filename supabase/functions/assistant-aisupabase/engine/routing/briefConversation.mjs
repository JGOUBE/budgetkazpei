// Bounded, topic-aware courtesy: known short answers are local; unknown
// benign topics can use the separately metered short model route.
const norm=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ")
const kr=l=>["kreol","kr","cr"].includes(l)
const lines={
  sky:["Le ciel paraît bleu parce que l'air diffuse davantage la lumière bleue du Soleil.","Lo syèl i paré blé pars lo lèr i disperse plis la limyèr blé solèy."],
  moon:["La Lune brille parce qu'elle réfléchit la lumière du Soleil.","La linn i briye pars li i rouvoye la limyèr solèy."],
  japan:["Tokyo est la capitale du Japon.","Tokyo, sé la kapital Japon."],
  unicorn:["Les licornes appartiennent aux légendes : c'est un joli sujet d'imagination.","Bann likorn, sé dann bann lézand. Nana de koi imaziné !"],
  dance:["Je n'ai pas vraiment de pieds pour danser, mais l'idée est sympathique !","Mi nana poin pyé pou dansé, mé l'idée lé sympa !"],
  football:["Le foot, c'est souvent le plaisir de suivre son équipe et de partager un bon moment. Je n'ai pas d'équipe favorite.","Lo foot, sé in bon moman pou partaz ek bann moun. Mi nana poin lékip préféré."],
}
export function advisorScopeBridge(language="fr",kind="default"){
  const choices={
    default:["Mon rôle, c'est surtout de vous aider avec votre budget, vos courses, vos aides et vos démarches.","Moin, mi lé sirtou la pou aide aou jéré out bidzé, out courses, bann zéd ek out démarches."],
    leisure:["Si vous souhaitez aussi profiter de vos loisirs sans trop dépenser, je peux vous aider à trouver des idées.","Si ou vé profite out bann loizir san dépans tro, mi pé aide aou trouve bann lidé."],
    knowledge:["Pour aller plus loin ensemble, je suis surtout spécialisé dans le budget, les économies et les démarches du quotidien.","Pou alé pli loin ansanm, mon spécialité sé lo bidzé, bann lékonomi ek bann démarches tous lé zour."],
  }
  return (choices[kind]||choices.default)[kr(language)?1:0]
}
export function buildBriefLocalConversation(question="",language="fr"){
  const t=norm(question).replace(/(?: reponds?| explique| parle) en (?:francais|creole|kreol)$/,"").trim()
  const patterns=[
    ["sky",/^(?:pourquoi le ciel est bleu|pourquoi le ciel est il bleu|poukoi lo syel le ble|poukwa lo syel le ble)$/,"knowledge"],
    ["moon",/^(?:pourquoi la lune brille|pourquoi la lune brille t elle|poukoi la linn i briye|poukwa la linn i briye)$/,"knowledge"],
    ["japan",/^(?:quelle est la capitale du japon|c est quoi la capitale du japon|kosa la kapital japon)$/,"knowledge"],
    ["unicorn",/^(?:parle moi des licornes|les licornes existent elles|est ce que les licornes existent|kosa in likorn)$/,"knowledge"],
    ["dance",/^(?:on danse|tu veux danser|vous voulez danser|nou danse|nou danse ensemble)$/,"leisure"],
    ["football",/^(?:tu aimes le foot|vous aimez le foot|que penses tu du foot|quel est ton avis sur le foot|ou aime lo foot)$/,"leisure"],
  ]
  for(const [key,pattern,bridge] of patterns)if(pattern.test(t))return lines[key][kr(language)?1:0]+"\n\n"+advisorScopeBridge(language,bridge)
  // Long unrelated production requests do not warrant a completion.
  // No blanket block on ordinary questions, mixed financial topics or safety.
  if(/^(?:ecris|redige|raconte|compose|invente|developpe|detaille|prepare) (?:moi )?(?:un |une |des )?(?:roman|poeme|chanson|histoire|scenario|expose|dissertation|cours complet|programme informatique|jeu video)\b/.test(t))
    return (kr(language)?"Mi konpran l'idée, mé mi lé pa fé pou rédiz bann long dokiman hors mon spécialité.":"Je peux échanger quelques mots sur cette idée, mais je ne suis pas conçu pour rédiger de longs contenus hors de mon domaine.")+"\n\n"+advisorScopeBridge(language)
  return null
}
export function briefConversationFallback(language="fr"){
  return (kr(language)?"Mi préfère pa donne aou in réponse au hasard su sa.":"Je préfère ne pas vous donner une réponse approximative sur ce sujet.")+"\n\n"+advisorScopeBridge(language)
}
export function finishBriefConversation(answer="",language="fr"){
  const clean=String(answer||"").trim()
  if(!clean)return briefConversationFallback(language)
  // The provider route is capped separately. Add the transition only if absent.
  const t=norm(clean)
  if(/\b(?:mon role|ma specialite|je suis surtout|je suis specialise|mon specialite|mi le sirtou la|mi le surtout la|moin mi le|mon domaine)\b/.test(t)&&/\b(?:budget|bidze|economies|lekonomi|demarches|aides|zed)\b/.test(t))return clean
  return clean+"\n\n"+advisorScopeBridge(language)
}
